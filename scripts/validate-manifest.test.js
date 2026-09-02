#!/usr/bin/env node
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');

const validatorScript = path.join(__dirname, 'validate-manifest.js');

function stubHttpsGetOnce(statusCode, body) {
  const originalGet = https.get;
  let capturedOptions = null;
  https.get = (url, options, callback) => {
    capturedOptions = options;
    const res = new EventEmitter();
    res.statusCode = statusCode;
    const req = new EventEmitter();
    process.nextTick(() => {
      callback(res);
      res.emit('data', Buffer.from(body));
      res.emit('end');
    });
    return req;
  };
  return {
    restore: () => { https.get = originalGet; },
    capturedOptions: () => capturedOptions,
  };
}

function freshValidatorModule() {
  delete require.cache[require.resolve(validatorScript)];
  return require(validatorScript);
}

function stubHttpsGetSequence(responses) {
  const originalGet = https.get;
  let call = 0;
  const capturedUrls = [];
  https.get = (url, options, callback) => {
    capturedUrls.push(url);
    const { status, body } = responses[Math.min(call, responses.length - 1)];
    call++;
    const res = new EventEmitter();
    res.statusCode = status;
    const req = new EventEmitter();
    process.nextTick(() => {
      callback(res);
      res.emit('data', Buffer.from(body));
      res.emit('end');
    });
    return req;
  };
  return {
    restore: () => { https.get = originalGet; },
    urls: () => capturedUrls,
  };
}

function createTempManifestDir(manifestContent) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eNNvironment-test-'));
  const docsUseDir = path.join(tmpDir, 'docs', 'use');
  fs.mkdirSync(docsUseDir, { recursive: true });
  fs.writeFileSync(path.join(docsUseDir, 'manifest.md'), manifestContent, 'utf-8');
  return tmpDir;
}

