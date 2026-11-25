'use strict';
// Word Spacing
(function(root,factory){
  const load=typeof module==='object'&&module.exports;
  const Font=load?require('./vector-font'):root.SkoshVectorFont;
  const Pixel=load?require('./pixel-font'):root.SkoshPixelFont;
  const api=factory(Font,Pixel);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshTypeWorkspace=api;
})(typeof window!=='undefined'?window:null,(Font,Pixel)=>{
  const MAX_WORD=12;
  const isChar=Pixel.isSupportedChar;
  const cleanWord=input=>String(input??'').split('').filter(isChar).slice(0,MAX_WORD).join('');
  function layout(input,metrics={}){
    const word=cleanWord(input),positions=[];
    let x=80;
    for(let i=0;i<word.length;i++){
      const char=word[i],previous=i?word[i-1]:null;
      if(previous)x+=Font.kernFor(metrics,previous+char);
      const pair=previous?previous+char:null;
      positions.push({index:i,char,x,advance:Font.advanceFor(metrics,char),pair,adjust:pair?Font.kernFor(metrics,pair):0});
      x+=Font.advanceFor(metrics,char);
    }
    return {word,positions,total:Math.max(1000,x+80)};
  }
  function kernFromDrag(original,startX,currentX){
    if(!Number.isFinite(original)||!Number.isFinite(startX)||!Number.isFinite(currentX))throw new Error('Invalid kerning drag.');
    return Math.max(-400,Math.min(400,Math.round((original+currentX-startX)/5)*5));
  }
  function setPair(metrics,pair,value){
    if(typeof pair!=='string'||pair.length!==2||![...pair].every(isChar))throw new Error('A pair needs two supported characters.');
    if(!Number.isInteger(value)||value<-400||value>400)throw new Error('Kerning adjustment out of range.');
    const next={...metrics,kerning:{...(metrics.kerning||{})}};
    if(value)next.kerning[pair]=value;else delete next.kerning[pair];
    if(!Font.validMetrics(next))throw new Error('Too many kerning pairs.');
    return next.kerning;
  }
  return Object.freeze({MAX_WORD,cleanWord,layout,kernFromDrag,setPair});
});
