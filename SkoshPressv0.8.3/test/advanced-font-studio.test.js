'use strict';
// Typography Verification
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Vector=require('../lib/vector-font');
const Spacing=require('../lib/spacing-studio');
const {readTables,glyphs}=require('../lib/ttf-binary');
const {fromTTF,fromNative,toNative}=require('../lib/editable-font');
const {toUFO,fromUFO,zipEntries}=require('../lib/ufo-interchange');
const {buildZip}=require('../lib/font-family-package');
const {generateVariableFont}=require('../lib/variable-font');
const {validDesign}=require('../lib/font-design');
const shape=({x=120,width=480}={})=>Vector.rectangle(x,190,width,530);
const doc=()=>({id:'font-testing-2026',name:'Test Family',kind:'vector',glyphs:{A:shape(),V:shape({x:145,width:390})},spacing:0,advances:{A:780,V:800},kerning:{AV:-90},leftBearings:{A:40},kerningClasses:{left:{Caps:['A']},right:{Diagonal:['V']}},classKerning:{'Caps/Diagonal':-55},variants:{},components:{},componentLinks:{}});
const generate=(d=doc(),style='Regular',glyphA=shape())=>Buffer.from(Vector.buildTTF({...d.glyphs,A:glyphA},d.name,{...d,style},{variableCompatible:true}));
test('pair overrides and class-based kerning export OpenType GPOS and legacy kern',()=>{
 const d=doc();assert.equal(Spacing.kernFor(d,'AV'),-90);delete d.kerning.AV;assert.equal(Spacing.kernFor(d,'AV'),-55);
 const binary=generate(d),tables=readTables(binary);
 assert.ok(tables.has('GPOS'));assert.ok(tables.has('kern'));assert.equal(tables.get('GPOS').readUInt16BE(0),1);
});
test('class validation rejects overlaps, invalid names and excessive combinations',()=>{
 const d=doc();assert.equal(Spacing.valid(d),true);
 d.kerningClasses.left.Caps=['A','A'];assert.equal(Spacing.valid(d),false);
 d.kerningClasses.left.Caps=['A'];d.classKerning['unknown/Diagonal']=20;assert.equal(Spacing.valid(d),false);
});
test('non-destructive sidebearings shift outlines and retain advance',()=>{
 const d=doc(),out=Spacing.resolveSpacing(d.glyphs.A,d,'A');
 assert.equal(out.left,40);assert.equal(out.advance,780);
 const glyf=glyphs(readTables(generate(d)));
 assert.equal(glyf[34].lsb,40);assert.equal(glyf[34].advance,780);
});
test('lossless Skosh editable interchange retains component, class, and master data',()=>{
 const d=doc();assert.equal(validDesign(d),true);
 const restored=fromNative(toNative(d));assert.deepEqual(restored,d);
 assert.throws(()=>fromNative(Buffer.from('{"format":"SkoshFont","version":1,"design":{}}')),/Invalid/);
});
test('TrueType simple-outline import rebuilds editable Bézier glyphs and advances',()=>{
 const source=generate(),result=fromTTF(source,'Editable Test');
 assert.equal(result.design.kind,'vector');assert.equal(result.design.advances.A,780);
 assert.ok(Vector.valid(result.design.glyphs.A));assert.ok(result.imported>=95);
 assert.equal(result.design.name,'Editable Test');
});
test('UFO3 Regular-master export and import roundtrip glyph source',()=>{
 const d=doc(),archive=toUFO(d,d.glyphs),entries=zipEntries(archive),result=fromUFO(archive,'Back');
 assert.ok(entries.has('metainfo.plist'));
 assert.ok(entries.has('glyphs/uni0041.glif'));
 assert.equal(result.design.advances.A,780);
 assert.ok(Vector.valid(result.design.glyphs.A));
});
test('UFO ZIP rejects traversal filenames and oversized entries',()=>{
 assert.throws(()=>buildZip([['../bad.glif',Buffer.alloc(100)]]),/Invalid/);
 const clean=toUFO(doc(),doc().glyphs);const bad=Buffer.from(clean);
 const marker=Buffer.from('glyphs/uni0041.glif'),at=bad.indexOf(marker);
 assert.ok(at>=0);bad.write('..',at,'ascii');
 assert.throws(()=>zipEntries(bad),/Unsafe|Invalid/);
});
test('real variable weights interpolate outlines and advances',()=>{
 const d=doc(),base=generate(d,'Regular',shape()),bold=generate(d,'Bold',shape({x:100,width:530}));
 const output=generateVariableFont({Regular:base,Bold:bold}),tables=readTables(output);
 assert.ok(tables.has('fvar'));assert.ok(tables.has('gvar'));assert.equal(tables.get('fvar').toString('ascii',16,20),'wght');
 assert.equal(tables.get('fvar').readUInt32BE(28),700*65536);
});
test('three-master variable weights support Light and Bold deltas',()=>{
 const d=doc(),output=generateVariableFont({Regular:generate(d),Light:generate(d,'Light',shape({x:135,width:450})),Bold:generate(d,'Bold',shape({x:100,width:525}))});
 assert.equal(readTables(output).get('fvar').readUInt32BE(20),300*65536);
});
test('variable font builder rejects incompatible contour topology',()=>{
 const d=doc(),a=generate(d),b=generate(d,'Bold',[...shape(),...Vector.ellipse(350,440,100,100)]);
 assert.throws(()=>generateVariableFont({Regular:a,Bold:b}),/Incompatible masters/);
});
test('new studio controls are wired to preload and secure IPC only',()=>{
 const root=path.join(__dirname,'..'),ui=fs.readFileSync(path.join(root,'src/index.html'),'utf8'),code=fs.readFileSync(path.join(root,'src/app.js'),'utf8'),preload=fs.readFileSync(path.join(root,'preload.js'),'utf8'),main=fs.readFileSync(path.join(root,'main.js'),'utf8');
 assert.doesNotMatch(ui,/WEIGHT &amp; BOOLEAN SHAPES <span class="studio-word-tag">NEW/);
 for(const id of ['studio-class-save','studio-import-editable','studio-export-editable','studio-export-ufo','studio-export-variable']){
  assert.ok(ui.includes(`id="${id}"`));assert.ok(code.includes(`'#${id}'`));
 }
 for(const name of ['font:importEditable','font:exportEditable','font:exportUFO','font:exportVariable'])assert.ok(preload.includes(name)&&main.includes(name));
});
