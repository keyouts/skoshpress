'use strict';
const {readTables,glyphs}=require('./ttf-binary');
const {validDesign}=require('./font-design');
const {ALL_CHARS}=require('./pixel-font');
const {valid:validGlyph}=require('./vector-font');
const {randomUUID}=require('node:crypto');
const LIMIT=6*1024*1024;
function fromNative(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length>LIMIT)throw new Error('Editable font file exceeds 6 MB.');
  const data=JSON.parse(bytes.toString('utf8'));
  if(!data||data.format!=='SkoshFont' ||data.version!==1||!validDesign(data.design)||data.design.kind!=='vector')throw new Error('Invalid Skosh Font interchange file.');
  return structuredClone(data.design);
}
function toNative(design){
  if(!validDesign(design)||design.kind!=='vector')throw new Error('Invalid editable font design.');
  const raw=Buffer.from(JSON.stringify({format:'SkoshFont',version:1,design}), 'utf8');
  if(raw.length>LIMIT)throw new Error('Font interchange exceeds 6 MB.');
  return raw;
}
function cmapFormat4(bytes,at,ch){
  if(at<0||at+16>bytes.length)return null;
  const len=bytes.readUInt16BE(at+2),end=at+len,segCount=bytes.readUInt16BE(at+6)/2;
  if(len<16||end>bytes.length||segCount>10000)return null;
  const ends=at+14,starts=ends+segCount*2+2,deltas=starts+segCount*2,ranges=deltas+segCount*2;
  if(ranges+2*segCount>end)return null;
  for(let i=0;i<segCount;i++){
    if(ch>bytes.readUInt16BE(ends+i*2))continue;
    if(ch<bytes.readUInt16BE(starts+i*2))return 0;
    const delta=bytes.readInt16BE(deltas+i*2),offset=bytes.readUInt16BE(ranges+i*2);
    if(!offset)return (ch+delta)&0xffff;
    const atGlyph=ranges+2*i+offset+2*(ch-bytes.readUInt16BE(starts+i*2));
    if(atGlyph+2>end)return 0;
    const gid=bytes.readUInt16BE(atGlyph);
    return gid?(gid+delta)&0xffff:0;
  }
  return 0;
}
function bestCmap(tables){
  const cmap=tables.get('cmap');if(!cmap||cmap.length<4)throw new Error('Font has no character map.');
  let best=null;
  const records=cmap.readUInt16BE(2);if(records>256||4+8*records>cmap.length)throw new Error('Invalid font character map.');
  for(let i=0;i<records;i++){
    const r=4+i*8,platform=cmap.readUInt16BE(r),encoding=cmap.readUInt16BE(r+2),offset=cmap.readUInt32BE(r+4);
    if(offset+4>cmap.length)continue;
    const format=cmap.readUInt16BE(offset),priority=platform===3&&(encoding===1||encoding===10)?2:platform===0?1:0;
    if(format===4&&(!best||priority>best.priority))best={format,offset,priority};
    if(format===12&&offset+16<=cmap.length&&(!best||best.format!==12))best={format,offset,priority:3};
  }
  if(!best)throw new Error('This font does not contain a supported Unicode cmap.');
  return ch=>{
    if(best.format===4)return cmapFormat4(cmap,best.offset,ch);
    const count=cmap.readUInt32BE(best.offset+12),end=best.offset+cmap.readUInt32BE(best.offset+4);
    if(count>100000||best.offset+16+count*12>end||end>cmap.length)return 0;
    for(let i=0;i<count;i++){
      const p=best.offset+16+i*12,a=cmap.readUInt32BE(p),b=cmap.readUInt32BE(p+4);
      if(ch>=a&&ch<=b)return cmap.readUInt32BE(p+8)+(ch-a);
    }
    return 0;
  };
}
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
function cubicFromQuadratic(glyph,scale=1){
  const contours=[];let start=0;
  for(const end of glyph.ends){
    let raw=glyph.points.slice(start,end+1);start=end+1;
    if(raw.length<2)continue;
    const onIndex=raw.findIndex(p=>p.on);
    let first;
    if(onIndex>=0){raw=raw.slice(onIndex).concat(raw.slice(0,onIndex));first=raw[0];raw=raw.slice(1);}
    else first={...mid(raw.at(-1),raw[0]),on:true};
    const seq=[...raw,first],ring=[{...first}];
    let current=first,i=0;
    while(i<seq.length){
      const point=seq[i],following=seq[i+1];let target,control=null;
      if(point.on){target=point;i++;}
      else if(following?.on){target=following;control=point;i+=2;}
      else if(following){target=mid(point,following);control=point;i++;}
      else break;
      const old=ring.at(-1);
      const out=control?{x:current.x+(control.x-current.x)*2/3,y:current.y+(control.y-current.y)*2/3}:current;
      const incoming=control?{x:target.x+(control.x-target.x)*2/3,y:target.y+(control.y-target.y)*2/3}:target;
      old.out=out;
      if(target===first)ring[0].incoming=incoming;
      else ring.push({...target,incoming});
      current=target;
    }
    if(ring.length<3)continue;
    contours.push(ring.map(p=>[p.x*scale,800-p.y*scale,(p.incoming?.x??p.x)*scale,800-(p.incoming?.y??p.y)*scale,(p.out?.x??p.x)*scale,800-(p.out?.y??p.y)*scale].map(v=>Math.round(v*10)/10)));
  }
  return contours;
}
function fromTTF(bytes,name='Imported Type'){ 
  const tables=readTables(bytes),lookup=bestCmap(tables);
  const wanted=new Set(ALL_CHARS.map(ch=>lookup(ch.charCodeAt(0))).filter(gid=>gid>0));
  const outlines=glyphs(tables,{skipComposite:true,wantedIds:wanted});
  const upm=tables.get('head').readUInt16BE(18);if(upm<16||upm>16384)throw new Error('Unsupported font units per em.');
  const scale=1000/upm;
  const design={id:'font-'+randomUUID().slice(0,32),name:String(name).slice(0,64)||'Imported Type',kind:'vector',glyphs:{},spacing:0,advances:{},kerning:{},variants:{},components:{},componentLinks:{}};
  const skipped=[];let imported=0;
  for(const char of ALL_CHARS){
    const gid=lookup(char.charCodeAt(0));if(!gid||gid>=outlines.length)continue;
    const source=outlines[gid];
    if(source.composite){skipped.push(char);continue;}
    const vectors=cubicFromQuadratic(source,scale);
    if(!validGlyph(vectors)){skipped.push(char);continue;}
    design.glyphs[char]=vectors;
    const scaledAdvance=Math.round(source.advance*scale);
    if(scaledAdvance>=320&&scaledAdvance<=1200)design.advances[char]=scaledAdvance;
    imported++;
  }
  if(!imported)throw new Error('No compatible editable glyphs found. Composite glyphs, complex outlines, and unsupported formats require a dedicated font editor.');
  if(!validDesign(design))throw new Error('Imported outlines failed font-design validation.');
  return {design,imported,skipped:skipped.length,notice:skipped.length?`${skipped.length} complex/composite glyphs were skipped.`:''};
}
module.exports={fromTTF,fromNative,toNative,cubicFromQuadratic,bestCmap};
