'use strict';
// Font Variations
(function(root,factory){
  const load=typeof module==='object'&&module.exports;
  const api=factory(load?require('./pixel-font'):root.SkoshPixelFont,load?require('./vector-font'):root.SkoshVectorFont,load?require('./outline-operations'):root.SkoshOutlineOperations,load?require('./glyph-tools'):root.SkoshGlyphTools);
  if(load)module.exports=api;
  if(root)root.SkoshFontVariations=api;
})(typeof window!=='undefined'?window:null,(Pixel,Vector,Outline,GlyphTools)=>{
  const STYLES=Object.freeze(['Regular','Light','Bold','Italic']);
  const OPTIONAL=Object.freeze(STYLES.slice(1));
  function valid(variants){
    if(!variants||typeof variants!=='object'||Array.isArray(variants)||Object.keys(variants).some(key=>!OPTIONAL.includes(key)))return false;
    for(const face of Object.values(variants)){
      if(!face||typeof face!=='object'||Array.isArray(face)||!face.glyphs||typeof face.glyphs!=='object'||Array.isArray(face.glyphs)||Object.keys(face.glyphs).length>Pixel.ALL_CHARS.length)return false;
      for(const [char,glyph] of Object.entries(face.glyphs))if(!Pixel.isSupportedChar(char)||!Vector.valid(glyph))return false;
    }
    return true;
  }
  function weightMaster(glyph,amount){
    const shifted=glyph.map(contour=>contour.map((node,i)=>{
      const before=contour[(i+contour.length-1)%contour.length],after=contour[(i+1)%contour.length];
      const normalize=(x,y)=>{const length=Math.hypot(x,y)||1;return [x/length,y/length];};
      const dx1=node[0]-before[0],dy1=node[1]-before[1],dx2=after[0]-node[0],dy2=after[1]-node[1];
      const n1=normalize(dy1,-dx1),n2=normalize(dy2,-dx2),normal=normalize(n1[0]+n2[0],n1[1]+n2[1]);
      return node.map((n,j)=>Math.round((n+amount*normal[j%2])*10)/10);
    }));
    return Vector.valid(shifted)?shifted:glyph;
  }
  function create(base,style,template){
    if(!OPTIONAL.includes(style)||!base||typeof base!=='object'||Array.isArray(base)||typeof template!=='function')throw new Error('Choose Light, Bold, or Italic.');
    const glyphs={};let simplified=0;
    for(const char of Pixel.ALL_CHARS.filter(ch=>Pixel.CHARS.includes(ch)||Object.hasOwn(base,ch))){
      const original=Vector.copy(base[char]??template(char));
      if(!Vector.valid(original))throw new Error('Invalid Regular outline for '+char+'.');
      if(!original.length){glyphs[char]=[];continue;}
      try{glyphs[char]=style==='Italic'?GlyphTools.transform(original,{slant:11}):weightMaster(original,style==='Bold'?18:-14);}
      catch{
        simplified++;
        try{glyphs[char]=style==='Italic'?original:GlyphTools.transform(original,{width:style==='Bold'?103:97});}
        catch{glyphs[char]=original;}
      }
    }
    return {face:{glyphs},simplified};
  }
  function fontId(designId,style){
    if(!/^font-[a-z0-9-]{1,60}$/i.test(designId)||!STYLES.includes(style))throw new Error('Invalid font face identifier.');
    return style==='Regular'?designId:`${designId}-${style.toLowerCase()}`;
  }
  return Object.freeze({STYLES,OPTIONAL,valid,create,fontId});
});
