'use strict';
(()=>{
  function create({state,MM,Units,Layout,measurement,unitSuffix,pageLabel,selectPage,renderFrame,getPreferences,$}){
    let observer=null;
    let activeMounts=new Map();
    function ensureMounted(index){activeMounts.get(index)?.mount();}
  function getDisplayedPageIndices() {
    if (state.allPages) return state.doc.pages.map((_,i)=>i);
    if (!state.spread) return [state.index];
    const start = Math.floor(state.index / 2)*2;
    return [start, start+1].filter(i => i < state.doc.pages.length);
  }
  // Ruler Rendering
  function drawRuler(canvas,axis,lengthMm,scale) {
    const thickness=26;
    const pixels=lengthMm*scale;
    const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
    const width=axis==='horizontal'?pixels:thickness;
    const height=axis==='vertical'?pixels:thickness;
    canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));
    canvas.style.width=width+'px';canvas.style.height=height+'px';
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.scale(dpr,dpr);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#222';ctx.fillStyle='#111';ctx.lineWidth=1;
    ctx.font='800 9px system-ui, sans-serif';
    for(const mark of Units.rulerMarks(lengthMm,scale,measurement.unit,measurement.perInch)) {
      const pos=Math.round(mark.pixel)+0.5;
      const tick=mark.major?12:5;
      ctx.beginPath();
      if(axis==='horizontal'){ctx.moveTo(pos,thickness);ctx.lineTo(pos,thickness-tick);}
      else {ctx.moveTo(thickness,pos);ctx.lineTo(thickness-tick,pos);}
      ctx.stroke();
      if(!mark.major || mark.pixel===0)continue;
      if(axis==='horizontal'){
        const textWidth=ctx.measureText(mark.label).width;
        if(mark.pixel+3+textWidth<width-2)ctx.fillText(mark.label,mark.pixel+3,10);
      }else{
        const textWidth=ctx.measureText(mark.label).width;
        if(mark.pixel+3+textWidth<height-2){ctx.save();ctx.translate(9,mark.pixel+3);ctx.rotate(Math.PI/2);ctx.fillText(mark.label,0,0);ctx.restore();}
      }
    }
  }
  function attachRulers(wrap,paper,scale) {
    wrap.classList.add('has-rulers');
    const corner=document.createElement('div');corner.className='ruler-corner';corner.setAttribute('aria-hidden','true');
    corner.textContent=unitSuffix();
    const horizontal=document.createElement('canvas');horizontal.className='page-ruler horizontal';horizontal.setAttribute('aria-hidden','true');
    const vertical=document.createElement('canvas');vertical.className='page-ruler vertical';vertical.setAttribute('aria-hidden','true');
    drawRuler(horizontal,'horizontal',paper.width,scale);drawRuler(vertical,'vertical',paper.height,scale);
    wrap.append(corner,horizontal,vertical);
  }

  function renderStage() {
    const stage = $('#pages-stage');const scroll=stage.parentElement;const oldScrollLeft=scroll.scrollLeft;const oldScrollTop=scroll.scrollTop;
    observer?.disconnect();observer=null;
    stage.replaceChildren();stage.classList.toggle('all-pages',state.allPages);
    const scale = MM * state.zoom; const paper = state.doc.paper;
    const virtual=state.allPages&&state.doc.pages.length>24&&typeof IntersectionObserver!=='undefined';
    const mounts=new Map();activeMounts=new Map();
    if(virtual)observer=new IntersectionObserver(entries=>{
      for(const entry of entries){const item=mounts.get(entry.target);if(!item||!entry.target.isConnected)continue;
        if(entry.isIntersecting||item.index===state.index)item.mount();
        else if(!state.moving&&!entry.target.contains(document.activeElement))item.unmount();
      }
    },{root:scroll,rootMargin:'600px'});
    for (const index of getDisplayedPageIndices()) {
      const page = state.doc.pages[index];
      const wrap=document.createElement('div');wrap.className='page-wrapper';
      const label=document.createElement('div'); label.className='page-top-label';label.textContent=page.label && page.label!=='Default'?page.label:pageLabel(index);label.setAttribute('aria-hidden','true');wrap.append(label);
      const surface=document.createElement('div');surface.className='paper'+(index===state.index?' active':'');surface.dataset.page=String(index);surface.setAttribute('role','group');surface.setAttribute('aria-label',`Publication page ${index+1} of ${state.doc.pages.length}: ${page.label||'untitled page'}`);
      surface.style.width=paper.width*scale+'px';surface.style.height=paper.height*scale+'px';
      surface.addEventListener('pointerdown', e=>{if(e.target===surface || e.target.classList.contains('margin-guides') || e.target.classList.contains('page-empty')) selectPage(index);});
      let mounted=false;
      function mount(){if(mounted)return;mounted=true;
      surface.removeAttribute('data-deferred');
      if(state.guides) {const guide=document.createElement('div');guide.className='margin-guides';guide.setAttribute('aria-hidden','true');const margin=paper.margin*scale;Object.assign(guide.style,{top:margin+'px',left:margin+'px',right:margin+'px',bottom:margin+'px'});surface.append(guide);}
      if(state.showColumns && Number(paper.columns||1)>1){
        const layer=document.createElement('div');layer.className='column-guides';layer.setAttribute('aria-hidden','true');
        const bounds=Units.columnBounds(paper);
        for(const start of bounds.starts){const l=document.createElement('div');l.className='column-guide';l.style.left=start*scale+'px';layer.append(l);}
        for(const end of bounds.ends){const l=document.createElement('div');l.className='column-guide edge-end';l.style.left=end*scale+'px';layer.append(l);}
        surface.append(layer);
      }
      for(const part of Layout.masterParts(state.doc,index)){
        const el=document.createElement('div');el.className='master-text-object';el.setAttribute('aria-label','Parent page '+part.type);el.textContent=part.text;
        Object.assign(el.style,{left:part.x*scale+'px',top:part.y*scale+'px',width:part.w*scale+'px',height:part.h*scale+'px',textAlign:part.align,fontSize:(part.size||9)*96/72*state.zoom+'px'});
        if(part.type==='layout')el.classList.add('parent-layout-object');
        surface.append(el);
      }
      if (!page.frames.length && !page.masterId) {const empty=document.createElement('div');empty.className='page-empty';empty.textContent='YOUR BLANK PAGE';empty.setAttribute('aria-hidden','true');surface.append(empty);}
      window.SkoshPublicationLayout.visibleFrames(state.doc,page).forEach(frame => surface.append(renderFrame(frame,index,scale)));
      if(getPreferences().showRulers)attachRulers(wrap,paper,scale);
      }
      function unmount(){if(!mounted)return;mounted=false;surface.replaceChildren();surface.dataset.deferred='true';wrap.querySelectorAll('.page-ruler,.ruler-corner').forEach(el=>el.remove());}
      wrap.append(surface);stage.append(wrap);
      if(getPreferences().showRulers)wrap.classList.add('has-rulers');
      if(!virtual||index===state.index)mount();else surface.dataset.deferred='true';
      if(virtual){const item={index,mount,unmount};mounts.set(wrap,item);activeMounts.set(index,item);observer.observe(wrap);}

    }
    if(state.allPages)scroll.scrollLeft=oldScrollLeft;scroll.scrollTop=oldScrollTop;
  }
    return {renderStage,ensureMounted};
  }
  window.SkoshEditorStage={create};
})();
