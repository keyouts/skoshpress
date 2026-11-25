'use strict';
// Master Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Vector=require('../lib/vector-font');
const Master=require('../lib/master-compatibility');
const Pixel=require('../lib/pixel-font');
const Components=require('../lib/glyph-components');
const {generateVariableFont}=require('../lib/variable-font');
const {readTables}=require('../lib/ttf-binary');
const glyph=(x=120,w=420)=>Vector.rectangle(x,200,w,520);
const empty=()=>({glyphs:{A:glyph()},variants:{Bold:{glyphs:{A:glyph(110,470)}}},componentLinks:{},components:{}});
const template=ch=>ch===' '?[]:glyph();
test('glyph report detects contour-count differences and identifies affected master',()=>{
 const d=empty();d.variants.Bold.glyphs.A.push(...Vector.ellipse(360,440,60,80));
 const entry=Master.inspectGlyph(d,'A',template);
 assert.equal(entry.level,'error');
 assert.match(entry.problems[0].message,/Bold.*2 contours.*Regular has 1/);
 const result=Master.inspect(d,template);
 assert.equal(result.ready,false);assert.equal(result.errors.length,1);
 assert.equal(result.errors[0].char,'A');
});
test('glyph report catches point-count mismatches and allows same topology',()=>{
 const d=empty();assert.equal(Master.inspect(d,template).ready,true);
 d.variants.Bold.glyphs.A[0].splice(0,1);
 assert.equal(Master.inspectGlyph(d,'A',template).level,'error');
 assert.match(Master.inspectGlyph(d,'A',template).problems[0].message,/anchors/);
});
test('a missing Bold master is shown as a blocking prerequisite, not a compatible variable font',()=>{
 const d=empty();delete d.variants.Bold;
 const report=Master.inspect(d,template);
 assert.equal(report.ready,false);assert.equal(report.missingBold,true);
 assert.match(report.notices.join(' '),/Create a Bold master/);
});
test('glyph interpolation preserves cubic outline structure and changes geometry',()=>{
 const d=empty();const at400=Master.interpolate(d,'A',400,template),at550=Master.interpolate(d,'A',550,template),at700=Master.interpolate(d,'A',700,template);
 assert.equal(at400[0][0][0],120);assert.equal(at700[0][0][0],110);
 assert.equal(at550[0][0][0],115);
 assert.equal(at550[0].length,at400[0].length);
 assert.equal(Vector.valid(at550),true);
});
test('optional Light master interpolates correctly down to weight 300',()=>{
 const d=empty();d.variants.Light={glyphs:{A:glyph(135,385)}};
 assert.equal(Master.interpolate(d,'A',300,template)[0][0][0],135);
 assert.equal(Master.interpolate(d,'A',350,template)[0][0][0],127.5);
 assert.equal(Master.interpolate(d,'A',400,template)[0][0][0],120);
});
test('shared linked components are resolved in master comparisons',()=>{
 const d=empty();d.components['component-part']={name:'Part',glyph:glyph(5,60)};
 d.componentLinks.A=[{id:'component-part',dx:50,dy:0,scale:100}];
 assert.equal(Components.valid(d.components,d.componentLinks),true);
 const r=Master.inspectGlyph(d,'A',template);
 assert.equal(r.level,'ok');assert.equal(r.points,8);
});
test('extended Unicode glyph authored in only one master is included in the checklist',()=>{
 const d=empty();assert.equal(Pixel.isSupportedChar('é'),true);
 d.variants.Bold.glyphs['é']=glyph();
 const result=Master.inspect(d,template);
 assert.ok(result.glyphs.some(g=>g.char==='é'));
 assert.match(Master.nameOf('é'),/U\+00E9/);
});
test('reverse winding is advisory, not a false-positive topology error',()=>{
 const d=empty();d.variants.Bold.glyphs.A=Vector.reverse(d.variants.Bold.glyphs.A,0);
 const result=Master.inspect(d,template);
 assert.equal(result.ready,true);assert.equal(result.warnings[0].char,'A');
 assert.equal(Vector.valid(Master.interpolate(d,'A',500,template)),true);
});
test('real variable exported font still has fvar and gvar after compatibility inspection',()=>{
 const d=empty();assert.equal(Master.inspect(d,template).ready,true);
 const regular=Buffer.from(Vector.buildTTF({A:d.glyphs.A},'Master Proof',{style:'Regular'},{variableCompatible:true}));
 const bold=Buffer.from(Vector.buildTTF({A:d.variants.Bold.glyphs.A},'Master Proof',{style:'Bold'},{variableCompatible:true}));
 const out=generateVariableFont({Regular:regular,Bold:bold});
 const tables=readTables(out);assert.ok(tables.has('fvar'));assert.ok(tables.has('gvar'));
});
test('HTML and renderer wire master review, keyboard interactions, ARIA naming and strict CSP allowlist',()=>{
 const root=path.join(__dirname,'..');const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
 const code=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
 const security=require('../lib/security');
 for(const id of ['studio-master-check','studio-master-next','studio-master-copy','studio-master-weight','studio-master-issues','studio-master-summary']){
  assert.ok(html.includes(`id="${id}"`),id);
  assert.ok(code.includes(`'#${id}'`),id);
 }
 assert.match(code,/function checkMasterCompatibility/);
 assert.match(code,/function goToMasterIssue/);
 assert.match(code,/function renderMasterPreview/);
 assert.match(code,/if\(!report.ready\)/);
 assert.match(html,/aria-valuetext="400 weight units"/);
 assert.match(html,/id="studio-word-canvas"[^>]+tabindex="0"/);
 assert.match(code,/event.key==='ArrowUp'\?5:-5/);
 assert.equal(security.RESOURCE_TYPES['/lib/master-compatibility.js'],'text/javascript; charset=utf-8');
 assert.match(fs.readFileSync(path.join(root,'lib/security.js'),'utf8'),/\/lib\/master-compatibility\.js/);
});
