'use strict';
// Publishing Studio
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateProject,normalizeProject}=require('../lib/projects');
const Layout=require('../lib/layout-enhancements');
const PixelFont=require('../lib/pixel-font');
const {reflow,frameChain}=require('../lib/story-flow');
const {validateFonts}=require('../lib/fonts');
function document(){
  return {format:'skosh-press-1',version:4,name:'A & B',paper:{preset:'a5',width:148,height:210,margin:16},
    pages:[{id:'page1',masterId:'master-standard',frames:[{id:'f1',type:'text',label:'Body',x:16,y:20,w:116,h:70,
      style:{font:'Georgia, serif',fontSize:11,leading:1.45},styleId:'style-body',html:'<p>Hello world.</p>'}]}],
    textStyles:Layout.defaults(),masters:[{id:'master-standard',name:'Standard',header:'{title}',footer:'{page}/{pages}',pageNumber:true,numberOffset:0}],
    fonts:[],stories:{},fontDesigns:[]};
}
test('named typography styles update linked frame appearance without destroying overrides',()=>{
  const doc=document(),frame=doc.pages[0].frames[0];
  assert.equal(Layout.effective(doc,frame).fontSize,11);
  doc.textStyles[0].style.fontSize=14;
  assert.equal(Layout.effective(doc,frame).fontSize,14);
  delete frame.styleId;
  assert.equal(Layout.effective(doc,frame).fontSize,11);
  assert.equal(validateProject(doc),doc);
});
test('parent page strings substitute dynamic page fields and escape only during rendering',()=>{
  const doc=document();doc.pages.push({id:'page2',masterId:'master-standard',frames:[]});
  assert.deepEqual(Layout.masterParts(doc,1).map(x=>x.text),['A & B','2/2','2']);
  assert.equal(Layout.masterParts(doc,0)[2].align,'right');
  assert.equal(Layout.masterParts(doc,1)[2].align,'left');
  assert.equal(validateProject(doc),doc);
});
test('continuation pages inherit the parent page assignment',()=>{
  const doc=document();const frame=doc.pages[0].frames[0];frame.storyId='story1';
  doc.stories.story1={id:'story1',name:'A story',html:frame.html,style:frame.style,styleId:'style-body',geometry:{x:16,y:20,w:116,h:70}};
  let counter=0;
  reflow(doc,'story1',['<p>A</p>','<p>B</p>','<p>C</p>'],()=>`new-${++counter}`);
  assert.equal(frameChain(doc,'story1').length,3);
  assert.deepEqual(doc.pages.map(page=>page.masterId),['master-standard','master-standard','master-standard']);
  validateProject(doc);
});
test('paragraph boundary preference does not force tiny or zero-length chunks',()=>{
  assert.equal(Layout.preferredBreak(0,120,[105], 'A'.repeat(120)),105);
  assert.equal(Layout.preferredBreak(100,105,[101], 'A'.repeat(150)),105);
  assert.deepEqual(Layout.blockBreaks({childNodes:[{nodeType:1,tagName:'P',textContent:'Hello'},{nodeType:1,tagName:'P',textContent:' world'}]}),[5,11]);
});
test('validates stored editable font glyphs, preventing malformed and oversized designs',()=>{
  const doc=document(),rows=PixelFont.blank();rows[0]='00011000';
  doc.fontDesigns=[{id:'font-pixel1',name:'My Pixel',glyphs:{A:rows}}];
  assert.equal(validateProject(doc),doc);
  const malformed=structuredClone(doc);malformed.fontDesigns[0].glyphs.A[0]='<script>';
  assert.throws(()=>validateProject(malformed),/Invalid typography glyph/);
  const dangling=structuredClone(doc);dangling.pages[0].masterId='master-missing';
  assert.throws(()=>validateProject(dangling),/Missing parent page/);
  const badStyle=structuredClone(doc);badStyle.pages[0].frames[0].styleId='style-nonexistent';
  assert.throws(()=>validateProject(badStyle),/Missing reusable text style/);
});
test('generates valid header and ASCII cmap of an embeddable TrueType typeface',()=>{
  const rows=PixelFont.blank();rows[0]='00111100';rows[1]='01100110';
  const bytes=Buffer.from(PixelFont.buildTTF({A:rows},'Skosh Square'));
  assert.equal(bytes.readUInt32BE(0),0x00010000);
  const tableCount=bytes.readUInt16BE(4),tables={};
  for(let i=0;i<tableCount;i++){
    const off=12+i*16,tag=bytes.toString('ascii',off,off+4);
    tables[tag]={offset:bytes.readUInt32BE(off+8),length:bytes.readUInt32BE(off+12)};
  }
  for(const tag of ['head','hhea','maxp','OS/2','cmap','loca','glyf','hmtx','name','post'])assert.ok(tables[tag],tag);
  assert.equal(tables.head.length,54);
  assert.equal(tables.maxp.length,32);
  assert.equal(bytes.readUInt16BE(tables.maxp.offset+4),96);
  assert.ok(tables.glyf.length>0);
  const checksum=buf=>{let sum=0;for(let i=0;i<buf.length;i+=4){const value=((buf[i]||0)<<24)|((buf[i+1]||0)<<16)|((buf[i+2]||0)<<8)|(buf[i+3]||0);sum=(sum+value)>>>0;}return sum;};
  assert.equal(checksum(bytes),0xB1B0AFBA);
  assert.equal(validateFonts([{id:'font-custom-1',name:'Skosh Square',data:'data:font/ttf;base64,'+bytes.toString('base64')}]).length,1);
});
test('legacy documents normalize safely to the new optional collections',()=>{
  const doc=document();delete doc.masters;delete doc.fontDesigns;delete doc.textStyles;
  delete doc.pages[0].masterId;delete doc.pages[0].frames[0].styleId;
  const migrated=normalizeProject(doc);
  assert.deepEqual(migrated.masters,[]);
  assert.deepEqual(migrated.textStyles,[]);
  assert.deepEqual(migrated.fontDesigns,[]);
});