async function main() {
console.log('Running validate-manifest unit tests...');

// 1. Legacy manifest entry (no templates, no mcp) passes full stable-channel validation.
//    Stubbed API per design's testing strategy — a real tag is a Phase 0 precondition
//    this unit suite must not depend on.
{
  const mod = freshValidatorModule();
  const skill = {
    name: 'nn-router',
    repo: 'cogNNitive/actioNN',
    path: 'skills/nn-router',
    version: '3.2',
    ref: 'skills-v1.0.0',
    commit: 'd60a7109315820085ab127b70412992db6986c88',
  };
  const stub = stubHttpsGetSequence([
    { status: 200, body: JSON.stringify({ sha: skill.commit }) }, // checkCommitExists
    { status: 200, body: JSON.stringify({ object: { sha: skill.commit, type: 'commit' } }) }, // resolveRef tag lookup
    { status: 200, body: JSON.stringify({ status: 'identical' }) }, // checkReleaseProvenance
    { status: 200, body: JSON.stringify([{ name: 'SKILL.md' }]) }, // checkPathAtCommit
    { status: 200, body: '---\nversion: "3.2"\n---\n# SKILL' }, // checkVersionParity
  ]);
  try {
    const { violations } = await mod.validateSkill(skill, mod.CHANNELS.stable);
    assert.deepStrictEqual(violations, [], `Legacy manifest entry should pass validation. Violations: ${JSON.stringify(violations)}`);
    console.log('✔ Legacy manifest backward compatibility test passed');
  } finally {
    stub.restore();
  }
}

// 1b. Manifest entry omitting `ref` fails structural validation (ref is now mandatory)
{
  const noRefContent = `---
agent-bootstrap:
  version: "2.0"
  skills:
    - name: nn-router
      repo: cogNNitive/actioNN
      path: skills/nn-router
      version: "3.2"
      commit: "d60a7109315820085ab127b70412992db6986c88"
---
# Manifest`;

  const tmpDir = createTempManifestDir(noRefContent);
  try {
    const res = spawnSync('node', [validatorScript, tmpDir], { encoding: 'utf-8' });
    assert.notStrictEqual(res.status, 0, 'Manifest entry without ref should fail validation');
    assert.match(res.stderr, /missing field 'ref'/);
    console.log('✔ Mandatory ref field test passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// 2. Invalid commit SHA (not 40-char hex sha) fails validation
{
  const invalidShaContent = `---
agent-bootstrap:
  version: "2.0"
  skills:
    - name: nn-router
      repo: cogNNitive/actioNN
      path: skills/nn-router
      version: "3.2"
      commit: "invalid-sha"
---
# Manifest`;

  const tmpDir = createTempManifestDir(invalidShaContent);
  try {
    const res = spawnSync('node', [validatorScript, tmpDir], { encoding: 'utf-8' });
    assert.notStrictEqual(res.status, 0, 'Invalid commit SHA should fail validation');
    assert.match(res.stderr, /is not a 40-char hex sha/);
    console.log('✔ Structural validation (invalid SHA) test passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// 3. Missing dependency closure (workflow referencing undeclared template) fails
{
  const missingClosureContent = `---
agent-bootstrap:
  version: "2.0"
  skills: []
  templates: []
  workflows:
    - id: test-wf
      label: Test Workflow
      template: missing_template_spec
---
# Manifest`;

  const tmpDir = createTempManifestDir(missingClosureContent);
  try {
    const res = spawnSync('node', [validatorScript, tmpDir], { encoding: 'utf-8' });
    assert.notStrictEqual(res.status, 0, 'Missing dependency closure should fail validation');
    assert.match(res.stderr, /references template 'missing_template_spec' which is not declared/);
    console.log('✔ Dependency closure (missing template) test passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// 4. GITHUB_TOKEN is sent as an Authorization: Bearer header by apiRequest and fetchString
{
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token-12345';
  const mod = freshValidatorModule();

  {
    const stub = stubHttpsGetOnce(200, '{}');
    try {
      await mod.apiRequest('https://api.github.com/repos/cogNNitive/eNNvironment/commits/abc');
      const headers = stub.capturedOptions().headers;
      assert.strictEqual(headers.Authorization, 'Bearer test-token-12345', 'apiRequest should send Authorization: Bearer when GITHUB_TOKEN is set');
    } finally {
      stub.restore();
    }
  }

  {
    const stub = stubHttpsGetOnce(200, 'raw body');
    try {
      await mod.fetchString('https://raw.githubusercontent.com/cogNNitive/eNNvironment/abc/README.md');
      const headers = stub.capturedOptions().headers;
      assert.strictEqual(headers.Authorization, 'Bearer test-token-12345', 'fetchString should send Authorization: Bearer when GITHUB_TOKEN is set');
    } finally {
      stub.restore();
    }
  }

  if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = previousToken;
  freshValidatorModule();
  console.log('✔ GITHUB_TOKEN Authorization header test passed');
}

// 5. Repo-scoped commit existence: 422 means "wrong repo", 200 means it exists
{
  const mod = freshValidatorModule();
  const item = {
    name: 'workspace_spec_NN',
    repo: 'cogNNitive/iNNfo',
    commit: '3f1a9c2b8e4d6f0a1b2c3d4e5f60718293a4b5c6',
  };

  {
    const stub = stubHttpsGetOnce(422, JSON.stringify({ message: 'No commit found for SHA' }));
    try {
      const violation = await mod.checkCommitExists(item);
      assert.notStrictEqual(violation, null, '422 should be reported as a violation');
      assert.match(violation, /cogNNitive\/iNNfo/, 'violation must name the declared repo');
      assert.match(violation, /wrong repo/i, '422 violation must be distinguishable as a wrong-repo error');
    } finally {
      stub.restore();
    }
  }

  {
    const stub = stubHttpsGetOnce(200, JSON.stringify({ sha: item.commit }));
    try {
      const violation = await mod.checkCommitExists(item);
      assert.strictEqual(violation, null, '200 should pass repo-scoped existence check');
    } finally {
      stub.restore();
    }
  }

  console.log('✔ Repo-scoped commit existence (422 vs 200) test passed');
}

// 6. CHANNELS table: stable requires tag, preview requires branch; each has its own file
{
  const mod = freshValidatorModule();
  assert.strictEqual(mod.CHANNELS.stable.file, 'docs/use/manifest.md');
  assert.strictEqual(mod.CHANNELS.stable.requiredRefKind, 'tag');
  assert.strictEqual(mod.CHANNELS.stable.requireTagShape, true);
  assert.strictEqual(mod.CHANNELS.stable.requireProvenance, true);
  assert.strictEqual(mod.CHANNELS.preview.file, 'docs/use/manifest-next.md');
  assert.strictEqual(mod.CHANNELS.preview.requiredRefKind, 'branch');
  assert.strictEqual(mod.CHANNELS.preview.requireTagShape, false);
  assert.strictEqual(mod.CHANNELS.preview.requireProvenance, false);
  console.log('✔ CHANNELS policy table test passed');
}

// 7. resolveRef: lightweight tag resolves directly to its commit
{
  const mod = freshValidatorModule();
  const stub = stubHttpsGetSequence([
    { status: 200, body: JSON.stringify({ ref: 'refs/tags/skills-v1.0.0', object: { sha: 'd60a7109315820085ab127b70412992db6986c88', type: 'commit' } }) },
  ]);
  try {
    const result = await mod.resolveRef('cogNNitive/actioNN', 'skills-v1.0.0');
    assert.strictEqual(result.sha, 'd60a7109315820085ab127b70412992db6986c88');
    assert.strictEqual(result.kind, 'tag');
  } finally {
    stub.restore();
  }
  console.log('✔ resolveRef lightweight tag test passed');
}

// 8. resolveRef: annotated tag is peeled via git/tags/{sha} to the underlying commit
{
  const mod = freshValidatorModule();
  const stub = stubHttpsGetSequence([
    { status: 200, body: JSON.stringify({ ref: 'refs/tags/templates-v0.2.0', object: { sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', type: 'tag' } }) },
    { status: 200, body: JSON.stringify({ object: { sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', type: 'commit' } }) },
  ]);
  try {
    const result = await mod.resolveRef('cogNNitive/iNNfo', 'templates-v0.2.0');
    assert.strictEqual(result.sha, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    assert.strictEqual(result.kind, 'tag');
    assert.match(stub.urls()[1], /git\/tags\/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/, 'must peel via git/tags/{sha}');
  } finally {
    stub.restore();
  }
  console.log('✔ resolveRef annotated tag peel test passed');
}

// 9. resolveRef: falls back to a branch ref when no tag matches
{
  const mod = freshValidatorModule();
  const stub = stubHttpsGetSequence([
    { status: 404, body: JSON.stringify({ message: 'Not Found' }) },
    { status: 200, body: JSON.stringify({ ref: 'refs/heads/feat/innfo-v0-2-0-adoption', object: { sha: 'cccccccccccccccccccccccccccccccccccccccc', type: 'commit' } }) },
  ]);
  try {
    const result = await mod.resolveRef('cogNNitive/actioNN', 'feat/innfo-v0-2-0-adoption');
    assert.strictEqual(result.sha, 'cccccccccccccccccccccccccccccccccccccccc');
    assert.strictEqual(result.kind, 'branch');
  } finally {
    stub.restore();
  }
  console.log('✔ resolveRef branch fallback test passed');
}

// 10. resolveRef: neither tag nor branch resolves -> error
{
  const mod = freshValidatorModule();
  const stub = stubHttpsGetSequence([
    { status: 404, body: '{}' },
    { status: 404, body: '{}' },
  ]);
  try {
    const result = await mod.resolveRef('cogNNitive/iNNfo', 'does-not-exist');
    assert.ok(result.error, 'unresolved ref must return an error');
  } finally {
    stub.restore();
  }
  console.log('✔ resolveRef unresolved ref test passed');
}

// 11. tagShapeViolation: enforces `<name>-vX.Y.Z`
{
  const mod = freshValidatorModule();
  assert.strictEqual(mod.tagShapeViolation({ name: 'x', ref: 'skills-v1.0.0' }), null);
  assert.notStrictEqual(mod.tagShapeViolation({ name: 'x', ref: 'v1.0.0' }), null);
  assert.notStrictEqual(mod.tagShapeViolation({ name: 'x', ref: 'feat/some-branch' }), null);
  console.log('✔ tagShapeViolation test passed');
}

// 12. refKindViolation: entry ref kind must match the channel policy's requiredRefKind
{
  const mod = freshValidatorModule();
  assert.strictEqual(mod.refKindViolation({ name: 'x', ref: 'skills-v1.0.0' }, 'tag', mod.CHANNELS.stable), null);
  assert.notStrictEqual(mod.refKindViolation({ name: 'x', ref: 'feat/branch' }, 'branch', mod.CHANNELS.stable), null);
  assert.strictEqual(mod.refKindViolation({ name: 'x', ref: 'feat/branch' }, 'branch', mod.CHANNELS.preview), null);
  console.log('✔ refKindViolation test passed');
}

// 13. checkReleaseProvenance: 'ahead' of main fails stable, 'identical'/'behind' pass
{
  const mod = freshValidatorModule();
  {
    const stub = stubHttpsGetSequence([{ status: 200, body: JSON.stringify({ status: 'ahead' }) }]);
    try {
      const violation = await mod.checkReleaseProvenance('cogNNitive/iNNfo', 'deadbeef00000000000000000000000000000000');
      assert.notStrictEqual(violation, null, 'ahead of main must fail release provenance');
    } finally {
      stub.restore();
    }
  }
  {
    const stub = stubHttpsGetSequence([{ status: 200, body: JSON.stringify({ status: 'identical' }) }]);
    try {
      const violation = await mod.checkReleaseProvenance('cogNNitive/iNNfo', 'deadbeef00000000000000000000000000000000');
      assert.strictEqual(violation, null, 'identical to main must pass release provenance');
    } finally {
      stub.restore();
    }
  }
  {
    const stub = stubHttpsGetSequence([{ status: 200, body: JSON.stringify({ status: 'behind' }) }]);
    try {
      const violation = await mod.checkReleaseProvenance('cogNNitive/iNNfo', 'deadbeef00000000000000000000000000000000');
      assert.strictEqual(violation, null, 'behind main must pass release provenance');
    } finally {
      stub.restore();
    }
  }
  console.log('✔ checkReleaseProvenance test passed');
}

// 14. mcp-url-pinned: url must embed the entry's own commit, /main/ must fail
{
  const mod = freshValidatorModule();
  const pinned = {
    name: 'innfo-mcp',
    repo: 'cogNNitive/iNNfo',
    path: 'packages/innfo-mcp/bin/innfo-mcp.bundle.js',
    ref: 'innfo-mcp-v0.2.1',
    commit: '3f1a9c2b8e4d6f0a1b2c3d4e5f60718293a4b5c6',
    url: 'https://raw.githubusercontent.com/cogNNitive/iNNfo/3f1a9c2b8e4d6f0a1b2c3d4e5f60718293a4b5c6/packages/innfo-mcp/bin/innfo-mcp.bundle.js',
  };
  const unpinned = {
    ...pinned,
    url: 'https://raw.githubusercontent.com/cogNNitive/iNNfo/main/packages/innfo-mcp/bin/innfo-mcp.bundle.js',
  };
  assert.strictEqual(await mod.checkMcpUrlPinned(pinned), null, 'commit-pinned mcp url must pass');
  const violation = await mod.checkMcpUrlPinned(unpinned);
  assert.notStrictEqual(violation, null, 'unpinned (/main/) mcp url must fail');
  assert.match(violation, /main/, 'violation should identify the unpinned branch segment');
  console.log('✔ mcp-url-pinned test passed');
}

// 15. --channel CLI flag selects a single channel file; unknown channel is rejected
{
  const tmpDir = createTempManifestDir('---\nagent-bootstrap:\n  version: "2.0"\n  skills: []\n---\n# Manifest');
  try {
    const res = spawnSync('node', [validatorScript, tmpDir, '--channel', 'bogus'], { encoding: 'utf-8' });
    assert.notStrictEqual(res.status, 0, 'unknown channel must fail fast');
    assert.match(res.stderr, /unknown channel/i);
    console.log('✔ --channel CLI flag validation test passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log('All validate-manifest unit tests passed successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
