'use strict';
// Font Implementation
const Pixel=require('./pixel-font');
const Vector=require('./vector-font');
const Variations=require('./font-variations');
const Components=require('./glyph-components');
function validDesign(d){
  if(!d||typeof d!=='object'||Array.isArray(d)||typeof d.id!=='string'||!/^font-[a-z0-9-]{1,70}$/i.test(d.id)
    ||typeof d.name!=='string'||!d.name.trim()||d.name.length>64||!d.glyphs||typeof d.glyphs!=='object'||Array.isArray(d.glyphs)
    ||Object.keys(d.glyphs).length>Pixel.ALL_CHARS.length||(d.kind!==undefined&&d.kind!=='vector')
    ||(d.kind==='vector'&&!Vector.validMetrics(d))||(d.previewWord!==undefined&&(typeof d.previewWord!=='string'||[...d.previewWord].length>12||![...d.previewWord].every(Pixel.isSupportedChar)))
    ||(d.variants!==undefined&&!Variations.valid(d.variants))
    ||!Components.valid(d.components||{},d.componentLinks||{}))return false;
  for(const [ch,glyph] of Object.entries(d.glyphs)){
    if(!Pixel.isSupportedChar(ch))return false;
    if(d.kind==='vector'?!Vector.valid(glyph):(!Array.isArray(glyph)||glyph.length!==12||glyph.some(row=>typeof row!=='string'||!/^[01]{8}$/.test(row))))return false;
  }
  return true;
}
module.exports={validDesign};
