'use strict';
const {normalizeProject,MAX_PROJECT_BYTES}=require('./projects');
const FORMAT='skosh-compact-1';
function encode(document){
  const project=normalizeProject(structuredClone(document));
  const assets=[],seen=new Map();let expandedBytes=0;
  function reference(data,kind){
    if(!seen.has(data)){seen.set(data,assets.length);assets.push({kind,data});}
    const index=seen.get(data);expandedBytes+=Buffer.byteLength(data)+2-String(index).length;
    return index;
  }
  for(const page of project.pages)for(const frame of page.frames)if(frame.type==='image')frame.src=reference(frame.src,'image');
  for(const font of project.fonts)font.data=reference(font.data,'font');
  if(expandedBytes+Buffer.byteLength(JSON.stringify(project))>MAX_PROJECT_BYTES)throw Error('Expanded project exceeds the 65 MB size limit.');
  const serialized=JSON.stringify({format:FORMAT,project,assets});
  if(Buffer.byteLength(serialized)>MAX_PROJECT_BYTES)throw Error('Compact project exceeds the 65 MB size limit.');
  return serialized;
}
function decode(value){
  if(!value||value.format!==FORMAT||!value.project||!Array.isArray(value.assets)||value.assets.length>210030)throw Error('Invalid compact project.');
  const project=structuredClone(value.project),assets=value.assets,used=new Set(),unique=new Set();
  if(!Array.isArray(project.pages)||project.pages.length>700||!Array.isArray(project.fonts)||project.fonts.length>30)throw Error('Invalid compact project structure.');
  for(const a of assets){if(!a||!['image','font'].includes(a.kind)||typeof a.data!=='string'||a.data.length>25*1024*1024||unique.has(a.data))throw Error('Invalid compact asset.');unique.add(a.data);}
  let size=Buffer.byteLength(JSON.stringify(project));
  function resolve(index,kind){
    if(!Number.isSafeInteger(index)||index<0||index>=assets.length||assets[index].kind!==kind)throw Error('Invalid compact asset reference.');
    const data=assets[index].data;size+=Buffer.byteLength(data)+2-String(index).length;
    if(size>MAX_PROJECT_BYTES)throw Error('Expanded project exceeds the 65 MB size limit.');
    used.add(index);return data;
  }
  for(const page of project.pages){if(!page||!Array.isArray(page.frames)||page.frames.length>300)throw Error('Invalid compact page.');for(const frame of page.frames){if(!frame||typeof frame!=='object')throw Error('Invalid compact frame.');if(frame.type==='image')frame.src=resolve(frame.src,'image');}}
  for(const font of project.fonts){if(!font||typeof font!=='object')throw Error('Invalid compact font.');font.data=resolve(font.data,'font');}
  if(used.size!==assets.length)throw Error('Unused compact asset.');
  return normalizeProject(project);
}
module.exports={encode,decode,FORMAT};
