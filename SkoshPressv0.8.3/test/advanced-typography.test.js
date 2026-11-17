'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Vector=require('../lib/vector-font');
const SVG=require('../lib/svg-glyph');
const {validateProject}=require('../lib/projects');
const {resourcePath}=require('../lib/security');

const fontTables=bytes=>{
  const out={};for(let i=0;i<bytes.readUInt16BE(4);i++){
    const p=12+i*16;out[bytes.toString('ascii',p,p+4)]={off:bytes.readUInt32BE(p+8),len:bytes.readUInt32BE(p+12)};
  }return out;
};
const doc=()=>({format:'skosh-press-1',name:'Font Book',paper:{width:148,height:210,margin:16},pages:[{id:'page-one',frames:[]}],fonts:[],fontDesigns:[]});

test('spacing and kerning are stored in actual TTF hmtx and kern tables',()=>{
  const metrics={spacing:40,advances:{A:850,V:700},kerning:{AV:-120,To:-45}};
  const bytes=Buffer.from(Vector.buildTTF({A:Vector.ellipse()},'Spacing Test',metrics)),tabs=fontTables(bytes);
  assert.ok(tabs.kern);
  assert.equal(bytes.readUInt16BE(tabs.hmtx.off+4*(65-31)),890);
  assert.equal(bytes.readUInt16BE(tabs.hmtx.off+4*(86-31)),740);
  assert.equal(bytes.readUInt16BE(tabs.hmtx.off+4*(66-31)),820);
  const k=tabs.kern.off;
  assert.equal(bytes.readUInt16BE(k),0);
  assert.equal(bytes.readUInt16BE(k+2),1);
  assert.equal(bytes.readUInt16BE(k+10),2);
  assert.equal(bytes.readInt16BE(k+18+4),-120);
  assert.equal(bytes.readInt16BE(k+18+6+4),-45);
  assert.equal(Vector.advanceFor(metrics,'A'),890);
  assert.equal(Vector.kernFor(metrics,'AV'),-120);
  assert.equal(fontTables(Buffer.from(Vector.buildTTF({},'No Kern'))).kern,undefined);
});

test('project validation retains optional spacing, per-glyph widths, and kerning',()=>{
  const project=doc();project.fontDesigns=[{id:'font-futura',name:'Letters',kind:'vector',glyphs:{O:Vector.ellipse()},spacing:20,advances:{A:900},kerning:{AV:-90}}];
  assert.equal(validateProject(project),project);
  const invalid=structuredClone(project);invalid.fontDesigns[0].kerning.AV=Infinity;
  assert.throws(()=>validateProject(invalid),/Invalid typography studio design/);
  const invalidPair=structuredClone(project);invalidPair.fontDesigns[0].kerning['ABCD']=20;
  assert.throws(()=>validateProject(invalidPair),/Invalid typography studio design/);
  const old=structuredClone(project);delete old.fontDesigns[0].spacing;delete old.fontDesigns[0].advances;delete old.fontDesigns[0].kerning;
  assert.equal(validateProject(old),old);
});

test('SVG importer understands closed straight, quadratic and cubic paths',()=>{
  const simple=SVG.parsePath('M0,0 L100 0 L100 100 L0 100Z');
  assert.equal(simple[0].length,4);
  const cubic=SVG.parsePath('M0 0 C40 0 60 30 80 50 L90 80 L0 80 Z');
  assert.equal(cubic[0][0][4],40);
  assert.equal(cubic[0][1][2],60);
  const quad=SVG.parsePath('M0 0 Q 50 100 100 0 L100 100 L0 100Z');
  assert.ok(quad[0][0][4]>30);
  const relative=SVG.parsePath('m10,20 h100 v100 h-100 z');
  assert.deepEqual(relative[0].map(p=>p.slice(0,2)),[[10,20],[110,20],[110,120],[10,120]]);
  assert.throws(()=>SVG.parsePath('M0 0 L100 0 L100 100'),/open outline/);
  assert.throws(()=>SVG.parsePath('M0 0 A20 20 0 0 1 80 80 Z'),/arc commands/);
});

test('SVG transform and imported basic shapes are normalized to the font canvas',()=>{
  const svg=(name,attrs,children=[])=>({localName:name,children,getAttribute:key=>attrs[key]??null});
  const root={documentElement:svg('svg',{},[svg('g',{transform:'translate(10 10) scale(2)'},[
    svg('path',{d:'M0 0L100 0L100 100L0 100Z'}),svg('circle',{cx:'200',cy:'50',r:'30'})
  ])]),doctype:null};
  const glyph=SVG.fromDocument(root);
  assert.equal(glyph.length,2);assert.ok(Vector.valid(glyph));
  assert.equal(glyph[1].length,4);
  assert.deepEqual(SVG.transform('translate(10,20)'),[1,0,0,1,10,20]);
  assert.throws(()=>SVG.fromDocument({documentElement:svg('svg',{},[]),doctype:null}),/No filled SVG/);
});

test('rectangle and mirror helpers produce valid contours with preserved winding',()=>{
  const rectangle=Vector.rectangle();assert.equal(Vector.valid(rectangle),true);
  const flipped=Vector.flip(rectangle,'x');assert.equal(Vector.valid(flipped),true);
  assert.equal(flipped[0][0][0],760-rectangle[0][3][0]);
  assert.equal(Vector.flip(flipped,'x')[0][0][0],rectangle[0][0][0]);
});

test('SVG importer is explicitly allowed through the secure app protocol',()=>{
  const url=resourcePath(require('node:path').resolve(__dirname,'..'),'skosh://app/lib/svg-glyph.js');
  assert.ok(url&&url.target.endsWith('svg-glyph.js'));
});
