'use strict';
const {app, BrowserWindow, ipcMain, dialog, Menu, session, protocol} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {constants: fsConstants, mkdirSync} = require('node:fs');
const {readBoundedRegularFile,writeAtomically,ensurePrivateDirectory,createSerialQueue}=require('./lib/file-guards');
const {parseDocxDetailed, plainTextToHtml, markdownToHtml} = require('./lib/docx');
const {importGedcomBuffer} = require('./lib/gedcom-file');
const {preview:genealogyPreview,volumeIndex:genealogyVolumeIndex} = require('./lib/genealogy-workbench');
const {parse:parseGedcom} = require('./lib/gedcom');
const {publication:genealogyPublication,batchPlan:genealogyBatchPlan,exportCsv:genealogyExportCsv} = require('./lib/genealogy-records');
const {checkedFont,verifyFontBinary} = require('./lib/fonts');
const {check:checkGeneratedFont}=require('./lib/generated-font-check');
const {normalizeProject, MAX_PROJECT_BYTES, validImageData} = require('./lib/projects');
const {outputDocument}=require('./lib/publication-layout');
const {toScribusSla,toIndesignRtf} = require('./lib/interchange');
const {toPlainText,toDocx,toEpub} = require('./lib/publishing-exports');
const {valid: validatePrinterProfile, restoreProfile: restorePrinterProfile} = require('./lib/print-lab');
const {randomUUID,createHash} = require('node:crypto');
const {resourcePath,responseHeaders,APP_CSP_HEADER,PRINT_CSP,isReadRequest,safePrintMarkup,safeStandaloneHtml} = require('./lib/security');
const {createRecoveryStore} = require('./lib/recovery');
const {createLibrary} = require('./lib/font-library');
const {createAssetLibrary}=require('./lib/asset-library');
const Compact=require('./lib/compact-project');
const {fromNative,fromTTF,toNative}=require('./lib/editable-font');
const {fromUFO,toUFO}=require('./lib/ufo-interchange');
const {generateVariableFont}=require('./lib/variable-font');
const {buildFamilyPackage} = require('./lib/font-family-package');

