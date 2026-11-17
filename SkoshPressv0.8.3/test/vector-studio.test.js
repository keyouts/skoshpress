'use strict';
// Vector Regression
const test=require('node:test');
const assert=require('node:assert/strict');
const Vector=require('../lib/vector-font');
const {validateProject}=require('../lib/projects');
const {resourcePath}=require('../lib/security');

const doc=()=>({format:'skosh-press-1',name:'Curves',paper:{width:148,height:210,margin:16},pages:[{id:'page-one',frames:[]}],fonts:[],fontDesigns:[]});

test('ellipse contours create actual on-curve and off-curve font outline points',()=>{
  const ellipse=Vector.ellipse(),contours=Vector.toQuadratic(ellipse);
  assert.equal(Vector.valid(ellipse),true);
  assert.equal(contours.length,1);
  assert.ok(contours[0].some(point=>point.on===false));
  assert.ok(contours[0].some(point=>point.on===true));
  const bytes=Buffer.from(Vector.buildTTF({O:ellipse},'Studio Curves'));
  assert.equal(bytes.readUInt32BE(0),0x10000);
  const tables={};for(let i=0;i<bytes.readUInt16BE(4);i++){
    const off=12+16*i;tables[bytes.toString('ascii',off,off+4)]={offset:bytes.readUInt32BE(off+8),length:bytes.readUInt32BE(off+12)};
  }
  assert.equal(bytes.readUInt16BE(tables.maxp.offset+4),96);
  assert.ok(tables.glyf.length>0);
});

test('splitting a cubic curve preserves its geometry and contour shape',()=>{
  const original=Vector.ellipse();
  const split=Vector.split(original,0,0,.5);
  assert.equal(original[0].length,4);
  assert.equal(split[0].length,5);
  const [start,inserted,end]=split[0];
  assert.ok(Math.abs(inserted[0]-((original[0][0][0]+original[0][1][0])/2))<300);
  assert.deepEqual(end.slice(0,2),original[0][1].slice(0,2));
  assert.ok(Vector.path(split).includes(' C '));
});

test('holes can use reversed inner contours',()=>{
  const inner=Vector.ellipse(380,465,140,190),outer=Vector.ellipse();
  const hole=Vector.reverse(inner,0),font=[...outer,...hole];
  assert.equal(Vector.valid(font),true);
  assert.equal(Vector.toQuadratic(font).length,2);
  assert.deepEqual(hole[0][0].slice(2,4),inner[0][3].slice(4,6));
});

test('project retains vector designs and rejects malformed cubic handles',()=>{
  const project=doc(),glyph=Vector.ellipse();
  project.fontDesigns=[{kind:'vector',id:'font-test-vector',name:'Studio Vectors',glyphs:{O:glyph}}];
  assert.equal(validateProject(project),project);
  const bad=structuredClone(project);bad.fontDesigns[0].glyphs.O[0][0][4]=Infinity;
  assert.throws(()=>validateProject(bad),/Invalid typography glyph/);
  const oversize=structuredClone(project);oversize.fontDesigns[0].glyphs.O=Array(30).fill(glyph[0]);
  assert.throws(()=>validateProject(oversize),/Invalid typography glyph/);
});

test('bitmap outlines are traced to editable cubic paths without dependencies',()=>{
  const w=64,h=64,bits=new Uint8Array(w*h);
  for(let y=8;y<56;y++)for(let x=8;x<56;x++)if(Math.hypot(x-32,y-32)<23&&Math.hypot(x-32,y-32)>10)bits[y*w+x]=1;
  const traced=Vector.traceBitmap(bits,w,h);
  assert.equal(Vector.valid(traced),true);
  assert.equal(traced.length,2);
  assert.ok(traced[0].some(p=>p[0]!==p[4]||p[1]!==p[5]));
});

test('new vector engine is included in the secure application resource allowlist',()=>{
  const result=resourcePath(require('node:path').resolve(__dirname,'..'),'skosh://app/lib/vector-font.js');
  assert.ok(result&&result.target.endsWith('vector-font.js'));
});
