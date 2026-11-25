'use strict';
// Library Storage
const fs=require('node:fs/promises');
const path=require('node:path');
const {readBoundedRegularFile,writeAtomically,ensurePrivateDirectory,createSerialQueue}=require('./file-guards');
const {validDesign}=require('./font-design');
const ID=/^font-[a-z0-9-]{1,70}$/i;
const MAX_DESIGNS=80,MAX_BYTES=6*1024*1024;
function createLibrary(root){
  const folder=path.join(root,'typography-library');
  const fileFor=id=>{if(typeof id!=='string'||!ID.test(id))throw new Error('Invalid library font identifier.');return path.join(folder,`${id}.json`);};
  const sequence=createSerialQueue();
  async function ensureFolder(){await ensurePrivateDirectory(root);await ensurePrivateDirectory(folder);}
  async function list(){
    await ensureFolder();
    const entries=await fs.readdir(folder,{withFileTypes:true}),items=[];
    for(const entry of entries){
      if(!entry.isFile()||!/^font-[a-z0-9-]{1,70}\.json$/i.test(entry.name))continue;
      try{
        const loc=path.join(folder,entry.name),info=await fs.lstat(loc);
        if(info.size>MAX_BYTES)continue;
        const design=JSON.parse((await readBoundedRegularFile(loc,MAX_BYTES,1)).toString('utf8'));
        if(validDesign(design)&&`${design.id}.json`===entry.name)items.push({id:design.id,name:design.name,updatedAt:info.mtimeMs});
      }catch{}
    }
    return items.sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,MAX_DESIGNS);
  }
  async function load(id){
    const loc=fileFor(id);await ensureFolder();const info=await fs.lstat(loc);
    if(!info.isFile()||info.size>MAX_BYTES)throw new Error('Font library entry is not a valid regular file.');
    const design=JSON.parse((await readBoundedRegularFile(loc,MAX_BYTES,1)).toString('utf8'));
    if(!validDesign(design)||design.id!==id)throw new Error('Font library entry is invalid.');
    return design;
  }
  async function save(design){
    if(!validDesign(design)||design.kind!=='vector')throw new Error('Only valid editable vector designs can be saved to the font library.');
    const serialized=JSON.stringify(design);
    if(Buffer.byteLength(serialized)>MAX_BYTES)throw new Error('Font library design exceeds the 6 MB limit.');
    const loc=fileFor(design.id);
    await ensureFolder();
    const existing=await list();
    if(!existing.some(entry=>entry.id===design.id)&&existing.length>=MAX_DESIGNS)throw new Error('Font library is full (80 designs).');
    await writeAtomically(loc,serialized);
    return {id:design.id,name:design.name};
  }
  async function remove(id){
    const loc=fileFor(id);await ensureFolder();await fs.unlink(loc);
    return {id};
  }
  return Object.freeze({list:()=>sequence(list),load:id=>sequence(()=>load(id)),save:design=>sequence(()=>save(design)),remove:id=>sequence(()=>remove(id))});
}
module.exports={createLibrary,MAX_BYTES};
