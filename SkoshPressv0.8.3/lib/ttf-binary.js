'use strict';
const {verifyFontBinary}=require('./fonts');
function readTables(value){
  const bytes=Buffer.from(value);
  if(bytes.length>5*1024*1024||bytes.length<12||bytes.readUInt32BE(0)!==0x00010000||!verifyFontBinary(bytes,'font/ttf'))throw new Error('A structurally valid TrueType font is required.');
  const tables=new Map();
  for(let i=0,n=bytes.readUInt16BE(4);i<n;i++){
    const p=12+i*16,tag=bytes.toString('ascii',p,p+4),offset=bytes.readUInt32BE(p+8),length=bytes.readUInt32BE(p+12);
    tables.set(tag,Buffer.from(bytes.subarray(offset,offset+length)));
  }
  return tables;
}
function sum(b){let result=0;for(let i=0;i<b.length;i+=4)result=(result+((b[i]||0)*0x1000000+((b[i+1]||0)<<16)+((b[i+2]||0)<<8)+(b[i+3]||0)))>>>0;return result;}
function pack(tables){
  const entries=[...tables].sort(([a],[b])=>a.localeCompare(b,'en',{sensitivity:'variant'}));
  if(entries.length>256||entries.some(([tag,bytes])=>!/^[-\x20-\x7e]{4}$/.test(tag)||!Buffer.isBuffer(bytes)||bytes.length>5*1024*1024))throw new Error('Invalid sfnt tables.');
  const n=entries.length,power=2**Math.floor(Math.log2(n));
  let pos=12+16*n,headOffset=-1;
  const output=Buffer.alloc(pos+entries.reduce((s,[,v])=>s+Math.ceil(v.length/4)*4,0));
  output.writeUInt32BE(0x00010000);output.writeUInt16BE(n,4);output.writeUInt16BE(power*16,6);output.writeUInt16BE(Math.log2(power),8);output.writeUInt16BE(16*n-16*power,10);
  entries.forEach(([tag,data],i)=>{
    const r=12+i*16;output.write(tag,r,4,'ascii');output.writeUInt32BE(sum(data),r+4);output.writeUInt32BE(pos,r+8);output.writeUInt32BE(data.length,r+12);
    data.copy(output,pos);if(tag==='head')headOffset=pos;pos+=Math.ceil(data.length/4)*4;
  });
  if(headOffset<0)throw new Error('Font is missing head.');
  output.writeUInt32BE(0,headOffset+8);
  output.writeUInt32BE((0xB1B0AFBA-sum(output))>>>0,headOffset+8);
  return output;
}
function glyphs(tables,options={}){
  const head=tables.get('head'),maxp=tables.get('maxp'),loca=tables.get('loca'),glyf=tables.get('glyf'),hhea=tables.get('hhea'),hmtx=tables.get('hmtx');
  if(!head||!maxp||!loca||!glyf||!hhea||!hmtx||head.length<54||maxp.length<6||hhea.length<36)throw new Error('A TrueType font with glyf outlines is required.');
  const count=maxp.readUInt16BE(4),long=head.readInt16BE(50)===1,metricCount=hhea.readUInt16BE(34);
  if(count<1||count>(options.wantedIds?60000:4000)||metricCount<1||metricCount>count||loca.length<(count+1)*(long?4:2)||hmtx.length<metricCount*4+(count-metricCount)*2)throw new Error('Invalid glyph directory.');
  const offsets=Array.from({length:count+1},(_,i)=>long?loca.readUInt32BE(i*4):loca.readUInt16BE(i*2)*2);
  for(let i=0;i<count;i++)if(offsets[i]>offsets[i+1]||offsets[i+1]>glyf.length)throw new Error('Invalid glyph offsets.');
  const all=[];
  for(let id=0;id<count;id++){
    const start=offsets[id],end=offsets[id+1];
    if(options.wantedIds&&!options.wantedIds.has(id)){all.push(null);continue;}
    const adv=hmtx.readUInt16BE(Math.min(id,metricCount-1)*4);
    const lsb=id<metricCount?hmtx.readInt16BE(id*4+2):hmtx.readInt16BE(metricCount*4+(id-metricCount)*2);
    if(end===start){all.push({points:[],ends:[],advance:adv,lsb,xMin:0});continue;}
    if(end-start<10)throw new Error('Truncated glyph.');
    const contours=glyf.readInt16BE(start),xMin=glyf.readInt16BE(start+2);
    if(contours<0){if(options.skipComposite){all.push({points:[],ends:[],advance:adv,lsb,xMin,composite:true});continue;}throw new Error('Composite glyphs cannot yet be interpolated.');}
    if(contours>64)throw new Error('Too many contours.');
    const ends=[],base=start+10;
    if(base+contours*2+2>end)throw new Error('Invalid glyph contour offsets.');
    for(let i=0;i<contours;i++)ends.push(glyf.readUInt16BE(base+i*2));
    const n=contours?ends[contours-1]+1:0;
    if(n>6000||ends.some((v,i)=>i>0&&v<=ends[i-1]))throw new Error('Invalid glyph points.');
    let pos=base+contours*2,inst=glyf.readUInt16BE(pos);pos+=2+inst;
    if(pos>end)throw new Error('Invalid glyph instructions.');
    const flags=[];
    while(flags.length<n){if(pos>=end)throw new Error('Truncated glyph flags.');const f=glyf[pos++];flags.push(f);
      if(f&8){if(pos>=end)throw new Error('Truncated repeat run.');const repeat=glyf[pos++];if(flags.length+repeat>n)throw new Error('Excessive glyph flag run.');for(let i=0;i<repeat;i++)flags.push(f);}
    }
    const xs=[],ys=[];let v=0;
    for(const f of flags){let d=0;if(f&2){if(pos>=end)throw new Error('Truncated glyph x delta.');d=glyf[pos++]*((f&16)?1:-1);}else if(!(f&16)){if(pos+2>end)throw new Error('Truncated glyph x delta.');d=glyf.readInt16BE(pos);pos+=2;}v+=d;xs.push(v);}
    v=0;
    for(const f of flags){let d=0;if(f&4){if(pos>=end)throw new Error('Truncated glyph y delta.');d=glyf[pos++]*((f&32)?1:-1);}else if(!(f&32)){if(pos+2>end)throw new Error('Truncated glyph y delta.');d=glyf.readInt16BE(pos);pos+=2;}v+=d;ys.push(v);}
    all.push({ends,points:xs.map((x,i)=>({x,y:ys[i],on:!!(flags[i]&1)})),advance:adv,lsb,xMin});
  }
  return all;
}
module.exports={readTables,pack,glyphs};
