'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeProject,validateProject}=require('../lib/projects');
const {checkedFont,validateFonts}=require('../lib/fonts');
const basic=()=>({format:'tiny-press-1',version:2,name:'A Tiny Press Project',
  paper:{preset:'a5',width:148,height:210,margin:16},pages:[{id:'p1',frames:[
    {id:'f1',type:'text',label:'Copy',html:'<p>Hello</p>',x:10,y:10,w:100,h:50,
      style:{font:'Georgia, serif',fontSize:11,leading:1.45}}
  ]}],stories:{},fonts:[]});
test('legacy Tiny Press projects validate and remain openable',()=>assert.equal(validateProject(basic()).format,'tiny-press-1'));
test('legacy Layout List projects can migrate without changing layout',()=>{
  const doc=basic();doc.format='layout-list-1';delete doc.fonts;
  const result=normalizeProject(doc);
  assert.equal(result.format,'skosh-press-1');assert.equal(result.version,4);
  assert.deepEqual(result.fonts,[]);assert.equal(result.pages[0].frames[0].html,'<p>Hello</p>');
});
test('rejects oversized or malformed frames',()=>{
  const doc=basic();doc.pages[0].frames[0].x=NaN;
  assert.throws(()=>validateProject(doc),/Invalid frame/);
  const bad=basic();bad.pages[0].frames[0].id='f1';bad.pages[0].frames.push({...bad.pages[0].frames[0]});
  assert.throws(()=>validateProject(bad),/Invalid frame/);
});
test('rejects image with remote URL',()=>{
  const doc=basic();doc.pages[0].frames.push({id:'im',type:'image',label:'remote',x:1,y:1,w:10,h:10,src:'https://example.org/a.png'});
  assert.throws(()=>validateProject(doc),/Invalid image/);
});
test('validates uploaded font format by extension and actual header',()=>{
  const raw=Buffer.concat([Buffer.from('00010000','hex'),Buffer.alloc(20)]);
  const font=checkedFont('My Font.ttf',raw);
  assert.equal(font.name,'My Font');assert.match(font.data,/^data:font\/ttf;base64,/);
  assert.throws(()=>checkedFont('My Font.ttf',Buffer.from('wOF2xxxxxxxx')),/Unsupported or invalid font/);
  assert.throws(()=>checkedFont('hack.html',raw),/Unsupported or invalid font/);
});
test('font validation rejects data URL injection and corrupted signatures',()=>{
  const raw=Buffer.concat([Buffer.from('00010000','hex'),Buffer.alloc(12)]);
  const font=checkedFont('Font.ttf',raw);
  const valid={id:'font-123abc',name:'Font',data:font.data};
  assert.equal(validateFonts([valid]).length,1);
  assert.throws(()=>validateFonts([{...valid,data:'data:font/ttf;base64,AAA";url(https://bad.test)'}]),/Invalid embedded font/);
  assert.throws(()=>validateFonts([{...valid,data:'data:font/woff;base64,'+raw.toString('base64')}]),/Invalid embedded font signature/);
});

test('Skosh Press projects validate and overly long object notes are rejected',()=>{
  const doc=basic();doc.format='skosh-press-1';doc.version=3;doc.pages[0].frames[0].note='Change wording';
  assert.equal(validateProject(doc).pages[0].frames[0].note,'Change wording');
  doc.pages[0].frames[0].note='x'.repeat(2001);
  assert.throws(()=>validateProject(doc),/Invalid object note/);
});
