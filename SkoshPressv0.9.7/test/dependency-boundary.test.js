'use strict';
// Dependency Verification
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('installer dependency boundary verification remains available', () => {
  assert.equal(pkg.scripts['verify:dependency-boundary'], 'node scripts/verify-dependency-boundary.js');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'verify-dependency-boundary.js')], {
    encoding: 'utf8', cwd: root
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Development-only boundary verified/);
  assert.match(result.stdout, /Vulnerability remediation is NOT verified/);
});
