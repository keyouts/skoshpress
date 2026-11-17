'use strict';
// Font Implementation
(function(root,factory){
  const load=typeof module==='object'&&module.exports;
  const api=factory(load?require('./vector-font'):root.SkoshVectorFont,load?require('./pixel-font'):root.SkoshPixelFont);
  if(load)module.exports=api;
  if(root)root.SkoshGlyphComponents=api;
})(typeof window!=='undefined'?window:null,(Vector,Pixel)=>{
  const MAX_COMPONENTS=32,MAX_LINKS=12;
  const ID=/^component-[a-z0-9-]{1,48}$/i;
  const isObject=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
  const isChar=ch=>Pixel.isSupportedChar(ch);
  function valid(components={},links={}){
    if(!isObject(components)||Object.keys(components).length>MAX_COMPONENTS||!isObject(links)||Object.keys(links).length>Pixel.ALL_CHARS.length)return false;
    for(const [id,component] of Object.entries(components)){
      if(!ID.test(id)||!isObject(component)||typeof component.name!=='string'||!component.name.trim()||component.name.length>48||!Vector.valid(component.glyph)||component.glyph.length<1)return false;
    }
    for(const [ch,placements] of Object.entries(links)){
      if(!isChar(ch)||!Array.isArray(placements)||placements.length>MAX_LINKS)return false;
      for(const link of placements){
        if(!isObject(link)||!Object.hasOwn(components,link.id)||!Number.isInteger(link.dx)||!Number.isInteger(link.dy)||link.dx<-700||link.dx>700||link.dy<-900||link.dy>900||!Number.isInteger(link.scale)||link.scale<25||link.scale>200)return false;
      }
    }
    return true;
  }
  function transform(glyph,link){
    const scale=link.scale/100;
    return glyph.map(contour=>contour.map(node=>node.map((n,i)=>Math.round((n*scale+(i%2?link.dy:link.dx))*10)/10)));
  }
  function resolve(base,components={},links=[],strict=true){
    const combined=Vector.copy(base);
    for(const link of links){
      const source=components[link.id];
      if(!source)throw new Error('A linked component is missing.');
      combined.push(...transform(source.glyph,link));
    }
    if(strict&&!Vector.valid(combined))throw new Error('Combined glyph exceeds contour, coordinate, or anchor limits.');
    return combined;
  }
  return Object.freeze({MAX_COMPONENTS,MAX_LINKS,valid,resolve,transform});
});
