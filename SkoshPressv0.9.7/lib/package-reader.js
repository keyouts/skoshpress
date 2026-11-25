'use strict';
const {inflateRawSync}=require('node:zlib');
const {crc32}=require('./zip-integrity');
const MAX_BYTES=96*1024*1024;
function readPackageEntries(buffer){
  const invalid=()=>{throw Error('Invalid or unsupported publication archive.');};
  if(!Buffer.isBuffer(buffer)||buffer.length<22||buffer.length>MAX_BYTES)invalid();
  const end=buffer.length-22;
  if(buffer.readUInt32LE(end)!==0x06054b50||buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6)||buffer.readUInt16LE(end+20))invalid();
  const count=buffer.readUInt16LE(end+10),directory=buffer.readUInt32LE(end+16);
  if(!count||count>2000||buffer.readUInt16LE(end+8)!==count||directory+buffer.readUInt32LE(end+12)!==end)invalid();
  let cursor=directory,offset=0,total=0;
  const entries=new Map();
  for(let i=0;i<count;i++){
    if(cursor+46>end||buffer.readUInt32LE(cursor)!==0x02014b50)invalid();
    const flags=buffer.readUInt16LE(cursor+8),method=buffer.readUInt16LE(cursor+10),crc=buffer.readUInt32LE(cursor+16),packed=buffer.readUInt32LE(cursor+20),size=buffer.readUInt32LE(cursor+24),length=buffer.readUInt16LE(cursor+28);
    if(flags!==0x800||![0,8].includes(method)||!length||length>200||buffer.readUInt16LE(cursor+30)||buffer.readUInt16LE(cursor+32)||buffer.readUInt16LE(cursor+34)||buffer.readUInt32LE(cursor+42)!==offset||cursor+46+length>end||size>65*1024*1024)invalid();
    const name=buffer.toString('utf8',cursor+46,cursor+46+length);
    if(!/^(publication\.skoshpress|README\.txt|manifest\.json|images\/image-[1-9]\d*\.(png|jpg|webp|gif)|fonts\/font-[1-9]\d*\.(ttf|otf|woff2?))$/.test(name)||entries.has(name))invalid();
    if(offset+30+length+packed>directory||buffer.readUInt32LE(offset)!==0x04034b50||buffer.readUInt16LE(offset+6)!==flags||buffer.readUInt16LE(offset+8)!==method||buffer.readUInt32LE(offset+14)!==crc||buffer.readUInt32LE(offset+18)!==packed||buffer.readUInt32LE(offset+22)!==size||buffer.readUInt16LE(offset+26)!==length||buffer.readUInt16LE(offset+28)||buffer.toString('utf8',offset+30,offset+30+length)!==name)invalid();
    total+=size;if(total>MAX_BYTES)invalid();
    const start=offset+30+length,compressed=buffer.subarray(start,start+packed);
    let bytes;
    try{bytes=method===0?compressed:inflateRawSync(compressed,{maxOutputLength:Math.max(1,size)});}catch(_error){invalid();}
    if(bytes.length!==size||crc32(bytes)!==crc)invalid();
    entries.set(name,bytes);offset=start+packed;cursor+=46+length;
  }
  if(cursor!==end||offset!==directory)invalid();
  return entries;
}
module.exports={readPackageEntries,MAX_BYTES};
