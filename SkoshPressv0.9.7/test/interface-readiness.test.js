'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const UI=require('../lib/editor-interface');
const workspace=require('../lib/project-workspace');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('project commands respect the active modal boundary',()=>{
  const first={},second={};
  const doc={querySelectorAll:()=>[]};
  assert.equal(UI.canUseProjectCommand(doc),true);
  doc.querySelectorAll=()=>[first,second];
  assert.equal(UI.activeDialog(doc),second);
  assert.equal(UI.canUseProjectCommand(doc),false);
});
test('workspace searches related keywords as well as command names',()=>{
  const commands=[{label:'Typography Studio',keywords:'font glyph kerning'},{label:'Print Studio',keywords:'paper crop bleed'}];
  assert.deepEqual(workspace.searchCommands(commands,'font kerning'),[commands[0]]);
  assert.deepEqual(workspace.searchCommands(commands,'BLEED'),[commands[1]]);
  assert.deepEqual(workspace.searchCommands(commands,'unknown'),[]);
});
test('ribbon tablist excludes quick controls and help is reachable from the editor',()=>{
  const html=read('src/index.html');
  const tabs=html.match(/<div class="ribbon-tabs"[^>]*>([\s\S]*?)<\/div>/)[1];
  assert.equal((tabs.match(/role="tab"/g)||[]).length,4);
  assert.doesNotMatch(tabs,/toolbar-customize-btn/);
  assert.match(html,/id="help-basics-btn"[^>]*aria-controls="help-basics-dialog"/);
  assert.match(html,/id="workspace-header-close"[^>]*aria-label=/);
  assert.equal((html.match(/class="studio-guide"/g)||[]).length,4);
});
