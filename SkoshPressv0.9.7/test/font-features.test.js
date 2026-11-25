'use strict';
// Feature Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const Vector=require('../lib/vector-font');
const {validateProject,normalizeProject}=require('../lib/projects');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const rectangle=Vector.rectangle(120,180,350,520);
const ellipse=Vector.ellipse(380,460,205,290);
const tables=bytes=>{
  const out=new Map();for(let i=0;i<bytes.readUInt16BE(4);i++){
    const offset=12+i*16;out.set(bytes.toString('ascii',offset,offset+4),{offset:bytes.readUInt32BE(offset+8),length:bytes.readUInt32BE(offset+12)});
  }return out;
};
test('ligatures and alternates export as real OpenType substitutions and extra glyphs',()=>{
  const design={ligatures:{fi:{glyph:rectangle,advance:1240},ffi:{glyph:ellipse,advance:1800}},alternates:{A:[ellipse,rectangle],f:[ellipse]}};
  const original=structuredClone(design),bytes=Buffer.from(Vector.buildTTF({A:rectangle,f:rectangle,i:rectangle},'Skosh Feature Set',design));
  const tabs=tables(bytes);assert.ok(tabs.get('GSUB'));assert.ok(tabs.get('glyf'));
  assert.equal(bytes.readUInt16BE(tabs.get('maxp').offset+4),96+2+3);
  assert.equal(bytes.readUInt16BE(tabs.get('hhea').offset+34),96+2+3);
  assert.equal(bytes.readUInt16BE(tabs.get('hmtx').offset+96*4),1800);
  assert.equal(bytes.readUInt16BE(tabs.get('hmtx').offset+97*4),1240);
  const tags=[];
  const g=tabs.get('GSUB').offset,featureList=g+bytes.readUInt16BE(g+6),count=bytes.readUInt16BE(featureList);
  for(let i=0;i<count;i++)tags.push(bytes.toString('ascii',featureList+2+6*i,featureList+6+6*i));
  assert.deepEqual(tags,['liga','salt','ss01','ss02']);
  assert.deepEqual(design,original);
});
test('featureless fonts remain backward-compatible without a GSUB table',()=>{
  const bytes=Buffer.from(Vector.buildTTF({A:rectangle},'Skosh Legacy'));
  assert.equal(tables(bytes).has('GSUB'),false);
  assert.equal(bytes.readUInt16BE(tables(bytes).get('maxp').offset+4),96);
  assert.ok(Vector.validMetrics({kerning:{AV:-50},spacing:15}));
});
test('font features validate shape, allowed sequences and glyph limits',()=>{
  const good={ligatures:{fi:{glyph:rectangle,advance:1200}},alternates:{A:[ellipse,rectangle]}};
  assert.equal(Vector.validMetrics(good),true);
  for(const invalid of [
    {ligatures:{'bad ':good.ligatures.fi}},
    {ligatures:{fi:{glyph:rectangle,advance:3000}}},
    {ligatures:{fi:{glyph:[[]],advance:1000}}},
    {alternates:{A:[]}},
    {alternates:{A:[ellipse,ellipse,ellipse,ellipse]}},
    {alternates:{' ': [ellipse]}},
    {ligatures:Object.fromEntries(Array.from({length:17},(_,i)=>[String.fromCharCode(65+i)+'f',good.ligatures.fi]))}
  ])assert.equal(Vector.validMetrics(invalid),false);
  assert.throws(()=>Vector.buildTTF({},'Bad', {ligatures:{fi:{glyph:[[]],advance:800}}}),/Invalid font letter spacing or kerning/);
});
test('custom glyphs and OpenType features survive document save and reload',()=>{
  const saved={format:'skosh-press-1',name:'OpenType Book',paper:{width:148,height:210,margin:16},pages:[{frames:[]}],fonts:[],fontDesigns:[{
    id:'font-custom',kind:'vector',name:'Custom OpenType',glyphs:{A:rectangle},spacing:0,advances:{},kerning:{},previewWord:'AVATAR',
    ligatures:{fi:{glyph:rectangle,advance:1280}},alternates:{A:[ellipse,rectangle]}
  }]};
  assert.equal(validateProject(saved),saved);
  const reopened=normalizeProject(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(reopened.fontDesigns[0].ligatures,saved.fontDesigns[0].ligatures);
  assert.deepEqual(reopened.fontDesigns[0].alternates,saved.fontDesigns[0].alternates);
  assert.ok(tables(Buffer.from(Vector.buildTTF({A:rectangle},reopened.fontDesigns[0].name,reopened.fontDesigns[0]))).has('GSUB'));
  reopened.fontDesigns[0].alternates.A[0][0][0][1]='oops';
  assert.throws(()=>validateProject(reopened),/Invalid typography studio design/);
});
test('studio exposes feature editor, proof and selectors without adding main toolbar buttons',()=>{
  const root=join(__dirname,'..');
  const html=readFileSync(join(root,'src/index.html'),'utf8');
  for(const id of ['studio-liga-create','studio-liga-list','studio-liga-advance','studio-alt-create','studio-alt-list','studio-feature-proof','studio-feature-preview-liga','studio-feature-preview-alt','studio-feature-base']){
    assert.ok(html.includes(`id="${id}"`),id);
  }
  const script=readFileSync(join(root,'src/app.js'),'utf8');
  assert.match(script,/function drawFeatureProof\(/);
  assert.match(script,/function focusGlyph\(/);
});
