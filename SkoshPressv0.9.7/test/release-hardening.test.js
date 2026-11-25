'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {buildPackage,openPackage}=require('../lib/publication-package');
const {readPackageEntries}=require('../lib/package-reader');
const {makeZip}=require('../lib/publishing-exports');
const {inventory,matchesAsset}=require('../lib/project-workspace');
const {create}=require('../lib/editor-recovery');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=';
const frame={id:'one',type:'image',label:'Portrait',src:image,x:1,y:1,w:20,h:20,alt:'Portrait of a relative'};
const fixture=()=>({format:'skosh-press-1',name:'Archive',paper:{width:148,height:210,margin:16},pages:[{id:'p',frames:[{...frame}]},{id:'q',frames:[{...frame,id:'two',label:'Family photograph',alt:'',decorative:true}]}]});
const contents=buffer=>[...readPackageEntries(buffer)].map(([name,content])=>({name,content}));
test('verified packages reopen as complete editable documents',()=>{
  const doc=fixture(),before=JSON.stringify(doc),{buffer}=buildPackage(doc),restored=openPackage(buffer);
  assert.equal(restored.version,4);assert.deepEqual(restored.pages,doc.pages);assert.equal(JSON.stringify(doc),before);
});
test('package verification rejects damaged headers, truncated archives, and unexpected entries',()=>{
  const {buffer}=buildPackage(fixture());const damaged=Buffer.from(buffer);damaged[14]^=1;
  assert.throws(()=>openPackage(damaged),/archive/);assert.throws(()=>openPackage(buffer.subarray(0,-1)),/archive/);
  assert.throws(()=>openPackage(makeZip([...contents(buffer),{name:'unlisted.txt',content:'extra'}])),/archive/);
});
test('package verification rejects forged asset contents even with updated manifest hashes',()=>{
  const rows=contents(buildPackage(fixture()).buffer),asset=rows.find(r=>r.name.startsWith('images/')),manifest=rows.find(r=>r.name==='manifest.json');
  asset.content=Buffer.from('replacement');const data=JSON.parse(manifest.content),item=data.files.find(r=>r.name===asset.name);
  item.bytes=asset.content.length;item.sha256=createHash('sha256').update(asset.content).digest('hex');manifest.content=JSON.stringify(data);
  assert.throws(()=>openPackage(makeZip(rows)),/integrity verification/);
});
test('archive manifest cannot omit entries or list the same entry twice',()=>{
  const rows=contents(buildPackage(fixture()).buffer),manifest=rows.find(r=>r.name==='manifest.json'),data=JSON.parse(manifest.content);
  data.files[1]=data.files[0];manifest.content=JSON.stringify(data);assert.throws(()=>openPackage(makeZip(rows)),/integrity verification/);
});
test('asset aliases are searchable and differing placement descriptions require review',()=>{
  const [row]=inventory(fixture()).images;assert.equal(row.uses,2);assert.equal(row.alt,'');assert.equal(row.decorative,false);assert.equal(row.mixedDescriptions,true);
  assert.ok(matchesAsset(row,'family photograph'));assert.ok(matchesAsset(row,'page 2'));assert.ok(!matchesAsset(row,'unknown'));
});
test('recovery captures changes requested during a pending snapshot',async()=>{
  let doc={name:'First'},release;const writes=[];
  const recovery=create({enabled:()=>true,capture:()=>doc,write:async value=>{writes.push(value.name);if(writes.length===1)await new Promise(resolve=>release=resolve);return {saved:true};},clear:async()=>{},onError:error=>{throw error;}});
  const first=recovery.snapshot();doc={name:'Second'};const second=recovery.snapshot();release();await Promise.all([first,second]);assert.deepEqual(writes,['First','Second']);
});
test('atomic storage preserves the previous file when a commit is cancelled',async()=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{writeAtomically}=require('../lib/file-guards');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-write-'));
  try{const file=path.join(directory,'document');await fs.writeFile(file,'original');assert.equal(await writeAtomically(file,'cancelled',()=>false),false);assert.equal(await fs.readFile(file,'utf8'),'original');assert.equal(await writeAtomically(file,Buffer.from('updated')),true);assert.equal(await fs.readFile(file,'utf8'),'updated');assert.deepEqual(await fs.readdir(directory),['document']);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('font library refuses a redirected local storage directory',async()=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createLibrary}=require('../lib/font-library');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-library-'));
  try{const external=path.join(directory,'external');await fs.mkdir(external);await fs.symlink(external,path.join(directory,'typography-library'),'junction');await assert.rejects(createLibrary(directory).list(),/not a valid directory/);assert.deepEqual(await fs.readdir(external),[]);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
