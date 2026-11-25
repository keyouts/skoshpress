'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshEditorHistory=api;
})(typeof window!=='undefined'?window:null,()=>{
  const encoder=new TextEncoder();
  function capture(doc){
    const {pages,fonts,...meta}=doc;
    const parts=[JSON.stringify(meta),String(pages.length)];
    for(const page of pages){
      const {frames,...header}=page;parts.push(JSON.stringify(header),String(frames.length));
      for(const frame of frames){if(frame.type==='image'){const {src,...rest}=frame;parts.push(JSON.stringify(rest),src);}else parts.push(JSON.stringify(frame));}
    }
    parts.push(fonts===undefined?'missing':String(fonts.length));
    for(const font of fonts||[]){const {data,...rest}=font;parts.push(JSON.stringify(rest),data);}
    return parts;
  }
  function restore(parts){
    let i=0;const doc=JSON.parse(parts[i++]),count=Number(parts[i++]);doc.pages=[];
    for(let p=0;p<count;p++){const page=JSON.parse(parts[i++]),n=Number(parts[i++]);page.frames=[];for(let f=0;f<n;f++){const frame=JSON.parse(parts[i++]);if(frame.type==='image')frame.src=parts[i++];page.frames.push(frame);}doc.pages.push(page);}
    const fonts=parts[i++];if(fonts!=='missing'){doc.fonts=[];for(let f=0;f<Number(fonts);f++){const font=JSON.parse(parts[i++]);font.data=parts[i++];doc.fonts.push(font);}}
    return doc;
  }
  const equal=(a,b)=>a.length===b.length&&a.every((value,i)=>value===b[i]);
  function create({maxBytes=24*1024*1024,maxEntries=45}={}){
    const pools=new WeakMap();
    function pool(stack){let p=pools.get(stack);if(!p){p={chunks:new Map(),bytes:0};pools.set(stack,p);}return p;}
    function release(p,entry){p.bytes-=entry.overhead;for(const part of entry.parts){const c=p.chunks.get(part);if(--c.refs===0){p.bytes-=c.size;p.chunks.delete(part);}}}
    function pushParts(stack,parts,raw=false){
      if(stack.at(-1)?.raw===raw&&equal(stack.at(-1).parts,parts))return true;
      const p=pool(stack),overhead=raw?0:parts.length*8;
      parts=parts.map(part=>{let c=p.chunks.get(part);if(!c){c={value:part,refs:0,size:encoder.encode(part).byteLength};p.chunks.set(part,c);p.bytes+=c.size;}c.refs++;return c.value;});
      stack.push({parts,raw,overhead});p.bytes+=overhead;
      while(stack.length&&(stack.length>maxEntries||p.bytes>maxBytes))release(p,stack.shift());
      return stack.length>0;
    }
    function push(stack,snapshot){return pushParts(stack,[snapshot],true);}
    function pop(stack){const entry=stack.pop();if(!entry)return null;release(pool(stack),entry);return entry;}
    function record(state,snapshot){pushParts(state.undo,typeof snapshot==='string'?capture(JSON.parse(snapshot)):snapshot);state.redo=[];}
    function transaction(state,fn,render){
      const before=capture(state.doc),view={index:state.index,selected:state.selected,dirty:state.dirty};
      try{fn();if(!equal(capture(state.doc),before)){state.dirty=true;render();record(state,before);return true;}render();return false;}
      catch(error){state.doc=restore(before);Object.assign(state,view);try{render();}catch(_error){}throw error;}
    }
    function travel(state,direction){
      const from=state[direction],to=state[direction==='undo'?'redo':'undo'];if(!from.length)return false;
      const entry=from.at(-1),next=entry.raw?JSON.parse(entry.parts[0]):restore(entry.parts);
      pushParts(to,capture(state.doc));pop(from);state.doc=next;state.index=Math.max(0,Math.min(state.index,next.pages.length-1));state.selected=null;state.dirty=true;return true;
    }
    function bytes(stack){return pool(stack).bytes;}
    return {push,record,transaction,travel,bytes,capture};
  }
  return {create,capture,restore,equal};
});
