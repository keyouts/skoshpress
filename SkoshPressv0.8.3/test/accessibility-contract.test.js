'use strict';
// Accessibility Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
test('accessible names, controls and descriptions reference existing elements',()=>{
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
 for(const match of html.matchAll(/\b(?:aria-labelledby|aria-describedby|aria-controls)="([^"]+)"/g)){
  for(const id of match[1].split(/\s+/))assert.ok(ids.has(id),`Missing accessible reference: ${id}`);
 }
 for(const name of ['page-nav-help','frame-editor-help','frame-image-help','canvas-help','story-editor-help'])assert.ok(ids.has(name),name);
 assert.match(css,/\.sr-only\s*\{[^}]+position:absolute/);
});
test('keyboard editing and dynamic selection retain accessible state',()=>{
 assert.match(app,/aria-keyshortcuts',frame.type==='text'\?'Enter F2 Delete Backspace'/);
 assert.match(app,/event\.key\)\)return;/);
 assert.match(app,/\['Enter','F2'\]\.includes\(event\.key\)/);
 assert.match(app,/aria-current/);
 assert.match(app,/aria-describedby/);
 assert.match(app,/restoreFocus/);
 for(const label of ['Bold selected manuscript text','Italicize selected manuscript text','Underline selected manuscript text'])assert.ok(html.includes(`aria-label="${label}"`));
});

test('template controls keep button semantics within named lists',()=>{
 assert.match(html,/id="builtin-templates"[^>]*role="list"[^>]*aria-label="Built-in layouts"/);
 assert.match(html,/id="user-templates"[^>]*role="list"[^>]*aria-label="Saved layouts"/);
 assert.match(app,/row\.setAttribute\('role','listitem'\)/);
 assert.doesNotMatch(app,/b\.setAttribute\('role','listitem'\)/);
});
test('theme, editing descriptions, and inspector keys remain accessible',()=>{
 assert.match(html,/id="theme-btn"[^>]*aria-label="Dark mode"[^>]*aria-pressed="false"/);
 assert.match(app,/\$\('#theme-btn'\)\.setAttribute\('aria-pressed'/);
 assert.match(html,/id="reflow-btn"[^>]*aria-describedby="reflow-help"/);
 assert.match(html,/id="find-dialog"[^>]*aria-describedby="find-help"/);
 assert.match(html,/role="tablist"[^>]*aria-orientation="horizontal"/);
 for(const name of ['Export publication to PDF','Export saddle-stitch booklet PDF','Insert bulleted list','Insert numbered list'])assert.ok(html.includes(`aria-label="${name}"`));
 assert.match(app,/event\.key==='ArrowRight'/);
 assert.match(app,/event\.key==='ArrowLeft'/);
});

test('screen reader save announcements and focused keyboard shortcuts are guarded',()=>{
 assert.match(html,/id="save-state"[^>]*role="status"[^>]*aria-live="polite"/);
 assert.match(html,/id="canvas-scroll"[^>]*aria-keyshortcuts="Delete Backspace"/);
 assert.match(app,/if\(document\.querySelector\('dialog\[open\]'\)\)return;/);
 assert.match(app,/workspaceFocus && \(e\.key==='Delete'/);
 assert.match(app,/saveState=state\.dirty\?'Unsaved changes\.'/);
 assert.match(app,/restoreCanvasFocus/);
});
