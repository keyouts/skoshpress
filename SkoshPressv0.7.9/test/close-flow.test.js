'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const nativeRequire=createRequire(path.join(root,'main.js'));
async function windowHarness(answer){
  const app=new EventEmitter();
  app.whenReady=()=>Promise.resolve(); app.getPath=()=>'/tmp';app.setAppUserModelId=()=>{};app.isPackaged=false;app.getVersion=()=> '0.6.0';
  const ipcMain=new EventEmitter();ipcMain.handle=(name,fn)=>ipcMain[name]=fn;
  const dialogs=[];const outbound=[];
  const dialog={showMessageBox:async(_win,options)=>{dialogs.push(options);return {response:answer};}};
  const Menu={setApplicationMenu(){},buildFromTemplate(list){return list;}};
  const protocol={registerSchemesAsPrivileged(){},handle(){}};
  const session={defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(){}}}};
  let win;
  class BrowserWindow extends EventEmitter{
    constructor(){super();this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.send=(...args)=>outbound.push(args);this.webContents.setWindowOpenHandler=()=>{};this.destroyed=false;win=this;}
    loadFile(){} loadURL(){} isDestroyed(){return this.destroyed;}
    close(){const e={preventDefault(){this.prevented=true;},prevented:false};this.emit('close',e);if(!e.prevented){this.destroyed=true;this.emit('closed');}}
    static getAllWindows(){return win&&!win.isDestroyed()?[win]:[];}
  }
  const requireMock=(name)=>name==='electron'?{app,BrowserWindow,ipcMain,dialog,Menu,session,protocol}:nativeRequire(name);
  vm.runInNewContext(fs.readFileSync(path.join(root,'main.js'),'utf8'),{require:requireMock,__dirname:root,process,Buffer,console,setTimeout,clearTimeout});
  for(let i=0;i<35&&!win;i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(win,'main process should create a desktop window');
  const event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
  return {win,ipcMain,dialogs,outbound,event,markDirty:(x)=>ipcMain.emit('window:dirty-state',event,x)};
}
const next=()=>new Promise(resolve=>setImmediate(resolve));
async function waitClosed(win){for(let i=0;i<60&&!win.isDestroyed();i++)await new Promise(resolve=>setTimeout(resolve,5));return win.isDestroyed();}
test('clean publication closes without a confirmation dialog',async()=>{
 const h=await windowHarness(2);h.win.close();assert.equal(await waitClosed(h.win),true);assert.equal(h.dialogs.length,0);
});
test('unsaved edits: Cancel keeps publication open',async()=>{
 const h=await windowHarness(2);h.markDirty(true);h.win.close();await next();assert.equal(h.win.isDestroyed(),false);assert.equal(h.dialogs.length,1);assert.deepEqual(Array.from(h.dialogs[0].buttons),['Save','Discard changes','Cancel']);
});
test('unsaved edits: Discard is explicit and closes',async()=>{
 const h=await windowHarness(1);h.markDirty(true);h.win.close();assert.equal(await waitClosed(h.win),true);
});
test('unsaved edits: Save canceled, failed, or still-dirty never closes',async()=>{
 for(const saved of [false,true]){
  const h=await windowHarness(0);h.markDirty(true);h.win.close();await next();
  const [action,token]=h.outbound.find(x=>x[0]==='window:save-before-close');
  assert.equal(action,'window:save-before-close');
  h.ipcMain.emit('window:save-before-close-result',h.event,token,saved);
  assert.equal(h.win.isDestroyed(),false);
 }
});
test('unsaved edits: successful save is required before close',async()=>{
 const h=await windowHarness(0);h.markDirty(true);h.win.close();await next();
 const [,token]=h.outbound.find(x=>x[0]==='window:save-before-close');
 h.markDirty(false);
 h.ipcMain.emit('window:save-before-close-result',h.event,token,true);
 assert.equal(h.win.isDestroyed(),true);
});
