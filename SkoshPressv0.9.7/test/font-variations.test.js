'use strict';
// Variation Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const Vector=require('../lib/vector-font');
const Variations=require('../lib/font-variations');
const {validateProject,normalizeProject}=require('../lib/projects');
const {verifyFontBinary}=require('../lib/fonts');
const rect=Vector.rectangle(175,220,330,470),circle=Vector.ellipse();
function table(data,name){
  const n=data.readUInt16BE(4);
  for(let i=0;i<n;i++)if(data.toString('ascii',12+i*16,16+i*16)===name)return data.readUInt32BE(12+i*16+8);
  throw new Error('Missing table '+name);
}
test('four face designs produce real weight, slant, and name metadata',()=>{
  const expected={Regular:[400,64,0,0,'Regular'],Light:[300,64,0,0,'Light'],Bold:[700,32,1,0,'Bold'],Italic:[400,1,2,-12,'Italic']};
  for(const [style,[weight,selection,mac,angle,label]] of Object.entries(expected)){
    const data=Buffer.from(Vector.buildTTF({A:rect},'Skosh Family',{style}));
    assert.equal(verifyFontBinary(data,'font/ttf'),true);
    assert.equal(data.readUInt16BE(table(data,'OS/2')+4),weight);
    assert.equal(data.readUInt16BE(table(data,'OS/2')+62),selection);
    assert.equal(data.readUInt16BE(table(data,'head')+44),mac);
    assert.equal(data.readInt32BE(table(data,'post')+4)/65536,angle);
    const names=table(data,'name'),count=data.readUInt16BE(names+2),storage=names+data.readUInt16BE(names+4);
    const entry=Array.from({length:count},(_,i)=>names+6+i*12).find(pos=>data.readUInt16BE(pos+6)===2);
    assert.ok(entry);
    const text=data.subarray(storage+data.readUInt16BE(entry+10),storage+data.readUInt16BE(entry+10)+data.readUInt16BE(entry+8));
    assert.equal(text.swap16().toString('utf16le'),label);
  }
});
test('variation generator produces editable independent outlines and safely falls back',()=>{
  const baseline={A:circle,B:rect};
  for(const face of Variations.OPTIONAL){
    const {face:made,simplified}=Variations.create(baseline,face,char=>char==='C'?rect:[]);
    assert.equal(Object.keys(made.glyphs).length,95);
    assert.equal(Variations.valid({[face]:made}),true);
    assert.ok(made.glyphs.A.length);
    assert.ok(simplified>=0);
    assert.notEqual(made.glyphs.A,baseline.A);
    const font=Buffer.from(Vector.buildTTF({A:made.glyphs.A},'Skosh Test',{style:face}));
    assert.equal(verifyFontBinary(font,'font/ttf'),true);
  }
  assert.equal(Variations.fontId('font-example','Regular'),'font-example');
  assert.equal(Variations.fontId('font-example','Bold'),'font-example-bold');
});
test('variation validation rejects unexpected face names and malformed shapes',()=>{
  assert.equal(Variations.valid({Light:{glyphs:{A:rect}}}),true);
  assert.equal(Variations.valid({Thin:{glyphs:{A:rect}}}),false);
  assert.equal(Variations.valid({Light:{glyphs:{A:[[]]}}}),false);
  assert.equal(Variations.valid({Italic:{glyphs:{AA:rect}}}),false);
  assert.equal(Variations.valid([]),false);
  assert.throws(()=>Variations.fontId('font-sample','Black'),/Invalid/);
});
test('saved editable font families validate, reopen, and retain older designs',()=>{
  const base={format:'skosh-press-1',name:'Family Book',paper:{width:148,height:210,margin:16},pages:[{frames:[]}],fonts:[],fontDesigns:[{id:'font-created',name:'Typeface',kind:'vector',glyphs:{A:rect},variants:{Bold:{glyphs:{A:circle}},Light:{glyphs:{B:rect}},Italic:{glyphs:{A:rect}}}}]};
  const copy=normalizeProject(structuredClone(base));
  assert.equal(validateProject(copy),copy);
  assert.deepEqual(copy.fontDesigns[0].variants,base.fontDesigns[0].variants);
  assert.equal(validateProject({...base,fontDesigns:[{...base.fontDesigns[0],variants:undefined}]}).name,'Family Book');
  copy.fontDesigns[0].variants.Bold.glyphs.A[0][0][0]=Infinity;
  assert.throws(()=>validateProject(copy),/font variation/);
});
test('font structure guard rejects damaged offsets, sizes and table headers',()=>{
  const clean=Buffer.from(Vector.buildTTF({A:rect},'Skosh Guard'));
  assert.equal(verifyFontBinary(clean,'font/ttf'),true);
  const damaged=Buffer.from(clean);damaged.writeUInt32BE(damaged.length+100,12+8);
  assert.equal(verifyFontBinary(damaged,'font/ttf'),false);
  const oversized=Buffer.from(clean);oversized.writeUInt16BE(65535,4);
  assert.equal(verifyFontBinary(oversized,'font/ttf'),false);
  const fake=Buffer.from('774f4636000100000000000000000004000000007fffffff00000000','hex');
  assert.equal(verifyFontBinary(fake,'font/woff2'),false);
});
test('local studio module, dialog labels and keyboard descriptions remain wired',()=>{
  const html=readFileSync(join(__dirname,'../src/index.html'),'utf8');
  const js=readFileSync(join(__dirname,'../src/app.js'),'utf8');
  const boundary=readFileSync(join(__dirname,'../lib/security.js'),'utf8');
  for(const id of ['studio-variant-select','studio-variant-create','studio-variant-delete','studio-variant-state','studio-anchor-description'])assert.ok(html.includes(`id="${id}"`));
  assert.match(html,/aria-describedby="studio-vector-help studio-anchor-description"/);
  assert.match(js,/FontVariations\.create/);
  assert.match(boundary,/\/lib\/font-variations\.js/);
});
