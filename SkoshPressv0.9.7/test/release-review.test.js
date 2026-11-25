'use strict';
// Release Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {STANDALONE_CSP,safeStandaloneHtml}=require('../lib/security');
const {makeZip}=require('../lib/publishing-exports');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const standalone=content=>`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${content}"></head><body><p>Catalog entry</p></body></html>`;
test('standalone HTML export requires the expected exact restrictive policy',()=>{
  assert.equal(safeStandaloneHtml(standalone(STANDALONE_CSP)),true);
  assert.equal(safeStandaloneHtml(standalone("default-src *; script-src 'unsafe-inline'")),false);
  assert.equal(safeStandaloneHtml('<!doctype html><html><body>Content-Security-Policy</body></html>'),false);
  assert.equal(safeStandaloneHtml(standalone(STANDALONE_CSP).replace('<p>Catalog entry</p>','<script>alert(1)</script>')),false);
  assert.equal(safeStandaloneHtml(standalone(STANDALONE_CSP).replace('<p>Catalog entry</p>','<img src="https://outside.invalid/pixel">')),false);
  const renderer=read('src/app.js');
  assert.ok(renderer.includes(`content="${STANDALONE_CSP}"`));
  assert.match(read('main.js'),/safeStandaloneHtml\(html\)/);
});
test('portable archive creation rejects duplicate entries and unsafe names',()=>{
  const record={name:'word/document.xml',content:'<p>Safe</p>'};
  assert.throws(()=>makeZip([record,record]),/duplicate archive entry/);
  assert.throws(()=>makeZip([{name:'../outside.txt',content:'x'}]),/archive entry/);
  assert.throws(()=>makeZip([{name:'folder\\outside.txt',content:'x'}]),/archive entry/);
  assert.throws(()=>makeZip(Array.from({length:2001},(_,i)=>({name:`part-${i}.xml`,content:'x'}))),/Too many archive entries/);
  assert.ok(makeZip([record]).subarray(0,4).equals(Buffer.from('504b0304','hex')));
});
test('publication export exposes helpful invisible names and status announcements',()=>{
  const html=read('src/index.html');
  const script=read('src/app.js');
  const expected={
    'interchange-btn':['aria-haspopup="dialog"','aria-controls="interchange-dialog"','aria-label="Open publication export formats"'],
    'publication-export-format':['aria-describedby="interchange-intro publication-export-description"'],
    'publication-export-submit':['aria-describedby="publication-export-description publication-export-status"'],
    'publication-export-status':['role="status"','aria-live="polite"','aria-atomic="true"'],
    'genealogy-csv-status':['role="status"','aria-live="polite"','aria-atomic="true"'],
    'genealogy-batch-progress':['aria-label="Batch publication progress"','aria-describedby="genealogy-batch-status"']
  };
  for(const [id,attributes] of Object.entries(expected)){
    const element=html.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`));
    assert.ok(element,`Missing ${id}`);
    for(const value of attributes)assert.ok(element[0].includes(value),`${id}: ${value}`);
  }
  for(const id of ['interchange-intro','publication-export-description','publication-export-status','genealogy-batch-status','genealogy-csv-status'])assert.ok(html.includes(`id="${id}"`));
  assert.match(script,/Preparing .* export/);
  assert.match(script,/aria-valuetext/);
  assert.match(script,/status\.textContent='CSV export cancelled\.'/);
});
