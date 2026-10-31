'use strict';
// Publishing Exports
const zlib=require('node:zlib');
const crypto=require('node:crypto');
const {plainFromHtml,decodeHtml}=require('./interchange');

const xml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g,'').replace(/([\uD800-\uDBFF])(?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])([\uDC00-\uDFFF])/g,'');
const paragraphText=html=>plainFromHtml(html).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').slice(0,5_000_000);
function pageBlocks(page){
  const frames=page.frames.filter(frame=>frame.type==='text').sort((a,b)=>a.y-b.y||a.x-b.x);
  const blocks=[];
  for(const frame of frames){
    const markup=String(frame.html||'');
    const matches=[...markup.matchAll(/<\s*(h[1-3]|p|li)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi)];
    if(matches.length){
      let end=0;
      const additional=(piece)=>{
        const text=paragraphText(piece);
        if(text)blocks.push({kind:'p',text,inline:null});
      };
      for(const item of matches){
        additional(markup.slice(end,item.index));
        const text=paragraphText(item[2]);
        if(text)blocks.push({kind:item[1].toLowerCase(),text,inline:item[2]});
        end=item.index+item[0].length;
      }
      additional(markup.slice(end));
    }else{
      const text=paragraphText(markup);
      if(text)for(const line of text.split(/\n{2,}/))if(line.trim())blocks.push({kind:'p',text:line.trim(),inline:null});
    }
  }
  return blocks;
}
function inlineRuns(markup){
  if(typeof markup!=='string')return [];
  const result=[],stack=[],active={bold:0,italic:0,underline:0};
  for(const token of markup.match(/<[^>]*>|[^<]+/g)||[]){
    if(token.startsWith('<')){
      const match=token.match(/^<\s*(\/)?\s*(strong|b|em|i|u|br)\b/i);
      if(!match)continue;
      const tag=match[2].toLowerCase(),closing=!!match[1];
      if(tag==='br'){result.push({text:'\n',...active});continue;}
      const kind=tag==='strong'||tag==='b'?'bold':tag==='em'||tag==='i'?'italic':'underline';
      active[kind]=Math.max(0,active[kind]+(closing?-1:1));
    }else{
      const text=decodeHtml(token).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
      if(text)result.push({text,bold:active.bold>0,italic:active.italic>0,underline:active.underline>0});
    }
  }
  return result;
}
function manuscript(doc){return doc.pages.map(pageBlocks);}
function toPlainText(doc){return Buffer.from(manuscript(doc).map(blocks=>blocks.map(b=>b.text).join('\n\n')).filter(Boolean).join('\n\n'),'utf8');}

// Archive Packaging
const CRC_TABLE=(()=>{const a=[];for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);a.push(c>>>0);}return a;})();
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=CRC_TABLE[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function makeZip(entries){
  if(!Array.isArray(entries) || entries.length>2000)throw Error('Too many archive entries.');
  const locals=[],centrals=[],names=new Set();let offset=0;
  for(const {name,content,store=false} of entries){
    if(typeof name!=='string'||!/^[A-Za-z0-9_./\[\]-]+$/.test(name)||name.includes('..')||name.startsWith('/')||names.has(name))throw Error('Invalid or duplicate archive entry name.');
    names.add(name);
    const nameBytes=Buffer.from(name,'utf8');const input=Buffer.isBuffer(content)?content:Buffer.from(content,'utf8');
    const compressed=store?input:zlib.deflateRawSync(input,{level:6});
    const crc=crc32(input);const method=store?0:8;
    if(input.length>64*1024*1024||compressed.length>64*1024*1024)throw Error('Archive entry too large.');
    const local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(method,8);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(input.length,22);local.writeUInt16LE(nameBytes.length,26);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x0800,8);central.writeUInt16LE(method,10);
    central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(input.length,24);central.writeUInt16LE(nameBytes.length,28);
    central.writeUInt32LE(offset,42);
    locals.push(local,nameBytes,compressed);centrals.push(central,nameBytes);
    offset+=local.length+nameBytes.length+compressed.length;
    if(offset>96*1024*1024)throw Error('Archive exceeds the export size limit.');
  }
  const dir=Buffer.concat(centrals);const end=Buffer.alloc(22);
  if(offset+dir.length+end.length>96*1024*1024)throw Error('Archive exceeds the export size limit.');
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,dir,end]);
}

