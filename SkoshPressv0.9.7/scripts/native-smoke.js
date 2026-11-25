'use strict';
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict');
async function main(){
  const folder=require('node:fs').mkdtempSync(path.join(os.tmpdir(),'skosh-native-'));
  let status=1;
  try{
    app.setPath('appData',folder);
    const projectPath=path.join(folder,'proof.skoshpress'),pdfPath=path.join(folder,'proof.pdf');
    let target=projectPath;
    dialog.showSaveDialog=async()=>({canceled:false,filePath:target});
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[projectPath]});
    require('../main');
    const deadline=Date.now()+30000;
    let win;
    while(Date.now()<deadline){
      win=BrowserWindow.getAllWindows()[0];
      if(win&&!win.webContents.isLoading()&&win.webContents.getURL()==='skosh://app/src/index.html')break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(win&&!win.webContents.isLoading(),'Editor did not load');
    const wc=win.webContents;
    assert.equal(wc.getURL(),'skosh://app/src/index.html');
    const prefs=wc.getLastWebPreferences();
    assert.equal(prefs.sandbox,true);assert.equal(prefs.contextIsolation,true);assert.equal(prefs.nodeIntegration,false);
    assert.equal(await wc.executeJavaScript("typeof window.skoshPressAPI?.saveProject"),'function');
    assert.equal(await wc.executeJavaScript("typeof require"),'undefined');
    const project={format:'skosh-press-1',name:'Native proof',paper:{width:148,height:210,margin:16},pages:[{id:'p',frames:[]}]};
    const saved=await wc.executeJavaScript(`window.skoshPressAPI.saveProject(${JSON.stringify(project)},true)`);
    assert.equal(saved.path,projectPath);
    const opened=await wc.executeJavaScript('window.skoshPressAPI.openProject()');assert.equal(opened.project.name,project.name);
    target=pdfPath;
    const html='<html><head><style>@page{size:148mm 210mm;margin:0}</style></head><body><p>Native proof</p></body></html>';
    await wc.executeJavaScript(`window.skoshPressAPI.exportPdf(${JSON.stringify(html)},148,210)`);
    const pdf=await fs.readFile(pdfPath);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
    const box=pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    assert.ok(box,'PDF page box not found');assert.ok(Math.abs(Number(box[1])-148*72/25.4)<2);assert.ok(Math.abs(Number(box[2])-210*72/25.4)<2);
    console.log('PASS native editor, isolated preload, project round trip and PDF dimensions');status=0;
  }catch(error){console.error(error);}
  finally{
    for(const win of BrowserWindow.getAllWindows())win.destroy();
    await fs.rm(folder,{recursive:true,force:true}).catch(error=>{console.error(error);status=1;});
    app.exit(status);
  }
}
void main();
