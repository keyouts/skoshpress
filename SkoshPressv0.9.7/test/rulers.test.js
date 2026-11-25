'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const U=require('../lib/units');
const MM=96/25.4;
test('ruler ticks begin at zero and are bounded by the page edge',()=>{
  const scale=MM*.8;
  const marks=U.rulerMarks(148,scale,'mm');
  assert.equal(marks[0].pixel,0);
  assert.equal(marks[0].label,'0');
  assert.ok(marks.every(m=>m.pixel>=0&&m.pixel<=148*scale+.1));
  const majors=marks.filter(m=>m.major);
  assert.equal(majors[1].label,'20');
  assert.ok(majors.length>=5);
});
test('ruler tick labels adapt to inches, points, and user-defined units',()=>{
  const scale=MM;
  for(const [unit,custom] of [['in',10],['pt',10],['pc',10],['cm',10],['px',10],['custom',8]]) {
    const ticks=U.rulerMarks(215.9,scale,unit,custom);
    assert.ok(ticks.length>4,unit);
    assert.equal(ticks[0].label,'0');
    assert.ok(ticks.some(t=>t.major&&t.label!=='0'),unit);
    assert.ok(ticks.every(t=>Number.isFinite(t.pixel)),unit);
  }
});
test('ruler ticks reposition proportionally to zoom without changing measured values',()=>{
  const a=U.rulerMarks(210,MM*.5,'mm').filter(m=>m.major);
  const b=U.rulerMarks(210,MM,'mm').filter(m=>m.major);
  const sample=a.find(m=>m.label==='100');
  assert.ok(sample);
  const corresponding=b.find(m=>m.label==='100');
  assert.ok(corresponding);
  assert.ok(Math.abs(corresponding.pixel-2*sample.pixel)<.00001);
});
test('ruler tick requests reject invalid dimensions and unknown units',()=>{
  assert.throws(()=>U.rulerMarks(-1,MM,'mm'),/dimensions/);
  assert.throws(()=>U.rulerMarks(210,0,'mm'),/dimensions/);
  assert.throws(()=>U.rulerMarks(210,MM,'bogus'),/Unknown/);
  assert.throws(()=>U.rulerMarks(210,MM,'custom',0),/Custom/);
});
