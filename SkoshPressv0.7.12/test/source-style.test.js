'use strict';
// Source Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..','..');
const codeExtensions=new Set(['.js','.css','.html','.py','.ps1']);
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(dir,item.name)):[path.join(dir,item.name)]);}
function sourceFiles(){return files(root).filter(file=>codeExtensions.has(path.extname(file)) && !path.basename(file).startsWith('.'));}
test('source code comments remain two-word section headings',()=>{
 for(const file of sourceFiles().filter(file=>codeExtensions.has(path.extname(file)))){
  const ext=path.extname(file),content=fs.readFileSync(file,'utf8'),relative=path.relative(root,file);
  if(ext==='.css'){
   for(const match of content.matchAll(/\/\*[\s\S]*?\*\//g))assert.match(match[0],/^\/\* [A-Za-z]+ [A-Za-z]+ \*\/$/,relative);
   assert.equal((content.match(/\/\*/g)||[]).length,(content.match(/\*\//g)||[]).length,relative);
  }
  if(ext==='.html'){
   for(const match of content.matchAll(/<!--[\s\S]*?-->/g))assert.match(match[0],/^<!-- [A-Za-z]+ [A-Za-z]+ -->$/,relative);
   assert.equal((content.match(/<!--/g)||[]).length,(content.match(/-->/g)||[]).length,relative);
  }
  for(const line of content.split(/\r?\n/)){
   const value=line.trim();
   if(ext==='.js' && value.startsWith('//'))assert.match(value,/^\/\/ [A-Za-z]+ [A-Za-z]+$/,relative);
   if((ext==='.py' || ext==='.ps1') && value.startsWith('#'))assert.match(value,/^# [A-Za-z]+ [A-Za-z]+$/,relative);
  }
 }
});
