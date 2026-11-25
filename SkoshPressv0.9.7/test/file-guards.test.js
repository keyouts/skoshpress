'use strict';
// File Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {readBoundedRegularFile}=require('../lib/file-guards');
test('bounded reader accepts ordinary files and preserves bytes',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-file-'));
  try{
    const file=path.join(folder,'source.bin'),data=Buffer.from([0,1,2,3,0xff]);
    await fs.writeFile(file,data);
    assert.deepEqual(await readBoundedRegularFile(file,10,5),data);
    await assert.rejects(readBoundedRegularFile(file,4),/regular file/);
    await assert.rejects(readBoundedRegularFile(file,10,6),/regular file/);
    await assert.rejects(readBoundedRegularFile(folder,10),/regular file/);
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('bounded reader rejects symlink sources',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skosh-symlink-'));
  try{
    const file=path.join(folder,'source.bin'),link=path.join(folder,'link.bin');
    await fs.writeFile(file,Buffer.alloc(32,42));
    try{await fs.symlink(file,link);}catch(error){if(error.code==='EPERM')return;throw error;}
    await assert.rejects(readBoundedRegularFile(link,64),/regular file/);
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});
