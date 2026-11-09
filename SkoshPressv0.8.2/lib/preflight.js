'use strict';
// Publication Preflight
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshPreflight=api;
})(typeof window!=='undefined'?window:null,()=>{
  const cleanText=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi,' ').replace(/\s+/g,' ').trim();
  function imageDimensions(source){
    if(typeof source!=='string')return null;
    const match=/^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
    if(!match)return null;
    const part=match[2].slice(0,262144);
    let raw;
    try{raw=typeof atob==='function'?atob(part.slice(0,Math.floor(part.length/4)*4)):Buffer.from(part,'base64').toString('latin1');}
    catch{return null;}
    const byte=i=>raw.charCodeAt(i)||0;
    const be16=i=>byte(i)*256+byte(i+1);
    const le16=i=>byte(i)+byte(i+1)*256;
    const be32=i=>byte(i)*16777216+byte(i+1)*65536+byte(i+2)*256+byte(i+3);
    const le24=i=>byte(i)+byte(i+1)*256+byte(i+2)*65536;
    let width=0,height=0;
    if(match[1]==='png' && raw.slice(1,4)==='PNG' && raw.length>=24){width=be32(16);height=be32(20);}
    else if(match[1]==='gif' && raw.length>=10){width=le16(6);height=le16(8);}
    else if(match[1]==='webp' && raw.slice(0,4)==='RIFF' && raw.slice(8,12)==='WEBP'){
      const subtype=raw.slice(12,16);
      if(subtype==='VP8X' && raw.length>=30){width=le24(24)+1;height=le24(27)+1;}
      else if(subtype==='VP8 ' && raw.length>=30){width=le16(26)&0x3fff;height=le16(28)&0x3fff;}
      else if(subtype==='VP8L' && raw.length>=25){width=1+(((byte(22)&0x3f)<<8)|byte(21));height=1+(((byte(24)&0xf)<<10)|(byte(23)<<2)|((byte(22)&0xc0)>>6));}
    }else if(match[1]==='jpeg'||match[1]==='jpg'){
      if(byte(0)===0xff && byte(1)===0xd8){
        for(let i=2;i+9<raw.length;){
          if(byte(i)!==0xff){i++;continue;}
          let tag=byte(i+1);while(tag===0xff){i++;tag=byte(i+1);}
          if(tag===0xd8||tag===0xd9||tag===0x01){i+=2;continue;}
          const size=be16(i+2);
          if(size<2)break;
          if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(tag)){
            height=be16(i+5);width=be16(i+7);break;
          }
          i+=size+2;
        }
      }
    }
    return width>0 && height>0 && width<=20000 && height<=20000?{width,height,format:match[1]}:null;
  }
  function audit(doc,options={}){
    const issues=[];let warnings=0,errors=0;
    const add=(severity,category,title,detail,page=null,frameId=null)=>{
      if(severity==='error')errors++;else warnings++;
      if(issues.length<400)issues.push({severity,category,title,detail,page,frameId});
    };
    const pages=Array.isArray(doc?.pages)?doc.pages:[];
    const metadata=doc?.metadata||{};
    if(!String(doc?.name||'').trim())add('error','metadata','Publication title missing','Give the publication a meaningful title.');
    else if(/^(A Skosh Press Project|Untitled Publication)$/i.test(doc.name.trim()))add('warning','metadata','Starter title unchanged','Replace the default project title before publication.');
    if(!String(metadata.author||'').trim())add('warning','metadata','Author not specified','Add a creator in Document → Publication details.');
    if(!String(metadata.description||'').trim())add('warning','metadata','Description missing','A short description improves cataloging and digital distribution.');
    if(!String(metadata.language||'').trim())add('warning','metadata','Language not specified','Select the main publication language for digital exports.');
    let words=0,images=0,headings=0;
    pages.forEach((page,index)=>{
      const frames=Array.isArray(page.frames)?page.frames:[];
      if(!frames.length)add('warning','layout','Empty page',`Page ${index+1} has no objects.`,index);
      frames.forEach(frame=>{
        const label=String(frame.label||frame.type||'Object');
        if(frame.x<-.05||frame.y<-.05||frame.x+frame.w>(doc.paper?.width||0)+.05||frame.y+frame.h>(doc.paper?.height||0)+.05){
          add('error','layout','Object outside page',`${label} extends past a page edge.`,index,frame.id);
        }
        if(frame.type==='image'){
          images++;
          if(!frame.decorative && !String(frame.alt||'').trim())add('error','accessibility','Image description missing',`${label} needs alternative text or must be marked decorative.`,index,frame.id);
          if(/^data:image\/webp;/.test(frame.src||''))add('warning','compatibility','WebP in publication',`${label}: convert to PNG or JPEG for the widest e-reader compatibility.`,index,frame.id);
          const dimensions=imageDimensions(frame.src);
          if(dimensions && frame.w>0 && frame.h>0){
            const dpi=Math.round(Math.min(dimensions.width/(frame.w/25.4),dimensions.height/(frame.h/25.4)));
            if(dpi<150)add('warning','print',`Low image resolution (${dpi} dpi)`,`${label} may look soft when printed at this size.`,index,frame.id);
          }
        }
        if(frame.type==='text'){
          const plain=cleanText(frame.html);words+=(plain.match(/\S+/g)||[]).length;
          headings+=(String(frame.html||'').match(/<h[1-3]\b/gi)||[]).length;
          if(!plain)add('warning','content','Empty text frame',`${label} contains no readable text.`,index,frame.id);
          if(Number(frame.style?.fontSize)<9)add('warning','readability','Small body type',`${label} uses ${frame.style.fontSize} pt. Review print legibility.`,index,frame.id);
          if(options.overflowIds?.includes(frame.id))add('error','layout','Text overflows frame',`${label} has more text than its visible frame can hold.`,index,frame.id);
        }
      });
    });
    if(words>0 && headings===0)add('warning','structure','No document headings','Use heading styles to help readers navigate long publications.');
    return {issues,errors,warnings,words,images,pages:pages.length,ready:errors===0};
  }
  return Object.freeze({audit,imageDimensions});
});
