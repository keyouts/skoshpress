'use strict';
// Focus Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('document review uses plain-language labels throughout the interface',()=>{
  const html=src('src/index.html'),script=src('src/app.js'),native=src('main.js');
  assert.match(html,/>✓ Check document<\/button>/);
  assert.match(html,/>DOCUMENT CHECKS<\/h2>/);
  assert.match(native,/label:'Check document…'/);
  assert.match(script,/ — Document checks/);
  assert.doesNotMatch(html,/>✓ Preflight<\/button>|PUBLICATION PREFLIGHT/);
});
test('focus toolbar offers quick editing, navigation and an accessible exit',()=>{
  const html=src('src/index.html'),app=src('src/app.js'),css=src('src/styles.css');
  assert.match(html,/id="focus-tools"[^>]*role="toolbar"[^>]*aria-label="Focus view quick tools"/);
  for(const id of ['focus-add-text','focus-add-image','focus-add-page','focus-duplicate','focus-previous-page','focus-next-page','focus-zoom-out','focus-zoom-in','focus-exit']){
    assert.match(html,new RegExp(`id="${id}"`));
    assert.match(app,new RegExp(`onClick\\('#${id}'`));
  }
  assert.match(css,/:root\[data-focus-mode="true"\] \.ribbon \{display:none\}/);
  assert.match(app,/'#focus-tools'\)\.hidden=!enabled/);
  assert.match(app,/event\.key==='ArrowLeft'/);
  assert.match(html,/id="focus-tools-help" class="sr-only"/);
});
test('stronger focus setting covers keyboard and pointer focus with a settings preview',()=>{
  const html=src('src/index.html'),app=src('src/app.js'),css=src('src/styles.css');
  assert.match(html,/id="settings-focus-preview"/);
  assert.match(html,/id="settings-enhanced-focus"[^>]*aria-describedby="settings-focus-help"/);
  assert.match(app,/onClick\('#settings-focus-preview'/);
  assert.match(css,/:is\(:focus,:focus-visible\)/);
  assert.match(css,/:root\[data-enhanced-focus="true"\] \.frame:focus-within/);
  assert.match(css,/outline:5px solid #ffd82e!important/);
});
