'use strict';
// Genealogy Interface
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const nativeRequire=createRequire(path.join(root,'main.js'));
async function testFixture(folder){
 const app=new EventEmitter();app.whenReady=()=>Promise.resolve();app.getPath=()=>folder;app.getVersion=()=> '0.7.6';app.isPackaged=false;app.setAppUserModelId=()=>{};
 const ipcMain={};ipcMain.handle=(name,fn)=>{ipcMain[name]=fn;};ipcMain.on=()=>{};
 const session={defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(){}}}};
 const Menu={setApplicationMenu(){},buildFromTemplate:x=>x};
 const protocol={registerSchemesAsPrivileged(){},handle(){}};
 let pick=null,folderPick=null,win;
 const dialog={showOpenDialog:async (...args)=>{const options=args.at(-1);const selected=(options.properties||[]).includes('openDirectory')?folderPick:pick;return selected?{canceled:false,filePaths:[selected]}:{canceled:true,filePaths:[]};},
  showMessageBox:async()=>({response:0}),
  showSaveDialog:async()=>({canceled:false,filePath:path.join(folder,'report.csv')})};
 class BrowserWindow extends EventEmitter {
  constructor(){super();this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};win=this;}
  loadURL(){}isDestroyed(){return false;}static getAllWindows(){return win?[win]:[];}
 }
 const native={app,BrowserWindow,ipcMain,dialog,Menu,session,protocol};
 vm.runInNewContext(await fs.readFile(path.join(root,'main.js'),'utf8'),{__dirname:root,require:name=>name==='electron'?native:nativeRequire(name),process,Buffer,console,setTimeout,clearTimeout});
 for(let i=0;i<30&&!win;i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(win);
 const event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
 return {event,ipcMain,select:file=>{pick=file;},selectFolder:folder=>{folderPick=folder;}};
}
test('native genealogy route imports locally, generates manuscript and exports CSV',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-gedcom-'));
 try{
  const h=await testFixture(folder);
  const outsider={sender:{},senderFrame:{}};
  await assert.rejects(h.ipcMain['genealogy:publication'](h.event,{mode:'register'}),/Import a GEDCOM/);
  await assert.rejects(h.ipcMain['genealogy:exportCsv'](h.event,{type:'people'}),/Import a GEDCOM/);
  await assert.rejects(h.ipcMain['genealogy:import'](outsider),/Request rejected/);
  h.select(path.join(root,'test/fixtures/fictional-family.ged'));
  const info=await h.ipcMain['genealogy:import'](h.event);
  assert.ok(info.stats.people>0);
  assert.equal(info.version,'5.5.1');
  assert.equal(Object.hasOwn(info,'text'),false);
  assert.equal(Object.hasOwn(info,'tree'),false);
  const report=await h.ipcMain['genealogy:publication'](h.event,{mode:'register',limit:2,protectLiving:true});
  assert.match(report.html,/<h1>/);
  assert.ok(report.count>0);
  await assert.rejects(h.ipcMain['genealogy:publication'](h.event,{mode:'register',limit:201}),/between 1 and 200/);
  await assert.rejects(h.ipcMain['genealogy:publication'](outsider,{mode:'register'}),/Request rejected/);
  await assert.rejects(h.ipcMain['genealogy:publication'](h.event,{title:{name:'invalid'}}),/Invalid genealogy option/);
  const csv=await h.ipcMain['genealogy:exportCsv'](h.event,{type:'people',protectLiving:true});
  assert.equal(csv.type,'people');
  assert.ok(csv.count>0);
  assert.match(await fs.readFile(csv.path,'utf8'),/^\uFEFF"record_id",/);
  await assert.rejects(h.ipcMain['genealogy:exportCsv'](outsider,{type:'people'}),/Request rejected/);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});

