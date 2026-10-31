'use strict';
// Native Boundary
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const vm=require('node:vm'),{EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const {defaults}=require('../lib/print-lab');
const root=path.resolve(__dirname,'..'),nativeRequire=createRequire(path.join(root,'main.js'));
async function testFixture(folder){
 const app=new EventEmitter();app.whenReady=()=>Promise.resolve();app.getPath=()=>folder;app.getVersion=()=> '0.7.0';app.isPackaged=false;app.setAppUserModelId=()=>{};
 const ipcMain={};ipcMain.handle=(name,fn)=>{ipcMain[name]=fn;};ipcMain.on=()=>{};
 const session={defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(){}}}};
 const Menu={setApplicationMenu(){},buildFromTemplate:x=>x};
 const protocol={registerSchemesAsPrivileged(){},handle(){}};
 let pick=null,win;
 const dialog={showOpenDialog:async()=>pick?{canceled:false,filePaths:[pick]}:{canceled:true,filePaths:[]},
  showMessageBox:async()=>({response:0}),
  showSaveDialog:async()=>({canceled:false,filePath:path.join(folder,'restored.skoshpress')})};
 class BrowserWindow extends EventEmitter{
  constructor(){super();this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};win=this;}
  loadFile(){}loadURL(){}isDestroyed(){return false;}static getAllWindows(){return win?[win]:[];}
 }
 const native={app,BrowserWindow,ipcMain,dialog,Menu,session,protocol};
 vm.runInNewContext(await fs.readFile(path.join(root,'main.js'),'utf8'),{__dirname:root,require:name=>name==='electron'?native:nativeRequire(name),process,Buffer,console,setTimeout,clearTimeout});
 for(let i=0;i<30&&!win;i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(win);
 const event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
 return {event,ipcMain,select:file=>{pick=file;}};
}
test('native printer profiles persist with validated IDs and cannot specify storage paths',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-ipc-'));
 try{
  const h=await testFixture(folder);
  assert.equal((await h.ipcMain['printer:profiles:list'](h.event)).length,0);
  const record=await h.ipcMain['printer:profiles:save'](h.event,{...defaults,name:'Office A4',path:'/tmp/arbitrary.txt'},null);
  assert.match(record.id,/^[a-f0-9-]{36}$/);
  const rows=await h.ipcMain['printer:profiles:list'](h.event);
  assert.equal(rows[0].name,'Office A4');assert.equal(rows[0].path,undefined);
  assert.equal(JSON.parse(await fs.readFile(path.join(folder,'printer-profiles.json'),'utf8')).profiles.length,1);
  await assert.rejects(h.ipcMain['printer:profiles:save'](h.event,defaults,'../escape'),/Invalid printer profile ID/);
  await assert.rejects(h.ipcMain['printer:profiles:save'](h.event,{...defaults,copies:1e7},record.id),/Copies/);
  await h.ipcMain['printer:profiles:delete'](h.event,record.id);
  assert.equal((await h.ipcMain['printer:profiles:list'](h.event)).length,0);
 }finally{await fs.rm(folder,{force:true,recursive:true});}
});
test('revision baseline chooses project through native picker without changing file contents',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-revisions-'));
 try{
  const file=path.join(folder,'older.skoshpress');
  const doc={format:'skosh-press-1',name:'First edition',paper:{width:148,height:210,margin:16,preset:'a5'},pages:[{id:'page',frames:[]}],fonts:[],stories:{}};
  const raw=JSON.stringify(doc);await fs.writeFile(file,raw);
  const h=await testFixture(folder);h.select(file);
  const report=await h.ipcMain['revision:chooseBaseline'](h.event);
  assert.equal(report.name,'older.skoshpress');assert.equal(report.document.pages.length,1);
  assert.equal(await fs.readFile(file,'utf8'),raw);
  const outsider={sender:{},senderFrame:{}};
  await assert.rejects(h.ipcMain['revision:chooseBaseline'](outsider),/Request rejected/);
 }finally{await fs.rm(folder,{force:true,recursive:true});}
});

test('unsaved recovery persists through restart and saves to a newly selected path',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-recovery-ipc-'));
 try{
  const doc={format:'skosh-press-1',name:'Draft in progress',paper:{width:148,height:210,margin:16,preset:'a5'},pages:[{id:'p',frames:[]}],fonts:[],stories:{}};
  const h=await testFixture(folder);
  const original=path.join(folder,'original.skoshpress');
  const bytes=JSON.stringify(doc);await fs.writeFile(original,bytes);
  assert.equal((await h.ipcMain['recovery:snapshot'](h.event,doc)).saved,true);
  const outsider={sender:{},senderFrame:{}};
  await assert.rejects(h.ipcMain['recovery:snapshot'](outsider,doc),/Request rejected/);
  const restarted=await testFixture(folder);
  const restored=await restarted.ipcMain['recovery:startup'](restarted.event);
  assert.equal(restored.document.name,'Draft in progress');
  assert.equal(restored.document.pages.length,1);
  assert.equal(await fs.readFile(original,'utf8'),bytes);
  const saved=await restarted.ipcMain['project:save'](restarted.event,{document:restored.document,saveAs:false});
  assert.equal(saved.path,path.join(folder,'restored.skoshpress'));
  assert.equal(await fs.readFile(original,'utf8'),bytes);
  const final=await testFixture(folder);
  assert.equal(await final.ipcMain['recovery:startup'](final.event),null);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
