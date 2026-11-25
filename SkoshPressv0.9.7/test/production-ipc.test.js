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
 let pick=null,win,printed;
 const dialog={showOpenDialog:async()=>pick?{canceled:false,filePaths:[pick]}:{canceled:true,filePaths:[]},
  showMessageBox:async()=>({response:0}),
  showSaveDialog:async()=>({canceled:false,filePath:path.join(folder,'restored.skoshpress')})};
 class BrowserWindow extends EventEmitter{
  constructor(options){super();this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};this.webContents.printToPDF=async options=>{printed=options;return Buffer.from('%PDF-1.7\n');};if(options.show!==false)win=this;}
  loadFile(){}loadURL(){}destroy(){}isDestroyed(){return false;}static getAllWindows(){return win?[win]:[];}
 }
 const native={app,BrowserWindow,ipcMain,dialog,Menu,session,protocol};
 vm.runInNewContext(await fs.readFile(path.join(root,'main.js'),'utf8'),{__dirname:root,require:name=>name==='electron'?native:nativeRequire(name),process,Buffer,console,setTimeout,clearTimeout});
 for(let i=0;i<30&&!win;i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(win);
 const event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
 return {event,ipcMain,select:file=>{pick=file;},printed:()=>printed};
}
test('native printer profiles persist with validated IDs and cannot specify storage paths',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-ipc-'));
 try{
  const h=await testFixture(folder);
  assert.equal((await h.ipcMain['printer:profiles:list'](h.event)).length,0);
  const record=await h.ipcMain['printer:profiles:save'](h.event,{...defaults,name:'Office A4',bleed:3,cropMarks:true,signaturePages:16,paperWeight:120,path:'/tmp/arbitrary.txt'},null);
  assert.match(record.id,/^[a-f0-9-]{36}$/);
  const rows=await h.ipcMain['printer:profiles:list'](h.event);
  assert.equal(rows[0].name,'Office A4');assert.equal(rows[0].path,undefined);assert.equal(rows[0].bleed,3);assert.equal(rows[0].cropMarks,true);assert.equal(rows[0].signaturePages,16);assert.equal(rows[0].paperWeight,120);
  assert.equal(JSON.parse(await fs.readFile(path.join(folder,'printer-profiles.json'),'utf8')).profiles.length,1);
  await assert.rejects(h.ipcMain['printer:profiles:save'](h.event,defaults,'../escape'),/Invalid printer profile ID/);
  await assert.rejects(h.ipcMain['printer:profiles:save'](h.event,{...defaults,copies:1e7},record.id),/Copies/);
  await assert.rejects(h.ipcMain['printer:profiles:save'](h.event,{...defaults,signaturePages:7},record.id),/Invalid production settings/);
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

test('publication package requires the trusted sender and native destination',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-package-'));
 try{
  const h=await testFixture(folder),doc={format:'skosh-press-1',name:'Archive',paper:{width:148,height:210,margin:16},pages:[{id:'p',frames:[]}]};
  await assert.rejects(h.ipcMain['export:package']({sender:{},senderFrame:{}},doc),/Request rejected/);
  await assert.rejects(h.ipcMain['export:package'](h.event,{}),/invalid Skosh Press/);
  const result=await h.ipcMain['export:package'](h.event,doc);
  assert.equal(result.path,path.join(folder,'restored.skoshpress.zip'));
  const buffer=await fs.readFile(result.path);assert.equal(buffer.readUInt32LE(0),0x04034b50);
  assert.equal(JSON.parse(require('../lib/docx').unzipEntry(buffer,'publication.skoshpress')).name,'Archive');
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('native Open verifies publication ZIP files and Save never replaces the archive',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-open-package-'));
 try{
  const doc={format:'skosh-press-1',name:'Archive',paper:{width:148,height:210,margin:16},pages:[{id:'p',frames:[]}]};
  const h=await testFixture(folder),file=path.join(folder,'source.zip'),{buffer}=require('../lib/publication-package').buildPackage(doc);
  await fs.writeFile(file,buffer);h.select(file);
  await assert.rejects(h.ipcMain['project:open']({sender:{},senderFrame:{}}),/Request rejected/);
  const opened=await h.ipcMain['project:open'](h.event);assert.equal(opened.project.name,'Archive');assert.equal(opened.migrated,true);assert.equal(opened.path,null);
  const saved=await h.ipcMain['project:save'](h.event,{document:opened.project,saveAs:false});assert.equal(saved.path,path.join(folder,'restored.skoshpress'));assert.deepEqual(await fs.readFile(file),buffer);
  const bad=path.join(folder,'bad.zip');await fs.writeFile(bad,buffer.subarray(0,-1));h.select(bad);await assert.rejects(h.ipcMain['project:open'](h.event),/archive/);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('native compact Save and Open retain their storage mode and allow ordinary Save As',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-compact-ipc-'));
 try{const h=await testFixture(folder),doc={format:'skosh-press-1',name:'Archive',paper:{width:148,height:210,margin:16},pages:[{id:'p',frames:[]}]};
  const saved=await h.ipcMain['project:save'](h.event,{document:doc,saveAs:true,compact:true});assert.equal(saved.path,path.join(folder,'restored.skoshcompact'));
  assert.equal(JSON.parse(await fs.readFile(saved.path,'utf8')).format,'skosh-compact-1');h.select(saved.path);
  const opened=await h.ipcMain['project:open'](h.event);assert.equal(opened.migrated,false);assert.equal(opened.path,saved.path);
  opened.project.name='Edited';assert.equal((await h.ipcMain['project:save'](h.event,{document:opened.project,saveAs:false})).path,saved.path);
  const ordinary=await h.ipcMain['project:save'](h.event,{document:opened.project,saveAs:true});assert.equal(ordinary.path,path.join(folder,'restored.skoshpress'));assert.equal(JSON.parse(await fs.readFile(ordinary.path,'utf8')).format,'skosh-press-1');
  h.select(saved.path);const baseline=await h.ipcMain['revision:chooseBaseline'](h.event);assert.equal(baseline.document.name,'Edited');
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('native reusable assets require the trusted sender and expose no arbitrary file paths',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-assets-ipc-'));
 try{const h=await testFixture(folder),image={kind:'image',name:'Portrait',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII='};
  const outside={sender:{},senderFrame:{}};for(const [channel,args] of [['list',[]],['save',[image]],['load',['bad']],['remove',['bad']]])await assert.rejects(async()=>h.ipcMain['asset:library:'+channel](outside,...args),/Request rejected/);
  const saved=await h.ipcMain['asset:library:save'](h.event,image);assert.equal((await h.ipcMain['asset:library:list'](h.event)).length,1);
  assert.equal((await h.ipcMain['asset:library:load'](h.event,saved.id)).src,image.src);await h.ipcMain['asset:library:remove'](h.event,saved.id);assert.equal((await h.ipcMain['asset:library:list'](h.event)).length,0);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('native PDF requests use inches and explicit zero margins',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-print-ipc-'));
 try{const h=await testFixture(folder);const result=await h.ipcMain['export:pdf'](h.event,{html:'<p>Proof</p>',widthMm:330,heightMm:250});
  const options=h.printed();assert.equal(options.pageSize.width,330/25.4);assert.equal(options.pageSize.height,250/25.4);
  assert.deepEqual({...options.margins},{top:0,bottom:0,left:0,right:0});assert.equal(options.preferCSSPageSize,true);assert.equal(result.bytes,9);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('failed recovery cleanup cannot retarget an open project or mask a completed save',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-recovery-path-'));
 try{const h=await testFixture(folder),doc={format:'skosh-press-1',name:'Original',paper:{width:148,height:210,margin:16},pages:[{id:'p',frames:[]}]};
  const original=path.join(folder,'original.skoshpress'),other=path.join(folder,'other.skoshpress');
  await fs.writeFile(original,JSON.stringify(doc));await fs.writeFile(other,JSON.stringify({...doc,name:'Other'}));h.select(original);await h.ipcMain['project:open'](h.event);
  await fs.writeFile(path.join(folder,'recovery'),'unavailable');h.select(other);
  await assert.rejects(h.ipcMain['project:open'](h.event),/Recovery directory/);
  const saved=await h.ipcMain['project:save'](h.event,{document:{...doc,name:'Edited'},saveAs:false});
  assert.equal(saved.path,original);assert.match(saved.recoveryWarning,/Publication saved/);assert.equal(JSON.parse(await fs.readFile(original)).name,'Edited');assert.equal(JSON.parse(await fs.readFile(other)).name,'Other');
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('concurrent printer profile saves preserve both records',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-profile-race-'));
 try{const h=await testFixture(folder);await Promise.all(['One','Two'].map(name=>h.ipcMain['printer:profiles:save'](h.event,{...defaults,name},null)));
  assert.deepEqual(Array.from(await h.ipcMain['printer:profiles:list'](h.event),p=>p.name).sort(),['One','Two']);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('private template and dictionary storage rejects redirected directories',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-private-path-'));
 try{const h=await testFixture(folder),outside=path.join(folder,'outside');await fs.mkdir(outside);await fs.rm(path.join(folder,'Dictionaries'),{recursive:true,force:true});
  try{await fs.symlink(outside,path.join(folder,'templates'),'junction');await fs.symlink(outside,path.join(folder,'Dictionaries'),'junction');}catch(error){if(error.code==='EPERM'){t.skip('Symlink permission unavailable');return;}throw error;}
  await assert.rejects(h.ipcMain['template:list'](h.event),/Private storage directory/);await assert.rejects(h.ipcMain['dictionary:list'](h.event),/Private storage directory/);assert.deepEqual(await fs.readdir(outside),[]);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('older printer profiles retain production settings and discard rates',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-prices-'));
 try{
  const id='11111111-1111-4111-8111-111111111111';
  const old=defaults;
  await fs.writeFile(path.join(folder,'printer-profiles.json'),JSON.stringify({version:1,profiles:[{...old,id,bleed:4,paperPerSheet:.08,inkPerSide:.035,staplesPerCopy:.025}]}));
  const h=await testFixture(folder);
  const [row]=await h.ipcMain['printer:profiles:list'](h.event);
  assert.equal(row.bleed,4);for(const key of ['paperPerSheet','inkPerSide','staplesPerCopy','pricingVersion'])assert.equal(key in row,false);
  await h.ipcMain['printer:profiles:save'](h.event,{...row,paperPerSheet:.08,inkPerSide:0},id);
  const [saved]=await h.ipcMain['printer:profiles:list'](h.event);
  assert.equal(saved.bleed,4);for(const key of ['paperPerSheet','inkPerSide','staplesPerCopy','pricingVersion'])assert.equal(key in saved,false);
 }finally{await fs.rm(folder,{force:true,recursive:true});}
});
