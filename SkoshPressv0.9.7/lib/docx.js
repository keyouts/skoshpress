'use strict';
// Manuscript Import

                                                                            
                                                                        
                                                                                  
const zlib = require('node:zlib');
const {crc32}=require('./zip-integrity');

const MAX_DOCX_BYTES = 32 * 1024 * 1024;
const MAX_XML_BYTES = 12 * 1024 * 1024;

function archiveDirectory(buffer) {
  if(!Buffer.isBuffer(buffer)||buffer.length>MAX_DOCX_BYTES)throw Error('DOCX is too large (32 MB limit).');
  const invalid=()=>{throw Error('Corrupt DOCX file.');};
  let end=-1;
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--){
    if(buffer.readUInt32LE(i)===0x06054b50&&i+22+buffer.readUInt16LE(i+20)===buffer.length){end=i;break;}
  }
  if(end<0)throw Error('Not a valid DOCX/ZIP file.');
  const count=buffer.readUInt16LE(end+10),directory=buffer.readUInt32LE(end+16);
  if(buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6)||buffer.readUInt16LE(end+8)!==count||!count||count===65535||directory+buffer.readUInt32LE(end+12)!==end)invalid();
  let cursor=directory;const entries=new Map();
  for(let i=0;i<count;i++){
    if(cursor+46>end||buffer.readUInt32LE(cursor)!==0x02014b50)invalid();
    const flags=buffer.readUInt16LE(cursor+8),method=buffer.readUInt16LE(cursor+10),crc=buffer.readUInt32LE(cursor+16),packed=buffer.readUInt32LE(cursor+20),size=buffer.readUInt32LE(cursor+24),length=buffer.readUInt16LE(cursor+28),extra=buffer.readUInt16LE(cursor+30),comment=buffer.readUInt16LE(cursor+32),local=buffer.readUInt32LE(cursor+42);
    if(!length||cursor+46+length+extra+comment>end||buffer.readUInt16LE(cursor+34)||local+30>directory||packed===0xffffffff||size===0xffffffff)invalid();
    const nameBytes=buffer.subarray(cursor+46,cursor+46+length),name=nameBytes.toString('utf8');
    if(entries.has(name)||buffer.readUInt32LE(local)!==0x04034b50||buffer.readUInt16LE(local+6)!==flags||buffer.readUInt16LE(local+8)!==method||buffer.readUInt16LE(local+26)!==length)invalid();
    const start=local+30+length+buffer.readUInt16LE(local+28);
    if(start+packed>directory||!buffer.subarray(local+30,local+30+length).equals(nameBytes))invalid();
    if(!(flags&8)&&(buffer.readUInt32LE(local+14)!==crc||buffer.readUInt32LE(local+18)!==packed||buffer.readUInt32LE(local+22)!==size))invalid();
    entries.set(name,{flags,method,crc,packed,size,start,local});cursor+=46+length+extra+comment;
  }
  if(cursor!==end)invalid();
  let previousEnd=0;
  for(const entry of [...entries.values()].sort((a,b)=>a.local-b.local)){
    if(entry.local<previousEnd)invalid();previousEnd=entry.start+entry.packed;
  }
  return entries;
}
function unzipEntry(buffer,requestedName,entries=archiveDirectory(buffer)){
  const entry=entries.get(requestedName);
  if(!entry)throw Error('DOCX is missing '+requestedName+'.');
  const {flags,method,crc,packed,size,start}=entry;
  if(flags&1)throw Error('Encrypted DOCX files are not supported.');
  if(size>MAX_XML_BYTES||packed>MAX_DOCX_BYTES)throw Error('DOCX document XML is too large.');
  const compressed=buffer.subarray(start,start+packed);let output;
  if(method===0)output=compressed;
  else if(method===8)output=zlib.inflateRawSync(compressed,{maxOutputLength:MAX_XML_BYTES});
  else throw Error('Unsupported DOCX ZIP compression method.');
  if(output.length!==size||crc32(output)!==crc)throw Error('Corrupt DOCX XML checksum or length.');
  return output.toString('utf8');
}

function decodeXml(value) {
  return value.replace(/&#x([0-9a-f]+);|&#([0-9]+);|&(?:amp|lt|gt|quot|apos);/gi, match => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (named[match.toLowerCase()]) return named[match.toLowerCase()];
    const code = match.slice(0,3).toLowerCase()==='&#x' ? parseInt(match.slice(3), 16) : parseInt(match.slice(2), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  });
}
function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function getStyleTag(props, name) {
  return new RegExp(`<w:${name}(?:\\s[^>]*)?\\s*/?>`).test(props) && !new RegExp(`<w:${name}\\s[^>]*w:val=["'](?:0|false|off)["']`).test(props);
}

