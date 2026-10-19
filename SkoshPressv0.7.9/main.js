'use strict';
const {app, BrowserWindow, ipcMain, dialog, Menu, session, protocol} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {constants: fsConstants, mkdirSync} = require('node:fs');
const {parseDocx, plainTextToHtml} = require('./lib/docx');
const {importGedcomBuffer} = require('./lib/gedcom-file');
const {parse:parseGedcom} = require('./lib/gedcom');
const {publication:genealogyPublication,batchPlan:genealogyBatchPlan,exportCsv:genealogyExportCsv} = require('./lib/genealogy-records');
const {checkedFont} = require('./lib/fonts');
const {normalizeProject, MAX_PROJECT_BYTES} = require('./lib/projects');
const {toScribusSla,toIndesignRtf} = require('./lib/interchange');
const {toPlainText,toDocx,toEpub} = require('./lib/publishing-exports');
const {valid: validatePrinterProfile} = require('./lib/print-lab');
const {randomUUID,createHash} = require('node:crypto');
const {resourcePath,responseHeaders,APP_CSP_HEADER,PRINT_CSP,isReadRequest,safePrintMarkup,safeStandaloneHtml} = require('./lib/security');
const {createRecoveryStore} = require('./lib/recovery');

let mainWindow;
let currentPath = null;                                                                      
let hasUnsavedEdits = false;
let closingDialogOpen = false;
let closingAllowed = false;
let awaitingSaveToken = null;
let nextSaveToken = 0;
let printJob = null;
let recoveryStore;
let genealogySession = null;
let genealogyBatch = null;
protocol.registerSchemesAsPrivileged([
  {scheme:'skosh',privileges:{standard:true,secure:true,supportFetchAPI:true}},
  {scheme:'skosh-print',privileges:{standard:true,secure:true}}
]);

const MAX_IMPORT = 32*1024*1024;
const trustedSender = event => Boolean(mainWindow && !mainWindow.isDestroyed() &&
  event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame);
