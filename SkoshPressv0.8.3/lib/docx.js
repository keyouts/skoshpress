'use strict';
// Manuscript Import

                                                                            
                                                                        
                                                                                  
const zlib = require('node:zlib');

const MAX_DOCX_BYTES = 32 * 1024 * 1024;
const MAX_XML_BYTES = 12 * 1024 * 1024;

function unzipEntry(buffer, requestedName) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_DOCX_BYTES) throw new Error('DOCX is too large (32 MB limit).');
                                                                                  
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid DOCX/ZIP file.');
  let cursor = buffer.readUInt32LE(eocd + 16);
  const count = buffer.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    if (cursor + 46 + nameLen > buffer.length) break;
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLen);
    cursor += 46 + nameLen + extraLen + commentLen;
    if (name !== requestedName) continue;
    if (flags & 1) throw new Error('Encrypted DOCX files are not supported.');
    if (size > MAX_XML_BYTES || compressedSize > MAX_DOCX_BYTES) throw new Error('DOCX document XML is too large.');
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) break;
    const offset = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (offset + compressedSize > buffer.length) throw new Error('Corrupt DOCX file.');
    const compressed = buffer.subarray(offset, offset + compressedSize);
    let output;
    if (method === 0) output = compressed;
    else if (method === 8) output = zlib.inflateRawSync(compressed, { maxOutputLength: MAX_XML_BYTES });
    else throw new Error('Unsupported DOCX ZIP compression method.');
    if (output.length > MAX_XML_BYTES || output.length !== size) throw new Error('Corrupt DOCX XML length.');
    return output.toString('utf8');
  }
  throw new Error('DOCX is missing word/document.xml.');
}

function decodeXml(value) {
  return value.replace(/&#x([0-9a-f]+);|&#([0-9]+);|&(?:amp|lt|gt|quot|apos);/gi, match => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (named[match.toLowerCase()]) return named[match.toLowerCase()];
    const code = match.startsWith('&#x') ? parseInt(match.slice(3), 16) : parseInt(match.slice(2), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  });
}
function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function getStyleTag(props, name) {
  return new RegExp(`<w:${name}(?:\\s[^>]*)?\\s*/?>`).test(props) && !new RegExp(`<w:${name}\\s[^>]*w:val=["'](?:0|false|off)["']`).test(props);
}

function parseRun(runXml) {
  const props = (runXml.match(/<w:rPr(?:\s[^>]*)?>([\s\S]*?)<\/w:rPr>/) || [,''])[1];
  let content = '';
                                                          
  const pattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab(?:\s[^>]*)?\s*\/>|<w:br(?:\s[^>]*)?\s*\/>|<w:cr(?:\s[^>]*)?\s*\/>/g;
  for (const item of runXml.matchAll(pattern)) {
    if (item[1] !== undefined) content += escapeHtml(decodeXml(item[1]));
    else if (/w:tab/.test(item[0])) content += '    ';
    else content += '<br>';
  }
  if (!content) return '';
  if (getStyleTag(props, 'b')) content = `<strong>${content}</strong>`;
  if (getStyleTag(props, 'i')) content = `<em>${content}</em>`;
  if (getStyleTag(props, 'u')) content = `<u>${content}</u>`;
  if (getStyleTag(props, 'strike')) content = `<s>${content}</s>`;
  return content;
}

function docxXmlToHtml(xml) {
  if (!/<w:document\b/.test(xml)) throw new Error('DOCX document.xml has no Word document root.');
  const body = (xml.match(/<w:body(?:\s[^>]*)?>([\s\S]*?)<\/w:body>/) || [,''])[1];
  if (!body) throw new Error('DOCX does not contain a document body.');
  const paragraphs = [];
  for (const paragraph of body.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const inner = paragraph[1];
    const ppr = (inner.match(/<w:pPr(?:\s[^>]*)?>([\s\S]*?)<\/w:pPr>/) || [,''])[1];
    const style = ((ppr.match(/<w:pStyle\b[^>]*w:val=["']([^"']+)/) || [,''])[1]).toLowerCase();
    const tag = /^heading\s*1$|^heading1$|^title$/.test(style) ? 'h1' : /^heading\s*2$|^heading2$|^subtitle$/.test(style) ? 'h2' : /^heading\s*3$|^heading3$/.test(style) ? 'h3' : 'p';
    let runs = '';
    for (const run of inner.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)) runs += parseRun(run[1]);
    if (!runs) runs = '<br>';
    paragraphs.push(`<${tag}>${runs}</${tag}>`);
  }
  return paragraphs.join('\n');
}

function parseDocx(buffer) { return docxXmlToHtml(unzipEntry(buffer, 'word/document.xml')); }
function plainTextToHtml(text) {
  return text.replace(/\r\n?/g, '\n').split(/\n\n+/).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>') || '<br>'}</p>`).join('\n');
}
module.exports = { unzipEntry, parseDocx, docxXmlToHtml, plainTextToHtml, escapeHtml };
