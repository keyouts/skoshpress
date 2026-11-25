'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshBookDesign=api;
})(typeof window!=='undefined'?window:null,()=>{
  const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const options=story=>({widows:story?.flow?.widows??2,chapterBreaks:story?.flow?.chapterBreaks===true,wrapImages:story?.flow?.wrapImages===true,bottomNotes:story?.flow?.bottomNotes===true,localWrap:story?.flow?.localWrap===true});
  function validateNotes(notes){
    if(!Array.isArray(notes)||notes.length>500)throw Error('Invalid manuscript footnotes.');
    const seen=new Set();
    for(const note of notes){if(!note||!Number.isInteger(note.number)||note.number<1||note.number>9999||seen.has(note.number)||typeof note.text!=='string'||!note.text.trim()||note.text.length>2000)throw Error('Invalid manuscript footnote.');seen.add(note.number);}
    return notes;
  }
  function parseNotes(value){
    const notes=String(value).split(/\r?\n/).filter(s=>s.trim()).map(line=>{const m=/^\s*(\d{1,4})\s*:\s*(.+)$/.exec(line);if(!m)throw Error('Use one numbered footnote per line: 1: Note text.');return {number:Number(m[1]),text:m[2].trim()};});
    return validateNotes(notes);
  }
  function noteParts(html,notes=[]){
    if(!notes.length)return {body:html,notes:""};
    const references=new Set([...html.matchAll(/<sup>\[(\d{1,4})\]<\/sup>/gi)].map(m=>Number(m[1])));
    const used=notes.filter(n=>references.has(n.number)).sort((a,b)=>a.number-b.number);
    return {body:html,notes:used.length?'<hr>'+used.map(n=>`<p><small>[${n.number}] ${escape(n.text)}</small></p>`).join(''):''};
  }
  function withNotes(html,notes=[]){const parts=noteParts(html,notes);return parts.body+parts.notes;}
  function splitNotes(html,notes=[],normalize=s=>s){
    const at=html.lastIndexOf("<hr>");if(at<0)return {body:html,notes:""};
    const parts=noteParts(html.slice(0,at),notes);return parts.notes&&normalize(parts.notes)===normalize(html.slice(at))?parts:{body:html,notes:""};
  }
  function wrapInsets(frame,images,gap=3){
    let left=0,right=0;
    for(const image of images){
      if(image.type!=='image'||image.y>=frame.y+frame.h||image.y+image.h<=frame.y||image.x>=frame.x+frame.w||image.x+image.w<=frame.x)continue;
      const a=Math.max(0,image.x-frame.x),b=Math.min(frame.w,image.x+image.w-frame.x);
      if((a+b)/2<=frame.w/2)left=Math.max(left,b+gap);else right=Math.max(right,frame.w-a+gap);
    }
    if(left+right>frame.w-8)throw Error('Artwork leaves too little room for manuscript text. Move or resize the image, or disable image wrapping.');
    return {left,right};
  }
  function sectionAt(doc,index){
    for(let i=index;i>=0;i--)if(doc.pages[i]?.section)return {title:doc.pages[i].section.title,folio:doc.pages[i].section.start+index-i};
    return {title:'',folio:index+1};
  }
  function validate(doc){
    if(doc.indexTerms!==undefined&&(!Array.isArray(doc.indexTerms)||doc.indexTerms.length>200||doc.indexTerms.some(t=>typeof t!=='string'||!t.trim()||t.length>120)))throw Error('Invalid index terms.');
    for(const page of doc.pages){
      if(page.section!==undefined&&(!page.section||typeof page.section.title!=='string'||!page.section.title.trim()||page.section.title.length>200||!Number.isInteger(page.section.start)||page.section.start<1||page.section.start>10000))throw Error('Invalid book section.');
      if(page.indexPage!==undefined&&typeof page.indexPage!=='boolean')throw Error('Invalid index page.');
      if(page.contents!==undefined&&typeof page.contents!=='boolean')throw Error('Invalid contents page.');
      for(const f of page.frames)if(f.manualFlow!==undefined&&(typeof f.manualFlow!=='boolean'||!f.storyId||f.type!=='text'))throw Error('Invalid continuation frame.');
    }
    const hidden=new Set((doc.layers||[]).filter(l=>!l.visible).map(l=>l.id));
    for(const page of doc.pages)for(const f of page.frames)if(f.storyId&&options(doc.stories?.[f.storyId]).wrapImages){const opts=options(doc.stories?.[f.storyId]),images=page.frames.filter(img=>!hidden.has(img.layerId));if(opts.localWrap&&!opts.bottomNotes)wrapShapes(f,images);else wrapInsets(f,images); }
    for(const story of Object.values(doc.stories||{})){
      if(story.flow!==undefined&&(!story.flow||!Number.isInteger(story.flow.widows)||story.flow.widows<1||story.flow.widows>3||typeof story.flow.chapterBreaks!=='boolean'||typeof story.flow.wrapImages!=='boolean'||(story.flow.bottomNotes!==undefined&&typeof story.flow.bottomNotes!=='boolean')||(story.flow.localWrap!==undefined&&typeof story.flow.localWrap!=='boolean')))throw Error('Invalid manuscript flow options.');
      if(story.notes!==undefined)validateNotes(story.notes);
    }
  }
  // Artwork Exclusions
  function wrapShapes(frame,images,gap=3){
    const sides={left:[],right:[]};
    for(const f of images){
      if(f.type!=='image'||f.x>=frame.x+frame.w||f.x+f.w<=frame.x||f.y>=frame.y+frame.h||f.y+f.h<=frame.y)continue;
      const a=Math.max(0,f.x-frame.x),b=Math.min(frame.w,f.x+f.w-frame.x),side=(a+b)/2<=frame.w/2?'left':'right';
      sides[side].push({top:Math.max(0,f.y-frame.y-gap),bottom:Math.min(frame.h,f.y+f.h-frame.y+gap),width:Math.min(frame.w,side==='left'?b+gap:frame.w-a+gap)});
    }
    const boundaries=[...new Set([0,frame.h,...Object.values(sides).flat().flatMap(x=>[x.top,x.bottom])])].sort((a,b)=>a-b);
    const bands=boundaries.slice(0,-1).map((top,i)=>{const bottom=boundaries[i+1],mid=(top+bottom)/2;const width=side=>Math.max(0,...sides[side].filter(x=>x.top<=mid&&x.bottom>mid).map(x=>x.width));return {top,bottom,left:width('left'),right:width('right')};});
    if(Math.max(0,...bands.map(b=>b.left))+Math.max(0,...bands.map(b=>b.right))>frame.w-8)throw Error('Artwork leaves too little room for manuscript text.');
    return ['left','right'].flatMap(side=>{
      const width=Math.max(0,...bands.map(b=>b[side]));if(!width)return [];
      const height=Math.max(...bands.filter(b=>b[side]>0).map(b=>b.bottom));
      const pct=(v,n)=>Math.round(v/n*100000)/1000+'%';
      const edge=side==='left'?'0%':'100%';const points=[`${edge} 0%`];
      for(const band of bands){if(band.top>=height)break;const x=pct(side==='left'?band[side]:width-band[side],width);points.push(`${x} ${pct(band.top,height)}`,`${x} ${pct(Math.min(band.bottom,height),height)}`);}
      points.push(`${edge} 100%`);return [{side,width,height,shape:`polygon(${points.join(',')})`}];
    });
  }
  function indexEntries(pages,terms,language='en'){
    if(!Array.isArray(terms)||terms.length>200)throw Error('Enter at most 200 index terms.');
    const norm=s=>String(s).normalize('NFC').toLowerCase().replace(/\u00ad/g,'').replace(/\s+/g,' ').trim();
    const unique=new Map();for(const term of terms){const label=String(term).trim();if(label.length>120)throw Error('Index terms are limited to 120 characters.');if(label&&norm(label))unique.set(norm(label),label);}
    const texts=pages.map(p=>norm(p.text));
    const word=/[\p{L}\p{N}\p{M}_]/u;
    const matches=(text,term)=>{let from=0;while(from<=text.length){const i=text.indexOf(term,from);if(i<0)return false;const end=i+term.length;if((!word.test(term[0])||!word.test(text[i-1]||''))&&(!word.test(term.at(-1))||!word.test(text[end]||'')))return true;from=end;}return false;};
    let collator;try{collator=new Intl.Collator(language);}catch{collator=new Intl.Collator('en');}
    return [...unique].map(([term,label])=>({label,pages:pages.filter((_,i)=>matches(texts[i],term)).map(p=>p.folio)})).sort((a,b)=>collator.compare(a.label,b.label));
  }
  return {noteParts,splitNotes,wrapShapes,indexEntries,options,validateNotes,parseNotes,withNotes,wrapInsets,sectionAt,validate,escape};
});
