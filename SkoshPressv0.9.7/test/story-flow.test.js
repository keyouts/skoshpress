'use strict';
// Story Regression
const test=require('node:test');
const assert=require('node:assert/strict');
const {frameChain,reflow}=require('../lib/story-flow');
function book(){
  const html='<h1>Chapter One</h1><p>The <em>first</em> paragraph has <strong>rich</strong> formatting.</p><p>Second paragraph. A &amp; B.</p>';
  const style={font:'Georgia, serif',fontSize:11,leading:1.45};
  const base={id:'body-1',type:'text',label:'Body',storyId:'main',html:'',style,x:12,y:12,w:100,h:75};
  return {format:'skosh-press-1',version:4,name:'Example',paper:{preset:'a5',width:148,height:210,margin:16},
    pages:[{id:'cover',frames:[{...base,id:'cover-title',type:'text',storyId:undefined,html:'<h1>Cover</h1>'}]},
           {id:'body-page',frames:[base]},{id:'back',frames:[]}],
    stories:{main:{id:'main',name:'Chapter One',html,style,geometry:{x:12,y:12,w:100,h:75}}},fonts:[]};
}
const snapshot=d=>JSON.parse(JSON.stringify(d));
function nextId(){return 'id-'+String(++nextId.n);}
nextId.n=0;
test('reflow never turns page fragments into the canonical source',()=>{
  const d=book(),original=d.stories.main.html;
  const chopped=['<h1>Chapter One</h1><p>The <em>first</em></p>','<p> paragraph has <strong>rich</strong></p>','<p> formatting.</p><p>Second paragraph. A &amp; B.</p>'];
  for(let i=0;i<12;i++){
    assert.equal(reflow(d,'main',chopped,nextId),true);
    assert.equal(d.stories.main.html,original);
    assert.equal(frameChain(d,'main').length,3);
  }
  assert.ok(!d.stories.main.html.includes('</p>\n<p>'));
  assert.equal(d.pages[0].frames[0].html,'<h1>Cover</h1>');
});
test('continuation IDs stay stable across the same pagination',()=>{
  const d=book(),parts=['<p>first</p>','<p>second</p>','<p>third</p>'];
  reflow(d,'main',parts,nextId);
  const ids=frameChain(d,'main').map(x=>x.frame.id);
  for(let i=0;i<8;i++){
    reflow(d,'main',parts,nextId);
    assert.deepEqual(frameChain(d,'main').map(x=>x.frame.id),ids);
  }
});
test('reflow can shrink and grow pagination without altering other content',()=>{
  const d=book(),html=d.stories.main.html;
  reflow(d,'main',['a','b','c','d'],nextId);
  const old=frameChain(d,'main').map(x=>x.frame.id);
  reflow(d,'main',['a','b'],nextId);
  assert.deepEqual(frameChain(d,'main').map(x=>x.frame.id),old.slice(0,2));
  assert.equal(d.pages.some(p=>p.autoStory==='main'&&!p.frames.length),false);
  reflow(d,'main',['a','b','c'],nextId);
  assert.deepEqual(frameChain(d,'main').slice(0,2).map(x=>x.frame.id),old.slice(0,2));
  assert.equal(d.stories.main.html,html);
  assert.equal(d.pages[0].frames[0].html,'<h1>Cover</h1>');
  assert.deepEqual(d.pages.at(-1).frames,[]);
});
test('a saved and reopened document retains the canonical source',()=>{
  const d=book();reflow(d,'main',['<p>Part of a</p>','<p> paragraph</p>'],nextId);
  const reopened=snapshot(d);
  assert.equal(reopened.stories.main.html,book().stories.main.html);
  reflow(reopened,'main',[reopened.stories.main.html],nextId);
  assert.equal(reopened.stories.main.html,book().stories.main.html);
});
test('bad pagination output fails before touching the document',()=>{
  const d=book(),before=snapshot(d);
  for(const parts of [[],[null],new Array(451).fill('a')]){
    assert.throws(()=>reflow(d,'main',parts,nextId),/Invalid manuscript pagination/);
    assert.deepEqual(snapshot(d),before);
  }
});
