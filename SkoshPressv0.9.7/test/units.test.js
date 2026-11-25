'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const U=require('../lib/units');
const near=(x,y)=>assert.ok(Math.abs(x-y)<0.00001,`${x} != ${y}`);
test('mm, cm, inch, pica, point and CSS pixel conversions are reversible',()=>{
  for(const key of Object.keys(U.FACTORS))for(const value of [0,4.25,148,279.4])near(U.toMm(U.fromMm(value,key),key),value);
  near(U.fromMm(25.4,'in'),1);near(U.fromMm(25.4,'pt'),72);
  near(U.fromMm(25.4,'pc'),6);near(U.fromMm(25.4,'px'),96);
});
test('custom units specify a user-defined number per inch',()=>{
  near(U.toMm(8,'custom',8),25.4);near(U.fromMm(25.4,'custom',8),8);
  assert.throws(()=>U.mmPerUnit('custom',0),/Custom units/);
  assert.throws(()=>U.mmPerUnit('unknown'),/Unknown/);
});
test('columns are measured inside margins with configurable gutters',()=>{
  const p={width:210,height:297,margin:15,columns:3,gutter:5};
  const b=U.columnBounds(p);
  assert.equal(b.starts.length,3);near(b.width,170/3);near(b.starts[0],15);
  near(b.ends.at(-1),195);near(b.starts[1]-b.ends[0],5);
});
test('snapping aligns frame edges without changing frame width',()=>{
  const p={width:210,height:297,margin:15,columns:2,gutter:10};
  near(U.snapX(14.3,70,p,2),15);
  near(U.snapX(21,70,p,2),21);
});
test('projects reject invalid columns and normalize old missing columns',()=>{
  const {normalizeProject,validateProject}=require('../lib/projects');
  const doc=()=>({format:'skosh-press-1',version:3,name:'Sheet',paper:{preset:'a4',width:210,height:297,margin:15},pages:[{id:'p',frames:[]}],fonts:[]});
  const old=normalizeProject(doc());assert.equal(old.paper.columns,1);assert.equal(old.paper.gutter,5);
  for(const columns of [-2,0,1.5,13]){const bad=doc();bad.paper.columns=columns;assert.throws(()=>validateProject(bad),/column/i);}
  const bad=doc();bad.paper.columns=12;bad.paper.gutter=25;assert.throws(()=>validateProject(bad),/Column/);
});
