'use strict';
// Library Storage
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {readBoundedRegularFile}=require('./file-guards');
const {validDesign}=require('./font-design');
const ID=/^font-[a-z0-9-]{1,70}$/i;
const MAX_DESIGNS=80,MAX_BYTES=6*1024*1024;
function createLibrary(root){
  const folder=path.join(root,'typography-library');
  const fileFor=id=>{if(typeof id!=='string'||!ID.test(id))throw new Error('Invalid library font identifier.');return path.join(folder,`${id}.json`);};
  async function list(){
    await fs.mkdir(folder,{recursive:true});
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
    const loc=fileFor(id),info=await fs.lstat(loc);
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
    await fs.mkdir(folder,{recursive:true});
    const existing=await list();
    if(!existing.some(entry=>entry.id===design.id)&&existing.length>=MAX_DESIGNS)throw new Error('Font library is full (80 designs).');
    const temp=path.join(folder,`${design.id}.${randomUUID()}.tmp`);
    try{await fs.writeFile(temp,serialized,{flag:'wx',mode:0o600});await fs.rename(temp,loc);}
    finally{await fs.rm(temp,{force:true}).catch(()=>{});}
    return {id:design.id,name:design.name};
  }
  async function remove(id){
    await fs.unlink(fileFor(id));
    return {id};
  }
  return Object.freeze({list,load,save,remove});
}
module.exports={createLibrary,MAX_BYTES};
