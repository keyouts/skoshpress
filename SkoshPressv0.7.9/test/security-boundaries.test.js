'use strict';
// Resource Tests
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {APP_CSP,APP_CSP_HEADER,PRINT_CSP,resourcePath,responseHeaders}=require('../lib/security');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('only explicitly packaged editor resources can be opened by the custom scheme',()=>{
  for(const url of ['skosh://app/src/index.html','skosh://app/src/styles.css','skosh://app/src/app.js','skosh://app/assets/icon-32.png','skosh://app/lib/units.js']) {
    const resource=resourcePath(root,url);
    assert.ok(resource,url);
    assert.ok(resource.target.startsWith(root+path.sep));
    assert.ok(fs.statSync(resource.target).isFile());
  }
  for(const url of [
    'file:///etc/passwd','https://app/src/index.html','skosh://other/src/index.html',
    'skosh://app/main.js','skosh://app/assets/SkoshPressIcon.png','skosh://app/assets/icon.ico','skosh://app/assets/skosh-press.svg','skosh://app/package.json','skosh://app/SECURITY.md',
    'skosh://app/test/security-config.test.js','skosh://app/src/../main.js',
    'skosh://app/src/%2e%2e/main.js','skosh://app/src/%2fmain.js',
    'skosh://app/src/index.html?foo=bar','skosh://app/src/index.html#x'
  ])assert.equal(resourcePath(root,url),null,url);
});
test('editor content policy has no inline scripts, inline styles, network or embed permissions',()=>{
  assert.match(APP_CSP,/default-src 'none'/);
  assert.match(APP_CSP,/script-src 'self'/);
  assert.match(APP_CSP,/style-src 'self'/);
  assert.match(APP_CSP,/style-src-attr 'none'/);
  assert.match(APP_CSP,/connect-src 'none'/);
  assert.match(APP_CSP,/object-src 'none'/);
  assert.doesNotMatch(APP_CSP,/unsafe-inline|unsafe-eval/);
  const source=read('src/index.html');
  assert.ok(source.includes(APP_CSP));
  assert.doesNotMatch(source,/<script(?![^>]*src=)/i);
  assert.doesNotMatch(source,/<style\b/i);
  assert.doesNotMatch(source,/\sstyle\s*=/i);
  assert.ok(read('src/app.js').includes('new FontFace('));
  assert.doesNotMatch(read('src/app.js'),/createElement\('style'\)/);
});
test('print policy disables scripts, networking and filesystem access',()=>{
  assert.match(PRINT_CSP,/script-src 'none'/);
  assert.match(PRINT_CSP,/connect-src 'none'/);
  assert.match(PRINT_CSP,/img-src data:/);
  assert.match(read('main.js'),/javascript:false/);
  assert.match(read('main.js'),/skosh-print:\/\/job\/index\.html/);
  assert.doesNotMatch(read('main.js'),/mkdtemp\(/);
});
test('custom scheme responses carry restrictive headers and MIME protections',()=>{
  const headers=responseHeaders('text/html; charset=utf-8',APP_CSP_HEADER);
  assert.equal(headers['x-content-type-options'],'nosniff');
  assert.equal(headers['content-security-policy'],APP_CSP_HEADER);
  assert.match(headers['content-security-policy'],/frame-ancestors 'none'/);
  assert.equal(headers['cross-origin-resource-policy'],'same-origin');
  assert.equal(headers['cache-control'],'no-store');
  assert.equal(headers['content-type'],'text/html; charset=utf-8');
});
test('installer keeps previously configured integrity fuses and sandbox settings',()=>{
  const pkg=JSON.parse(read('package.json'));
  for(const [name,value] of Object.entries({runAsNode:false,enableNodeOptionsEnvironmentVariable:false,enableNodeCliInspectArguments:false,enableEmbeddedAsarIntegrityValidation:true,onlyLoadAppFromAsar:true,grantFileProtocolExtraPrivileges:false})) {
    assert.equal(pkg.build.electronFuses[name],value,name);
  }
  assert.equal(pkg.scripts.build,'electron-builder --win nsis');
  for(const token of ['contextIsolation:true','nodeIntegration:false','sandbox:true','webSecurity:true','setWindowOpenHandler','will-navigate','will-redirect'])assert.ok(read('main.js').includes(token),token);
});
