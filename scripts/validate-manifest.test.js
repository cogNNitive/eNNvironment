#!/usr/bin/env node
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const validatorScript = path.join(__dirname, 'validate-manifest.js');

function createTempManifestDir(manifestContent) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eNNvironment-test-'));
  const docsUseDir = path.join(tmpDir, 'docs', 'use');
  fs.mkdirSync(docsUseDir, { recursive: true });
  fs.writeFileSync(path.join(docsUseDir, 'manifest.md'), manifestContent, 'utf-8');
  return tmpDir;
}

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

console.log('All validate-manifest unit tests passed successfully!');
