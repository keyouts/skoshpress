'use strict';
// Font Generation
// Outline Encoding
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshPixelFont=api;
})(typeof window!=='undefined'?window:null,()=>{
  const COLS=8,ROWS=12,CHARS=Array.from({length:95},(_,i)=>String.fromCharCode(i+32));
// Unicode Repertoire
// Mapping Policy
  const range=(start,end)=>Array.from({length:end-start+1},(_,i)=>String.fromCharCode(start+i)).filter(ch=>/[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}]/u.test(ch));
  const REPERTOIRE=Object.freeze([
    ['Basic Latin',CHARS],['Latin-1 Supplement',Array.from({length:96},(_,i)=>String.fromCharCode(i+160))],
    ['Latin Extended-A',range(0x100,0x17f)],['Latin Extended-B',range(0x180,0x24f)],
    ['Latin Extended Additional',range(0x1e00,0x1eff)],['Combining diacritics',range(0x300,0x36f)],
    ['Greek and Coptic',range(0x370,0x3ff)],['Greek Extended',range(0x1f00,0x1fff)],['Cyrillic',range(0x400,0x52f)],
    ['Editorial symbols',[...new Set([...range(0x2000,0x206f),...range(0x20a0,0x20cf),...range(0x2100,0x214f),...range(0x2190,0x21ff),...range(0x2200,0x22ff)])]],
  ].map(([name,chars])=>Object.freeze([name,Object.freeze(chars)])));
  const EXTENDED_CHARS=Object.freeze(REPERTOIRE.slice(1).flatMap(group=>group[1]));
  const ALL_CHARS=Object.freeze([...CHARS,...EXTENDED_CHARS]);
  const CHAR_SET=new Set(ALL_CHARS);
  const isSupportedChar=ch=>typeof ch==='string'&&ch.length===1&&CHAR_SET.has(ch);
  const isGlyph=rows=>Array.isArray(rows)&&rows.length===ROWS&&rows.every(r=>typeof r==='string'&&/^[01]{8}$/.test(r));
  const blank=()=>Array(ROWS).fill('0'.repeat(COLS));
  const u16=(b,v)=>{b.push((v>>>8)&255,v&255);};
  const i16=(b,v)=>u16(b,v&65535);
  const u32=(b,v)=>{b.push((v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255);};
  const pad=b=>{while(b.length%4)b.push(0);return b;};
  const utf16be=text=>{const out=[];for(let i=0;i<text.slice(0,64).length;i++)u16(out,text.charCodeAt(i));return out;};
  function glyphData(rows){
    const contours=[];
    for(let row=0;row<ROWS;row++){
      for(let col=0;col<COLS;){
        if(rows[row][col]!=='1'){col++;continue;}
        const start=col;while(col<COLS&&rows[row][col]==='1')col++;
        const x1=40+start*80,x2=40+col*80,y2=800-row*80,y1=y2-80;
        contours.push([[x1,y1],[x1,y2],[x2,y2],[x2,y1]]);
      }
    }
    if(!contours.length)return {bytes:[0,0,0,0,0,0,0,0,0,0,0,0],contours:0,points:0};
    const points=contours.flat();
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const result=[];
    i16(result,contours.length);
    i16(result,Math.min(...xs));i16(result,Math.min(...ys));i16(result,Math.max(...xs));i16(result,Math.max(...ys));
    contours.forEach((_,i)=>u16(result,(i+1)*4-1));
    u16(result,0);
    for(const p of points)result.push(1);
    let x=0,y=0;
    for(const p of points){i16(result,p[0]-x);x=p[0];}
    for(const p of points){i16(result,p[1]-y);y=p[1];}
    pad(result);
    return {bytes:result,contours:contours.length,points:points.length};
  }
  function nameTable(name,style='Regular'){
    const clean=String(name||'Skosh Pixel').replace(/[^\p{L}\p{N} ._-]/gu,'').trim().slice(0,56)||'Skosh Pixel';
    const entries=[[1,clean],[2,style],[3,clean+' '+style],[4,clean+' '+style],[6,(clean.replace(/[^A-Za-z0-9]/g,'')||'SkoshVector')+'-'+style]];
    const records=[],strings=[];let offset=0;
    for(const [id,str] of entries){const bytes=utf16be(str);records.push([3,1,0x409,id,bytes.length,offset]);strings.push(...bytes);offset+=bytes.length;}
    const out=[];u16(out,0);u16(out,entries.length);u16(out,6+12*entries.length);
    for(const rec of records)for(const n of rec)u16(out,n);
    return [...out,...strings];
  }
  function cmapTable(chars=CHARS){
// Unicode Repertoire
    const ranges=[];let first=-1,last=-1,delta=0;
    chars.forEach((ch,i)=>{
      const cp=ch.charCodeAt(0),d=((i+1)-cp)&65535;
      if(cp===last+1&&d===delta){last=cp;return;}
      if(first>=0)ranges.push({first,last,delta});
      first=last=cp;delta=d;
    });
    if(first>=0)ranges.push({first,last,delta});
    const count=ranges.length+1,power=2**Math.floor(Math.log2(count));
    const sub=[];u16(sub,4);u16(sub,16+count*8);u16(sub,0);
    u16(sub,count*2);u16(sub,power*2);u16(sub,Math.log2(power));u16(sub,count*2-power*2);
    for(const range of ranges)u16(sub,range.last);u16(sub,0xffff);
    u16(sub,0);
    for(const range of ranges)u16(sub,range.first);u16(sub,0xffff);
    for(const range of ranges)u16(sub,range.delta);u16(sub,1);
    for(let i=0;i<count;i++)u16(sub,0);
    const out=[];u16(out,0);u16(out,2);
    u16(out,0);u16(out,3);u32(out,20);
    u16(out,3);u16(out,1);u32(out,20);
    return [...out,...sub];
  }
  function os2Table(style='Regular',chars=CHARS){
    const out=[];u16(out,0);i16(out,680);u16(out,style==='Bold'?700:style==='Light'?300:400);u16(out,5);u16(out,0);
    for(let i=0;i<8;i++)i16(out,0);
    i16(out,0);i16(out,0);i16(out,0);
    for(let i=0;i<10;i++)out.push(0);
    for(let i=0;i<4;i++)u32(out,0);
    out.push(83,75,83,72);u16(out,style==='Italic'?0x01:style==='Bold'?0x20:0x40);u16(out,Math.min(...chars.map(ch=>ch.charCodeAt(0))));u16(out,Math.max(...chars.map(ch=>ch.charCodeAt(0))));
    i16(out,800);i16(out,-200);i16(out,200);u16(out,800);u16(out,200);
    if(out.length!==78)throw new Error('Invalid OS/2 table length: '+out.length);
    return out;
  }
  function checksum(bytes){const array=pad([...bytes]);let sum=0;for(let i=0;i<array.length;i+=4)sum=(sum+((array[i]*0x1000000)+(array[i+1]<<16)+(array[i+2]<<8)+array[i+3]))>>>0;return sum;}
  // Vector Encoding
  // Quadratic Encoding
  function outlineGlyphData(contours){
    if(!Array.isArray(contours)||contours.length>32)throw new Error('Invalid vector glyph contours.');
    const valid=contours.filter(c=>Array.isArray(c)&&c.length>=3);
    const points=valid.flat();
    if(points.length>5000)throw new Error('Vector glyph has too many points.');
    if(!points.length)return glyphData(blank());
    const xs=points.map(p=>Math.round(p.x)),ys=points.map(p=>Math.round(p.y));
    if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||typeof p.on!=='boolean'||Math.abs(p.x)>3000||Math.abs(p.y)>3000))throw new Error('Invalid vector outline point.');
    const result=[];i16(result,valid.length);
    i16(result,Math.min(...xs));i16(result,Math.min(...ys));i16(result,Math.max(...xs));i16(result,Math.max(...ys));
    let pointCount=0;for(const c of valid){pointCount+=c.length;u16(result,pointCount-1);}
    u16(result,0);for(const point of points)result.push(point.on?1:0);
    let x=0,y=0;
    for(const point of points){const next=Math.round(point.x);i16(result,next-x);x=next;}
    for(const point of points){const next=Math.round(point.y);i16(result,next-y);y=next;}
    pad(result);
    return {bytes:result,contours:valid.length,points:points.length};
  }
  function buildOutlineTTF(glyphs={},family='Skosh Vector',metrics={}){
    if(!glyphs||typeof glyphs!=='object'||Array.isArray(glyphs))throw new Error('Invalid glyph outlines.');
    const chars=[...CHARS,...Object.keys(glyphs).filter(ch=>isSupportedChar(ch)&&!CHARS.includes(ch)).sort((a,b)=>a.charCodeAt(0)-b.charCodeAt(0))];
    return packTTF(chars.map(char=>outlineGlyphData(glyphs[char]||[])),family,metrics,chars);
  }
  function buildTTF(glyphs={},family='Skosh Pixel'){
    if(!glyphs||typeof glyphs!=='object'||Array.isArray(glyphs))throw new Error('Invalid glyph design.');
    const outlines=CHARS.map(char=>glyphData(isGlyph(glyphs[char])?glyphs[char]:blank()));
    return packTTF(outlines,family);
  }
  function kernTable(pairs,glyphIds){
    const entries=[];
    for(const [pair,value] of Object.entries(pairs||{})){
      if([...pair].length!==2||![...pair].every(isSupportedChar)||!Number.isInteger(value)||value<-400||value>400)throw new Error('Invalid kerning pair.');
      if(value===0||!glyphIds.has(pair[0])||!glyphIds.has(pair[1]))continue;
      entries.push([glyphIds.get(pair[0]),glyphIds.get(pair[1]),value]);
    }
    if(entries.length>2500)throw new Error('Too many expanded kerning pairs.');
    if(!entries.length)return null;
    entries.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const n=entries.length,power=2**Math.floor(Math.log2(n)),out=[];
    u16(out,0);u16(out,1);
    u16(out,0);u16(out,14+6*n);u16(out,1);
    u16(out,n);u16(out,power*6);u16(out,Math.log2(power));u16(out,n*6-power*6);
    for(const [left,right,value] of entries){u16(out,left);u16(out,right);i16(out,value);}
    return out;
  }
  function gposKerning(pairs,glyphIds){
    const grouped=new Map();
    for(const [pair,value] of Object.entries(pairs||{})){
      const letters=[...pair];if(letters.length!==2||!letters.every(isSupportedChar)||!Number.isInteger(value)||value<-400||value>400)throw new Error('Invalid GPOS pair.');
      const a=glyphIds.get(letters[0]),b=glyphIds.get(letters[1]);if(!a||!b||value===0)continue;
      if(!grouped.has(a))grouped.set(a,[]);grouped.get(a).push([b,value]);
    }
    if(!grouped.size)return null;
    const keys=[...grouped.keys()].sort((a,b)=>a-b);
    const head=[];u16(head,1);u16(head,0);u16(head,4);u16(head,0);u16(head,keys.length);
    let offset=10+2*keys.length;const sets=[];
    for(const key of keys){
      const rows=grouped.get(key).sort((a,b)=>a[0]-b[0]),set=[];
      u16(head,offset);u16(set,rows.length);
      for(const [gid,val] of rows){u16(set,gid);i16(set,val);}
      offset+=set.length;sets.push(set);
    }
    const coverage=[];u16(coverage,1);u16(coverage,keys.length);for(const gid of keys)u16(coverage,gid);
    head[2]=(offset>>>8)&255;head[3]=offset&255;
    const sub=[...head,...sets.flat(),...coverage];
    if(sub.length>65535)throw new Error('GPOS lookup exceeds OpenType offset limits.');
    const lookup=[0,2,0,0,0,1,0,8,...sub];
    const lookups=[0,1,0,4,...lookup];
    const features=[0,1,107,101,114,110,0,8,0,0,0,1,0,0];
    const lang=[0,0,0xff,0xff,0,1,0,0],script=[0,4,0,0,...lang];
    const scripts=[],tags=['DFLT','cyrl','grek','latn'];u16(scripts,tags.length);
    for(const [index,tag] of tags.entries()){
      for(const char of tag)scripts.push(char.charCodeAt(0));u16(scripts,2+tags.length*6+index*script.length);
    }
    for(const tag of tags)scripts.push(...script);
    const out=[];u16(out,1);u16(out,0);u16(out,10);u16(out,10+scripts.length);u16(out,10+scripts.length+features.length);
    out.push(...scripts,...features,...lookups);
    return out;
  }
  // OpenType Substitutions
  
  function substitutionTable(ligatures,alternates){
    const lookups=[];
    const features=[];
    const coverage=glyphIds=>{const b=[];u16(b,1);u16(b,glyphIds.length);for(const id of glyphIds)u16(b,id);return b;};
    function lookup(type,subtable){const b=[];u16(b,type);u16(b,0);u16(b,1);u16(b,8);return [...b,...subtable];}
    function ligatureSubtable(records){
      const grouped=new Map();
      for(const rec of records){const start=rec.components[0];if(!grouped.has(start))grouped.set(start,[]);grouped.get(start).push(rec);}
      const keys=[...grouped.keys()].sort((a,b)=>a-b);
      const sets=keys.map(key=>{
        const entries=grouped.get(key).sort((a,b)=>b.components.length-a.components.length||a.target-b.target);
        const b=[];u16(b,entries.length);
        let offset=2+2*entries.length;
        for(const e of entries){u16(b,offset);offset+=4+2*(e.components.length-1);}
        for(const e of entries){u16(b,e.target);u16(b,e.components.length);for(const c of e.components.slice(1))u16(b,c);}
        return b;
      });
      const header=[];u16(header,1);let offset=6+keys.length*2+sets.reduce((n,set)=>n+set.length,0);
      u16(header,offset);u16(header,keys.length);
      let setOffset=6+2*keys.length;for(const set of sets){u16(header,setOffset);setOffset+=set.length;}
      return [...header,...sets.flat(),...coverage(keys)];
    }
    function alternateSubtable(records){
      const pairs=[...records].sort((a,b)=>a.base-b.base),sets=pairs.map(rec=>{
        const b=[];u16(b,rec.targets.length);for(const id of rec.targets)u16(b,id);return b;
      });
      const header=[];u16(header,1);
      const end=6+2*pairs.length+sets.reduce((n,b)=>n+b.length,0);
      u16(header,end);u16(header,pairs.length);
      let offset=6+2*pairs.length;for(const set of sets){u16(header,offset);offset+=set.length;}
      return [...header,...sets.flat(),...coverage(pairs.map(rec=>rec.base))];
    }
    function singleSubtable(records){
      const pairs=[...records].sort((a,b)=>a.base-b.base),b=[];
      u16(b,2);u16(b,6+2*pairs.length);u16(b,pairs.length);
      for(const p of pairs)u16(b,p.target);
      return [...b,...coverage(pairs.map(p=>p.base))];
    }
    if(ligatures.length){features.push({tag:'liga',index:lookups.length});lookups.push(lookup(4,ligatureSubtable(ligatures)));}
    if(alternates.length){
      features.push({tag:'salt',index:lookups.length});lookups.push(lookup(3,alternateSubtable(alternates)));
      const max=Math.max(...alternates.map(a=>a.targets.length));
      for(let n=0;n<max;n++){
        const entries=alternates.filter(a=>a.targets[n]!=null).map(a=>({base:a.base,target:a.targets[n]}));
        features.push({tag:`ss0${n+1}`,index:lookups.length});lookups.push(lookup(1,singleSubtable(entries)));
      }
    }
    if(!features.length)return null;
    features.sort((a,b)=>a.tag.localeCompare(b.tag));
    const featureList=[];u16(featureList,features.length);
    let featureOffset=2+6*features.length;
    for(const feature of features){for(const char of feature.tag)featureList.push(char.charCodeAt(0));u16(featureList,featureOffset);featureOffset+=6;}
    for(const feature of features){u16(featureList,0);u16(featureList,1);u16(featureList,feature.index);}
    const lookupList=[];u16(lookupList,lookups.length);
    let lookupOffset=2+2*lookups.length;
    for(const one of lookups){u16(lookupList,lookupOffset);lookupOffset+=one.length;}
    for(const one of lookups)lookupList.push(...one);
    const lang=[];u16(lang,0);u16(lang,0xffff);u16(lang,features.length);
    for(let i=0;i<features.length;i++)u16(lang,i);
    const script=[0,4,0,0,...lang];
    const scriptList=[];u16(scriptList,2);
    for(const [tag,offset] of [['DFLT',14],['latn',14+script.length]]){
      for(const char of tag)scriptList.push(char.charCodeAt(0));u16(scriptList,offset);
    }
    scriptList.push(...script,...script);
    const out=[];u16(out,1);u16(out,0);u16(out,10);u16(out,10+scriptList.length);u16(out,10+scriptList.length+featureList.length);
    return [...out,...scriptList,...featureList,...lookupList];
  }
  function packTTF(outlines,family,metrics={},chars=CHARS){
    if(!metrics||typeof metrics!=='object'||Array.isArray(metrics))throw new Error('Invalid font metrics.');
    const style=metrics.style??'Regular';
    if(!['Regular','Light','Bold','Italic'].includes(style))throw new Error('Invalid font face style.');
    const spacing=metrics.spacing??0;
    if(!Number.isInteger(spacing)||spacing<-250||spacing>350)throw new Error('Invalid global letter spacing.');
    const advances=metrics.advances||{};
    if(!advances||typeof advances!=='object'||Array.isArray(advances)||Object.keys(advances).length>ALL_CHARS.length)throw new Error('Invalid advance widths.');
    for(const [ch,width] of Object.entries(advances))if(!isSupportedChar(ch)||!Number.isInteger(width)||width<320||width>1200)throw new Error('Invalid glyph advance width.');
    const glyphIds=new Map(chars.map((ch,i)=>[ch,i+1]));
    const widths=chars.map(ch=>Math.max(200,Math.min(1550,(advances[ch]??780)+spacing)));
    const ligatureRecords=[],alternateRecords=[],extras=[];
    
    for(const [sequence,record] of Object.entries(metrics.ligatures||{}).sort(([a],[b])=>a.localeCompare(b))){
      if(!/^[!-~]{2,3}$/.test(sequence)||!record||!Array.isArray(record.glyph)||!Number.isInteger(record.advance)||record.advance<320||record.advance>2400)throw new Error('Invalid ligature design.');
      const target=chars.length+1+extras.length;
      extras.push(outlineGlyphData(record.glyph));widths.push(record.advance);
      ligatureRecords.push({components:[...sequence].map(ch=>glyphIds.get(ch)),target});
    }
    for(const [base,versions] of Object.entries(metrics.alternates||{}).sort(([a],[b])=>a.localeCompare(b))){
      if(!/^[!-~]$/.test(base)||!Array.isArray(versions)||versions.length<1||versions.length>3)throw new Error('Invalid alternate design.');
      const targets=[];
      for(const glyph of versions){targets.push(chars.length+1+extras.length);extras.push(outlineGlyphData(glyph));widths.push(Math.max(200,Math.min(1550,(advances[base]??780)+spacing)));}
      alternateRecords.push({base:glyphIds.get(base),targets});
    }
    if(extras.length>64)throw new Error('Too many additional glyphs.');
    outlines=[...outlines,...extras];
    const glyf=[],offsets=[0];let maxContours=0,maxPoints=0;
    const missing=glyphData(blank());
    for(const info of [missing,...outlines]){
      glyf.push(...info.bytes);pad(glyf);offsets.push(glyf.length);
      maxContours=Math.max(maxContours,info.contours);maxPoints=Math.max(maxPoints,info.points);
    }
    const loca=[];offsets.forEach(n=>u32(loca,n));
    const hmtx=[];u16(hmtx,780);i16(hmtx,0);
    for(let i=0;i<outlines.length;i++){
      const points=outlines[i].bytes;
      // Glyph Bearings
      const lsb=outlines[i].points?((points[2]<<8)|points[3])<<16>>16:0;
      u16(hmtx,widths[i]);i16(hmtx,lsb);
    }
    const bounds=outlines.filter(o=>o.points).map(o=>({
      x0:((o.bytes[2]<<8)|o.bytes[3])<<16>>16,y0:((o.bytes[4]<<8)|o.bytes[5])<<16>>16,
      x1:((o.bytes[6]<<8)|o.bytes[7])<<16>>16,y1:((o.bytes[8]<<8)|o.bytes[9])<<16>>16
    }));
    const xMin=bounds.length?Math.min(...bounds.map(b=>b.x0)):0;
    const yMin=bounds.length?Math.min(...bounds.map(b=>b.y0)):-200;
    const xMax=bounds.length?Math.max(...bounds.map(b=>b.x1)):800;
    const yMax=bounds.length?Math.max(...bounds.map(b=>b.y1)):800;
    const head=[];u32(head,0x00010000);u32(head,0x00010000);u32(head,0);u32(head,0x5f0f3cf5);u16(head,3);u16(head,1000);
    for(let i=0;i<4;i++)u32(head,0);
    i16(head,xMin);i16(head,yMin);i16(head,xMax);i16(head,yMax);u16(head,style==='Bold'?1:style==='Italic'?2:0);u16(head,8);i16(head,2);i16(head,1);i16(head,0);
    const hhea=[];u32(hhea,0x00010000);i16(hhea,800);i16(hhea,-200);i16(hhea,200);
    u16(hhea,Math.max(780,...widths));
    i16(hhea,Math.min(0,xMin));
    i16(hhea,Math.min(0,...outlines.map((outline,i)=>{
      if(!outline.points)return widths[i];
      const xMax=((outline.bytes[6]<<8)|outline.bytes[7])<<16>>16;
      return widths[i]-xMax;
    })));
    i16(hhea,Math.max(800,xMax));i16(hhea,1);i16(hhea,0);i16(hhea,0);
    for(let i=0;i<4;i++)i16(hhea,0);i16(hhea,0);u16(hhea,outlines.length+1);
    const maxp=[];u32(maxp,0x00010000);u16(maxp,outlines.length+1);u16(maxp,maxPoints);u16(maxp,maxContours);
    for(const n of [0,0,2,0,0,0,0,0,0,0,0])u16(maxp,n);
    const post=[];u32(post,0x00030000);u32(post,style==='Italic'?(-12*65536)>>>0:0);i16(post,-100);i16(post,50);for(let i=0;i<5;i++)u32(post,0);
    const tables={cmap:cmapTable(chars),glyf,head,hhea,hmtx,loca,maxp,name:nameTable(family,style),'OS/2':os2Table(style,chars),post};
    const kern=kernTable(metrics.kerning||{},glyphIds);if(kern)tables.kern=kern;
    const gpos=gposKerning(metrics.kerning||{},glyphIds);if(gpos)tables.GPOS=gpos;
    const gsub=substitutionTable(ligatureRecords,alternateRecords);if(gsub)tables.GSUB=gsub;
    const tags=Object.keys(tables).sort(),numTables=tags.length,power=Math.floor(Math.log2(numTables));
    const font=[];u32(font,0x00010000);u16(font,numTables);u16(font,16*(2**power));u16(font,power);u16(font,numTables*16-16*(2**power));
    let start=12+numTables*16,headOffset=0;
    for(const tag of tags){const bytes=tables[tag];for(let i=0;i<4;i++)font.push(tag.charCodeAt(i));u32(font,checksum(bytes));u32(font,start);u32(font,bytes.length);if(tag==='head')headOffset=start;start+=Math.ceil(bytes.length/4)*4;}
    for(const tag of tags){
      const bytes=pad([...tables[tag]]);
      for(let offset=0;offset<bytes.length;offset+=8192)font.push(...bytes.slice(offset,offset+8192));
    }
    const sum=checksum(font);const adjustment=(0xb1b0afba-sum)>>>0;
    font[headOffset+8]=(adjustment>>>24)&255;font[headOffset+9]=(adjustment>>>16)&255;font[headOffset+10]=(adjustment>>>8)&255;font[headOffset+11]=adjustment&255;
    return Uint8Array.from(font);
  }
  return Object.freeze({COLS,ROWS,CHARS,EXTENDED_CHARS,ALL_CHARS,REPERTOIRE,isSupportedChar,isGlyph,blank,buildTTF,buildOutlineTTF});
});
