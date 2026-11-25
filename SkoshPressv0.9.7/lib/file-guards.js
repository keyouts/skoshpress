'use strict';
// File Boundaries
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
async function readBoundedRegularFile(filename,maxBytes,minimumBytes=1){
  if(typeof filename!=='string'||!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(minimumBytes)||minimumBytes<0||minimumBytes>maxBytes)throw new Error('Invalid file input limits.');
  const before=await fs.lstat(filename);
  if(!before.isFile()||before.isSymbolicLink()||before.size<minimumBytes||before.size>maxBytes)throw new Error('Selected file is not a valid regular file.');
  const handle=await fs.open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try{
    const opened=await handle.stat();
    if(!opened.isFile()||opened.size<minimumBytes||opened.size>maxBytes||opened.dev!==before.dev||opened.ino!==before.ino)throw new Error('Selected file changed during validation.');
    const data=Buffer.alloc(opened.size);
    let offset=0;
    while(offset<data.length){
      const {bytesRead}=await handle.read(data,offset,data.length-offset,offset);
      if(!bytesRead)throw new Error('Selected file changed during reading.');
      offset+=bytesRead;
    }
    const extra=Buffer.alloc(1);
    const {bytesRead:additional}=await handle.read(extra,0,1,offset);
    const after=await handle.stat();
    if(additional||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs)throw new Error('Selected file changed during reading.');
    return data;
  }finally{await handle.close();}
}
async function writeAtomically(target,content,shouldCommit=()=>true){
  const temporary=path.join(path.dirname(target),`.skoshpress-${randomUUID()}.tmp`);
  let created=false;
  try{
    const handle=await fs.open(temporary,'wx',0o600);created=true;
    try{await handle.writeFile(content);await handle.sync();}finally{await handle.close();}
    if(!shouldCommit())return false;
    await fs.rename(temporary,target);return true;
  }finally{if(created)await fs.rm(temporary,{force:true}).catch(()=>{});}
}
async function ensurePrivateDirectory(directory,create=true,label='Private storage directory'){
  if(create)await fs.mkdir(directory,{recursive:true,mode:0o700});
  let info;try{info=await fs.lstat(directory);}catch(error){if(!create&&error.code==='ENOENT')return false;throw error;}
  if(!info.isDirectory()||info.isSymbolicLink())throw new Error(label+' is not a valid directory.');
  return directory;
}
function createSerialQueue(){
  let queue=Promise.resolve();
  return task=>{const pending=queue.then(task);queue=pending.catch(()=>{});return pending;};
}
module.exports={readBoundedRegularFile,writeAtomically,ensurePrivateDirectory,createSerialQueue};
