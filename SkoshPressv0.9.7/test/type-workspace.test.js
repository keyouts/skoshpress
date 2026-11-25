'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Word=require('../lib/type-workspace');
const Vector=require('../lib/vector-font');
const {resourcePath}=require('../lib/security');
const {validateProject}=require('../lib/projects');

test('word workspace positions glyphs using actual font widths, global spacing and kerning',()=>{
  const metrics={spacing:20,advances:{A:800,V:650},kerning:{AV:-125,VA:35}};
  const layout=Word.layout('AVA',metrics);
  assert.equal(layout.positions.length,3);
  assert.deepEqual(layout.positions.map(p=>p.x),[80,775,1480]);
  assert.deepEqual(layout.positions.map(p=>p.pair),[null,'AV','VA']);
  assert.equal(layout.positions[1].adjust,-125);
  assert.equal(layout.positions[2].adjust,35);
  assert.equal(layout.total,2380);
  assert.equal(Vector.advanceFor(metrics,'A'),820);
});

test('word workspace filters unsupported glyphs and caps proof text at twelve characters',()=>{
  assert.equal(Word.cleanWord(' AB🚀C\nD '),' ABCD ');
  assert.equal(Word.cleanWord('abcdefghijklmnop'),'abcdefghijkl');
  assert.equal(Word.layout('',{}).positions.length,0);
});

test('dragging a kerning grip rounds to five units, clamps and preserves other pairs',()=>{
  assert.equal(Word.kernFromDrag(-100,500,455),-145);
  assert.equal(Word.kernFromDrag(-100,500,1500),400);
  assert.equal(Word.kernFromDrag(-100,500,-500),-400);
  const result=Word.setPair({kerning:{To:-30}},'AV',-85);
  assert.deepEqual(result,{To:-30,AV:-85});
  assert.deepEqual(Word.setPair({kerning:result},'AV',0),{To:-30});
  assert.throws(()=>Word.setPair({},'A😀',-80),/two supported characters/);
  assert.throws(()=>Word.setPair({},'AV',-450),/out of range/);
});

test('word workspace module is available through the secure application protocol',()=>{
  assert.ok(resourcePath(require('node:path').resolve(__dirname,'..'),'skosh://app/lib/type-workspace.js'));
});


test('saved font proof words survive project validation and reject unsupported characters',()=>{
  const document={format:'skosh-press-1',name:'Proof',paper:{width:148,height:210,margin:16},pages:[{frames:[]}],fonts:[],fontDesigns:[{id:'font-proof',name:'Proof',kind:'vector',glyphs:{A:Vector.ellipse()},spacing:0,advances:{},kerning:{AV:-115},previewWord:'AVATAR'}]};
  assert.equal(validateProject(document),document);
  const bad=structuredClone(document);bad.fontDesigns[0].previewWord='Hello🙂';
  assert.throws(()=>validateProject(bad),/Invalid typography studio design/);
  delete document.fontDesigns[0].previewWord;
  assert.equal(validateProject(document),document);
});
