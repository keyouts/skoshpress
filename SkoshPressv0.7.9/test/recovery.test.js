'use strict';
// Recovery Regression
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createRecoveryStore,recoveryPath}=require('../lib/recovery');
function example(){return {format:'skosh-press-1',name:'Unsent edits',paper:{width:148,height:210,margin:16,preset:'a5'},pages:[{id:'page',frames:[{id:'frame',type:'text',label:'Paragraph',html:'<p>Still typing</p>',x:15,y:20,w:100,h:80,style:{font:'Georgia',fontSize:12,leading:1.45}}]}],fonts:[],stories:{}};}
async function temporary(fn){const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-recovery-'));try{await fn(folder);}finally{await fs.rm(folder,{recursive:true,force:true});}}
test('captures editable documents and restores them without altering the source',()=>temporary(async folder=>{
 const store=createRecoveryStore(folder);const doc=example();
 assert.equal(await store.read(),null);
 assert.equal(await store.save(doc,'older.skoshpress'),true);
 const restored=await store.read();
 assert.equal(restored.document.pages[0].frames[0].html,'<p>Still typing</p>');
 assert.equal(restored.sourceName,'older.skoshpress');
 doc.pages[0].frames[0].html='<p>Different</p>';
 assert.equal((await store.read()).document.pages[0].frames[0].html,'<p>Still typing</p>');
 await store.clear();assert.equal(await store.read(),null);
}));
test('rejects malformed, oversized, and symlinked recovery files',()=>temporary(async folder=>{
 const store=createRecoveryStore(folder);await fs.mkdir(path.dirname(store.path),{recursive:true});
 await fs.writeFile(store.path,'{}');await assert.rejects(store.read(),/valid regular file/);
 await fs.writeFile(store.path,JSON.stringify({schema:1,savedAt:Date.now(),sourceName:'file',document:{pages:[]}}));
 await assert.rejects(store.read(),/invalid/);
 await fs.rm(store.path);
 const target=path.join(folder,'outside.json');await fs.writeFile(target,JSON.stringify(example()));
 await fs.symlink(target,store.path);await assert.rejects(store.read(),/valid regular file/);
}));
test('clearing invalidates pending writes without changing other files',()=>temporary(async folder=>{
 const store=createRecoveryStore(folder);const doc=example();
 const pending=store.save(doc,'original.skoshpress');const cleared=store.clear();
 await Promise.all([pending,cleared]);
 assert.equal(await store.read(),null);
 const existing=path.join(folder,'book.skoshpress');await fs.writeFile(existing,JSON.stringify(doc));
 await store.save(doc,'book.skoshpress');await store.clear();
 assert.equal(JSON.parse(await fs.readFile(existing,'utf8')).name,'Unsent edits');
}));
test('recovery is restricted to validated publication content',()=>temporary(async folder=>{
 const store=createRecoveryStore(folder);
 const malicious=example();malicious.pages[0].frames[0].html='x'.repeat(5_000_001);
 await assert.rejects(store.save(malicious),/Invalid text frame/);
 assert.equal(await store.read(),null);
 const location=recoveryPath(folder);assert.ok(location.startsWith(folder+path.sep));
}));
