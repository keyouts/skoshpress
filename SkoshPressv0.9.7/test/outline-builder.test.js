'use strict';
// Outline Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const Vector=require('../lib/vector-font');
const Outline=require('../lib/outline-operations');
const {resourcePath}=require('../lib/security');
const {validateProject}=require('../lib/projects');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const rectangle=(x,y,w,h)=>Vector.rectangle(x,y,w,h)[0];
const area=contour=>{
  const ring=Outline.flattened(contour);
  return ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+(a[0]*b[1]-a[1]*b[0])/2;},0);
};
const shape=[rectangle(100,150,280,320),rectangle(260,300,280,320)];
test('union and intersection of crossing contours form single closed valid outlines',()=>{
  const joined=Outline.boolean(shape,0,1,'union'),common=Outline.boolean(shape,0,1,'intersect');
  assert.equal(joined.length,1);assert.equal(common.length,1);
  assert.ok(Math.abs(area(joined[0])-158800)<150);
  assert.ok(Math.abs(area(common[0])-20400)<150);
  assert.ok(Vector.valid(joined)&&Vector.valid(common));
  assert.ok(Vector.path(joined).includes(' C '));
  assert.deepEqual(shape,[rectangle(100,150,280,320),rectangle(260,300,280,320)]);
});
test('subtract B from A preserves remaining shape and other contours',()=>{
  const preserved=rectangle(600,100,75,80),original=[...shape,preserved];
  const result=Outline.boolean(original,0,1,'subtract');
  assert.equal(result.length,2);
  assert.deepEqual(result[0],preserved);
  assert.ok(Math.abs(area(result[1])-69200)<150);
  assert.ok(Vector.valid(result));
});
test('nested shapes retain genuine holes with correct opposite contour winding',()=>{
  const outer=rectangle(100,150,440,510),hole=rectangle(220,260,130,150);
  const result=Outline.boolean([outer,hole],0,1,'subtract');
  assert.equal(result.length,2);assert.ok(area(result[0])>0);assert.ok(area(result[1])<0);
  const included=Outline.boolean([outer,hole],0,1,'intersect');
  assert.equal(included.length,1);assert.ok(Math.abs(area(included[0])-19500)<2);
  const font=Vector.buildTTF({B:result},'Skosh Cutout');
  assert.ok(font.length>1000);
});
test('disjoint contours and impossible requests are deterministic',()=>{
  const separate=[rectangle(50,100,110,100),rectangle(400,300,120,100)];
  assert.equal(Outline.boolean(separate,0,1,'union').length,2);
  assert.equal(Outline.boolean(separate,0,1,'intersect').length,0);
  assert.equal(Outline.boolean(separate,0,1,'subtract').length,1);
  assert.throws(()=>Outline.boolean(shape,0,0,'union'),/different contours/);
  assert.throws(()=>Outline.boolean(shape,0,1,'bad'),/Combine/);
});
test('weighting an ellipse increases or decreases its outline bounds',()=>{
  const original=Vector.ellipse(),grow=Outline.weight(original,25),shrink=Outline.weight(original,-25);
  const limits=ring=>{const p=Outline.flattened(ring);return [Math.min(...p.map(x=>x[0])),Math.max(...p.map(x=>x[0]))];};
  const [left,right]=limits(original[0]),[wleft,wright]=limits(grow[0]),[sleft,sright]=limits(shrink[0]);
  assert.ok(wleft<left&&wright>right);
  assert.ok(sleft>left&&sright<right);
  assert.equal(Vector.valid(grow),true);assert.equal(Vector.valid(shrink),true);
  assert.equal(Outline.weight(original,0).length,1);
  assert.deepEqual(original,Vector.ellipse());
});
test('positive weight expands exterior and contracts a nested counter',()=>{
  const outer=Vector.ellipse(380,465,235,300)[0];
  const inner=Vector.reverse(Vector.ellipse(380,465,110,145),0)[0];
  const input=[outer,inner];const heavier=Outline.weight(input,15);
  assert.equal(heavier.length,2);
  assert.ok(Math.abs(area(heavier[0]))>Math.abs(area(input[0])));
  assert.ok(Math.abs(area(heavier[1]))<Math.abs(area(input[1])));
  assert.ok(area(heavier[0])*area(heavier[1])<0);
  assert.ok(Vector.buildTTF({O:heavier},'Skosh Weight').length>1000);
  assert.throws(()=>Outline.weight(input,90),/−60/);
});
test('outline tools respect selection, limits, validation and offline resource boundaries',()=>{
  const input=[rectangle(100,150,200,350),rectangle(400,150,200,350)];
  const updated=Outline.weight(input,10,0);
  assert.deepEqual(updated[1],input[1]);
  assert.notDeepEqual(updated[0],input[0]);
  assert.throws(()=>Outline.weight(input,20,99),/Select/);
  const root=join(__dirname,'..');
  assert.ok(resourcePath(root,'skosh://app/lib/outline-operations.js'));
  const html=readFileSync(join(root,'src/index.html'),'utf8');
  for(const id of ['studio-weight','studio-weight-apply','studio-boolean-a','studio-boolean-b','studio-boolean-union','studio-boolean-subtract','studio-boolean-intersect'])assert.ok(html.includes(`id="${id}"`),id);
  const doc={format:'skosh-press-1',name:'Font Outlines',paper:{width:148,height:210,margin:16},pages:[{frames:[]}],fonts:[],fontDesigns:[{id:'font-shape',kind:'vector',name:'Edited',glyphs:{O:Outline.weight(Vector.ellipse(),10)}}]};
  assert.equal(validateProject(doc),doc);
});
