'use strict';
// Dependency Verification
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const versions = {
  'node_modules/fast-uri': '3.1.9',
  'node_modules/undici': '7.30.1',
  'node_modules/node-gyp/node_modules/undici': '6.29.1'
};

test('patched transitive dependencies are pinned to compatible secured releases', () => {
  assert.deepEqual(pkg.overrides, {
    'fast-uri': '3.1.9',
    '@electron/get': { undici: '7.30.1' },
    'node-gyp': { undici: '6.29.1' }
  });
  assert.deepEqual(lock.packages[''].overrides, pkg.overrides);
  for (const [name, version] of Object.entries(versions)) {
    assert.equal(lock.packages[name].version, version, name);
    assert.equal(lock.packages[name].dev, true, `${name} must be development-only`);
  }
  assert.equal(lock.packages['node_modules/node-gyp'].dependencies.undici, '^6.25.0');
  assert.equal(lock.packages['node_modules/@electron/get'].optionalDependencies.undici, '^7.24.4');
});

test('installer toolchain is not automatically downgraded to clear an audit warning', () => {
  assert.equal(pkg.devDependencies['electron-builder'], '26.15.7');
  assert.equal(lock.packages['node_modules/electron-builder'].version, '26.15.7');
  assert.equal(pkg.build.nsis.createDesktopShortcut, true);
  assert.equal(pkg.build.nsis.createStartMenuShortcut, true);
  assert.equal(pkg.overrides.minimatch, undefined);
  assert.ok(Object.entries(lock.packages)
    .filter(([name]) => name.endsWith('/minimatch'))
    .every(([, entry]) => entry.dev === true));
});

test('runtime dependency audit is distinct from development toolchain audit', () => {
  assert.equal(pkg.scripts['audit:runtime'], 'npm audit --omit=dev --audit-level=low');
  assert.equal(pkg.scripts['audit:dependencies'], 'npm audit --package-lock-only --audit-level=low');
  assert.equal(pkg.devDependencies.electron, '45.2.1');
});
