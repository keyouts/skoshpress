'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Toolbar=require('../lib/toolbar-customization');
const Glyph=require('../lib/glyph-tools');
const Vector=require('../lib/vector-font');
const {resourcePath}=require('../lib/security');
const {validateProject}=require('../lib/projects');

test('quick command choices are allowlisted, unique, bounded and reorderable',()=>{
  assert.deepEqual(Toolbar.normalize(undefined),Toolbar.DEFAULT);
  assert.deepEqual(Toolbar.normalize(['pdf-btn','fake-command','pdf-btn','image-btn']),['pdf-btn','image-btn']);
  assert.deepEqual(Toolbar.toggle(['pdf-btn'],'pdf-btn'),[]);
  assert.deepEqual(Toolbar.toggle(['pdf-btn'],'image-btn'),['pdf-btn','image-btn']);
  assert.deepEqual(Toolbar.move(['pdf-btn','image-btn','text-btn'],'text-btn',0),['text-btn','pdf-btn','image-btn']);
  const eight=Toolbar.CATALOG.slice(0,8).map(item=>item.id);
  assert.throws(()=>Toolbar.toggle(eight,Toolbar.CATALOG[8].id),/Pin up to 8/);
  assert.equal(Toolbar.normalize(Toolbar.CATALOG.map(item=>item.id)).length,8);
  assert.deepEqual(Toolbar.move(eight,'not-a-tool',2),eight);
});

test('font transforms edit all cubic points and keep exporter-compatible geometry',()=>{
  const initial=Vector.rectangle(160,190,300,440);
  const modified=Glyph.transform(initial,{width:110,height:85,slant:5,rotation:3});
  assert.ok(Vector.valid(modified));
  assert.notDeepEqual(modified,initial);
  assert.deepEqual(initial,Vector.rectangle(160,190,300,440));
  assert.ok(Glyph.bounds(modified).right>Glyph.bounds(modified).left);
  const ttf=Vector.buildTTF({A:modified},'Geometry Test');
  assert.ok(ttf.length>1000);
});

test('geometry helpers center, align and duplicate within limits',()=>{
  const g=Vector.rectangle(120,200,300,500);
  const centered=Glyph.centerGlyph(g,760);
  const b=Glyph.bounds(centered);
  assert.equal((b.left+b.right)/2,380);
  const aligned=Glyph.alignContour(g,0,'baseline');
  assert.equal(Glyph.bounds(aligned).bottom,800);
  const dup=Glyph.duplicateContour(g,0);
  assert.equal(dup.length,2);
  assert.equal(Glyph.bounds(dup).left,120);
  assert.deepEqual(Glyph.snapPoint(23,37,20),[20,40]);
  assert.throws(()=>Glyph.snapPoint(2,3,3),/Invalid snap grid/);
  assert.throws(()=>Glyph.transform(g,{width:900}),/Invalid transform/);
  assert.throws(()=>Glyph.transform(Vector.rectangle(),{rotation:45,slant:25,width:160,height:160}),/editable glyph area/);
});

test('new modules have secure app access and existing vector projects still validate',()=>{
  const root=require('node:path').resolve(__dirname,'..');
  assert.ok(resourcePath(root,'skosh://app/lib/toolbar-customization.js'));
  assert.ok(resourcePath(root,'skosh://app/lib/glyph-tools.js'));
  const doc={format:'skosh-press-1',name:'Typeface',paper:{width:148,height:210,margin:16},pages:[{frames:[]}],fonts:[],fontDesigns:[{id:'font-shapes',name:'Shapes',kind:'vector',glyphs:{A:Glyph.centerGlyph(Vector.rectangle(),780)},spacing:0,advances:{},kerning:{AV:-60}}]};
  assert.equal(validateProject(doc),doc);
});
