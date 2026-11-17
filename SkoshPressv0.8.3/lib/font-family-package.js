'use strict';
// Font Implementation
const {verifyFontBinary}=require('./fonts');
const STYLES=['Regular','Light','Bold','Italic'];
const CRC_TABLE=Array.from({length:256},(_,i)=>{let n=i;for(let j=0;j<8;j++)n=(n&1)?(0xedb88320^(n>>>1)):(n>>>1);return n>>>0;});
function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=CRC_TABLE[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function buildZip(files,options={}){
  const maxFiles=options.maxFiles??8,maxTotal=options.maxTotal??24*1024*1024;
  if(!Array.isArray(files)||files.length<1||files.length>maxFiles)throw new Error('Invalid font ZIP entry count.');
  let total=0;
  const local=[],central=[];let offset=0;
  for(const [name,value] of files){
    const path=Buffer.from(name,'utf8'),data=Buffer.from(value),crc=crc32(data);
    if(path.length>255||data.length>6*1024*1024||(total+=data.length)>maxTotal||!/^[-a-zA-Z0-9_. \/]{1,255}$/.test(name)||name.split('/').includes('..'))throw new Error('Invalid font package file.');
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(path.length,26);
    local.push(header,path,data);
    const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x800,8);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(path.length,28);dir.writeUInt32LE(offset,42);
    central.push(dir,path);offset+=header.length+path.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
function buildFamilyPackage(family,faces){
  if(typeof family!=='string'||!family.trim()||family.length>64||!Array.isArray(faces)||faces.length<1||faces.length>4)throw new Error('Invalid font family.');
  const safe=family.replace(/[^\p{L}\p{N} _.-]/gu,'').trim().slice(0,60)||'Skosh Font',found=new Set(),files=[];
  for(const face of faces){
    if(!face||!STYLES.includes(face.style)||found.has(face.style)||typeof face.data!=='string')throw new Error('Invalid or duplicate font face.');
    const match=/^data:font\/ttf;base64,([A-Za-z0-9+/]+={0,2})$/.exec(face.data);
    if(!match||face.data.length>5*1024*1024*1.4+50)throw new Error('Invalid TrueType font data.');
    const bytes=Buffer.from(match[1],'base64');
    if(!verifyFontBinary(bytes,'font/ttf')||bytes.subarray(0,4).toString('hex')!=='00010000')throw new Error('Invalid TrueType face structure.');
    files.push([`${safe}-${face.style}.ttf`,bytes]);found.add(face.style);
  }
  if(!found.has('Regular'))throw new Error('A font family package requires Regular.');
  files.push(['README.txt',Buffer.from(`Font family: ${family}\nIncluded static styles: ${[...found].join(', ')}\n\nThese are standard TrueType files; install them with your operating system or use them in compatible software.\nCheck ownership, font licensing, kerning, character coverage, and rendering in your intended applications before redistribution.\n`,'utf8')]);
  return buildZip(files);
}
module.exports={buildFamilyPackage,buildZip,crc32};
