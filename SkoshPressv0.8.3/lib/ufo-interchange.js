'use strict';
const zlib=require('node:zlib');
const {validDesign}=require('./font-design');
const {valid:validGlyph}=require('./vector-font');
const {ALL_CHARS}=require('./pixel-font');
const {randomUUID}=require('node:crypto');
const {buildZip,crc32}=require('./font-family-package');
const Spacing=require('./spacing-studio');
const MAX_ZIP=8*1024*1024,MAX_ENTRY=512*1024,MAX_TOTAL=12*1024*1024;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function zipEntries(data){
  if(!Buffer.isBuffer(data)||data.length>MAX_ZIP)throw new Error('UFO ZIP exceeds 8 MB.');
  const endStart=Math.max(0,data.length-65557);let eocd=-1;
  for(let i=data.length-22;i>=endStart;i--)if(data.readUInt32LE(i)===0x06054b50){eocd=i;break;}
  if(eocd<0)throw new Error('Invalid ZIP directory.');
  const count=data.readUInt16LE(eocd+10),size=data.readUInt32LE(eocd+12),offset=data.readUInt32LE(eocd+16);
  if(count>512||offset+size>eocd)throw new Error('Invalid UFO archive directory.');
  let pos=offset,total=0;const files=new Map();
  for(let i=0;i<count;i++){
    if(pos+46>data.length||data.readUInt32LE(pos)!==0x02014b50)throw new Error('Invalid UFO ZIP entry.');
    const method=data.readUInt16LE(pos+10),compressed=data.readUInt32LE(pos+20),plain=data.readUInt32LE(pos+24),nameLength=data.readUInt16LE(pos+28),extra=data.readUInt16LE(pos+30),comment=data.readUInt16LE(pos+32),flags=data.readUInt16LE(pos+8),local=data.readUInt32LE(pos+42);
    const end=pos+46+nameLength+extra+comment;
    if(end>data.length||plain>MAX_ENTRY||compressed>MAX_ENTRY||!([0,8].includes(method))||(flags&1)||total+plain>MAX_TOTAL||local+30>data.length)throw new Error('Unsupported or oversized UFO ZIP entry.');
    const name=data.toString('utf8',pos+46,pos+46+nameLength);
    if(name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||name.includes('\0')||!/^[-a-zA-Z0-9_. /]{1,255}$/.test(name)||files.has(name))throw new Error('Unsafe UFO archive filename.');
    if(data.readUInt32LE(local)!==0x04034b50)throw new Error('Invalid UFO ZIP local header.');
    const localNameLength=data.readUInt16LE(local+26),localExtra=data.readUInt16LE(local+28);
    if(local+30+localNameLength+localExtra>data.length||data.toString('utf8',local+30,local+30+localNameLength)!==name||data.readUInt16LE(local+8)!==method)throw new Error('Invalid UFO ZIP entry identity.');
    const start=local+30+localNameLength+localExtra;
    if(start+compressed>data.length)throw new Error('Invalid UFO ZIP payload.');
    let result;
    try{result=method===0?data.subarray(start,start+compressed):zlib.inflateRawSync(data.subarray(start,start+compressed),{maxOutputLength:MAX_ENTRY});}
    catch{throw new Error('Invalid compressed UFO payload.');}
    if(result.length!==plain||crc32(result)!==data.readUInt32LE(pos+16))throw new Error('UFO file checksum or size mismatch.');
    if(name.endsWith('.glif')||name.endsWith('.plist')){
      const xml=result.toString('utf8');if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))throw new Error('External XML entities are prohibited.');
    }
    files.set(name,Buffer.from(result));total+=plain;pos=end;
  }
  return files;
}
function glif(char,glyph,width){
  const name=`uni${char.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')}`;
  let xml=`<?xml version="1.0" encoding="UTF-8"?>\n<glyph name="${name}" format="2"><advance width="${width}"/><unicode hex="${char.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')}"/><outline>`;
  for(const contour of glyph){
    if(contour.length<3)continue;
    const points=[];
    for(let i=0;i<contour.length;i++){
      const prev=contour[(i+contour.length-1)%contour.length],node=contour[i];
      points.push(`<point x="${prev[4]}" y="${800-prev[5]}"/>`,`<point x="${node[2]}" y="${800-node[3]}"/>`,`<point x="${node[0]}" y="${800-node[1]}" type="curve"/>`);
    }
    xml+=`<contour>${points.join('')}</contour>`;
  }
  return xml+'</outline></glyph>';
}
function toUFO(design,glyphs){
  if(!validDesign(design)||design.kind!=='vector'||!glyphs||typeof glyphs!=='object')throw new Error('Invalid UFO export design.');
  const plist=(body)=>`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>${body}</dict></plist>`;
  const entries=[
    ['metainfo.plist',plist('<key>creator</key><string>app.skoshpress</string><key>formatVersion</key><integer>3</integer>')],
    ['fontinfo.plist',plist(`<key>familyName</key><string>${esc(design.name)}</string><key>styleName</key><string>Regular</string><key>unitsPerEm</key><integer>1000</integer><key>ascender</key><integer>800</integer><key>descender</key><integer>-200</integer>`) ],
    ['layercontents.plist','<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><array><array><string>public.default</string><string>glyphs</string></array></array></plist>']
  ];
  let contents='';
  for(const ch of ALL_CHARS){
    if(!Object.hasOwn(glyphs,ch))continue;
    const geometry=Spacing.resolveSpacing(glyphs[ch],design,ch).glyph;if(!validGlyph(geometry))throw new Error('Invalid glyph for UFO export.');
    const name=`uni${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')}`;
    const file=`${name}.glif`,width=Math.max(200,Math.min(1550,(design.advances?.[ch]??780)+(design.spacing??0)));
    contents+=`<key>${name}</key><string>${file}</string>`;
    entries.push([`glyphs/${file}`,glif(ch,geometry,width)]);
  }
  entries.push(['glyphs/contents.plist',plist(contents)]);
  entries.push(['README.txt','UFO3 Regular-master interchange. Static outlines, advances, and Unicode mappings are exported. For full Skosh variants, classes, and linked components, use .skoshfont.']);
  return buildZip(entries.map(([name,data])=>[name,Buffer.from(data,'utf8')]),{maxFiles:400,maxTotal:MAX_TOTAL});
}
function attributes(tag){
  const result=Object.create(null);for(const m of tag.matchAll(/([A-Za-z][\w-]*)\s*=\s*"([^"<>]{0,150})"/g))result[m[1]]=m[2];return result;
}
function fromUFO(bytes,name='Imported UFO'){
  const files=zipEntries(bytes);
  const location=[...files.keys()].find(name=>name==='glyphs/contents.plist'||/^[^/]+\.ufo\/glyphs\/contents\.plist$/i.test(name));
  const prefix=location?location.slice(0,-'glyphs/contents.plist'.length):'';
  const contents=location?files.get(location):null;if(!contents)throw new Error('UFO ZIP requires glyphs/contents.plist.');
  const xml=contents.toString('utf8'),index=new Map();
  for(const [,glyph,file] of xml.matchAll(/<key>([^<>]{1,80})<\/key>\s*<string>([^<>]{1,120}\.glif)<\/string>/g)){
    if(!/^[\w.-]+$/.test(file)||file.includes('..'))throw new Error('Invalid UFO glyph filename.');index.set(glyph,file);
  }
  const design={id:'font-'+randomUUID().slice(0,32),name:String(name).slice(0,64)||'Imported UFO',kind:'vector',glyphs:{},spacing:0,advances:{},kerning:{},variants:{},components:{},componentLinks:{}};
  let skipped=0;
  for(const [glyph,file] of index){
    const buffer=files.get(prefix+'glyphs/'+file);if(!buffer)continue;
    const body=buffer.toString('utf8');if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(body))throw new Error('Unsafe XML entities.');
    const unicode=/<unicode\b[^>]*\bhex="([0-9a-fA-F]{4,6})"/.exec(body);
    const cp=unicode?parseInt(unicode[1],16):/^uni([0-9a-fA-F]{4})$/.test(glyph)?parseInt(glyph.slice(3),16):null;
    const ch=cp!=null&&cp<0x10000?String.fromCharCode(cp):null;
    if(!ch||!ALL_CHARS.includes(ch))continue;
    const contours=[];let good=true;
    for(const [,content] of body.matchAll(/<contour\b[^>]*>([\s\S]*?)<\/contour>/g)){
      const points=[...content.matchAll(/<point\b[^>]*\/?\s*>/g)].map(m=>attributes(m[0]));
      if(points.length<3||points.length>540){good=false;break;}
      const nodes=[];
      for(let i=0;i<points.length;i++)if(points[i].type&&points[i].type!=='offcurve'){
        const a=points[i],before=points[(i+points.length-1)%points.length],after=points[(i+1)%points.length];
        const xy=[Number(a.x),Number(a.y)],inxy=before.type?xy:[Number(before.x),Number(before.y)],outxy=after.type?xy:[Number(after.x),Number(after.y)];
        if([...xy,...inxy,...outxy].some(v=>!Number.isFinite(v))){good=false;break;}
        nodes.push([xy[0],800-xy[1],inxy[0],800-inxy[1],outxy[0],800-outxy[1]].map(v=>Math.round(v*10)/10));
      }
      if(nodes.length<3){good=false;break;}contours.push(nodes);
    }
    if(!good||!validGlyph(contours)){skipped++;continue;}
    design.glyphs[ch]=contours;
    const adv=/<advance\b[^>]*\bwidth="([0-9]{1,4})"/.exec(body);if(adv){const width=Number(adv[1]);if(width>=320&&width<=1200)design.advances[ch]=width;}
  }
  if(!Object.keys(design.glyphs).length||!validDesign(design))throw new Error('The UFO archive contains no supported simple glyph outlines.');
  return {design,imported:Object.keys(design.glyphs).length,skipped,notice:'UFO import reads simple cubic outlines and advances; complex components and OpenType feature files are not imported.'};
}
module.exports={toUFO,fromUFO,zipEntries};
