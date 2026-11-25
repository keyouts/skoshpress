'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const Lab=require('../lib/print-lab');
const {safePrintMarkup}=require('../lib/security');
const profile=(patch={})=>({...Lab.defaults,sheetWidth:330,sheetHeight:230,margin:5,...patch});
const doc=n=>({paper:{width:148,height:210},pages:Array.from({length:n},()=>({frames:[]}))});
test('old profiles gain production defaults without retaining unknown data',()=>{
 const p=Lab.valid({name:'Old profile',binding:'loose',path:'/tmp/test'});assert.equal(p.bleed,0);assert.equal(p.signaturePages,0);assert.equal(p.cropMarks,false);assert.equal(p.path,undefined);
 for(const bad of [{bleed:26},{bindingGutter:-1},{signaturePages:6},{signaturePages:68},{cropMarks:'true'},{targetDpi:0},{grain:'other'},{paperWeight:Infinity},{orientation:'other'}])assert.throws(()=>Lab.valid({...p,...bad}));
});
test('multiple signatures never mix pages and pad only the final signature',()=>{
 const rows=Lab.signaturePairs(19,8);assert.equal(rows.length,5);assert.deepEqual(rows[0].front,[8,1]);assert.deepEqual(rows[2].front,[16,9]);assert.deepEqual(rows[4].front,[null,17]);assert.deepEqual(rows[4].back,[18,19]);
 const pages=rows.flatMap(r=>[...r.front,...r.back]).filter(n=>n!==null).sort((a,b)=>a-b);assert.deepEqual(pages,Array.from({length:19},(_,i)=>i+1));
 const plan=Lab.plan(doc(19),profile({signaturePages:8}));assert.equal(plan.signatures,3);assert.equal(plan.blankPages,1);assert.equal(plan.sheetsPerCopy,5);assert.equal(plan.sides.length,10);
});
test('whole booklet order remains identical to the existing booklet module',()=>{
 const {sheets}=require('../lib/booklet');for(const n of [1,4,9,700])assert.deepEqual(Lab.sheetSides(n,profile()).map(s=>s.pages.map(p=>p===null?null:p-1)),sheets(n));
});
test('bleed and mark allowance participate in fit and do not cross fold',()=>{
 const p=profile({bleed:3,cropMarks:true,sheetWidth:230,sheetHeight:330});const g=Lab.sheetGeometry(doc(1).paper,p);assert.equal(g.width,330);assert.equal(g.height,230);assert.equal(g.requiredWidth,312);assert.equal(g.requiredHeight,226);assert.equal(g.fit,false);
 const fit=Lab.sheetGeometry(doc(1).paper,{...p,sheetWidth:250});assert.equal(fit.fit,true);assert.equal(fit.cells[0].rightBleed,0);assert.equal(fit.cells[1].leftBleed,0);assert.equal(fit.cells[0].leftBleed,3);assert.equal(fit.marks.length,10);
 for(const m of fit.marks){assert.ok(m.x>=5&&m.y>=5&&m.x+m.w<=fit.width-5+.001&&m.y+m.h<=fit.height-5+.001);}
 assert.equal(Lab.sheetGeometry(doc(1).paper,{...p,sheetWidth:250,orientation:'portrait'}).fit,false);
});
test('loose duplex sides retain order and calculate material mass',()=>{
 const p=profile({binding:'loose',duplex:'long',copies:2,paperWeight:100});const plan=Lab.plan(doc(3),p);assert.equal(plan.sheetsPerCopy,2);assert.deepEqual(plan.sides.map(s=>[s.sheet,s.face,s.pages[0]]),[[1,'front',1],[1,'back',2],[2,'front',3]]);assert.ok(Math.abs(plan.paperMassKg-4*330*230*100/1e9)<1e-9);
});
test('preflight detects partial bleed, text gutter, overrun and target resolution',()=>{
 const d=doc(2);d.pages[0].frames=[{id:'t',type:'text',x:2,y:4,w:50,h:10},{id:'i',type:'image',x:130,y:0,w:18,h:40,fit:'cover',src:'sample'},{id:'bad',type:'image',x:-5,y:10,w:30,h:10,src:'sample'}];d.pages[1].frames=[{id:'even',type:'text',x:100,y:10,w:45,h:20}];
 const issues=Lab.productionIssues(d,profile({bleed:3,bindingGutter:12}),()=>({width:50,height:50}));
 assert.ok(issues.some(i=>i.frameId==='t'&&i.title.includes('gutter')));assert.ok(issues.some(i=>i.frameId==='even'&&i.title.includes('gutter')));assert.ok(issues.some(i=>i.frameId==='i'&&i.title.includes('full bleed')));assert.ok(issues.some(i=>i.frameId==='i'&&i.title.includes('dpi')));assert.ok(issues.some(i=>i.frameId==='bad'&&i.severity==='error'));
});
test('full outside bleed passes the edge check and inner saddle bleed is not required',()=>{
 const d=doc(1);d.pages[0].frames=[{id:'full',type:'image',x:0,y:-3,w:151,h:216,fit:'cover'}];const issues=Lab.productionIssues(d,profile({bleed:3}));assert.deepEqual(issues,[]);
});
test('production sheet markup fits existing restricted export surface',()=>{
 assert.equal(safePrintMarkup('<div class="production-mark" style="left:5mm;width:4mm;height:.15mm"></div>'),true);assert.equal(safePrintMarkup('<div><svg></svg></div>'),false);
});
