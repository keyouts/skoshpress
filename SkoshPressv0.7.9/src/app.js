'use strict';
(() => {
  const MM = 96 / 25.4;
  const Units = window.SkoshUnits;
  const measurement = {unit:'mm',perInch:10,nudge:'pixel'};
  const displayed = mm => Units.display(mm,measurement.unit,measurement.perInch);
  const measured = val => Units.toMm(val,measurement.unit,measurement.perInch);
  const unitSuffix = () => measurement.unit==='custom'?'CU':measurement.unit.toUpperCase();
  function rangeForUnit(selector,minMm,maxMm){const el=$(selector);el.min=String(displayed(minMm));el.max=String(displayed(maxMm));el.step='any';}
  function fitColumns(){const p=state.doc.paper;p.columns=clamp(Math.round(number(p.columns,1)),1,12);p.gutter=clamp(number(p.gutter,5),0,Math.min(25,Math.max(0,(p.width-2*p.margin)/p.columns)));}

  const PRESETS = { a5: [148, 210], a4: [210, 297], letter: [215.9, 279.4], 'half-letter': [139.7, 215.9], square: [200, 200] };
  const FONTS = ['Georgia, serif', "'Times New Roman', serif", 'Arial, sans-serif', "'Trebuchet MS', sans-serif", "'Courier New', monospace"];
  const $ = selector => document.querySelector(selector);
  const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const round = n => Math.round(n * 10) / 10;
  const safe = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const number = (value, fallback) => Number.isFinite(+value) && value !== '' ? +value : fallback;
  const printFont = f => FONTS.includes(f) ? f : (state.doc.fonts || []).some(font => font.id === f) ? `"${f}"` : FONTS[0];
  const newPage = () => ({ id: uid(), frames: [] });
  const defaultStyle = () => ({ font: FONTS[0], fontSize: 11, leading: 1.45 });
  const textFrame = (html, x, y, w, h, label = 'Text frame') => ({ id: uid(), type: 'text', label, x, y, w, h, html: sanitizeHtml(html), style: defaultStyle() });
                                                                            
  // Project Defaults
  function starterProject() {
    const doc={format:'skosh-press-1',version:3,name:'A Skosh Press Project',paper:{preset:'a5',width:148,height:210,margin:16,columns:1,gutter:5},pages:[{...newPage(),label:'Default'}],stories:{},fonts:[]};
    const title=textFrame('<h1>A Skosh Press Project</h1>',16,19,116,38,'Publication title');
    title.style={font:FONTS[0],fontSize:21,leading:1.2};
    const body=textFrame('<p>Start here. Import your manuscript, place images, or replace this text with your own.</p><p>Use Templates to explore book, zine, and pamphlet layouts.</p>',16,65,116,90,'Body text');
    doc.pages[0].frames.push(title,body);
    return doc;
  }
  function builtInTemplate(name) {
    if(name==='Default')return starterProject();
    const d={format:'skosh-press-1',version:3,name:'A Skosh Press Project',paper:{preset:'a5',width:148,height:210,margin:16,columns:1,gutter:5},pages:[newPage()],stories:{},fonts:[]};
    const frame=(html,x,y,w,h,label,size=11)=>{const f=textFrame(html,x,y,w,h,label);f.style.fontSize=size;return f;};
    if(name==='Book'){
      d.pages=[newPage(),newPage()];d.pages[0].label='Cover';d.pages[0].frames.push(frame('<h1>YOUR BOOK TITLE</h1>',20,58,108,50,'Book title',24),frame('<p>Author Name</p>',20,140,108,18,'Author',12));
      d.pages[1].label='Chapter';d.pages[1].frames.push(frame('<h1>CHAPTER ONE</h1>',19,24,110,25,'Chapter heading',18),frame('<p>Write here or import a manuscript to flow across pages.</p>',19,63,110,124,'Chapter body',11));
    } else if(name==='Zine'){
      d.paper={preset:'half-letter',width:139.7,height:215.9,margin:12,columns:1,gutter:5};d.pages=[newPage(),newPage(),newPage(),newPage()];d.pages[0].label='Cover';
      d.pages[0].frames.push(frame('<h1>MAKE SOMETHING SMALL.</h1>',13,25,113,90,'Cover headline',27),frame('<p>A zine by you</p>',13,160,111,25,'Byline',14));
      for(let i=1;i<4;i++)d.pages[i].frames.push(frame(`<h2>PAGE ${i+1}</h2><p>Type, paste, or place your next idea here.</p>`,12,18,114,130,'Zine copy',13));
    } else if(name==='Pamphlet'){
      d.paper={preset:'letter',width:215.9,height:279.4,margin:13,columns:3,gutter:5};d.pages[0].label='Pamphlet';d.pages[0].frames.push(frame('<h1>YOUR PAMPHLET</h1>',15,16,183,30,'Pamphlet title',24));
      for(let i=0;i<3;i++)d.pages[0].frames.push(frame(`<h2>PANEL ${i+1}</h2><p>Arrange this panel for your fold. Guides are for layout reference only.</p>`,13+i*67,65,59,160,'Panel '+(i+1),10));
    }
    return d;
  }
  function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '').slice(0, 5_000_000);
    const allowed = new Set(['P','H1','H2','H3','STRONG','B','EM','I','U','S','BR','UL','OL','LI','SPAN','DIV']);
    const blocked = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','META','LINK','VIDEO','AUDIO']);
    function clean(node) {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.COMMENT_NODE) { child.remove(); continue; }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        if (blocked.has(child.tagName)) { child.remove(); continue; }
        clean(child);
        for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
        if (!allowed.has(child.tagName)) child.replaceWith(...child.childNodes);
      }
    }
    clean(template.content);
    return template.innerHTML;
  }

  const state = { doc: starterProject(), path: null, dirty: false, index: 0, selected: null, zoom: 0.8, spread: false, allPages:false, tab: 'object', guides: true, showColumns:true, snapColumns:true, nudgeHistoryOpen:false, undo: [], redo: [], editing: false, moving: false };
  let toastTimer;
  let hudTimer;
  function hideCoordinates(){ clearTimeout(hudTimer); $('#coordinate-hud').hidden=true; }
  function showCoordinates(frame){
    if(!frame)return;const hud=$('#coordinate-hud');hud.hidden=false;
    $('#coordinate-hud-title').textContent=frame.label.slice(0,36).toUpperCase();
    $('#coordinate-hud-value').textContent=`X ${displayed(frame.x)} · Y ${displayed(frame.y)} ${unitSuffix()}  |  W ${displayed(frame.w)} · H ${displayed(frame.h)}`;
    clearTimeout(hudTimer);hudTimer=setTimeout(()=>hud.hidden=true,1700);
  }
  let lastTextSelection = null;
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if(selection?.rangeCount && selection.anchorNode?.parentElement?.closest('.frame-text')) lastTextSelection = selection.getRangeAt(0).cloneRange();
  });
  function applyFormatting(command, value) {
    if(!lastTextSelection || !lastTextSelection.startContainer.isConnected) { toast('Select text on the page first.'); return; }
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(lastTextSelection);
    const editor=lastTextSelection.startContainer.parentElement?.closest('.frame-text');
    if(!editor) return;
    editor.focus(); document.execCommand(command,false,value);
  }
  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
    $('#status-text').textContent = message;
  }

  const MAX_HISTORY_BYTES=24*1024*1024;
  function pushHistory(stack,snapshot){
    if(snapshot.length>MAX_HISTORY_BYTES){stack.length=0;return;}
    stack.push(snapshot);
    while(stack.length>45 || stack.reduce((sum,item)=>sum+item.length,0)>MAX_HISTORY_BYTES)stack.shift();
  }
  function checkpoint() {pushHistory(state.undo,JSON.stringify(state.doc));state.redo=[];}
  function mutate(fn, opts = {}) {
    checkpoint();
    try { fn(); state.dirty = true; render(opts); }
    catch (error) { state.doc=JSON.parse(state.undo.pop()); state.redo=[]; state.index=clamp(state.index,0,state.doc.pages.length-1); state.selected=null; render(); throw error; }
  }
  // Recovery Scheduling
  let recoveryTimer=null;
  let recoveryReady=false;
  let recoveryPaused=false;
  let recoveryLastSent='';
  function recoveryDocument(){
    const doc=JSON.parse(JSON.stringify(state.doc));
    const editors=document.querySelectorAll('.frame-text[contenteditable="true"]');
    for(const editor of editors){
      const host=editor.closest('.frame');
      const page=editor.closest('.paper');
      const index=Number(page?.dataset.page);
      if(!host || !Number.isInteger(index) || index<0 || index>=doc.pages.length)continue;
      const frame=doc.pages[index].frames.find(f=>f.id===host.dataset.frame && f.type==='text');
      if(frame)frame.html=sanitizeHtml(editor.innerHTML);
    }
    const changedStories=new Set();
    for(const editor of editors){
      const frameId=editor.closest('.frame')?.dataset.frame;
      for(const page of doc.pages)for(const frame of page.frames){
        if(frame.id===frameId && frame.storyId)changedStories.add(frame.storyId);
      }
    }
    for(const id of changedStories){
      if(doc.stories[id])doc.stories[id].html=doc.pages.flatMap(page=>page.frames)
        .filter(frame=>frame.storyId===id).map(frame=>frame.html).join('\n');
    }
    return doc;
  }
  async function snapshotRecovery(){
    if(!state.dirty || recoveryPaused || !recoveryReady || !window.skoshPressAPI?.snapshotRecovery)return;
    try{
      const doc=recoveryDocument();
      const signature=JSON.stringify(doc);
      if(signature===recoveryLastSent)return;
      const result=await window.skoshPressAPI.snapshotRecovery(doc);
      if(result?.saved)recoveryLastSent=signature;
    }catch(error){
      $('#status-text').textContent='Recovery copy could not be saved: '+error.message;
    }
  }
  function scheduleRecovery(){
    if(!state.dirty || recoveryPaused || !recoveryReady || !window.skoshPressAPI?.snapshotRecovery)return;
    clearTimeout(recoveryTimer);
    recoveryTimer=setTimeout(()=>{recoveryTimer=null;void snapshotRecovery();},1400);
  }
  async function clearRecovery(){
    clearTimeout(recoveryTimer);recoveryTimer=null;recoveryLastSent='';
    if(window.skoshPressAPI?.clearRecovery)await window.skoshPressAPI.clearRecovery();
  }
  async function restoreRecovery(){
    if(!window.skoshPressAPI?.checkRecovery)return;
    recoveryPaused=true;
    try{
      const result=await window.skoshPressAPI.checkRecovery();
      if(result?.document){
        validateProject(result.document);
        state.doc=result.document;state.path=null;state.dirty=true;
        state.undo=[];state.redo=[];state.index=0;state.selected=null;
        $('#doc-name').value=state.doc.name;
        render();toast('Recovered unsaved publication. Use Save to keep it as a new .skoshpress file.');
      }
    }catch(error){showError(error);}
    finally{recoveryPaused=false;recoveryReady=true;if(state.dirty)scheduleRecovery();}
  }
  function markDirty() { state.dirty = true; updateHeader(); }

  function updateHeader() {
    $('#dirty-indicator').style.visibility = state.dirty ? 'visible' : 'hidden';
    document.title = `${state.dirty ? '● ' : ''}${state.doc.name} — Skosh Press`;
    window.skoshPressAPI?.reportDirty?.(Boolean(state.dirty));
    if(state.dirty)scheduleRecovery();
  }
  const currentPage = () => state.doc.pages[state.index];
  const selectedFrame = () => currentPage()?.frames.find(f => f.id === state.selected) || null;
  function pageLabel(i) { return (state.doc.pages[i]?.label === 'Default' ? 'DEFAULT · ' : 'PAGE ') + String(i + 1).padStart(2,'0'); }
  function selectPage(index,goTo=false) {
    state.index = clamp(index, 0, state.doc.pages.length - 1);state.selected=null;render();
    if(goTo && state.allPages) document.querySelector(`.paper[data-page="${state.index}"]`)?.scrollIntoView({block:'nearest',inline:'center'});
  }
  function selectFrame(id, pageIndex) {
    const switched = pageIndex !== undefined && pageIndex !== state.index;
    if (pageIndex !== undefined) state.index = pageIndex;
    state.selected = id;
    if(switched && !state.allPages) {renderStage();$('#stage-page-meta').textContent=`PAGE ${state.index+1} OF ${state.doc.pages.length}`;}
    document.querySelectorAll('.frame').forEach(el => el.classList.toggle('selected', el.dataset.frame === id));
    updateHeader(); renderSidebar(); renderInspector();
    showCoordinates(selectedFrame());
  }
  function render(opts = {}) {
    updateHeader(); syncFontFaces(); renderSidebar(); renderStage(); renderInspector();
    $('#page-count').textContent = String(state.doc.pages.length).padStart(2, '0');
    $('#zoom-label').textContent = Math.round(state.zoom * 100) + '%';
    $('#spread-btn').setAttribute('aria-pressed',String(state.spread && !state.allPages));
    $('#single-view-btn').setAttribute('aria-pressed',String(!state.spread && !state.allPages));
    $('#all-pages-btn').setAttribute('aria-pressed',String(state.allPages));
    $('#rulers-btn').setAttribute('aria-pressed',String(preferences.showRulers));
    $('#rulers-btn').setAttribute('aria-label',preferences.showRulers?'Hide page rulers':'Show page rulers');
    $('#stage-mode').textContent=state.allPages?'ALL PAGES · HORIZONTAL':state.spread?'FACING PAGES':'EDITING VIEW';
    $('#canvas-scroll').classList.toggle('all-pages',state.allPages);
    $('#stage-page-meta').textContent = `PAGE ${state.index + 1} OF ${state.doc.pages.length}`;
    $('#word-count-status').textContent = `${documentTextStats().words} WORDS` ;
    $('#page-dims').textContent = `${displayed(state.doc.paper.width)} × ${displayed(state.doc.paper.height)} ${unitSuffix().toLowerCase()}`;
    $('#unit-footer').textContent=unitSuffix();
    document.querySelectorAll('.unit-label').forEach(el=>el.textContent=unitSuffix());
    $('#stage-title').textContent = `${state.doc.paper.preset === 'custom' ? 'CUSTOM' : state.doc.paper.preset.toUpperCase()} / ${state.doc.paper.width > state.doc.paper.height ? 'LANDSCAPE' : 'PORTRAIT'}`;
    if (!opts.keepStatus) $('#status-text').textContent = state.selected ? `${selectedFrame()?.label || 'Frame'} selected` : 'Ready to create something.';
  }
  function renderSidebar() {
    $('#page-list').replaceChildren();
    for (let i = 0; i < state.doc.pages.length; i++) {
      const button = document.createElement('button'); button.type='button'; button.className='page-list-item'+(i===state.index?' active':'');
      button.setAttribute('aria-label',`Select page ${i + 1}`);if(i===state.index)button.setAttribute('aria-current','page'); button.onclick=()=>selectPage(i,true);
      const thumb = document.createElement('div'); thumb.className='page-thumb';thumb.setAttribute('aria-hidden','true');
      const frames = state.doc.pages[i].frames;
      if (frames.some(f => f.type === 'image')) { const b=document.createElement('div');b.className='thumb-block';thumb.append(b); }
      for (let j=0;j<Math.min(4,frames.some(f=>f.type==='text')?3:1);j++) {const l=document.createElement('div');l.className='thumb-line'+(j===2?' short':'');thumb.append(l);}
      const info = document.createElement('div'); const title = document.createElement('div'); title.className='page-row-name'; title.textContent=pageLabel(i); const detail=document.createElement('div');detail.className='page-row-details';detail.textContent=`${frames.length} object${frames.length===1?'':'s'}`;info.append(title,detail);
      button.append(thumb,info); $('#page-list').append(button);
    }
    $('#layers-list').replaceChildren();
    const frames = [...currentPage().frames].reverse();
    if (!frames.length) { const el = document.createElement('span'); el.className='empty-note'; el.textContent='No objects on this page';$('#layers-list').append(el); }
    frames.forEach(f => { const b=document.createElement('button');b.className='layer-item'+(f.id===state.selected?' selected':'');b.title=f.label;b.setAttribute('aria-label',`${f.type==='text'?'Text':'Image'} object: ${f.label}`);b.setAttribute('aria-pressed',String(f.id===state.selected));b.innerHTML=`<span class="layer-glyph">${f.type==='text'?'T':'▧'}</span><span class="layer-name">${safe(f.label)}</span>`;b.onclick=()=>selectFrame(f.id);$('#layers-list').append(b);});
  }
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

  // Canvas Rendering
  function renderStage() {
    const stage = $('#pages-stage');const scroll=stage.parentElement;const oldScrollLeft=scroll.scrollLeft;const oldScrollTop=scroll.scrollTop;
    stage.replaceChildren();stage.classList.toggle('all-pages',state.allPages);
    const scale = MM * state.zoom; const paper = state.doc.paper;
    for (const index of getDisplayedPageIndices()) {
      const page = state.doc.pages[index];
      const wrap=document.createElement('div');wrap.className='page-wrapper';
      const label=document.createElement('div'); label.className='page-top-label';label.textContent=pageLabel(index);label.setAttribute('aria-hidden','true');wrap.append(label);
      const surface=document.createElement('div');surface.className='paper'+(index===state.index?' active':'');surface.dataset.page=String(index);
      surface.style.width=paper.width*scale+'px';surface.style.height=paper.height*scale+'px';
      surface.addEventListener('pointerdown', e=>{if(e.target===surface || e.target.classList.contains('margin-guides') || e.target.classList.contains('page-empty')) selectPage(index);});
      if(state.guides) {const guide=document.createElement('div');guide.className='margin-guides';guide.setAttribute('aria-hidden','true');const margin=paper.margin*scale;Object.assign(guide.style,{top:margin+'px',left:margin+'px',right:margin+'px',bottom:margin+'px'});surface.append(guide);}
      if(state.showColumns && Number(paper.columns||1)>1){
        const layer=document.createElement('div');layer.className='column-guides';layer.setAttribute('aria-hidden','true');
        const bounds=Units.columnBounds(paper);
        for(const start of bounds.starts){const l=document.createElement('div');l.className='column-guide';l.style.left=start*scale+'px';layer.append(l);}
        for(const end of bounds.ends){const l=document.createElement('div');l.className='column-guide edge-end';l.style.left=end*scale+'px';layer.append(l);}
        surface.append(layer);
      }
      if (!page.frames.length) {const empty=document.createElement('div');empty.className='page-empty';empty.textContent='YOUR BLANK PAGE';empty.setAttribute('aria-hidden','true');surface.append(empty);}
      page.frames.forEach(frame => surface.append(renderFrame(frame,index,scale)));
      wrap.append(surface);if(preferences.showRulers)attachRulers(wrap,paper,scale);stage.append(wrap);
    }
    if(state.allPages)scroll.scrollLeft=oldScrollLeft;scroll.scrollTop=oldScrollTop;
  }
  function renderFrame(frame, index, scale) {
    const el=document.createElement('div');el.className='frame'+(frame.id===state.selected && index===state.index?' selected':'');el.dataset.frame=frame.id;
    el.tabIndex=0;el.setAttribute('role','group');el.setAttribute('aria-label',`${frame.type} frame: ${frame.label}. Arrow keys move the selected frame; double-click text to edit.`);
    el.addEventListener('focus',()=>{if(state.selected!==frame.id || state.index!==index)selectFrame(frame.id,index);});
    Object.assign(el.style,{left:frame.x*scale+'px',top:frame.y*scale+'px',width:frame.w*scale+'px',height:frame.h*scale+'px'});
    const content=document.createElement('div');content.className='frame-content';
    if(frame.type==='text') {
      content.classList.add('frame-text'); content.contentEditable='false';content.spellcheck=preferences.spellcheck!==false;content.lang=preferences.spellLanguage||'en-US';content.setAttribute('role','textbox');content.setAttribute('aria-multiline','true');content.setAttribute('aria-label',`Text in ${frame.label} on page ${index + 1}`);content.setAttribute('aria-readonly','true');
      content.style.fontFamily=printFont(frame.style?.font);content.style.fontSize=number(frame.style?.fontSize,11)*96/72*state.zoom+'px';content.style.lineHeight=number(frame.style?.leading,1.45);
      content.innerHTML=sanitizeHtml(frame.html);
      let before;
      content.addEventListener('dblclick',event=>{event.stopPropagation();content.contentEditable='true';content.setAttribute('aria-readonly','false');content.focus();});
      content.addEventListener('focus',()=>{if(!content.isContentEditable)return;before=JSON.stringify(state.doc);state.editing=true;});

      content.addEventListener('input',()=>{if(content.isContentEditable)markDirty();});
      content.addEventListener('pointerdown',e=>{ e.stopPropagation(); if(state.selected!==frame.id || state.index!==index) selectFrame(frame.id,index);if(!content.isContentEditable)el.focus({preventScroll:true}); });
      content.addEventListener('blur',()=>{
        state.editing=false;content.contentEditable='false';content.setAttribute('aria-readonly','true');
        const next=sanitizeHtml(content.innerHTML);
        if(next===frame.html) return;
        if(before) { pushHistory(state.undo,before); state.redo=[]; }
        frame.html=next; state.dirty=true;
        if(frame.storyId) { collectStory(frame.storyId); reflowStory(frame.storyId); }
        render();
      });

      content.addEventListener('paste', event => {event.preventDefault();const plain=event.clipboardData.getData('text/plain'); document.execCommand('insertText',false,plain);});
    } else {
      content.classList.add('frame-image'); const image=document.createElement('img');image.src=frame.src;image.alt=frame.label;image.draggable=false;image.style.objectFit=frame.fit||'cover';content.append(image);
      content.addEventListener('pointerdown', e=>{e.stopPropagation();selectFrame(frame.id,index);el.focus({preventScroll:true});});
    }
    el.addEventListener('pointerdown',e=>{e.stopPropagation();if(index!==state.index || frame.id!==state.selected)selectFrame(frame.id,index);if(!e.target.isContentEditable)el.focus({preventScroll:true});});
    const handle=document.createElement('div');handle.className='frame-handle';handle.textContent='✥ '+frame.label;handle.title='Drag frame';handle.setAttribute('aria-hidden','true');handle.addEventListener('pointerdown',e=>startDrag(e,frame,index,'move'));
    const resize=document.createElement('div');resize.className='resize-handle';resize.title='Resize frame';resize.setAttribute('aria-hidden','true');resize.addEventListener('pointerdown',e=>startDrag(e,frame,index,'resize'));
    el.append(content,handle,resize);
    if(frame.type==='text') requestAnimationFrame(()=> {if(el.isConnected && content.scrollHeight > content.clientHeight + 3 && content.clientHeight) el.classList.add('frame-overflow');});
    return el;
  }
  // Frame Positioning
  function startDrag(event,frame,index,mode) {
    event.preventDefault();event.stopPropagation();
    const startX=event.clientX,startY=event.clientY;const origin={x:frame.x,y:frame.y,w:frame.w,h:frame.h};const scale=MM*state.zoom;
    let moved=false; const target=event.target;target.setPointerCapture(event.pointerId);
    selectFrame(frame.id,index);
    function move(e){const dx=(e.clientX-startX)/scale,dy=(e.clientY-startY)/scale;if(Math.abs(dx)+Math.abs(dy)>.3) moved=true;
      if(mode==='move') {
        const proposed=origin.x+dx;
        const snapped=state.snapColumns?Units.snapX(proposed,frame.w,state.doc.paper,5/scale):proposed;
        frame.x=round(clamp(snapped,0,state.doc.paper.width-frame.w));frame.y=round(clamp(origin.y+dy,0,state.doc.paper.height-frame.h));
      }
      else {frame.w=round(clamp(origin.w+dx,8,state.doc.paper.width-frame.x));frame.h=round(clamp(origin.h+dy,8,state.doc.paper.height-frame.y));}
      const host=target.closest('.frame'); if(host){const sc=MM*state.zoom;Object.assign(host.style,{left:frame.x*sc+'px',top:frame.y*sc+'px',width:frame.w*sc+'px',height:frame.h*sc+'px'});}showCoordinates(frame); }
    function end(){target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',end);target.removeEventListener('pointercancel',end);if(moved){pushHistory(state.undo,JSON.stringify({...state.doc,pages:state.doc.pages.map(p=>({...p,frames:p.frames.map(f=>f.id===frame.id?{...f,...origin}:f)}))}));if(state.undo.length>45)state.undo.shift();state.redo=[];markDirty(); if(frame.storyId && mode==='resize') reflowStory(frame.storyId);render();}}
    target.addEventListener('pointermove',move);target.addEventListener('pointerup',end);target.addEventListener('pointercancel',end);
  }


  const fontChoice = name => FONTS.includes(name) || (state.doc.fonts||[]).some(f=>f.id===name) ? name : FONTS[0];
  function populateFontPicker() {
    const picker=$('#frame-font');const old=picker.value;
    picker.replaceChildren();
    for(const [index,css] of FONTS.entries()){
      const opt=document.createElement('option');opt.value=css;opt.textContent=['Georgia','Times New Roman','Arial','Trebuchet MS','Courier New'][index];picker.append(opt);
    }
    for(const font of state.doc.fonts||[]){const opt=document.createElement('option');opt.value=font.id;opt.textContent=font.name+' (project)';picker.append(opt);}
    picker.value=fontChoice(old);
  }
  const installedFonts=new Map();
  function syncFontFaces() {
    const allowed=new Set();
    for(const font of (state.doc.fonts||[])){
      if(!/^font-[a-z0-9-]{1,70}$/i.test(font.id) || !/^data:font\/(?:ttf|otf|woff2?);base64,[A-Za-z0-9+/]+={0,2}$/.test(font.data))continue;
      allowed.add(font.id);
      const cached=installedFonts.get(font.id);
      if(cached?.data===font.data)continue;
      if(cached)document.fonts.delete(cached.face);
      const face=new FontFace(font.id,`url(\"${font.data}\")`);
      installedFonts.set(font.id,{data:font.data,face});
      face.load().then(()=>{
        if(installedFonts.get(font.id)?.face===face)document.fonts.add(face);
      }).catch(()=>{
        if(installedFonts.get(font.id)?.face===face)installedFonts.delete(font.id);
      });
    }
    for(const [id,cached] of installedFonts){
      if(!allowed.has(id)){document.fonts.delete(cached.face);installedFonts.delete(id);}
    }
  }
  function renderFontList() {
    const host=$('#project-font-list');host.replaceChildren();
    if(!(state.doc.fonts||[]).length){const empty=document.createElement('p');empty.className='empty-note';empty.textContent='No imported fonts in this project.';host.append(empty);return;}
    for(const font of state.doc.fonts){
      const row=document.createElement('div');row.className='project-font-row';row.setAttribute('role','listitem');
      const title=document.createElement('span');title.textContent=font.name;title.title=font.name;title.style.fontFamily=`"${font.id}"`;
      const remove=document.createElement('button');remove.type='button';remove.textContent='✕';remove.title='Remove '+font.name;remove.setAttribute('aria-label','Remove font '+font.name);
      remove.onclick=()=>mutate(()=>{
        state.doc.fonts=state.doc.fonts.filter(f=>f.id!==font.id);
        state.doc.pages.forEach(page=>page.frames.forEach(frame=>{if(frame.type==='text'&&frame.style?.font===font.id)frame.style.font=FONTS[0];}));
        for(const story of Object.values(state.doc.stories||{}))if(story.style?.font===font.id)story.style.font=FONTS[0];
      });
      row.append(title,remove);host.append(row);
    }
  }
  async function importFont() {
    if(!window.skoshPressAPI)return toast('Run Skosh Press in Electron to import fonts.');
    try {
      const file=await window.skoshPressAPI.importFont();if(!file)return;
      if(!/^data:font\/(?:ttf|otf|woff2?);base64,[A-Za-z0-9+/]+={0,2}$/.test(file.data))throw Error('Unsupported font data.');
      const total=(state.doc.fonts||[]).reduce((sum,f)=>sum+Math.floor(f.data.length*3/4),0)+Math.floor(file.data.length*3/4);
      if(total>16*1024*1024)throw Error('Your project font library has reached its 16 MB limit.');
      if((state.doc.fonts||[]).length>=30)throw Error('A project can embed at most 30 fonts.');
      const id='font-'+uid().toLowerCase();
      mutate(()=>{if(!state.doc.fonts)state.doc.fonts=[];state.doc.fonts.push({id,name:file.name.slice(0,64),data:file.data});state.tab='fonts';});
      toast('Embedded font: '+file.name);
    } catch(error){showError(error);}
  }

  function renderInspector() {
    const docTab=state.tab==='document',fontTab=state.tab==='fonts';
    for(const name of ['object','document','fonts']){const tab=$('#tab-'+name);tab.classList.toggle('active',state.tab===name);tab.setAttribute('aria-selected',String(state.tab===name));tab.tabIndex=state.tab===name?0:-1;}
    $('#inspector-object').hidden=docTab||fontTab;$('#inspector-document').hidden=!docTab;$('#inspector-fonts').hidden=!fontTab;
    $('#inspector-context').textContent=fontTab?'LIBRARY':docTab?'PAPER':selectedFrame()?.type.toUpperCase()||'PAGE';
    if(fontTab){renderFontList();return;}
    if(docTab) {
      const p=state.doc.paper;$('#page-preset').value=p.preset;
      $('#page-width').value=displayed(p.width);$('#page-height').value=displayed(p.height);$('#page-margin').value=displayed(p.margin);
      $('#page-columns').value=p.columns||1;$('#page-gutter').value=displayed(p.gutter??5);
      $('#measurement-units').value=measurement.unit;$('#custom-units-per-inch').value=measurement.perInch;$('#custom-unit-controls').hidden=measurement.unit!=='custom';
      $('#nudge-step').value=measurement.nudge;$('#show-guides').checked=state.guides;$('#show-columns').checked=state.showColumns;$('#snap-columns').checked=state.snapColumns;$('#show-rulers').checked=preferences.showRulers;
      for(const key of ['width','height'])rangeForUnit('#page-'+key,50,1000);
      rangeForUnit('#page-margin',0,100);rangeForUnit('#page-gutter',0,25);
      return;
    }
    const f=selectedFrame();$('#no-selection').hidden=!!f;$('#frame-inspector').hidden=!f;if(!f)return;
    $('#frame-kind').textContent=f.type==='text'?'TEXT FRAME':'IMAGE FRAME';
    $('#frame-label').value=f.label;$('#frame-note').value=f.note||'';for(const key of ['x','y','w','h'])$('#frame-'+key).value=displayed(f[key]);
    for(const key of ['x','y','w','h'])rangeForUnit('#frame-'+key,key==='w'||key==='h'?8:0,1000);
    $('#text-inspector').hidden=f.type!=='text';$('#image-inspector').hidden=f.type!=='image';
    if(f.type==='text') {populateFontPicker();$('#frame-font').value=fontChoice(f.style?.font);$('#frame-size').value=f.style?.fontSize||11;$('#frame-leading').value=f.style?.leading||1.45;}
    else $('#image-fit').value=f.fit||'cover';
  }
  function addFrame(kind, options={}) {
    const p=state.doc.paper;const x=p.margin,y=p.margin;let f;
    if(kind==='text') f=textFrame('<p>Double-click to edit your text.</p>',x,y,Math.max(30,p.width-p.margin*2),Math.min(48,p.height-p.margin*2),'Text '+(currentPage().frames.filter(f=>f.type==='text').length+1));
    else f={id:uid(),type:'image',label:options.name||'Image',src:options.src,fit:'cover',x,y,w:Math.min(85,p.width-p.margin*2),h:Math.min(80,p.height-p.margin*2)};
    mutate(()=>{currentPage().frames.push(f);state.selected=f.id;});toast(kind==='text'?'Text frame added. Double-click to edit.':'Image placed. Drag its label to move.');
  }
  function addPage() {mutate(()=>{state.doc.pages.splice(state.index+1,0,newPage());state.index++;state.selected=null;});toast(`Page ${state.index+1} added.`);}
  function duplicateFrame(){const f=selectedFrame();if(!f)return;const copy=clone(f);copy.id=uid();copy.label+=' copy';copy.storyId=undefined;copy.x=clamp(f.x+5,0,state.doc.paper.width-f.w);copy.y=clamp(f.y+5,0,state.doc.paper.height-f.h);mutate(()=>{currentPage().frames.push(copy);state.selected=copy.id;});}
  function deleteFrame(){const f=selectedFrame();if(!f)return;mutate(()=>{currentPage().frames=currentPage().frames.filter(v=>v.id!==f.id);state.selected=null;});}
  function frameChange(prop,value){const f=selectedFrame();if(!f)return;mutate(()=>{const maxX=state.doc.paper.width,maxY=state.doc.paper.height;f[prop]=prop==='w'?round(clamp(value,8,maxX-f.x)):prop==='h'?round(clamp(value,8,maxY-f.y)):prop==='x'?round(clamp(value,0,maxX-f.w)):round(clamp(value,0,maxY-f.h));if(f.storyId && (prop==='w'||prop==='h'))reflowStory(f.storyId);});}
  function styleChange(key,value){const f=selectedFrame();if(!f||f.type!=='text')return;mutate(()=>{f.style[key]=value;if(f.storyId){const story=state.doc.stories[f.storyId];if(story)story.style=clone(f.style);reflowStory(f.storyId);}});}
  function savePathName(path) {return path?.split(/[\\/]/).pop()||'';}
  async function importManuscript() {
    if(!window.skoshPressAPI){toast('Run with Electron to import manuscripts.');return;}
    try{const result=await window.skoshPressAPI.importManuscript();if(!result)return;const html=sanitizeHtml(result.html);if(!html.trim()){toast('The selected manuscript contains no readable text.');return;}
      mutate(()=>{
        let targetIndex=state.index;if(currentPage().frames.length) {state.doc.pages.splice(targetIndex+1,0,newPage());targetIndex++;}
        const storyId=uid(),p=state.doc.paper;
        const initial={ id:uid(),type:'text',label:result.name||'Imported manuscript',html:'',style:defaultStyle(),storyId,x:p.margin,y:p.margin,w:p.width-p.margin*2,h:p.height-p.margin*2 };
        state.doc.pages[targetIndex].frames.push(initial);
        state.doc.stories[storyId]={id:storyId,name:result.name||'Imported manuscript',html,style:clone(initial.style),geometry:{x:initial.x,y:initial.y,w:initial.w,h:initial.h}};
        reflowStory(storyId);state.index=targetIndex;state.selected=state.doc.pages[targetIndex].frames[0]?.id||null;
      });toast(`Imported “${result.name}” and flowed into pages.`);
    }catch(e){showError(e);}
  }



  let genealogyTree=null;
  let genealogyBatchBusy=false;
  let genealogyBatchStop=false;
  function genealogyReportOptions(){return {
    title:$('#genealogy-report-title').value,mode:$('#genealogy-mode').value,
    density:$('#genealogy-density').value,limit:Number($('#genealogy-limit').value),
    surname:$('#genealogy-surname').value,protectLiving:$('#genealogy-private').checked,
    includeSources:$('#genealogy-citations').checked,surnameIndex:$('#genealogy-surname-index').checked,
    placeIndex:$('#genealogy-place-index').checked,includeNotes:$('#genealogy-notes').checked
  };}
  function genealogyBatchControls(busy){
    genealogyBatchBusy=busy;
    for(const selector of ['#genealogy-import','#genealogy-generate','#genealogy-csv','#genealogy-batch','#genealogy-close'])
      $(selector).disabled=busy || !genealogyTree && selector!=='#genealogy-import' && selector!=='#genealogy-close';
    $('#genealogy-batch-cancel').disabled=!busy;$('#genealogy-batch-cancel').hidden=!busy;
    $('#genealogy-batch-progress').setAttribute('aria-busy',String(busy));
  }
  async function importGenealogy() {
    if(!window.skoshPressAPI?.importGedcom) {toast('Genealogy import requires the installed desktop application.');return;}
    const summary=$('#genealogy-summary');summary.textContent='Opening local GEDCOM file…';
    try {
      const result=await window.skoshPressAPI.importGedcom();
      if(!result){summary.textContent=genealogyTree?'Previous GEDCOM remains loaded.':'No tree imported.';return;}
      genealogyTree={name:result.name};
      $('#genealogy-report-title').value=result.name.slice(0,130)+' — Family History';
      summary.textContent=`${result.name}: ${result.stats.people.toLocaleString()} people · ${result.stats.families.toLocaleString()} families · ${result.stats.sources.toLocaleString()} source records · GEDCOM ${result.version}.`;
      $('#genealogy-warning').textContent=result.warnings.length?result.warnings.slice(0,3).join(' '):'Ready. Review privacy filtering and source details before publication.';
      $('#genealogy-generate').disabled=false;
      $('#genealogy-csv').disabled=false;
      $('#genealogy-batch').disabled=false;
    } catch(error) {summary.textContent='Import failed: '+error.message;toast(error.message);}
  }
  async function generateGenealogy() {
    if(!genealogyTree)return;
    try {
      if(!window.skoshPressAPI?.generateGenealogyPublication)throw Error('This installation is missing the genealogy interface. Reinstall or rebuild Skosh Press.');
      const result=await window.skoshPressAPI.generateGenealogyPublication(genealogyReportOptions());
      if(state.dirty && !confirm('Replace your unsaved publication with the generated research manuscript? Save the current project first if you want to keep it.'))return;
      // Project Isolation
      mutate(()=>{
        state.doc=starterProject();state.doc.name=result.title.slice(0,100);
        state.doc.pages[0].label='Research manuscript';state.doc.pages[0].frames=[];
        state.path=null;state.index=0;state.selected=null;
        const p=state.doc.paper,storyId=uid();
        const first=textFrame('',p.margin,p.margin,p.width-p.margin*2,p.height-p.margin*2,'Genealogy research');
        first.storyId=storyId;first.style.fontSize=10;
        state.doc.pages[0].frames.push(first);
        state.doc.stories[storyId]={id:storyId,name:result.title,html:result.html,style:clone(first.style),geometry:{x:first.x,y:first.y,w:first.w,h:first.h}};
        reflowStory(storyId);
        state.selected=state.doc.pages[0].frames[0]?.id||null;
      });
      if(window.skoshPressAPI?.resetProjectPath)await window.skoshPressAPI.resetProjectPath();
      $('#doc-name').value=state.doc.name;
      $('#genealogy-dialog').close();
      toast(`Created ${result.count} ${result.mode} records with ${result.citations} citation references. Save as .skoshpress.`);
    }catch(error){$('#genealogy-warning').textContent='Could not generate manuscript: '+error.message;showError(error);}
  }

  async function exportGenealogyCsv(){
    if(!genealogyTree||!window.skoshPressAPI?.exportGenealogyCsv)return;
    const status=$('#genealogy-csv-status');status.textContent='Preparing local CSV export…';
    const button=$('#genealogy-csv');button.disabled=true;
    try{
      const result=await window.skoshPressAPI.exportGenealogyCsv({
        type:$('#genealogy-csv-type').value,
        surname:$('#genealogy-surname').value,
        protectLiving:$('#genealogy-private').checked
      });
      if(result){status.textContent=`Saved ${result.count} ${result.type} rows.`;toast(`Saved ${result.count} ${result.type} rows to ${savePathName(result.path)}.`);}
      else status.textContent='CSV export cancelled.';
    }catch(error){status.textContent='CSV export failed: '+error.message;$('#genealogy-warning').textContent='CSV export failed: '+error.message;showError(error);}
    finally{button.disabled=genealogyBatchBusy||!genealogyTree;}
  }

  // Batch Layout
  function makeGenealogyVolume(result){
    const p={preset:'a5',width:148,height:210,margin:16,columns:1,gutter:5};
    const style=defaultStyle();style.fontSize=10;
    const geometry={x:p.margin,y:p.margin,w:p.width-p.margin*2,h:p.height-p.margin*2};
    if(typeof result.html!=='string'||result.html.length>5_000_000)throw Error('Volume text exceeds the 5 MB story limit. Choose fewer entries per volume.');
    const html=sanitizeHtml(result.html);
    const parts=splitRichHtml(html,style,geometry.w,geometry.h);
    if(parts.length>450)throw Error('Volume exceeds the 450-page flow limit. Try fewer records per volume.');
    const storyId=uid();
    const pages=parts.map((part,i)=>{
      const page=newPage();page.label=`Volume ${result.number} · page ${i+1}`;
      if(i)page.autoStory=storyId;
      const frame=textFrame(part,geometry.x,geometry.y,geometry.w,geometry.h,'Genealogy records');
      frame.storyId=storyId;frame.style=clone(style);page.frames.push(frame);
      return page;
    });
    return {format:'skosh-press-1',version:4,name:result.title.slice(0,100),paper:p,pages,
      stories:{[storyId]:{id:storyId,name:result.title.slice(0,200),html,style,geometry}},fonts:[]};
  }
  async function generateGenealogyBatch(){
    if(!genealogyTree || genealogyBatchBusy)return;
    if(!window.skoshPressAPI?.startGenealogyBatch){toast('Reinstall or rebuild Skosh Press for batch publication.');return;}
    let id=null;
    const status=$('#genealogy-batch-status'),progress=$('#genealogy-batch-progress');
    genealogyBatchStop=false;
    genealogyBatchControls(true);
    status.textContent='Choose a destination folder for the volumes…';
    try{
      const size=Number($('#genealogy-volume-size').value);
      const started=await window.skoshPressAPI.startGenealogyBatch({...genealogyReportOptions(),volumeSize:size});
      if(!started){status.textContent='Batch cancelled before creating files.';return;}
      id=started.id;
      progress.hidden=false;progress.max=started.volumeCount;progress.value=0;
      progress.setAttribute('aria-valuetext',`0 of ${started.volumeCount} volumes complete`);
      for(let i=0;i<started.volumeCount;i++){
        if(genealogyBatchStop){status.textContent='Cancelling batch publication…';break;}
        await new Promise(resolve=>setTimeout(resolve,0));
        const part=await window.skoshPressAPI.nextGenealogyVolume(id);
        status.textContent=`Laying out volume ${part.number} of ${started.volumeCount} · entries ${part.start+1}–${part.end} of ${started.total}…`;
        await new Promise(resolve=>setTimeout(resolve,0));
        const document=makeGenealogyVolume(part);
        const saved=await window.skoshPressAPI.saveGenealogyVolume(id,part.number,document);
        progress.value=i+1;
        progress.setAttribute('aria-valuetext',`${i+1} of ${started.volumeCount} volumes complete`);
        if(saved.complete){
          id=null;
          status.textContent=`Saved ${started.total} entries in ${started.volumeCount} editable volumes to ${saved.folder}. Open any .skoshpress volume from File → Open; review and export PDFs individually.`;
          toast(`Batch complete: ${started.volumeCount} editable volumes created.`);
        }else status.textContent=`Saved ${i+1} of ${started.volumeCount} volumes (${saved.pages} pages in the latest volume).`;
      }
      if(id){await window.skoshPressAPI.cancelGenealogyBatch(id);id=null;status.textContent='Batch cancelled. Incomplete output removed; the current project was unchanged.';}
    }catch(error){
      status.textContent='Batch publication failed: '+error.message;
      if(id)try{await window.skoshPressAPI.cancelGenealogyBatch(id);}catch(_error){}
      showError(error);
    }finally{
      genealogyBatchControls(false);
      progress.hidden=true;
    }
  }

  function splitRichHtml(html, style, widthMm, heightMm) {
    const source=document.createElement('div');source.innerHTML=sanitizeHtml(html);
    const walker=document.createTreeWalker(source,NodeFilter.SHOW_TEXT);
    const nodes=[];let pos=0;while(walker.nextNode()){const node=walker.currentNode;nodes.push({node,start:pos,end:pos+node.textContent.length});pos+=node.textContent.length;}
    if(pos===0)return [source.innerHTML];
    const plain=source.textContent;
    const tester=document.createElement('div');tester.className='frame-text';tester.setAttribute('aria-hidden','true');
    Object.assign(tester.style,{position:'fixed',top:'-20000px',left:'-20000px',width:widthMm*MM+'px',height:'auto',overflow:'visible',display:'flow-root',fontFamily:printFont(style.font),fontSize:(style.fontSize||11)*96/72+'px',lineHeight:style.leading||1.45,padding:'0',margin:'0',visibility:'hidden'});
    document.body.append(tester);
    function point(offset) {for(const item of nodes)if(offset<=item.end)return [item.node,clamp(offset-item.start,0,item.node.textContent.length)];return [nodes[nodes.length-1].node,nodes[nodes.length-1].node.textContent.length];}
    function fragmentHtml(start,end) {const range=document.createRange();const a=point(start),b=point(end);range.setStart(...a);range.setEnd(...b);const buffer=document.createElement('div');buffer.append(range.cloneContents());return buffer.innerHTML;}
    function fits(start,end) {tester.innerHTML=fragmentHtml(start,end);return tester.scrollHeight <= heightMm*MM+1;}
    const parts=[];let start=0;let safety=0;
    try {
      while(start<pos && safety++<450){
        if(fits(start,pos)){parts.push(fragmentHtml(start,pos));break;}
        let lo=start+1,hi=pos,best=start+1;
        while(lo<=hi){const mid=Math.floor((lo+hi)/2);if(fits(start,mid)){best=mid;lo=mid+1;}else hi=mid-1;}
        if(best<pos){let boundary=best;while(boundary>Math.max(start+1,best-90) && !/[\s\-]/.test(plain[boundary-1]||''))boundary--;if(boundary>start+Math.min(8,Math.floor((best-start)/2)))best=boundary;}
        best=Math.max(start+1,best);parts.push(fragmentHtml(start,best));start=best;
      }
      if(start<pos && safety>=450)throw new Error('Manuscript exceeds the 450-page automatic-flow limit.');
      return parts.length?parts:[source.innerHTML];
    } finally {tester.remove();}
  }
  function frameChain(id) {const all=[];state.doc.pages.forEach((p,i)=>p.frames.forEach(f=>{if(f.storyId===id)all.push({frame:f,index:i});}));return all;}
  function collectStory(id) {const chain=frameChain(id);const story=state.doc.stories[id];if(!story||!chain.length)return;story.html=chain.map(c=>c.frame.html).join('\n');}
  function reflowStory(id) {
    const story=state.doc.stories[id];if(!story)return;
    const chain=frameChain(id);if(!chain.length)return;
    const startIndex=chain[0].index,master=chain[0].frame,geometry={x:master.x,y:master.y,w:master.w,h:master.h};
    const style=clone(story.style||master.style||defaultStyle());
    const chunks=splitRichHtml(story.html,style,geometry.w,geometry.h);

    for(const page of state.doc.pages)page.frames=page.frames.filter(f=>f.storyId!==id);
    let slot=startIndex;
    for(let j=0;j<chunks.length;j++){
      if(j>0) {
        if(state.doc.pages[slot+1]?.autoStory===id && !state.doc.pages[slot+1].frames.length) slot++;
        else {state.doc.pages.splice(slot+1,0,{...newPage(),autoStory:id});slot++;}
      }
      const frame={...clone(master),id:j===0?master.id:uid(),html:chunks[j],style:clone(style),storyId:id,...geometry};
      state.doc.pages[slot].frames.push(frame);
    }

    for(let i=state.doc.pages.length-1;i>startIndex;i--) if(state.doc.pages[i].autoStory===id && state.doc.pages[i].frames.length===0)state.doc.pages.splice(i,1);
    state.index=clamp(state.index,0,state.doc.pages.length-1);
  }
  function flowSelectedFrame() {
    const f=selectedFrame();if(!f||f.type!=='text')return;
    mutate(()=>{if(!f.storyId){const id=uid();f.storyId=id;state.doc.stories[id]={id,name:f.label,html:f.html,style:clone(f.style),geometry:{x:f.x,y:f.y,w:f.w,h:f.h}};}else collectStory(f.storyId);
      const currentId=f.storyId;reflowStory(currentId);state.selected=frameChain(currentId)[0]?.frame.id||null;
    });toast('Text reflowed into linked page frames.');
  }
  function printHtml(booklet = false) {
    const p=state.doc.paper;
    function framesFor(page, offsetX = 0) {
      if(!page) return '';
      return page.frames.map(f=>{
        const coords=`left:${round(f.x+offsetX)}mm;top:${f.y}mm;width:${f.w}mm;height:${f.h}mm;`;
        if(f.type==='image') return `<div class="print-frame" style="${coords}"><img alt="" src="${safe(f.src)}" style="width:100%;height:100%;object-fit:${f.fit==='contain'?'contain':'cover'}"></div>`;
        const style=f.style||defaultStyle();
        return `<div class="print-frame print-text" style="${coords}font-family:${printFont(style.font)};font-size:${clamp(number(style.fontSize,11),6,150)}pt;line-height:${clamp(number(style.leading,1.45),.8,3)}">${sanitizeHtml(f.html)}</div>`;
      }).join('');
    }
    const width=booklet ? p.width*2 : p.width;
    const layouts=[];
    if(booklet){
      for(const [left,right] of window.SkoshPressBooklet.sheets(state.doc.pages.length))
        layouts.push([[left,0],[right,p.width]]);
    } else for(let i=0;i<state.doc.pages.length;i++)layouts.push([[i,0]]);
    const sheets=layouts.map(layout=>`<div class="print-page">${layout.map(([index,x])=>framesFor(state.doc.pages[index],x)).join('')}</div>`).join('');
    const css=`@page{size:${width}mm ${p.height}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:#161616}.print-page{width:${width}mm;height:${p.height}mm;position:relative;overflow:hidden;break-after:page;page-break-after:always}.print-page:last-child{break-after:auto;page-break-after:auto}.print-frame{position:absolute;overflow:hidden;overflow-wrap:anywhere}.print-text p{margin:0 0 .55em}.print-text h1{font-family:inherit;font-size:1.8em;line-height:1.15;margin:0 0 .45em}.print-text h2{font-family:inherit;font-size:1.4em;line-height:1.2;margin:0 0 .5em}.print-text h3{font-family:inherit;font-size:1.15em;margin:0 0 .55em}.print-text ul,.print-text ol{padding-left:1.3em;margin:0 0 .6em}`;
    const fonts=(state.doc.fonts||[]).filter(f=>/^font-[a-z0-9-]{1,70}$/i.test(f.id) && /^data:font\/(?:ttf|otf|woff2?);base64,[A-Za-z0-9+/]+={0,2}$/.test(f.data)).map(f=>`@font-face{font-family:"${f.id}";src:url("${f.data}");font-display:block}`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; script-src 'none'"><style>${fonts}${css}</style></head><body>${sheets}</body></html>`;
  }
  async function exportPdf(booklet=false) {
    if(!window.skoshPressAPI){toast('Open Skosh Press with Electron to export PDF.');return null;}
    try{
      if(booklet && state.doc.pages.length%4!==0)toast('Blank pages will be added to complete the booklet signature.');
      const width=state.doc.paper.width*(booklet?2:1),height=state.doc.paper.height;
      const result=await window.skoshPressAPI.exportPdf(printHtml(booklet),width,height,booklet);
      if(result)toast(`${booklet?'Booklet':'Document'} PDF saved: ${savePathName(result.path)}`);else toast('PDF export canceled.');
      return result;
    }catch(e){showError(e);return null;}
  }
  // Publishing Dialog
  const publicationDescriptions={
    pdf:'PDF: keeps the current page size and positions. This is a general PDF proof, not certified PDF/A or PDF/X.',
    docx:'DOCX: editable manuscript for Word, LibreOffice and editorial teams. Text and headings are kept; custom frames and images are not.',
    epub:'EPUB: accessible, reflowable text for e-readers. Frame positions, custom fonts and images are omitted.',
    html:'HTML: standalone offline page-layout proof, including permitted embedded images and fonts. Review it in a browser.',
    txt:'TXT: simple UTF-8 text for indexing, preservation and handoffs; no styling or images.',
    rtf:'RTF: editable manuscript text for InDesign placement or word processors; page positioning is not retained.',
    sla:'SLA: experimental Scribus project with editable text frames; artwork and complex typography require rebuilding.'
  };
  function describePublicationFormat(){
    const format=$('#publication-export-format').value;
    $('#publication-export-description').textContent=publicationDescriptions[format]||'';
  }
  async function exportSelectedPublication(){
    const format=$('#publication-export-format').value;
    const status=$('#publication-export-status'),button=$('#publication-export-submit');
    if(!window.skoshPressAPI){status.textContent='Use the Electron application to export files.';toast(status.textContent);return;}
    button.disabled=true;button.setAttribute('aria-busy','true');
    status.textContent=`Preparing ${format.toUpperCase()} export…`;
    try{
      let result;
      if(format==='pdf')result=await exportPdf(false);
      else if(['rtf','sla'].includes(format))result=await exportInterchange(format);
      else result=await window.skoshPressAPI.exportPublication(state.doc,format,format==='html'?printHtml(false):null);
      if(result){
        status.textContent=`${format.toUpperCase()} export saved. Review the output before submission.`;
        if(!['pdf','rtf','sla'].includes(format)){$('#interchange-dialog').close();toast(`Exported ${savePathName(result.path)}. Review before submission.`);}
      }else status.textContent='No file exported. The operation was cancelled or unsuccessful.';
    }catch(error){status.textContent='Publication export failed: '+error.message;showError(error);}
    finally{button.disabled=false;button.removeAttribute('aria-busy');}
  }
  async function exportInterchange(format){
    if(!window.skoshPressAPI?.exportInterchange){toast('Run with Electron to export interchange files.');return null;}
    try{
      const result=await window.skoshPressAPI.exportInterchange(state.doc,format);
      if(result){$('#interchange-dialog').close();toast(`Exported ${savePathName(result.path)}. Review the layout in the target application.`);}
      return result;
    }catch(error){showError(error);return null;}
  }
  // Project Saving
  async function save(saveAs=false) {
    if(!window.skoshPressAPI){toast('Open Skosh Press with Electron to save files.');return false;}

    if(document.activeElement?.isContentEditable || ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))document.activeElement.blur();
    try{
      const snapshot=JSON.stringify(state.doc);
      const result=await window.skoshPressAPI.saveProject(state.doc,saveAs);
      if(!result)return false;
      state.path=result.path;

      state.dirty=JSON.stringify(state.doc)!==snapshot;
      clearTimeout(recoveryTimer);recoveryTimer=null;recoveryLastSent='';
      updateHeader();toast(`Saved ${savePathName(result.path)}`);
      return !state.dirty;
    }catch(e){showError(e);return false;}
  }
  async function open() {if(!window.skoshPressAPI){toast('Open Skosh Press with Electron to open projects.');return;}if(state.dirty && !confirm('Discard unsaved changes and open another project?'))return;try{const result=await window.skoshPressAPI.openProject();if(!result)return;validateProject(result.project);recoveryPaused=true;await clearRecovery();state.doc=result.project;state.path=result.path;state.dirty=false;state.undo=[];state.redo=[];state.index=0;state.selected=null;$('#doc-name').value=state.doc.name;render();recoveryPaused=false;toast(result.migrated?`Imported ${result.sourceName}; Save creates a new .skoshpress file.`:`Opened ${savePathName(result.path)}`);}catch(e){recoveryPaused=false;showError(e);}}
  function validateProject(doc) {
    if(!doc||doc.format!=='skosh-press-1'||!Array.isArray(doc.pages)||doc.pages.length<1||doc.pages.length>700||!doc.paper||doc.paper.width<50||doc.paper.width>1000||doc.paper.height<50||doc.paper.height>1000)throw Error('Invalid or unsupported Skosh Press project.');
    doc.stories=doc.stories && typeof doc.stories==='object'?doc.stories:{};doc.fonts=Array.isArray(doc.fonts)?doc.fonts:[];
    doc.pages.forEach(page=>{if(!Array.isArray(page.frames)||page.frames.length>300)throw Error('This project has an invalid frame list.');page.frames.forEach(f=>{if(!['text','image'].includes(f.type)||typeof f.id!=='string'||!Number.isFinite(f.x)||!Number.isFinite(f.y)||!Number.isFinite(f.w)||!Number.isFinite(f.h))throw Error('A frame in this project is invalid.');if(f.note!==undefined && (typeof f.note!=='string'||f.note.length>2000))throw Error('Invalid object note.');if(f.type==='text'){f.html=sanitizeHtml(f.html);f.style=f.style||defaultStyle();}else if(typeof f.src!=='string'||!/^data:image\/(?:png|jpe?g|webp|gif);base64,/.test(f.src))throw Error('Image source is invalid.');});});
  }
  async function freshProject() {if(state.dirty&&!confirm('Start a new project? Unsaved changes will be lost.'))return;recoveryPaused=true;await clearRecovery();state.doc=starterProject();state.path=null;state.undo=[];state.redo=[];state.dirty=false;state.index=0;state.selected=null;$('#doc-name').value=state.doc.name;if(window.skoshPressAPI?.resetProjectPath)await window.skoshPressAPI.resetProjectPath();render();recoveryPaused=false;toast('New blank publication created.');}
  function changeZoom(next){state.zoom=clamp(Math.round(next*20)/20,0.25,1.8);render();}
  function fitCanvas(){const box=$('#canvas-scroll');const count=state.allPages?1:state.spread?2:1;const horizontal=(box.clientWidth-115-(count-1)*34)/(state.doc.paper.width*MM*count);const vertical=(box.clientHeight-124)/(state.doc.paper.height*MM);changeZoom(Math.min(horizontal,vertical,1.5));}
  function undo(){if(!state.undo.length)return;pushHistory(state.redo,JSON.stringify(state.doc));state.doc=JSON.parse(state.undo.pop());state.index=clamp(state.index,0,state.doc.pages.length-1);state.selected=null;state.dirty=true;$('#doc-name').value=state.doc.name;render();}
  function redo(){if(!state.redo.length)return;pushHistory(state.undo,JSON.stringify(state.doc));state.doc=JSON.parse(state.redo.pop());state.index=clamp(state.index,0,state.doc.pages.length-1);state.selected=null;state.dirty=true;$('#doc-name').value=state.doc.name;render();}
  function showError(error){console.error(error);toast(error?.message||'Unexpected error.');}

  const PREF_KEY='skoshpress-accessibility-v1';
  const LEGACY_PREF_KEY='tinypress-accessibility-v1';
  const DEFAULT_PREFS={theme:'light',largeText:false,highContrast:false,reducedMotion:false,largeHandles:false,simpleStage:false,showRulers:true,spellcheck:true,spellLanguage:'en-US'};
  function localGet(key){try{return localStorage.getItem(key);}catch(_err){return null;}}
  function localSet(key,value){try{localStorage.setItem(key,value);}catch(_err){}}
  function loadPreferences(){
    try {const raw=JSON.parse(localGet(PREF_KEY)||localGet(LEGACY_PREF_KEY)||'null');
      if(raw && typeof raw==='object')return {...DEFAULT_PREFS,...Object.fromEntries(Object.keys(DEFAULT_PREFS).filter(k=>k==='theme'?['light','dark','system'].includes(raw[k]):k==='spellLanguage'?['en-US','en-GB','en-CA','en-AU','fr','de','es'].includes(raw[k]):typeof raw[k]==='boolean').map(k=>[k,raw[k]]))};
    } catch(_error){}
    return {...DEFAULT_PREFS,theme:localGet('layoutlist-theme')==='dark'?'dark':'light'};
  }
  function applyPreferences(next){
    const root=document.documentElement;
    root.dataset.theme=next.theme==='system'?((typeof matchMedia==='function' && matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'):next.theme;
    for(const [prop,key] of [['largeText','large-text'],['highContrast','high-contrast'],['reducedMotion','reduced-motion'],['largeHandles','large-handles'],['simpleStage','simple-stage']])root.setAttribute(`data-${key}`,String(Boolean(next[prop])));
    document.querySelectorAll('.frame-text').forEach(el=>{el.spellcheck=next.spellcheck!==false;el.lang=next.spellLanguage||'en-US';});
    window.skoshPressAPI?.setSpelling?.(next.spellcheck!==false,next.spellLanguage||'en-US').catch(()=>{});
  }
  function setPreferences(next){preferences={...DEFAULT_PREFS,...next};localSet(PREF_KEY,JSON.stringify(preferences));applyPreferences(preferences);}
  function openSettings(){
    for(const [key,id] of [['largeText','large-text'],['highContrast','high-contrast'],['reducedMotion','reduced-motion'],['largeHandles','large-handles'],['simpleStage','simple-stage']])$('#settings-'+id).checked=preferences[key];
    $('#settings-rulers').checked=preferences.showRulers;$('#settings-theme').value=preferences.theme;$('#settings-spellcheck').checked=preferences.spellcheck;$('#settings-spelling-language').value=preferences.spellLanguage;
    $('#settings-dialog').showModal();refreshDictionaries();
  }
  async function refreshDictionaries(){
    const line=$('#dictionary-status');
    if(!window.skoshPressAPI?.listDictionaries){line.textContent='Offline dictionary management requires Electron.';return;}
    try{const info=await window.skoshPressAPI.listDictionaries();line.textContent=info.platform==='darwin'?'macOS: dictionaries are managed through System Settings.':`Installed locally: ${info.installed.length?info.installed.join(', '):'none'} · Selected: ${$('#settings-spelling-language').value}`;}
    catch(error){line.textContent=`Dictionary information unavailable: ${error.message}`;}
  }


  function bindTactileFeedback(){
    document.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if(!button || button.disabled || preferences.reducedMotion ||
         (typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches))return;
      button.classList.remove('tactile-click');
      void button.offsetWidth;
      button.classList.add('tactile-click');
      setTimeout(()=>button.classList.remove('tactile-click'),190);
    },true);
  }
  function trackUncommittedFields(){

    const inputs=['doc-name','frame-label','frame-note','frame-x','frame-y','frame-w','frame-h',
      'frame-size','frame-leading','page-width','page-height','page-margin','page-columns','page-gutter'];
    inputs.forEach(id=>document.getElementById(id)?.addEventListener('input',()=>markDirty()));
  }
  // Preference Controls
  function bindSettings(){
    onClick('#settings-btn',openSettings);
    onClick('#settings-close',()=>$('#settings-dialog').close());
    onClick('#settings-done',()=>$('#settings-dialog').close());
    onClick('#settings-reset',()=>{setPreferences(DEFAULT_PREFS);openSettingsUpdate();});
    $('#settings-theme').addEventListener('change',e=>setPreferences({...preferences,theme:e.target.value}));
    $('#settings-spellcheck').addEventListener('change',e=>setPreferences({...preferences,spellcheck:e.target.checked}));
    $('#settings-spelling-language').addEventListener('change',e=>{setPreferences({...preferences,spellLanguage:e.target.value});refreshDictionaries();});
    onClick('#dictionary-import',async()=>{
      if(!window.skoshPressAPI?.importDictionary){toast('Open with Electron to import dictionaries.');return;}
      try{const result=await window.skoshPressAPI.importDictionary($('#settings-spelling-language').value);
        if(result){$('#dictionary-status').textContent=`${result.language} dictionary installed. Restart Skosh Press to activate it.`;toast('Dictionary installed; restart Skosh Press.');}
      }catch(error){showError(error);} 
    });
    onClick('#dictionary-words',async()=>{
      if(!window.skoshPressAPI?.importWords){toast('Open with Electron to add personal words.');return;}
      try{const result=await window.skoshPressAPI.importWords();if(result){$('#dictionary-status').textContent=`Added ${result.added} of ${result.total} personal words.`;toast('Personal word list imported.');}}catch(error){showError(error);}
    });
    for(const [key,id] of [['largeText','large-text'],['highContrast','high-contrast'],['reducedMotion','reduced-motion'],['largeHandles','large-handles'],['simpleStage','simple-stage']])$('#settings-'+id).addEventListener('change',e=>setPreferences({...preferences,[key]:e.target.checked}));
    $('#settings-rulers').addEventListener('change',e=>toggleRulers(e.target.checked));
  }
  const onClick=(selector,fn)=>$(selector).addEventListener('click',fn);
  function toggleRulers(enabled){setPreferences({...preferences,showRulers:Boolean(enabled)});render();toast(enabled?'Page rulers shown.':'Page rulers hidden.');}
  function openSettingsUpdate(){for(const [key,id] of [['largeText','large-text'],['highContrast','high-contrast'],['reducedMotion','reduced-motion'],['largeHandles','large-handles'],['simpleStage','simple-stage']])$('#settings-'+id).checked=preferences[key];$('#settings-rulers').checked=preferences.showRulers;$('#settings-theme').value=preferences.theme;$('#settings-spellcheck').checked=preferences.spellcheck;$('#settings-spelling-language').value=preferences.spellLanguage;}
  try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(preferences.theme==='system')applyPreferences(preferences);});}catch(_error){}


  // Editorial Counts
  function documentTextStats(){
    const plain=state.doc.pages.flatMap(p=>p.frames.filter(f=>f.type==='text').map(f=>htmlToPlain(f.html.replace(/<\/(p|h1|h2|h3|li|div)>/gi,' </$1>')))).join(' ');
    return {words:(plain.match(/\S+/g)||[]).length,characters:plain.length,pages:state.doc.pages.length};
  }
  function htmlToPlain(html){const el=document.createElement('div');el.innerHTML=sanitizeHtml(html);return el.textContent||'';}
  const BUITLINS=[['Default','Single editable A5 starter page'],['Book','Cover and chapter spread'],['Zine','Four half-letter pages'],['Pamphlet','Letter-sized three-panel draft']];
  async function refreshTemplates(){
    const host=$('#user-templates');host.replaceChildren();
    if(!window.skoshPressAPI?.listTemplates){host.textContent='User templates are available in the Electron desktop app.';return;}
    try{
      const rows=await window.skoshPressAPI.listTemplates();
      if(!rows.length){host.innerHTML='<p class="empty-note">No saved templates yet.</p>';return;}
      for(const entry of rows){
        const wrap=document.createElement('div');wrap.className='template-owned';wrap.setAttribute('role','listitem');
        const use=document.createElement('button');use.className='template-entry';use.type='button';
        const name=document.createElement('strong');name.textContent=entry.name;const info=document.createElement('small');info.textContent=entry.pages+' page(s) — Start a new project';use.append(name,info);
        use.onclick=async()=>{if(state.dirty && !confirm('Discard unsaved edits and open this template?'))return;try{const doc=await window.skoshPressAPI.loadTemplate(entry.id);if(doc)await startFromTemplate(doc);}catch(e){showError(e);}};
        const del=document.createElement('button');del.type='button';del.className='template-delete';del.textContent='✕';del.setAttribute('aria-label','Delete template '+entry.name);
        del.onclick=async()=>{if(!confirm(`Delete template “${entry.name}”?`))return;try{await window.skoshPressAPI.deleteTemplate(entry.id);await refreshTemplates();}catch(e){showError(e);}};
        wrap.append(use,del);host.append(wrap);
      }
    }catch(e){host.textContent='Could not load templates: '+e.message;}
  }
  async function startFromTemplate(doc){
    validateProject(doc);recoveryPaused=true;await clearRecovery();state.doc=clone(doc);state.doc.name='A Skosh Press Project';
    state.path=null;state.dirty=false;state.undo=[];state.redo=[];state.index=0;state.selected=null;
    $('#doc-name').value=state.doc.name;
    if(window.skoshPressAPI?.resetProjectPath)await window.skoshPressAPI.resetProjectPath();
    $('#templates-dialog').close();render();recoveryPaused=false;toast('New publication created from template.');
  }
  function bindTemplates(){
    const host=$('#builtin-templates');
    for(const [name,desc] of BUITLINS){const b=document.createElement('button');b.type='button';b.className='template-entry';b.setAttribute('role','listitem');
      const t=document.createElement('strong');t.textContent=name;const d=document.createElement('small');d.textContent=desc;b.append(t,d);
      b.onclick=()=>{if(state.dirty&&!confirm('Discard unsaved edits and open a built-in template?'))return;startFromTemplate(builtInTemplate(name)).catch(showError);};host.append(b);}
    onClick('#templates-btn',()=>{$('#templates-dialog').showModal();refreshTemplates();});
    onClick('#templates-close',()=>$('#templates-dialog').close());
    onClick('#template-save',async()=>{
      const name=$('#template-name').value.trim().slice(0,80);
      if(!name){toast('Enter a template name first.');$('#template-name').focus();return;}
      if(!window.skoshPressAPI?.saveTemplate){toast('Templates can only be stored from the Electron app.');return;}
      try{await window.skoshPressAPI.saveTemplate(name,state.doc);$('#template-name').value='';await refreshTemplates();toast('Template saved: '+name);}catch(e){showError(e);}
    });
  }
  function findOccurrences(){
    const query=$('#find-query').value;if(!query)return [];
    const sensitive=$('#find-case').checked;const needle=sensitive?query:query.toLocaleLowerCase();
    const hits=[];
    for(const [pageIndex,page] of state.doc.pages.entries())for(const f of page.frames){
      if(f.type!=='text')continue;
      const txt=htmlToPlain(f.html),hay=sensitive?txt:txt.toLocaleLowerCase();
      let pos=0;while((pos=hay.indexOf(needle,pos))>=0){hits.push({pageIndex,id:f.id,offset:pos});pos+=Math.max(1,needle.length);if(hits.length>25000)return hits;}
    }
    return hits;
  }
  let findPosition=-1;
  function updateEditorialPanel(){
    const stats=documentTextStats();$('#editorial-stats').textContent=`${stats.words.toLocaleString()} words · ${stats.characters.toLocaleString()} characters · ${stats.pages} pages`;
    const host=$('#editorial-notes-list');host.replaceChildren();let count=0;
    state.doc.pages.forEach((page,i)=>page.frames.forEach(f=>{if(!f.note)return;count++;
      const b=document.createElement('button');b.type='button';b.textContent=`Page ${i+1} · ${f.label}: ${f.note.slice(0,160)}`;b.onclick=()=>{$('#find-dialog').close();selectFrame(f.id,i);};host.append(b);
    }));
    if(!count){const p=document.createElement('span');p.className='empty-note';p.textContent='No editorial notes yet.';host.append(p);}
  }
  function highlightHit(hit,query){
    selectFrame(hit.id,hit.pageIndex);
    const target=[...document.querySelectorAll('.frame')].find(el=>el.dataset.frame===hit.id)?.querySelector('.frame-text');
    if(!target)return;
    let start=0;const walker=document.createTreeWalker(target,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const n=walker.currentNode,end=start+n.textContent.length;
      if(hit.offset>=start && hit.offset+query.length<=end){
        const range=document.createRange();range.setStart(n,hit.offset-start);range.setEnd(n,hit.offset-start+query.length);
        const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);target.scrollIntoView({block:'nearest'});break;
      }
      start=end;
    }
  }
  function replaceHtmlText(html,needle,replacement,sensitive,limit=Infinity){
    const root=document.createElement('div');root.innerHTML=sanitizeHtml(html);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let replaced=0;
    while(walker.nextNode() && replaced<limit){
      const node=walker.currentNode,source=node.textContent;const hay=sensitive?source:source.toLocaleLowerCase();const match=sensitive?needle:needle.toLocaleLowerCase();
      let at=0,parts=[];while(at<source.length && replaced<limit){
        const index=hay.indexOf(match,at);if(index<0)break;
        parts.push(source.slice(at,index),replacement);replaced++;at=index+needle.length;
      }
      if(parts.length)node.textContent=parts.join('')+source.slice(at);
    }
    return {html:root.innerHTML,count:replaced};
  }
  function replaceAtTextOffset(html,offset,needle,replacement,sensitive){
    const root=document.createElement('div');root.innerHTML=sanitizeHtml(html);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let position=0;
    const match=sensitive?needle:needle.toLocaleLowerCase();
    while(walker.nextNode()){
      const node=walker.currentNode,end=position+node.textContent.length;
      if(offset>=position && offset+needle.length<=end){
        const start=offset-position;
        const piece=node.textContent.slice(start,start+needle.length);
        if((sensitive?piece:piece.toLocaleLowerCase())===match){
          node.textContent=node.textContent.slice(0,start)+replacement+node.textContent.slice(start+needle.length);
          return {html:root.innerHTML,count:1};
        }
      }
      position=end;
    }
    return {html,count:0};
  }
  function replaceAllInDocument(limit=Infinity){
    const needle=$('#find-query').value,replacement=$('#replace-query').value,sensitive=$('#find-case').checked;
    if(!needle){toast('Enter text to find first.');return;}
    if(!findOccurrences().length){$('#find-result').textContent='Nothing to replace.';return;}
    let total=0;checkpoint();

    for(const [id,story] of Object.entries(state.doc.stories||{})){
      const out=replaceHtmlText(story.html,needle,replacement,sensitive,limit-total);story.html=out.html;total+=out.count;
      if(out.count)reflowStory(id);
    }
    for(const page of state.doc.pages)for(const frame of page.frames){
      if(frame.type!=='text' || frame.storyId || total>=limit)continue;
      const out=replaceHtmlText(frame.html,needle,replacement,sensitive,limit-total);frame.html=out.html;total+=out.count;
    }
    if(total){state.redo=[];state.dirty=true;render();}else state.undo.pop();
    findPosition=-1;updateEditorialPanel();$('#find-result').textContent=`Replaced ${total} occurrence${total===1?'':'s'}.`;
  }
  function bindEditorial(){
    onClick('#find-btn',()=>{$('#find-dialog').showModal();updateEditorialPanel();$('#find-query').focus();});
    onClick('#find-close',()=>$('#find-dialog').close());
    $('#find-query').addEventListener('input',()=>{findPosition=-1;$('#find-result').textContent=`${findOccurrences().length} matches found.`;});
    $('#find-case').addEventListener('change',()=>{findPosition=-1;$('#find-result').textContent=`${findOccurrences().length} matches found.`;});
    onClick('#find-next',()=>{
      const found=findOccurrences();if(!found.length){$('#find-result').textContent='No matches found.';return;}
      findPosition=(findPosition+1)%found.length;$('#find-result').textContent=`Match ${findPosition+1} of ${found.length} · Page ${found[findPosition].pageIndex+1}`;
      highlightHit(found[findPosition],$('#find-query').value);
    });
    onClick('#replace-all',()=>replaceAllInDocument());
    onClick('#replace-current',()=>{
      const hits=findOccurrences();if(!hits.length){$('#find-result').textContent='Nothing to replace.';return;}
      const hit=hits[Math.max(0,Math.min(findPosition,hits.length-1))];
      const frame=state.doc.pages[hit.pageIndex].frames.find(f=>f.id===hit.id);
      if(!frame){$('#find-result').textContent='Match no longer exists.';return;}
      const query=$('#find-query').value,replacement=$('#replace-query').value,sensitive=$('#find-case').checked;
      let edited;
      if(frame.storyId){
        const story=state.doc.stories[frame.storyId];if(!story)return;
        const frames=frameChain(frame.storyId);
        let offset=hit.offset;
        for(const row of frames){if(row.frame.id===hit.id)break;offset+=htmlToPlain(row.frame.html).length;}
        edited=replaceAtTextOffset(story.html,offset,query,replacement,sensitive);
        if(edited.count){checkpoint();story.html=edited.html;reflowStory(frame.storyId);}
      }else{
        edited=replaceAtTextOffset(frame.html,hit.offset,query,replacement,sensitive);
        if(edited.count){checkpoint();frame.html=edited.html;}
      }
      if(edited?.count){state.redo=[];state.dirty=true;render();updateEditorialPanel();findPosition=-1;$('#find-result').textContent='Replaced selected match.';}
      else $('#find-result').textContent='Could not replace across formatting boundaries. Try Replace all or edit that text directly.';
    });
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();$('#find-dialog').showModal();updateEditorialPanel();$('#find-query').focus();}});
  }
  // Revision Interface
  let comparisonBaseline=null;
  function showRevisions(){
    $('#revisions-dialog').showModal();
    if(comparisonBaseline)refreshRevisions();
  }
  function refreshRevisions(){
    if(!comparisonBaseline)return;
    let report;
    try{report=window.SkoshRevisions.compare(comparisonBaseline.document,state.doc);}
    catch(error){showError(error);return;}
    $('#revision-baseline').textContent=`Before: ${comparisonBaseline.name} · After: ${state.doc.name}${state.dirty?' (unsaved changes included)':''}`;
    const breakdown=Object.entries(report.stats).map(([type,count])=>`${count} ${type==='pages'?(count===1?'page':'pages'):type}`).join(' · ');
    $('#revision-summary').textContent=report.total===0?'No differences detected.':`${report.total} change${report.total===1?'':'s'} found${breakdown?' · '+breakdown:''}`;
    const warns=$('#revision-warnings');warns.replaceChildren();
    for(const note of report.notices){const p=document.createElement('p');p.textContent='⚠ '+note;warns.append(p);}
    const list=$('#revision-results');list.replaceChildren();
    if(report.total===0){const row=document.createElement('p');row.className='empty-note';row.textContent='The two versions have no differences in the fields inspected.';list.append(row);return;}
    for(const entry of report.changes){
      const button=document.createElement('button');button.type='button';
      button.setAttribute('aria-label',`${entry.kind}: ${entry.title}. ${entry.detail}${entry.page!==null?`. Page ${entry.page+1}`:''}`);
      const title=document.createElement('strong'),chip=document.createElement('span'),detail=document.createElement('small');
      chip.className='revision-kind';chip.textContent=entry.kind;title.append(chip,document.createTextNode(entry.title));detail.textContent=entry.detail;
      button.append(title,detail);
      if(entry.page===null){button.disabled=true;button.title='This change does not identify a current object.';}
      else button.addEventListener('click',()=>{
        $('#revisions-dialog').close();
        if(entry.frameId&&state.doc.pages[entry.page]?.frames.some(f=>f.id===entry.frameId))selectFrame(entry.frameId,entry.page);
        else selectPage(entry.page,true);
        if(state.allPages)document.querySelector(`.paper[data-page="${entry.page}"]`)?.scrollIntoView({block:'nearest',inline:'center'});
      });
      list.append(button);
    }
  }
  // Revision Controls
  function bindRevisions(){
    onClick('#revisions-btn',showRevisions);
    onClick('#revisions-close',()=>$('#revisions-dialog').close());
    onClick('#revision-refresh',refreshRevisions);
    onClick('#revision-load',async()=>{
      if(!window.skoshPressAPI?.chooseRevisionBaseline){toast('Open Skosh Press in Electron to compare files.');return;}
      try{
        const file=await window.skoshPressAPI.chooseRevisionBaseline();if(!file)return;
        comparisonBaseline=file;$('#revision-refresh').disabled=false;refreshRevisions();
        toast(`Comparing with ${file.name}`);
      }catch(error){showError(error);}
    });
  }

  // Printing Interface
  const LAB_FIELDS={name:'lab-name',sheetWidth:'lab-width',sheetHeight:'lab-height',margin:'lab-margin',binding:'lab-binding',duplex:'lab-duplex',color:'lab-color',copies:'lab-copies',paperPerSheet:'lab-paper-cost',inkPerSide:'lab-ink-cost',staplesPerCopy:'lab-staple-cost'};
  const LAB_NUMBERS=new Set(['sheetWidth','sheetHeight','margin','copies','paperPerSheet','inkPerSide','staplesPerCopy']);
  let printerProfiles=[];
  let selectedPrinterId=null;
  function labForm(){return Object.fromEntries(Object.entries(LAB_FIELDS).map(([key,id])=>[key,LAB_NUMBERS.has(key)?Number($('#'+id).value):$('#'+id).value]));}
  function setLabForm(profile){for(const [key,id] of Object.entries(LAB_FIELDS))$('#'+id).value=profile[key];}
  const costString=n=>n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  function makeLabStats(parent,value,label){const box=document.createElement('div');box.className='lab-stat';const big=document.createElement('strong');big.textContent=String(value);const small=document.createElement('span');small.textContent=label;box.append(big,small);parent.append(box);}
  function labRender(){
    const output=$('#lab-output'),warning=$('#lab-warning'),pairs=$('#lab-pairings');
    output.replaceChildren();warning.replaceChildren();pairs.replaceChildren();
    let p,estimate;
    try{p=window.SkoshPrintLab.valid(labForm());estimate=window.SkoshPrintLab.plan(state.doc,p);}
    catch(error){output.textContent='Check the printing settings: '+error.message;$('#lab-export-pdf').disabled=true;$('#lab-export-booklet').disabled=true;return;}
    const stats=document.createElement('div');stats.className='lab-statgrid';
    makeLabStats(stats,estimate.sheetsPerCopy,'SHEETS PER COPY');
    makeLabStats(stats,estimate.totalSheets,'TOTAL SHEETS');
    makeLabStats(stats,costString(estimate.totalCost),'TOTAL MATERIAL COST');
    makeLabStats(stats,costString(estimate.costPerCopy),'MATERIAL COST PER COPY');
    output.append(stats);
    for(const [label,value] of [['Pages in document',estimate.pages],['Printed sides (all copies)',estimate.totalPrintedSides],['Paper',costString(estimate.paperCost)],['Ink / toner',costString(estimate.inkCost)],['Fastening',costString(estimate.fasteningCost)]]){
      const row=document.createElement('div');row.className='lab-row';const one=document.createElement('span');one.textContent=label;const two=document.createElement('strong');two.textContent=String(value);row.append(one,two);output.append(row);
    }
    for(const msg of estimate.warnings){const p=document.createElement('p');p.className='lab-alert';p.textContent='⚠ '+msg;warning.append(p);}
    if(!estimate.warnings.length){const p=document.createElement('p');p.className='panel-hint';p.textContent='Page size fits the declared sheet dimensions. Make a one-sheet proof to verify printer margins and flip direction.';warning.append(p);}
    if(estimate.mode==='saddle'){
      for(const row of estimate.pairings.slice(0,12)){
        const element=document.createElement('div');element.className='lab-pair';
        const label=document.createElement('strong');label.textContent='Sheet '+row.sheet;
        const front=document.createElement('span');front.textContent='Front: '+row.front.map(n=>n??'blank').join(' | ');
        const back=document.createElement('span');back.textContent='Back: '+row.back.map(n=>n??'blank').join(' | ');
        element.append(label,front,back);pairs.append(element);
      }
      if(estimate.pairings.length>12){const note=document.createElement('p');note.className='panel-hint';note.textContent=`Showing 12 of ${estimate.pairings.length} sheets.`;pairs.append(note);}
    }else pairs.textContent='Loose-leaf publication: no booklet imposition necessary.';
    $('#lab-export-pdf').disabled=false;$('#lab-export-booklet').disabled=estimate.mode!=='saddle';
  }
  function labProfileSelect(){
    const selected=$('#lab-saved-profile');selected.replaceChildren();
    const first=document.createElement('option');first.value='';first.textContent='Unsaved / custom profile';selected.append(first);
    for(const profile of printerProfiles){const option=document.createElement('option');option.value=profile.id;option.textContent=profile.name;selected.append(option);}
    if(!printerProfiles.some(x=>x.id===selectedPrinterId))selectedPrinterId=null;
    selected.value=selectedPrinterId||'';
    $('#lab-delete-profile').disabled=!selectedPrinterId;
  }
  async function openPrintLab(){
    $('#print-lab-dialog').showModal();
    try{printerProfiles=await (window.skoshPressAPI?.listPrinterProfiles?.()||Promise.resolve([]));labProfileSelect();if(selectedPrinterId)setLabForm(printerProfiles.find(x=>x.id===selectedPrinterId));}
    catch(error){$('#lab-profile-status').textContent='Could not load local profiles: '+error.message;}
    labRender();
  }
  // Printing Controls
  function bindPrintLab(){
    onClick('#print-lab-btn',openPrintLab);
    onClick('#print-lab-close',()=>$('#print-lab-dialog').close());
    $('#lab-saved-profile').addEventListener('change',e=>{
      selectedPrinterId=e.target.value||null;
      if(selectedPrinterId){const p=printerProfiles.find(x=>x.id===selectedPrinterId);if(p)setLabForm(p);}
      $('#lab-delete-profile').disabled=!selectedPrinterId;labRender();
    });
    for(const id of Object.values(LAB_FIELDS)){
      $('#'+id).addEventListener('input',labRender);
      $('#'+id).addEventListener('change',labRender);
    }
    onClick('#lab-save-profile',async()=>{
      if(!window.skoshPressAPI?.savePrinterProfile){toast('Printer profile saving requires Electron.');return;}
      try{
        const profile=window.SkoshPrintLab.valid(labForm());
        const result=await window.skoshPressAPI.savePrinterProfile(profile,selectedPrinterId);
        selectedPrinterId=result.id;printerProfiles=await window.skoshPressAPI.listPrinterProfiles();labProfileSelect();
        $('#lab-profile-status').textContent=`Saved printer profile: ${result.name}`;toast('Printer profile saved.');
      }catch(error){$('#lab-profile-status').textContent=error.message;}
    });
    onClick('#lab-delete-profile',async()=>{
      if(!selectedPrinterId||!window.skoshPressAPI?.deletePrinterProfile)return;
      const name=printerProfiles.find(p=>p.id===selectedPrinterId)?.name||'printer';
      if(!confirm(`Delete saved printer profile “${name}”?`))return;
      try{await window.skoshPressAPI.deletePrinterProfile(selectedPrinterId);selectedPrinterId=null;printerProfiles=await window.skoshPressAPI.listPrinterProfiles();labProfileSelect();$('#lab-profile-status').textContent='Printer profile deleted.';}
      catch(error){showError(error);}
    });
    onClick('#lab-export-pdf',()=>{$('#print-lab-dialog').close();exportPdf(false);});
    onClick('#lab-export-booklet',()=>{$('#print-lab-dialog').close();exportPdf(true);});
  }

  // Event Wiring
  function bind() {
    bindSettings(); bindTemplates(); bindEditorial(); bindRevisions(); bindPrintLab();
    const on=(id,fn)=>$(id).addEventListener('click',fn);
    on('#new-btn',()=>freshProject());on('#open-btn',open);on('#save-btn',()=>save(false));on('#save-as-btn',()=>save(true));on('#import-btn',importManuscript);on('#genealogy-btn',()=>$('#genealogy-dialog').showModal());on('#genealogy-close',()=>$('#genealogy-dialog').close());on('#genealogy-import',importGenealogy);on('#genealogy-generate',generateGenealogy);on('#genealogy-csv',exportGenealogyCsv);on('#genealogy-batch',generateGenealogyBatch);on('#genealogy-batch-cancel',()=>{genealogyBatchStop=true;$('#genealogy-batch-status').textContent='Finishing the current step before cancelling…';});on('#text-btn',()=>addFrame('text'));on('#image-btn',async()=>{try{const image=await window.skoshPressAPI?.importImage();if(image)addFrame('image',image);else if(!window.skoshPressAPI)toast('Run with Electron to place images.');}catch(e){showError(e);}});
    on('#pdf-btn',()=>exportPdf(false));on('#booklet-btn',()=>exportPdf(true));
    on('#interchange-btn',()=>$('#interchange-dialog').showModal());
    on('#interchange-close',()=>$('#interchange-dialog').close());
    $('#publication-export-format').addEventListener('change',describePublicationFormat);
    on('#publication-export-submit',exportSelectedPublication);on('#add-page-btn',addPage);on('#sidebar-add-page',addPage);
    on('#single-view-btn',()=>{state.spread=false;state.allPages=false;render();});
    on('#spread-btn',()=>{state.spread=true;state.allPages=false;if(state.zoom>0.7)state.zoom=0.6;render();});
    on('#all-pages-btn',()=>{state.allPages=true;state.spread=false;if(state.zoom>0.7)state.zoom=0.55;render();document.querySelector(`.paper[data-page="${state.index}"]`)?.scrollIntoView({block:'nearest',inline:'center'});});
    on('#rulers-btn',()=>toggleRulers(!preferences.showRulers));
    on('#zoom-out-btn',()=>changeZoom(state.zoom-.1));on('#zoom-in-btn',()=>changeZoom(state.zoom+.1));on('#fit-btn',fitCanvas);
    on('#tab-object',()=>{state.tab='object';renderInspector();});on('#tab-document',()=>{state.tab='document';renderInspector();});on('#tab-fonts',()=>{state.tab='fonts';renderInspector();});on('#font-import-btn',importFont);
    document.querySelector('.inspector-tabs').addEventListener('keydown',event=>{
      const tabs=['object','document','fonts'];const index=tabs.indexOf(state.tab);
      const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
      if(next<0)return;event.preventDefault();state.tab=tabs[next];renderInspector();$('#tab-'+state.tab).focus();
    });
    on('#theme-btn',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;setPreferences({...preferences,theme});});
    $('#doc-name').addEventListener('change',e=>{const value=e.target.value.trim().slice(0,100)||'Untitled Publication';mutate(()=>{state.doc.name=value;});});
    $('#frame-note').addEventListener('change',e=>{const f=selectedFrame();if(f)mutate(()=>{f.note=e.target.value.slice(0,2000);});});
    $('#frame-label').addEventListener('change',e=>{const f=selectedFrame();if(f)mutate(()=>{f.label=e.target.value.trim()||'Untitled frame';});});
    for(const key of ['x','y','w','h'])$('#frame-'+key).addEventListener('change',e=>{const f=selectedFrame();if(f)frameChange(key,measured(number(e.target.value,displayed(f[key]))));});
    $('#frame-font').addEventListener('change',e=>styleChange('font',fontChoice(e.target.value)));
    $('#frame-size').addEventListener('change',e=>styleChange('fontSize',clamp(number(e.target.value,11),6,150)));
    $('#frame-leading').addEventListener('change',e=>styleChange('leading',clamp(number(e.target.value,1.45),.8,3)));
    $('#image-fit').addEventListener('change',e=>{const f=selectedFrame();if(f)mutate(()=>{f.fit=e.target.value==='contain'?'contain':'cover';});});
    document.querySelectorAll('[data-format]').forEach(btn=>btn.addEventListener('mousedown',e=>e.preventDefault()));
    document.querySelectorAll('[data-format]').forEach(btn=>btn.addEventListener('click',()=>{applyFormatting(btn.dataset.format);}));
    $('#paragraph-style').addEventListener('change',e=>{applyFormatting('formatBlock',e.target.value);});
    on('#reflow-btn',flowSelectedFrame);on('#duplicate-btn',duplicateFrame);on('#delete-btn',deleteFrame);
    $('#page-preset').addEventListener('change',e=>{const preset=e.target.value;mutate(()=>{state.doc.paper.preset=preset;if(PRESETS[preset]){state.doc.paper.width=PRESETS[preset][0];state.doc.paper.height=PRESETS[preset][1];fitColumns();}});});
    for(const key of ['width','height'])$('#page-'+key).addEventListener('change',e=>{mutate(()=>{state.doc.paper[key]=clamp(measured(number(e.target.value,displayed(state.doc.paper[key]))),50,1000);state.doc.paper.preset='custom';fitColumns();});});
    $('#page-margin').addEventListener('change',e=>{mutate(()=>{state.doc.paper.margin=clamp(measured(number(e.target.value,displayed(state.doc.paper.margin))),0,Math.min(state.doc.paper.width,state.doc.paper.height)/2-1);fitColumns();});});
    $('#measurement-units').addEventListener('change',e=>{measurement.unit=e.target.value;render();});
    $('#custom-units-per-inch').addEventListener('change',e=>{measurement.perInch=clamp(number(e.target.value,10),.01,100000);render();});
    $('#nudge-step').addEventListener('change',e=>{measurement.nudge=e.target.value==='unit'?'unit':'pixel';});
    $('#page-columns').addEventListener('change',e=>mutate(()=>{state.doc.paper.columns=clamp(Math.round(number(e.target.value,1)),1,12);fitColumns();}));
    $('#page-gutter').addEventListener('change',e=>mutate(()=>{const maximum=Math.min(25,Math.max(0,(state.doc.paper.width-2*state.doc.paper.margin)/Math.max(1,state.doc.paper.columns||1)));state.doc.paper.gutter=clamp(measured(number(e.target.value,displayed(state.doc.paper.gutter??5))),0,maximum);}));
    $('#show-columns').addEventListener('change',e=>{state.showColumns=e.target.checked;renderStage();});
    $('#show-rulers').addEventListener('change',e=>toggleRulers(e.target.checked));
    $('#snap-columns').addEventListener('change',e=>{state.snapColumns=e.target.checked;});
    $('#show-guides').addEventListener('change',e=>{state.guides=e.target.checked;renderStage();});
    on('#duplicate-page-btn',()=>{mutate(()=>{const dup=clone(currentPage());dup.id=uid();dup.autoStory=undefined;dup.frames.forEach(f=>{f.id=uid();delete f.storyId;});state.doc.pages.splice(state.index+1,0,dup);state.index++;state.selected=null;});});
    on('#delete-page-btn',()=>{if(state.doc.pages.length===1){toast('A publication needs at least one page.');return;}mutate(()=>{state.doc.pages.splice(state.index,1);state.index=Math.min(state.index,state.doc.pages.length-1);state.selected=null;});});
    document.addEventListener('keydown',e=>{
      const active=document.activeElement;const inText=active?.isContentEditable;const inInput=active&&['INPUT','TEXTAREA','SELECT'].includes(active.tagName);
      if(e.key==='Escape') {if(inText)active.blur();else {state.selected=null;render();}return;}
      if(inText || inInput) return;
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey && selectedFrame() && (!active || active===document.body || active.classList.contains('frame') || active.classList.contains('layer-item'))){
        e.preventDefault();
        const f=selectedFrame();const step=measurement.nudge==='unit'?Units.mmPerUnit(measurement.unit,measurement.perInch):Units.mmPerUnit('px');
        const delta=step*(e.shiftKey?10:1), before={x:f.x,y:f.y};
        const xDelta=e.key==='ArrowRight'?delta:e.key==='ArrowLeft'?-delta:0;
        const yDelta=e.key==='ArrowDown'?delta:e.key==='ArrowUp'?-delta:0;
        const nx=clamp(f.x+xDelta,0,state.doc.paper.width-f.w),ny=clamp(f.y+yDelta,0,state.doc.paper.height-f.h);
        if(nx!==before.x || ny!==before.y){

          if(!e.repeat || !state.nudgeHistoryOpen)checkpoint();state.nudgeHistoryOpen=true;
          f.x=Number(nx.toFixed(5));f.y=Number(ny.toFixed(5));state.dirty=true;
          const el=[...document.querySelectorAll('.frame')].find(el=>el.dataset.frame===f.id);
          if(el){el.style.left=f.x*MM*state.zoom+'px';el.style.top=f.y*MM*state.zoom+'px';}
          updateHeader();renderInspector();showCoordinates(f);
        }
        return;
      }
      if(e.key==='Delete'||e.key==='Backspace'){if(selectedFrame()){e.preventDefault();deleteFrame();}}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}
    });
    document.addEventListener('keyup',e=>{if(e.key.startsWith('Arrow'))state.nudgeHistoryOpen=false;});

    window.addEventListener('beforeunload',event=>{
      if(!window.skoshPressAPI && state.dirty){event.preventDefault();event.returnValue='';}
    });
    window.skoshPressAPI?.onSaveBeforeClose?.(()=>save(false));
    bindTactileFeedback();
    trackUncommittedFields();
    setInterval(()=>{if(state.dirty)void snapshotRecovery();},10000);
    if(window.skoshPressAPI?.onMenu)window.skoshPressAPI.onMenu(action=>{const commands={new:freshProject,open,save:()=>save(false),saveAs:()=>save(true),import:importManuscript,genealogy:()=>$('#genealogy-dialog').showModal(),font:importFont,templates:()=>$('#templates-btn').click(),find:()=>$('#find-btn').click(),revisions:showRevisions,printlab:openPrintLab,export:()=>exportPdf(false),formats:()=>$('#interchange-dialog').showModal(),scribus:()=>exportInterchange('sla'),indesign:()=>exportInterchange('rtf'),settings:openSettings,theme:()=>$('#theme-btn').click(),undo:()=>{if(document.activeElement?.isContentEditable)document.execCommand('undo');else undo();},redo:()=>{if(document.activeElement?.isContentEditable)document.execCommand('redo');else redo();}};commands[action]?.();});
  }
  let preferences=loadPreferences();applyPreferences(preferences);
  try{$('#doc-name').value=state.doc.name;bind();render();void restoreRecovery();}catch(error){console.error('Skosh Press startup failed',error);const bar=$('#status-text');if(bar)bar.textContent='Startup error: '+error.message;}
})();
