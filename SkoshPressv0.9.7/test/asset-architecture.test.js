'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const Compact=require('../lib/compact-project');
const {normalizeProject}=require('../lib/projects');
const {createAssetLibrary}=require('../lib/asset-library');
const {create,capture,restore}=require('../lib/editor-history');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=';
const fixture=(count=4,src=image)=>({format:'skosh-press-1',name:'Archive',paper:{width:148,height:210,margin:16},pages:Array.from({length:count},(_,i)=>({id:'p'+i,frames:[{id:'f'+i,type:'image',label:'Portrait',src,x:1,y:1,w:20,h:20,alt:'Caption '+i}]}))});
test('compact project shares identical binary payloads without changing placements or the source',()=>{
  const doc=fixture(),before=structuredClone(doc),value=JSON.parse(Compact.encode(doc));
  assert.deepEqual(doc,before);assert.equal(value.assets.length,1);assert.ok(value.project.pages.every(p=>p.frames[0].src===0));
  assert.deepEqual(Compact.decode(value),normalizeProject(before));
});
test('compact projects reject bad references, surplus entries, invalid binary data and oversized expansion',()=>{
  const raw=()=>JSON.parse(Compact.encode(fixture()));
  let value=raw();value.project.pages[0].frames[0].src=-1;assert.throws(()=>Compact.decode(value),/asset reference/);
  value=raw();value.assets[0].kind='font';assert.throws(()=>Compact.decode(value),/asset reference/);
  value=raw();value.assets.push({kind:'image',data:image+'x'});assert.throws(()=>Compact.decode(value),/Unused/);
  value=raw();value.assets[0].data='not an image';assert.throws(()=>Compact.decode(value),/Invalid image/);
  value=raw();value.assets[0].data='x'.repeat(18*1024*1024);assert.throws(()=>Compact.decode(value),/Expanded project/);
});
test('persistent asset library deduplicates and validates data, and deletion never affects publications',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-assets-'));
  try{const doc=fixture(),library=createAssetLibrary(folder),payload={kind:'image',name:'Portrait',src:image,path:'/untrusted'};
    const [first,second]=await Promise.all([library.save(payload),library.save({...payload,name:'Duplicate'})]);assert.equal(first.id,second.id);
    const restarted=createAssetLibrary(folder),rows=await restarted.list();assert.deepEqual(rows,[first]);assert.equal(rows[0].src,undefined);
    const loaded=await restarted.load(first.id);assert.equal(loaded.src,image);assert.equal(loaded.path,undefined);
    await assert.rejects(restarted.save({...payload,src:'file:///etc/passwd'}),/Invalid library image/);
    await assert.rejects(restarted.load('../outside'),/Invalid asset identifier/);
    await restarted.remove(first.id);assert.deepEqual(await restarted.list(),[]);assert.equal(doc.pages[0].frames[0].src,image);
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('asset storage rejects symlinked files and corrupted identifiers',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-assets-'));
  try{const other=path.join(folder,'other'),file=path.join(folder,'reusable-assets.json');await fs.writeFile(other,'[]');await fs.symlink(other,file,'file');
    await assert.rejects(createAssetLibrary(folder).list(),/regular file/);assert.equal(await fs.readFile(other,'utf8'),'[]');await fs.unlink(file);
    await fs.writeFile(file,JSON.stringify([{kind:'image',name:'Portrait',src:image,id:'wrong'}]));await assert.rejects(createAssetLibrary(folder).list(),/identifier/);
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('incremental history shares repeated artwork and changed frames within a tight budget',()=>{
  const src=image+'x'.repeat(100000),state={doc:fixture(40,src),index:0,selected:null,dirty:false,undo:[],redo:[]},history=create({maxBytes:180000});
  const original=structuredClone(state.doc);
  for(let i=0;i<10;i++)history.transaction(state,()=>{state.doc.pages[39].frames[0].x+=1;},()=>{});
  assert.equal(state.undo.length,10);assert.ok(history.bytes(state.undo)<180000);
  for(let i=0;i<10;i++)assert.equal(history.travel(state,'undo'),true);
  assert.deepEqual(state.doc,original);for(let i=0;i<10;i++)assert.equal(history.travel(state,'redo'),true);assert.equal(state.doc.pages[39].frames[0].x,11);
});
test('history preserves page order, embedded font data, optional metadata and rollback',()=>{
  const doc={...fixture(),fonts:[{id:'font-example',name:'Example',data:'data:font/ttf;base64,test'}],stories:{story:{html:'<p>Text</p>'}}};
  assert.deepEqual(restore(capture(doc)),doc);
  const state={doc,index:0,selected:'f0',dirty:false,undo:[],redo:[]},history=create();
  history.transaction(state,()=>{state.doc.pages.reverse();state.doc.fonts=[];},()=>{});
  assert.equal(state.doc.pages[0].id,'p3');history.travel(state,'undo');assert.equal(state.doc.pages[0].id,'p0');assert.equal(state.doc.fonts[0].id,'font-example');
  const before=structuredClone(state.doc);assert.throws(()=>history.transaction(state,()=>{state.doc.pages.pop();throw Error('Rollback');},()=>{}),/Rollback/);assert.deepEqual(state.doc,before);assert.equal(state.redo.length,1);
});
test('compact and library storage preserve validated compiled font data and independent font IDs',async()=>{
 const V=require('../lib/vector-font'),font=V.buildTTF({A:V.rectangle(150,200,350,500)},'Example',{}),data='data:font/ttf;base64,'+Buffer.from(font).toString('base64');
 const doc=fixture();doc.fonts=[{id:'font-one',name:'One',data},{id:'font-two',name:'Two',data}];
 const value=JSON.parse(Compact.encode(doc));assert.equal(value.assets.length,2);assert.equal(value.project.fonts[0].data,value.project.fonts[1].data);assert.deepEqual(Compact.decode(value).fonts,doc.fonts);
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-font-assets-'));
 try{const library=createAssetLibrary(folder),row=await library.save({kind:'font',name:'Example',data});assert.equal((await library.load(row.id)).data,data);await assert.rejects(library.save({kind:'font',name:'Bad',data:'data:font/ttf;base64,AAAA'}),/Invalid/);}finally{await fs.rm(folder,{recursive:true,force:true});}
});