const assertSender = event => {if(!trustedSender(event))throw new Error('Request rejected: unexpected frame.');};
const menuAction = name => { if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:'+name); };
const silent = () => {};
// File Guards
async function regularFileInfo(filename, maxBytes, minimumBytes = 1) {
  const info = await fs.lstat(filename);
  if(!info.isFile() || info.isSymbolicLink() || info.size < minimumBytes || info.size > maxBytes)
    throw new Error('Selected file is not an allowed regular file.');
  return info;
}
// Security Boundaries
function configureSecurity() {
  protocol.handle('skosh',async request=>{
    if(!isReadRequest(request))return new Response('Method not allowed',{status:405,headers:responseHeaders('text/plain; charset=utf-8',APP_CSP_HEADER)});
    const resource=resourcePath(__dirname,request.url);
    if(!resource)return new Response('Not found',{status:404,headers:responseHeaders('text/plain; charset=utf-8',APP_CSP_HEADER)});
    try {
      const data=await fs.readFile(resource.target);
      return new Response(data,{status:200,headers:responseHeaders(resource.mime,APP_CSP_HEADER)});
    } catch {
      return new Response('Not found',{status:404,headers:responseHeaders('text/plain; charset=utf-8',APP_CSP_HEADER)});
    }
  });
  protocol.handle('skosh-print',request=>{
    if(!isReadRequest(request))return new Response('Method not allowed',{status:405,headers:responseHeaders('text/plain; charset=utf-8',PRINT_CSP)});
    if(request.url!=='skosh-print://job/index.html' || typeof printJob!=='string')
      return new Response('Not found',{status:404,headers:responseHeaders('text/plain; charset=utf-8',PRINT_CSP)});
    return new Response(printJob,{status:200,headers:responseHeaders('text/html; charset=utf-8',PRINT_CSP)});
  });
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.on?.('will-download',event=>event.preventDefault());
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*','ftp://*/*','file://*/*']},(_details,callback)=>callback({cancel:true}));
  app.on('certificate-error',(event,_webContents,_url,_error,_certificate,callback)=>{event.preventDefault();callback(false);});
  app.on('login',event=>event.preventDefault());
  app.on('web-contents-created', (_event, contents)=>{
    contents.setWindowOpenHandler(()=>({action:'deny'}));
    contents.on('will-navigate',event=>event.preventDefault());
    contents.on('will-redirect',event=>event.preventDefault());
    contents.on('will-attach-webview',event=>event.preventDefault());
  });
}
function registerMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'File',submenu:[
      {label:'New',accelerator:'CmdOrCtrl+N',click:()=>menuAction('new')},
      {label:'Open…',accelerator:'CmdOrCtrl+O',click:()=>menuAction('open')},
      {label:'Save',accelerator:'CmdOrCtrl+S',click:()=>menuAction('save')},
      {label:'Save As…',accelerator:'CmdOrCtrl+Shift+S',click:()=>menuAction('saveAs')},
      {type:'separator'},
      {label:'Import manuscript…',accelerator:'CmdOrCtrl+I',click:()=>menuAction('import')},
      {label:'Genealogy Studio…',click:()=>menuAction('genealogy')},
      {label:'Import font…',click:()=>menuAction('font')},
      {label:'Templates…',click:()=>menuAction('templates')},
      {label:'Revision impact checker…',click:()=>menuAction('revisions')},
      {label:'Print Studio and printer profiles…',click:()=>menuAction('printlab')},
      {label:'Export PDF…',accelerator:'CmdOrCtrl+Shift+E',click:()=>menuAction('export')},
      {label:'Export formats…',click:()=>menuAction('formats')},
      {label:'Export for Scribus (.sla)…',click:()=>menuAction('scribus')},
      {label:'Export editable manuscript for InDesign (.rtf)…',click:()=>menuAction('indesign')},
      {type:'separator'}, {role:process.platform==='darwin'?'close':'quit'}
    ]},
    {label:'Edit',submenu:[
      {label:'Undo',accelerator:'CmdOrCtrl+Z',click:()=>menuAction('undo')},
      {label:'Find & Replace…',accelerator:'CmdOrCtrl+F',click:()=>menuAction('find')},
      {label:'Redo',accelerator:'CmdOrCtrl+Shift+Z',click:()=>menuAction('redo')},
      {type:'separator'},{role:'copy'},{role:'paste'},{role:'cut'},{role:'selectAll'}
    ]},
    {label:'View',submenu:[
      {label:'Settings and accessibility…',accelerator:'CmdOrCtrl+,',click:()=>menuAction('settings')},
      {label:'Toggle dark mode',click:()=>menuAction('theme')},
      ...(app.isPackaged?[]:[{type:'separator'},{role:'reload'},{role:'toggleDevTools'}])
    ]},
    {label:'Help',submenu:[{label:'About Skosh Press',click:()=>dialog.showMessageBox(mainWindow,{type:'info',title:'About Skosh Press',message:'Skosh Press',detail:`Version ${app.getVersion()}\nCreated by KeyOuts\nA publishing application.`})}]}
  ]));
}
// Window Lifecycle
function createWindow() {
  currentPath = null;
  hasUnsavedEdits = false;
  closingAllowed = false;
  closingDialogOpen = false;
  awaitingSaveToken = null;
  mainWindow = new BrowserWindow({
    width:1530,height:960,minWidth:1020,minHeight:660,
    backgroundColor:'#e9e9e9',title:'Skosh Press',icon:path.join(__dirname,'assets','icon-256.png'),
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,webviewTag:false,spellcheck:true,allowRunningInsecureContent:false,navigateOnDragDrop:false,safeDialogs:true}
  });
  mainWindow.loadURL('skosh://app/src/index.html');


  mainWindow.on('close',event=>{
    if(closingAllowed)return;
    if(!hasUnsavedEdits){
      event.preventDefault();
      if(closingDialogOpen)return;
      closingDialogOpen=true;
      recoveryStore.clear().then(()=>{closingAllowed=true;if(!mainWindow.isDestroyed())mainWindow.close();})
        .catch(error=>{closingDialogOpen=false;console.error('Could not clear recovery:',error);});
      return;
    }
    event.preventDefault();
    if(closingDialogOpen || awaitingSaveToken!==null)return;
    closingDialogOpen = true;
    const win = mainWindow;
    dialog.showMessageBox(win,{
      type:'warning',title:'Unsaved changes — Skosh Press',
      message:'Save changes before closing?',
      detail:'Your publication has changes that have not been saved. Closing without saving will discard them.',
      buttons:['Save','Discard changes','Cancel'],defaultId:0,cancelId:2,noLink:true
    }).then(({response})=>{
      closingDialogOpen=false;
      if(win.isDestroyed() || win!==mainWindow)return;
      if(response===1){
        recoveryStore.clear().then(()=>{closingAllowed=true;win.close();})
          .catch(error=>console.error('Could not clear recovery:',error));
        return;
      }
      if(response===0){
        const token=++nextSaveToken;
        awaitingSaveToken=token;
        win.webContents.send('window:save-before-close',token);
      }
    }).catch(error=>{closingDialogOpen=false;console.error('Close confirmation failed:',error);});
  });
  mainWindow.on('closed',()=>{mainWindow=null;awaitingSaveToken=null;});
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    const items=[];
    if (params.misspelledWord) {
      for (const suggestion of (params.dictionarySuggestions||[]).slice(0,8))
        items.push({label:suggestion,click:()=>mainWindow.webContents.replaceMisspelling(suggestion)});
      if(!items.length)items.push({label:'No spelling suggestions',enabled:false});
      items.push({label:`Add “${params.misspelledWord.slice(0,60)}” to dictionary`,click:()=>session.defaultSession.addWordToSpellCheckerDictionary(params.misspelledWord)});
      items.push({type:'separator'});
    }
    items.push({role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'});
    Menu.buildFromTemplate(items).popup({window:mainWindow});
  });
}

