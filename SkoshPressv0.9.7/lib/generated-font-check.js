'use strict';
(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SkoshGeneratedFontCheck=api;
})(typeof window!=='undefined'?window:null,()=>{
  function check(bytes,expected=[]){
    if(!(bytes instanceof Uint8Array)||bytes.length<100||bytes.length>5*1024*1024)throw new Error('Generated font exceeds the size limit or is truncated.');
    const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=p=>d.getUint16(p),u32=p=>d.getUint32(p);
    const fail=message=>{throw new Error('Generated font: '+message);};
    const sum=(start,length,zero=-1)=>{let n=0;for(let i=0;i<length;i+=4){let word=0;for(let j=0;j<4;j++){const p=start+i+j;word=(word<<8)|((i+j<length&&(zero<0||p<zero||p>=zero+4))?bytes[p]:0);}n=(n+word)>>>0;}return n;};
    const count=u16(4),end=12+16*count,tables=new Map(),ranges=[];
    if(u32(0)!==0x10000||count<9||count>256||end>bytes.length)fail('invalid table directory.');
    for(let i=0;i<count;i++){
      const p=12+i*16,tag=String.fromCharCode(...bytes.subarray(p,p+4)),offset=u32(p+8),length=u32(p+12);
      if(tables.has(tag)||offset%4||offset<end||offset+length>bytes.length)fail('invalid table range.');
      if(sum(offset,length,tag==='head'?offset+8:-1)!==u32(p+4))fail('table checksum mismatch: '+tag+'.');
      tables.set(tag,{offset,length});if(length)ranges.push([offset,offset+length]);
    }
    ranges.sort((a,b)=>a[0]-b[0]);if(ranges.some((r,i)=>i&&r[0]<ranges[i-1][1]))fail('overlapping tables.');
    if(sum(0,bytes.length)!==0xb1b0afba)fail('whole-font checksum mismatch.');
    const table=(tag,min)=>{const t=tables.get(tag);if(!t||t.length<min)fail('missing or truncated '+tag+' table.');return t;};
    const head=table('head',54),maxp=table('maxp',6),hhea=table('hhea',36),glyf=table('glyf',0),cmap=table('cmap',4),loca=table('loca',4),hmtx=table('hmtx',4);table('name',6);
    const glyphCount=u16(maxp.offset+4),metricCount=u16(hhea.offset+34),long=u16(head.offset+50);
    if(!glyphCount||!metricCount||metricCount>glyphCount||hmtx.length<metricCount*4+(glyphCount-metricCount)*2||![0,1].includes(long)||loca.length<(glyphCount+1)*(long?4:2))fail('inconsistent glyph or metric counts.');
    let previous=0;for(let i=0;i<=glyphCount;i++){const offset=long?u32(loca.offset+i*4):u16(loca.offset+i*2)*2;if(offset<previous||offset>glyf.length)fail('invalid glyph offsets.');previous=offset;}
    const records=u16(cmap.offset+2);if(records>256||4+records*8>cmap.length)fail('invalid character map.');
    let mapped=null;
    for(let i=0;i<records;i++){
      const offset=u32(cmap.offset+8+i*8);if(offset+2>cmap.length)fail('invalid character map offset.');const p=cmap.offset+offset;
      if(u16(p)!==4)continue;
      if(offset+16>cmap.length)fail('truncated format 4 map.');const length=u16(p+2),n=u16(p+6)/2;
      if(!Number.isInteger(n)||!n||length<16+8*n||offset+length>cmap.length)fail('invalid format 4 map.');
      mapped=new Map();let last=-1;
      for(let j=0;j<n;j++){
        const stop=u16(p+14+j*2),start=u16(p+16+2*n+j*2),delta=u16(p+16+4*n+j*2),at=p+16+6*n+j*2,range=u16(at);
        if(start>stop||start<=last)fail('unordered character map.');last=stop;
        for(let cp=start;cp<=stop;cp++){
          let gid=(cp+delta)&65535;if(range){const pos=at+range+(cp-start)*2;if(pos+2>p+length)fail('invalid character glyph offset.');const value=u16(pos);gid=value?(value+delta)&65535:0;}
          if(gid>=glyphCount)fail('character map references an invalid glyph.');if(gid)mapped.set(cp,gid);
        }
      }
      break;
    }
    if(!mapped)fail('missing BMP character map.');
    for(const ch of expected)if(!mapped.has(ch.codePointAt(0)))fail('missing authored character U+'+ch.codePointAt(0).toString(16).toUpperCase()+'.');
    return {glyphCount,mapped:mapped.size,tables:count,bytes:bytes.length};
  }
  return Object.freeze({check});
});
