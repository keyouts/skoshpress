'use strict';
// Layout Helpers
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshLayout=api;
})(typeof window!=='undefined'?window:null,()=>{
  function defaults(){return [
    {id:'style-body',name:'Body',style:{font:'Georgia, serif',fontSize:11,leading:1.45,align:'left',tracking:0,indent:0,hyphenate:false}},
    {id:'style-title',name:'Title',style:{font:'Georgia, serif',fontSize:21,leading:1.2,align:'center',tracking:0,indent:0,hyphenate:false}}
  ];}
  function effective(doc,frame){
    const style=(doc.textStyles||[]).find(item=>item.id===frame.styleId);
    return {...(frame.style||{}),...(style?.style||{})};
  }
  function expand(text,doc,index){
    return String(text||'').replace(/\{(page|pages|title)\}/gi,(_,token)=>{
      if(token.toLowerCase()==='page')return String(index+1);
      if(token.toLowerCase()==='pages')return String(doc.pages.length);
      return doc.name||'';
    });
  }
  function masterParts(doc,index){
    const page=doc.pages[index];if(!page?.masterId)return [];
    const master=(doc.masters||[]).find(m=>m.id===page.masterId);if(!master)return [];
    const p=doc.paper,margin=Math.max(4,p.margin),parts=[];
    if(master.header)parts.push({text:expand(master.header,doc,index),x:margin,y:Math.max(2,margin*.3),w:p.width-2*margin,h:6,align:'center',type:'header'});
    if(master.footer)parts.push({text:expand(master.footer,doc,index),x:margin,y:p.height-Math.max(5,margin*.55),w:p.width-2*margin,h:6,align:'center',type:'footer'});
    if(master.pageNumber){
      const isOdd=(index+1)%2===1;
      parts.push({text:String(index+1+(master.numberOffset||0)),x:isOdd?p.width-margin-18:margin,y:p.height-Math.max(5,margin*.55),w:18,h:6,align:isOdd?'right':'left',type:'number'});
    }
    return parts;
  }
  function blockBreaks(container){
    const offsets=[];let offset=0;
    for(const node of container.childNodes){offset+=node.textContent.length;
      if(node.nodeType===1 && /^(P|H1|H2|H3|DIV|UL|OL|BLOCKQUOTE)$/.test(node.tagName))offsets.push(offset);
    }
    return offsets;
  }
  function preferredBreak(start,maxFit,blockOffsets,plain){
    // Paragraph Preference
    const blocks=blockOffsets.filter(n=>n>start && n<=maxFit);
    const end=blocks.at(-1);
    if(end && end-start>=Math.max(12,(maxFit-start)*.6))return end;
    let candidate=maxFit;
    while(candidate>Math.max(start+1,maxFit-110) && !/\s|[-\u2010\u2013]/.test(plain[candidate-1]||''))candidate--;
    return candidate>start+Math.min(8,Math.floor((maxFit-start)/3))?candidate:maxFit;
  }
  return Object.freeze({defaults,effective,expand,masterParts,blockBreaks,preferredBreak});
});
