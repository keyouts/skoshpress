'use strict';
// Revision Analysis
                    
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshRevisions=api;
})(typeof window!=='undefined'?window:null,()=>{
  const NUMERIC=['x','y','w','h'];
  function plain(html){return String(html||'').replace(/<\/(?:p|h[1-6]|li|div|br)\s*>/gi,' ').replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/gi,s=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' ','&#39;':"'"}[s.toLowerCase()]||s)).replace(/\s+/g,' ').trim();}
  const rounded=n=>Math.round(n*100)/100;
  function add(items,stats,kind,title,detail,page,frameId){stats[kind]=(stats[kind]||0)+1;if(items.length<300)items.push({kind,title,detail,page,frameId});}
  function compare(base,next){
    if(!base||!next||!Array.isArray(base.pages)||!Array.isArray(next.pages))throw new Error('Two publications are required.');
    const changes=[],stats={},oldFrames=new Map(),newFrames=new Map();
    const index=(doc,destination)=>doc.pages.forEach((page,p)=>page.frames.forEach(frame=>destination.set(frame.id,{frame,page:p})));
    index(base,oldFrames);index(next,newFrames);
    if(base.pages.length!==next.pages.length)add(changes,stats,'pages','Page count changed',`${base.pages.length} → ${next.pages.length} pages`,null,null);
    for(const key of ['width','height','margin','columns','gutter']){
      if((base.paper?.[key]??null)!==(next.paper?.[key]??null))add(changes,stats,'pages',`Page ${key} changed`,`${base.paper?.[key]??'—'} → ${next.paper?.[key]??'—'}${['width','height','margin','gutter'].includes(key)?' mm':''}`,null,null);
    }
    for(const [id,{frame:old,page:oldPage}] of oldFrames){
      const found=newFrames.get(id);
      if(!found){add(changes,stats,'removed',`Removed: ${old.label}`,`Was on page ${oldPage+1}`,null,null);continue;}
      const {frame:now,page:newPage}=found;
      if(oldPage!==newPage)add(changes,stats,'position',`Moved page: ${now.label}`,`Page ${oldPage+1} → page ${newPage+1}`,newPage,id);
      if(old.label!==now.label)add(changes,stats,'metadata',`Renamed object`,`${old.label} → ${now.label}`,newPage,id);
      if(old.type!==now.type){add(changes,stats,'content',`Object type changed: ${now.label}`,`${old.type} → ${now.type}`,newPage,id);continue;}
      if(NUMERIC.some(key=>Math.abs(old[key]-now[key])>0.015)){
        const moved=Math.abs(old.x-now.x)>.015||Math.abs(old.y-now.y)>.015;
        const sized=Math.abs(old.w-now.w)>.015||Math.abs(old.h-now.h)>.015;
        add(changes,stats,'position',`${sized?'Resized': 'Repositioned'}: ${now.label}`,`${moved?`Position (${rounded(old.x)}, ${rounded(old.y)}) → (${rounded(now.x)}, ${rounded(now.y)}) mm`:'Position unchanged'}${sized?` · Size ${rounded(old.w)}×${rounded(old.h)} → ${rounded(now.w)}×${rounded(now.h)} mm`:''}`,newPage,id);
      }
      if(old.type==='text'){
        const was=plain(old.html),is=plain(now.html);
        if(was!==is){
          const beforeWords=was?was.split(/\s+/).length:0,afterWords=is?is.split(/\s+/).length:0;
          add(changes,stats,'content',`Text edited: ${now.label}`,`${beforeWords} → ${afterWords} words · may change line breaks or overflow`,newPage,id);
        }else if(old.html!==now.html)add(changes,stats,'styles',`Inline formatting changed: ${now.label}`,'Text is unchanged, but its markup differs.',newPage,id);
        if(JSON.stringify(old.style)!==JSON.stringify(now.style))add(changes,stats,'styles',`Typography changed: ${now.label}`,'Font, size, or line height differs.',newPage,id);
      }else if(old.src!==now.src||old.fit!==now.fit)add(changes,stats,'assets',`Image changed: ${now.label}`,'Source or fit mode changed.',newPage,id);
      if((old.note||'')!==(now.note||''))add(changes,stats,'notes',`Editorial note changed: ${now.label}`,'Private annotation edited.',newPage,id);
    }
    for(const [id,{frame,page}] of newFrames)if(!oldFrames.has(id))add(changes,stats,'added',`Added: ${frame.label}`,`New ${frame.type} object on page ${page+1}`,page,id);
    const total=Object.values(stats).reduce((a,b)=>a+b,0);
    const notices=[];
    if(stats.content||stats.styles||stats.pages)notices.push('Check line endings, text overflow, and page breaks visually before publishing.');
    if(stats.assets)notices.push('Verify changed images at the intended print resolution.');
    if(total>300)notices.push(`Showing the first 300 of ${total} detected changes.`);
    return {stats,total,changes,notices,pageDelta:next.pages.length-base.pages.length};
  }
  return Object.freeze({compare,plain});
});
