'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('npm run build targets a dedicated Windows NSIS installer',()=>{const p=JSON.parse(read('package.json'));assert.equal(p.scripts.build,'electron-builder --win nsis');assert.equal(p.build.win.target,'nsis');assert.match(p.build.win.artifactName,/Setup/);assert.equal(p.author,'KeyOuts');assert.equal(p.build.nsis.oneClick,false);});
test('Electron uses an isolated sandbox and restricts render-to-native access',()=>{const main=read('main.js'),bridge=read('preload.js');for(const rule of ['contextIsolation:true','nodeIntegration:false','sandbox:true','webSecurity:true','will-navigate','will-attach-webview','setPermissionRequestHandler','assertSender'])assert.ok(main.includes(rule),rule);assert.ok(bridge.includes('contextBridge.exposeInMainWorld'));assert.ok(!bridge.includes('require("fs")'));});
test('application ships no external service integration packages or service endpoints',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.deepEqual(pkg.dependencies||{},{});
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(),['electron','electron-builder']);
  for(const name of ['main.js','preload.js','src/app.js','src/index.html','src/styles.css']){
    const content=read(name);
    assert.doesNotMatch(content,/https?:\/\/[^\s]*\/(?:v1|api)\//i);
  }
});
test('dictionary import and native interchange requests use the trusted file dialogs',()=>{const main=read('main.js');assert.match(main,/ipcMain.handle\('dictionary:import'/);assert.match(main,/ipcMain.handle\('dictionary:words'/);assert.match(main,/ipcMain.handle\('export:interchange'/);assert.match(main,/toScribusSla\(document\)/);assert.match(main,/assertSender\(event\)/);});