// Batch Verification
function sampleProject(html,title='Generated research volume'){
 return {format:'skosh-press-1',version:4,name:title.slice(0,100),
  paper:{preset:'a5',width:148,height:210,margin:16,columns:1,gutter:5},
  pages:[{id:'page-1',frames:[{id:'frame-1',label:'Genealogy record',type:'text',
    x:16,y:16,w:116,h:178,html,style:{font:'Georgia, serif',fontSize:10,leading:1.45}}]}],
  stories:{},fonts:[]};
}
test('batch IPC generates multiple projects and verified non-overlapping ranges without overwriting the current project',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-gedcom-batch-'));
 try{
  const h=await testFixture(folder);
  h.select(path.join(root,'test/fixtures/fictional-family.ged'));
  const info=await h.ipcMain['genealogy:import'](h.event);
  h.selectFolder(folder);
  const first=await h.ipcMain['genealogy:batch:begin'](h.event,{title:'Fictional Research',mode:'register',protectLiving:true,volumeSize:1});
  assert.equal(first.volumeCount,info.stats.people);
  assert.ok(first.volumeCount>1);
  assert.ok(!('folderPath' in first));
  const outsider={sender:{},senderFrame:{}};
  await assert.rejects(h.ipcMain['genealogy:batch:commit'](outsider,first.id,1,sampleProject('<p>unsafe</p>')),/Request rejected/);
  await assert.rejects(h.ipcMain['genealogy:import'](h.event),/Finish or cancel batch/);
  const pages=[];
  for(let i=1;i<=first.volumeCount;i++){
   const page=await h.ipcMain['genealogy:batch:next'](h.event,first.id);
   assert.equal(page.number,i);
   assert.equal(page.end-page.start,1);
   assert.match(page.html,/GEDCOM/);
   const result=await h.ipcMain['genealogy:batch:commit'](h.event,first.id,i,sampleProject(page.html,page.title));
   pages.push(result);
   if(i<first.volumeCount)assert.equal(result.complete,false);
  }
  const finished=pages.at(-1);
  assert.equal(finished.complete,true);
  const files=await fs.readdir(finished.folder);
  assert.ok(files.includes('publication-manifest.json'));
  assert.equal(files.filter(name=>name.endsWith('.skoshpress')).length,first.volumeCount);
  const manifest=JSON.parse(await fs.readFile(path.join(finished.folder,'publication-manifest.json'),'utf8'));
  assert.equal(manifest.totalEntries,first.total);
  assert.equal(manifest.volumes.reduce((count,v)=>count+v.entries,0),first.total);
  assert.deepEqual(manifest.volumes.flatMap(v=>Array.from({length:v.entries},(_,i)=>v.firstEntry+i)),
    Array.from({length:first.total},(_,i)=>i+1));
  for(const entry of manifest.volumes){
   const content=await fs.readFile(path.join(finished.folder,entry.file),'utf8');
   assert.equal(require('node:crypto').createHash('sha256').update(content).digest('hex'),entry.sha256);
   assert.equal(JSON.parse(content).format,'skosh-press-1');
  }
  assert.ok(!files.some(name=>name.endsWith('.ged')));
  assert.throws(()=>h.ipcMain['genealogy:batch:next'](h.event,first.id),/no longer active/);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('batch can be cancelled; partial volumes are not published',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-gedcom-abort-'));
 try{
  const h=await testFixture(folder);
  h.select(path.join(root,'test/fixtures/fictional-family.ged'));
  await h.ipcMain['genealogy:import'](h.event);
  h.selectFolder(folder);
  const begun=await h.ipcMain['genealogy:batch:begin'](h.event,{title:'Cancel case',mode:'register',volumeSize:1});
  const page=await h.ipcMain['genealogy:batch:next'](h.event,begun.id);
  const saved=await h.ipcMain['genealogy:batch:commit'](h.event,begun.id,1,sampleProject(page.html));
  assert.equal(saved.complete,false);
  assert.equal((await h.ipcMain['genealogy:batch:cancel'](h.event,begun.id)).cancelled,true);
  assert.ok(!(await fs.readdir(folder)).some(name=>/^(?:\.skosh-batch-|Cancel case-Volumes-)/.test(name)));
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
