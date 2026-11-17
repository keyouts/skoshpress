'use strict';
// Master Compatibility
(function(root,factory){
  const load=typeof module==='object'&&module.exports;
  const api=factory(load?require('./pixel-font'):root.SkoshPixelFont,
    load?require('./vector-font'):root.SkoshVectorFont,
    load?require('./glyph-components'):root.SkoshGlyphComponents);
  if(load)module.exports=api;
  if(root)root.SkoshMasterCompatibility=api;
})(typeof window!=='undefined'?window:null,(Pixel,Vector,Components)=>{
  const masterNames=['Regular','Light','Bold'];
  const pointCount=glyph=>glyph.reduce((count,contour)=>count+contour.length,0);
  const nameOf=ch=>`${ch===' '?'Space':ch==='\u00a0'?'Nonbreaking space':ch==='\u00ad'?'Soft hyphen':ch} (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')})`;
  function characters(design){
    const covered=new Set(Pixel.CHARS);
    for(const face of masterNames){
      const authored=face==='Regular'?design.glyphs:design.variants?.[face]?.glyphs;
      for(const ch of Object.keys(authored||{}))if(Pixel.isSupportedChar(ch))covered.add(ch);
    }
    for(const ch of Object.keys(design.componentLinks||{}))if(Pixel.isSupportedChar(ch))covered.add(ch);
    return Pixel.ALL_CHARS.filter(ch=>covered.has(ch));
  }
  function outline(design,ch,face,template){
    if(!design||!Pixel.isSupportedChar(ch)||!masterNames.includes(face)||typeof template!=='function')throw new Error('Invalid master glyph request.');
    if(face!=='Regular'&&!design.variants?.[face])throw new Error(`${face} master has not been created.`);
    const stored=(face==='Regular'?design.glyphs:design.variants[face].glyphs)?.[ch]??design.glyphs?.[ch];
    const glyph=stored??(design.componentLinks?.[ch]?.length?[]:template(ch));
    if(!Vector.valid(glyph))throw new Error(`${face} has an invalid outline.`);
    return Components.resolve(glyph,design.components||{},design.componentLinks?.[ch]||[]);
  }
  function signedArea(contour){
    let area=0;
    for(let i=0;i<contour.length;i++){
      const a=contour[i],b=contour[(i+1)%contour.length];area+=a[0]*b[1]-b[0]*a[1];
    }
    return area/2;
  }
  function compare(base,other){
    if(base.length!==other.length)return {level:'error',reason:`${other.length} contours; Regular has ${base.length}.`};
    for(let i=0;i<base.length;i++){
      if(base[i].length!==other[i].length)return {level:'error',reason:`Contour ${i+1} has ${other[i].length} anchors; Regular has ${base[i].length}.`};
      const a=signedArea(base[i]),b=signedArea(other[i]);
      if(Math.abs(a)>1&&Math.abs(b)>1&&Math.sign(a)!==Math.sign(b))return {level:'warning',reason:`Contour ${i+1} runs in the opposite direction to Regular; interpolation may distort.`};
    }
    return null;
  }
  // Anchor Correspondence
  function overlay(design,ch,face,template,maxAnchors=220){
    if(!['Light','Bold'].includes(face))throw new Error('Choose the Light or Bold comparison master.');
    const regular=outline(design,ch,'Regular',template),other=outline(design,ch,face,template);
    const issue=compare(regular,other),matches=[],unmatched=[];
    let shown=0;
    for(let ci=0;ci<Math.max(regular.length,other.length);ci++){
      const a=regular[ci]||[],b=other[ci]||[];
      for(let ni=0;ni<Math.max(a.length,b.length);ni++){
        if(shown>=maxAnchors)break;
        if(a[ni]&&b[ni])matches.push({contour:ci,anchor:ni,regular:[a[ni][0],a[ni][1]],other:[b[ni][0],b[ni][1]]});
        else unmatched.push({contour:ci,anchor:ni,side:a[ni]?'Regular':face,position:a[ni]?[a[ni][0],a[ni][1]]:[b[ni][0],b[ni][1]]});
        shown++;
      }
    }
    return {regular,other,matches,unmatched,issue,limited:regular.reduce((n,c)=>n+c.length,0)>maxAnchors||other.reduce((n,c)=>n+c.length,0)>maxAnchors};
  }
  function inspectGlyph(design,ch,template){
    const problems=[],outlines={};
    for(const face of masterNames.filter(name=>name==='Regular'||design.variants?.[name])){
      try{outlines[face]=outline(design,ch,face,template);}
      catch(error){problems.push({face,level:'error',message:error.message});}
    }
    if(outlines.Regular){
      for(const face of ['Light','Bold'].filter(name=>outlines[name])){
        const problem=compare(outlines.Regular,outlines[face]);
        if(problem)problems.push({face,level:problem.level,message:`${face}: ${problem.reason}`});
      }
    }
    const level=problems.some(p=>p.level==='error')?'error':problems.some(p=>p.level==='warning')?'warning':'ok';
    const unchanged=outlines.Bold&&JSON.stringify(outlines.Bold)===JSON.stringify(outlines.Regular);
    return {char:ch,label:nameOf(ch),level,problems,points:outlines.Regular?pointCount(outlines.Regular):0,unchanged:Boolean(unchanged)};
  }
  function inspect(design,template){
    if(!design||typeof design!=='object'||typeof template!=='function')throw new Error('Select an editable font design.');
    const names=masterNames.filter(face=>face==='Regular'||design.variants?.[face]);
    const glyphs=characters(design).map(ch=>inspectGlyph(design,ch,template));
    const errors=glyphs.filter(item=>item.level==='error'),warnings=glyphs.filter(item=>item.level==='warning');
    const missingBold=!design.variants?.Bold;
    const notices=[];
    if(missingBold)notices.push('Create a Bold master before exporting a variable font.');
    if(!missingBold&&glyphs.every(g=>g.unchanged)&&glyphs.length)notices.push('Bold and Regular outlines are identical. The weight axis will not visibly change letter shapes.');
    if(!design.variants?.Light)notices.push('Optional: create a Light master to extend the weight axis to 300.');
    return {ready:!missingBold&&!errors.length,missingBold,faces:names,glyphs,errors,warnings,notices,
      total:glyphs.length,compatible:glyphs.length-errors.length-warnings.length};
  }
  function interpolate(design,ch,weight,template){
    if(!Number.isFinite(weight)||weight<300||weight>700)throw new Error('Preview weight must be between 300 and 700.');
    const base=outline(design,ch,'Regular',template);
    const useLight=weight<400&&Boolean(design.variants?.Light);
    const other=outline(design,ch,useLight?'Light':'Bold',template);
    const issue=compare(base,other);if(issue&&issue.level==='error')throw new Error(issue.reason);
    const start=useLight?300:400,end=useLight?400:700;
    const a=useLight?other:base,b=useLight?base:other;
    const t=Math.max(0,Math.min(1,(weight-start)/(end-start)));
    const mixed=a.map((contour,i)=>contour.map((pt,j)=>pt.map((value,k)=>Math.round((value+(b[i][j][k]-value)*t)*100)/100)));
    if(!Vector.valid(mixed))throw new Error('Interpolated outline is outside the editable coordinate range.');
    return mixed;
  }
  return Object.freeze({characters,outline,compare,inspectGlyph,inspect,interpolate,overlay,nameOf});
});
