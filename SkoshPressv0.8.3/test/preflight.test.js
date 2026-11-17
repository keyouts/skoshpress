'use strict';
// Preflight Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const {audit,imageDimensions}=require('../lib/preflight');
const png=(width,height)=>{
  const data=Buffer.alloc(32);
  Buffer.from('89504e470d0a1a0a','hex').copy(data);
  data.writeUInt32BE(width,16);data.writeUInt32BE(height,20);
  return 'data:image/png;base64,'+data.toString('base64');
};
const document=()=>({name:'A Field Guide',metadata:{author:'An Editor',language:'en',description:'A useful field guide'},paper:{width:148,height:210},pages:[{frames:[
  {id:'title',type:'text',label:'Title',x:12,y:10,w:90,h:30,style:{fontSize:21},html:'<h1>Field guide</h1>'},
  {id:'body',type:'text',label:'Body',x:12,y:50,w:115,h:50,style:{fontSize:11},html:'<p>Important research.</p>'},
  {id:'photo',type:'image',label:'Diagram',x:12,y:108,w:70,h:60,alt:'',src:png(800,800)}
]}]});
test('publication preflight finds missing descriptions and links issues to frames',()=>{
  const result=audit(document());
  assert.equal(result.errors,1);
  assert.equal(result.ready,false);
  assert.ok(result.issues.some(issue=>issue.frameId==='photo' && issue.page===0 && issue.category==='accessibility'));
  assert.equal(result.words,4);
  assert.equal(result.images,1);
});
test('decorative artwork is exempt and well described images pass',()=>{
  const doc=document();doc.pages[0].frames[2].decorative=true;
  assert.equal(audit(doc).errors,0);
  doc.pages[0].frames[2].decorative=false;doc.pages[0].frames[2].alt='A drawing of the landscape';
  assert.equal(audit(doc).errors,0);
});
test('page edges, small type and visible overflow are reported',()=>{
  const doc=document();doc.pages[0].frames[2].alt='Illustration';
  doc.pages[0].frames[1].x=100;doc.pages[0].frames[1].style.fontSize=8;
  const result=audit(doc,{overflowIds:['body']});
  for(const title of ['Object outside page','Small body type','Text overflows frame'])assert.ok(result.issues.some(issue=>issue.title===title),title);
  assert.equal(result.errors,2);
});
test('effective print resolution can be read from image dimensions',()=>{
  assert.deepEqual(imageDimensions(png(640,480)),{width:640,height:480,format:'png'});
  const doc=document();doc.pages[0].frames[2].alt='Portrait';doc.pages[0].frames[2].src=png(80,80);
  assert.ok(audit(doc).issues.some(issue=>issue.category==='print' && /Low image resolution/.test(issue.title)));
  assert.equal(imageDimensions('https://example.invalid/image.png'),null);
});
test('publication metadata and absent heading suggestions are actionable',()=>{
  const doc=document();doc.metadata={};doc.name='Untitled Publication';
  doc.pages[0].frames[0].html='<p>Opening section</p>';
  const result=audit(doc);
  assert.ok(result.issues.some(issue=>issue.title==='Author not specified'));
  assert.ok(result.issues.some(issue=>issue.title==='Language not specified'));
  assert.ok(result.issues.some(issue=>issue.title==='No document headings'));
});
