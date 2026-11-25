'use strict';
// Project Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function walk(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(folder,entry.name)):[path.join(folder,entry.name)]);}
test('distributed source contains no Markdown documentation files',()=>{
  const documents=walk(root).filter(file=>path.extname(file).toLowerCase()==='.md');
  assert.deepEqual(documents,[]);
});
test('key accessibility controls retain distinct nonvisual names and valid references',()=>{
  const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
  for(const name of ['Open Typography Studio','Review font integrity and export readiness','Refresh type specimen using compiled font','Check variable-font master compatibility','Export variable TrueType font','Remove selected font from library'])assert.ok(html.includes(`aria-label="${name}"`),name);
  const tag=html.match(/<button\b[^>]*\bid="typography-studio-btn"[^>]*>/)?.[0];
  assert.ok(tag);
  assert.equal((tag.match(/aria-controls=/g)||[]).length,1);
  assert.equal((tag.match(/aria-haspopup=/g)||[]).length,1);
});
