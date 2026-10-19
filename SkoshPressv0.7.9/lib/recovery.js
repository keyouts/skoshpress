'use strict';
// Recovery Storage
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
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
  let queue=Promise.resolve();
  let generation=0;
  function sequence(task){const scheduled=queue.then(task);queue=scheduled.catch(()=>{});return scheduled;}
  async function save(rawDocument,sourceName=''){
    const document=normalizeProject(structuredClone(rawDocument));
    const envelope={schema:1,savedAt:Date.now(),sourceName:String(sourceName).slice(0,255),document};
    const serialized=JSON.stringify(envelope);
    if(Buffer.byteLength(serialized,'utf8')>MAX_PROJECT_BYTES)throw new Error('Recovery snapshot exceeds 65 MB.');
    const epoch=generation;
    return sequence(async()=>{
      if(epoch!==generation)return false;
      await fs.mkdir(directory,{recursive:true,mode:0o700});
      const temporary=path.join(directory,`.recovery-${randomUUID()}.tmp`);
      try{
        await fs.writeFile(temporary,serialized,{encoding:'utf8',flag:'wx',mode:0o600});
        if(epoch!==generation)return false;
        await fs.rename(temporary,target);
        return true;
      }finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
    });
  }
  async function read(){
    return sequence(async()=>{
      let info;
      try{info=await fs.lstat(target);}catch(error){if(error.code==='ENOENT')return null;throw error;}
      if(!info.isFile()||info.isSymbolicLink()||info.size<10||info.size>MAX_PROJECT_BYTES)
        throw new Error('Recovery file is not a valid regular file.');
      return validateEnvelope(JSON.parse(await fs.readFile(target,'utf8')));
    });
  }
  async function clear(){
    generation++;
    return sequence(async()=>{await fs.rm(target,{force:true});return true;});
  }
  return {save,read,clear,path:target};
}
module.exports={createRecoveryStore,recoveryPath,validateEnvelope};
