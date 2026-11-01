'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse}=require('../lib/gedcom');
const R=require('../lib/genealogy-records');
const GED=`0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Alice /Carter/
1 SEX F
1 BIRT
2 DATE ABT 14 MAR 1870
2 PLAC Pittsburgh, Pennsylvania
2 SOUR @S1@
3 PAGE Record 10
1 DEAT
2 DATE BEF 1940
1 OCCU Clerk
1 NOTE Confidential detail: a living person's address is here
0 @I2@ INDI
1 NAME Robert /Carter/
1 BIRT
2 DATE 1862
1 DEAT
2 DATE 1947
0 @I3@ INDI
1 NAME Living /Carter/
1 BIRT
2 DATE 12 SEP 2001
2 PLAC Erie, Pennsylvania
1 EVEN
2 TYPE Performance
2 DATE 2022
2 PLAC Erie, Pennsylvania
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 CHIL @I3@
1 MARR
2 DATE BET 1888 AND 1890
2 PLAC Pittsburgh, Pennsylvania
2 SOUR @S2@
0 @S1@ SOUR
1 TITL Historical <Census> 
1 AUTH Example Archivist
0 @S2@ SOUR
1 TITL Marriage register
0 TRLR`;
const tree=parse(GED);
test('builds structured record data; preserves raw dates, GEDCOM IDs, and source page',()=>{
 const model=R.build(tree);
 assert.equal(model.people.length,2);
 assert.equal(model.excludedLiving,1);
 assert.equal(model.people[0].id,'@I1@');
 assert.equal(model.people[0].events[0].date,'ABT 14 MAR 1870');
 assert.deepEqual(model.people[0].spouses.map(p=>p.id),['@I2@']);
 assert.equal(model.people[0].children.length,0);
 assert.ok(model.people[0].citations.some(s=>s.label.includes('Record 10')));
 assert.equal(model.families.length,1);
 assert.equal(model.families[0].children.length,0);
 assert.equal(model.events.length,6);
 assert.equal(model.places.length,1);
 assert.equal(model.places[0].events,2);
 assert.ok(model.sources.some(s=>s.label.includes('Marriage register')));
});
test('publication creates all five data-centric reports with escaping and source attribution',()=>{
 for(const mode of ['register','families','timeline','places','sources']){
  const report=R.publication(tree,{mode,limit:200,includeSources:true});
  assert.ok(report.count>0,mode);
  assert.ok(report.html.includes('GEDCOM'));
  assert.ok(!report.html.includes('Living Carter'));
  assert.ok(!report.html.includes('Erie, Pennsylvania'));
  assert.ok(!report.html.includes('Confidential detail'));
 }
 const register=R.publication(tree,{mode:'register',limit:20,includeSources:true,density:'detailed'}).html;
 assert.ok(register.includes('ABT 14 MAR 1870'));
 assert.ok(register.includes('Record 10'));
 assert.ok(register.includes('&lt;Census&gt;'));
 assert.ok(!register.includes('<Census>'));
 const timeline=R.publication(tree,{mode:'timeline',limit:100}).html;
 assert.ok(timeline.includes('BET 1888 AND 1890'));
 assert.ok(timeline.includes('Family of'));
 assert.ok(timeline.indexOf('ABT 14 MAR 1870')<timeline.indexOf('BET 1888 AND 1890'));
});
test('surname and place indices show only selected publication record identifiers',()=>{
 const one=R.publication(tree,{mode:'register',limit:1,surnameIndex:true,placeIndex:true}).html;
 assert.ok(one.includes('Surname index'));
 assert.ok(one.includes('Place index'));
 assert.ok(one.includes('@I1@'));
 const indices=one.slice(one.indexOf('<h2>Surname index'));
 assert.ok(!indices.includes('@I2@'));
 assert.ok(!indices.includes('@I3@'));
 assert.throws(()=>R.publication(tree,{mode:'register',limit:0}),/between 1 and 200/);
 assert.throws(()=>R.publication(tree,{mode:'register',limit:201}),/between 1 and 200/);
});
test('notes are opt-in and filtered subjects do not populate indexes',()=>{
 assert.ok(!R.publication(tree,{mode:'register',limit:20}).html.includes('Confidential detail'));
 assert.ok(R.publication(tree,{mode:'register',limit:20,includeNotes:true}).html.includes('Confidential detail'));
 assert.throws(()=>R.publication(tree,{mode:'register',surname:'Missing surname',limit:20}),/No publishable records/);
});
test('CSV exports all matching entries and quote potentially executable spreadsheet cells',()=>{
 for(const type of ['people','events','families','places','sources']){
  const result=R.exportCsv(tree,{type});
  assert.ok(result.csv.startsWith('\uFEFF"'));
  assert.equal(result.csv.split('\r\n').filter(Boolean).length,result.count+1);
  assert.ok(!result.csv.includes('Living Carter'));
  assert.ok(!result.csv.includes('Erie, Pennsylvania'));
 }
 const everyone=R.exportCsv(tree,{type:'people',protectLiving:false});
 assert.equal(everyone.count,3);
 const mutated=parse(GED.replace('Alice /Carter/','=SUM(1,1) /Carter/'));
 const csv=R.exportCsv(mutated,{type:'people'}).csv;
 assert.ok(csv.includes("'=SUM(1,1) Carter"));
 assert.ok(csv.includes('"'));
});
test('family with unpublishable adult does not leak family events or surname relationships',()=>{
 const variant=parse(GED.replace('1 NAME Robert /Carter/\n1 BIRT\n2 DATE 1862\n1 DEAT\n2 DATE 1947','1 NAME Robert /Carter/\n1 BIRT\n2 DATE 2000'));
 const dataset=R.build(variant);
 assert.equal(dataset.families.length,0);
 assert.equal(dataset.people[0].spouses.length,0);
 assert.equal(dataset.events.some(e=>e.tag==='MARR'),false);
});
test('invalid dataset, dangerous numeric IDs, and identifying event types are rejected/omitted',()=>{
 assert.throws(()=>R.build({}),/Import a GEDCOM/);
 assert.equal(R.possiblyLiving(tree.persons[2],2026),true);
 const withSsn=parse(GED.replace('1 SEX F','1 SEX F\n1 SSN 123-45-6789\n1 IDNO 4455'));
 assert.ok(!R.publication(withSsn,{mode:'register'}).html.includes('123-45-6789'));
});

// Batch Coverage
test('batch plan covers all selected entries exactly once by ordinal across report types',()=>{
 for(const mode of ['register','families','timeline','places','sources']){
  const opts={mode,protectLiving:true};
  const plan=R.batchPlan(tree,opts,1);
  assert.ok(plan.total>0);
  assert.deepEqual(plan.volumes.flatMap(v=>Array.from({length:v.end-v.start},(_,i)=>v.start+i)),
    Array.from({length:plan.total},(_,i)=>i));
  const seen=[];
  for(const volume of plan.volumes){
   const result=R.publication(tree,{...opts,offset:volume.start,limit:volume.end-volume.start});
   assert.equal(result.count,volume.recordIds.length);
   assert.deepEqual(result.recordIds,volume.recordIds);
   seen.push(...result.recordIds);
  }
  assert.equal(seen.length,plan.total);
 }
 assert.throws(()=>R.batchPlan(tree,{mode:'register'},201),/1–200/);
 assert.throws(()=>R.publication(tree,{mode:'register',offset:-1}),/offset/);
 assert.throws(()=>R.publication(tree,{mode:'register',offset:999}),/offset/);
});
