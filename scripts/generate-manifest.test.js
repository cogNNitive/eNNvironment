#!/usr/bin/env node
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const generatorScript = path.join(__dirname, 'generate-manifest.js');

function freshGeneratorModule() {
  delete require.cache[require.resolve(generatorScript)];
  return require(generatorScript);
}

function createTempSourceDir({ source, body, banner }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eNNvironment-gen-test-'));
  const manifestDir = path.join(tmpDir, 'manifest');
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(path.join(manifestDir, 'source.yaml'), source, 'utf-8');
  fs.writeFileSync(path.join(manifestDir, 'body.md'), body, 'utf-8');
  if (banner !== undefined) {
    fs.writeFileSync(path.join(manifestDir, 'body.preview-banner.md'), banner, 'utf-8');
  }
  fs.mkdirSync(path.join(tmpDir, 'docs', 'use'), { recursive: true });
  return tmpDir;
}

const BASIC_SOURCE = `version: "2.0"
entrypoint: "workspace_NN.md"
skills:
  - name: nn-router
    repo: cogNNitive/actioNN
    path: skills/nn-router
    version: "3.2"
    description: Central system governance and skill router.
templates: []
workflows: []
channels:
  stable:
    refs:
      - key: cogNNitive/actioNN
        repo: cogNNitive/actioNN
        ref: skills-v1.0.0
  preview:
    refs:
      - key: cogNNitive/actioNN
        repo: cogNNitive/actioNN
        ref: feat/innfo-v0-2-0-adoption
`;

const BASIC_BODY = `# cogNNitive — bootstrap manifest

Body prose goes here.
`;

function fakeResolveRef(tagShas, branchShas) {
  return async (repo, ref) => {
    if (Object.prototype.hasOwnProperty.call(tagShas, ref)) {
      return { sha: tagShas[ref], kind: 'tag' };
    }
    if (Object.prototype.hasOwnProperty.call(branchShas, ref)) {
      return { sha: branchShas[ref], kind: 'branch' };
    }
    return { error: `ref '${ref}' not found in ${repo}` };
  };
}

