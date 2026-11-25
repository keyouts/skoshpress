'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Vector=require('../lib/vector-font');
const Master=require('../lib/master-compatibility');
const Integrity=require('../lib/font-integrity');
const Specimen=require('../lib/type-specimen');
const Security=require('../lib/security');
const rect=(x=100)=>Vector.rectangle(x,200,410,520);
const template=ch=>ch===' '?[]:rect();
const draft=()=>({glyphs:{A:rect(110)},variants:{Bold:{glyphs:{A:rect(105)}}},components:{},componentLinks:{},advances:{},kerning:{}});

test('visual master overlay matches corresponding anchors by contour and index',()=>{
  const result=Master.overlay(draft(),'A','Bold',template);
  assert.equal(result.matches.length,4);
  assert.equal(result.unmatched.length,0);
  assert.equal(result.issue,null);
  assert.deepEqual(result.matches[0].regular,[110,200]);
  assert.deepEqual(result.matches[0].other,[105,200]);
});
test('visual overlay flags nonmatching topology without inventing anchors',()=>{
  const design=draft();design.variants.Bold.glyphs.A[0].pop();
  const result=Master.overlay(design,'A','Bold',template);
  assert.equal(result.issue.level,'error');
  assert.equal(result.matches.length,3);
  assert.equal(result.unmatched.length,1);
  assert.equal(result.unmatched[0].side,'Regular');
  assert.equal(result.unmatched[0].anchor,3);
});
test('overlay caps drawn anchor hints and requires an existing comparison master',()=>{
  assert.throws(()=>Master.overlay(draft(),'A','Light',template),/not been created/);
  const result=Master.overlay(draft(),'A','Bold',template,2);
  assert.equal(result.matches.length,2);
  assert.equal(result.limited,true);
});
test('type specimen exposes standardized Lorem ipsum and alternate proof text',()=>{
  assert.match(Specimen.PRESETS.lorem,/Lorem ipsum dolor sit amet/);
  assert.match(Specimen.PRESETS.pangram,/quick brown fox/);
  assert.match(Specimen.PRESETS.unicode,/ÀÁÂ/);
  assert.match(Specimen.PRESETS.numerals,/0123456789/);
  assert.equal(Specimen.settings({layout:'unexpected',size:999,text:'abc'}).layout,'book');
  assert.equal(Specimen.settings({size:999}).size,92);
  assert.equal(Specimen.clean('x'.repeat(2500)).length,1800);
});
test('specimen Unicode mapping warning honors selected face and ignores ASCII',()=>{
  const design=draft();design.variants.Bold.glyphs['é']=rect();
  assert.deepEqual(Specimen.missing(design,'Aé 🙂','Regular'),['é','🙂']);
  assert.deepEqual(Specimen.missing(design,'Aé','Bold'),[]);
  design.glyphs['é']=rect();
  assert.deepEqual(Specimen.missing(design,'Aé','Regular'),[]);
});
test('specimen canvas renders book, editorial, poster, and glyph page without external dependencies',()=>{
  const operations=[];
  const ctx={
    clearRect(...x){operations.push(['clear',...x]);},fillRect(...x){operations.push(['fillRect',...x]);},
    strokeRect(...x){operations.push(['strokeRect',...x]);},fillText(...x){operations.push(['fillText',...x]);},
    measureText(text){return {width:[...text].length*11};}
  };
  const canvas={getContext:()=>ctx};
  for(const layout of Object.keys(Specimen.LAYOUTS)){
    const info=Specimen.draw(canvas,{layout,size:24,fontFamily:'SkoshProof_1',text:'The quick brown fox jumps over the lazy dog.'});
    assert.equal(info.layout,layout);
    assert.ok(info.linesDrawn>0);
    assert.ok(operations.some(operation=>operation[0]==='fillText'));
  }
});
test('editorial proof flows paragraphs across columns instead of duplicating entire text',()=>{
  const output=[];
  const ctx={clearRect(){},fillRect(){},strokeRect(){},fillText(text,x){output.push({text,x});},measureText(text){return {width:text.length*10};}};
  const canvas={getContext:()=>ctx};
  Specimen.draw(canvas,{layout:'editorial',size:22,text:'A unique single-column sample.'});
  assert.equal(output.filter(item=>item.text.includes('unique')).length,1);
  assert.equal(output.filter(item=>item.x===510).length,0);
});
test('integrity findings expose navigable glyph and face for failed masters',()=>{
  const design=draft();design.variants.Bold.glyphs.A[0].pop();
  const result=Integrity.inspect(design,template);
  assert.equal(result.ready,false);
  assert.ok(result.counts.error>0);
  const issue=result.issues.find(item=>item.code==='master-topology');
  assert.equal(issue.glyph,'A');assert.equal(issue.face,'Bold');
  assert.equal(issue.target,'master');
});
test('integrity distinguishes static export from optional variable prerequisites',()=>{
  const design=draft();delete design.variants.Bold;
  const result=Integrity.inspect(design,template);
  assert.equal(result.ready,true);
  assert.equal(result.counts.error,0);
});
test('specimen and overlays are served from strict resource allowlist with accessible controls',()=>{
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
  const js=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
  assert.equal(Security.RESOURCE_TYPES['/lib/type-specimen.js'],'text/javascript; charset=utf-8');
  assert.ok(html.indexOf('master-compatibility.js')<html.indexOf('font-integrity.js'));
  assert.match(html,/id="studio-master-overlay"[^>]*aria-label=/);
  assert.match(html,/id="studio-specimen-canvas"[^>]*aria-label=/);
  for(const id of ['studio-overlay-face','studio-overlay-nodes','studio-overlay-links','studio-specimen-preset','studio-specimen-layout','studio-specimen-face','studio-specimen-text','studio-integrity-filter']){
    assert.ok(html.includes(`id="${id}"`));assert.ok(js.includes(`'#${id}'`));
  }
  assert.match(js,/new FontFace\(/);
  assert.match(js,/function renderMasterOverlay/);
  assert.match(js,/function refreshSpecimen/);
  assert.match(js,/function goToIntegrityIssue/);
});
