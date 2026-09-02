#!/usr/bin/env node

/**
 * scripts/generate-manifest.js
 *
 * Renders docs/use/manifest.md (stable) or docs/use/manifest-next.md (preview)
 * from a SHA-free hand-authored source: manifest/source.yaml (identity, paths,
 * versions, per-channel refs) + manifest/body.md (prose). Every `commit` in the
 * output is resolved from a `repo` + `ref` pair through the GitHub API — there
 * is no field in the source for a human to type a commit or a wrong-repo SHA
 * into.
 *
 * CLI contract:
 *   node scripts/generate-manifest.js --channel stable|preview [--check] [--out <path>]
 *     exit 0  wrote (or --check: on-disk file is byte-identical)
 *     exit 1  --check drift: on-disk file differs from render (diff on stderr)
 *     exit 2  resolution failure (ref not found, wrong ref kind, rate limit, network)
 *
 * The render is a pure function of its inputs: no timestamp, no generator
 * version, no run id. Regeneration with no upstream change is byte-identical.
 *
 * Zero dependencies. Requires Node >= 18.
 */

const fs = require('fs');
const path = require('path');
const {
  parseFocusedYaml,
  resolveRef: defaultResolveRef,
  CHANNELS,
} = require('./validate-manifest.js');

// ---------------------------------------------------------------------------
// Source parsing
// ---------------------------------------------------------------------------

function parseSourceYaml(text) {
  const doc = parseFocusedYaml(text);
  return {
    version: doc.version,
    entrypoint: doc.entrypoint,
    skills: Array.isArray(doc.skills) ? doc.skills : [],
    templates: Array.isArray(doc.templates) ? doc.templates : [],
    workflows: Array.isArray(doc.workflows) ? doc.workflows : [],
    channels: doc.channels || {},
  };
}

// ---------------------------------------------------------------------------
// Ref resolution — resolves each entry's ref_key against the channel's refs
// map, then resolves the ref itself through the GitHub API (or an injected
// stub in tests). No network in unit tests.
// ---------------------------------------------------------------------------

async function resolveEntryRef(entry, channelRefs, resolveRef) {
  const key = entry.ref_key || entry.repo;
  const refInfo = channelRefs.find((r) => r.key === key);
  if (refInfo === undefined) {
    return { error: `no ref declared for ref_key '${key}' in this channel` };
  }
  const { repo, ref } = refInfo;
  if (repo !== entry.repo) {
    return { error: `ref_key '${key}' resolves to repo '${repo}', but '${entry.name}' declares repo '${entry.repo}'` };
  }
  const resolved = await resolveRef(repo, ref);
  if (resolved.error) return { error: resolved.error };
  return { ref, commit: resolved.sha };
}

async function buildRenderModel(source, channel, resolveRef) {
  const channelRefs = (source.channels[channel] && source.channels[channel].refs) || [];

  const skills = [];
  for (const skill of source.skills) {
    const resolved = await resolveEntryRef(skill, channelRefs, resolveRef);
    if (resolved.error) return { error: `${skill.name}: ${resolved.error}` };

    const mcp = [];
    for (const m of (skill.mcp || [])) {
      const mResolved = await resolveEntryRef(m, channelRefs, resolveRef);
      if (mResolved.error) return { error: `${m.name}: ${mResolved.error}` };
      mcp.push({
        ...m,
        ref: mResolved.ref,
        commit: mResolved.commit,
        url: `https://raw.githubusercontent.com/${m.repo}/${mResolved.commit}/${m.path}`,
      });
    }

    skills.push({ ...skill, ref: resolved.ref, commit: resolved.commit, mcp });
  }

  const templates = [];
  for (const template of source.templates) {
    const resolved = await resolveEntryRef(template, channelRefs, resolveRef);
    if (resolved.error) return { error: `${template.name}: ${resolved.error}` };
    templates.push({ ...template, ref: resolved.ref, commit: resolved.commit });
  }

  return {
    version: source.version,
    entrypoint: source.entrypoint,
    skills,
    templates,
    workflows: source.workflows,
  };
}

// ---------------------------------------------------------------------------
// Deterministic emitter — no YAML library, fixed key order, fixed quoting.
// ---------------------------------------------------------------------------

