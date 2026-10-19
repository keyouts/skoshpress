'use strict';
// GEDCOM Import
const zlib=require('node:zlib');
const path=require('node:path');
const MAX_ZIP_BYTES=20*1024*1024, MAX_GED_BYTES=12*1024*1024;
function fromZip(input){
 if(input.length>MAX_ZIP_BYTES)throw Error('Archive exceeds the 20 MB import limit.');
 // ZIP Directory
 const start=Math.max(0,input.length-65557);
 let eocd=-1;
 for(let i=input.length-22;i>=start;i--){if(input.readUInt32LE(i)===0x06054b50 && i+22+input.readUInt16LE(i+20)<=input.length){eocd=i;break;}}
 if(eocd<0)throw Error('No valid ZIP directory was found. Extract the .ged file manually and try again.');
 if(input.readUInt16LE(eocd+4)||input.readUInt16LE(eocd+6))throw Error('Multi-disk ZIP archives are not supported.');
 const count=input.readUInt16LE(eocd+10),offset=input.readUInt32LE(eocd+16);
 const directoryBytes=input.readUInt32LE(eocd+12);
 if(count!==input.readUInt16LE(eocd+8) || count>1000 ||
   count===0 || offset===0xffffffff || directoryBytes===0xffffffff ||
   offset>=eocd || offset+directoryBytes>eocd)throw Error('Unsupported ZIP directory.');
 let ptr=offset, result=null;
 for(let i=0;i<count;i++){
  if(ptr+46>offset+directoryBytes||input.readUInt32LE(ptr)!==0x02014b50)throw Error('Invalid ZIP central directory.');
  const flags=input.readUInt16LE(ptr+8),method=input.readUInt16LE(ptr+10);
  const compressed=input.readUInt32LE(ptr+20),uncompressed=input.readUInt32LE(ptr+24);
  const nameLen=input.readUInt16LE(ptr+28),extraLen=input.readUInt16LE(ptr+30),commentLen=input.readUInt16LE(ptr+32);
  const location=input.readUInt32LE(ptr+42);
  if(ptr+46+nameLen+extraLen+commentLen>offset+directoryBytes)throw Error('Truncated ZIP directory entry.');
  const name=input.toString('utf8',ptr+46,ptr+46+nameLen);
  ptr+=46+nameLen+extraLen+commentLen;
  if(!/\.ged$/i.test(name))continue;
  if(result)throw Error('Archive includes multiple GEDCOM files. Extract and import the desired .ged file.');
  if(flags & (1|0x40|0x2000))throw Error('Encrypted ZIP archives are not supported.');
  if(flags & ~0x080e)throw Error('Unsupported ZIP entry flags.');
  if(compressed===0xffffffff || uncompressed===0xffffffff || location===0xffffffff)throw Error('ZIP64 archives are not supported.');
  if(![0,8].includes(method))throw Error('Unsupported ZIP compression method.');
  if(!uncompressed || uncompressed>MAX_GED_BYTES || compressed>MAX_ZIP_BYTES)throw Error('GEDCOM archive is too large to import safely.');
  if(location+30>input.length||input.readUInt32LE(location)!==0x04034b50)throw Error('Invalid ZIP member.');
  const localFlags=input.readUInt16LE(location+6),localMethod=input.readUInt16LE(location+8);
  const localNameSize=input.readUInt16LE(location+26),localExtraSize=input.readUInt16LE(location+28);
  const localNameEnd=location+30+localNameSize;
  const startByte=localNameEnd+localExtraSize;
  if(localFlags!==flags || localMethod!==method || localNameEnd>offset || startByte>offset ||
    !input.subarray(location+30,localNameEnd).equals(Buffer.from(name,'utf8')) ||
    startByte+compressed>offset)throw Error('ZIP member header does not match its directory entry.');
  if(!(flags & 8) && (input.readUInt32LE(location+18)!==compressed || input.readUInt32LE(location+22)!==uncompressed))
    throw Error('ZIP member sizes do not match its directory entry.');
  const bytes=input.subarray(startByte,startByte+compressed);
  const decoded=method===0?Buffer.from(bytes):zlib.inflateRawSync(bytes,{maxOutputLength:MAX_GED_BYTES});
  if(decoded.length!==uncompressed)throw Error('ZIP member size does not match its directory entry.');
  result={name:path.basename(name.replace(/\\/g,'/')),buffer:decoded};
 }
 if(ptr!==offset+directoryBytes)throw Error('ZIP directory length does not match the record count.');
 if(!result)throw Error('No .ged file was found inside this ZIP archive.');
 return result;
}
function decode(buffer){
 if(buffer.length>MAX_GED_BYTES)throw Error('GEDCOM exceeds the 12 MB import limit.');
 if(buffer.length>=2&&buffer[0]===0xff&&buffer[1]===0xfe)return new TextDecoder('utf-16le',{fatal:true}).decode(buffer.subarray(2));
 if(buffer.length>=2&&buffer[0]===0xfe&&buffer[1]===0xff)return new TextDecoder('utf-16be',{fatal:true}).decode(buffer.subarray(2));
 const header=buffer.subarray(0,Math.min(2048,buffer.length)).toString('latin1');
 if(/\b1 CHAR ANSEL\b/.test(header))throw Error('This GEDCOM uses legacy ANSEL encoding; export as UTF-8 before importing.');
 if(/\b1 CHAR (?:ANSI|ASCII)\b/.test(header))return new TextDecoder('windows-1252').decode(buffer);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{
  throw Error('GEDCOM is not valid UTF-8. Export again using UTF-8 or UTF-16 encoding.');
 }
}
function importGedcomBuffer(buffer,filename){
 if(!Buffer.isBuffer(buffer))throw new TypeError('Expected a file buffer');
 const isZip=/\.zip$/i.test(filename);
 const file=isZip?fromZip(buffer):{name:path.basename(filename),buffer};
 if(!/\.ged$/i.test(file.name))throw Error('Select a .ged or .zip file containing a GEDCOM export.');
 return {name:file.name.replace(/\.ged$/i,''),text:decode(file.buffer)};
}
module.exports={importGedcomBuffer,fromZip,decode};
