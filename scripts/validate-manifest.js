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
  return {
    version: bootstrap.version,
    entrypoint: bootstrap.entrypoint,
    skills: bootstrap.skills,
    templates,
    workflows,
  };
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

function apiRequest(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
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
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function structuralViolations(item) {
  const violations = [];
  for (const field of ['name', 'repo', 'path', 'version', 'commit']) {
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
    return `${item.name}: GitHub API rate limit hit (HTTP ${res.status}) while checking commit. Wait and retry.`;
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
    return `${skill.name}: GitHub API rate limit hit (HTTP ${res.status}) while checking path. Wait and retry.`;
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

async function validateSkill(skill) {
  const violations = structuralViolations(skill);
  let bundled_templates = [];
  if (violations.length > 0) return { violations, bundled_templates };

  const commitViolation = await checkCommitExists(skill);
  if (commitViolation) violations.push(commitViolation);

  const pathViolation = await checkPathAtCommit(skill);
  if (pathViolation) violations.push(pathViolation);

  const versionResult = await checkVersionParity(skill);
  if (typeof versionResult === 'string') {
    violations.push(versionResult);
  } else if (versionResult && versionResult.bundled_templates) {
    bundled_templates = versionResult.bundled_templates;
  }

  return { violations, bundled_templates };
}

async function validateTemplate(template) {
  const violations = structuralViolations(template);
  if (violations.length > 0) return violations;

  const commitViolation = await checkCommitExists(template);
  if (commitViolation) violations.push(commitViolation);

  const url = `https://api.github.com/repos/${template.repo}/contents/${template.path}?ref=${template.commit}`;
  const res = await apiRequest(url);
  if (res.status !== 200) {
    if (rateLimited(res.status)) {
      violations.push(`${template.name}: GitHub API rate limit hit (HTTP ${res.status}) while checking path. Wait and retry.`);
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

async function main() {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const manifestFile = path.join(repoRoot, 'docs', 'use', 'manifest.md');
  if (!fs.existsSync(manifestFile)) {
    console.error(`FAIL: manifest not found at ${manifestFile}`);
    process.exit(1);
  }

  let manifestData;
  try {
    manifestData = parseManifest(fs.readFileSync(manifestFile, 'utf-8'));
  } catch (err) {
    console.error(`FAIL: could not parse manifest: ${err.message}`);
    process.exit(1);
  }

  const { skills, templates, workflows } = manifestData;
  const violations = [];
  const knownSkillBundledTemplates = new Set();

  for (const skill of skills) {
    const { violations: skillViolations, bundled_templates } = await validateSkill(skill);
    violations.push(...skillViolations);
    for (const bt of bundled_templates) {
      const name = typeof bt === 'string' ? bt : (bt && bt.name);
      if (name) knownSkillBundledTemplates.add(name);
    }
  }

  for (const template of templates) {
    violations.push(...await validateTemplate(template));
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
    for (const violation of violations) console.error(`FAIL: ${violation}`);
    console.error(`\nFAIL: ${violations.length} violation(s) in manifest (${skills.length} skills, ${templates.length} templates)`);
    process.exit(1);
  }

  console.log(`OK: ${skills.length} skills and ${templates.length} templates validated`);
}

if (require.main === module) {
  main();
}