// Word Manuscript
const twips=mm=>Math.round(mm*1440/25.4);
function docxParagraph(block){
  const style=({h1:'Heading1',h2:'Heading2',h3:'Heading3',li:'ListParagraph'})[block.kind]||'Normal';
  const runs=block.inline===null? [{text:block.text,bold:false,italic:false,underline:false}]:inlineRuns(block.inline);
  const content=runs.map(run=>{
    const properties=(run.bold?'<w:b/>':'')+(run.italic?'<w:i/>':'')+(run.underline?'<w:u w:val="single"/>':'');
    const parts=run.text.split('\n').map((line,i)=>(i?'<w:br/>':'')+(line?`<w:t xml:space="preserve">${xml(line)}</w:t>`:'')).join('');
    return `<w:r>${properties?`<w:rPr>${properties}</w:rPr>`:''}${parts}</w:r>`;
  }).join('');
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${content}</w:p>`;
}
function toDocx(doc){
  const pages=manuscript(doc);
  const content=pages.map(blocks=>blocks.map(docxParagraph).join('')).join('');
  const pageW=twips(doc.paper.width),pageH=twips(doc.paper.height),margin=twips(doc.paper.margin);
  const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${content}<w:sectPr><w:pgSz w:w="${pageW}" w:h="${pageH}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>${[1,2,3].map(n=>`<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${n-1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${n===1?36:n===2?30:25}"/></w:rPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style></w:styles>`;
  return makeZip([
    {name:'[Content_Types].xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'},
    {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
    {name:'word/document.xml',content:documentXml},
    {name:'word/_rels/document.xml.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
    {name:'word/styles.xml',content:styles}
  ]);
}

// Epub Manuscript
function toEpub(doc){
  const pages=manuscript(doc), title=xml(doc.name), chapters=[];
  for(let i=0;i<pages.length;i+=25){
    const number=chapters.length+1;
    const heading=`Part ${number}`;
    const text=pages.slice(i,i+25).map(blocks=>blocks.map(block=>{
      const tag=/^h[1-3]$/.test(block.kind)?block.kind:'p';
      const runs=block.inline===null?[{text:block.text,bold:false,italic:false,underline:false}]:inlineRuns(block.inline);
      const content=runs.map(run=>{
        let value=xml(run.text).replace(/\n/g,'<br/>');
        if(run.bold)value=`<strong>${value}</strong>`;
        if(run.italic)value=`<em>${value}</em>`;
        if(run.underline)value=`<span class="underline">${value}</span>`;
        return value;
      }).join('');
      return `<${tag}>${content}</${tag}>`;
    }).join('')).join('\n');
    chapters.push({number,heading,filename:`part-${String(number).padStart(3,'0')}.xhtml`,text});
  }
  const metadata=`<dc:title>${title}</dc:title><dc:language>en</dc:language><dc:identifier id="pub-id">urn:uuid:${crypto.randomUUID()}</dc:identifier><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/,'Z')}</meta>`;
  const opf=`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="en"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">${metadata}</metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="style.css" media-type="text/css"/>${chapters.map(c=>`<item id="part${c.number}" href="${c.filename}" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map(c=>`<itemref idref="part${c.number}"/>`).join('')}</spine></package>`;
  const nav=`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><title>${title} · Contents</title></head><body><nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops" id="toc"><h1>Contents</h1><ol>${chapters.map(c=>`<li><a href="${c.filename}">${c.heading}</a></li>`).join('')}</ol></nav></body></html>`;
  const entries=[{name:'mimetype',content:'application/epub+zip',store:true},
    {name:'META-INF/container.xml',content:'<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'},
    {name:'OEBPS/content.opf',content:opf},{name:'OEBPS/nav.xhtml',content:nav},
    {name:'OEBPS/style.css',content:'body{font-family:serif;line-height:1.5;margin:5%}h1,h2,h3{line-height:1.2;page-break-after:avoid}p{margin:.45em 0 1em}.underline{text-decoration:underline}'}
  ];
  for(const c of chapters)entries.push({name:`OEBPS/${c.filename}`,content:`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><title>${title} · ${c.heading}</title><link rel="stylesheet" href="style.css" type="text/css"/></head><body>${c.text}</body></html>`});
  return makeZip(entries);
}
module.exports={pageBlocks,manuscript,toPlainText,toDocx,toEpub,makeZip,xml};
