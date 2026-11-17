'use strict';
// Security Regression
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {resourcePath}=require('../lib/security');
const {parse}=require('../lib/gedcom');
const {importGedcomBuffer}=require('../lib/gedcom-file');
const {publication,exportCsv}=require('../lib/genealogy-records');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const ged=fs.readFileSync(path.join(root,'test/fixtures/fictional-family.ged'),'utf8');
function archive(plain=Buffer.from(ged)) {
 const name=Buffer.from('family.ged'),compressed=zlib.deflateRawSync(plain);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(plain.length,22);local.writeUInt16LE(name.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(plain.length,24);central.writeUInt16LE(name.length,28);
 const offset=local.length+name.length+compressed.length;
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(offset,16);
 return {zip:Buffer.concat([local,name,compressed,central,name,end]),offset,central,endOffset:offset+central.length+name.length};
}
test('GEDCOM conversion runs behind the native IPC boundary, not an optional browser global',()=>{
 assert.equal(resourcePath(root,'skosh://app/lib/genealogy-records.js'),null);
 assert.equal(resourcePath(root,'skosh://app/lib/gedcom.js'),null);
 const html=read('src/index.html');
 const app=read('src/app.js');
 const bridge=read('preload.js');
 const native=read('main.js');
 assert.doesNotMatch(html,/<script[^>]+\/lib\/(?:gedcom|genealogy-records)\.js/);
 assert.doesNotMatch(app,/window\.(?:SkoshGEDCOM|SkoshGenealogyRecords)/);
 assert.match(bridge,/generateGenealogyPublication/);
 assert.match(native,/genealogy:publication/);
 assert.doesNotMatch(html,/https?:\/\//);
});
test('duplicate GEDCOM IDs are rejected rather than replacing relationship targets',()=>{
 assert.throws(()=>parse(ged.replace('0 TRLR','0 @I1@ INDI\n1 NAME Imposter /Person/\n0 TRLR')),/Duplicate GEDCOM identifier/);
});
test('archive refuses contradictory local headers, size metadata and unsupported flags',()=>{
 const {zip,offset}=archive();
 assert.ok(importGedcomBuffer(zip,'family.zip').text.includes('0 HEAD'));
 const method=Buffer.from(zip);method.writeUInt16LE(0,8);
 assert.throws(()=>importGedcomBuffer(method,'family.zip'),/header does not match/);
 const lengths=Buffer.from(zip);lengths.writeUInt32LE(999,18);
 assert.throws(()=>importGedcomBuffer(lengths,'family.zip'),/sizes do not match/);
 const flags=Buffer.from(zip);flags.writeUInt16LE(1,offset+8);
 assert.throws(()=>importGedcomBuffer(flags,'family.zip'),/Encrypted ZIP/);
 const lie=Buffer.from(zip);lie.writeUInt32LE(0xffffffff,offset+24);
 assert.throws(()=>importGedcomBuffer(lie,'family.zip'),/ZIP64/);
 const directory=Buffer.from(zip);directory.writeUInt32LE(0xffffffff,directory.length-14);
 assert.throws(()=>importGedcomBuffer(directory,'family.zip'),/Unsupported ZIP directory/);
});
test('malicious text is escaped from manuscript and protected on CSV export',()=>{
 const source=ged.replace('0 TRLR','0 @I999@ INDI\n1 NAME =HYPERLINK("bad") /Test/\n1 BIRT\n2 DATE 1870\n1 DEAT\n2 DATE 1940\n0 TRLR');
 const tree=parse(source);
 const csv=exportCsv(tree,{type:'people'}).csv;
 assert.ok(csv.includes("'=HYPERLINK("));
 const html=publication(tree,{mode:'register',limit:200}).html;
 assert.ok(html.includes('=HYPERLINK'));
 assert.ok(!html.includes('<script'));
});
test('genealogy controls expose names, live import feedback and descriptive actions',()=>{
 const html=read('src/index.html');
 for(const token of ['aria-labelledby="genealogy-title"','aria-describedby="genealogy-description"','aria-label="GEDCOM import status"','aria-label="Genealogy report warnings"','aria-describedby="genealogy-warning"','aria-label="Structured CSV export type"'])assert.ok(html.includes(token),token);
 for(const name of ['genealogy-import','genealogy-generate','genealogy-csv','genealogy-private'])assert.match(html,new RegExp(`id="${name}"`));
 const script=read('src/app.js');assert.match(script,/aria-readonly/);
});
test('code comments use two-word section headers',()=>{
 const extensions=new Set(['.js','.css','.html','.py']);
 const visit=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?visit(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
 for(const filename of visit(root)){
  const relative=path.relative(root,filename);
  if(relative.startsWith('assets/')||filename.endsWith('.bdic')||filename.endsWith('.ico'))continue;
  if(!extensions.has(path.extname(filename)) && !filename.endsWith('.md'))continue;
  const content=fs.readFileSync(filename,'utf8');
  if(!extensions.has(path.extname(filename)))continue;
  for(const line of content.split(/\r?\n/)){
   const trimmed=line.trim();
   if(trimmed.startsWith('//') && !trimmed.startsWith('///'))assert.match(trimmed,/^\/\/ [A-Za-z]+ [A-Za-z]+$/,relative);
   if(trimmed.startsWith('/*'))assert.match(trimmed,/^\/\* [A-Za-z]+ [A-Za-z]+ \*\/$/,relative);
   if(trimmed.startsWith('<!--'))assert.match(trimmed,/^<!-- [A-Za-z]+ [A-Za-z]+ -->$/,relative);
  }
 }
});
test('print source validation distinguishes citations containing URLs from executable markup',()=>{
 const {safePrintMarkup}=require('../lib/security');
 assert.equal(safePrintMarkup('<p>Catalog reference: https://example.invalid/record</p>'),true);
 assert.equal(safePrintMarkup('<p>Local reference: file:///example/path</p>'),true);
 for(const payload of ['<script>alert(1)</script>','<img src="https://host.invalid/x">','<div onclick="bad()">','<style>@import "https://host.invalid/x"</style>','<div style="background:url(http://host.invalid/x)">']){
  assert.equal(safePrintMarkup(payload),false,payload);
 }
});
test('legacy profiles do not print research notes unless explicitly included',()=>{
 const {format}=require('../lib/gedcom');
 const source=ged.replace('0 TRLR','0 @I900@ INDI\n1 NAME Archivist /Example/\n1 BIRT\n2 DATE 1850\n1 DEAT\n2 DATE 1930\n1 NOTE Private correspondence\n0 TRLR');
 const tree=parse(source);
 const plain=format(tree,{mode:'profiles',limit:200,includeSources:false}).html;
 assert.ok(!plain.includes('Private correspondence'));
 assert.ok(format(tree,{mode:'profiles',limit:200,includeSources:false,includeNotes:true}).html.includes('Private correspondence'));
});
