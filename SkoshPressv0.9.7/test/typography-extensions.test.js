'use strict';
// Typography Extensions
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const Pixel=require('../lib/pixel-font');
const Vector=require('../lib/vector-font');
const Components=require('../lib/glyph-components');
const Integrity=require('../lib/font-integrity');
const Variations=require('../lib/font-variations');
const {createLibrary}=require('../lib/font-library');
const {buildFamilyPackage}=require('../lib/font-family-package');
const {validateProject}=require('../lib/projects');
const {verifyFontBinary}=require('../lib/fonts');
const contour=Vector.rectangle(90,110,250,490);
function table(buffer,tag){
  for(let i=0;i<buffer.readUInt16BE(4);i++)if(buffer.toString('ascii',12+i*16,16+i*16)===tag)return buffer.readUInt32BE(12+i*16+8);
  throw new Error(`Missing ${tag}`);
}
function glyphId(buffer,codepoint){
  const cmap=table(buffer,'cmap'),count=buffer.readUInt16BE(cmap+2);
  let format4=-1;
  for(let i=0;i<count;i++){
    const sub=cmap+buffer.readUInt32BE(cmap+4+i*8+4);
    if(buffer.readUInt16BE(sub)===4){format4=sub;break;}
  }
  if(format4<0)return 0;
  const n=buffer.readUInt16BE(format4+6)/2,ends=format4+14,starts=ends+n*2+2,deltas=starts+n*2,offsets=deltas+n*2;
  for(let i=0;i<n;i++){
    const end=buffer.readUInt16BE(ends+i*2),start=buffer.readUInt16BE(starts+i*2);
    if(codepoint<start||codepoint>end)continue;
    const off=buffer.readUInt16BE(offsets+i*2),delta=buffer.readUInt16BE(deltas+i*2);
    if(!off)return (codepoint+delta)&65535;
    const at=offsets+i*2+off+2*(codepoint-start);
    return (buffer.readUInt16BE(at)+delta)&65535;
  }
  return 0;
}
const design=()=>({id:'font-unicode-test',name:'Accent Sample',kind:'vector',glyphs:{A:contour,'é':contour,'€':contour},spacing:10,advances:{'é':720},kerning:{'Aé':-70},components:{},componentLinks:{},variants:{}});
test('Unicode output maps authored Latin and editorial symbols to TrueType glyph IDs',()=>{
  assert.equal(Pixel.CHARS.length,95);
  assert.ok(Pixel.ALL_CHARS.includes('é')&&Pixel.ALL_CHARS.includes('€')&&Pixel.ALL_CHARS.includes('Ł'));
  const font=Buffer.from(Vector.buildTTF(design().glyphs,'Accent Sample',design()));
  assert.equal(verifyFontBinary(font,'font/ttf'),true);
  assert.equal(glyphId(font,65),34);
  assert.ok(glyphId(font,0xe9)>95);
  assert.ok(glyphId(font,0x20ac)>95);
  assert.equal(glyphId(font,0x141),0);
  assert.equal(font.readUInt16BE(table(font,'OS/2')+66),0x20ac);
  assert.equal(Vector.advanceFor(design(),'é'),730);
  assert.equal(Variations.valid({Bold:{glyphs:{'é':contour}}}),true);
});
test('glyph components reuse source contours and reflect edits without baking',()=>{
  const components={'component-serif':{name:'Serif',glyph:[contour[0]]}};
  const links={'É':[{id:'component-serif',dx:15,dy:20,scale:100}],A:[{id:'component-serif',dx:0,dy:0,scale:50}]};
  assert.equal(Components.valid(components,links),true);
  const before=Components.resolve([],components,links['É']);
  components['component-serif'].glyph[0][0][0]+=20;
  const after=Components.resolve([],components,links['É']);
  assert.equal(after[0][0][0],before[0][0][0]+20);
  assert.deepEqual(links['É'][0],{id:'component-serif',dx:15,dy:20,scale:100});
  assert.equal(Components.valid(components,{'É':[{id:'component-unknown',dx:0,dy:0,scale:100}]}),false);
  const data={...design(),components,componentLinks:links};
  assert.equal(validateProject({format:'skosh-press-1',name:'Typeface Book',paper:{width:148,height:210,margin:15},pages:[{frames:[]}],fontDesigns:[data]}).name,'Typeface Book');
  assert.equal(Integrity.inspect(data).ready,true);
  const composite=Components.resolve(data.glyphs.A,data.components,data.componentLinks.A);
  assert.equal(verifyFontBinary(Buffer.from(Vector.buildTTF({A:composite},'Component Test')),'font/ttf'),true);
});
test('Font Integrity reports character coverage and invalid linked placements',()=>{
  const good=Integrity.inspect(design());
  assert.equal(good.ready,true);
  assert.equal(good.extended,2);
  assert.ok(good.issues.some(i=>i.message.includes('extended characters')));
  const invalid=design();invalid.componentLinks={A:[{id:'missing',dx:0,dy:0,scale:100}]};
  const report=Integrity.inspect(invalid);
  assert.equal(report.ready,false);
  assert.ok(report.issues.some(i=>i.level==='error'));
});
test('independent library survives save and reload and rejects invalid paths',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-type-library-'));
  try{
    const first=createLibrary(root),second=createLibrary(root);
    await first.save(design());
    assert.equal((await second.list())[0].name,'Accent Sample');
    assert.deepEqual(await second.load('font-unicode-test'),design());
    await assert.rejects(()=>second.load('../outside'),/Invalid library font identifier/);
    await assert.rejects(()=>first.save({...design(),name:'',glyphs:{}}),/valid editable/);
    await second.remove('font-unicode-test');
    assert.deepEqual(await first.list(),[]);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('complete family export has verified TTF files, metadata and ZIP CRCs',()=>{
  const buffer=Buffer.from(Vector.buildTTF({A:contour,'é':contour},'Export Family'));
  const encoded='data:font/ttf;base64,'+buffer.toString('base64');
  const zip=buildFamilyPackage('Export Family',[{style:'Regular',data:encoded},{style:'Bold',data:encoded}]);
  assert.equal(zip.readUInt32LE(0),0x04034b50);
  const localNameLength=zip.readUInt16LE(26);
  assert.equal(zip.toString('utf8',30,30+localNameLength),'Export Family-Regular.ttf');
  const fileStart=30+localNameLength;
  assert.deepEqual(zip.subarray(fileStart,fileStart+buffer.length),buffer);
  const end=zip.length-22;
  assert.equal(zip.readUInt32LE(end),0x06054b50);
  assert.equal(zip.readUInt16LE(end+10),3);
  assert.throws(()=>buildFamilyPackage('Duplicate',[{style:'Regular',data:encoded},{style:'Regular',data:encoded}]),/duplicate/i);
  assert.throws(()=>buildFamilyPackage('Invalid',[{style:'Regular',data:'data:font/ttf;base64,Zg=='}]),/Invalid TrueType/);
});
test('secure UI includes font library, linked components, integrity report and family export controls',async()=>{
  const html=await fs.readFile(path.join(__dirname,'../src/index.html'),'utf8');
  const app=await fs.readFile(path.join(__dirname,'../src/app.js'),'utf8');
  const preload=await fs.readFile(path.join(__dirname,'../preload.js'),'utf8');
  const main=await fs.readFile(path.join(__dirname,'../main.js'),'utf8');
  for(const id of ['studio-library-picker','studio-library-load','studio-library-save','studio-library-delete','studio-component-create','studio-component-update','studio-component-place','studio-component-unlink','studio-integrity-run','studio-export-family'])assert.ok(html.includes(`id="${id}"`),id);
  assert.match(app,/Components\.resolve/);
  assert.match(app,/Integrity\.inspect/);
  assert.match(preload,/font:exportFamily/);
  assert.match(main,/font:library:save/);
});