function q(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function renderNoteLines(note, indent) {
  if (!note) return '';
  return note
    .split('\n')
    .map((line) => `${indent}# ${line}`)
    .join('\n') + '\n';
}

function renderSkillEntry(skill) {
  const indent = '    ';
  let out = renderNoteLines(skill.note, indent);
  out += `${indent}- name: ${skill.name}\n`;
  out += `${indent}  repo: ${skill.repo}\n`;
  out += `${indent}  path: ${skill.path}\n`;
  out += `${indent}  version: ${q(skill.version)}\n`;
  out += `${indent}  ref: ${q(skill.ref)}\n`;
  out += `${indent}  commit: ${q(skill.commit)}\n`;
  if (skill.requires && skill.requires.length) {
    out += `${indent}  requires: [${skill.requires.join(', ')}]\n`;
  }
  out += `${indent}  description: ${skill.description}\n`;
  if (skill.templates && skill.templates.length) {
    out += `${indent}  templates: [${skill.templates.join(', ')}]\n`;
  }
  if (skill.mcp && skill.mcp.length) {
    out += `${indent}  mcp:\n`;
    for (const m of skill.mcp) {
      out += `${indent}    - name: ${m.name}\n`;
      out += `${indent}      repo: ${m.repo}\n`;
      out += `${indent}      path: ${m.path}\n`;
      if (m.version !== undefined) {
        out += `${indent}      version: ${q(m.version)}
`;
      }
      out += `${indent}      ref: ${q(m.ref)}\n`;
      out += `${indent}      commit: ${q(m.commit)}\n`;
      out += `${indent}      url: ${m.url}\n`;
    }
  }
  return out;
}

function renderTemplateEntry(template) {
  const indent = '    ';
  let out = renderNoteLines(template.note, indent);
  out += `${indent}- name: ${template.name}\n`;
  out += `${indent}  repo: ${template.repo}\n`;
  out += `${indent}  path: ${template.path}\n`;
  out += `${indent}  version: ${q(template.version)}\n`;
  out += `${indent}  ref: ${q(template.ref)}\n`;
  out += `${indent}  commit: ${q(template.commit)}\n`;
  return out;
}

function renderWorkflowEntry(wf) {
  const indent = '    ';
  let out = `${indent}- id: ${wf.id}\n`;
  out += `${indent}  label: ${wf.label}\n`;
  out += `${indent}  description: ${wf.description}\n`;
  if (wf.skill) out += `${indent}  skill: ${wf.skill}\n`;
  if (wf.template) out += `${indent}  template: ${wf.template}\n`;
  return out;
}

function renderFrontmatter(model, channel) {
  const titleSuffix = channel === 'preview' ? ' (preview)' : '';
  let out = '---\n';
  out += `title: "cogNNitive — Bootstrap manifest${titleSuffix}"\n`;
  out += 'description: "Canonical agent-bootstrap manifest served raw (Jekyll-safe) for https://cognnitive.com/use."\n';
  out += `channel: "${channel}"\n`;
  out += 'agent-bootstrap:\n';
  out += `  version: ${q(model.version)}\n`;
  out += `  entrypoint: ${q(model.entrypoint)}\n`;
  out += '  skills:\n';
  for (const s of model.skills) out += renderSkillEntry(s);
  out += '  templates:\n';
  for (const t of model.templates) out += renderTemplateEntry(t);
  out += '  workflows:\n';
  for (const w of model.workflows) out += renderWorkflowEntry(w);
  out += '---\n';
  return out;
}

function normalizeOutput(text) {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n') + '\n';
}

async function renderManifest(source, channel, body, resolveRef) {
  const model = await buildRenderModel(source, channel, resolveRef);
  if (model.error) return { error: model.error };
  const rendered = normalizeOutput(`${renderFrontmatter(model, channel)}\n${body}`);
  return rendered;
}

// ---------------------------------------------------------------------------
// Minimal line diff for --check output. Not a full LCS diff — good enough to
// point a reviewer at what changed in a hand-edited manifest.
// ---------------------------------------------------------------------------

function unifiedDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const max = Math.max(oldLines.length, newLines.length);
  const out = [];
  for (let i = 0; i < max; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine === newLine) continue;
    if (oldLine !== undefined) out.push(`- ${oldLine}`);
    if (newLine !== undefined) out.push(`+ ${newLine}`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  let channel = null;
  let check = false;
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--channel') channel = argv[++i];
    else if (arg.startsWith('--channel=')) channel = arg.slice('--channel='.length);
    else if (arg === '--check') check = true;
    else if (arg === '--out') out = argv[++i];
    else if (arg.startsWith('--out=')) out = arg.slice('--out='.length);
  }
  return { channel, check, out };
}

async function run(argv, options = {}) {
  const {
    cwd = process.cwd(),
    resolveRef = defaultResolveRef,
    log = console.log,
    logError = console.error,
  } = options;

  const { channel, check, out } = parseArgs(argv);

  if (!channel || !CHANNELS[channel]) {
    logError("FAIL: --channel stable|preview is required");
    return 2;
  }

  const sourcePath = path.join(cwd, 'manifest', 'source.yaml');
  const bodyPath = path.join(cwd, 'manifest', 'body.md');
  const bannerPath = path.join(cwd, 'manifest', 'body.preview-banner.md');

  let source;
  try {
    source = parseSourceYaml(fs.readFileSync(sourcePath, 'utf-8'));
  } catch (err) {
    logError(`FAIL: could not read/parse ${sourcePath}: ${err.message}`);
    return 2;
  }

  let body;
  try {
    body = fs.readFileSync(bodyPath, 'utf-8');
  } catch (err) {
    logError(`FAIL: could not read ${bodyPath}: ${err.message}`);
    return 2;
  }
  if (channel === 'preview' && fs.existsSync(bannerPath)) {
    body = `${fs.readFileSync(bannerPath, 'utf-8').trim()}\n\n${body}`;
  }

  const rendered = await renderManifest(source, channel, body, resolveRef);
  if (rendered.error) {
    logError(`FAIL: ${rendered.error}`);
    return 2;
  }

  const outPath = out ? path.resolve(cwd, out) : path.join(cwd, ...CHANNELS[channel].file.split('/'));

  if (check) {
    if (!fs.existsSync(outPath)) {
      logError(`FAIL: --check: ${outPath} does not exist`);
      return 1;
    }
    const onDisk = fs.readFileSync(outPath, 'utf-8');
    if (onDisk === rendered) {
      log(`OK: ${outPath} is up to date`);
      return 0;
    }
    logError(`FAIL: --check: ${outPath} differs from the generated render`);
    logError(unifiedDiff(onDisk, rendered));
    return 1;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, rendered, 'utf-8');
  log(`OK: wrote ${outPath}`);
  return 0;
}

async function main() {
  const exitCode = await run(process.argv.slice(2));
  process.exit(exitCode);
}

module.exports = {
  parseSourceYaml,
  resolveEntryRef,
  buildRenderModel,
  renderManifest,
  normalizeOutput,
  unifiedDiff,
  parseArgs,
  run,
};

if (require.main === module) {
  main();
}