async function installLocalSpellingDictionary() {
  if(process.platform==='darwin')return;
  const source=path.join(__dirname,'assets','dictionaries','en-US-10-1.bdic');
  const folder=path.join(app.getPath('userData'),'Dictionaries');
  const target=path.join(folder,'en-US-10-1.bdic');
  await fs.mkdir(folder,{recursive:true});
  try {await fs.copyFile(source,target,fsConstants.COPYFILE_EXCL);}
  catch(error){if(error.code!=='EEXIST')throw error;}
}
// Private Storage
if(typeof app.setPath==='function'){
  const genealogyUserData=path.join(app.getPath('appData'),'Skosh Press Genealogy');
  mkdirSync(genealogyUserData,{recursive:true});
  app.setPath('userData',genealogyUserData);
}
if(process.platform==='win32')app.setAppUserModelId('app.skoshpress.genealogy');
app.whenReady().then(async()=>{
  try {await installLocalSpellingDictionary();}catch(error){console.warn('Local spelling dictionary was unavailable:',error.message);}
  recoveryStore=createRecoveryStore(app.getPath('userData'));
  configureSecurity();registerMenu();createWindow();
  app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
}).catch(error=>{console.error(error);app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>{if(genealogyBatch?.stage){try{require('node:fs').rmSync(genealogyBatch.stage,{recursive:true,force:true});}catch(_error){}}});

ipcMain.on('window:dirty-state',(event,dirty)=>{
  if(!trustedSender(event))return;
  if(typeof dirty!=='boolean')return;
  hasUnsavedEdits=dirty;
});
ipcMain.on('window:save-before-close-result',(event,token,succeeded)=>{
  if(!trustedSender(event))return;
  if(!Number.isSafeInteger(token) || token!==awaitingSaveToken)return;
  awaitingSaveToken=null;
  if(succeeded===true && !hasUnsavedEdits && mainWindow && !mainWindow.isDestroyed()){
    closingAllowed=true;
    mainWindow.close();
  }

});
// Recovery Controls
ipcMain.handle('recovery:snapshot',async(event,document)=>{
  assertSender(event);
  return {saved:await recoveryStore.save(document,currentPath?path.basename(currentPath):'Unsaved publication')};
});
ipcMain.handle('recovery:clear',async event=>{assertSender(event);return recoveryStore.clear();});
ipcMain.handle('recovery:startup',async event=>{
  assertSender(event);
  let saved;
  try{saved=await recoveryStore.read();}
  catch(error){
    await dialog.showMessageBox(mainWindow,{type:'warning',title:'Recovery unavailable',
      message:'A recovery copy could not be opened.',
      detail:'The copy has been kept in your local application data. Your saved publications were not changed.',
      buttons:['OK'],noLink:true});
    return null;
  }
  if(!saved)return null;
  const response=await dialog.showMessageBox(mainWindow,{type:'question',title:'Recover unsaved publication',
    message:'Restore unsaved work from the previous session?',
    detail:`${saved.document.name}${saved.sourceName?' — '+saved.sourceName:''}\nThe recovered publication will open as unsaved. Your original file will not be overwritten.`,
    buttons:['Restore copy','Discard recovery'],defaultId:0,cancelId:0,noLink:true});
  if(response.response===1){await recoveryStore.clear();return null;}
  currentPath=null;
  hasUnsavedEdits=true;
  return {document:saved.document,savedAt:saved.savedAt};
});
ipcMain.handle('project:resetPath',event=>{assertSender(event);currentPath=null;return true;});
// Project Storage
ipcMain.handle('project:open',async event=>{
  assertSender(event);
  const selection=await dialog.showOpenDialog(mainWindow,{title:'Open Skosh Press project',properties:['openFile'],filters:[{name:'Skosh Press projects',extensions:['skoshpress','tinypress','layoutlist']}]});
  if(selection.canceled || !selection.filePaths.length)return null;
  const filename=selection.filePaths[0];
  await regularFileInfo(filename,MAX_PROJECT_BYTES,10);
  const raw=JSON.parse(await fs.readFile(filename,'utf8'));

  const migrated=raw.format!=='skosh-press-1' || path.extname(filename).toLowerCase()!=='.skoshpress';
  const project=normalizeProject(raw);
  currentPath=migrated?null:filename;
  return {project,path:currentPath,sourceName:path.basename(filename),migrated};
});
async function writeAtomically(target, serialized) {
  const folder=path.dirname(target);
  const temporary=path.join(folder,`.skoshpress-${process.pid}-${Date.now()}.tmp`);
  try {
    await fs.writeFile(temporary,serialized,{encoding:'utf8',flag:'wx',mode:0o600});
    await fs.rename(temporary,target);
  } finally {await fs.rm(temporary,{force:true}).catch(silent);}
}
ipcMain.handle('project:save',async (event,payload)=>{
  assertSender(event);
  if(!payload || typeof payload!=='object')throw new Error('Malformed save request.');

  const doc=normalizeProject(payload.document);
  const serialized=JSON.stringify(doc,null,2);
  if(Buffer.byteLength(serialized)>MAX_PROJECT_BYTES)throw new Error('Project exceeds the 65 MB size limit.');
  let target=payload.saveAs?null:currentPath;
  if(!target){
    const suggested=(doc.name||'A Skosh Press Project').replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').slice(0,80);
    const result=await dialog.showSaveDialog(mainWindow,{title:'Save Skosh Press project',defaultPath:suggested+'.skoshpress',filters:[{name:'Skosh Press project',extensions:['skoshpress']}]});
    if(result.canceled || !result.filePath)return null;
    target=result.filePath;
  }
  if(path.extname(target).toLowerCase()!=='.skoshpress')target=target.replace(/\.[^.\\/]+$/,'')+'.skoshpress';
  await writeAtomically(target,serialized);
  currentPath=target;
  await recoveryStore.clear();
  return {path:target};
});
ipcMain.handle('manuscript:import',async event=>{
  assertSender(event);
  const selection=await dialog.showOpenDialog(mainWindow,{title:'Import manuscript',properties:['openFile'],filters:[{name:'Manuscripts',extensions:['docx','txt','md']}]});
  if(selection.canceled||!selection.filePaths.length)return null;
  const filename=selection.filePaths[0];
  await regularFileInfo(filename,MAX_IMPORT,1);
  const buffer=await fs.readFile(filename);
  const html=path.extname(filename).toLowerCase()==='.docx'?parseDocx(buffer):plainTextToHtml(buffer.toString('utf8'));
  return {name:path.basename(filename,path.extname(filename)),html};
});
// Genealogy Interface
function genealogyOptions(input) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw Error('Invalid genealogy report options.');
  const strings=['title','surname','mode','density','type'];
  const booleans=['protectLiving','includeSources','surnameIndex','placeIndex','includeNotes'];
  const output={};
  for(const name of strings){
    if(input[name]===undefined)continue;
    if(typeof input[name]!=='string' || input[name].length>160)throw Error('Invalid genealogy option: '+name+'.');
    output[name]=input[name];
  }
  for(const name of booleans){
    if(input[name]===undefined)continue;
    if(typeof input[name]!=='boolean')throw Error('Invalid genealogy option: '+name+'.');
    output[name]=input[name];
  }
  if(input.limit!==undefined){
    if(!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>200)throw Error('Choose between 1 and 200 entries per report.');
    output.limit=input.limit;
  }
  return output;
}
ipcMain.handle('genealogy:import',async event=>{
  assertSender(event);
  if(genealogyBatch)throw Error('Finish or cancel batch publication before importing another tree.');
  const selection=await dialog.showOpenDialog(mainWindow,{title:'Import local Ancestry / GEDCOM tree',properties:['openFile'],filters:[{name:'GEDCOM & Ancestry exports',extensions:['ged','zip']}]});
  if(selection.canceled||!selection.filePaths.length)return null;
  const filename=selection.filePaths[0];
  await regularFileInfo(filename,20*1024*1024,1);
  const input=await fs.readFile(filename);
  const imported=importGedcomBuffer(input,filename);
  const tree=parseGedcom(imported.text);
  genealogySession={tree,name:imported.name,sourceHash:createHash('sha256').update(input).digest('hex')};
  return {name:imported.name,stats:tree.stats,version:tree.version,warnings:tree.warnings};
});
ipcMain.handle('genealogy:publication',async (event,options)=>{
  assertSender(event);
  if(!genealogySession)throw Error('Import a GEDCOM before generating a manuscript.');
  return genealogyPublication(genealogySession.tree,genealogyOptions(options));
});
// Batch Publication
function batchOptions(input) {
  const opts=genealogyOptions(input);
  const volumeSize=input.volumeSize;
  if(!Number.isSafeInteger(volumeSize)||volumeSize<1||volumeSize>200)throw Error('Volume size must be between 1 and 200 entries.');
  return {options:opts,volumeSize};
}
async function cleanupBatch(batch) {
  if(batch && genealogyBatch===batch)genealogyBatch=null;
  if(batch?.stage)await fs.rm(batch.stage,{recursive:true,force:true});
}
function batchFor(id) {
  if(!genealogyBatch || typeof id!=='string' || genealogyBatch.id!==id)throw Error('This batch publication session is no longer active.');
  return genealogyBatch;
}
ipcMain.handle('genealogy:batch:begin',async(event,input)=>{
  assertSender(event);
  if(!genealogySession)throw Error('Import a GEDCOM before starting batch publication.');
  if(genealogyBatch)throw Error('A batch is already running.');
  const {options,volumeSize}=batchOptions(input);
  const plan=genealogyBatchPlan(genealogySession.tree,options,volumeSize);
  const selection=await dialog.showOpenDialog(mainWindow,{title:'Choose a folder for the genealogy publication volumes',properties:['openDirectory','createDirectory']});
  if(selection.canceled||!selection.filePaths.length)return null;
  const parent=selection.filePaths[0];
  const stat=await fs.lstat(parent);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Choose a regular local folder for the batch.');
  const slug=(options.title||genealogySession.name||'Genealogy').replace(/[^A-Za-z0-9 _.-]/g,'_').trim().slice(0,55)||'Genealogy';
  const id=randomUUID();
  const folder=`${slug}-Volumes-${id.slice(0,8)}`;
  const stage=path.join(parent,`.skosh-batch-${id}`);
  const final=path.join(parent,folder);
  await fs.mkdir(stage,{mode:0o700});
  genealogyBatch={id,stage,final,plan,options,next:0,pending:null,working:false,files:[],
    sourceName:genealogySession.name,sourceHash:genealogySession.sourceHash,stats:{...genealogySession.tree.stats},version:genealogySession.tree.version};
  return {id,total:plan.total,volumeCount:plan.volumes.length,volumeSize,folder};
});
ipcMain.handle('genealogy:batch:next',(event,id)=>{
  assertSender(event);
  const batch=batchFor(id);
  if(batch.working || batch.pending)throw Error('Finish the previous volume first.');
  const volume=batch.plan.volumes[batch.next];
  if(!volume)throw Error('There are no remaining volumes.');
  const title=`${batch.options.title||'Genealogical Research'} — Volume ${volume.number} of ${batch.plan.volumes.length}`;
  const report=genealogyPublication(genealogySession.tree,{...batch.options,title,offset:volume.start,limit:volume.end-volume.start});
  if(report.count!==volume.recordIds.length || report.recordIds.some((id,index)=>id!==volume.recordIds[index]))
    throw Error('Publication order changed; cancel and reimport the GEDCOM.');
  batch.pending=volume.number;
  return {number:volume.number,volumeCount:batch.plan.volumes.length,start:volume.start,end:volume.end,
    html:report.html,title:report.title,count:report.count};
});
ipcMain.handle('genealogy:batch:commit',async(event,id,number,document)=>{
  assertSender(event);
  const batch=batchFor(id);
  if(batch.working || batch.pending!==number || !Number.isSafeInteger(number))throw Error('Unexpected batch volume.');
  batch.working=true;
  try {
    const doc=normalizeProject(document);
    if(doc.pages.length>450)throw Error('The generated volume exceeds the 450-page flow safeguard. Reduce entries per volume.');
    const serialized=JSON.stringify(doc,null,2);
    if(Buffer.byteLength(serialized)>MAX_PROJECT_BYTES)throw Error('A batch volume exceeds the project size limit.');
    const filename=`Volume-${String(number).padStart(3,'0')}.skoshpress`;
    await fs.writeFile(path.join(batch.stage,filename),serialized,{encoding:'utf8',flag:'wx',mode:0o600});
    const volume=batch.plan.volumes[batch.next];
    batch.files.push({volume:number,file:filename,entries:volume.end-volume.start,
      firstEntry:volume.start+1,lastEntry:volume.end,recordIds:volume.recordIds,pages:doc.pages.length,
      sha256:createHash('sha256').update(serialized).digest('hex')});
    batch.next++;
    batch.pending=null;
    if(batch.next<batch.plan.volumes.length)return {complete:false,done:batch.next,total:batch.plan.total,pages:doc.pages.length};
    const manifest={format:'skosh-genealogy-batch-1',createdAt:new Date().toISOString(),
      sourceFile:batch.sourceName,sourceSha256:batch.sourceHash,gedcomVersion:batch.version,
      importedCounts:batch.stats,reportType:batch.plan.mode,
      publicationOptions:{...batch.options,volumeSize:batch.plan.volumeSize},
      totalEntries:batch.plan.total,volumeCount:batch.files.length,volumes:batch.files,
      note:'Entries are consecutive within the selected report; person and family IDs may appear in multiple event entries. Page numbers refer only to the initial generated project and can change after editing. Review privacy and citations before publication.'};
    if(batch.files.reduce((n,f)=>n+f.entries,0)!==batch.plan.total)throw Error('Volume count verification failed.');
    await fs.writeFile(path.join(batch.stage,'publication-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
    try{await fs.lstat(batch.final);throw Error('The output folder already exists; no files were overwritten.');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    await fs.rename(batch.stage,batch.final);
    genealogyBatch=null;
    return {complete:true,done:batch.next,total:batch.plan.total,folder:batch.final,manifest:'publication-manifest.json'};
  }catch(error){await cleanupBatch(batch);throw error;}
  finally{batch.working=false;}
});
ipcMain.handle('genealogy:batch:cancel',async(event,id)=>{
  assertSender(event);
  const batch=batchFor(id);
  if(batch.working)throw Error('A volume is still being saved.');
  await cleanupBatch(batch);
  return {cancelled:true};
});
ipcMain.handle('genealogy:exportCsv',async (event,options)=>{
  assertSender(event);
  if(!genealogySession)throw Error('Import a GEDCOM before exporting CSV.');
  const result=genealogyExportCsv(genealogySession.tree,genealogyOptions(options));
  const safeName=(genealogySession.name+'-'+result.type).replace(/[^A-Za-z0-9_. -]/g,'_').slice(0,110)||'genealogy-records';
  const selection=await dialog.showSaveDialog(mainWindow,{
    title:'Export structured genealogy records (CSV)',defaultPath:safeName+'.csv',
    filters:[{name:'Comma-separated values',extensions:['csv']}]
  });
  if(selection.canceled||!selection.filePath)return null;
  await fs.writeFile(selection.filePath,result.csv,{encoding:'utf8',flag:'w',mode:0o600});
  return {path:selection.filePath,count:result.count,type:result.type};
});
ipcMain.handle('image:import',async event=>{
  assertSender(event);
  const selection=await dialog.showOpenDialog(mainWindow,{title:'Place image',properties:['openFile'],filters:[{name:'Images',extensions:['png','jpg','jpeg','webp','gif']}]});
  if(selection.canceled||!selection.filePaths.length)return null;
  const filename=selection.filePaths[0];
  await regularFileInfo(filename,16*1024*1024,8);
  const raw=await fs.readFile(filename), ext=path.extname(filename).toLowerCase();
  const signatures={'.png':raw.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),
    '.jpg':raw[0]===0xff&&raw[1]===0xd8&&raw[2]===0xff,
    '.jpeg':raw[0]===0xff&&raw[1]===0xd8&&raw[2]===0xff,
    '.webp':raw.toString('ascii',0,4)==='RIFF'&&raw.toString('ascii',8,12)==='WEBP',
    '.gif':raw.toString('ascii',0,3)==='GIF'};
  if(!signatures[ext])throw new Error('Image header does not match an allowed format.');
  const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'}[ext];
  return {name:path.basename(filename),src:`data:${mime};base64,${raw.toString('base64')}`};
});
ipcMain.handle('font:import',async event=>{
  assertSender(event);
  const selection=await dialog.showOpenDialog(mainWindow,{title:'Add font to this project',properties:['openFile'],filters:[{name:'Font files',extensions:['ttf','otf','woff','woff2']}]});
  if(selection.canceled||!selection.filePaths.length)return null;
  const filename=selection.filePaths[0];
  await regularFileInfo(filename,5*1024*1024,4);
  return checkedFont(filename,await fs.readFile(filename));
});
// Export Pipeline
ipcMain.handle('export:pdf',async (event,{html,widthMm,heightMm,booklet}={})=>{
  assertSender(event);
  if(typeof html!=='string' || Buffer.byteLength(html)>MAX_PROJECT_BYTES || !Number.isFinite(widthMm) || !Number.isFinite(heightMm)
     || widthMm<50 || heightMm<50 || widthMm>1000 || heightMm>1000)throw new Error('Invalid PDF export.');


  if (!safePrintMarkup(html))
    throw new Error('Unsafe element or URL in PDF source.');
  const selection=await dialog.showSaveDialog(mainWindow,{title:'Export print PDF',defaultPath:booklet?'Skosh Press Booklet.pdf':'Skosh Press.pdf',filters:[{name:'PDF',extensions:['pdf']}]});
  if(selection.canceled||!selection.filePath)return null;
  if(printJob!==null)throw new Error('A PDF export is already running.');
  printJob=html;
  const printWindow=new BrowserWindow({show:false,width:950,height:950,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,javascript:false,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false,navigateOnDragDrop:false,safeDialogs:true}});
  try {
    await printWindow.loadURL('skosh-print://job/index.html');
    const pdf=await printWindow.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,
      margins:{marginType:'none'},pageSize:{width:Math.round(widthMm*1000),height:Math.round(heightMm*1000)}});
    const target=path.extname(selection.filePath).toLowerCase()==='.pdf'?selection.filePath:selection.filePath+'.pdf';
    await writeAtomically(target,pdf);
    return {path:target,bytes:pdf.length};
  } finally {
    printJob=null;
    if(!printWindow.isDestroyed())printWindow.destroy();
  }
});

