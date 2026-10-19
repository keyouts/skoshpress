'use strict';
// Security Regression
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {isReadRequest,PRINT_CSP,resourcePath}=require('../lib/security');
const {validateProject}=require('../lib/projects');
const root=path.resolve(__dirname,'..');
const base=()=>({format:'skosh-press-1',name:'Project',paper:{width:148,height:210,margin:16},pages:[{id:'p',frames:[]}],stories:{},fonts:[]});
const textFrame=()=>({id:'frame1',type:'text',label:'Body',html:'<p>Test</p>',x:5,y:8,w:100,h:120,style:{font:'Georgia',fontSize:12,leading:1.4}});
test('internal resource handlers allow reads only',()=>{
  assert.equal(isReadRequest({method:'GET'}),true);
  assert.equal(isReadRequest({method:'HEAD'}),true);
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])assert.equal(isReadRequest({method}),false);
  assert.equal(isReadRequest({}),false);
  assert.ok(resourcePath(root,'skosh://app/src/index.html'));
  assert.match(PRINT_CSP,/frame-ancestors 'none'/);
  const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
  assert.match(main,/session\.defaultSession\.on\?\.\('will-download'/);
  assert.match(main,/app\.on\('certificate-error'/);
  assert.match(main,/app\.on\('login'/);
  assert.match(main,/if\(!isReadRequest\(request\)\)/);
});
test('validates linked manuscript stories before loading them',()=>{
  const doc=base();const frame=textFrame();frame.storyId='story-1';doc.pages[0].frames.push(frame);
  doc.stories['story-1']={id:'story-1',name:'Chapter',html:'<p>Start</p>',style:{font:'Georgia',fontSize:12,leading:1.4},geometry:{x:5,y:8,w:100,h:120}};
  assert.doesNotThrow(()=>validateProject(doc));
  doc.stories['story-1'].geometry.w=Infinity;
  assert.throws(()=>validateProject(doc),/manuscript story/);
  doc.stories['story-1'].geometry.w=100;
  doc.stories['story-1'].html='x'.repeat(5_000_001);
  assert.throws(()=>validateProject(doc),/manuscript story/);
  doc.stories['story-1'].html='<p>Start</p>';
  doc.stories['story-1'].style.fontSize='12px';
  assert.throws(()=>validateProject(doc),/manuscript story/);
});
test('rejects malformed publication images and invalid page geometry',()=>{
  const doc=base(); doc.pages[0].frames.push({...textFrame(),type:'image',src:'data:image/png;base64,'+Buffer.from('not a png but a dangerous file').toString('base64')});
  assert.throws(()=>validateProject(doc),/Invalid image/);
  doc.pages[0].frames=[];doc.paper.margin=80;
  assert.throws(()=>validateProject(doc),/Unsupported or invalid/);
});
test('package description and icon are updated consistently',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  assert.equal(pkg.description,'A publishing application.');
  assert.equal(pkg.author,'KeyOuts');
  assert.equal(pkg.version,lock.version);
  assert.equal(pkg.version,lock.packages[''].version);
  const original=fs.readFileSync(path.join(root,'assets/SkoshPressIcon.png'));
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'a65520c1582cd98f40f2232d845efd94af22fb1bccea0d5c8a5d4badb2b2f49d');
  for(const size of [16,24,32,48,64,128,256,512]){
    const icon=fs.readFileSync(path.join(root,`assets/icon-${size}.png`));
    assert.equal(icon.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(icon.readUInt32BE(16),size);
    assert.equal(icon.readUInt32BE(20),size);
  }
  const ico=fs.readFileSync(path.join(root,'assets/icon.ico'));
  assert.equal(ico.readUInt16LE(2),1);
  assert.ok(ico.readUInt16LE(4)>=6);
  const ui=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
  assert.doesNotMatch(ui,/<img\b/i);
  assert.match(ui,/href="\.\.\/assets\/icon-32\.png"/);
  assert.doesNotMatch(ui,/skosh-press\.svg|toolbar-logo|brand-mark/);
});
test('code comments are two-word guideposts only',()=>{
  const dirs=['lib','src','test'];
  const files=[path.join(root,'main.js'),path.join(root,'preload.js')];
  for(const dir of dirs)for(const file of fs.readdirSync(path.join(root,dir))){
    if(/\.(?:js|css|html)$/.test(file))files.push(path.join(root,dir,file));
  }
  for(const file of files){
    for(const line of fs.readFileSync(file,'utf8').split('\n')){
      const match=line.match(/^\s*(?:\/\/|\/\*|<!--)\s*(.*?)\s*(?:\*\/|-->)?\s*$/);
      if(match){
        const name=match[1].replace(/(?:\*\/|-->)\s*$/,'').trim();
        assert.match(name,/^[A-Za-z]+ [A-Za-z]+$/,`${file}: ${name}`);
      }
    }
  }
});
test('rejects dangling or unsafe story references',()=>{
  const doc=base();const frame=textFrame();frame.storyId='__proto__';doc.pages[0].frames.push(frame);
  assert.throws(()=>validateProject(doc),/Invalid story link/);
  frame.storyId='missing-story';
  assert.throws(()=>validateProject(doc),/Missing manuscript story/);
});
