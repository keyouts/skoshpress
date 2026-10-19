'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {parse,format,maybeLiving}=require('../lib/gedcom');
const {importGedcomBuffer}=require('../lib/gedcom-file');
const GED=`0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Alice /Smith/
1 SEX F
1 BIRT
2 DATE 14 MAR 1900
2 PLAC Boston, Massachusetts
2 SOUR @S1@
3 PAGE page 12
1 DEAT
2 DATE 1980
1 FAMS @F1@
1 NOTE Family archivist
2 CONT Founder of a store.
1 SOUR @S1@
0 @I2@ INDI
1 NAME Bob /Smith/
1 BIRT
2 DATE 10 APR 1898
1 DEAT
2 DATE 1955
1 FAMS @F1@
0 @I3@ INDI
1 NAME Living /Smith/
1 BIRT
2 DATE 1 JAN 2000
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 CHIL @I3@
1 MARR
2 DATE 1920
2 PLAC Boston
0 @S1@ SOUR
1 TITL Census & <Documents>
1 AUTH National archive
0 TRLR`;
test('genealogy profile rendering and privacy defaults',()=>{
 const tree=parse(GED);assert.equal(tree.stats.people,3);assert.equal(tree.stats.families,1);
 assert.equal(tree.version,'5.5.1');assert.equal(maybeLiving(tree.persons[2]),true);
 const result=format(tree,{title:'Smith Research',limit:20});
 assert.equal(result.count,2);assert.equal(result.total,2);
 assert.ok(result.html.includes('Alice Smith'));assert.ok(result.html.includes('Bob Smith'));
 assert.ok(!result.html.includes('Living Smith'));
 assert.ok(result.html.includes('Census &amp; &lt;Documents&gt;'));
 assert.ok(result.html.includes('14 MAR 1900'));
 assert.ok(result.html.includes('page 12'));
});
test('family sheets filter, citations option, and raw dates',()=>{
 const tree=parse(GED);
 const family=format(tree,{mode:'families',surname:'Smith',limit:1,includeSources:false});
 assert.equal(family.count,1);assert.ok(family.html.includes('Married:'));
 assert.ok(!family.html.includes('Census &'));
 assert.ok(!family.html.includes('Living Smith'));
 const everyone=format(tree,{mode:'profiles',limit:3,protectLiving:false});
 assert.ok(everyone.html.includes('Living Smith'));
});
test('reject invalid and injected GEDCOM; names escaped',()=>{
 assert.throws(()=>parse('bogus'),/complete GEDCOM/);
 const tree=parse(GED.replace('Alice /Smith/','<script>alert(1)</script> /Smith/'));
 const output=format(tree,{limit:2}).html;
 assert.ok(!output.includes('<script>'));assert.ok(output.includes('&lt;script&gt;'));
 assert.throws(()=>format(tree,{limit:9999}),/between 1 and 200/);
});
test('UTF-8 and UTF-16 GEDCOM supported',()=>{
 const fromUtf8=importGedcomBuffer(Buffer.from(GED),'/tmp/tree.ged');
 assert.equal(parse(fromUtf8.text).stats.people,3);
 const utf16=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(GED,'utf16le')]);
 assert.equal(parse(importGedcomBuffer(utf16,'tree.ged').text).stats.people,3);
 assert.throws(()=>importGedcomBuffer(Buffer.from('0 HEAD\n1 CHAR ANSEL\n0 TRLR'), 'tree.ged'),/ANSEL/);
});
test('ZIP containing a GEDCOM exports correctly',()=>{
 const name=Buffer.from('export/tree.ged');const raw=Buffer.from(GED);const compressed=zlib.deflateRawSync(raw);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(name.length,28);
 const centralOffset=local.length+name.length+compressed.length;
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(centralOffset,16);
 const zipped=Buffer.concat([local,name,compressed,central,name,end]);
 const extracted=importGedcomBuffer(zipped,'export.zip');
 assert.equal(extracted.name,'tree');assert.equal(parse(extracted.text).stats.people,3);
 assert.throws(()=>importGedcomBuffer(Buffer.from('not-a-zip'),'broken.zip'),/valid ZIP/);
});