async function main() {
  console.log('Running generate-manifest unit tests...');

  // 1. Determinism: re-rendering the same source produces byte-identical output
  {
    const mod = freshGeneratorModule();
    const source = mod.parseSourceYaml(BASIC_SOURCE);
    const resolveRef = fakeResolveRef({ 'skills-v1.0.0': 'd60a7109315820085ab127b70412992db6986c88' }, {});
    const first = await mod.renderManifest(source, 'stable', BASIC_BODY, resolveRef);
    const second = await mod.renderManifest(source, 'stable', BASIC_BODY, resolveRef);
    assert.strictEqual(typeof first, 'string');
    assert.strictEqual(first, second, 'regeneration with no upstream change must be byte-identical');
    console.log('✔ Determinism (byte-identical re-render) test passed');
  }

  // 2. LF only, single trailing newline, no trailing whitespace on any line
  {
    const mod = freshGeneratorModule();
    const source = mod.parseSourceYaml(BASIC_SOURCE);
    const resolveRef = fakeResolveRef({ 'skills-v1.0.0': 'd60a7109315820085ab127b70412992db6986c88' }, {});
    const rendered = await mod.renderManifest(source, 'stable', BASIC_BODY, resolveRef);
    assert.ok(!rendered.includes('\r'), 'output must not contain CR');
    assert.ok(rendered.endsWith('\n') && !rendered.endsWith('\n\n'), 'output must end with exactly one trailing newline');
    for (const line of rendered.split('\n')) {
      assert.strictEqual(line, line.replace(/[ \t]+$/, ''), `line has trailing whitespace: ${JSON.stringify(line)}`);
    }
    console.log('✔ LF + single trailing newline + no trailing whitespace test passed');
  }

  // 3. note: field renders as deterministic # lines above the entry
  {
    const mod = freshGeneratorModule();
    const sourceWithNote = `version: "2.0"
entrypoint: "workspace_NN.md"
skills:
  - name: nn-router
    repo: cogNNitive/actioNN
    path: skills/nn-router
    version: "3.2"
    note: provisional pin, re-check after next release
    description: Central system governance and skill router.
templates: []
workflows: []
channels:
  stable:
    refs:
      - key: cogNNitive/actioNN
        repo: cogNNitive/actioNN
        ref: skills-v1.0.0
  preview:
    refs:
      - key: cogNNitive/actioNN
        repo: cogNNitive/actioNN
        ref: feat/innfo-v0-2-0-adoption
`;
    const source = mod.parseSourceYaml(sourceWithNote);
    const resolveRef = fakeResolveRef({ 'skills-v1.0.0': 'd60a7109315820085ab127b70412992db6986c88' }, {});
    const rendered = await mod.renderManifest(source, 'stable', BASIC_BODY, resolveRef);
    assert.match(rendered, /# provisional pin, re-check after next release\r?\n\s*- name: nn-router/, 'note must render as a # comment line directly above its entry');
    console.log('✔ note: rendering test passed');
  }

  // 4. All-or-nothing: a resolution failure aborts without writing any file
  {
    const tmpDir = createTempSourceDir({ source: BASIC_SOURCE, body: BASIC_BODY });
    try {
      const mod = freshGeneratorModule();
      const outPath = path.join(tmpDir, 'docs', 'use', 'manifest.md');
      const resolveRef = fakeResolveRef({}, {}); // nothing resolves -> forces failure
      const exitCode = await mod.run(['--channel', 'stable'], { cwd: tmpDir, resolveRef, log: () => {}, logError: () => {} });
      assert.strictEqual(exitCode, 2, 'resolution failure must exit 2');
      assert.ok(!fs.existsSync(outPath), 'no manifest file must be written on resolution failure');
      console.log('✔ All-or-nothing on resolution failure test passed');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // 5. --check reports drift with exit 1 and does not touch the on-disk file
  {
    const tmpDir = createTempSourceDir({ source: BASIC_SOURCE, body: BASIC_BODY });
    try {
      const mod = freshGeneratorModule();
      const outPath = path.join(tmpDir, 'docs', 'use', 'manifest.md');
      fs.writeFileSync(outPath, 'stale hand-edited content\n', 'utf-8');
      const resolveRef = fakeResolveRef({ 'skills-v1.0.0': 'd60a7109315820085ab127b70412992db6986c88' }, {});
      const errors = [];
      const exitCode = await mod.run(['--channel', 'stable', '--check'], { cwd: tmpDir, resolveRef, log: () => {}, logError: (msg) => errors.push(msg) });
      assert.strictEqual(exitCode, 1, '--check drift must exit 1');
      assert.strictEqual(fs.readFileSync(outPath, 'utf-8'), 'stale hand-edited content\n', '--check must not modify the on-disk file');
      assert.ok(errors.length > 0, '--check drift must report a diff on stderr');
      console.log('✔ --check drift test passed');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // 6. --check passes (exit 0) when the on-disk file is byte-identical to the render
  {
    const tmpDir = createTempSourceDir({ source: BASIC_SOURCE, body: BASIC_BODY });
    try {
      const mod = freshGeneratorModule();
      const resolveRef = fakeResolveRef({ 'skills-v1.0.0': 'd60a7109315820085ab127b70412992db6986c88' }, {});
      const writeExit = await mod.run(['--channel', 'stable'], { cwd: tmpDir, resolveRef, log: () => {}, logError: () => {} });
      assert.strictEqual(writeExit, 0, 'initial write must succeed');
      const checkExit = await mod.run(['--channel', 'stable', '--check'], { cwd: tmpDir, resolveRef, log: () => {}, logError: () => {} });
      assert.strictEqual(checkExit, 0, '--check must pass when the file is already up to date');
      console.log('✔ --check up-to-date test passed');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // 7. --out writes to a custom path
  {
    const tmpDir = createTempSourceDir({ source: BASIC_SOURCE, body: BASIC_BODY });
    try {
      const mod = freshGeneratorModule();
      const customOut = path.join(tmpDir, 'custom-manifest.md');
      const resolveRef = fakeResolveRef({ 'skills-v1.0.0': 'd60a7109315820085ab127b70412992db6986c88' }, {});
      const exitCode = await mod.run(['--channel', 'stable', '--out', customOut], { cwd: tmpDir, resolveRef, log: () => {}, logError: () => {} });
      assert.strictEqual(exitCode, 0);
      assert.ok(fs.existsSync(customOut), '--out must write to the given path');
      console.log('✔ --out custom path test passed');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // 8. Preview channel prepends the banner and never touches the stable file
  {
    const tmpDir = createTempSourceDir({ source: BASIC_SOURCE, body: BASIC_BODY, banner: '> PREVIEW — not for production.\n' });
    try {
      const mod = freshGeneratorModule();
      const resolveRef = fakeResolveRef({}, { 'feat/innfo-v0-2-0-adoption': 'cccccccccccccccccccccccccccccccccccccccc' });
      const exitCode = await mod.run(['--channel', 'preview'], { cwd: tmpDir, resolveRef, log: () => {}, logError: () => {} });
      assert.strictEqual(exitCode, 0);
      const previewPath = path.join(tmpDir, 'docs', 'use', 'manifest-next.md');
      const stablePath = path.join(tmpDir, 'docs', 'use', 'manifest.md');
      assert.ok(fs.existsSync(previewPath), 'preview channel must write manifest-next.md');
      assert.ok(!fs.existsSync(stablePath), 'preview generation must not touch the stable file');
      const content = fs.readFileSync(previewPath, 'utf-8');
      assert.match(content, /PREVIEW — not for production/, 'preview banner must be prepended to the body');
      console.log('✔ Preview channel banner + isolation test passed');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log('All generate-manifest unit tests passed successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
