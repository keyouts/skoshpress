'use strict';
// Help Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dir=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(dir,file),'utf8');

test('Help menu routes both entries to local accessible dialogs',()=>{
  const main=read('main.js'),preload=read('preload.js'),app=read('src/app.js'),html=read('src/index.html');
  for(const [command,dialog] of [['helpBasics','help-basics-dialog'],['helpPrivacy','help-privacy-dialog']]){
    assert.match(main,new RegExp(`menuAction\\('${command}'\\)`));
    assert.ok(preload.includes(`'${command}'`));
    assert.ok(app.includes(`${command}:()=>openHelpDialog('#${dialog}')`));
    assert.match(html,new RegExp(`<dialog id="${dialog}"[^>]*aria-labelledby="[^"]+"[^>]*aria-describedby="[^"]+"`));
    assert.ok(html.includes(`id="${dialog.replace('-dialog','')}-close"`) || html.includes(`id="${command==='helpBasics'?'help-basics-close':'help-privacy-close'}"`));
  }
  assert.ok(html.includes('<th scope="col">Action</th>'));
  assert.ok(html.includes('Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P'));
});

test('Print Studio header is separate from the scrolling body',()=>{
  const html=read('src/index.html'),css=read('src/styles.css');
  const dialog=html.match(/<dialog id="print-lab-dialog"[\s\S]*?<\/dialog>/)?.[0];
  assert.ok(dialog);
  assert.match(dialog,/<div class="utility-heading">[\s\S]*?<\/div>\s*<div class="lab-scroll"/);
  assert.match(dialog,/<div class="lab-scroll"[^>]*role="region"[^>]*tabindex="0"/);
  assert.match(css,/#print-lab-dialog\[open\][^}]*overflow:hidden/);
  assert.match(css,/#print-lab-dialog > \.lab-scroll[^}]*overflow-y:auto/);
  assert.match(css,/#print-lab-dialog > \.utility-heading[^}]*position:static/);
});
