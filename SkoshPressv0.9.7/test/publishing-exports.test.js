'use strict';
// Export Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {toPlainText,toDocx,toEpub,makeZip,pageBlocks}=require('../lib/publishing-exports');
const sample={name:'Harmless <Research> & Notes',paper:{width:148,height:210,margin:16},pages:[
  {frames:[{type:'text',x:20,y:10,html:'<h1>Family &amp; Friends</h1><p>Mary &lt;Smith&gt; and 🌲 — 1890.</p><p>Source: https://example.invalid/record</p>'}]},
  {frames:[{type:'text',x:20,y:30,html:'<h2>Another page</h2><p>Dates 1900–1950</p>'}]}]};
function entries(zip){
  const result=new Map();let at=0;
  while(zip.readUInt32LE(at)===0x04034b50){
    const method=zip.readUInt16LE(at+8),len=zip.readUInt32LE(at+18),filenameLen=zip.readUInt16LE(at+26),extraLen=zip.readUInt16LE(at+28);
    const name=zip.subarray(at+30,at+30+filenameLen).toString('utf8');
    const data=zip.subarray(at+30+filenameLen+extraLen,at+30+filenameLen+extraLen+len);
    result.set(name,method===0?data:zlib.inflateRawSync(data));
    at+=30+filenameLen+extraLen+len;
  }
  assert.equal(zip.readUInt32LE(at),0x02014b50);
  return result;
}
test('page-based export preserves text, heading order and UTF-8 content',()=>{
  assert.equal(pageBlocks(sample.pages[0])[0].kind,'h1');
  const output=toPlainText(sample).toString('utf8');
  assert.ok(output.includes('Family & Friends'));
  assert.ok(output.includes('Mary <Smith> and 🌲'));
  assert.ok(output.indexOf('1890')<output.indexOf('Another page'));
});
test('Word exports are valid ZIP structures with XML-escaped content and page dimensions',()=>{
  const doc=entries(toDocx(sample));
  for(const name of ['[Content_Types].xml','_rels/.rels','word/document.xml','word/styles.xml'])assert.ok(doc.has(name),name);
  const markup=doc.get('word/document.xml').toString('utf8');
  assert.match(markup,/w:pgSz w:w="8391" w:h="11906"/);
  assert.match(markup,/Mary &lt;Smith&gt; and 🌲/);
  assert.match(markup,/w:pStyle w:val="Heading1"/);
  assert.doesNotMatch(markup,/<Smith>/);
});
test('EPUB contains first uncompressed mimetype, navigable content and unique metadata',()=>{
  const epub=toEpub(sample),zip=entries(epub);
  assert.equal(epub.subarray(30,38).toString(),'mimetype');
  assert.equal(epub.readUInt16LE(8),0);
  assert.equal(zip.get('mimetype').toString(),'application/epub+zip');
  for(const name of ['META-INF/container.xml','OEBPS/content.opf','OEBPS/nav.xhtml','OEBPS/part-001.xhtml'])assert.ok(zip.has(name),name);
  const content=zip.get('OEBPS/part-001.xhtml').toString('utf8');
  assert.ok(content.includes('Mary &lt;Smith&gt; and 🌲'));
  assert.match(zip.get('OEBPS/content.opf').toString('utf8'),/dcterms:modified/);
  assert.match(content,/Another page/);
});
test('malicious markup only appears as escaped text in portable exports',()=>{
  const hostile={...sample,pages:[{frames:[{type:'text',x:1,y:1,html:'<p><img src="https://malicious.invalid/x"/>Safe</p><p>&lt;script&gt;bad()&lt;/script&gt;</p>'}]}]};
  const word=entries(toDocx(hostile)).get('word/document.xml').toString('utf8');
  const ebook=entries(toEpub(hostile)).get('OEBPS/part-001.xhtml').toString('utf8');
  for(const result of [word,ebook]){
    assert.doesNotMatch(result,/<script>/);
    assert.doesNotMatch(result,/src="https:\/\//);
    assert.match(result,/Safe/);
  }
});
test('publishing export is wired through the restricted native bridge',()=>{
  const root=path.resolve(__dirname,'..');const read=name=>fs.readFileSync(path.join(root,name),'utf8');
  assert.match(read('main.js'),/ipcMain.handle\('export:publication'/);
  assert.match(read('main.js'),/assertSender\(event\)/);
  assert.match(read('preload.js'),/exportPublication:/);
  assert.match(read('src/index.html'),/id="publication-export-submit"/);
  assert.match(read('src/app.js'),/exportSelectedPublication/);
});

test('Word and EPUB preserve emphasis without trusting embedded markup',()=>{
  const rich={...sample,pages:[{frames:[{type:'text',x:0,y:0,html:'<p><strong>Record ID:</strong> @I10@ <em>approximate</em></p>'}]}]};
  const word=entries(toDocx(rich)).get('word/document.xml').toString('utf8');
  const ebook=entries(toEpub(rich)).get('OEBPS/part-001.xhtml').toString('utf8');
  assert.match(word,/<w:b\/>/);
  assert.match(word,/<w:i\/>/);
  assert.match(ebook,/<strong>Record ID:<\/strong>/);
  assert.match(ebook,/<em>approximate<\/em>/);
});
