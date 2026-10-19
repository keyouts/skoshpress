'use strict';
// Font Validation
                                                                                        
const FORMATS = Object.freeze({
  '.ttf': {mime:'font/ttf', magic:'00010000'},
  '.otf': {mime:'font/otf', magic:'4f54544f'},
  '.woff': {mime:'font/woff', magic:'774f4646'},
  '.woff2': {mime:'font/woff2', magic:'774f4632'}
});
const MAX_FONT_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_FONT_BYTES = 16 * 1024 * 1024;
function checkedFont(filename, buffer) {
  const extension = require('node:path').extname(filename).toLowerCase();
  const format = FORMATS[extension];
  if(!format || !Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.length > MAX_FONT_BYTES || buffer.subarray(0,4).toString('hex') !== format.magic) {
    throw new Error('Unsupported or invalid font. Use a TTF, OTF, WOFF or WOFF2 file up to 5 MB.');
  }
  const label = require('node:path').basename(filename,extension).replace(/[^\p{L}\p{N} _.-]/gu,' ').trim().slice(0,64) || 'Imported font';
  return { name:label, mime:format.mime, data:`data:${format.mime};base64,${buffer.toString('base64')}` };
}
function validateFonts(fonts) {
  if(!Array.isArray(fonts) || fonts.length > 30) throw new Error('Invalid project font list.');
  let total = 0;
  const ids = new Set();
  for(const f of fonts) {
    if(!f || typeof f.id !== 'string' || !/^font-[a-z0-9-]{1,70}$/i.test(f.id) || ids.has(f.id) || typeof f.name !== 'string' || f.name.length > 64) throw new Error('Invalid project font entry.');
    ids.add(f.id);
    const match = typeof f.data === 'string' && f.data.match(/^data:(font\/(?:ttf|otf|woff2?));base64,([A-Za-z0-9+/]+={0,2})$/);
    if(!match || f.data.length > MAX_FONT_BYTES * 1.4 + 60) throw new Error('Invalid embedded font data.');
    const raw = Buffer.from(match[2],'base64');
    if(raw.length > MAX_FONT_BYTES || raw.length < 12) throw new Error('Invalid font size.');
    const signature = raw.subarray(0,4).toString('hex');
    const correct = Object.values(FORMATS).some(entry=>entry.mime === match[1] && entry.magic === signature);
    if(!correct) throw new Error('Invalid embedded font signature.');
    total += raw.length;
    if(total > MAX_TOTAL_FONT_BYTES) throw new Error('Project fonts exceed 16 MB.');
  }
  return fonts;
}
module.exports = {checkedFont,validateFonts,MAX_FONT_BYTES,MAX_TOTAL_FONT_BYTES};
