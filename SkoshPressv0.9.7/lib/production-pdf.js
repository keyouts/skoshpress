'use strict';
// Production Metadata
const points=mm=>mm*72/25.4;
function validateProduction(value,width,height){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid production metadata.');
  const {trimWidth,trimHeight,bleed,caliper,maxCreep,signaturePages,sideCount,binding}=value;
  if(!['loose','saddle'].includes(binding)||!Number.isInteger(sideCount)||sideCount<1||sideCount>700||!Number.isInteger(signaturePages)||signaturePages<0||signaturePages>64||signaturePages%4!==0)throw Error('Invalid production metadata.');
  for(const [n,min,max] of [[trimWidth,50,width],[trimHeight,50,height],[bleed,0,25],[caliper,0,.5],[maxCreep,0,500]])if(!Number.isFinite(n)||n<min||n>max)throw Error('Invalid production metadata.');
  if(trimWidth+2*bleed>width+.001||trimHeight+2*bleed>height+.001||maxCreep>=trimWidth/(binding==='saddle'?4:2))throw Error('Production boxes exceed the sheet.');
  return {trimWidth,trimHeight,bleed,caliper,maxCreep,signaturePages,sideCount,binding};
}
function addProductionMetadata(pdf,width,height,raw){
  const meta=validateProduction(raw,width,height);
  if(!Buffer.isBuffer(pdf)||pdf.length>256*1024*1024||pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid generated PDF.');
  const ending=pdf.subarray(Math.max(0,pdf.length-1024)).toString('latin1');
  const end=/startxref\s+(\d+)\s+%%EOF\s*$/.exec(ending);
  if(!end)throw Error('Unsupported generated PDF cross-reference.');
  const previous=Number(end[1]);if(!Number.isSafeInteger(previous)||previous<0||previous>=pdf.length)throw Error('Invalid generated PDF cross-reference.');
  const tail=pdf.subarray(previous).toString('latin1');
  const table=/^xref\r?\n([\s\S]*?)trailer\s*<<([\s\S]*?)>>\s*startxref/.exec(tail);
  if(!table)throw Error('Unsupported generated PDF cross-reference.');
  const trailer=table[2],root=/\/Root\s+(\d+)\s+0\s+R\b/.exec(trailer),info=/\/Info\s+(\d+)\s+0\s+R\b/.exec(trailer),size=Number(/\/Size\s+(\d+)\b/.exec(trailer)?.[1]);
  if(!root||!info||!Number.isInteger(size)||size<1||size>100000||/\/(?:Encrypt|Prev|XRefStm)\b/.test(trailer))throw Error('Unsupported generated PDF trailer.');
  const lines=table[1].trim().split(/\r?\n/),objects=new Map();
  for(let i=0;i<lines.length;){
    const block=/^(\d+)\s+(\d+)$/.exec(lines[i++].trim());if(!block)throw Error('Invalid generated PDF cross-reference.');
    const first=Number(block[1]),count=Number(block[2]);if(first+count>size||count>lines.length-i)throw Error('Invalid generated PDF cross-reference.');
    for(let j=0;j<count;j++){
      const entry=/^(\d{10})\s+(\d{5})\s+([nf])\s*$/.exec(lines[i++]);if(!entry)throw Error('Invalid generated PDF cross-reference.');
      if(entry[3]==='n'){const offset=Number(entry[1]);if(entry[2]!=='00000'||offset<5||offset>=previous||objects.has(first+j))throw Error('Invalid generated PDF object.');objects.set(first+j,offset);}
    }
  }
  const ordered=[...objects].sort((a,b)=>a[1]-b[1]),replacements=[];
  const fmt=n=>Number(n.toFixed(4));
  let pageCount=0;
  for(let i=0;i<ordered.length;i++){
    const [id,start]=ordered[i],stop=ordered[i+1]?.[1]??previous;
    if(stop<=start)throw Error('Invalid generated PDF object offsets.');
    const prefix=pdf.subarray(start,Math.min(stop,start+180)).toString('latin1');
    if(!new RegExp(`^${id} 0 obj\\s`).test(prefix))throw Error('Invalid generated PDF object header.');
    const page=new RegExp(`^${id} 0 obj\\s*<<\\s*\\/Type\\s+\\/Page\\b`).test(prefix),isInfo=id===Number(info[1]);
    if(!page&&!isInfo)continue;
    if(stop-start>1024*1024)throw Error('Generated PDF dictionary exceeds limit.');
    const object=pdf.subarray(start,stop).toString('latin1').trimEnd();
    if(!/>>\s*endobj$/.test(object)||/\bstream\r?\n/.test(object))throw Error('Unsupported generated PDF dictionary.');
    let extra='';
    if(page){
      if(/\/(?:TrimBox|BleedBox|CropBox|Rotate)\b/.test(object))throw Error('Unexpected generated PDF page geometry.');
      const media=/\/MediaBox\s*\[\s*0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*\]/.exec(object);
      if(!media)throw Error('Unsupported generated PDF media box.');
      const w=Number(media[1]),h=Number(media[2]);if(Math.abs(w-points(width))>2||Math.abs(h-points(height))>2)throw Error('Generated PDF sheet dimensions differ from the production plan.');
      const x=(w-points(meta.trimWidth))/2,y=(h-points(meta.trimHeight))/2,b=points(meta.bleed);
      if(x-b<-1||y-b<-1)throw Error('Production boxes exceed the actual PDF sheet.');
      extra=`\n/TrimBox [${[Math.max(0,x),Math.max(0,y),Math.min(w,w-x),Math.min(h,h-y)].map(fmt).join(' ')}]\n/BleedBox [${[Math.max(0,x-b),Math.max(0,y-b),Math.min(w,w-x+b),Math.min(h,h-y+b)].map(fmt).join(' ')}]`;
      pageCount++;
    }else{
      if(/\/Subject\b/.test(object))throw Error('Unexpected generated PDF subject.');
      extra=`\n/Subject (Production: ${meta.binding}; sheet ${width} x ${height} mm; trim ${meta.trimWidth} x ${meta.trimHeight} mm; bleed ${meta.bleed} mm; caliper ${meta.caliper} mm; maximum creep ${meta.maxCreep} mm; signature ${meta.signaturePages||'whole'})`;
    }
    replacements.push([id,Buffer.from(object.replace(/>>\s*endobj$/,extra+'\n>>\nendobj')+'\n','latin1')]);
  }
  if(pageCount!==meta.sideCount||!replacements.some(([id])=>id===Number(info[1])))throw Error('Generated PDF page count differs from the production plan.');
  const chunks=[pdf,Buffer.from('\n')];let offset=pdf.length+1;const refs=[];
  for(const [id,bytes] of replacements){refs.push([id,offset]);chunks.push(bytes);offset+=bytes.length;}
  const xref=offset;let update='xref\n';for(const [id,at] of refs.sort((a,b)=>a[0]-b[0]))update+=`${id} 1\n${String(at).padStart(10,'0')} 00000 n \n`;
  update+=`trailer\n<< /Size ${size} /Root ${root[1]} 0 R /Info ${info[1]} 0 R /Prev ${previous} >>\nstartxref\n${xref}\n%%EOF\n`;
  chunks.push(Buffer.from(update,'ascii'));return Buffer.concat(chunks);
}
module.exports={validateProduction,addProductionMetadata};
