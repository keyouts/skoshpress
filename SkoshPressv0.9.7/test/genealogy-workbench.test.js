'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {parse}=require('../lib/gedcom');
const {preview,review,volumeIndex}=require('../lib/genealogy-workbench');
const {publication,build,dateKey}=require('../lib/genealogy-records');
const {decode}=require('../lib/gedcom-file');
const ged=fs.readFileSync(require('node:path').join(__dirname,'fixtures/fictional-family.ged'),'utf8');
const tree=parse(ged);
test('ancestors and descendants preserve relationship order and root identity',()=>{
 const a=preview(tree,{rootId:'@I3@',chartMode:'ancestors',depth:2});
 assert.deepEqual(a.rows.map(r=>r.id),['@I3@','@I2@','@I1@']);assert.deepEqual(a.rows.map(r=>r.parent),[-1,0,0]);
 const d=preview(tree,{rootId:'@I1@',chartMode:'descendants',depth:2});assert.deepEqual(d.rows.map(r=>r.id),['@I1@','@I3@']);
});
test('privacy excludes negative death declarations from charts and event timelines',()=>{
 const t=parse(ged.replace('1 DEAT\n2 DATE 5 DEC 2003','1 DEAT N').replace('23 JUL 1910','23 JUL 2010'));
 const d=preview(t,{rootId:'@I1@',chartMode:'descendants'});assert.ok(!JSON.stringify(d).includes('Ruth Bennett'));
 assert.ok(preview(t,{rootId:'@I1@',chartMode:'descendants',protectLiving:false}).rows.some(r=>r.id==='@I3@'));
});
test('timelines include family events and sort calendar months correctly',()=>{
 const t=preview(tree,{rootId:'@I1@',chartMode:'timeline'});assert.ok(t.events.some(e=>e.label==='Marriage'));assert.ok(dateKey('12 FEB 1900')<dateKey('1 NOV 1900'));assert.equal(dateKey('Unknown'),Infinity);
});
test('review identifies missing links, dates, citations and cycles without exposing private names',()=>{
 const t=parse(ged.replace('1 CHIL @I3@','1 CHIL @I3@\n1 CHIL @I1@\n1 CHIL @MISSING@').replace('15 OCT 1954','15 OCT 1854'));
 const r=review(t);assert.ok(r.counts['Ancestry cycle']);assert.ok(r.counts['Unresolved relationship']);assert.ok(r.counts['Date conflict']);assert.ok(r.counts['No citations']);
 assert.ok(preview(t,{rootId:'@I1@',chartMode:'ancestors'}).rows.some(r=>r.cycle));
});
test('optional source footnotes and individual index retain escaped citations',()=>{
 const r=publication(tree,{limit:200,footnotes:true,personIndex:true});assert.match(r.html,/<sup>\[1\]<\/sup>/);assert.ok(r.notes.some(n=>n.text.includes('Entry 14')));assert.match(r.html,/Individual name index/);
 assert.deepEqual(publication(tree,{includeSources:false,footnotes:true}).notes,[]);
});
test('shared event notes and UTF-16 without a byte marker are supported',()=>{
 const t=parse(ged.replace('2 PLAC Lancaster, Pennsylvania','2 PLAC Lancaster, Pennsylvania\n2 SNOTE @N1@').replace('0 TRLR','0 @N1@ SNOTE Shared\n1 CONT note text\n0 TRLR'));
 assert.match(build(t).people[0].events[0].note,/Shared\s+note text/);assert.equal(decode(Buffer.from(ged,'utf16le')),ged);assert.equal(decode(Buffer.from(ged,'utf16le').swap16()),ged);
});
test('cross-volume record index deduplicates identifiers within each volume',()=>{
 assert.deepEqual(volumeIndex([{volume:1,recordIds:['@I1@','@I1@']},{volume:2,recordIds:['@I1@','@I2@']}]),[{recordId:'@I1@',volumes:[1,2]},{recordId:'@I2@',volumes:[2]}]);
});
