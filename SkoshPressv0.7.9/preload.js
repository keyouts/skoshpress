'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const actions=['new','open','save','saveAs','import','font','export','undo','redo','theme','settings','templates','find','scribus','indesign','revisions','printlab'];
contextBridge.exposeInMainWorld('skoshPressAPI',Object.freeze({
  openProject:()=>ipcRenderer.invoke('project:open'),
  snapshotRecovery:document=>ipcRenderer.invoke('recovery:snapshot',document),
  checkRecovery:()=>ipcRenderer.invoke('recovery:startup'),
  clearRecovery:()=>ipcRenderer.invoke('recovery:clear'),
  reportDirty:dirty=>{if(typeof dirty==='boolean')ipcRenderer.send('window:dirty-state',dirty);},
  onSaveBeforeClose:fn=>{
    if(typeof fn!=='function')return ()=>{};
    const listener=async(_event,token)=>{
      let saved=false;
      try{saved=(await fn())===true;}catch(_error){saved=false;}
      ipcRenderer.send('window:save-before-close-result',token,saved);
    };
    ipcRenderer.on('window:save-before-close',listener);
    return ()=>ipcRenderer.removeListener('window:save-before-close',listener);
  },
  setSpelling:(enabled,language)=>ipcRenderer.invoke('spellcheck:set',enabled,language),
  resetProjectPath:()=>ipcRenderer.invoke('project:resetPath'),
  saveProject:(document,saveAs=false)=>ipcRenderer.invoke('project:save',{document,saveAs}),
  importManuscript:()=>ipcRenderer.invoke('manuscript:import'),
  importImage:()=>ipcRenderer.invoke('image:import'),
  importFont:()=>ipcRenderer.invoke('font:import'),
  exportPdf:(html,widthMm,heightMm,booklet=false)=>ipcRenderer.invoke('export:pdf',{html,widthMm,heightMm,booklet}),
  exportInterchange:(document,format)=>ipcRenderer.invoke('export:interchange',{document,format}),
  listDictionaries:()=>ipcRenderer.invoke('dictionary:list'),
  importDictionary:language=>ipcRenderer.invoke('dictionary:import',language),
  importWords:()=>ipcRenderer.invoke('dictionary:words'),
  chooseRevisionBaseline:()=>ipcRenderer.invoke('revision:chooseBaseline'),
  listPrinterProfiles:()=>ipcRenderer.invoke('printer:profiles:list'),
  savePrinterProfile:(profile,id=null)=>ipcRenderer.invoke('printer:profiles:save',profile,id),
  deletePrinterProfile:id=>ipcRenderer.invoke('printer:profiles:delete',id),
  listTemplates:()=>ipcRenderer.invoke('template:list'),
  saveTemplate:(name,document)=>ipcRenderer.invoke('template:save',{name,document}),
  loadTemplate:id=>ipcRenderer.invoke('template:load',id),
  deleteTemplate:id=>ipcRenderer.invoke('template:delete',id),
  onMenu:fn=>{
    if(typeof fn!=='function')return ()=>{};
    const list=actions.map(action=>{
      const name='menu:'+action,listener=()=>fn(action);
      ipcRenderer.on(name,listener);return [name,listener];
    });
    return ()=>list.forEach(([name,listener])=>ipcRenderer.removeListener(name,listener));
  }
}));
