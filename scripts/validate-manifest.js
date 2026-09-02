#!/usr/bin/env node

/**
 * scripts/validate-manifest.js
 *
 * Validates the bootstrap manifest (docs/use/manifest.md) against the source
 * repositories over the GitHub API:
 *
 *   1. Structural  — name/repo/path/version/commit present; commit is a 40-char hex sha.
 *   2. Existence   — the pinned commit exists in the source repo.
 *   3. Path        — the skill path contains a SKILL.md at that commit.
 *   4. Version     — the SKILL.md frontmatter version matches the manifest version.
 *   5. Closure     — every `requires` entry resolves to another validated skill.
 *
 * Used by .github/workflows/manifest-validate.yml. Exits 1 on any violation.
 *
 * Usage:
 *   node scripts/validate-manifest.js [repo-root]
 *
 * Zero dependencies. Requires Node >= 18.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const COMMIT_RE = /^[0-9a-f]{40}$/i;
const USER_AGENT = 'actioNN-Skills-Updater';

// ---------------------------------------------------------------------------
// Focused YAML subset parser (same shapes as skills-manager.js).
// ---------------------------------------------------------------------------

function parseScalar(text) {
  const t = text.trim();
  if (t === '') return null;
  if (t.startsWith('[') && t.endsWith(']')) {
    return t.slice(1, -1).split(',')
      .map(p => p.trim())
      .filter(p => p !== '')
      .map(p => parseScalar(p));
  }
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseMappingItem(lines, pos, indent) {
  const line = lines[pos];
  const match = line.text.match(/^([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/);
  if (!match) return [null, null, pos + 1];
  const key = match[1];
  const rest = match[2];
  let next = pos + 1;
  let value;
  if (rest === '') {
    if (next < lines.length && lines[next].indent > indent) {
      [value, next] = parseBlock(lines, next, lines[next].indent);
    } else {
      value = null;
    }
  } else {
    value = parseScalar(rest);
  }
  return [key, value, next];
}

function parseSequence(lines, pos, indent) {
  const arr = [];
  while (pos < lines.length && lines[pos].indent === indent && lines[pos].text.startsWith('- ')) {
    const rest = lines[pos].text.slice(2).trim();
    let next = pos + 1;
    let item;
    if (rest === '') {
      if (next < lines.length && lines[next].indent > indent) {
        [item, next] = parseBlock(lines, next, lines[next].indent);
      } else {
        item = null;
      }
    } else {
      const mapMatch = rest.match(/^([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/);
      if (mapMatch) {
        item = {};
        const key = mapMatch[1];
        const value = mapMatch[2];
        if (value === '') {
          if (next < lines.length && lines[next].indent > indent) {
            [item[key], next] = parseBlock(lines, next, lines[next].indent);
          } else {
            item[key] = null;
          }
        } else {
          item[key] = parseScalar(value);
        }
        if (next < lines.length && lines[next].indent > indent) {
          const itemIndent = lines[next].indent;
          while (next < lines.length && lines[next].indent === itemIndent && !lines[next].text.startsWith('- ')) {
            const [k, v, after] = parseMappingItem(lines, next, itemIndent);
            if (k === null) break;
            item[k] = v;
            next = after;
          }
        }
      } else {
        item = parseScalar(rest);
      }
    }
    arr.push(item);
    pos = next;
  }
  return [arr, pos];
}

function parseBlock(lines, pos, indent) {
  if (pos >= lines.length) return [{}, pos];
  if (lines[pos].text.startsWith('- ')) {
    return parseSequence(lines, pos, indent);
  }
  const obj = {};
  while (pos < lines.length && lines[pos].indent === indent && !lines[pos].text.startsWith('- ')) {
    const [key, value, next] = parseMappingItem(lines, pos, indent);
    if (key === null) break;
    obj[key] = value;
    pos = next;
  }
  return [obj, pos];
}

function parseFocusedYaml(text) {
  const lines = text.split(/\r?\n/)
    .map((raw) => ({ indent: raw.match(/^[ \t]*/)[0].length, text: raw.trim() }))
    .filter(l => l.text !== '' && !l.text.startsWith('#'));
  const result = {};
  let pos = 0;
  while (pos < lines.length) {
    const [key, value, next] = parseMappingItem(lines, pos, 0);
    if (key === null) { pos++; continue; }
    result[key] = value;
    pos = next;
  }
  return result;
}

function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  const open = lines.findIndex(l => l.trim() === '---');
  let close = -1;
  for (let i = open + 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { close = i; break; }
  }
  if (open === -1 || close === -1) {
    throw new Error('no YAML frontmatter (--- delimiters) found');
  }
  return lines.slice(open + 1, close).join('\n');
}

