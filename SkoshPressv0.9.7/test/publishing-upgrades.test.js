'use strict';
// Publishing Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {validateProject,normalizeProject}=require('../lib/projects');
const {toEpub,toDocx}=require('../lib/publishing-exports');
const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLmgQAAAABJRU5ErkJggg==';
const frame=(id,label)=>({id,type:'image',label,x:20,y:65,w:45,h:35,src:picture,alt:'A field & flowers <in bloom>',decorative:false});
const doc=()=>({format:'skosh-press-1',version:4,name:'A Garden & <Field>',metadata:{author:'A. & B. Gardener',language:'fr',description:'A short <field> guide',publisher:'Garden Press',rights:'Copyright 2026'},paper:{preset:'a5',width:148,height:210,margin:16,columns:1,gutter:5},stories:{},fonts:[],pages:[{id:'page-1',label:'Cover',frames:[
  {id:'text-1',type:'text',label:'Heading',x:18,y:15,w:100,h:40,html:'<h1>Gardens</h1>',style:{font:'Georgia, serif',fontSize:18,leading:1.3}},
  frame('img-1','Flowers')
]}]});
function entries(zip){
  const files=new Map();let at=0;
  while(at<zip.length && zip.readUInt32LE(at)===0x04034b50){
    const method=zip.readUInt16LE(at+8),size=zip.readUInt32LE(at+18),nameLength=zip.readUInt16LE(at+26),extra=zip.readUInt16LE(at+28);
    const name=zip.subarray(at+30,at+30+nameLength).toString();
    const start=at+30+nameLength+extra,data=zip.subarray(start,start+size);
    files.set(name,method===0?data:zlib.inflateRawSync(data));at=start+size;
  }
  return files;
}
test('publication metadata and image accessibility fields validate strictly',()=>{
  assert.equal(validateProject(doc()).metadata.author,'A. & B. Gardener');
  const excessive=doc();excessive.pages[0].frames[1].alt='a'.repeat(501);
  assert.throws(()=>validateProject(excessive),/Invalid image alternative text/);
  const invalid=doc();invalid.pages[0].frames[1].decorative='yes';
  assert.throws(()=>validateProject(invalid),/decorative image/);
  const badTag=doc();badTag.metadata.language='en"><script>';
  assert.throws(()=>validateProject(badTag),/publication language/);
  const legacy=doc();delete legacy.metadata;
  assert.equal(normalizeProject(legacy).metadata.language,'en');
});
test('EPUB includes semantic image descriptions and book metadata',()=>{
  const files=entries(toEpub(doc()));
  const content=files.get('OEBPS/part-001.xhtml').toString();
  const opf=files.get('OEBPS/content.opf').toString();
  assert.ok(files.has('OEBPS/images/image-0001.png'));
  assert.match(content,/alt="A field &amp; flowers &lt;in bloom&gt;"/);
  assert.match(content,/xml:lang="fr"/);
  assert.match(opf,/<dc:creator>A\. &amp; B\. Gardener<\/dc:creator>/);
  assert.match(opf,/<dc:description>A short &lt;field&gt; guide<\/dc:description>/);
  assert.match(opf,/<dc:language>fr<\/dc:language>/);
  assert.match(opf,/media-type="image\/png"/);
});
test('EPUB identifies decorative images without invented descriptions',()=>{
  const sample=doc();sample.pages[0].frames[1].decorative=true;
  const content=entries(toEpub(sample)).get('OEBPS/part-001.xhtml').toString();
  assert.match(content,/alt="" role="presentation"/);
  assert.doesNotMatch(content,/A field &amp; flowers/);
});
test('DOCX includes core publication details in escaped XML',()=>{
  const files=entries(toDocx(doc()));
  const content=files.get('docProps/core.xml').toString();
  assert.match(content,/<dc:title>A Garden &amp; &lt;Field&gt;<\/dc:title>/);
  assert.match(content,/<dc:creator>A\. &amp; B\. Gardener<\/dc:creator>/);
  assert.match(files.get('_rels/.rels').toString(),/metadata\/core-properties/);
  assert.match(files.get('[Content_Types].xml').toString(),/core-properties\+xml/);
});