function parseRun(runXml, noteNumbers) {
  const props = (runXml.match(/<w:rPr(?:\s[^>]*)?>([\s\S]*?)<\/w:rPr>/) || [,''])[1];
  let content = '';
                                                          
  const pattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab(?:\s[^>]*)?\s*\/>|<w:br(?:\s[^>]*)?\s*\/>|<w:cr(?:\s[^>]*)?\s*\/>|<w:footnoteReference\b[^>]*w:id=["'](\d+)["'][^>]*\/>/g;
  for (const item of runXml.matchAll(pattern)) {
    if (item[1] !== undefined) content += escapeHtml(decodeXml(item[1]));
    else if(item[2]!==undefined){const n=noteNumbers?.get(item[2]);if(n)content+=`<sup>[${n}]</sup>`;}
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

function attr(xml,name){return (xml.match(new RegExp('w:'+name+'=["\']([^"\']+)["\']'))||[])[1];}
function numberingKinds(xml=''){
  const abstracts=new Map(),nums=new Map();
  for(const m of xml.matchAll(/<w:abstractNum\b([^>]*)>([\s\S]*?)<\/w:abstractNum>/g)){
    const levels=new Map();for(const level of m[2].matchAll(/<w:lvl\b([^>]*)>([\s\S]*?)<\/w:lvl>/g)){const fmt=(level[2].match(/<w:numFmt\b[^>]*>/)||[])[0]||'';levels.set(attr(level[1],'ilvl'),attr(fmt,'val')==='bullet'?'ul':'ol');}
    abstracts.set(attr(m[1],'abstractNumId'),levels);
  }
  for(const m of xml.matchAll(/<w:num\b([^>]*)>([\s\S]*?)<\/w:num>/g)){const ref=(m[2].match(/<w:abstractNumId\b[^>]*>/)||[])[0]||'';nums.set(attr(m[1],'numId'),abstracts.get(attr(ref,'val')));}
  return nums;
}
function docxXmlToHtml(xml,{numbering='',noteNumbers=new Map()}={}) {
  if (!/<w:document\b/.test(xml)) throw new Error('DOCX document.xml has no Word document root.');
  const body = (xml.match(/<w:body(?:\s[^>]*)?>([\s\S]*?)<\/w:body>/) || [,''])[1];
  if (!body) throw new Error('DOCX does not contain a document body.');
  const paragraphs=[],kinds=numberingKinds(numbering);let list=null;
  function closeList(){if(list){paragraphs.push(`</${list.tag}>`);list=null;}}
  for (const paragraph of body.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const inner = paragraph[1];
    const ppr = (inner.match(/<w:pPr(?:\s[^>]*)?>([\s\S]*?)<\/w:pPr>/) || [,''])[1];
    const style = ((ppr.match(/<w:pStyle\b[^>]*w:val=["']([^"']+)/) || [,''])[1]).toLowerCase();
    const tag = /^heading\s*1$|^heading1$|^title$/.test(style) ? 'h1' : /^heading\s*2$|^heading2$|^subtitle$/.test(style) ? 'h2' : /^heading\s*3$|^heading3$/.test(style) ? 'h3' : 'p';
    let runs = '';
    for (const run of inner.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)) runs += parseRun(run[1],noteNumbers);
    if (!runs) runs = '<br>';
    const num=attr((ppr.match(/<w:numId\b[^>]*>/)||[])[0]||'','val');
    const level=attr((ppr.match(/<w:ilvl\b[^>]*>/)||[])[0]||'','val')||'0';
    if(num&&num!=='0'&&tag==='p'){
      const kind=kinds.get(num)?.get(level)||'ul',key=num+':'+level;
      if(list?.key!==key){closeList();list={tag:kind,key};paragraphs.push(`<${kind}>`);}
      paragraphs.push(`<li>${runs}</li>`);
    }else{closeList();paragraphs.push(`<${tag}>${runs}</${tag}>`);}
  }
  closeList();return paragraphs.join('\n');
}
function optionalEntry(buffer,name,entries){try{return unzipEntry(buffer,name,entries);}catch(error){if(error.message==='DOCX is missing '+name+'.')return '';throw error;}}
function parseDocxDetailed(buffer){
  const entries=archiveDirectory(buffer);
  const document=unzipEntry(buffer,'word/document.xml',entries),footnotes=optionalEntry(buffer,'word/footnotes.xml',entries);
  const notes=[],noteNumbers=new Map(),definitions=new Map();
  for(const m of footnotes.matchAll(/<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/g)){
    const id=attr(m[1],'id');if(!/^\d+$/.test(id||'')||attr(m[1],'type'))continue;
    const text=[...m[2].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(x=>decodeXml(x[1])).join(' ').replace(/\s+/g,' ').trim();
    if(text)definitions.set(id,text);
  }
  for(const ref of document.matchAll(/<w:footnoteReference\b[^>]*w:id=["'](\d+)["'][^>]*\/>/g)){
    if(noteNumbers.has(ref[1])||!definitions.has(ref[1]))continue;
    const number=notes.length+1;if(number>500||definitions.get(ref[1]).length>2000)throw Error('Imported footnotes exceed the supported limits.');
    noteNumbers.set(ref[1],number);notes.push({number,text:definitions.get(ref[1])});
  }
  return {html:docxXmlToHtml(document,{numbering:optionalEntry(buffer,'word/numbering.xml',entries),noteNumbers}),notes};
}
function parseDocx(buffer){return parseDocxDetailed(buffer).html;}
function markdownToHtml(text){
  const blocks=[];let paragraph=[],list=null;
  function flush(){if(paragraph.length){blocks.push('<p>'+paragraph.map(escapeHtml).join('<br>')+'</p>');paragraph=[];}if(list){blocks.push(`</${list}>`);list=null;}}
  for(const line of String(text).replace(/\r\n?/g,'\n').split('\n')){
    const heading=/^(#{1,6})\s+(.+)$/.exec(line),item=/^\s*(?:(\d+)[.)]|[-+*])\s+(.+)$/.exec(line);
    if(heading){flush();const level=Math.min(3,heading[1].length);blocks.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);}
    else if(item){const tag=item[1]?'ol':'ul';if(list!==tag){flush();list=tag;blocks.push(`<${tag}>`);}blocks.push(`<li>${escapeHtml(item[2])}</li>`);}
    else if(!line.trim())flush();else{if(list)flush();paragraph.push(line);}
  }
  flush();return blocks.join('\n');
}
function plainTextToHtml(text) {
  return text.replace(/\r\n?/g, '\n').split(/\n\n+/).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>') || '<br>'}</p>`).join('\n');
}
module.exports = { unzipEntry, parseDocx, parseDocxDetailed, docxXmlToHtml, plainTextToHtml, markdownToHtml, escapeHtml };
