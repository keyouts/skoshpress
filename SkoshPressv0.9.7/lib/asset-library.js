'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto');
const {readBoundedRegularFile,writeAtomically,ensurePrivateDirectory,createSerialQueue}=require('./file-guards');
const {validImageData}=require('./projects');
const {validateFonts}=require('./fonts');
const MAX_BYTES=32*1024*1024,MAX_ITEMS=100;
const identifier=data=>createHash('sha256').update(data).digest('hex');
function entry(raw){
  if(!raw||!['image','font'].includes(raw.kind)||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>200)throw Error('Invalid library asset.');
  const data=raw.kind==='image'?raw.src:raw.data;
  if(raw.kind==='image'){if(!validImageData(data))throw Error('Invalid library image.');}
  else validateFonts([{id:'font-library',name:raw.name.slice(0,64),data}]);
  const result={id:identifier(data),kind:raw.kind,name:raw.name};
  if(raw.kind==='image')result.src=data;else result.data=data;
  return result;
}
function createAssetLibrary(root){
  const filename=path.join(root,'reusable-assets.json');const sequence=createSerialQueue();
  async function read(){
    if(!await ensurePrivateDirectory(root,false))return [];
    let raw;try{raw=JSON.parse((await readBoundedRegularFile(filename,MAX_BYTES,2)).toString('utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}
    if(!Array.isArray(raw)||raw.length>MAX_ITEMS)throw Error('Invalid asset library.');
    const seen=new Set();return raw.map(item=>{const valid=entry(item);if(item.id!==valid.id||seen.has(valid.id))throw Error('Invalid library asset identifier.');seen.add(valid.id);return valid;});
  }
  async function write(rows){await ensurePrivateDirectory(root);const text=JSON.stringify(rows);if(rows.length>MAX_ITEMS||Buffer.byteLength(text)>MAX_BYTES)throw Error('Asset library is full (100 assets or 32 MB).');await writeAtomically(filename,text);}
  function list(){return sequence(async()=> (await read()).map(({id,kind,name})=>({id,kind,name})));}
  function validId(id){if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid asset identifier.');}
  function load(id){return sequence(async()=>{validId(id);const result=(await read()).find(a=>a.id===id);if(!result)throw Error('Library asset not found.');return result;});}
  function save(raw){return sequence(async()=>{const item=entry(raw),rows=await read();const existing=rows.find(a=>a.id===item.id);if(!existing){rows.push(item);await write(rows);}const saved=existing||item;return {id:saved.id,kind:saved.kind,name:saved.name};});}
  function remove(id){return sequence(async()=>{validId(id);const rows=await read(),next=rows.filter(a=>a.id!==id);if(next.length!==rows.length)await write(next);return true;});}
  return Object.freeze({list,load,save,remove});
}
module.exports={createAssetLibrary,MAX_BYTES,MAX_ITEMS};
