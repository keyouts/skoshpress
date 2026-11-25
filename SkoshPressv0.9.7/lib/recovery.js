'use strict';
// Recovery Storage
const fs=require('node:fs/promises');
const path=require('node:path');
const {readBoundedRegularFile,writeAtomically,ensurePrivateDirectory,createSerialQueue}=require('./file-guards');
const {normalizeProject,MAX_PROJECT_BYTES}=require('./projects');
const RECOVERY_FILENAME='unsaved-recovery.json';
function recoveryPath(userData){return path.join(userData,'recovery',RECOVERY_FILENAME);}
function validateEnvelope(value){
  if(!value || value.schema!==1 || !Number.isFinite(value.savedAt) || value.savedAt<0 ||
     typeof value.sourceName!=='string' || value.sourceName.length>255 || !value.document)
    throw new Error('Recovery file format is invalid.');
  return {schema:1,savedAt:value.savedAt,sourceName:value.sourceName,document:normalizeProject(value.document)};
}
function createRecoveryStore(userData){
  const target=recoveryPath(userData);
  const directory=path.dirname(target);
  const previous=path.join(directory,'unsaved-recovery.previous.json');
  const sequence=createSerialQueue();
  let generation=0;
  async function ensureDirectory(create=false){return ensurePrivateDirectory(directory,create,'Recovery directory');}
  async function readCopy(filename){
    try{
      const buffer=await readBoundedRegularFile(filename,MAX_PROJECT_BYTES,10);
      return validateEnvelope(JSON.parse(buffer.toString('utf8')));
    }catch(error){if(error.code==='ENOENT')return null;throw error;}
  }
  function atomicWrite(filename,serialized,epoch){return writeAtomically(filename,serialized,()=>epoch===generation);}
  async function save(rawDocument,sourceName=''){
    const document=normalizeProject(structuredClone(rawDocument));
    const envelope={schema:1,savedAt:Date.now(),sourceName:String(sourceName).slice(0,255),document};
    const serialized=JSON.stringify(envelope);
    if(Buffer.byteLength(serialized,'utf8')>MAX_PROJECT_BYTES)throw new Error('Recovery snapshot exceeds 65 MB.');
    const epoch=generation;
    return sequence(async()=>{
      if(epoch!==generation)return false;
      await ensureDirectory(true);
      let old=null;
      try{old=await readCopy(target);}catch(_error){}
      if(old){
        const oldSerialized=JSON.stringify(old);
        if(Buffer.byteLength(oldSerialized,'utf8')<=MAX_PROJECT_BYTES){
          if(!await atomicWrite(previous,oldSerialized,epoch))return false;
        }
      }
      return atomicWrite(target,serialized,epoch);
    });
  }
  async function read(){
    return sequence(async()=>{
      if(!await ensureDirectory())return null;
      let primaryError;
      try{const latest=await readCopy(target);if(latest)return latest;}catch(error){primaryError=error;}
      try{const fallback=await readCopy(previous);if(fallback)return fallback;}catch(error){if(!primaryError)primaryError=error;}
      if(primaryError)throw primaryError;
      return null;
    });
  }
  async function clear(){
    generation++;
    return sequence(async()=>{
      if(await ensureDirectory()){await fs.rm(target,{force:true});await fs.rm(previous,{force:true});}
      return true;
    });
  }
  return {save,read,clear,path:target};
}
module.exports={createRecoveryStore,recoveryPath,validateEnvelope};
