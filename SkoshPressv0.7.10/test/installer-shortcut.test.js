'use strict';
// Installer Verification
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('Windows installer creates a desktop shortcut using the application name', () => {
  assert.equal(pkg.build.win.target, 'nsis');
  assert.match(pkg.scripts['build:win'], /electron-builder --win nsis/);
  assert.equal(pkg.build.nsis.createDesktopShortcut, true);
  assert.equal(pkg.build.nsis.createStartMenuShortcut, true);
  assert.equal(pkg.build.nsis.shortcutName, pkg.productName);
  assert.equal(pkg.build.nsis.oneClick, false);
});

test('Windows installer uses a valid multi-resolution application icon', () => {
  const iconPath = path.resolve(root, pkg.build.win.icon);
  assert.ok(iconPath.startsWith(root + path.sep));
  const data = fs.readFileSync(iconPath);
  assert.ok(data.length > 22);
  assert.equal(data.readUInt16LE(0), 0);
  assert.equal(data.readUInt16LE(2), 1);
  const count = data.readUInt16LE(4);
  assert.ok(count > 0 && count <= 256);
  assert.ok(data.length >= 6 + count * 16);
  const sizes = new Set();
  for (let i = 0; i < count; i++) {
    const offset = 6 + i * 16;
    const width = data[offset] || 256;
    const height = data[offset + 1] || 256;
    assert.equal(width, height);
    sizes.add(width);
    const imageSize = data.readUInt32LE(offset + 8);
    const imageOffset = data.readUInt32LE(offset + 12);
    assert.ok(imageSize > 0);
    assert.ok(imageOffset >= 6 + count * 16);
    assert.ok(imageOffset + imageSize <= data.length);
  }
  for (const size of [16, 32, 48, 256]) assert.ok(sizes.has(size), `missing ${size}x${size} image`);
});

test('Windows shortcut verification script is included for a post-install check', () => {
  const command = pkg.scripts['verify:win-shortcut'];
  assert.match(command, /powershell\.exe .*scripts\/verify-windows-shortcut\.ps1/);
  const script = fs.readFileSync(path.join(root, 'scripts', 'verify-windows-shortcut.ps1'), 'utf8');
  assert.match(script, /DesktopDirectory/);
  assert.match(script, /CommonDesktopDirectory/);
  assert.match(script, /TargetPath/);
});
