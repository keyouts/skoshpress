'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SkoshProjectWorkspace=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  function inventory(doc){
    const images=new Map(),fonts=new Map();
    for(const [index,page] of doc.pages.entries())for(const frame of page.frames){
      if(frame.type!=='image'||typeof frame.src!=='string')continue;
      let row=images.get(frame.src);
      if(!row){row={name:frame.label,src:frame.src,alt:frame.alt||'',decorative:!!frame.decorative,uses:0,pages:new Set(),labels:new Set(),mixedDescriptions:false};images.set(frame.src,row);}
      row.uses++;row.pages.add(index+1);row.labels.add(frame.label);
      if(row.alt!==(frame.alt||'')||row.decorative!==!!frame.decorative)row.mixedDescriptions=true;
    }
    for(const font of doc.fonts||[]){let row=fonts.get(font.data);if(!row){row={name:font.name,data:font.data,mime:font.mime,ids:[],labels:new Set()};fonts.set(font.data,row);}row.ids.push(font.id);row.labels.add(font.name);}
    return {images:[...images.values()].map(row=>({...row,labels:[...row.labels],pages:[...row.pages],alt:row.mixedDescriptions?'':row.alt,decorative:row.mixedDescriptions?false:row.decorative})),fonts:[...fonts.values()].map(row=>({...row,labels:[...row.labels]}))};
  }
  function navigation(doc,query='',limit=100){
    const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean),rows=[];
    const matches=value=>terms.every(term=>value.toLowerCase().includes(term));
    for(const [index,page] of doc.pages.entries()){
      const name=`Page ${index+1} · ${page.label||'Untitled'}${page.section?.title?' · '+page.section.title:''}`;
      if(matches(name))rows.push({index,name});
      if(terms.length)for(const frame of page.frames){const title=`${frame.label} · Page ${index+1}`;if(matches(title))rows.push({index,id:frame.id,name:title});if(rows.length>=limit)return rows.slice(0,limit);}
      if(rows.length>=limit)break;
    }
    return rows.slice(0,limit);
  }
  function matchesAsset(row,query){const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);const text=[row.name,...(row.labels||[]),...(row.pages||[]).map(n=>`page ${n}`)].join(' ').toLowerCase();return terms.every(term=>text.includes(term));}
  function searchCommands(commands,query){const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);return commands.filter(c=>terms.every(t=>(c.label+' '+(c.keywords||'')).toLowerCase().includes(t)));}
  return {inventory,navigation,searchCommands,matchesAsset};
});
