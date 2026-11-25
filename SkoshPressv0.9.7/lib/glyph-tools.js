'use strict';
// Geometry Tools
(function(root,factory){
  const vector=typeof module==='object'&&module.exports?require('./vector-font'):root.SkoshVectorFont;
  const api=factory(vector);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshGlyphTools=api;
})(typeof window!=='undefined'?window:null,Vector=>{
  const round=x=>Math.round(x*10)/10;
  function bounds(glyph){
    if(!Vector.valid(glyph))throw new Error('Invalid glyph.');
    const coords=glyph.flatMap(contour=>contour.map(a=>[a[0],a[1]]));
    if(!coords.length)return null;
    return {left:Math.min(...coords.map(p=>p[0])),right:Math.max(...coords.map(p=>p[0])),top:Math.min(...coords.map(p=>p[1])),bottom:Math.max(...coords.map(p=>p[1]))};
  }
  function commit(glyph){if(!Vector.valid(glyph))throw new Error('Transformation exceeds the editable glyph area. Try a smaller value.');return glyph;}
  function map(glyph,convert,contourIndex=null){
    if(!Vector.valid(glyph))throw new Error('Invalid glyph.');
    const result=Vector.copy(glyph);
    const indices=contourIndex===null?result.map((_,i)=>i):[contourIndex];
    for(const i of indices){
      if(!result[i])throw new Error('Choose a contour first.');
      result[i]=result[i].map(anchor=>{
        const next=[];
        for(let j=0;j<6;j+=2){const pos=convert(anchor[j],anchor[j+1]);next.push(round(pos[0]),round(pos[1]));}
        return next;
      });
    }
    return commit(result);
  }
  function transform(glyph,options={},contourIndex=null){
    const {width=100,height=100,slant=0,rotation=0}=options;
    if(![width,height,slant,rotation].every(Number.isFinite)||width<50||width>160||height<50||height>160||Math.abs(slant)>25||Math.abs(rotation)>45)throw new Error('Invalid transform: width and height 50–160%, slant ±25°, rotation ±45°.');
    const scope=contourIndex===null?glyph:(glyph[contourIndex]?[glyph[contourIndex]]:[]),rect=bounds(scope);
    if(!rect)return Vector.copy(glyph);
    const cx=(rect.left+rect.right)/2,cy=(rect.top+rect.bottom)/2;
    const c=Math.cos(rotation*Math.PI/180),s=Math.sin(rotation*Math.PI/180),k=Math.tan(slant*Math.PI/180);
    return map(glyph,(x,y)=>{
      let nx=(x-cx)*width/100,ny=(y-cy)*height/100;
      const rx=nx*c-ny*s,ry=nx*s+ny*c;
      return [cx+rx+k*(800-(cy+ry)),cy+ry];
    },contourIndex);
  }
  function centerGlyph(glyph,advance=780){
    if(!Number.isFinite(advance)||advance<200||advance>1550)throw new Error('Invalid advance width.');
    const rect=bounds(glyph);if(!rect)return Vector.copy(glyph);
    const offset=(advance-(rect.left+rect.right))/2;
    return map(glyph,(x,y)=>[x+offset,y]);
  }
  function alignContour(glyph,index,target='baseline'){
    const ring=glyph[index];if(!ring)throw new Error('Select a contour first.');
    const rect=bounds([ring]),delta=target==='baseline'?800-rect.bottom:target==='cap'?120-rect.top:NaN;
    if(!Number.isFinite(delta))throw new Error('Invalid alignment guide.');
    return map(glyph,(x,y)=>[x,y+delta],index);
  }
  function duplicateContour(glyph,index){
    if(!Vector.valid(glyph)||!glyph[index])throw new Error('Select a contour first.');
    if(glyph.length>=Vector.MAX_CONTOURS)throw new Error('Contour limit reached.');
    const result=Vector.copy(glyph);
    const extra=map([result[index]],(x,y)=>[x+24,y+24])[0];
    result.splice(index+1,0,extra);return commit(result);
  }
  function snap(number,step){return Math.round(number/step)*step;}
  function snapPoint(x,y,step=20){if(![10,20,40].includes(step))throw new Error('Invalid snap grid.');return [snap(x,step),snap(y,step)];}
  return Object.freeze({bounds,map,transform,centerGlyph,alignContour,duplicateContour,snapPoint});
});