function parseManifest(text) {
  const doc = parseFocusedYaml(parseFrontmatter(text));
  const bootstrap = doc['agent-bootstrap'];
  if (!bootstrap || typeof bootstrap !== 'object') {
    throw new Error('agent-bootstrap block not found in manifest');
  }
  if (!Array.isArray(bootstrap.skills)) {
    throw new Error('agent-bootstrap.skills is not a list');
  }
  const templates = Array.isArray(bootstrap.templates) ? bootstrap.templates : [];
  const workflows = Array.isArray(bootstrap.workflows) ? bootstrap.workflows : [];
  const mcp = Array.isArray(bootstrap.mcp) ? bootstrap.mcp : [];
  return {
    version: bootstrap.version,
    entrypoint: bootstrap.entrypoint,
    skills: bootstrap.skills,
    templates,
    workflows,
    mcp,
  };
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

function authHeaders() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function apiRequest(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': USER_AGENT, ...authHeaders() } }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(body); } catch (err) { /* non-JSON body */ }
        resolve({ status: res.statusCode, data });
      });
    }).on('error', (err) => resolve({ status: 0, data: null, error: err.message }));
  });
}

function fetchString(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': USER_AGENT, ...authHeaders() } }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url}, status: ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function rateLimited(status) {
  return status === 403 || status === 429;
}

const RATE_LIMIT_HINT = 'set GITHUB_TOKEN to raise the rate limit';

// ---------------------------------------------------------------------------
// Channel policy — data, not branching. Adding a channel is adding a table row.
// ---------------------------------------------------------------------------

const CHANNELS = {
  stable: {
    name: 'stable',
    file: 'docs/use/manifest.md',
    requiredRefKind: 'tag',
    requireTagShape: true,
    requireProvenance: true,
  },
  preview: {
    name: 'preview',
    file: 'docs/use/manifest-next.md',
    requiredRefKind: 'branch',
    requireTagShape: false,
    requireProvenance: false,
  },
};

const TAG_SHAPE_RE = /^[a-z][a-z0-9-]*-v\d+\.\d+\.\d+$/;

// ---------------------------------------------------------------------------
// Ref resolution and provenance
// ---------------------------------------------------------------------------

async function resolveRef(repo, ref) {
  const tagRes = await apiRequest(`https://api.github.com/repos/${repo}/git/ref/tags/${ref}`);
  if (tagRes.status === 200 && tagRes.data && tagRes.data.object) {
    let sha = tagRes.data.object.sha;
    if (tagRes.data.object.type === 'tag') {
      const peelRes = await apiRequest(`https://api.github.com/repos/${repo}/git/tags/${sha}`);
      if (rateLimited(peelRes.status)) {
        return { error: `rate limit hit peeling annotated tag '${ref}' in ${repo} (HTTP ${peelRes.status}); ${RATE_LIMIT_HINT}` };
      }
      if (peelRes.status !== 200 || !peelRes.data || !peelRes.data.object || !peelRes.data.object.sha) {
        return { error: `could not peel annotated tag '${ref}' in ${repo} (HTTP ${peelRes.status || peelRes.error || 'network error'})` };
      }
      sha = peelRes.data.object.sha;
    }
    return { sha, kind: 'tag' };
  }
  if (rateLimited(tagRes.status)) {
    return { error: `rate limit hit resolving ref '${ref}' in ${repo} (HTTP ${tagRes.status}); ${RATE_LIMIT_HINT}` };
  }

  const branchRes = await apiRequest(`https://api.github.com/repos/${repo}/git/ref/heads/${ref}`);
  if (branchRes.status === 200 && branchRes.data && branchRes.data.object) {
    return { sha: branchRes.data.object.sha, kind: 'branch' };
  }
  if (rateLimited(branchRes.status)) {
    return { error: `rate limit hit resolving ref '${ref}' in ${repo} (HTTP ${branchRes.status}); ${RATE_LIMIT_HINT}` };
  }

  return { error: `ref '${ref}' not found as a tag or branch in ${repo}` };
}

async function checkRefResolvesInDeclaredRepo(item) {
  const resolved = await resolveRef(item.repo, item.ref);
  if (resolved.error) return { violation: `${item.name}: ${resolved.error}`, kind: null };
  if (resolved.sha !== item.commit) {
    return {
      violation: `${item.name}: ref '${item.ref}' resolves to ${resolved.sha} in ${item.repo}, but manifest pins commit ${item.commit} (mismatch)`,
      kind: resolved.kind,
    };
  }
  return { violation: null, kind: resolved.kind };
}