ipcMain.handle('spellcheck:set', (event, enabled, language) => {
  assertSender(event);
  const supported=['en-US','en-GB','en-CA','en-AU','fr','de','es'];
  if (typeof enabled!=='boolean' || !supported.includes(language)) throw new Error('Invalid spelling preferences.');
  session.defaultSession.setSpellCheckerEnabled(enabled);
  if(enabled && process.platform!=='darwin')session.defaultSession.setSpellCheckerLanguages([language]);
  return {enabled,language};
});


// Template Management
const templateDir=()=>path.join(app.getPath('userData'),'templates');
const validTemplateId=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid template ID.');return id;};
const templateFilename=(id,ext='.skoshpress')=>path.join(templateDir(),validTemplateId(id)+ext);
async function existingTemplate(id) {
  const current=templateFilename(id);
  try {await regularFileInfo(current,MAX_PROJECT_BYTES,10);return current;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const legacy=templateFilename(id,'.tinypress');
  await regularFileInfo(legacy,MAX_PROJECT_BYTES,10);
  return legacy;
}
ipcMain.handle('template:list',async event=>{
  assertSender(event);await fs.mkdir(templateDir(),{recursive:true});const entries=await fs.readdir(templateDir(),{withFileTypes:true});const out=[];
  for(const entry of entries.slice(0,201)){
    if(!entry.isFile()||!/^[a-f0-9-]{36}\.(?:skoshpress|tinypress)$/.test(entry.name))continue;
    try{const file=path.join(templateDir(),entry.name),stat=await fs.stat(file);if(stat.size>MAX_PROJECT_BYTES)continue;
      const doc=normalizeProject(JSON.parse(await fs.readFile(file,'utf8')));out.push({id:entry.name.slice(0,entry.name.lastIndexOf('.')),name:doc.name,pages:doc.pages.length});
    }catch(_error){}
  }
  return out.sort((a,b)=>a.name.localeCompare(b.name));
});
ipcMain.handle('template:save',async(event,{name,document}={})=>{
  assertSender(event);
  if(typeof name!=='string'||!name.trim()||name.length>80)throw new Error('Template name must be 1–80 characters.');
  const doc=normalizeProject(document);doc.name=name.trim();const serialized=JSON.stringify(doc);
  if(Buffer.byteLength(serialized)>MAX_PROJECT_BYTES)throw new Error('Template exceeds the project size limit.');
  await fs.mkdir(templateDir(),{recursive:true});
  const {randomUUID}=require('node:crypto');const id=randomUUID();
  await fs.writeFile(templateFilename(id),serialized,{flag:'wx',mode:0o600});return {id,name:doc.name};
});
ipcMain.handle('template:load',async(event,id)=>{
  assertSender(event);const name=await existingTemplate(id);
  return normalizeProject(JSON.parse(await fs.readFile(name,'utf8')));
});
ipcMain.handle('template:delete',async(event,id)=>{assertSender(event);await fs.rm(await existingTemplate(id));return true;});




ipcMain.handle('export:interchange',async(event,{document:input,format}={})=>{
  assertSender(event);
  if(!['sla','rtf'].includes(format))throw new Error('Unsupported interchange format.');
  const document=normalizeProject(input);
  const extension=format;
  const chooser=await dialog.showSaveDialog(mainWindow,{
    title:format==='sla'?'Export first-pass Scribus layout':'Export editable InDesign manuscript',
    defaultPath:document.name.replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').slice(0,70)+'.'+extension,
    filters:[{name:format==='sla'?'Scribus document (experimental)':'Rich Text (editable manuscript)',extensions:[extension]}]
  });
  if(chooser.canceled||!chooser.filePath)return null;
  const result=format==='sla'?Buffer.from(toScribusSla(document),'utf8'):toIndesignRtf(document);
  if(result.byteLength>MAX_PROJECT_BYTES)throw new Error('Interchange file exceeds 65 MB.');
  const target=path.extname(chooser.filePath).toLowerCase()==='.'+extension?chooser.filePath:chooser.filePath+'.'+extension;
  await writeAtomically(target,result);
  return {path:target,format,limitations:format==='sla'?'Editable text/frames only; images and rich formatting not guaranteed.':'Editable manuscript text only; page positions not preserved.'};
});

// Publishing Formats
ipcMain.handle('export:publication',async(event,{document:input,format,html}={})=>{
  assertSender(event);
  if(!['docx','epub','txt','html'].includes(format))throw new Error('Unsupported publication export format.');
  const document=normalizeProject(input);
  let result;
  if(format==='html'){
    if(typeof html!=='string'||Buffer.byteLength(html,'utf8')>MAX_PROJECT_BYTES||!safeStandaloneHtml(html))throw new Error('HTML export requires validated markup and a restrictive document policy.');
    result=Buffer.from(html,'utf8');
  }else if(format==='docx')result=toDocx(document);
  else if(format==='epub')result=toEpub(document);
  else result=toPlainText(document);
  if(result.byteLength>MAX_PROJECT_BYTES)throw new Error('Export exceeds the 65 MB file limit.');
  const labels={docx:'Word manuscript (editable)',epub:'Reflowable EPUB (text)',txt:'Plain UTF-8 text',html:'Standalone paginated HTML'};
  const chooser=await dialog.showSaveDialog(mainWindow,{
    title:`Export ${labels[format]}`,
    defaultPath:document.name.replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').slice(0,70)+'.'+format,
    filters:[{name:labels[format],extensions:[format]}]
  });
  if(chooser.canceled||!chooser.filePath)return null;
  const target=path.extname(chooser.filePath).toLowerCase()==='.'+format?chooser.filePath:chooser.filePath+'.'+format;
  await writeAtomically(target,result);
  return {path:target,format,bytes:result.byteLength};
});

// Dictionary Management
const dictFolder=()=>path.join(app.getPath('userData'),'Dictionaries');
const languageTags=['en-US','en-GB','en-CA','en-AU','fr','de','es'];
const dicName=language=>`${language}-10-1.bdic`;
const isLanguage=lang=>languageTags.includes(lang);

ipcMain.handle('dictionary:import',async(event,language)=>{
  assertSender(event);
  if(!isLanguage(language))throw new Error('Choose a supported language first.');
  if(process.platform==='darwin')throw new Error('On macOS install dictionaries through System Settings.');
  const result=await dialog.showOpenDialog(mainWindow,{title:`Choose Chromium .bdic dictionary for ${language}`,properties:['openFile'],filters:[{name:'Chromium spelling dictionary',extensions:['bdic']}]});
  if(result.canceled||!result.filePaths.length)return null;
  const source=result.filePaths[0];await regularFileInfo(source,20*1024*1024,32);
  const data=await fs.readFile(source);
  if(data.toString('ascii',0,4)!=='BDic')throw new Error('Not a Chromium .bdic dictionary.');
  await fs.mkdir(dictFolder(),{recursive:true});
  await writeAtomically(path.join(dictFolder(),dicName(language)),data);
  return {language,installed:true,restartRequired:true};
});
ipcMain.handle('dictionary:list',async event=>{
  assertSender(event);const result=[];
  for(const language of languageTags){
    try{const info=await fs.stat(path.join(dictFolder(),dicName(language)));if(info.isFile()&&info.size>32)result.push(language);}catch(_error){}
  }
  return {installed:result,platform:process.platform};
});
ipcMain.handle('dictionary:words',async(event)=>{
  assertSender(event);
  const chooser=await dialog.showOpenDialog(mainWindow,{title:'Add words to personal spelling dictionary',properties:['openFile'],filters:[{name:'Plain-text words (UTF-8, one per line)',extensions:['txt']}]});
  if(chooser.canceled||!chooser.filePaths.length)return null;
  const file=chooser.filePaths[0];
  await regularFileInfo(file,256*1024,1);
  const raw=await fs.readFile(file,'utf8');
  const words=[...new Set(raw.split(/\r?\n/g).map(x=>x.trim()).filter(w=>w.length>0&&w.length<=70&&/^[\p{L}\p{M}'’-]+$/u.test(w)))].slice(0,5000);
  let added=0;for(const word of words)if(session.defaultSession.addWordToSpellCheckerDictionary(word))added++;
  return {added,total:words.length};
});

// Revision Loading
ipcMain.handle('revision:chooseBaseline',async event=>{
  assertSender(event);
  const pick=await dialog.showOpenDialog(mainWindow,{title:'Choose an older project to compare',properties:['openFile'],filters:[{name:'Skosh Press projects',extensions:['skoshpress','tinypress','layoutlist']}]});
  if(pick.canceled||!pick.filePaths.length)return null;
  const file=pick.filePaths[0];
  await regularFileInfo(file,MAX_PROJECT_BYTES,10);
  const document=normalizeProject(JSON.parse(await fs.readFile(file,'utf8')));
  return {name:path.basename(file),document};
});

// Printer Storage
const printerStore=()=>path.join(app.getPath('userData'),'printer-profiles.json');
const printerId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
async function loadPrinters(){
  let data;
  try {const stat=await fs.stat(printerStore());if(!stat.isFile()||stat.size>64000)throw new Error('Printer profile storage exceeds 64 KB.');data=JSON.parse(await fs.readFile(printerStore(),'utf8'));}
  catch(error){if(error.code==='ENOENT')return [];throw error;}
  if(!data||data.version!==1||!Array.isArray(data.profiles)||data.profiles.length>50)throw new Error('Printer profile storage is invalid.');
  const ids=new Set();
  return data.profiles.map(row=>{
    if(!printerId(row.id)||ids.has(row.id))throw new Error('A printer profile ID is invalid.');
    ids.add(row.id);return {id:row.id,...validatePrinterProfile(row)};
  });
}
async function writePrinters(rows){
  if(rows.length>50)throw new Error('Maximum of 50 printer profiles.');
  await writeAtomically(printerStore(),JSON.stringify({version:1,profiles:rows},null,2));
}
ipcMain.handle('printer:profiles:list',async event=>{assertSender(event);return loadPrinters();});
ipcMain.handle('printer:profiles:save',async(event,raw,id)=>{
  assertSender(event);
  if(id!==null&&id!==undefined&&!printerId(id))throw new Error('Invalid printer profile ID.');
  const row=validatePrinterProfile(raw),existing=await loadPrinters();
  let resolved=id;
  if(resolved){const index=existing.findIndex(p=>p.id===resolved);if(index<0)throw new Error('Printer profile no longer exists.');existing[index]={id:resolved,...row};}
  else{if(existing.length>=50)throw new Error('Maximum of 50 printer profiles.');resolved=randomUUID();existing.push({id:resolved,...row});}
  await writePrinters(existing);return {id:resolved,...row};
});
ipcMain.handle('printer:profiles:delete',async(event,id)=>{
  assertSender(event);if(!printerId(id))throw new Error('Invalid printer profile ID.');
  const rows=await loadPrinters();if(!rows.some(p=>p.id===id))throw new Error('Printer profile not found.');
  await writePrinters(rows.filter(p=>p.id!==id));return true;
});
