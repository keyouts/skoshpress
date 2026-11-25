'use strict';
(function(root){
  const cache=new Map();let bytes=0,active=0;
  const limit=16*1024*1024,maxEntries=80;
  function trim(){while(cache.size>maxEntries||bytes>limit){const [key,entry]=cache.entries().next().value;cache.delete(key);bytes-=entry.size;}}
  function preview(target,source){
    if(typeof source!=='string'||source.length<16384||source.length>limit/2){target.src=source;return;}
    let entry=cache.get(source);
    if(entry){cache.delete(source);cache.set(source,entry);if(entry.url)target.src=entry.url;else{target.src=source;entry.promise.then(url=>{if(url&&target.getAttribute('src')===source)target.src=url;});}return;}
    target.src=source;
    if(active>=2)return;
    active++;entry={size:source.length*2,url:null};bytes+=entry.size;cache.set(source,entry);trim();
    entry.promise=(async()=>{try{
      const original=new Image();original.src=source;await original.decode();
      if(!original.naturalWidth||!original.naturalHeight)return null;
      const ratio=Math.min(1,192/Math.max(original.naturalWidth,original.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(original.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(original.naturalHeight*ratio));
      canvas.getContext('2d').drawImage(original,0,0,canvas.width,canvas.height);
      const url=canvas.toDataURL('image/png');if(url.length>=source.length)return null;
      if(cache.get(source)===entry){entry.url=url;entry.size+=url.length*2;bytes+=url.length*2;trim();}return url;
    }catch(_error){return null;}finally{active--;}})();
    entry.promise.then(url=>{if(url&&target.getAttribute('src')===source)target.src=url;});
  }
  root.SkoshImageCache={preview,stats:()=>({entries:cache.size,bytes,active})};
})(globalThis);
