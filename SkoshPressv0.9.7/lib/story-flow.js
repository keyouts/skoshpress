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
      if(frame.storyId===id)result.push({frame,index,page});
    }));
    return result;
  }
  function geometry(master,slot){
    const f=slot?.frame?.manualFlow?slot.frame:master;
    return {x:f.x,y:f.y,w:f.w,h:f.h};
  }
  function reflow(doc,id,chunks,newId){
    const story=doc.stories?.[id],chain=frameChain(doc,id);
    if(!story||!chain.length)return false;
    if(!Array.isArray(chunks)||!chunks.length||chunks.length>450||chunks.some(s=>typeof s!=='string'))throw Error('Invalid manuscript pagination result.');
    const master=chain[0].frame,style=clone(story.style||master.style),canonicalHtml=story.html;
    const inheritedMaster=chain[0].page.masterId;
    const retained=Math.max(chunks.length,chain.findLastIndex(item=>item.frame.manualFlow)+1);
    const extra=Math.max(0,retained-chain.length);
    const removable=doc.pages.filter(p=>p.autoStory===id&&!p.section&&!p.label&&p.frames.every(f=>f.storyId===id)&&!chain.slice(0,retained).some(item=>item.page===p)).length;
    if(doc.pages.length+extra-removable>700)throw Error('Publication exceeds the 700-page limit.');
    let page=chain[0].page;
    const used=new Set();
    for(let j=0;j<retained;j++){
      const existing=chain[j];
      if(existing)page=existing.page;
      else{const fresh={...(inheritedMaster?{masterId:inheritedMaster}:{}),id:newId(),frames:[],autoStory:id};doc.pages.splice(doc.pages.indexOf(page)+1,0,fresh);page=fresh;}
      const frame={...clone(master),id:existing?.frame.id||newId(),html:chunks[j]||'',style:clone(style),storyId:id,...geometry(master,existing)};
      delete frame.manualFlow;
      if(existing?.frame.manualFlow)frame.manualFlow=true;
      if(existing){page.frames[page.frames.indexOf(existing.frame)]=frame;}else page.frames.push(frame);
      used.add(frame.id);
    }
    for(const p of doc.pages)p.frames=p.frames.filter(f=>f.storyId!==id||used.has(f.id));
    for(let i=doc.pages.length-1;i>=0;i--){const p=doc.pages[i];if(p.autoStory===id&&!p.frames.length&&!p.section&&!p.label&&p!==chain[0].page)doc.pages.splice(i,1);}
    story.geometry=geometry(master);
    if(story.html!==canonicalHtml)throw Error('Pagination changed the source manuscript.');
    return true;
  }
  return Object.freeze({frameChain,geometry,reflow});
});
