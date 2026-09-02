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

function createTempManifestDir(manifestContent) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eNNvironment-test-'));
  const docsUseDir = path.join(tmpDir, 'docs', 'use');
  fs.mkdirSync(docsUseDir, { recursive: true });
  fs.writeFileSync(path.join(docsUseDir, 'manifest.md'), manifestContent, 'utf-8');
  return tmpDir;
}

async function main() {
console.log('Running validate-manifest unit tests...');

// 1. Legacy manifest without templates passes or validates correctly
{
  const legacyContent = `---
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

  const tmpDir = createTempManifestDir(legacyContent);
  try {
    const res = spawnSync('node', [validatorScript, tmpDir], { encoding: 'utf-8' });
    assert.strictEqual(res.status, 0, `Legacy manifest should pass validation. Output: ${res.stderr || res.stdout}`);
    console.log('✔ Legacy manifest backward compatibility test passed');
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

console.log('All validate-manifest unit tests passed successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
