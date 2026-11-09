'use strict';
// Story Integrity
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshStoryFlow=api;
})(typeof window!=='undefined'?window:null,()=>{
  const clone=value=>JSON.parse(JSON.stringify(value));
  function frameChain(doc,id){
    const result=[];
    doc.pages.forEach((page,index)=>page.frames.forEach(frame=>{
      if(frame.storyId===id)result.push({frame,index});
    }));
    return result;
  }
  function reflow(doc,id,chunks,newId){
    const story=doc.stories?.[id],chain=frameChain(doc,id);
    if(!story||!chain.length)return false;
    if(!Array.isArray(chunks)||!chunks.length || chunks.length>450 || chunks.some(s=>typeof s!=='string'))
      throw new Error('Invalid manuscript pagination result.');
    const canonicalHtml=story.html;
    const startIndex=chain[0].index,master=chain[0].frame;
    const geometry={x:master.x,y:master.y,w:master.w,h:master.h};
    const style=clone(story.style||master.style);
    const originalIds=chain.map(item=>item.frame.id);
    const freshPage=()=>({id:newId(),frames:[],autoStory:id});
    for(const page of doc.pages)page.frames=page.frames.filter(frame=>frame.storyId!==id);
    let slot=startIndex;
    for(let j=0;j<chunks.length;j++){
      if(j>0){
        if(doc.pages[slot+1]?.autoStory===id && doc.pages[slot+1].frames.length===0)slot++;
        else {doc.pages.splice(slot+1,0,freshPage());slot++;}
      }
      const frame={...clone(master),id:originalIds[j]||newId(),html:chunks[j],style:clone(style),storyId:id,...geometry};
      doc.pages[slot].frames.push(frame);
    }
    for(let i=doc.pages.length-1;i>startIndex;i--){
      if(doc.pages[i].autoStory===id && doc.pages[i].frames.length===0)doc.pages.splice(i,1);
    }
    // Source Preservation
    if(story.html!==canonicalHtml)throw new Error('Pagination changed the source manuscript.');
    return true;
  }
  return Object.freeze({frameChain,reflow});
});
