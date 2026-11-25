'use strict';
(function(root,factory){
  const load=typeof module==='object'&&module.exports;
  const api=factory(load?require('./pixel-font'):root.SkoshPixelFont,load?require('./vector-font'):root.SkoshVectorFont,load?require('./glyph-components'):root.SkoshGlyphComponents,load?require('./glyph-tools'):root.SkoshGlyphTools,load?require('./spacing-studio'):root.SkoshSpacingStudio);
  if(load)module.exports=api;if(root)root.SkoshTypeWorkbench=api;
})(typeof window!=='undefined'?window:null,(Pixel,Vector,Components,Tools,Spacing)=>{
  const own=(o,k)=>Object.hasOwn(o||{},k);
  const round=n=>Math.round(n*10)/10;
  function authored(d,ch,face='Regular'){
    return own(d.glyphs,ch)||own(d.variants?.[face]?.glyphs,ch)||!!d.componentLinks?.[ch]?.length;
  }
  function search(d,query='',group='all',state='all',face='Regular'){
    const term=String(query).trim().toUpperCase();
    const hex=/^U\+([0-9A-F]{1,4})$/.exec(term);
    const chars=group==='all'?Pixel.ALL_CHARS:Pixel.REPERTOIRE.find(([name])=>name===group)?.[1]||[];
    return chars.filter(ch=>(state==='all'||(state==='authored')===authored(d,ch,face))&&(!term||(hex?ch.charCodeAt(0)===parseInt(hex[1],16):ch.toUpperCase().includes(term))));
  }
  function selection(text){
    const chars=[...new Set([...String(text)].filter(ch=>ch!=='\n'&&ch!=='\r'&&ch!=='\t'))];
    if(!chars.length||chars.length>64||chars.some(ch=>!Pixel.isSupportedChar(ch)))throw new Error('Choose 1–64 supported characters.');
    return chars;
  }
  function bounds(glyph){
    const nodes=glyph.flat();if(!nodes.length)throw new Error('The source outline is empty.');
    const xs=nodes.flatMap(n=>[n[0],n[2],n[4]]),ys=nodes.flatMap(n=>[n[1],n[3],n[5]]);
    return {left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
  }
  const below=new Set([0x316,0x317,0x318,0x319,0x31c,0x31d,0x31e,0x31f,0x320,0x323,0x324,0x325,0x326,0x327,0x328,0x329,0x32a,0x32b,0x32c,0x32d,0x32e,0x32f,0x330,0x331,0x332]);
  const equivalents={0x300:'`',0x301:'´',0x302:'^',0x303:'~',0x304:'¯',0x306:'˘',0x307:'˙',0x308:'¨',0x30a:'°',0x30b:'˝',0x30c:'ˇ',0x323:'.',0x327:'¸',0x328:'˛'};
  function compose(ch,lookup,gap=24){
    if(!Pixel.isSupportedChar(ch)||!Number.isFinite(gap)||gap<0||gap>100)throw new Error('Invalid accent composition settings.');
    const [base,...marks]=[...ch.normalize('NFD')];
    if(!marks.length||marks.some(m=>!/^\p{M}$/u.test(m)))throw new Error('This character has no supported canonical accent decomposition.');
    const glyph=Vector.copy(lookup(base));if(!Vector.valid(glyph))throw new Error('Invalid base outline.');
    const b=bounds(glyph);let top=b.top,bottom=b.bottom;
    for(const mark of marks){
      const cp=mark.charCodeAt(0),source=lookup(mark,equivalents[cp]);
      if(!Vector.valid(source))throw new Error('Invalid accent outline.');
      const m=bounds(source),scale=Math.min(1,Math.max(1,(b.right-b.left)*.65)/Math.max(1,m.right-m.left),110/Math.max(1,m.bottom-m.top));
      const x=(b.left+b.right)/2-(m.left+m.right)*scale/2;
      const under=below.has(cp),y=under?bottom+gap-m.top*scale:top-gap-m.bottom*scale;
      glyph.push(...source.map(c=>c.map(n=>n.map((v,i)=>round(v*scale+(i%2?y:x))))));
      if(under)bottom=y+m.bottom*scale;else top=y+m.top*scale;
    }
    if(!Vector.valid(glyph))throw new Error('Composed accents exceed the editable area. Adjust the source outlines or gap.');
    return glyph;
  }
  function batch(d,chars,operation,options,lookup,face='Regular'){
    chars=selection(chars.join(''));const next=JSON.parse(JSON.stringify(d));
    if(face!=='Regular'&&!next.variants?.[face])throw new Error('Create the selected master first.');
    const dest=face==='Regular'?next.glyphs:next.variants[face].glyphs;
    next.advances??={};next.leftBearings??={};next.kerning??={};
    for(const ch of chars){
      if(operation==='advance')next.advances[ch]=options.value;
      else if(operation==='bearing')next.leftBearings[ch]=options.value;
      else if(operation==='kern'){
        if(!Pixel.isSupportedChar(options.right))throw new Error('Choose a supported right-hand character.');
        if(!Number.isInteger(options.value)||Math.abs(options.value)>400)throw new Error('Kerning must be an integer from −400 to 400.');
        next.kerning[ch+options.right]=options.value;
      }else if(operation==='center')dest[ch]=Tools.centerGlyph(lookup(ch,face),Vector.advanceFor(next,ch));
      else if(operation==='copy')dest[ch]=Vector.copy(lookup(ch,'Regular'));
      else if(operation==='compose'){
        if(next.componentLinks?.[ch]?.length)throw new Error('Remove existing linked placements before composing '+ch+'.');
        dest[ch]=compose(ch,(part,fallback)=>lookup(part,face,fallback),options.gap??24);
      }else throw new Error('Unknown batch operation.');
      if(['compose','copy','center'].includes(operation))Components.resolve(dest[ch],next.components,next.componentLinks?.[ch]||[]);
      if(own(dest,ch)&&!Vector.valid(dest[ch]))throw new Error('Invalid outline for '+ch+'.');
      if(operation==='bearing'&&!Vector.valid(Spacing.resolveSpacing(Components.resolve(lookup(ch,face),next.components,next.componentLinks?.[ch]||[]),next,ch).glyph))throw new Error('Sidebearing moves '+ch+' outside the editable area.');
    }
    if(!Vector.validMetrics(next))throw new Error('Batch settings exceed font metric limits.');
    return next;
  }
  function splitAt(glyph,ci,ni,t=.5){
    if(!Vector.valid(glyph)||!glyph[ci]?.[ni]||!Number.isFinite(t)||t<.05||t>.95)throw new Error('Choose an anchor and a split between 5 and 95 percent.');
    const result=Vector.copy(glyph),ring=result[ci],a=ring[ni],b=ring[(ni+1)%ring.length];
    const mix=(p,q)=>[round(p[0]+(q[0]-p[0])*t),round(p[1]+(q[1]-p[1])*t)];
    const p0=a.slice(0,2),p1=a.slice(4,6),p2=b.slice(2,4),p3=b.slice(0,2),q0=mix(p0,p1),q1=mix(p1,p2),q2=mix(p2,p3),r0=mix(q0,q1),r1=mix(q1,q2),s=mix(r0,r1);
    a.splice(4,2,...q0);b.splice(2,2,...q2);ring.splice(ni+1,0,[...s,...r0,...r1]);
    if(!Vector.valid(result))throw new Error('The contour has reached its anchor limit.');return result;
  }
  return Object.freeze({authored,search,selection,compose,batch,splitAt});
});
