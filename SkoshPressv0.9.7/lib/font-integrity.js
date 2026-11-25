'use strict';
// Font Implementation
(function(root,factory){
  const load=typeof module==='object'&&module.exports;
  const api=factory(load?require('./pixel-font'):root.SkoshPixelFont,load?require('./vector-font'):root.SkoshVectorFont,load?require('./glyph-components'):root.SkoshGlyphComponents,load?require('./font-variations'):root.SkoshFontVariations,load?require('./spacing-studio'):root.SkoshSpacingStudio,load?require('./master-compatibility'):root.SkoshMasterCompatibility);
  if(load)module.exports=api;
  if(root)root.SkoshFontIntegrity=api;
})(typeof window!=='undefined'?window:null,(Pixel,Vector,Components,Variations,Spacing,Master)=>{
  function inspect(design,template=null){
    const issues=[];
    const add=(level,message,details={})=>issues.push({level,message,...details});
    if(!design||!Vector.validMetrics(design)){add('error','Font metrics or OpenType features are invalid.');return {ready:false,issues,counts:{error:1,warning:0,notice:0},coverage:0,capacity:Pixel.ALL_CHARS.length};}
    if(design.variants!==undefined&&!Variations.valid(design.variants))add('error','A font-family face contains invalid outlines.');
    if(!Components.valid(design.components||{},design.componentLinks||{}))add('error','A reusable component or its placement is invalid.');
    const classCount=Object.keys(design.classKerning||{}).length;
    let expandedPairs=0;
    try{expandedPairs=Object.keys(Spacing.expand(design)).length;}
    catch(error){add('error',error.message);}
    if(classCount)add('notice',`${classCount} kerning class pairs expand to ${expandedPairs} OpenType GPOS pair adjustments.`);
    if(design.variants?.Bold)add('notice','Bold master is available for a wght variable export. Compatible contours and nodes are checked at export.');
    if(design.variants?.Light&&!design.variants?.Bold)add('notice','A Bold master is required to export a variable weight axis.');
    const unicode=Pixel.EXTENDED_CHARS.filter(ch=>Object.hasOwn(design.glyphs||{},ch)||(design.componentLinks?.[ch]?.length>0));
    for(const [ch,glyph] of Object.entries(design.glyphs||{})){
      if(!Pixel.isSupportedChar(ch)||!Vector.valid(glyph))add('error',`U+${ch.codePointAt(0).toString(16).toUpperCase()} has an invalid outline.`,{glyph:ch,code:'invalid-outline',target:'glyph'});
    }
    if(!Object.keys(design.glyphs||{}).length&&!Object.keys(design.componentLinks||{}).length)add('notice','No manually drawn glyphs yet. ASCII will use traced starter templates on export.');
    for(const pair of Object.keys(design.kerning||{})){
      for(const ch of [...pair]){
        if(Pixel.EXTENDED_CHARS.includes(ch)&&!unicode.includes(ch)){
          add('warning',`Kerning pair ${pair} includes an unbuilt Unicode glyph; the pair will not be exported until the glyph is authored.`,{glyph:ch,code:'unbuilt-kern-glyph',target:'glyph'});
          break;
        }
      }
    }
    if(!unicode.length)add('warning','No extended characters are authored. Accents and symbols will not be mapped in exports until drawn.');
    else if(unicode.length<Pixel.EXTENDED_CHARS.length)add('notice',`${unicode.length} extended characters are authored; unedited extended characters will remain unmapped.`);
    if(!Object.hasOwn(design.glyphs||{},' '))add('notice','Space will use the default advance width.');
    if((design.spacing||0)>200||(design.spacing||0)<-160)add('warning','Global letter spacing is unusually large. Proof paragraphs before publishing.');
    for(const [ch,width] of Object.entries(design.advances||{}))if(width<400||width>1100)add('notice',`Advance width for ${ch} is ${width} units; check the line rhythm.`,{glyph:ch,code:'advance-width',target:'spacing'});
    for(const [ch,left] of Object.entries(design.leftBearings||{})){
      if(!Pixel.isSupportedChar(ch))continue;
      try{
        const base=Components.resolve(design.glyphs?.[ch]||[],design.components||{},design.componentLinks?.[ch]||[],false);
        if(!Vector.valid(Spacing.resolveSpacing(base,design,ch).glyph))add('error',`Left sidebearing for ${ch} moves an outline outside the editor range.`,{glyph:ch,code:'sidebearing-range',target:'spacing'});
      }catch{add('error',`Sidebearing cannot be applied to ${ch}.`,{glyph:ch,code:'sidebearing-invalid',target:'spacing'});}
    }
    for(const [ch,links] of Object.entries(design.componentLinks||{})){
      if(!Pixel.isSupportedChar(ch))continue;
      try{Components.resolve(design.glyphs?.[ch]||[],design.components||{},links);}
      catch{add('error',`Linked components do not fit the editable outline limits for ${ch}.`,{glyph:ch,code:'component-fit',target:'components'});}
    }
    const faces=['Regular',...['Light','Bold','Italic'].filter(s=>design.variants?.[s])];
    if(design.variants?.Bold&&typeof template==='function'){
      try{
        const review=Master.inspect(design,template);
        for(const item of review.glyphs){
          for(const problem of item.problems){
            add(problem.level,`Variable master ${problem.face}, ${item.label}: ${problem.message}`,{
              glyph:item.char,face:problem.face,target:'master',code:'master-topology'
            });
          }
        }
      }catch(error){add('error',`Variable master review failed: ${error.message}`,{target:'master',code:'master-review'});}
    }
    const counts={error:issues.filter(i=>i.level==='error').length,warning:issues.filter(i=>i.level==='warning').length,notice:issues.filter(i=>i.level==='notice').length};
    return {ready:counts.error===0,issues,counts,coverage:Pixel.CHARS.length+unicode.length,capacity:Pixel.ALL_CHARS.length,extended:unicode.length,faces,expandedPairs,classCount};
  }
  return Object.freeze({inspect});
});
