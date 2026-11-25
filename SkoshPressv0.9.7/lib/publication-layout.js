'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshPublicationLayout=api;
})(typeof window!=='undefined'?window:null,()=>{
  const BASE=Object.freeze({id:'',name:'Default',visible:true});
  const layers=doc=>[BASE,...(doc.layers||[])];
  const layerFor=(doc,frame)=>layers(doc).find(l=>l.id===(frame.layerId||''))||BASE;
  const visible=(doc,frame)=>layerFor(doc,frame).visible!==false;
  const locked=(doc,frame)=>frame.locked===true;
  function visibleFrames(doc,page){
    const order=new Map(layers(doc).map((l,i)=>[l.id,i]));
    const hidden=new Set((doc.layers||[]).filter(l=>!l.visible).map(l=>l.id));
    return page.frames.filter(f=>!hidden.has(f.layerId)).sort((a,b)=>(order.get(a.layerId||'')??0)-(order.get(b.layerId||'')??0));
  }
  function outputDocument(doc){return {...doc,pages:doc.pages.map(page=>({...page,frames:visibleFrames(doc,page)}))};}
  function validate(doc){
    const ids=new Set();
    if(doc.layers!==undefined){
      if(!Array.isArray(doc.layers)||doc.layers.length>32)throw Error('Invalid publication layers.');
      for(const l of doc.layers){
        if(!l||typeof l.id!=='string'||!/^layer-[a-z0-9-]{1,80}$/i.test(l.id)||ids.has(l.id)||typeof l.name!=='string'||!l.name.trim()||l.name.length>64||typeof l.visible!=='boolean')throw Error('Invalid publication layer.');
        ids.add(l.id);
      }
    }
    for(const page of doc.pages||[]){const groups=new Map();for(const f of page.frames||[]){
      if(f.layerId!==undefined&&!ids.has(f.layerId))throw Error('Missing publication layer.');
      if(f.locked!==undefined&&typeof f.locked!=='boolean')throw Error('Invalid object lock.');
      if(f.groupId!==undefined&&(typeof f.groupId!=='string'||!/^group-[a-z0-9-]{1,80}$/i.test(f.groupId)||f.storyId))throw Error('Invalid object group.');
      if(f.groupId){const layer=f.layerId||'';if(groups.has(f.groupId)&&groups.get(f.groupId)!==layer)throw Error('Grouped objects must share a publication layer.');groups.set(f.groupId,layer);}
    }}
    for(const master of doc.masters||[]){
      if(master.blocks===undefined)continue;
      if(!Array.isArray(master.blocks)||master.blocks.length>30)throw Error('Invalid parent layout.');
      for(const b of master.blocks){
        if(!b||typeof b.text!=='string'||b.text.length>2000||!['x','y','w','h','size'].every(k=>Number.isFinite(b[k]))||b.x<0||b.y<0||b.x>1000||b.y>1000||b.w<1||b.h<1||b.w>1000||b.h>1000||b.size<6||b.size>150||!['left','center','right'].includes(b.align))throw Error('Invalid parent layout object.');
      }
    }
  }
  function canMovePage(doc,from,to){
    return Number.isInteger(from)&&Number.isInteger(to)&&from>=0&&to>=0&&from<doc.pages.length&&to<doc.pages.length&&from!==to&&!doc.pages.slice(Math.min(from,to),Math.max(from,to)+1).some(p=>p.frames.some(f=>f.storyId));
  }
  function selectedObjects(doc,page,ids){
    const picked=page.frames.filter(f=>ids.includes(f.id)&&visible(doc,f));
    const groups=new Set(picked.map(f=>f.groupId).filter(Boolean));
    return page.frames.filter(f=>visible(doc,f)&&(ids.includes(f.id)||groups.has(f.groupId)));
  }
  function bounds(frames){
    return {x:Math.min(...frames.map(f=>f.x)),y:Math.min(...frames.map(f=>f.y)),right:Math.max(...frames.map(f=>f.x+f.w)),bottom:Math.max(...frames.map(f=>f.y+f.h))};
  }
  function translation(frames,paper,dx,dy){
    const b=bounds(frames),clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
    return {dx:clamp(dx,Math.min(0,-b.x),Math.max(0,paper.width-b.right)),dy:clamp(dy,Math.min(0,-b.y),Math.max(0,paper.height-b.bottom))};
  }
  function align(frames,paper,direction,relative=false){
    if(!frames.length)return;
    const b=bounds(frames), horizontal=['left','center','right'].includes(direction),axis=horizontal?'x':'y',size=horizontal?'w':'h',end=horizontal?'right':'bottom',extent=horizontal?paper.width:paper.height;
    if(relative&&frames.length>1){
      for(const f of frames){const target=direction==='left'||direction==='top'?b[axis]:direction==='right'||direction==='bottom'?b[end]-f[size]:(b[axis]+b[end]-f[size])/2;f[axis]=Math.round(target*10)/10;}
    }else{
      const target=direction==='left'||direction==='top'?paper.margin:direction==='right'||direction==='bottom'?extent-paper.margin-(b[end]-b[axis]):(extent-(b[end]-b[axis]))/2;
      const move=translation(frames,paper,horizontal?target-b.x:0,horizontal?0:target-b.y);
      for(const f of frames){f.x=Math.round((f.x+move.dx)*10)/10;f.y=Math.round((f.y+move.dy)*10)/10;}
    }
  }
  function distribute(frames,axis){
    if(frames.length<3)return;
    const size=axis==='x'?'w':'h',sorted=[...frames].sort((a,b)=>a[axis]-b[axis]),first=sorted[0],last=sorted.at(-1),gap=(last[axis]+last[size]-first[axis]-sorted.reduce((n,f)=>n+f[size],0))/(sorted.length-1);
    let cursor=first[axis]+first[size]+gap;
    for(const f of sorted.slice(1,-1)){f[axis]=Math.round(cursor*10)/10;cursor+=f[size]+gap;}
  }
  return {layers,layerFor,visible,locked,visibleFrames,outputDocument,validate,canMovePage,selectedObjects,bounds,translation,align,distribute};
});
