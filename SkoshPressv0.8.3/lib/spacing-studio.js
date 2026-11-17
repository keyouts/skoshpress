'use strict';
(function(root,factory){
  const load=typeof module==='object'&&module.exports;
  const api=factory(load?require('./pixel-font'):root.SkoshPixelFont);
  if(load)module.exports=api;if(root)root.SkoshSpacingStudio=api;
})(typeof window!=='undefined'?window:null,Pixel=>{
  const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const CLASS=/^[A-Za-z][A-Za-z0-9_-]{0,23}$/;
  function valid(metrics={}){
    if(!object(metrics))return false;
    const bearings=metrics.leftBearings??{};
    if(!object(bearings)||Object.keys(bearings).length>Pixel.ALL_CHARS.length)return false;
    for(const [ch,val] of Object.entries(bearings))if(!Pixel.isSupportedChar(ch)||!Number.isInteger(val)||val<-300||val>450)return false;
    const groups=metrics.kerningClasses??{left:{},right:{}};
    if(!object(groups)||Object.keys(groups).some(x=>!['left','right'].includes(x)))return false;
    for(const side of ['left','right']){
      const set=groups[side]??{};if(!object(set)||Object.keys(set).length>16)return false;
      const seen=new Set();
      for(const [name,chars] of Object.entries(set)){
        if(!CLASS.test(name)||!Array.isArray(chars)||chars.length<1||chars.length>48)return false;
        for(const ch of chars){if(!Pixel.isSupportedChar(ch)||seen.has(ch))return false;seen.add(ch);}
      }
    }
    const pairs=metrics.classKerning??{};
    if(!object(pairs)||Object.keys(pairs).length>128)return false;
    for(const [key,val] of Object.entries(pairs)){
      const parts=key.split('/');
      if(parts.length!==2||!own(groups.left??{},parts[0])||!own(groups.right??{},parts[1])||!Number.isInteger(val)||val<-400||val>400)return false;
    }
    try{const expanded=expand(metrics);if(Object.keys(expanded).length>2500)return false;}catch{return false;}
    return true;
  }
  function expand(metrics={}){
    const result=Object.create(null),groups=metrics.kerningClasses??{};
    for(const [key,value] of Object.entries(metrics.classKerning??{})){
      const [l,r]=key.split('/'),left=groups.left?.[l]??[],right=groups.right?.[r]??[];
      for(const a of left)for(const b of right)if(value!==0)result[a+b]=value;
    }
    for(const [key,value] of Object.entries(metrics.kerning??{})){
      if(value===0)delete result[key];else result[key]=value;
    }
    if(Object.keys(result).length>2500)throw new Error('Kerning exceeds 2,500 expanded pairs; narrow your classes.');
    return result;
  }
  function kernFor(metrics={},pair){return own(metrics.kerning??{},pair)?metrics.kerning[pair]:expand(metrics)[pair]??0;}
  function bounds(glyph=[]){
    const xs=glyph.flatMap(c=>c.flatMap(a=>[a[0],a[2],a[4]]));
    return xs.length?{min:Math.min(...xs),max:Math.max(...xs)}:{min:0,max:0};
  }
  function resolveSpacing(glyph=[],metrics={},ch){
    const ink=bounds(glyph),shift=(metrics.leftBearings?.[ch]??Math.round(ink.min))-ink.min;
    const advance=Math.max(200,Math.min(1550,(metrics.advances?.[ch]??780)+(metrics.spacing??0)));
    return {glyph:glyph.map(c=>c.map(a=>a.map((n,i)=>Math.round((n+(i%2===0?shift:0))*10)/10))),left:ink.min+shift,right:advance-(ink.max+shift),advance};
  }
  return Object.freeze({valid,expand,kernFor,bounds,resolveSpacing});
});
