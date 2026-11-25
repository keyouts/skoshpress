'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {makeZip,crc32}=require('../lib/publishing-exports');
const {unzipEntry,parseDocx,docxXmlToHtml}=require('../lib/docx');
const {buildZip}=require('../lib/font-family-package');
const {normalizeProject,validImageData}=require('../lib/projects');
const Compact=require('../lib/compact-project');
const {createAssetLibrary}=require('../lib/asset-library');
const {createLibrary}=require('../lib/font-library');
const {createSerialQueue}=require('../lib/file-guards');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=';
const frame={id:'f1',type:'image',label:'Image',x:1,y:1,w:20,h:20,src:image};
const fixture=()=>({format:'skosh-press-1',name:'Archive',paper:{width:148,height:210,margin:16},pages:[{id:'p1',frames:[{...frame}]}]});
const xml='<w:document><w:body><w:p><w:r><w:t>Original manuscript</w:t></w:r></w:p></w:body></w:document>';
const zip=()=>makeZip([{name:'word/document.xml',content:xml,store:true},{name:'word/footnotes.xml',content:'<w:footnotes/>',store:true}]);
test('DOCX import rejects corrupted stored text and malformed optional entries',()=>{
 const data=zip(),changed=Buffer.from(data),offset=30+changed.readUInt16LE(26);changed[offset+5]^=1;
 assert.throws(()=>parseDocx(changed),/checksum/);
 const second=offset+Buffer.byteLength(xml),bad=Buffer.from(data);bad[second+30]^=1;
 assert.throws(()=>parseDocx(bad),/Corrupt DOCX/);
 const trailing=Buffer.concat([data,Buffer.from('unrecognized suffix')]);assert.throws(()=>parseDocx(trailing),/valid DOCX/);
 assert.match(parseDocx(data),/Original manuscript/);
});
test('DOCX import rejects aliased central records and accepts standard data descriptors',()=>{
 const data=zip(),directory=data.readUInt32LE(data.length-6),second=directory+46+data.readUInt16LE(directory+28),bad=Buffer.from(data);
 bad.writeUInt32LE(0,second+42);assert.throws(()=>parseDocx(bad),/Corrupt DOCX/);
 const source=makeZip([{name:'word/document.xml',content:xml,store:true}]),end=source.length-22,dir=source.readUInt32LE(end+16);
 const local=Buffer.from(source.subarray(0,dir)),central=Buffer.from(source.subarray(dir,end)),footer=Buffer.from(source.subarray(end));
 const descriptor=Buffer.alloc(16);descriptor.writeUInt32LE(0x08074b50,0);descriptor.writeUInt32LE(crc32(Buffer.from(xml)),4);descriptor.writeUInt32LE(Buffer.byteLength(xml),8);descriptor.writeUInt32LE(Buffer.byteLength(xml),12);
 local.writeUInt16LE(0x808,6);local.fill(0,14,26);central.writeUInt16LE(0x808,8);footer.writeUInt32LE(dir+16,16);
 assert.match(parseDocx(Buffer.concat([local,descriptor,central,footer])),/Original manuscript/);
 assert.equal(unzipEntry(source,'word/document.xml'),xml);
});
test('compact decoding is repeatable and leaves input untouched even on failure',()=>{
 const data=JSON.parse(Compact.encode(fixture())),before=structuredClone(data);
 assert.deepEqual(Compact.decode(data),Compact.decode(data));assert.deepEqual(data,before);
 const bad=structuredClone(data);bad.project.pages[0].frames.push({...bad.project.pages[0].frames[0],id:'other',src:99});const original=structuredClone(bad);
 assert.throws(()=>Compact.decode(bad),/reference/);assert.deepEqual(bad,original);
});
test('malformed project metadata cannot create linked image frames or invalid font collections',()=>{
 const doc=fixture();doc.pages[0].frames[0].storyId='story';assert.throws(()=>normalizeProject(doc),/Invalid story link/);
 assert.throws(()=>normalizeProject({...fixture(),fontDesigns:[null]}),/Invalid typography studio design/);
 assert.throws(()=>normalizeProject({...fixture(),fonts:false}),/Invalid project font list/);
});
test('dimension checks reject oversized and incomplete image headers across raster formats',()=>{
 const url=(type,bytes)=>`data:image/${type};base64,${bytes.toString('base64')}`;
 const gif=Buffer.alloc(13);gif.write('GIF89a');gif.writeUInt16LE(10,6);gif.writeUInt16LE(10,8);assert.ok(validImageData(url('gif',gif)));gif.writeUInt16LE(65535,6);assert.ok(!validImageData(url('gif',gif)));
 const jpeg=Buffer.from('ffd8ffc0000b08000a000a01011100ffd9','hex');assert.ok(validImageData(url('jpeg',jpeg)));jpeg.writeUInt16BE(30000,7);assert.ok(!validImageData(url('jpeg',jpeg)));assert.ok(!validImageData(url('jpeg',Buffer.from('ffd8ff000000000000000000','hex'))));
 const webp=Buffer.alloc(30);webp.write('RIFF');webp.writeUInt32LE(22,4);webp.write('WEBPVP8X',8);webp.writeUInt32LE(10,16);assert.ok(validImageData(url('webp',webp)));webp.writeUIntLE(20000,24,3);assert.ok(!validImageData(url('webp',webp)));
 assert.ok(validImageData(image));
});
test('shared checksum and font archive reject duplicate entry names',()=>{
 assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);assert.equal(require('../lib/font-family-package').crc32(Buffer.from('123456789')),0xcbf43926);
 assert.throws(()=>buildZip([['same.txt','one'],['same.txt','two']]),/duplicate/);
 assert.equal(docxXmlToHtml(xml.replace('Original manuscript','&#X41;')),'<p>A</p>');
});
test('asset storage rejects redirected roots and returns the actual saved duplicate name',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-integrity-'));
 try{const real=path.join(root,'actual'),link=path.join(root,'redirect');await fs.mkdir(real);await fs.symlink(real,link,'junction');await assert.rejects(createAssetLibrary(link).list(),/valid directory/);await assert.rejects(createAssetLibrary(link).save({kind:'image',name:'Photo',src:image}),/valid directory/);assert.deepEqual(await fs.readdir(real),[]);
 const library=createAssetLibrary(real),first=await library.save({kind:'image',name:'Original',src:image});assert.deepEqual(await library.save({kind:'image',name:'Duplicate',src:image}),first);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('font library capacity remains enforced during concurrent saves',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-type-integrity-'));
 try{const library=createLibrary(root),design=i=>({id:`font-${i}`,name:`Font ${i}`,kind:'vector',glyphs:{},spacing:0,advances:{},kerning:{},components:{},componentLinks:{},variants:{}});
 const folder=path.join(root,'typography-library');await fs.mkdir(folder);await Promise.all(Array.from({length:79},(_,i)=>fs.writeFile(path.join(folder,`font-${i}.json`),JSON.stringify(design(i)))));
 const result=await Promise.allSettled([library.save(design(79)),library.save(design(80))]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);assert.equal((await library.list()).length,80);assert.equal((await fs.readdir(folder)).length,80);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('shared storage queue continues in order after a rejected operation',async()=>{
 const queue=createSerialQueue(),events=[];const first=queue(async()=>{events.push('first');throw Error('failure');});const second=queue(()=>events.push('second'));await assert.rejects(first,/failure/);await second;assert.deepEqual(events,['first','second']);
});
