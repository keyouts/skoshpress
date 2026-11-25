'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseDocx, unzipEntry, docxXmlToHtml, plainTextToHtml, escapeHtml } = require('../lib/docx');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'example.docx'));

test('imports ordinary DOCX paragraphs, headings and styled runs', () => {
  const html = parseDocx(fixture);
  assert.match(html, /<h1>Chapter One<\/h1>/);
  assert.match(html, /Normal <strong>bold<\/strong> and <em>italic<\/em> &amp; more/);
  assert.match(html, /<p>Last line<\/p>/);
});
test('rejects corrupt and excessively large ZIP containers', () => {
  assert.throws(() => unzipEntry(Buffer.from('no ZIP'), 'word/document.xml'), /valid DOCX/);
  assert.throws(() => unzipEntry(Buffer.alloc(32 * 1024 * 1024 + 1), 'word/document.xml'), /too large/);
});
test('does not interpolate XML source into document HTML', () => {
  const source='<w:document><w:body><w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt;</w:t></w:r></w:p></w:body></w:document>';
  assert.equal(docxXmlToHtml(source), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(escapeHtml('<&>"'), '&lt;&amp;&gt;&quot;');
});
test('imports paragraph breaks from ordinary text', () => {
  assert.equal(plainTextToHtml('Hello\nthere\n\nSecond'), '<p>Hello<br>there</p>\n<p>Second</p>');
});