let mainWindow;
let currentPath = null;                                                                      
let hasUnsavedEdits = false;
let closingDialogOpen = false;
let closingAllowed = false;
let awaitingSaveToken = null;
let nextSaveToken = 0;
let printJob = null;
let recoveryStore;
let preserveUnreadRecovery=false;
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
      {label:'Check document…',accelerator:'CmdOrCtrl+Shift+P',click:()=>menuAction('preflight')},
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
      {label:'Toggle focus view',accelerator:'CmdOrCtrl+Shift+L',click:()=>menuAction('focus')},
      ...(app.isPackaged?[]:[{type:'separator'},{role:'reload'},{role:'toggleDevTools'}])
    ]},
    {label:'Help',submenu:[
      {label:'Basics and shortcuts…',click:()=>menuAction('helpBasics')},
      {label:'Privacy policy…',click:()=>menuAction('helpPrivacy')},
      {type:'separator'},
      {label:'About Skosh Press',click:()=>dialog.showMessageBox(mainWindow,{type:'info',title:'About Skosh Press',message:'Skosh Press',detail:`Version ${app.getVersion()}\nCreated by KeyOuts\nA publishing application.`})}
    ]}
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
  const loading=mainWindow.loadURL('skosh://app/src/index.html');
  loading?.catch(error=>{console.error('Editor startup failed:',error);dialog.showErrorBox('Skosh Press could not start','The editor could not be loaded. Reinstall from a verified release.');});


  mainWindow.on('close',event=>{
    if(closingAllowed)return;
    if(!hasUnsavedEdits){
      event.preventDefault();
      if(closingDialogOpen)return;
      closingDialogOpen=true;
      const win=mainWindow;
      (preserveUnreadRecovery?Promise.resolve():recoveryStore.clear()).then(()=>{closingAllowed=true;if(!win.isDestroyed())win.close();})
        .catch(error=>{closingDialogOpen=false;void recoveryCloseError(win,error,false);});
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
          .catch(error=>{void recoveryCloseError(win,error,true);});
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

async function recoveryCloseError(win,error,dirty){
  console.error('Could not clear recovery:',error);
  if(win.isDestroyed()||win!==mainWindow||closingDialogOpen)return;
  closingDialogOpen=true;
  try{
    const {response}=await dialog.showMessageBox(win,{type:'warning',title:'Recovery storage unavailable',message:'The recovery copy could not be removed.',detail:dirty?'Closing will discard current edits but may leave an older recovery copy.':'Your saved publication is unchanged. An older recovery copy may remain.',buttons:['Keep window open','Close without removing recovery'],defaultId:0,cancelId:0,noLink:true});
    if(response===1&&!win.isDestroyed()){closingAllowed=true;win.close();}
  }catch(dialogError){console.error('Recovery close confirmation failed:',dialogError);}
  finally{closingDialogOpen=false;}
}
async function installLocalSpellingDictionary() {
  if(process.platform==='darwin')return;
  const source=path.join(__dirname,'assets','dictionaries','en-US-10-1.bdic');
  const folder=path.join(app.getPath('userData'),'Dictionaries');
  const target=path.join(folder,'en-US-10-1.bdic');
  await ensurePrivateDirectory(folder);
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
const primaryInstance=typeof app.requestSingleInstanceLock!=='function'||app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
else app.on('second-instance',()=>{if(mainWindow&&!mainWindow.isDestroyed()){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
if(primaryInstance)app.whenReady().then(async()=>{
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
ipcMain.handle('recovery:clear',async event=>{assertSender(event);const result=await recoveryStore.clear();preserveUnreadRecovery=false;return result;});
ipcMain.handle('recovery:startup',async event=>{
  assertSender(event);
  let saved;
  try{saved=await recoveryStore.read();}
  catch(error){
    preserveUnreadRecovery=true;
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
  const selection=await dialog.showOpenDialog(mainWindow,{title:'Open Skosh Press project',properties:['openFile'],filters:[{name:'Skosh Press projects',extensions:['skoshpress','skoshcompact','tinypress','layoutlist','zip']}]});
  if(selection.canceled || !selection.filePaths.length)return null;
  const filename=selection.filePaths[0];
  const packaged=path.extname(filename).toLowerCase()==='.zip';
  let raw=packaged?require('./lib/publication-package').openPackage(await readBoundedRegularFile(filename,96*1024*1024,22)):JSON.parse((await readBoundedRegularFile(filename,MAX_PROJECT_BYTES,10)).toString('utf8'));

  const compact=path.extname(filename).toLowerCase()==='.skoshcompact';
  if(compact)raw=Compact.decode(raw);
  const migrated=raw.format!=='skosh-press-1' || (!compact&&path.extname(filename).toLowerCase()!=='.skoshpress');
  const project=normalizeProject(raw);
  await recoveryStore.clear();
  preserveUnreadRecovery=false;
  currentPath=migrated?null:filename;
  return {project,path:currentPath,sourceName:path.basename(filename),migrated,recoveryCleared:true};
});
ipcMain.handle('project:save',async (event,payload)=>{
  assertSender(event);
  if(!payload || typeof payload!=='object')throw new Error('Malformed save request.');

  const doc=normalizeProject(payload.document);
  const compact=payload.compact===true||(!payload.saveAs&&path.extname(currentPath||'').toLowerCase()==='.skoshcompact');
  const extension=compact?'skoshcompact':'skoshpress';
  const serialized=compact?Compact.encode(doc):JSON.stringify(doc,null,2);
  if(Buffer.byteLength(serialized)>MAX_PROJECT_BYTES)throw new Error('Project exceeds the 65 MB size limit.');
  let target=payload.saveAs||payload.compact===true?null:currentPath;
  if(!target){
    const suggested=(doc.name||'A Skosh Press Project').replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').slice(0,80);
    const result=await dialog.showSaveDialog(mainWindow,{title:'Save Skosh Press project',defaultPath:suggested+'.'+extension,filters:[{name:compact?'Compact Skosh Press project':'Skosh Press project',extensions:[extension]}]});
    if(result.canceled || !result.filePath)return null;
    target=result.filePath;
  }
  if(path.extname(target).toLowerCase()!=='.'+extension)target=target.replace(/\.[^.\\/]+$/,'')+'.'+extension;
  await writeAtomically(target,serialized);
  currentPath=target;
  let recoveryWarning=null;
  try{await recoveryStore.clear();preserveUnreadRecovery=false;}catch(error){preserveUnreadRecovery=true;console.error('Saved project; recovery cleanup failed:',error);recoveryWarning='Publication saved, but an older recovery copy could not be removed.';}
  return {path:target,recoveryWarning};
});
ipcMain.handle('manuscript:import',async event=>{
  assertSender(event);
  const selection=await dialog.showOpenDialog(mainWindow,{title:'Import manuscript',properties:['openFile'],filters:[{name:'Manuscripts',extensions:['docx','txt','md']}]});
  if(selection.canceled||!selection.filePaths.length)return null;
  const filename=selection.filePaths[0];
  const buffer=await readBoundedRegularFile(filename,MAX_IMPORT,1);
  const extension=path.extname(filename).toLowerCase();
  const result=extension==='.docx'?parseDocxDetailed(buffer):{html:extension==='.md'?markdownToHtml(buffer.toString('utf8')):plainTextToHtml(buffer.toString('utf8'))};
  if(result.html.length>5_000_000)throw Error('Imported manuscript exceeds the 5 MB text limit.');
  return {name:path.basename(filename,path.extname(filename)),...result};
});
// Genealogy Interface
function genealogyOptions(input) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw Error('Invalid genealogy report options.');
  const strings=['title','surname','mode','density','type'];
  const booleans=['protectLiving','includeSources','surnameIndex','placeIndex','includeNotes','footnotes','personIndex'];
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
  const input=await readBoundedRegularFile(filename,20*1024*1024,1);
  const imported=importGedcomBuffer(input,filename);
  const tree=parseGedcom(imported.text);
  genealogySession={tree,name:imported.name,sourceHash:createHash('sha256').update(input).digest('hex')};
  return {name:imported.name,stats:tree.stats,version:tree.version,warnings:tree.warnings};
});
ipcMain.handle('genealogy:preview',async(event,input)=>{
  assertSender(event);
  if(!genealogySession)throw Error('Import a GEDCOM before reviewing research.');
  const options=genealogyOptions(input);
  if(input.rootId!==undefined&&(typeof input.rootId!=='string'||input.rootId.length>160))throw Error('Invalid root record.');
  if(!['ancestors','descendants','timeline'].includes(input.chartMode)||!Number.isInteger(input.depth)||input.depth<1||input.depth>5)throw Error('Invalid chart settings.');
  return genealogyPreview(genealogySession.tree,{...options,rootId:input.rootId,chartMode:input.chartMode,depth:input.depth});
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
    html:report.html,notes:report.notes,title:report.title,count:report.count};
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
    const index=JSON.stringify(genealogyVolumeIndex(batch.files),null,2)+'\n';
    await fs.writeFile(path.join(batch.stage,'record-volume-index.json'),index,{encoding:'utf8',flag:'wx',mode:0o600});
    const manifest={recordIndex:{file:'record-volume-index.json',sha256:createHash('sha256').update(index).digest('hex')},format:'skosh-genealogy-batch-1',createdAt:new Date().toISOString(),
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
  await writeAtomically(selection.filePath,result.csv);
  return {path:selection.filePath,count:result.count,type:result.type};
});
let reusableAssets;
function assetLibrary(){return reusableAssets||(reusableAssets=createAssetLibrary(app.getPath('userData')));}
ipcMain.handle('asset:library:list',event=>{assertSender(event);return assetLibrary().list();});
ipcMain.handle('asset:library:load',(event,id)=>{assertSender(event);return assetLibrary().load(id);});
ipcMain.handle('asset:library:save',(event,asset)=>{assertSender(event);return assetLibrary().save(asset);});
ipcMain.handle('asset:library:remove',(event,id)=>{assertSender(event);return assetLibrary().remove(id);});
ipcMain.handle('image:import',async event=>{
  assertSender(event);
  const selection=await dialog.showOpenDialog(mainWindow,{title:'Place image',properties:['openFile'],filters:[{name:'Images',extensions:['png','jpg','jpeg','webp','gif']}]});
  if(selection.canceled||!selection.filePaths.length)return null;
  const filename=selection.filePaths[0];
  const raw=await readBoundedRegularFile(filename,16*1024*1024,8), ext=path.extname(filename).toLowerCase();
  const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'}[ext];
  const src=`data:${mime};base64,${raw.toString('base64')}`;
  if(!mime||!validImageData(src))throw Error('Image header or dimensions do not match an allowed format.');
  return {name:path.basename(filename),src};
});
ipcMain.handle('font:import',async event=>{
  assertSender(event);
  const selection=await dialog.showOpenDialog(mainWindow,{title:'Add font to this project',properties:['openFile'],filters:[{name:'Font files',extensions:['ttf','otf','woff','woff2']}]});
  if(selection.canceled||!selection.filePaths.length)return null;
  const filename=selection.filePaths[0];
  return checkedFont(filename,await readBoundedRegularFile(filename,5*1024*1024,4));
});
ipcMain.handle('font:importEditable',async event=>{
  assertSender(event);
  const selection=await dialog.showOpenDialog(mainWindow,{title:'Import an editable typeface',properties:['openFile'],filters:[{name:'Editable font sources',extensions:['ttf','skoshfont','zip']}]});
  if(selection.canceled||!selection.filePaths.length)return null;
  const source=selection.filePaths[0],ext=path.extname(source).toLowerCase();
  const bytes=await readBoundedRegularFile(source,8*1024*1024,20);
  const name=path.basename(source,ext).replace(/[^\p{L}\p{N} _.-]/gu,' ').trim().slice(0,64)||'Imported Font';
  if(ext==='.skoshfont')return {design:fromNative(bytes),imported:null,notice:'Full native editable source restored.'};
  if(ext==='.ttf')return fromTTF(bytes,name);
  if(ext==='.zip')return fromUFO(bytes,name);
  throw new Error('Editable import supports TTF simple outlines, .skoshfont and UFO3 ZIP archives.');
});
ipcMain.handle('font:exportEditable',async(event,design)=>{
  assertSender(event);
  const data=toNative(design),safe=design.name.replace(/[^\p{L}\p{N} _.-]/gu,'').trim().slice(0,60)||'Skosh Font';
  const choice=await dialog.showSaveDialog(mainWindow,{title:'Export editable font source',defaultPath:safe+'.skoshfont',filters:[{name:'Skosh editable font',extensions:['skoshfont']}]});
  if(choice.canceled||!choice.filePath)return null;
  await writeAtomically(choice.filePath,data);
  return {path:choice.filePath};
});
ipcMain.handle('font:exportUFO',async(event,payload)=>{
  assertSender(event);
  const data=toUFO(payload?.design,payload?.glyphs),safe=payload.design.name.replace(/[^\p{L}\p{N} _.-]/gu,'').trim().slice(0,60)||'Skosh Font';
  const choice=await dialog.showSaveDialog(mainWindow,{title:'Export editable UFO3 Regular master',defaultPath:safe+'-UFO3.zip',filters:[{name:'UFO3 ZIP',extensions:['zip']}]});
  if(choice.canceled||!choice.filePath)return null;
  await writeAtomically(choice.filePath,data);return {path:choice.filePath};
});
ipcMain.handle('font:exportVariable',async(event,masters)=>{
  assertSender(event);
  if(!masters||typeof masters!=='object'||Object.keys(masters).some(k=>!['Regular','Light','Bold'].includes(k)))throw new Error('Invalid variable font masters.');
  const result={};
  for(const key of ['Regular','Light','Bold'])if(masters[key]!==undefined){
    const match=typeof masters[key]==='string'&&/^data:font\/ttf;base64,([A-Za-z0-9+/]+={0,2})$/.exec(masters[key]);
    if(!match||masters[key].length>5*1024*1024*1.4+50)throw new Error('Invalid variable master '+key+'.');
    result[key]=Buffer.from(match[1],'base64');
  }
  const bytes=generateVariableFont(result);
  if(bytes.length>5*1024*1024)throw new Error('Variable font exceeds the 5 MB export limit.');
  const choice=await dialog.showSaveDialog(mainWindow,{title:'Export OpenType variable font',defaultPath:'Skosh-Variable.ttf',filters:[{name:'OpenType variable TrueType',extensions:['ttf']}]});
  if(choice.canceled||!choice.filePath)return null;
  await writeAtomically(choice.filePath,bytes);return {path:choice.filePath,axes:['wght']};
});
// Library Storage
let editableTypeLibrary;
const typeLibrary=()=>editableTypeLibrary||(editableTypeLibrary=createLibrary(app.getPath('userData')));
ipcMain.handle('font:library:list',async event=>{assertSender(event);return typeLibrary().list();});
ipcMain.handle('font:library:load',async(event,id)=>{assertSender(event);return typeLibrary().load(id);});
ipcMain.handle('font:library:save',async(event,design)=>{assertSender(event);return typeLibrary().save(design);});
ipcMain.handle('font:library:delete',async(event,id)=>{assertSender(event);return typeLibrary().remove(id);});
ipcMain.handle('font:exportFamily',async(event,payload)=>{
  assertSender(event);
  const name=payload?.name;
  const bytes=buildFamilyPackage(name,payload?.faces);
  if(bytes.length>21*1024*1024)throw new Error('Font family package exceeds the export limit.');
  const clean=name.replace(/[^\p{L}\p{N} _.-]/gu,'').trim().slice(0,60)||'Skosh Font';
  const choice=await dialog.showSaveDialog(mainWindow,{title:'Export complete font family',defaultPath:clean+'-family.zip',filters:[{name:'Font family ZIP',extensions:['zip']}]});
  if(choice.canceled||!choice.filePath)return null;
  await writeAtomically(choice.filePath,bytes);
  return {path:choice.filePath,faces:payload.faces.length};
});
ipcMain.handle('font:exportDesigned',async(event,payload)=>{
  assertSender(event);
  const name=typeof payload?.name==='string'?payload.name.trim().slice(0,64):'';
  const data=payload?.data;
  const match=typeof data==='string'&&/^data:font\/ttf;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!name || !match || data.length>5*1024*1024*1.4+50)throw new Error('Invalid generated TrueType font.');
  const bytes=Buffer.from(match[1],'base64');
  if(bytes.length<100 || bytes.length>5*1024*1024 || bytes.subarray(0,4).toString('hex')!=='00010000' || !verifyFontBinary(bytes,'font/ttf'))throw new Error('Invalid font header.');
  checkGeneratedFont(bytes);
  const filename=name.replace(/[^\p{L}\p{N} _.-]/gu,'').slice(0,64)||'Skosh Font';
  const choice=await dialog.showSaveDialog(mainWindow,{title:'Export designed TrueType font',defaultPath:filename+'.ttf',filters:[{name:'TrueType font',extensions:['ttf']}]});
  if(choice.canceled||!choice.filePath)return null;
  await writeAtomically(choice.filePath,bytes);
  return {path:choice.filePath};
});
// Export Pipeline
ipcMain.handle('export:pdf',async (event,{html,widthMm,heightMm,booklet,production}={})=>{
  assertSender(event);
  if(typeof html!=='string' || Buffer.byteLength(html)>MAX_PROJECT_BYTES || !Number.isFinite(widthMm) || !Number.isFinite(heightMm)
     || widthMm<50 || heightMm<50 || widthMm>1000 || heightMm>1000)throw new Error('Invalid PDF export.');


  if (!safePrintMarkup(html))
    throw new Error('Unsafe element or URL in PDF source.');
  const printMetadata=production===undefined?null:require('./lib/production-pdf').validateProduction(production,widthMm,heightMm);
  const selection=await dialog.showSaveDialog(mainWindow,{title:'Export print PDF',defaultPath:booklet?'Skosh Press Booklet.pdf':'Skosh Press.pdf',filters:[{name:'PDF',extensions:['pdf']}]});
  if(selection.canceled||!selection.filePath)return null;
  if(printJob!==null)throw new Error('A PDF export is already running.');
  printJob=html;
  let printWindow;
  try {
    printWindow=new BrowserWindow({show:false,width:950,height:950,
      webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,javascript:false,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false,navigateOnDragDrop:false,safeDialogs:true}});
    await printWindow.loadURL('skosh-print://job/index.html');
    const rendered=await printWindow.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,
      margins:{top:0,bottom:0,left:0,right:0},pageSize:{width:widthMm/25.4,height:heightMm/25.4}});
    const pdf=printMetadata?require('./lib/production-pdf').addProductionMetadata(rendered,widthMm,heightMm,printMetadata):rendered;
    const target=path.extname(selection.filePath).toLowerCase()==='.pdf'?selection.filePath:selection.filePath+'.pdf';
    await writeAtomically(target,pdf);
    return {path:target,bytes:pdf.length};
  } finally {
    printJob=null;
    if(printWindow&&!printWindow.isDestroyed())printWindow.destroy();
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
  await ensurePrivateDirectory(templateDir());
  const current=templateFilename(id);
  try {await regularFileInfo(current,MAX_PROJECT_BYTES,10);return current;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const legacy=templateFilename(id,'.tinypress');
  await regularFileInfo(legacy,MAX_PROJECT_BYTES,10);
  return legacy;
}
ipcMain.handle('template:list',async event=>{
  assertSender(event);await ensurePrivateDirectory(templateDir());const entries=await fs.readdir(templateDir(),{withFileTypes:true});const out=[];
  for(const entry of entries.slice(0,201)){
    if(!entry.isFile()||!/^[a-f0-9-]{36}\.(?:skoshpress|tinypress)$/.test(entry.name))continue;
    try{const file=path.join(templateDir(),entry.name),stat=await fs.stat(file);if(stat.size>MAX_PROJECT_BYTES)continue;
      const doc=normalizeProject(JSON.parse((await readBoundedRegularFile(file,MAX_PROJECT_BYTES,10)).toString('utf8')));out.push({id:entry.name.slice(0,entry.name.lastIndexOf('.')),name:doc.name,pages:doc.pages.length});
    }catch(_error){}
  }
  return out.sort((a,b)=>a.name.localeCompare(b.name));
});
ipcMain.handle('template:save',async(event,{name,document}={})=>{
  assertSender(event);
  if(typeof name!=='string'||!name.trim()||name.length>80)throw new Error('Template name must be 1–80 characters.');
  const doc=normalizeProject(document);doc.name=name.trim();const serialized=JSON.stringify(doc);
  if(Buffer.byteLength(serialized)>MAX_PROJECT_BYTES)throw new Error('Template exceeds the project size limit.');
  await ensurePrivateDirectory(templateDir());
  const {randomUUID}=require('node:crypto');const id=randomUUID();
  await fs.writeFile(templateFilename(id),serialized,{flag:'wx',mode:0o600});return {id,name:doc.name};
});
ipcMain.handle('template:load',async(event,id)=>{
  assertSender(event);const name=await existingTemplate(id);
  return normalizeProject(JSON.parse((await readBoundedRegularFile(name,MAX_PROJECT_BYTES,10)).toString('utf8')));
});
ipcMain.handle('template:delete',async(event,id)=>{assertSender(event);await fs.rm(await existingTemplate(id));return true;});




ipcMain.handle('export:interchange',async(event,{document:input,format}={})=>{
  assertSender(event);
  if(!['sla','rtf'].includes(format))throw new Error('Unsupported interchange format.');
  const document=outputDocument(normalizeProject(input));
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

// Publication Package
ipcMain.handle('export:package',async(event,input)=>{
  assertSender(event);
  const {buffer,files}=require('./lib/publication-package').buildPackage(input);
  const chooser=await dialog.showSaveDialog(mainWindow,{title:'Export editable publication package',defaultPath:'publication-package.zip',filters:[{name:'Publication archive',extensions:['zip']}]});
  if(chooser.canceled||!chooser.filePath)return null;
  const target=path.extname(chooser.filePath).toLowerCase()==='.zip'?chooser.filePath:chooser.filePath+'.zip';
  await writeAtomically(target,buffer);return {path:target,files,bytes:buffer.length};
});

// Publishing Formats
ipcMain.handle('export:publication',async(event,{document:input,format,html}={})=>{
  assertSender(event);
  if(!['docx','epub','txt','html'].includes(format))throw new Error('Unsupported publication export format.');
  const document=outputDocument(normalizeProject(input));
  let result;
  if(format==='html'){
    if(typeof html!=='string'||Buffer.byteLength(html,'utf8')>MAX_PROJECT_BYTES||!safeStandaloneHtml(html))throw new Error('HTML export requires validated markup and a restrictive document policy.');
    result=Buffer.from(html,'utf8');
  }else if(format==='docx')result=toDocx(document);
  else if(format==='epub')result=toEpub(document);
  else result=toPlainText(document);
  if(result.byteLength>MAX_PROJECT_BYTES)throw new Error('Export exceeds the 65 MB file limit.');
  const labels={docx:'Word manuscript (editable)',epub:'Reflowable EPUB (text and images)',txt:'Plain UTF-8 text',html:'Standalone paginated HTML'};
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
  const source=result.filePaths[0];
  const data=await readBoundedRegularFile(source,20*1024*1024,32);
  if(data.toString('ascii',0,4)!=='BDic')throw new Error('Not a Chromium .bdic dictionary.');
  await ensurePrivateDirectory(dictFolder());
  await writeAtomically(path.join(dictFolder(),dicName(language)),data);
  return {language,installed:true,restartRequired:true};
});
ipcMain.handle('dictionary:list',async event=>{
  assertSender(event);await ensurePrivateDirectory(dictFolder());const result=[];
  for(const language of languageTags){
    try{const info=await fs.lstat(path.join(dictFolder(),dicName(language)));if(info.isFile()&&info.size>32)result.push(language);}catch(_error){}
  }
  return {installed:result,platform:process.platform};
});
ipcMain.handle('dictionary:words',async(event)=>{
  assertSender(event);
  const chooser=await dialog.showOpenDialog(mainWindow,{title:'Add words to personal spelling dictionary',properties:['openFile'],filters:[{name:'Plain-text words (UTF-8, one per line)',extensions:['txt']}]});
  if(chooser.canceled||!chooser.filePaths.length)return null;
  const file=chooser.filePaths[0];
  const raw=(await readBoundedRegularFile(file,256*1024,1)).toString('utf8');
  const words=[...new Set(raw.split(/\r?\n/g).map(x=>x.trim()).filter(w=>w.length>0&&w.length<=70&&/^[\p{L}\p{M}'’-]+$/u.test(w)))].slice(0,5000);
  let added=0;for(const word of words)if(session.defaultSession.addWordToSpellCheckerDictionary(word))added++;
  return {added,total:words.length};
});

// Revision Loading
ipcMain.handle('revision:chooseBaseline',async event=>{
  assertSender(event);
  const pick=await dialog.showOpenDialog(mainWindow,{title:'Choose an older project to compare',properties:['openFile'],filters:[{name:'Skosh Press projects',extensions:['skoshpress','skoshcompact','tinypress','layoutlist']}]});
  if(pick.canceled||!pick.filePaths.length)return null;
  const file=pick.filePaths[0];
  const raw=JSON.parse((await readBoundedRegularFile(file,MAX_PROJECT_BYTES,10)).toString('utf8'));
  const document=path.extname(file).toLowerCase()==='.skoshcompact'?Compact.decode(raw):normalizeProject(raw);
  return {name:path.basename(file),document};
});

// Printer Storage
const printerStore=()=>path.join(app.getPath('userData'),'printer-profiles.json');
const sequencePrinters=createSerialQueue();
const printerId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
async function loadPrinters(){
  let data;
  try {data=JSON.parse((await readBoundedRegularFile(printerStore(),64000,2)).toString('utf8'));}
  catch(error){if(error.code==='ENOENT')return [];throw error;}
  if(!data||data.version!==1||!Array.isArray(data.profiles)||data.profiles.length>50)throw new Error('Printer profile storage is invalid.');
  const ids=new Set();
  return data.profiles.map(row=>{
    if(!printerId(row.id)||ids.has(row.id))throw new Error('A printer profile ID is invalid.');
    ids.add(row.id);return {id:row.id,...restorePrinterProfile(row)};
  });
}
async function writePrinters(rows){
  if(rows.length>50)throw new Error('Maximum of 50 printer profiles.');
  await writeAtomically(printerStore(),JSON.stringify({version:1,profiles:rows},null,2));
}
ipcMain.handle('printer:profiles:list',async event=>{assertSender(event);return sequencePrinters(loadPrinters);});
ipcMain.handle('printer:profiles:save',async(event,raw,id)=>{
  assertSender(event);
  if(id!==null&&id!==undefined&&!printerId(id))throw new Error('Invalid printer profile ID.');
  const row=validatePrinterProfile(raw);return sequencePrinters(async()=>{const existing=await loadPrinters();
  let resolved=id;
  if(resolved){const index=existing.findIndex(p=>p.id===resolved);if(index<0)throw new Error('Printer profile no longer exists.');existing[index]={id:resolved,...row};}
  else{if(existing.length>=50)throw new Error('Maximum of 50 printer profiles.');resolved=randomUUID();existing.push({id:resolved,...row});}
  await writePrinters(existing);return {id:resolved,...row};});
});
ipcMain.handle('printer:profiles:delete',async(event,id)=>{
  assertSender(event);if(!printerId(id))throw new Error('Invalid printer profile ID.');
  return sequencePrinters(async()=>{const rows=await loadPrinters();if(!rows.some(p=>p.id===id))throw new Error('Printer profile not found.');
  await writePrinters(rows.filter(p=>p.id!==id));return true;});
});