function tagShapeViolation(entry) {
  if (!TAG_SHAPE_RE.test(entry.ref || '')) {
    return `${entry.name}: ref '${entry.ref}' does not match the repo-snapshot tag shape (expected e.g. 'skills-v1.0.0')`;
  }
  return null;
}

function refKindViolation(entry, resolvedKind, policy) {
  if (resolvedKind && resolvedKind !== policy.requiredRefKind) {
    return `${entry.name}: ref '${entry.ref}' resolves as a ${resolvedKind}, but the ${policy.name} channel requires a ${policy.requiredRefKind}`;
  }
  return null;
}

async function checkReleaseProvenance(repo, commit) {
  const res = await apiRequest(`https://api.github.com/repos/${repo}/compare/main...${commit}`);
  if (res.status === 200 && res.data && res.data.status) {
    if (res.data.status === 'identical' || res.data.status === 'behind') return null;
    return `commit ${commit} in ${repo} is not reachable from main (compare status: '${res.data.status}') — orphan or unmerged tip cannot ship on the stable channel`;
  }
  if (rateLimited(res.status)) {
    return `rate limit hit checking release provenance for ${commit} in ${repo} (HTTP ${res.status}); ${RATE_LIMIT_HINT}`;
  }
  return `could not verify release provenance for ${commit} in ${repo} (HTTP ${res.status || res.error || 'network error'})`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function structuralViolations(item) {
  const violations = [];
  for (const field of ['name', 'repo', 'path', 'version', 'ref', 'commit']) {
    if (!item[field]) violations.push(`${item.name || '(unnamed item)'}: missing field '${field}'`);
  }
  if (item.commit && !COMMIT_RE.test(item.commit)) {
    violations.push(`${item.name}: commit '${item.commit}' is not a 40-char hex sha`);
  }
  return violations;
}

async function checkCommitExists(item) {
  const res = await apiRequest(`https://api.github.com/repos/${item.repo}/commits/${item.commit}`);
  if (res.status === 200) return null;
  if (rateLimited(res.status)) {
    return `${item.name}: GitHub API rate limit hit (HTTP ${res.status}) while checking commit; ${RATE_LIMIT_HINT}.`;
  }
  if (res.status === 422) {
    // GitHub returns 422 when the SHA is well-formed but does not resolve within
    // this repo — the signature of a commit that belongs to a different repo in
    // the same fork network (a single-commit lookup alone can false-positive there).
    return `${item.name}: commit ${item.commit} does not belong to declared repo ${item.repo} (HTTP 422 — wrong repo)`;
  }
  return `${item.name}: commit ${item.commit} does not exist in ${item.repo} (HTTP ${res.status || res.error || 'network error'})`;
}

async function checkPathAtCommit(skill) {
  const url = `https://api.github.com/repos/${skill.repo}/contents/${skill.path}?ref=${skill.commit}`;
  const res = await apiRequest(url);
  if (res.status === 200) {
    if (Array.isArray(res.data) && res.data.some(entry => entry.name === 'SKILL.md')) return null;
    return `${skill.name}: ${skill.path} at ${skill.commit} has no SKILL.md entry`;
  }
  if (rateLimited(res.status)) {
    return `${skill.name}: GitHub API rate limit hit (HTTP ${res.status}) while checking path; ${RATE_LIMIT_HINT}.`;
  }
  return `${skill.name}: path ${skill.path} not found at ${skill.commit} (HTTP ${res.status || res.error || 'network error'})`;
}

async function checkVersionParity(skill) {
  const url = `https://raw.githubusercontent.com/${skill.repo}/${skill.commit}/${skill.path}/SKILL.md`;
  let text;
  try {
    text = await fetchString(url);
  } catch (err) {
    return `${skill.name}: could not fetch SKILL.md at ${skill.commit} (${err.message})`;
  }
  const meta = parseFocusedYaml(parseFrontmatter(text));
  const declared = meta.version !== undefined ? meta.version : (meta.metadata && meta.metadata.version);
  if (declared === undefined || declared === null) {
    return `${skill.name}: SKILL.md at ${skill.commit} declares no version`;
  }
  if (String(declared) !== String(skill.version)) {
    return `${skill.name}: version mismatch — manifest '${skill.version}' vs SKILL.md '${declared}'`;
  }
  return { bundled_templates: meta.bundled_templates || [] };
}

async function checkReleaseAndRefPolicy(item, policy) {
  const violations = [];

  const { violation: refViolation, kind: resolvedKind } = await checkRefResolvesInDeclaredRepo(item);
  if (refViolation) violations.push(refViolation);

  const kindViolation = refKindViolation(item, resolvedKind, policy);
  if (kindViolation) violations.push(kindViolation);

  if (policy.requireTagShape) {
    const shapeViolation = tagShapeViolation(item);
    if (shapeViolation) violations.push(shapeViolation);
  }

  if (policy.requireProvenance) {
    const provenanceViolation = await checkReleaseProvenance(item.repo, item.commit);
    if (provenanceViolation) violations.push(`${item.name}: ${provenanceViolation}`);
  }

  return violations;
}

async function checkMcpUrlPinned(entry) {
  if (!entry.commit || !COMMIT_RE.test(entry.commit)) return null; // structural check already caught this
  if (/\/main\//.test(entry.url || '')) {
    return `${entry.name}: mcp url references a branch ('/main/') instead of a pinned commit`;
  }
  if (!entry.url || !entry.url.includes(`/${entry.commit}/`)) {
    return `${entry.name}: mcp url is not pinned to its resolved commit (expected to contain '/${entry.commit}/')`;
  }
  return null;
}

async function validateMcp(entry, policy) {
  const violations = structuralViolations(entry);
  if (violations.length > 0) return violations;

  const commitViolation = await checkCommitExists(entry);
  if (commitViolation) violations.push(commitViolation);

  violations.push(...await checkReleaseAndRefPolicy(entry, policy));

  const urlViolation = await checkMcpUrlPinned(entry);
  if (urlViolation) violations.push(urlViolation);

  return violations;
}

async function validateSkill(skill, policy) {
  const violations = structuralViolations(skill);
  let bundled_templates = [];
  if (violations.length > 0) return { violations, bundled_templates };

  const commitViolation = await checkCommitExists(skill);
  if (commitViolation) violations.push(commitViolation);

  violations.push(...await checkReleaseAndRefPolicy(skill, policy));

  const pathViolation = await checkPathAtCommit(skill);
  if (pathViolation) violations.push(pathViolation);

  const versionResult = await checkVersionParity(skill);
  if (typeof versionResult === 'string') {
    violations.push(versionResult);
  } else if (versionResult && versionResult.bundled_templates) {
    bundled_templates = versionResult.bundled_templates;
  }

  for (const mcp of (skill.mcp || [])) {
    violations.push(...await validateMcp(mcp, policy));
  }

  return { violations, bundled_templates };
}

async function validateTemplate(template, policy) {
  const violations = structuralViolations(template);
  if (violations.length > 0) return violations;

  const commitViolation = await checkCommitExists(template);
  if (commitViolation) violations.push(commitViolation);

  violations.push(...await checkReleaseAndRefPolicy(template, policy));

  const url = `https://api.github.com/repos/${template.repo}/contents/${template.path}?ref=${template.commit}`;
  const res = await apiRequest(url);
  if (res.status !== 200) {
    if (rateLimited(res.status)) {
      violations.push(`${template.name}: GitHub API rate limit hit (HTTP ${res.status}) while checking path; ${RATE_LIMIT_HINT}.`);
    } else {
      violations.push(`${template.name}: path ${template.path} not found at ${template.commit} (HTTP ${res.status || res.error || 'network error'})`);
    }
  }

  const rawUrl = `https://raw.githubusercontent.com/${template.repo}/${template.commit}/${template.path}`;
  try {
    const text = await fetchString(rawUrl);
    let declared = null;
    try {
      const meta = parseFocusedYaml(parseFrontmatter(text));
      declared = meta.version !== undefined ? meta.version : (meta.spec_version !== undefined ? meta.spec_version : (meta.metadata && meta.metadata.version));
    } catch {
      const versionMatch = text.match(/V_\d+-\d+-\d+/i) || text.match(/version:\s*["']?([^"'\r\n]+)/i);
      if (versionMatch) declared = versionMatch[1] || versionMatch[0];
    }
    if (declared === undefined || declared === null) {
      violations.push(`${template.name}: template at ${template.commit} declares no version`);
    } else if (String(declared) !== String(template.version)) {
      violations.push(`${template.name}: version mismatch — manifest '${template.version}' vs template '${declared}'`);
    }
  } catch (err) {
    violations.push(`${template.name}: could not fetch template at ${template.commit} (${err.message})`);
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  let repoRoot = null;
  let channel = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--channel') {
      channel = argv[++i];
    } else if (arg.startsWith('--channel=')) {
      channel = arg.slice('--channel='.length);
    } else if (!arg.startsWith('--') && repoRoot === null) {
      repoRoot = arg;
    }
  }
  return { repoRoot, channel };
}

async function validateChannel(repoRoot, channelName) {
  const policy = CHANNELS[channelName];
  const manifestFile = path.join(repoRoot, ...policy.file.split('/'));
  const prefix = `[${channelName}]`;
  if (!fs.existsSync(manifestFile)) {
    console.error(`FAIL: ${prefix} manifest not found at ${manifestFile}`);
    return false;
  }

  let manifestData;
  try {
    manifestData = parseManifest(fs.readFileSync(manifestFile, 'utf-8'));
  } catch (err) {
    console.error(`FAIL: ${prefix} could not parse manifest: ${err.message}`);
    return false;
  }

  const { skills, templates, workflows, mcp } = manifestData;
  const violations = [];
  const knownSkillBundledTemplates = new Set();

  for (const skill of skills) {
    const { violations: skillViolations, bundled_templates } = await validateSkill(skill, policy);
    violations.push(...skillViolations);
    for (const bt of bundled_templates) {
      const name = typeof bt === 'string' ? bt : (bt && bt.name);
      if (name) knownSkillBundledTemplates.add(name);
    }
  }

  for (const template of templates) {
    violations.push(...await validateTemplate(template, policy));
  }

  for (const mcpEntry of mcp) {
    violations.push(...await validateMcp(mcpEntry, policy));
  }

  const knownSkills = new Set(skills.map(s => s.name));
  const knownTemplates = new Set([...templates.map(t => t.name), ...knownSkillBundledTemplates]);

  // Skill dependency closure (requires)
  for (const skill of skills) {
    for (const req of (skill.requires || [])) {
      if (!knownSkills.has(req)) {
        violations.push(`${skill.name}: requires '${req}' which is not in the manifest`);
      }
    }
    for (const tmpl of (skill.templates || [])) {
      if (!knownTemplates.has(tmpl)) {
        violations.push(`${skill.name}: references template '${tmpl}' which is not declared in top-level templates or bundled`);
      }
    }
  }

  // Workflow template dependency closure
  for (const wf of workflows) {
    if (wf.template && !knownTemplates.has(wf.template)) {
      violations.push(`workflow '${wf.id || wf.label}': references template '${wf.template}' which is not declared in top-level templates or bundled`);
    }
  }

  if (violations.length > 0) {
    for (const violation of violations) console.error(`FAIL: ${prefix} ${violation}`);
    console.error(`\nFAIL: ${prefix} ${violations.length} violation(s) in manifest (${skills.length} skills, ${templates.length} templates, ${mcp.length} mcp bundles)`);
    return false;
  }

  console.log(`OK: ${prefix} ${skills.length} skills, ${templates.length} templates, and ${mcp.length} mcp bundles validated`);
  return true;
}

async function main() {
  const { repoRoot: repoRootArg, channel: channelArg } = parseArgs(process.argv.slice(2));
  const repoRoot = repoRootArg ? path.resolve(repoRootArg) : process.cwd();

  if (channelArg && !CHANNELS[channelArg]) {
    console.error(`FAIL: unknown channel '${channelArg}' (expected 'stable' or 'preview')`);
    process.exit(1);
  }

  const channelsToRun = channelArg
    ? [channelArg]
    : Object.keys(CHANNELS).filter((name) => fs.existsSync(path.join(repoRoot, ...CHANNELS[name].file.split('/'))));

  if (channelsToRun.length === 0) {
    const expected = Object.values(CHANNELS).map((c) => c.file).join(', ');
    console.error(`FAIL: no channel manifest found under ${repoRoot} (looked for ${expected})`);
    process.exit(1);
  }

  let allOk = true;
  for (const channelName of channelsToRun) {
    const ok = await validateChannel(repoRoot, channelName);
    allOk = allOk && ok;
  }

  if (!allOk) process.exit(1);
}

module.exports = {
  apiRequest,
  fetchString,
  authHeaders,
  rateLimited,
  parseFocusedYaml,
  parseFrontmatter,
  parseManifest,
  structuralViolations,
  checkCommitExists,
  checkPathAtCommit,
  checkVersionParity,
  validateSkill,
  validateTemplate,
  validateMcp,
  checkMcpUrlPinned,
  checkReleaseAndRefPolicy,
  CHANNELS,
  TAG_SHAPE_RE,
  resolveRef,
  checkRefResolvesInDeclaredRepo,
  tagShapeViolation,
  refKindViolation,
  checkReleaseProvenance,
  parseArgs,
};

if (require.main === module) {
  main();
}

