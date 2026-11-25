'use strict';
const {readTables,pack,glyphs}=require('./ttf-binary');
const {verifyFontBinary}=require('./fonts');
const {check}=require('./generated-font-check');
function i16(n){if(!Number.isInteger(n)||n<-32768||n>32767)throw new Error('Variation delta is outside TrueType range.');const b=Buffer.alloc(2);b.writeInt16BE(n);return b;}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16BE(n);return b;}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0);return b;}
function fx(n){return u32(Math.round(n*65536));}
function packedDeltas(values){const parts=[];for(let i=0;i<values.length;i+=64){const run=values.slice(i,i+64);parts.push(Buffer.from([0x40+(run.length-1)]),...run.map(i16));}return Buffer.concat(parts);}
function axisNameTable(base){
  if(base.length<6)throw new Error('Invalid name table.');
  const n=base.readUInt16BE(2),start=base.readUInt16BE(4);
  if(n>512||6+n*12>base.length||start>base.length)throw new Error('Invalid font names.');
  const oldString=base.subarray(start),record=Buffer.alloc(12),name=Buffer.from('Weight','utf16le');
  for(let i=0;i<name.length;i+=2){const t=name[i];name[i]=name[i+1];name[i+1]=t;}
  record.writeUInt16BE(3,0);record.writeUInt16BE(1,2);record.writeUInt16BE(0x409,4);record.writeUInt16BE(256,6);record.writeUInt16BE(name.length,8);record.writeUInt16BE(oldString.length,10);
  const header=Buffer.alloc(6);base.copy(header,0,0,6);header.writeUInt16BE(n+1,2);header.writeUInt16BE(start+12,4);
  return Buffer.concat([header,base.subarray(6,6+n*12),record,base.subarray(6+n*12,start),oldString,name]);
}
function tuple(base,master,peak){
  const a=base.points,b=master.points;
  if(a.length!==b.length||base.ends.join(',')!==master.ends.join(',')||a.some((p,i)=>p.on!==b[i].on))throw new Error('Incompatible masters: glyph contour/point topology differs. Use matching contours and nodes in each weight.');
  const x=a.map((p,i)=>b[i].x-p.x),y=a.map((p,i)=>b[i].y-p.y);
  const phantomLeft=(master.xMin-master.lsb)-(base.xMin-base.lsb);
  x.push(phantomLeft,phantomLeft+master.advance-base.advance,0,0);
  y.push(0,0,0,0);
  if(x.every(v=>v===0)&&y.every(v=>v===0))return null;
  const packed=Buffer.concat([Buffer.from([0]),packedDeltas(x),packedDeltas(y)]);
  if(packed.length>65535)throw new Error('Glyph variation data is too large.');
  return {header:Buffer.concat([u16(packed.length),u16(0xA000),i16(peak)]),data:packed};
}
function generateVariableFont(masterData){
  if(!masterData||typeof masterData!=='object'||!masterData.Regular||!masterData.Bold)throw new Error('Create Regular and Bold masters to export a variable font.');
  const keys=['Regular',...(masterData.Light?['Light']:[]),'Bold'];
  const faces={};
  for(const key of keys){
    const raw=masterData[key];if(!Buffer.isBuffer(raw)||raw.length>5*1024*1024||!verifyFontBinary(raw,'font/ttf'))throw new Error('Invalid variation master: '+key);
    faces[key]={tables:readTables(raw)};faces[key].glyphs=glyphs(faces[key].tables);
  }
  const base=faces.Regular,regularCount=base.glyphs.length;
  if(keys.some(key=>faces[key].glyphs.length!==regularCount))throw new Error('Variation masters have different glyph repertoires.');
  for(const key of keys){
    if(!faces[key].tables.get('cmap').equals(base.tables.get('cmap')))throw new Error('Variation masters have different Unicode mappings.');
  }
  const records=[],offsets=[0];let used=0;
  for(let gid=0;gid<regularCount;gid++){
    const variations=[];
    for(const key of keys.filter(key=>key!=='Regular')){
      const record=tuple(base.glyphs[gid],faces[key].glyphs[gid],key==='Bold'?16384:-16384);
      if(record)variations.push(record);
    }
    const header=Buffer.concat([u16(variations.length),u16(4+6*variations.length),...variations.map(v=>v.header)]);
    const data=Buffer.concat([header,...variations.map(v=>v.data)]);
    records.push(data);used+=data.length;offsets.push(used);
  }
  const header=Buffer.alloc(20);header.writeUInt16BE(1,0);header.writeUInt16BE(1,4);header.writeUInt32BE(20+4*(regularCount+1),8);header.writeUInt16BE(regularCount,12);header.writeUInt16BE(1,14);header.writeUInt32BE(20+4*(regularCount+1),16);
  const gvar=Buffer.concat([header,...offsets.map(u32),...records]);
  const fvar=Buffer.alloc(36);fvar.writeUInt16BE(1,0);fvar.writeUInt16BE(16,4);fvar.writeUInt16BE(2,6);fvar.writeUInt16BE(1,8);fvar.writeUInt16BE(20,10);fvar.writeUInt16BE(0,12);fvar.writeUInt16BE(8,14);
  fvar.write('wght',16);fx(masterData.Light?300:400).copy(fvar,20);fx(400).copy(fvar,24);fx(700).copy(fvar,28);fvar.writeUInt16BE(256,34);
  const tables=new Map(base.tables);tables.set('fvar',fvar);tables.set('gvar',gvar);tables.set('name',axisNameTable(tables.get('name')));
  const out=pack(tables);
  if(!verifyFontBinary(out,'font/ttf'))throw new Error('Generated variable font failed validation.');
  check(out);
  return out;
}
module.exports={generateVariableFont};
