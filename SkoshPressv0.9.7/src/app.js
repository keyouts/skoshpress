'use strict';
(() => {
  const MM = 96 / 25.4;
  const Units = window.SkoshUnits;
  const measurement = {unit:'mm',perInch:10,nudge:'pixel'};
  const displayed = mm => Units.display(mm,measurement.unit,measurement.perInch);
  const measured = val => Units.toMm(val,measurement.unit,measurement.perInch);
  const unitSuffix = () => measurement.unit==='custom'?'CU':measurement.unit.toUpperCase();
  function rangeForUnit(selector,minMm,maxMm){const el=$(selector);el.min=String(displayed(minMm));el.max=String(displayed(maxMm));el.step='any';}
  function fitColumns(){const p=state.doc.paper;p.margin=clamp(number(p.margin,16),0,Math.min(100,Math.min(p.width,p.height)/2-1));p.columns=clamp(Math.round(number(p.columns,1)),1,12);p.gutter=clamp(number(p.gutter,5),0,Math.min(25,Math.max(0,(p.width-2*p.margin)/p.columns)));}

  const PRESETS = { a5: [148, 210], a4: [210, 297], letter: [215.9, 279.4], 'half-letter': [139.7, 215.9], square: [200, 200] };
  const Layout=window.SkoshLayout;
  const Publication=window.SkoshPublicationLayout;
  const Book=window.SkoshBookDesign;
  let extraSelection=[];
  let thumbnailObserver=null;
  const PixelFont=window.SkoshPixelFont;
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
  const effectiveStyle = frame => Layout.effective(state.doc,frame);
  const textFrame = (html, x, y, w, h, label = 'Text frame') => ({ id: uid(), type: 'text', label, x, y, w, h, html: sanitizeHtml(html), style: defaultStyle() });
                                                                            
  // Project Defaults
  function starterProject() {
    const doc={format:'skosh-press-1',version:4,name:'A Skosh Press Project',metadata:{author:'',language:'en',description:'',publisher:'',rights:''},paper:{preset:'a5',width:148,height:210,margin:16,columns:1,gutter:5},pages:[{...newPage(),label:'Default'}],stories:{},fonts:[],textStyles:Layout.defaults(),masters:[],fontDesigns:[]};
    const title=textFrame('<h1>A Skosh Press Project</h1>',16,19,116,38,'Publication title');
    title.style={font:FONTS[0],fontSize:21,leading:1.2};title.styleId='style-title';
    const body=textFrame('<p>Start here. Import your manuscript, place images, or replace this text with your own.</p><p>Use Templates to explore book, zine, and pamphlet layouts.</p>',16,65,116,90,'Body text');
    body.styleId='style-body';doc.pages[0].frames.push(title,body);
    return doc;
  }
  function builtInTemplate(name) {
    if(name==='Default')return starterProject();
    const d={format:'skosh-press-1',version:4,name:'A Skosh Press Project',metadata:{author:'',language:'en',description:'',publisher:'',rights:''},paper:{preset:'a5',width:148,height:210,margin:16,columns:1,gutter:5},pages:[newPage()],stories:{},fonts:[],textStyles:Layout.defaults(),masters:[],fontDesigns:[]};
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
  const {sanitizeHtml,createTextStats}=window.SkoshEditorText;
  const textStats=createTextStats();

  const state = { doc: starterProject(), path: null, dirty: false, index: 0, selected: null, zoom: 0.8, spread: false, allPages:false, tab: 'object', guides: true, showColumns:true, snapColumns:true, nudgeHistoryOpen:false, undo: [], redo: [], editing: false, moving: false };
  let notices;
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
  function toast(message) {notices.show(message);}

  const history=window.SkoshEditorHistory.create();
  function syncHistoryControls(){$('#undo-btn').disabled=!state.undo.length;$('#redo-btn').disabled=!state.redo.length;}
  function checkpoint(){history.record(state,history.capture(state.doc));syncHistoryControls();}
  function mutate(fn,opts={}){
    const selectionBefore=[...extraSelection];
    try{return history.transaction(state,()=>{
      const before=wrapSignatures(state.doc);fn();
      for(const [id,signature] of wrapSignatures(state.doc))if(before.has(id)&&before.get(id)!==signature)reflowStory(id);
    },()=>render(opts));}catch(error){extraSelection=selectionBefore;try{render(opts);}catch(_error){}throw error;}finally{syncHistoryControls();}
  }
  function attempt(action){try{return action();}catch(error){showError(error);return false;}}
  function wrapSignatures(doc){
    const result=new Map();
    for(const [id,story] of Object.entries(doc.stories||{}))if(Book.options(story).wrapImages){
      result.set(id,JSON.stringify(SkoshStoryFlow.frameChain(doc,id).filter(item=>item.page.frames.some(f=>f.type==='image')).map(({page,frame})=>[page.id,frame.x,frame.y,frame.w,frame.h,Publication.visibleFrames(doc,page).filter(f=>f.type==='image').map(f=>[f.id,f.x,f.y,f.w,f.h])])));
    }
    return result;
  }
  function frameInsets(doc,page,frame){
    const opts=Book.options(doc.stories?.[frame.storyId]);
    if(!frame.storyId||!opts.wrapImages||(opts.localWrap&&!opts.bottomNotes))return {left:0,right:0};
    return Book.wrapInsets(frame,Publication.visibleFrames(doc,page));
  }
  function applyInsets(element,doc,page,frame,scale){
    const inset=frameInsets(doc,page,frame);element.style.paddingLeft=inset.left*scale+'px';element.style.paddingRight=inset.right*scale+'px';
  }
  function storyShapes(doc,page,frame){
    const opts=Book.options(doc.stories?.[frame.storyId]);
    return opts.wrapImages&&opts.localWrap&&!opts.bottomNotes?Book.wrapShapes(frame,Publication.visibleFrames(doc,page)):[];
  }
  function composeMarkup(html,opts,notes,shapes){
    const parts=opts.bottomNotes?Book.splitNotes(html,notes,sanitizeHtml):{body:html,notes:''};
    return {body:sanitizeHtml(parts.body),notes:sanitizeHtml(parts.notes),shapes};
  }
  function setComposition(el,parts,scale){
    el.classList.toggle('bottom-notes',Boolean(parts.notes));
    if(!parts.notes&&!parts.shapes.length){el.innerHTML=parts.body;return;}
    el.replaceChildren();const body=document.createElement('div');body.className='composition-body';
    for(const shape of parts.shapes){const float=document.createElement('div');float.className='wrap-exclusion';float.setAttribute('aria-hidden','true');Object.assign(float.style,{cssFloat:shape.side,width:shape.width*scale+'px',height:shape.height*scale+'px',shapeOutside:shape.shape});body.append(float);}
    const template=document.createElement('template');template.innerHTML=parts.body;body.append(template.content);el.append(body);
    if(parts.notes){const note=document.createElement('div');note.className='composition-notes';note.innerHTML=parts.notes;el.append(note);}
  }
  function frameComposition(el,doc,page,frame,scale){
    const story=doc.stories?.[frame.storyId];el.lang=doc.metadata?.language||'en';
    setComposition(el,composeMarkup(frame.html,Book.options(story),story?.notes,storyShapes(doc,page,frame)),scale);
  }
  function printComposition(doc,page,frame){
    const story=doc.stories?.[frame.storyId],parts=composeMarkup(frame.html,Book.options(story),story?.notes,storyShapes(doc,page,frame));
    if(!parts.notes&&!parts.shapes.length)return {cls:'',html:parts.body};
    const floats=parts.shapes.map(s=>`<div class="wrap-exclusion" aria-hidden="true" style="float:${s.side};width:${s.width}mm;height:${s.height}mm;shape-outside:${s.shape}"></div>`).join('');
    return {cls:parts.notes?' bottom-notes':'',html:`<div class="composition-body">${floats}${parts.body}</div>${parts.notes?`<div class="composition-notes">${parts.notes}</div>`:''}`};
  }
  let recoveryReady=false;
  let recoveryPaused=false;
  let saving=false;
  function recoveryDocument(){
    const doc=structuredClone(state.doc);
    const editors=document.querySelectorAll('.frame-text[contenteditable="true"]');
    for(const editor of editors){
      const host=editor.closest('.frame');
      const page=editor.closest('.paper');
      const index=Number(page?.dataset.page);
      if(!host || !Number.isInteger(index) || index<0 || index>=doc.pages.length)continue;
      const frame=doc.pages[index].frames.find(f=>f.id===host.dataset.frame && f.type==='text');
      if(frame)frame.html=sanitizeHtml(editor.innerHTML);
    }
    // Recovery Capture
    if(editingStoryId && doc.stories[editingStoryId]){
      const story=doc.stories[editingStoryId];
      story.html=sanitizeHtml($('#story-editable').innerHTML);
      story.flow=readFlowOptions();try{story.notes=Book.parseNotes($('#story-notes').value);}catch(_error){}
      const chain=SkoshStoryFlow.frameChain(doc,editingStoryId);
      if(chain.length){
        SkoshStoryFlow.reflow(doc,editingStoryId,
          paginateStory(doc,editingStoryId),uid);
      }
    }
    return doc;
  }
  const recovery=window.SkoshEditorRecovery.create({
    enabled:()=>state.dirty&&!state.moving&&!recoveryPaused&&recoveryReady&&Boolean(window.skoshPressAPI?.snapshotRecovery),
    capture:recoveryDocument,
    write:doc=>window.skoshPressAPI.snapshotRecovery(doc),
    clear:()=>window.skoshPressAPI?.clearRecovery?.(),
    onError:error=>{$('#status-text').textContent='Recovery copy could not be saved: '+error.message;}
  });
  const snapshotRecovery=()=>recovery.snapshot();
  const scheduleRecovery=()=>recovery.schedule();
  const clearRecovery=()=>recovery.reset();
  async function restoreRecovery(){
    if(!window.skoshPressAPI?.checkRecovery)return;
    recoveryPaused=true;
    try{
      const result=await window.skoshPressAPI.checkRecovery();
      if(result?.document){
        validateProject(result.document);
        state.doc=result.document;$('#book-index-terms').value=(state.doc.indexTerms||[]).join('\n');state.path=null;state.dirty=true;
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
    const saveState=state.dirty?'Unsaved changes.':'All changes saved.';
    if($('#save-state').textContent!==saveState)$('#save-state').textContent=saveState;
    document.title = `${state.dirty ? '● ' : ''}${state.doc.name} — Skosh Press`;
    window.skoshPressAPI?.reportDirty?.(Boolean(state.dirty));
    if(state.dirty)scheduleRecovery();
  }
  const currentPage = () => state.doc.pages[state.index];
  const selectedFrame = () => currentPage()?.frames.find(f => f.id === state.selected) || null;
  function selectedObjects(){return state.selected?Publication.selectedObjects(state.doc,currentPage(),[state.selected,...extraSelection]):[];}
  function selectionLocked(){return selectedObjects().some(f=>Publication.locked(state.doc,f));}
  function selectedIds(){return new Set(selectedObjects().map(f=>f.id));}
  function pageLabel(i) { return (state.doc.pages[i]?.label === 'Default' ? 'DEFAULT · ' : 'PAGE ') + String(i + 1).padStart(2,'0'); }
  function selectPage(index,goTo=false) {
    const restoreFocus=Boolean(document.activeElement?.closest('#page-list .page-list-item'));
    state.index = clamp(index, 0, state.doc.pages.length - 1);state.selected=null;extraSelection=[];render();
    if(restoreFocus)$('#page-list .page-list-item.active')?.focus({preventScroll:true});
    announceSelection(`Page ${state.index+1} of ${state.doc.pages.length}: ${state.doc.pages[state.index].label||'untitled page'}`);
    if(goTo && state.allPages) document.querySelector(`.paper[data-page="${state.index}"]`)?.scrollIntoView({block:'nearest',inline:'center'});
  }
  function selectFrame(id, pageIndex, extend=false) {
    const target=state.doc.pages[pageIndex??state.index]?.frames.find(f=>f.id===id);
    if(!target||!Publication.visible(state.doc,target)){toast('Show the object layer before selecting this object.');return;}
    const restoreFocus=Boolean(document.activeElement?.closest('#layers-list .layer-item'));
    const restoreCanvasFocus=Boolean(document.activeElement?.classList?.contains('frame') && document.activeElement.dataset.frame===id);
    const switched = pageIndex !== undefined && pageIndex !== state.index;
    if (pageIndex !== undefined) state.index = pageIndex;
    if(extend&&!switched&&state.selected&&id!==state.selected){extraSelection=[...new Set([state.selected,...extraSelection])];extraSelection=extraSelection.filter(item=>item!==id);}
    else if(!extend)extraSelection=[];
    state.selected = id;
    if(state.allPages){ensureMounted(state.index);document.querySelectorAll('.paper').forEach(el=>el.classList.toggle('active',Number(el.dataset.page)===state.index));$('#stage-page-meta').textContent=`PAGE ${state.index+1} OF ${state.doc.pages.length}`;}
    if(switched && !state.allPages) {
      renderStage();$('#stage-page-meta').textContent=`PAGE ${state.index+1} OF ${state.doc.pages.length}`;
      if(restoreCanvasFocus)[...document.querySelectorAll('.frame')].find(el=>el.dataset.frame===id && el.closest('.paper')?.dataset.page===String(state.index))?.focus({preventScroll:true});
    }
    const chosen=selectedIds();document.querySelectorAll('.frame').forEach(el => {const active=chosen.has(el.dataset.frame)&&Number(el.closest('.paper')?.dataset.page)===state.index;el.classList.toggle('selected',active);el.setAttribute('aria-current',String(active));});
    updateHeader(); renderSidebar(); renderInspector(); updateFocusTools();
    if(restoreFocus)[...document.querySelectorAll('#layers-list .layer-item')].find(button=>button.dataset.frame===id)?.focus({preventScroll:true});
    showCoordinates(selectedFrame());
    if(selectedFrame())announceSelection(`${selectedFrame().type} frame ${selectedFrame().label}, page ${state.index+1}`);
  }
  function render(opts = {}) {
    if(!state.selected)extraSelection=[];
    syncHistoryControls();updateHeader(); syncFontFaces(); renderSidebar(); renderStage(); renderInspector();
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
    updateFocusTools();
    $('#word-count-status').textContent = `${documentTextStats().words} WORDS` ;
    $('#page-dims').textContent = `${displayed(state.doc.paper.width)} × ${displayed(state.doc.paper.height)} ${unitSuffix().toLowerCase()}`;
    $('#unit-footer').textContent=unitSuffix();
    document.querySelectorAll('.unit-label').forEach(el=>el.textContent=unitSuffix());
    $('#stage-title').textContent = `${state.doc.paper.preset === 'custom' ? 'CUSTOM' : state.doc.paper.preset.toUpperCase()} / ${state.doc.paper.width > state.doc.paper.height ? 'LANDSCAPE' : 'PORTRAIT'}`;
    if (!opts.keepStatus) $('#status-text').textContent = state.selected ? `${selectedFrame()?.label || 'Frame'} selected` : 'Ready to create something.';
  }
  function announceSelection(message){
    const status=$('#selection-announcement');
    if(!status)return;
    status.textContent=preferences.announceSelection!==false?message:'';
  }
  function renderThumbnail(thumb,index){
    const paper=state.doc.paper,scale=Math.min(44/paper.width,88/paper.height),zoom=scale/MM;
    thumb.replaceChildren();thumb.style.height=Math.round(paper.height*scale)+'px';thumb.style.width=Math.round(paper.width*scale)+'px';
    function position(el,f){Object.assign(el.style,{left:f.x*scale+'px',top:f.y*scale+'px',width:f.w*scale+'px',height:f.h*scale+'px'});thumb.append(el);}
    for(const part of Layout.masterParts(state.doc,index)){
      const el=document.createElement('div');el.className='thumbnail-parent';el.textContent=part.text;el.style.fontSize=(part.size||9)*96/72*zoom+'px';el.style.textAlign=part.align;position(el,part);
    }
    for(const f of Publication.visibleFrames(state.doc,state.doc.pages[index])){
      const el=document.createElement('div');el.className='thumbnail-object';
      if(f.type==='text'){el.classList.add('thumbnail-text');Object.assign(el.style,styleProperties(effectiveStyle(f),zoom));applyParagraphGap(el,effectiveStyle(f));frameComposition(el,state.doc,state.doc.pages[index],f,scale);applyInsets(el,state.doc,state.doc.pages[index],f,scale);}
      else{const img=document.createElement('img');img.alt='';img.loading='lazy';window.SkoshImageCache.preview(img,f.src);img.style.objectFit=f.fit||'cover';el.append(img);}
      position(el,f);
    }
  }
  function beginPageDrag(event,source,grip,list){
    if(event.button!==0)return;event.preventDefault();event.stopPropagation();
    const startY=event.clientY,startX=event.clientX;let target=source,moved=false,point={x:startX,y:startY},animation=0;
    grip.setPointerCapture(event.pointerId);
    function updateTarget(){
      const rect=list.getBoundingClientRect();
      if(point.x<rect.left||point.x>rect.right||point.y<rect.top-24||point.y>rect.bottom+24){target=source;return;}
      if(point.y<rect.top+25)list.scrollTop-=10;else if(point.y>rect.bottom-25)list.scrollTop+=10;
      const el=document.elementFromPoint(point.x,Math.max(rect.top+1,Math.min(rect.bottom-1,point.y)))?.closest('.page-list-item');
      if(el&&list.contains(el))target=Number(el.dataset.pageIndex);
      list.querySelectorAll('.page-drop-target').forEach(b=>b.classList.remove('page-drop-target'));
      list.querySelector(`[data-page-index="${target}"]`)?.classList.add('page-drop-target');
    }
    function tick(){if(!moved||!grip.isConnected)return;updateTarget();animation=requestAnimationFrame(tick);}
    function move(e){point={x:e.clientX,y:e.clientY};if(!moved&&Math.hypot(point.x-startX,point.y-startY)>5){moved=true;grip.classList.add('dragging');tick();}}
    function finish(e){cancelAnimationFrame(animation);for(const type of ['pointermove','pointerup','pointercancel','lostpointercapture'])grip.removeEventListener(type,type==='pointermove'?move:finish);grip.classList.remove('dragging');list.querySelectorAll('.page-drop-target').forEach(b=>b.classList.remove('page-drop-target'));if(moved&&e.type==='pointerup'&&target!==source)reorderPage(source,target);}
    grip.addEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])grip.addEventListener(type,finish);
  }
  function renderSidebar() {
    const list=$('#page-list'),scroll=list.scrollTop;thumbnailObserver?.disconnect();
    thumbnailObserver=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{for(const e of entries){if(!e.target.isConnected)continue;const index=Number(e.target.dataset.index);if(e.isIntersecting||index===state.index){if(!e.target.dataset.mounted){renderThumbnail(e.target,index);e.target.dataset.mounted='true';}}else{e.target.replaceChildren();delete e.target.dataset.mounted;}}}, {root:list,rootMargin:'100px'});
    list.replaceChildren();
    for (let i = 0; i < state.doc.pages.length; i++) {
      const button = document.createElement('button'); button.type='button'; button.className='page-list-item'+(i===state.index?' active':'');
      button.setAttribute('aria-label',`Select page ${i + 1}: ${state.doc.pages[i].label||pageLabel(i)}, ${state.doc.pages[i].frames.length} objects`);if(i===state.index)button.setAttribute('aria-current','page'); button.onclick=()=>selectPage(i,true);
      button.dataset.pageIndex=String(i);
      const grip=document.createElement('span');grip.className='page-reorder-grip';grip.textContent='⋮⋮';grip.title='Drag to reorder page';grip.setAttribute('aria-hidden','true');
      grip.onpointerdown=e=>beginPageDrag(e,i,grip,list);
      grip.onclick=e=>{e.stopPropagation();e.preventDefault();};
      button.onkeydown=e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();reorderPage(i,i+(e.key==='ArrowUp'?-1:1));$('#page-list .active')?.focus();}};
      const thumb = document.createElement('div'); thumb.className='page-thumb';thumb.setAttribute('aria-hidden','true');thumb.dataset.index=i;const scale=Math.min(44/state.doc.paper.width,88/state.doc.paper.height);thumb.style.height=Math.round(scale*state.doc.paper.height)+'px';thumb.style.width=Math.round(scale*state.doc.paper.width)+'px';
      const frames = state.doc.pages[i].frames;
      const info = document.createElement('div'); const title = document.createElement('div'); title.className='page-row-name'; title.textContent=state.doc.pages[i].section?`${i+1}. ${state.doc.pages[i].section.title}`:state.doc.pages[i].label && state.doc.pages[i].label!=='Default'?`${i+1}. ${state.doc.pages[i].label}`:pageLabel(i); const detail=document.createElement('div');detail.className='page-row-details';detail.textContent=`${frames.length} object${frames.length===1?'':'s'}`;info.append(title,detail);
      button.append(grip,thumb,info); list.append(button);if(thumbnailObserver)thumbnailObserver.observe(thumb);if(!thumbnailObserver||i===state.index){renderThumbnail(thumb,i);thumb.dataset.mounted='true';}
    }
    list.scrollTop=scroll;
    const objectList=$('#layers-list'),objectScroll=objectList.scrollTop;objectList.replaceChildren();
    const frames = [...currentPage().frames].reverse(),chosen=selectedIds();
    if (!frames.length) { const el = document.createElement('span'); el.className='empty-note'; el.textContent='No objects on this page';objectList.append(el); }
    frames.forEach(f => { const b=document.createElement('button');b.className='layer-item'+(chosen.has(f.id)?' selected':'');b.title=f.label;b.dataset.frame=f.id;b.setAttribute('aria-label',`${f.type==='text'?'Text':'Image'} object: ${f.label}${f.locked?', locked':''}${f.groupId?', grouped':''}`);b.setAttribute('aria-pressed',String(chosen.has(f.id)));b.setAttribute('aria-keyshortcuts','Delete Backspace');b.innerHTML=`<span class="layer-glyph">${f.type==='text'?'T':'▧'}</span><span class="layer-name">${safe(f.label)}</span>`;if(f.locked||f.groupId){const mark=document.createElement('span');mark.textContent=(f.locked?'🔒':'')+(f.groupId?'▣':'');b.append(mark);}b.disabled=!Publication.visible(state.doc,f);b.onclick=e=>selectFrame(f.id,undefined,e.shiftKey);objectList.append(b);});
    objectList.scrollTop=objectScroll;renderLayerTools();
  }
  function renderLayerTools(){
    const picked=selectedObjects(),blocked=selectionLocked(),linked=picked.some(f=>f.storyId),host=$('#publication-layers');host.replaceChildren();
    $('#object-group').disabled=picked.length<2||blocked||linked||new Set(picked.map(f=>f.layerId||'')).size>1;
    $('#object-ungroup').disabled=blocked||!picked.some(f=>f.groupId);
    $('#object-lock').disabled=!picked.length||linked;$('#object-lock').textContent=blocked?'Unlock':'Lock';
    const select=$('#object-layer');select.replaceChildren();
    for(const [i,l] of [...Publication.layers(state.doc).entries()].reverse()){
      select.add(new Option(l.name,l.id));
      const row=document.createElement('div');row.className='publication-layer-row';const name=document.createElement('span');name.textContent=l.name;name.title=l.name;row.append(name);
      if(l.id){
        const control=(label,text,action,disabled=false)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.title=label;b.setAttribute('aria-label',label);b.disabled=disabled;b.onclick=()=>attempt(action);row.append(b);};
        control((l.visible?'Hide ':'Show ')+l.name,l.visible?'◉':'○',()=>mutate(()=>{l.visible=!l.visible;state.selected=null;extraSelection=[];}));
        control('Rename '+l.name,'✎',()=>openLayerDialog(l));
        control('Move '+l.name+' down','↓',()=>mutate(()=>{const a=state.doc.layers;[a[i-1],a[i-2]]=[a[i-2],a[i-1]];}),i<2);
        control('Move '+l.name+' up','↑',()=>mutate(()=>{const a=state.doc.layers;[a[i-1],a[i]]=[a[i],a[i-1]];}),i===state.doc.layers.length);
        control('Delete '+l.name,'×',()=>{if(state.doc.pages.some(p=>p.frames.some(f=>f.layerId===l.id&&f.locked)))return toast('Unlock objects on this layer before deleting it.');if(!confirm('Delete this layer? Its objects will move to Default.'))return;mutate(()=>{for(const p of state.doc.pages)for(const f of p.frames)if(f.layerId===l.id)delete f.layerId;state.doc.layers=state.doc.layers.filter(x=>x.id!==l.id);});});
      }
      host.append(row);
    }
    select.disabled=!picked.length||blocked||linked;select.value=picked[0]?.layerId||'';
  }
  function openLayerDialog(layer){
    const dialog=$('#layer-dialog');$('#layer-name').value=layer?.name||'';
    $('#layer-confirm').onclick=()=>{const name=$('#layer-name').value.trim().slice(0,64);if(!name)return;if(!layer&&(state.doc.layers||[]).length>=32)return toast('Maximum 32 custom layers.');mutate(()=>{if(layer)layer.name=name;else{state.doc.layers||=[];state.doc.layers.push({id:'layer-'+uid(),name,visible:true});}});dialog.close();};dialog.showModal();$('#layer-name').focus();
  }
  function bindLayoutTools(){
    $('#layer-add').onclick=()=>openLayerDialog(null);$('#layer-cancel').onclick=()=>$('#layer-dialog').close();
    $('#object-group').onclick=()=>{const picked=selectedObjects();if(picked.length<2||selectionLocked()||picked.some(f=>f.storyId)||new Set(picked.map(f=>f.layerId||'')).size>1)return;mutate(()=>{const id='group-'+uid();for(const f of picked)f.groupId=id;extraSelection=[];});};
    $('#object-ungroup').onclick=()=>{if(selectionLocked())return;const picked=selectedObjects();mutate(()=>{for(const f of picked)delete f.groupId;extraSelection=picked.filter(f=>f.id!==state.selected).map(f=>f.id);});};
    $('#object-lock').onclick=()=>{const picked=selectedObjects(),lock=!selectionLocked();if(picked.some(f=>f.storyId))return;mutate(()=>{for(const f of picked)f.locked=lock;});};
    $('#object-layer').onchange=e=>attempt(()=>{const picked=selectedObjects(),id=e.target.value;if(selectionLocked()||picked.some(f=>f.storyId))return;mutate(()=>{for(const f of picked){if(id)f.layerId=id;else delete f.layerId;}if(picked.some(f=>!Publication.visible(state.doc,f)))state.selected=null;});});
    for(const axis of ['x','y'])$('#distribute-'+axis).onclick=()=>{const picked=selectedObjects();if(picked.length<3||selectionLocked()||picked.some(f=>f.groupId))return;mutate(()=>Publication.distribute(picked,axis));};
  }
  function styleProperties(style,zoom=1){
    return {fontFamily:printFont(style.font),fontSize:clamp(number(style.fontSize,11),6,150)*96/72*zoom+'px',
      lineHeight:String(clamp(number(style.leading,1.45),.8,3)),
      textAlign:['left','right','center','justify'].includes(style.align)?style.align:'left',
      letterSpacing:clamp(number(style.tracking,0),-3,12)*zoom+'px',
      textIndent:clamp(number(style.indent,0),0,40)*MM*zoom+'px',
      hyphens:style.hyphenate?'auto':'manual',wordSpacing:clamp(number(style.wordSpacing,0),-2,8)*zoom+'px',fontKerning:style.kerning?'normal':'auto',textWrap:style.pretty?'pretty':'wrap'};
  }
  function applyParagraphGap(el,style){el.style.setProperty('--paragraph-gap',clamp(number(style.paragraphGap,.55),0,2)+'em');
  }
  function masterMarkup(index,offsetX=0){
    const parts=Layout.masterParts(state.doc,index);
    return parts.map(item=>`<div class="print-master" style="position:absolute;left:${round(item.x+offsetX)}mm;top:${round(item.y)}mm;width:${round(item.w)}mm;height:${round(item.h)}mm;text-align:${item.align};font-size:${item.size||9}pt;font-family:Georgia,serif;white-space:${item.type==='layout'?'pre-wrap':'nowrap'};overflow:hidden">${safe(item.text)}</div>`).join('');
  }
  // Canvas Rendering
  const {renderStage,ensureMounted}=window.SkoshEditorStage.create({state,MM,Units,Layout,measurement,unitSuffix,pageLabel,selectPage,renderFrame,getPreferences:()=>preferences,$});
  function renderFrame(frame, index, scale) {
    const el=document.createElement('div');el.className='frame'+(index===state.index && selectedIds().has(frame.id)?' selected':'')+(frame.locked?' object-locked':'');el.dataset.frame=frame.id;if(frame.groupId)el.classList.add('object-grouped');
    el.tabIndex=0;el.setAttribute('role','group');el.setAttribute('aria-label',`${frame.type} frame: ${frame.label}, page ${index+1}`);el.setAttribute('aria-describedby',frame.type==='text'?'frame-editor-help':'frame-image-help');el.setAttribute('aria-current',String(index===state.index && selectedIds().has(frame.id)));
    el.setAttribute('aria-keyshortcuts',frame.type==='text'?'Enter F2 Delete Backspace':'Delete Backspace');
    el.addEventListener('focus',()=>{if(state.selected!==frame.id || state.index!==index)selectFrame(frame.id,index);});
    Object.assign(el.style,{left:frame.x*scale+'px',top:frame.y*scale+'px',width:frame.w*scale+'px',height:frame.h*scale+'px'});
    const content=document.createElement('div');content.className='frame-content';
    if(frame.type==='text') {
      content.classList.add('frame-text'); content.contentEditable='false';content.spellcheck=preferences.spellcheck!==false;content.lang=preferences.spellLanguage||'en-US';content.setAttribute('role','textbox');content.setAttribute('aria-multiline','true');content.setAttribute('aria-label',`Text in ${frame.label} on page ${index + 1}`);content.setAttribute('aria-readonly','true');
      Object.assign(content.style,styleProperties(effectiveStyle(frame),state.zoom));
      applyParagraphGap(content,effectiveStyle(frame));frameComposition(content,state.doc,state.doc.pages[index],frame,scale);
      applyInsets(content,state.doc,state.doc.pages[index],frame,scale);
      let before;
      function beginTextEdit(){
        if(frame.locked)return toast('Unlock this object before editing.');
        if(frame.storyId){openStoryEditor(frame.storyId);return;}
        content.contentEditable='true';content.setAttribute('aria-readonly','false');content.focus();
      }
      content.addEventListener('dblclick',event=>{event.stopPropagation();beginTextEdit();});
      el.addEventListener('keydown',event=>{
        if(event.target!==el || event.altKey || event.ctrlKey || event.metaKey || !['Enter','F2'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();beginTextEdit();
      });
      content.addEventListener('focus',()=>{if(!content.isContentEditable)return;before=history.capture(state.doc);state.editing=true;});

      content.addEventListener('input',()=>{if(content.isContentEditable)markDirty();});
      content.addEventListener('pointerdown',e=>{ e.stopPropagation(); if(e.shiftKey||state.selected!==frame.id || state.index!==index) selectFrame(frame.id,index,e.shiftKey);if(!content.isContentEditable)el.focus({preventScroll:true}); });
      content.addEventListener('blur',()=>{
        state.editing=false;content.contentEditable='false';content.setAttribute('aria-readonly','true');if(frame.storyId)return;
        const next=sanitizeHtml(content.innerHTML);
        if(next===frame.html) return;
        if(before)history.record(state,before);
        frame.html=next; state.dirty=true;
        render();
      });

      content.addEventListener('paste', event => {event.preventDefault();const plain=event.clipboardData.getData('text/plain'); document.execCommand('insertText',false,plain);});
    } else {
      content.classList.add('frame-image'); const image=document.createElement('img');image.decoding='async';image.src=frame.src;image.alt=frame.decorative?'':(frame.alt||'');if(frame.decorative)image.setAttribute('role','presentation');image.draggable=false;image.style.objectFit=frame.fit||'cover';content.append(image);
      content.addEventListener('pointerdown', e=>{e.stopPropagation();selectFrame(frame.id,index,e.shiftKey);el.focus({preventScroll:true});});
    }
    el.addEventListener('pointerdown',e=>{e.stopPropagation();if(e.shiftKey||index!==state.index || frame.id!==state.selected)selectFrame(frame.id,index,e.shiftKey);if(!e.target.isContentEditable)el.focus({preventScroll:true});});
    const handle=document.createElement('div');handle.className='frame-handle';handle.textContent='✥ '+frame.label;handle.title='Drag frame';handle.setAttribute('aria-hidden','true');handle.addEventListener('pointerdown',e=>startDrag(e,frame,index,'move'));
    const resize=document.createElement('div');resize.className='resize-handle';resize.title='Resize frame';resize.setAttribute('aria-hidden','true');resize.addEventListener('pointerdown',e=>startDrag(e,frame,index,'resize'));
    el.append(content,handle,resize);
    if(frame.type==='text') requestAnimationFrame(()=> {if(el.isConnected && content.scrollHeight > content.clientHeight + 3 && content.clientHeight) el.classList.add('frame-overflow');});
    return el;
  }
  // Frame Positioning
  function startDrag(event,frame,index,mode) {
    event.preventDefault();event.stopPropagation();
    if(frame.locked)return;
    if(state.index!==index||!selectedIds().has(frame.id))selectFrame(frame.id,index);
    const picked=mode==='move'?selectedObjects():[frame];
    if(picked.some(f=>f.locked)||mode==='resize'&&(frame.groupId||selectedObjects().length>1))return;
    const origins=picked.map(f=>({frame:f,x:f.x,y:f.y,w:f.w,h:f.h}));
    const origin=origins.find(o=>o.frame===frame)||origins[0],scale=MM*state.zoom,startX=event.clientX,startY=event.clientY,target=event.target;
    let moved=false;target.setPointerCapture(event.pointerId);
    function move(e){
      let dx=(e.clientX-startX)/scale,dy=(e.clientY-startY)/scale;if(Math.abs(dx)+Math.abs(dy)>.3)moved=true;
      if(mode==='move'){
        if(state.snapColumns&&picked.length===1)dx=Units.snapX(origin.x+dx,frame.w,state.doc.paper,5/scale)-origin.x;
        const delta=Publication.translation(origins,state.doc.paper,dx,dy);
        for(const o of origins){o.frame.x=round(o.x+delta.dx);o.frame.y=round(o.y+delta.dy);}
      }else{frame.w=round(clamp(origin.w+dx,8,state.doc.paper.width-frame.x));frame.h=round(clamp(origin.h+dy,8,state.doc.paper.height-frame.y));}
      for(const f of picked){const host=[...document.querySelectorAll('.frame')].find(el=>el.dataset.frame===f.id);if(host)Object.assign(host.style,{left:f.x*scale+'px',top:f.y*scale+'px',width:f.w*scale+'px',height:f.h*scale+'px'});}showCoordinates(frame);
    }
    function end(e){
      for(const type of ['pointermove','pointerup','pointercancel','lostpointercapture'])target.removeEventListener(type,type==='pointermove'?move:end);
      state.moving=false;
      const next=picked.map(f=>({x:f.x,y:f.y,w:f.w,h:f.h}));
      origins.forEach(({frame:f,x,y,w,h})=>Object.assign(f,{x,y,w,h}));
      if(e.type!=='pointerup'||!moved){render();return;}
      try{mutate(()=>{picked.forEach((f,i)=>Object.assign(f,next[i]));if(frame.storyId){if(frameChain(frame.storyId)[0]?.frame.id!==frame.id)frame.manualFlow=true;reflowStory(frame.storyId);}});}catch(error){showError(error);}
    }
    state.moving=true;target.addEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])target.addEventListener(type,end);
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
        for(const style of state.doc.textStyles||[])if(style.style.font===font.id)style.style.font=FONTS[0];
      });
      row.append(title,remove);host.append(row);
    }
  }
  async function importFont() {
    if(!window.skoshPressAPI)return toast('Run Skosh Press in Electron to import fonts.');
    try {
      const file=await window.skoshPressAPI.importFont();if(!file)return;
      embedFont(file);
    } catch(error){showError(error);}
  }
  function embedFont(file){
      if((state.doc.fonts||[]).some(font=>font.data===file.data)){toast('This font is already embedded in the publication.');return;}
      if(!/^data:font\/(?:ttf|otf|woff2?);base64,[A-Za-z0-9+/]+={0,2}$/.test(file.data))throw Error('Unsupported font data.');
      const total=(state.doc.fonts||[]).reduce((sum,f)=>sum+Math.floor(f.data.length*3/4),0)+Math.floor(file.data.length*3/4);
      if(total>16*1024*1024)throw Error('Your project font library has reached its 16 MB limit.');
      if((state.doc.fonts||[]).length>=30)throw Error('A project can embed at most 30 fonts.');
      const id='font-'+uid().toLowerCase();
      mutate(()=>{if(!state.doc.fonts)state.doc.fonts=[];state.doc.fonts.push({id,name:file.name.slice(0,64),data:file.data});state.tab='fonts';});
      toast('Embedded font: '+file.name);
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
      populateMasterPicker();$('#page-label').value=currentPage().label||'';$('#section-title').value=currentPage().section?.title||'';$('#section-start').value=currentPage().section?.start||1;$('#page-move-before').disabled=state.index===0;$('#page-move-after').disabled=state.index===state.doc.pages.length-1;
      const meta=state.doc.metadata||{};
      for(const key of ['author','description','publisher','rights'])$('#metadata-'+key).value=meta[key]||'';
      const language=meta.language||'en';
      const languageSelect=$('#metadata-language');
      languageSelect.value=[...languageSelect.options].some(option=>option.value===language)?language:'other';
      $('#metadata-language-custom').hidden=languageSelect.value!=='other';$('#metadata-language-tag').value=language;
      $('#nudge-step').value=measurement.nudge;$('#show-guides').checked=state.guides;$('#show-columns').checked=state.showColumns;$('#snap-columns').checked=state.snapColumns;$('#show-rulers').checked=preferences.showRulers;
      for(const key of ['width','height'])rangeForUnit('#page-'+key,50,1000);
      rangeForUnit('#page-margin',0,Math.min(100,Math.min(p.width,p.height)/2-1));rangeForUnit('#page-gutter',0,25);
      return;
    }
    const f=selectedFrame();$('#no-selection').hidden=!!f;$('#frame-inspector').hidden=!f;if(!f)return;
    $('#frame-inspector').disabled=selectionLocked();
    const picked=selectedObjects();$('#distribute-x').disabled=$('#distribute-y').disabled=picked.length<3||picked.some(f=>f.groupId);
    $('#alignment-target').disabled=picked.length<2||picked.some(f=>f.groupId);
    $('#frame-kind').textContent=f.type==='text'?'TEXT FRAME':'IMAGE FRAME';
    $('#frame-label').value=f.label;$('#frame-note').value=f.note||'';for(const key of ['x','y','w','h'])$('#frame-'+key).value=displayed(f[key]);
    for(const key of ['x','y','w','h'])rangeForUnit('#frame-'+key,key==='w'||key==='h'?8:f.type==='image'?-25:0,1000);
    $('#add-continuation').disabled=!f.storyId;$('#text-inspector').hidden=f.type!=='text';$('#image-inspector').hidden=f.type!=='image';
    if(f.type==='text') {
      const style=effectiveStyle(f);populateFontPicker();populateTextStylePicker();
      $('#text-style-select').value=f.styleId||'';
      $('#text-style-name').value=(state.doc.textStyles||[]).find(item=>item.id===f.styleId)?.name||'';
      $('#text-style-update').disabled=!f.styleId;$('#text-style-remove').disabled=!f.styleId;
      $('#frame-font').value=fontChoice(style.font);$('#frame-size').value=style.fontSize||11;$('#frame-leading').value=style.leading||1.45;
      $('#frame-align').value=style.align||'left';$('#frame-tracking').value=style.tracking??0;
      $('#frame-indent').value=style.indent??0;$('#frame-hyphenate').checked=style.hyphenate===true;$('#frame-word-spacing').value=style.wordSpacing??0;$('#frame-paragraph-gap').value=style.paragraphGap??.55;$('#frame-kerning').checked=style.kerning===true;$('#frame-pretty').checked=style.pretty===true;
    }
    else {$('#image-fit').value=f.fit||'cover';$('#image-alt').value=f.alt||'';$('#image-decorative').checked=f.decorative===true;$('#image-alt').disabled=f.decorative===true;}
  }
  function populateTextStylePicker(){
    const select=$('#text-style-select');select.replaceChildren(new Option('Unlinked formatting',''));
    for(const item of state.doc.textStyles||[])select.add(new Option(item.name,item.id));
  }
  function applyTextStyle(id){
    const f=selectedFrame();if(!f||f.type!=='text')return;
    mutate(()=>{const style=(state.doc.textStyles||[]).find(item=>item.id===id);
      if(style){f.styleId=id;f.style=clone(style.style);}else{f.style=effectiveStyle(f);delete f.styleId;}
      if(f.storyId){const story=state.doc.stories[f.storyId];if(story){story.style=clone(f.style);if(style)story.styleId=id;else delete story.styleId;}reflowStory(f.storyId);}
    });
  }
  function createTextStyle(){
    const f=selectedFrame();if(!f||f.type!=='text')return;
    if((state.doc.textStyles||[]).length>=60)return toast('Maximum 60 named text styles.');
    const name=$('#text-style-name').value.trim().slice(0,64)||'Custom style';
    const style=clone(effectiveStyle(f)),id='style-'+uid().toLowerCase();
    mutate(()=>{state.doc.textStyles ||= [];state.doc.textStyles.push({id,name,style});f.styleId=id;f.style=clone(style);
      if(f.storyId){const story=state.doc.stories[f.storyId];if(story){story.style=clone(style);story.styleId=id;}reflowStory(f.storyId);}
    });toast(`Created and linked style “${name}”.`);
  }
  function updateTextStyle(){
    const f=selectedFrame(),style=f&&(state.doc.textStyles||[]).find(item=>item.id===f.styleId);
    if(!style)return;
    const name=$('#text-style-name').value.trim().slice(0,64)||style.name;
    const settings={font:$('#frame-font').value,fontSize:clamp(number($('#frame-size').value,11),6,150),leading:clamp(number($('#frame-leading').value,1.45),.8,3),align:$('#frame-align').value,
      tracking:clamp(number($('#frame-tracking').value,0),-3,12),indent:clamp(number($('#frame-indent').value,0),0,40),hyphenate:$('#frame-hyphenate').checked,wordSpacing:clamp(number($('#frame-word-spacing').value,0),-2,8),paragraphGap:clamp(number($('#frame-paragraph-gap').value,.55),0,2),kerning:$('#frame-kerning').checked,pretty:$('#frame-pretty').checked};
    mutate(()=>{style.name=name;style.style=settings;
      for(const [id,story] of Object.entries(state.doc.stories||{}))if(story.styleId===style.id || frameChain(id)[0]?.frame.styleId===style.id)reflowStory(id);
    });toast('Updated '+name+' across linked frames.');
  }
  function deleteTextStyle(){
    const f=selectedFrame(),id=f?.styleId;
    if(!id)return;
    mutate(()=>{
      for(const page of state.doc.pages)for(const frame of page.frames)if(frame.styleId===id){frame.style=clone(effectiveStyle(frame));delete frame.styleId;}
      for(const story of Object.values(state.doc.stories||{}))if(story.styleId===id){story.style=clone(Layout.effective(state.doc,story));delete story.styleId;}
      state.doc.textStyles=state.doc.textStyles.filter(item=>item.id!==id);
    });toast('Style removed. Text formatting kept.');
  }
  function populateMasterPicker(){
    const select=$('#page-master-select');select.replaceChildren(new Option('No parent page',''));
    for(const item of state.doc.masters||[])select.add(new Option(item.name,item.id));
    select.value=currentPage().masterId||'';
  }
  // Frame Placement
  function framePlacement(width,height){
    const paper=state.doc.paper;
    const margin=Math.max(0,paper.margin);
    const bottom=paper.height-margin;
    const horizontal=frame=>frame.x<margin+width+3&&frame.x+frame.w>margin-3;
    const occupied=currentPage().frames.filter(horizontal).map(frame=>({start:clamp(frame.y-3,margin,bottom),end:clamp(frame.y+frame.h+3,margin,bottom)})).sort((a,b)=>a.start-b.start);
    const gaps=[];let cursor=margin;
    for(const area of occupied){if(area.start>cursor)gaps.push({start:cursor,end:area.start});cursor=Math.max(cursor,area.end);}
    if(cursor<bottom)gaps.push({start:cursor,end:bottom});
    const desired=gaps.find(gap=>gap.end-gap.start>=height);
    const largest=[...gaps].sort((a,b)=>(b.end-b.start)-(a.end-a.start))[0];
    const gap=desired||largest;
    if(gap&&gap.end-gap.start>=Math.min(24,height))return {x:margin,y:round(gap.start),w:width,h:round(Math.min(height,gap.end-gap.start))};
    return {x:margin,y:round(clamp(margin+currentPage().frames.length*9,0,paper.height-height)),w:width,h:height};
  }
  function addFrame(kind, options={}) {
    if(currentPage().frames.length>=300)return toast('A page can hold at most 300 objects.');
    const paper=state.doc.paper;let f;
    const geometry=kind==='text'?framePlacement(Math.max(30,paper.width-paper.margin*2),Math.min(48,paper.height-paper.margin*2)):framePlacement(Math.min(85,paper.width-paper.margin*2),Math.min(80,paper.height-paper.margin*2));
    if(kind==='text') f=textFrame('<p>Double-click to edit your text.</p>',geometry.x,geometry.y,geometry.w,geometry.h,'Text '+(currentPage().frames.filter(f=>f.type==='text').length+1));
    else f={id:uid(),type:'image',label:(options.name||'Image').slice(0,200),src:options.src,fit:'cover',alt:(options.alt||'').slice(0,500),decorative:!!options.decorative,...geometry};
    mutate(()=>{currentPage().frames.push(f);state.selected=f.id;});toast(kind==='text'?'Text frame added. Double-click to edit.':'Image placed. Drag its label to move.');
  }
  function addPage() {if(state.doc.pages.length>=700)return toast('Publication exceeds the 700-page limit.');mutate(()=>{const page=newPage();if(currentPage().masterId)page.masterId=currentPage().masterId;state.doc.pages.splice(state.index+1,0,page);state.index++;state.selected=null;});toast(`Page ${state.index+1} added.`);}
  function duplicateFrame(){
    const picked=selectedObjects();if(!picked.length||selectionLocked())return;
    if(currentPage().frames.length+picked.length>300)return toast('A page can hold at most 300 objects.');
    const delta=Publication.translation(picked,state.doc.paper,5,5),groups=new Map();
    const copies=picked.map(f=>{const copy=clone(f);copy.id=uid();copy.label=(copy.label+' copy').slice(0,200);delete copy.storyId;delete copy.manualFlow;delete copy.locked;if(f.groupId){if(!groups.has(f.groupId))groups.set(f.groupId,'group-'+uid());copy.groupId=groups.get(f.groupId);}copy.x=round(f.x+delta.dx);copy.y=round(f.y+delta.dy);return copy;});
    mutate(()=>{currentPage().frames.push(...copies);state.selected=copies[0].id;extraSelection=copies.slice(1).map(f=>f.id);});
  }
  function deleteFrame(){const picked=selectedObjects();if(!picked.length||selectionLocked())return;const ids=new Set(picked.map(f=>f.id));mutate(()=>{const stories=new Set(picked.map(f=>f.storyId).filter(Boolean));currentPage().frames=currentPage().frames.filter(v=>!ids.has(v.id));state.selected=null;for(const id of stories)if(frameChain(id).length)reflowStory(id);else delete state.doc.stories[id];});}
  function frameChange(prop,value){const f=selectedFrame();if(!f||selectionLocked())return;if(selectedObjects().length>1&&['w','h'].includes(prop))return toast('Ungroup objects before resizing.');if(['x','y'].includes(prop)&&selectedObjects().length>1){const picked=selectedObjects(),delta=Publication.translation(picked,state.doc.paper,prop==='x'?value-f.x:0,prop==='y'?value-f.y:0);mutate(()=>{for(const item of picked){item.x=round(item.x+delta.dx);item.y=round(item.y+delta.dy);}});return;}mutate(()=>{const bleed=f.type==='image'?25:0,maxX=state.doc.paper.width+bleed,maxY=state.doc.paper.height+bleed;f[prop]=prop==='w'?round(clamp(value,8,Math.min(1000,maxX-f.x))):prop==='h'?round(clamp(value,8,Math.min(1000,maxY-f.y))):prop==='x'?round(clamp(value,-bleed,Math.min(1000,maxX-f.w))):round(clamp(value,-bleed,Math.min(1000,maxY-f.h)));if(f.storyId){if(frameChain(f.storyId)[0]?.frame.id!==f.id)f.manualFlow=true;reflowStory(f.storyId);}});}
  function styleChange(key,value){const f=selectedFrame();if(!f||f.type!=='text'||selectionLocked())return;
    mutate(()=>{
      const linked=(state.doc.textStyles||[]).find(item=>item.id===f.styleId);
      if(linked){
        linked.style[key]=value;
        for(const [id,story] of Object.entries(state.doc.stories||{})){
          if(story.styleId===linked.id || frameChain(id)[0]?.frame.styleId===linked.id)reflowStory(id);
        }
      }else{
        f.style=effectiveStyle(f);f.style[key]=value;
        if(f.storyId){const story=state.doc.stories[f.storyId];if(story){story.style=clone(f.style);delete story.styleId;}reflowStory(f.storyId);}
      }
    });
  }
  // Layout Commands
  function alignSelectedFrame(direction){
    const picked=selectedObjects();if(!picked.length||selectionLocked())return;
    const relative=$('#alignment-target').value==='selection'&&!picked.some(f=>f.groupId);
    mutate(()=>{Publication.align(picked,state.doc.paper,direction,relative);for(const id of new Set(picked.map(f=>f.storyId).filter(Boolean))){for(const f of picked)if(f.storyId===id&&frameChain(id)[0]?.frame.id!==f.id)f.manualFlow=true;reflowStory(id);}});toast('Selection aligned '+direction+'.');
  }
  function reorderPage(source,target){
    if(source===target||target<0||target>=state.doc.pages.length)return;
    if(!Publication.canMovePage(state.doc,source,target)){toast('Reordering across linked manuscript pages is not supported. Move unlinked pages within their section.');return;}
    mutate(()=>{const [page]=state.doc.pages.splice(source,1);state.doc.pages.splice(target,0,page);state.index=target;state.selected=null;});
    announceSelection(`Moved page to position ${state.index+1} of ${state.doc.pages.length}`);
  }
  function moveCurrentPage(delta){reorderPage(state.index,state.index+delta);}
  function savePathName(path) {return path?.split(/[\\/]/).pop()||'';}
  async function importManuscript() {
    if(!window.skoshPressAPI){toast('Run with Electron to import manuscripts.');return;}
    try{const result=await window.skoshPressAPI.importManuscript();if(!result)return;const html=sanitizeHtml(result.html);if(!html.trim()){toast('The selected manuscript contains no readable text.');return;}
      mutate(()=>{
        let targetIndex=state.index;if(currentPage().frames.length) {state.doc.pages.splice(targetIndex+1,0,newPage());targetIndex++;}
        const storyId=uid(),p=state.doc.paper;
        const name=String(result.name||'Imported manuscript').slice(0,200);
        const initial={ id:uid(),type:'text',label:name,html:'',style:defaultStyle(),storyId,x:p.margin,y:p.margin,w:p.width-p.margin*2,h:p.height-p.margin*2 };
        state.doc.pages[targetIndex].frames.push(initial);
        state.doc.stories[storyId]={id:storyId,name,html,...(result.notes?.length?{notes:Book.validateNotes(result.notes)}:{}),style:clone(initial.style),geometry:{x:initial.x,y:initial.y,w:initial.w,h:initial.h}};
        reflowStory(storyId);state.index=targetIndex;state.selected=state.doc.pages[targetIndex].frames[0]?.id||null;
      });toast(`Imported “${result.name}” and flowed into pages.`);
    }catch(e){showError(e);}
  }



  let genealogyTree=null;
  let genealogyPreview=null,genealogyPreviewEpoch=0;
  let genealogyBatchBusy=false;
  let genealogyBatchStop=false;
  function genealogyReportOptions(){return {
    title:$('#genealogy-report-title').value,mode:$('#genealogy-mode').value,
    density:$('#genealogy-density').value,limit:Number($('#genealogy-limit').value),
    surname:$('#genealogy-surname').value,protectLiving:$('#genealogy-private').checked,
    includeSources:$('#genealogy-citations').checked,surnameIndex:$('#genealogy-surname-index').checked,
    placeIndex:$('#genealogy-place-index').checked,includeNotes:$('#genealogy-notes').checked,footnotes:$('#genealogy-footnotes').checked,personIndex:$('#genealogy-person-index').checked
  };}
  function genealogyBatchControls(busy){
    genealogyBatchBusy=busy;
    for(const selector of ['#genealogy-import','#genealogy-generate','#genealogy-csv','#genealogy-batch','#genealogy-close'])
      $(selector).disabled=busy || !genealogyTree && selector!=='#genealogy-import' && selector!=='#genealogy-close';
    $('#genealogy-batch-cancel').disabled=!busy;$('#genealogy-batch-cancel').hidden=!busy;
    $('#genealogy-batch-progress').setAttribute('aria-busy',String(busy));
    $('#genealogy-chart-refresh').disabled=busy||!genealogyTree;
    $('#genealogy-chart-insert').disabled=busy||!genealogyPreview?.root;$('#genealogy-photo-add').disabled=busy||!genealogyPreview?.root;
  }
  async function importGenealogy() {
    if(!window.skoshPressAPI?.importGedcom) {toast('Genealogy import requires the installed desktop application.');return;}
    const summary=$('#genealogy-summary');summary.textContent='Opening local GEDCOM file…';
    try {
      const result=await window.skoshPressAPI.importGedcom();
      if(!result){summary.textContent=genealogyTree?'Previous GEDCOM remains loaded.':'No tree imported.';return;}
      genealogyTree={name:result.name};
      invalidateGenealogyView();$('#genealogy-chart-root').replaceChildren(new Option('Choose a person',''));$('#genealogy-chart-refresh').disabled=false;
      $('#genealogy-report-title').value=result.name.slice(0,130)+' — Family History';
      summary.textContent=`${result.name}: ${result.stats.people.toLocaleString()} people · ${result.stats.families.toLocaleString()} families · ${result.stats.sources.toLocaleString()} source records · GEDCOM ${result.version}.`;
      $('#genealogy-warning').textContent=result.warnings.length?result.warnings.slice(0,3).join(' '):'Ready. Review privacy filtering and source details before publication.';
      $('#genealogy-generate').disabled=false;
      $('#genealogy-csv').disabled=false;
      $('#genealogy-batch').disabled=false;
    } catch(error) {summary.textContent='Import failed: '+error.message;showError(error);}
  }
  function invalidateGenealogyView(){
    genealogyPreview=null;genealogyPreviewEpoch++;
    $('#genealogy-chart-preview').replaceChildren();$('#genealogy-review').replaceChildren();
    $('#genealogy-chart-status').textContent='Refresh to review the selected settings.';
    $('#genealogy-chart-insert').disabled=true;$('#genealogy-photo-add').disabled=true;
  }
  async function refreshGenealogyView(resetRoot=false){
    if(!genealogyTree||genealogyBatchBusy)return;
    invalidateGenealogyView();const epoch=genealogyPreviewEpoch,root=$('#genealogy-chart-root');
    try{
      const data=await window.skoshPressAPI.previewGenealogy({surname:$('#genealogy-chart-search').value,protectLiving:$('#genealogy-private').checked,rootId:resetRoot?'':root.value,chartMode:$('#genealogy-chart-mode').value,depth:Number($('#genealogy-chart-depth').value)});
      if(epoch!==genealogyPreviewEpoch)return;
      genealogyPreview=data;root.replaceChildren(...data.people.map(p=>new Option(`${p.name} (${p.id})`,p.id)));
      if(data.root&&!data.people.some(p=>p.id===data.root.id))root.add(new Option(`${data.root.name} (${data.root.id})`,data.root.id));
      root.value=data.root?.id||'';
      const preview=$('#genealogy-chart-preview');
      const branches=[];for(const row of data.rows){const branch=document.createElement('div');branch.className='genealogy-branch';const card=document.createElement('div');card.className='genealogy-chart-card';card.dataset.generation=String(row.generation);card.textContent=`${row.name} (${row.id})${row.dates?' · '+row.dates:''}${row.cycle?' · relationship loop':''}`;const descendants=document.createElement('div');descendants.className='genealogy-branches';branch.append(card,descendants);(branches[row.parent]||preview).append(branch);branches.push(descendants);}
      for(const event of data.events){const card=document.createElement('div');card.className='genealogy-timeline-card';const date=document.createElement('strong');date.textContent=event.date||'Undated';const desc=document.createElement('span');desc.textContent=[event.label,event.subject,event.place,event.detail].filter(Boolean).join(' · ');card.append(date,desc);preview.append(card);}
      $('#genealogy-chart-status').textContent=`${data.totalPeople} matching people${data.totalPeople>200?' (first 200 listed; refine search)':''}. ${data.truncated?'Chart limited to 63 nodes. ':''}${data.root?data.root.name:'No visible root.'}`;
      const review=$('#genealogy-review');const summary=document.createElement('p');summary.textContent=Object.entries(data.review.counts).map(([k,v])=>`${k}: ${v}`).join(' · ')||'No issues found by these checks.';review.append(summary);
      const list=document.createElement('ul');for(const item of data.review.findings){const li=document.createElement('li');li.textContent=`${item.kind}: ${item.detail}`;list.append(li);}review.append(list);
      $('#genealogy-chart-insert').disabled=!data.root;$('#genealogy-photo-add').disabled=!data.root;
    }catch(error){if(epoch===genealogyPreviewEpoch)$('#genealogy-chart-status').textContent=error.message;}
  }
  function appendGenealogyChart(){
    const data=genealogyPreview;if(!data?.root||genealogyBatchBusy)return;
    try{mutate(()=>{
      const p=state.doc.paper,w=p.width-2*p.margin,h=p.height-2*p.margin,style=defaultStyle();style.fontSize=10;
      const heading=data.mode==='ancestors'?'Ancestor tree':data.mode==='descendants'?'Descendant tree':'Chronological timeline';
      const html=`<h1>${heading}: ${safe(data.root.name)}</h1><p>GEDCOM ${safe(data.root.id)} · ${data.truncated?'Partial chart (63-node limit)':'Selected research view'}</p>`+(data.rows.length?data.rows.map(r=>`<p>${'&nbsp;'.repeat(r.generation*3)}${r.generation?'↳ ':''}<strong>${safe(r.name)}</strong> [${safe(r.id)}]${r.dates?' · '+safe(r.dates):''}${r.cycle?' · relationship loop':''}</p>`).join(''):data.events.map(e=>`<p><strong>${safe(e.date||'Undated')} · ${safe(e.label)}</strong> ${safe([e.subject,e.place,e.detail].filter(Boolean).join(' · '))}</p>`).join(''));
      const parts=splitRichHtml(html,style,w,h);if(state.doc.pages.length+parts.length>700)throw Error('Publication page limit exceeded.');
      state.index=state.doc.pages.length;for(const part of parts){const page=newPage();page.label=heading;const frame=textFrame(part,p.margin,p.margin,w,h,heading);frame.style=clone(style);page.frames.push(frame);state.doc.pages.push(page);}state.selected=null;
    });$('#genealogy-dialog').close();toast('Editable research pages appended.');}catch(error){showError(error);}
  }
  async function appendGenealogyPhoto(){
    const data=genealogyPreview;if(!data?.root||genealogyBatchBusy)return;const epoch=genealogyPreviewEpoch;
    const caption=$('#genealogy-photo-caption').value.trim();
    try{const image=await window.skoshPressAPI.importImage();if(!image||epoch!==genealogyPreviewEpoch||genealogyBatchBusy)return;
      mutate(()=>{if(state.doc.pages.length>=700)throw Error('Publication page limit exceeded.');
        const p=state.doc.paper,w=p.width-2*p.margin,h=p.height-2*p.margin,page=newPage();if(h<80||w<30)throw Error('Choose a larger printable page for a photograph and caption.');page.label='Family photograph';
        const title=textFrame(`<h2>${safe(data.root.name)}</h2><p>${safe(data.root.id)} · Family photograph</p>`,p.margin,p.margin,w,24,'Photograph subject');title.style.fontSize=10;
        const photo={id:uid(),type:'image',label:'Family photograph',src:image.src,fit:'contain',alt:`Photograph of ${data.root.name}`.slice(0,200),decorative:false,note:caption,x:p.margin,y:p.margin+26,w,h:Math.max(8,h-64)};
        const note=textFrame(`<p>${safe(caption||'Photograph source not yet recorded.')}</p>`,p.margin,p.margin+h-34,w,34,'Photograph caption');note.style.fontSize=9;
        page.frames.push(title,photo,note);state.doc.pages.push(page);state.index=state.doc.pages.length-1;state.selected=photo.id;
      });$('#genealogy-photo-caption').value='';$('#genealogy-dialog').close();toast('Local photograph and caption embedded in the publication.');
    }catch(error){showError(error);}
  }
  async function generateGenealogy() {
    if(!genealogyTree)return;
    try {
      if(!window.skoshPressAPI?.generateGenealogyPublication)throw Error('This installation is missing the genealogy interface. Reinstall or rebuild Skosh Press.');
      const result=await window.skoshPressAPI.generateGenealogyPublication(genealogyReportOptions());
      if(state.dirty && !confirm('Replace your unsaved publication with the generated research manuscript? Save the current project first if you want to keep it.'))return;
      // Project Isolation
      mutate(()=>{
        state.doc=starterProject();$('#book-index-terms').value='';state.doc.name=result.title.slice(0,100);
        state.doc.pages[0].label='Research manuscript';state.doc.pages[0].frames=[];
        state.path=null;state.index=0;state.selected=null;
        const p=state.doc.paper,storyId=uid();
        const first=textFrame('',p.margin,p.margin,p.width-p.margin*2,p.height-p.margin*2,'Genealogy research');
        first.storyId=storyId;first.style.fontSize=10;
        state.doc.pages[0].frames.push(first);
        state.doc.stories[storyId]={id:storyId,name:result.title,html:result.html,notes:result.notes||[],style:clone(first.style),geometry:{x:first.x,y:first.y,w:first.w,h:first.h}};
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
    const parts=splitRichHtml(html,style,geometry.w,geometry.h,{notes:result.notes||[]});
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
      stories:{[storyId]:{id:storyId,name:result.title.slice(0,200),html,notes:result.notes||[],style,geometry}},fonts:[]};
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

  function splitRichHtml(html,style,widthMm,heightMm,config={}){
    const source=document.createElement('div');source.innerHTML=sanitizeHtml(html);
    const walker=document.createTreeWalker(source,NodeFilter.SHOW_TEXT),nodes=[],blocks=[];
    let pos=0;while(walker.nextNode()){const node=walker.currentNode;nodes.push({node,start:pos,end:pos+node.length});pos+=node.length;}
    if(!pos)return [source.innerHTML];
    let offset=0;for(const node of source.childNodes){const end=offset+node.textContent.length;blocks.push({start:offset,end,tag:node.nodeName});offset=end;}
    const plain=source.textContent,paragraphEnds=Layout.blockBreaks(source);
    const protectedRanges=[];
    for(const item of nodes)if(item.node.parentElement.closest('sup'))protectedRanges.push(item);
    const tester=document.createElement('div');tester.className='frame-text';tester.setAttribute('aria-hidden','true');
    Object.assign(tester.style,{position:'fixed',top:'-20000px',left:'-20000px',height:'auto',overflow:'visible',display:'flow-root',padding:'0',margin:'0',visibility:'hidden'});
    Object.assign(tester.style,styleProperties(style));applyParagraphGap(tester,style);tester.lang=state.doc.metadata?.language||'en';document.body.append(tester);
    function point(n,start){const item=nodes.find(item=>start?n<item.end:n<=item.end)||nodes.at(-1);return [item.node,clamp(n-item.start,0,item.node.length)];}
    function fragmentHtml(start,end){
      if(start===0&&end===pos)return source.innerHTML;
      const range=document.createRange();range.setStart(...point(start,true));range.setEnd(...point(end,false));
      let fragment=range.cloneContents(),ancestor=range.commonAncestorContainer;
      if(ancestor.nodeType===Node.TEXT_NODE)ancestor=ancestor.parentElement;
      while(ancestor&&ancestor!==source){const wrapper=ancestor.cloneNode(false);wrapper.append(fragment);fragment=wrapper;ancestor=ancestor.parentElement;}
      const buffer=document.createElement('div');buffer.append(fragment);return buffer.innerHTML;
    }
    function chunk(start,end){let html=fragmentHtml(start,end);if(end<pos&&plain[end-1]==='\u00ad'){const el=document.createElement('div');el.innerHTML=html;const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let last;while(walker.nextNode())last=walker.currentNode;if(last?.data.endsWith('\u00ad'))last.data=last.data.slice(0,-1)+'‐';html=el.innerHTML;}return Book.withNotes(html,config.notes);}
    let currentShapes=[];
    function fits(start,end,height){const html=chunk(start,end),parts=config.bottomNotes?Book.splitNotes(html,config.notes):{body:html,notes:''};setComposition(tester,{...parts,shapes:currentShapes},MM);return tester.scrollHeight<=height*MM+1;}
    function safeBreak(start,end){
      const inside=protectedRanges.find(r=>r.start<end&&end<r.end);
      if(inside)return inside.start>start?inside.start:inside.end;
      if(end<pos&&/[\uD800-\uDBFF]/.test(plain[end-1]))end--;
      while(end>start&&end<pos&&(/^[\p{M}\u200d]/u.test(plain.slice(end))||plain[end-1]==='\u200d')){end--;if(/[\uD800-\uDBFF]/.test(plain[end-1]))end--;}
      return end;
    }
    const parts=[];let start=0;
    try{
      while(start<pos&&parts.length<450){
        const slot=config.slot?.(parts.length)||{w:widthMm,h:heightMm};
        tester.style.width=slot.w*MM+'px';currentShapes=slot.shapes||[];
        const chapter=config.chapterBreaks?blocks.find(b=>b.tag==='H1'&&b.start>start&&plain.slice(start,b.start).trim()):null;
        const limit=chapter?.start??pos;
        let hi=Math.min(limit,start+256),best=start;
        while(fits(start,hi,slot.h)){best=hi;if(hi===limit)break;hi=Math.min(limit,start+(hi-start)*2);}
        let lo=best+1;
        while(lo<=hi&&best<limit){const mid=Math.floor((lo+hi)/2);if(fits(start,mid,slot.h)){best=mid;lo=mid+1;}else hi=mid-1;}
        if(best<limit){
          best=Layout.preferredBreak(start,best,paragraphEnds,plain);
          const block=blocks.find(b=>b.start<best&&b.end>best);
          if(block&&config.widows>1&&block.end>best){
            const lineHeight=clamp(number(style.fontSize,11),6,150)*96/72*clamp(number(style.leading,1.45),.8,3);
            const lines=(a,b)=>{tester.innerHTML=fragmentHtml(a,b);const el=tester.firstElementChild;return Math.max(1,Math.round((el?.getBoundingClientRect().height||tester.scrollHeight)/lineHeight));};
            if(block.start>start&&lines(block.start,best)<config.widows)best=block.start;
            else if(lines(best,block.end)<config.widows){
              let cut=best;for(let n=0;n<160&&cut>Math.max(start,block.start)+1;n++){
                cut--;if(/\s/.test(plain[cut-1]||'')&&lines(cut,block.end)>=config.widows){if(lines(Math.max(start,block.start),cut)>=config.widows)best=cut;break;}
              }
            }
          }
          const trailing=blocks.find(b=>/^H[123]$/.test(b.tag)&&b.start>start&&b.start<best&&b.end>=best);
          if(trailing)best=trailing.start;
        }
        best=safeBreak(start,best);
        if(best<=start||!fits(start,best,slot.h))throw Error('A manuscript passage or footnote does not fit its text frame. Enlarge the frame or shorten the note.');
        parts.push(chunk(start,best));start=best;
      }
      if(start<pos)throw Error('Manuscript exceeds the 450-page automatic-flow limit.');
      return parts;
    }finally{tester.remove();}
  }
  const SkoshStoryFlow=window.SkoshStoryFlow;
  function frameChain(id){return SkoshStoryFlow.frameChain(state.doc,id);}
  function paginateStory(doc,id){
    const story=doc.stories[id],chain=SkoshStoryFlow.frameChain(doc,id),master=chain[0].frame,config=Book.options(story);
    return splitRichHtml(story.html,Layout.effective(doc,{style:story.style||master.style,styleId:story.styleId||master.styleId}),master.w,master.h,{...config,notes:story.notes,slot:i=>{
      const geometry=SkoshStoryFlow.geometry(master,chain[i]);
      const images=chain[i]?Publication.visibleFrames(doc,chain[i].page):[],local=config.wrapImages&&config.localWrap&&!config.bottomNotes;
      const inset=config.wrapImages&&!local?Book.wrapInsets(geometry,images):{left:0,right:0};
      return {w:Math.max(1,geometry.w-inset.left-inset.right),h:geometry.h,shapes:local?Book.wrapShapes(geometry,images):[]};
    }});
  }
  function reflowStory(id){
    const story=state.doc.stories[id];if(!story||!frameChain(id).length)return;
    const active=currentPage(),selected=state.selected;
    if(Book.options(story).bottomNotes){
      for(const {page,frame} of frameChain(id)){
        const bottom=state.doc.paper.height-state.doc.paper.margin,next=bottom-frame.y;
        if(next<8)throw Error('The linked frame begins too close to the bottom margin.');
        if(next>frame.h&&Publication.visibleFrames(state.doc,page).some(f=>f!==frame&&f.type==='text'&&f.x<frame.x+frame.w&&f.x+f.w>frame.x&&f.y<bottom&&f.y+f.h>frame.y+frame.h))throw Error('Page-bottom notes would extend into another text frame. Move the other text first.');
        frame.h=next;
      }
    }
    SkoshStoryFlow.reflow(state.doc,id,paginateStory(state.doc,id),uid);
    const index=state.doc.pages.indexOf(active);state.index=index<0?clamp(state.index,0,state.doc.pages.length-1):index;
    if(selected&&!currentPage().frames.some(f=>f.id===selected))state.selected=null;
  }
  function readFlowOptions(){return {widows:Number($('#story-widows').value),chapterBreaks:$('#story-chapters').checked,wrapImages:$('#story-wrap').checked,bottomNotes:$('#story-bottom-notes').checked,localWrap:$('#story-local-wrap').checked};}
  function addContinuation(){
    const f=selectedFrame();if(!f?.storyId)return toast('Select a linked manuscript frame first.');
    try{mutate(()=>{
      const chain=frameChain(f.storyId),last=chain.at(-1),page=newPage();
      if(state.doc.pages.length>=700)throw Error('Publication exceeds the 700-page limit.');
      if(last.page.masterId)page.masterId=last.page.masterId;
      const next={...clone(f),id:uid(),html:'',manualFlow:true};page.frames.push(next);state.doc.pages.splice(last.index+1,0,page);
      reflowStory(f.storyId);state.index=state.doc.pages.indexOf(page);state.selected=next.id;
    });}catch(error){showError(error);}
  }
  function contentsEntries(pages){
    const entries=[];
    pages.forEach((page,index)=>{
      if(page.indexPage)return;
      if(page.section)entries.push({title:page.section.title,index,level:1});
      for(const frame of Publication.visibleFrames(state.doc,page))if(frame.type==='text'){
        const el=document.createElement('div');el.innerHTML=sanitizeHtml(frame.html);
        for(const heading of el.querySelectorAll('h1,h2,h3')){const title=heading.textContent.trim().slice(0,300);if(title&&!(page.section?.title===title))entries.push({title,index,level:Number(heading.tagName[1])});}
      }
    });return entries;
  }
  function generateContents(){
    try{mutate(()=>{
      const old=state.doc.pages.filter(p=>p.contents),pages=state.doc.pages.filter(p=>!p.contents),entries=contentsEntries(pages),p=state.doc.paper;
      if(!entries.length)throw Error('Add chapter headings or named sections before generating contents.');
      const firstStory=pages.findIndex(page=>page.frames.some(f=>f.storyId)||page.section);
      const at=old.length?Math.min(state.doc.pages.indexOf(old[0]),pages.length):firstStory===0?0:Math.min(1,pages.length);
      const style=defaultStyle(),w=p.width-p.margin*2,h=p.height-p.margin*2;
      let count=old.length||1,parts=[];
      for(let i=0;i<8;i++){
        const html='<h1>Contents</h1>'+entries.map(e=>`<p>${e.level>1?'&nbsp;'.repeat((e.level-1)*3):''}${safe(e.title)} · ${e.index+1+(e.index>=at?count:0)}</p>`).join('');
        parts=splitRichHtml(html,style,w,h);if(parts.length===count)break;count=parts.length;
        if(i===7)throw Error('Contents pagination did not settle.');
      }
      if(pages.length+parts.length>700)throw Error('Contents exceeds the publication page limit.');
      const generated=parts.map((html,i)=>({id:old[i]?.id||uid(),label:i?'Contents (continued)':'Contents',contents:true,frames:[{...textFrame(html,p.margin,p.margin,w,h,'Generated contents'),id:old[i]?.frames[0]?.id||uid()}]}));
      state.doc.pages=[...pages.slice(0,at),...generated,...pages.slice(at)];state.index=at;state.selected=null;
    });toast('Contents generated from visible headings and sections. Refresh after editing the book.');}catch(error){showError(error);}
  }
  function generateIndex(){
    try{mutate(()=>{
      const terms=$('#book-index-terms').value.split(/\r?\n/).filter(t=>t.trim());if(!terms.length)throw Error('Enter one or more index terms.');
      const old=state.doc.pages.filter(p=>p.indexPage),pages=state.doc.pages.filter(p=>!p.indexPage),p=state.doc.paper;
      const folios=pages.map((_,i)=>Book.sectionAt({pages},i).folio),counts=new Map();for(const n of folios)counts.set(n,(counts.get(n)||0)+1);
      state.doc.indexTerms=terms.map(t=>t.trim());
      const entries=Book.indexEntries(pages.map((page,i)=>({folio:counts.get(folios[i])>1?`${folios[i]} (p. ${i+1})`:folios[i],text:Publication.visibleFrames(state.doc,page).filter(f=>f.type==='text'&&!page.contents).map(f=>{const el=document.createElement('div');el.innerHTML=sanitizeHtml(f.html.replace(/<\/(p|h[1-3]|li|div)>/gi,' </$1>'));return el.textContent;}).join(' ')})),terms,state.doc.metadata?.language);
      const found=entries.filter(e=>e.pages.length);if(!found.length)throw Error('No index terms found in visible publication text.');
      const w=p.width-2*p.margin,h=p.height-2*p.margin,html='<h1>Index</h1>'+found.map(e=>`<p>${safe(e.label)} · ${[...new Set(e.pages)].join(', ')}</p>`).join('');
      const parts=splitRichHtml(html,defaultStyle(),w,h);if(pages.length+parts.length>700)throw Error('Index exceeds the publication page limit.');
      const generated=parts.map((html,i)=>({id:old[i]?.id||uid(),label:i?'Index (continued)':'Index',indexPage:true,frames:[{...textFrame(html,p.margin,p.margin,w,h,'Generated index'),id:old[i]?.frames[0]?.id||uid()}]}));
      state.doc.pages=[...pages,...generated];state.index=pages.length;state.selected=null;
    });toast('Index generated from visible text. Refresh after editing the book.');}catch(error){showError(error);}
  }
  // Canonical Editing
  let editingStoryId=null;
  let editingStoryDirtyBefore=false;
  let editingStoryCommitted=false;
  function openStoryEditor(id) {
    const story=state.doc.stories[id];if(!story)return;
    const dialog=$('#story-dialog');if(dialog.open)return;
    editingStoryId=id;editingStoryCommitted=false;editingStoryDirtyBefore=state.dirty;
    $('#story-editor-name').textContent=story.name||'Linked manuscript';
    const editor=$('#story-editable');editor.innerHTML=sanitizeHtml(story.html);
    const flow=Book.options(story);$('#story-widows').value=flow.widows;$('#story-chapters').checked=flow.chapterBreaks;$('#story-wrap').checked=flow.wrapImages;$('#story-bottom-notes').checked=flow.bottomNotes;$('#story-local-wrap').checked=flow.localWrap;$('#story-notes').value=(story.notes||[]).map(n=>`${n.number}: ${n.text}`).join('\n');
    editor.spellcheck=preferences.spellcheck!==false;
    editor.lang=preferences.spellLanguage||'en-US';
    dialog.showModal();editor.focus();
  }
  function saveStoryEditor() {
    if(!editingStoryId)return true;
    const id=editingStoryId,story=state.doc.stories[id];
    if(!story)return false;
    const raw=$('#story-editable').innerHTML;
    if(raw.length>5_000_000){toast('Manuscript exceeds the 5 MB rich-text limit.');return false;}
    const html=sanitizeHtml(raw);
    try{
      const flow=readFlowOptions(),notes=Book.parseNotes($('#story-notes').value);
      if(html!==story.html||JSON.stringify(flow)!==JSON.stringify(Book.options(story))||JSON.stringify(notes)!==JSON.stringify(story.notes||[]))mutate(()=>{story.html=html;story.flow=flow;story.notes=notes;reflowStory(id);state.index=frameChain(id)[0].index;state.selected=frameChain(id)[0]?.frame.id||null;});
      else {state.dirty=editingStoryDirtyBefore;updateHeader();}
      editingStoryCommitted=true;$('#story-dialog').close();
      return true;
    }catch(error){showError(error);return false;}
  }
  function bindStoryEditor() {
    const dialog=$('#story-dialog');
    $('#story-editable').addEventListener('input',markDirty);
    for(const id of ['story-widows','story-chapters','story-wrap','story-bottom-notes','story-local-wrap','story-notes'])$('#'+id).addEventListener('input',markDirty);
    $('#story-soft-hyphen').addEventListener('mousedown',e=>e.preventDefault());
    $('#story-soft-hyphen').addEventListener('click',()=>{const editor=$('#story-editable');editor.focus();const sel=window.getSelection();if(lastTextSelection&&editor.contains(lastTextSelection.commonAncestorContainer)){sel.removeAllRanges();sel.addRange(lastTextSelection);}document.execCommand('insertText',false,'\u00ad');markDirty();});
    $('#story-note-insert').addEventListener('mousedown',e=>e.preventDefault());
    $('#story-note-insert').addEventListener('click',()=>{const n=Number($('#story-note-number').value);if(!Number.isInteger(n)||n<1||n>9999)return toast('Enter a footnote number from 1 to 9999.');const editor=$('#story-editable');editor.focus();const sel=window.getSelection();if(lastTextSelection&&editor.contains(lastTextSelection.commonAncestorContainer)){sel.removeAllRanges();sel.addRange(lastTextSelection);}document.execCommand('insertHTML',false,`<sup>[${n}]</sup>`);markDirty();});
    $('#story-heading').addEventListener('change',e=>{const editor=$('#story-editable');editor.focus();const sel=window.getSelection();if(lastTextSelection&&editor.contains(lastTextSelection.commonAncestorContainer)){sel.removeAllRanges();sel.addRange(lastTextSelection);}document.execCommand('formatBlock',false,e.target.value);markDirty();});
    $('#story-save').addEventListener('click',saveStoryEditor);
    $('#story-cancel').addEventListener('click',()=>dialog.close());
    $('#story-cancel-button').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{
      const committed=editingStoryCommitted;
      editingStoryId=null;editingStoryCommitted=false;
      if(!committed){
        state.dirty=editingStoryDirtyBefore;recoveryPaused=true;updateHeader();
        void clearRecovery().catch(showError).finally(()=>{recoveryPaused=false;if(state.dirty)scheduleRecovery();});
      }
    });
    for(const button of dialog.querySelectorAll('[data-story-command]')){
      button.addEventListener('mousedown',event=>event.preventDefault());
      button.addEventListener('click',()=>{
        $('#story-editable').focus();
        document.execCommand(button.dataset.storyCommand,false,null);
      });
    }
  }
  function flowSelectedFrame() {
    const f=selectedFrame();if(!f||f.type!=='text'||selectionLocked())return;if(f.groupId)return toast('Ungroup this frame before linking a manuscript.');
    mutate(()=>{if(!f.storyId){const id=uid();f.storyId=id;state.doc.stories[id]={id,name:f.label,html:f.html,style:clone(f.style),geometry:{x:f.x,y:f.y,w:f.w,h:f.h}};}
      const currentId=f.storyId;reflowStory(currentId);state.index=frameChain(currentId)[0].index;state.selected=frameChain(currentId)[0]?.frame.id||null;
    });toast('Text reflowed into linked page frames. Double-click to edit the whole manuscript.');
  }
  function printFramesFor(page, offsetX = 0) {
      if(!page) return '';
      return masterMarkup(state.doc.pages.indexOf(page),offsetX)+Publication.visibleFrames(state.doc,page).map(f=>{
        const coords=`left:${Math.round((f.x+offsetX)*1000)/1000}mm;top:${f.y}mm;width:${f.w}mm;height:${f.h}mm;`;
        if(f.type==='image') return `<div class="print-frame" style="${coords}"><img alt="${safe(f.decorative?'':(f.alt||''))}"${f.decorative?' role="presentation"':''} src="${safe(f.src)}" style="width:100%;height:100%;object-fit:${f.fit==='contain'?'contain':'cover'}"></div>`;
        const style=effectiveStyle(f);
        const props=styleProperties(style),insets=frameInsets(state.doc,page,f),composition=printComposition(state.doc,page,f);
        return `<div class="print-frame print-text${composition.cls}" style="${coords}padding-left:${insets.left}mm;padding-right:${insets.right}mm;font-family:${safe(printFont(style.font))};font-size:${clamp(number(style.fontSize,11),6,150)}pt;line-height:${clamp(number(style.leading,1.45),.8,3)};text-align:${props.textAlign};letter-spacing:${clamp(number(style.tracking,0),-3,12)}px;text-indent:${clamp(number(style.indent,0),0,40)}mm;hyphens:${props.hyphens};word-spacing:${props.wordSpacing};font-kerning:${props.fontKerning};text-wrap:${props.textWrap};--paragraph-gap:${clamp(number(style.paragraphGap,.55),0,2)}em">${composition.html}</div>`;
      }).join('');
    }
  function productionSideMarkup(geometry,side){
    const precise=n=>Math.round(n*1000)/1000;
    const rect=(x,y,w,h)=>`left:${precise(x)}mm;top:${precise(y)}mm;width:${precise(w)}mm;height:${precise(h)}mm;`;
    const content=geometry.cells.map((cell,i)=>{
      const {x,y,w,h,leftBleed:l,rightBleed:r,topBleed:t,bottomBleed:b}=cell;
      const index=side.pages[i];
      return `<div class="production-clip" style="${rect(x-l,y-t,w+l+r,h+t+b)}"><div class="production-trim" style="${rect(l+(side.creep||0)*(i===0?1:-1),t,w,h)}">${index===null?'':printFramesFor(state.doc.pages[index-1])}</div></div>`;
    }).join('');
    return content+geometry.marks.map(mark=>`<div class="production-mark" style="${rect(mark.x,mark.y,mark.w,mark.h)}"></div>`).join('');
  }
  const PRODUCTION_CSS='.production-clip{position:absolute;overflow:hidden}.production-trim{position:absolute;overflow:visible}.production-mark{position:absolute;background:#000}';
  function printHtml(booklet = false,production=null,sideIndex=null) {
    const p=state.doc.paper;
    const width=production?production.geometry.width:booklet?p.width*2:p.width,height=production?production.geometry.height:p.height;
    const layouts=[];
    if(!production&&booklet){
      for(const [left,right] of window.SkoshPressBooklet.sheets(state.doc.pages.length))
        layouts.push([[left,0],[right,p.width]]);
    } else if(!production)for(let i=0;i<state.doc.pages.length;i++)layouts.push([[i,0]]);
    const sheets=production?(sideIndex===null?production.sides:[production.sides[sideIndex]]).map(side=>`<div class="print-page">${productionSideMarkup(production.geometry,side)}</div>`).join(''):layouts.map(layout=>`<div class="print-page">${layout.map(([index,x])=>booklet?`<div style="position:absolute;overflow:hidden;left:${x}mm;top:0;width:${p.width}mm;height:${p.height}mm">${printFramesFor(state.doc.pages[index])}</div>`:printFramesFor(state.doc.pages[index],x)).join('')}</div>`).join('');
    const css=`@page{size:${width}mm ${height}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:#161616}.print-page{width:${width}mm;height:${height}mm;position:relative;overflow:hidden;break-after:page;page-break-after:always}.print-page:last-child{break-after:auto;page-break-after:auto}.print-frame{position:absolute;overflow:hidden;overflow-wrap:anywhere}.print-text hr{border:0;border-top:1px solid #777;margin:.5em 0}.print-text small{font-size:.8em}.print-text p{margin:0 0 var(--paragraph-gap,.55em);orphans:2;widows:2}.print-text h1{letter-spacing:0;font-family:inherit;font-size:1.8em;line-height:1.15;margin:0 0 .45em}.print-text h2{font-family:inherit;font-size:1.4em;line-height:1.2;margin:0 0 .5em}.print-text h3{font-family:inherit;font-size:1.15em;margin:0 0 .55em}.print-text ul,.print-text ol{padding-left:1.3em;margin:0 0 .6em}.bottom-notes{display:flex;flex-direction:column}.composition-body{display:flow-root;flex:none}.composition-notes{display:flow-root;margin-top:auto;flex:none}`;
    const fonts=(state.doc.fonts||[]).filter(f=>/^font-[a-z0-9-]{1,70}$/i.test(f.id) && /^data:font\/(?:ttf|otf|woff2?);base64,[A-Za-z0-9+/]+={0,2}$/.test(f.data)).map(f=>`@font-face{font-family:"${f.id}";src:url("${f.data}");font-display:block}`).join('');
    const language=safe(state.doc.metadata?.language||'en');
    const title=safe(state.doc.name)+(production?' — Production '+production.geometry.width+' × '+production.geometry.height+' mm':'');
    const description=state.doc.metadata?.description?`<meta name="description" content="${safe(state.doc.metadata.description)}">`:'';
    const productionMeta=production?`<meta name="skosh-production" content="${safe(JSON.stringify({sheetWidth:width,sheetHeight:height,trimWidth:p.width,trimHeight:p.height,bleed:production.profile.bleed,binding:production.profile.binding,signaturePages:production.profile.signaturePages,caliper:production.profile.caliper,maxCreep:production.maxCreep,proofSide:sideIndex===null?null:sideIndex+1}))}">`:'';
    const author=state.doc.metadata?.author?`<meta name="author" content="${safe(state.doc.metadata.author)}">`:'';
    return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${title}</title>${description}${author}${productionMeta}<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; script-src 'none'"><style>${fonts}${css}${production?PRODUCTION_CSS:''}</style></head><body>${sheets}</body></html>`;
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
    epub:'EPUB: reflowable text and embedded images with alternative descriptions. Page positioning and custom fonts are omitted; check reader compatibility.',
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
      else result=await window.skoshPressAPI.exportPublication(Publication.outputDocument(state.doc),format,format==='html'?printHtml(false):null);
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
      const result=await window.skoshPressAPI.exportInterchange(Publication.outputDocument(state.doc),format);
      if(result){$('#interchange-dialog').close();toast(`Exported ${savePathName(result.path)}. Review the layout in the target application.`);}
      return result;
    }catch(error){showError(error);return null;}
  }
  // Project Saving
  async function save(saveAs=false,compact=false) {
    if(saving||state.moving)return false;
    if(editingStoryId && !saveStoryEditor())return false;
    if(!window.skoshPressAPI){toast('Open Skosh Press with Electron to save files.');return false;}

    if(document.activeElement?.isContentEditable || ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))document.activeElement.blur();
    saving=true;recoveryPaused=true;
    try{
      await recovery.drain();
      const snapshot=history.capture(state.doc);
      const result=await window.skoshPressAPI.saveProject(window.SkoshEditorHistory.restore(snapshot),saveAs,compact);
      if(!result)return false;
      state.path=result.path;

      state.dirty=!window.SkoshEditorHistory.equal(history.capture(state.doc),snapshot);
      updateHeader();toast(`Saved ${savePathName(result.path)}`);if(result.recoveryWarning)notices.show(result.recoveryWarning,true);
      return !state.dirty;
    }catch(e){showError(e);return false;}finally{saving=false;recoveryPaused=false;if(state.dirty)scheduleRecovery();}
  }
  async function open() {
    if(saving||state.moving)return;
    if(!window.skoshPressAPI){toast('Open Skosh Press with Electron to open projects.');return;}
    if(state.dirty&&!confirm('Discard unsaved changes and open another project?'))return;
    saving=true;recoveryPaused=true;
    try{
      await recovery.drain();
      const result=await window.skoshPressAPI.openProject();if(!result)return;
      validateProject(result.project);if(!result.recoveryCleared)await clearRecovery();
      state.doc=result.project;$('#book-index-terms').value=(state.doc.indexTerms||[]).join('\n');state.path=result.path;state.dirty=false;state.undo=[];state.redo=[];state.index=0;state.selected=null;$('#doc-name').value=state.doc.name;render();
      toast(result.migrated?`Imported ${result.sourceName}; Save creates a new .skoshpress file.`:`Opened ${savePathName(result.path)}`);
    }catch(error){showError(error);}finally{saving=false;recoveryPaused=false;if(state.dirty)scheduleRecovery();}
  }
  function validateProject(doc) {
    if(!doc||doc.format!=='skosh-press-1'||!Array.isArray(doc.pages)||doc.pages.length<1||doc.pages.length>700||!doc.paper||doc.paper.width<50||doc.paper.width>1000||doc.paper.height<50||doc.paper.height>1000)throw Error('Invalid or unsupported Skosh Press project.');
    Publication.validate(doc);Book.validate(doc);
    doc.stories=doc.stories && typeof doc.stories==='object'?doc.stories:{};doc.fonts=Array.isArray(doc.fonts)?doc.fonts:[];doc.metadata=doc.metadata && typeof doc.metadata==='object' && !Array.isArray(doc.metadata)?doc.metadata:{author:'',language:'en',description:'',publisher:'',rights:''};
    doc.pages.forEach(page=>{if(!Array.isArray(page.frames)||page.frames.length>300)throw Error('This project has an invalid frame list.');page.frames.forEach(f=>{if(!['text','image'].includes(f.type)||typeof f.id!=='string'||!Number.isFinite(f.x)||!Number.isFinite(f.y)||!Number.isFinite(f.w)||!Number.isFinite(f.h))throw Error('A frame in this project is invalid.');if(f.note!==undefined && (typeof f.note!=='string'||f.note.length>2000))throw Error('Invalid object note.');if(f.alt!==undefined && (typeof f.alt!=='string'||f.alt.length>500))throw Error('Invalid image alternative text.');if(f.decorative!==undefined && typeof f.decorative!=='boolean')throw Error('Invalid decorative image setting.');if(f.type==='text'){f.html=sanitizeHtml(f.html);f.style=f.style||defaultStyle();}else if(typeof f.src!=='string'||!/^data:image\/(?:png|jpe?g|webp|gif);base64,/.test(f.src))throw Error('Image source is invalid.');});});
  }
  async function freshProject() {if(saving)return;if(state.dirty&&!confirm('Start a new project? Unsaved changes will be lost.'))return;recoveryPaused=true;try{await clearRecovery();if(window.skoshPressAPI?.resetProjectPath)await window.skoshPressAPI.resetProjectPath();state.doc=starterProject();$('#book-index-terms').value='';state.path=null;state.undo=[];state.redo=[];state.dirty=false;state.index=0;state.selected=null;$('#doc-name').value=state.doc.name;render();toast('New blank publication created.');}catch(error){showError(error);}finally{recoveryPaused=false;if(state.dirty)scheduleRecovery();}}
  function changeZoom(next){state.zoom=clamp(Math.round(next*20)/20,0.25,1.8);render();}
  function fitCanvas(){const box=$('#canvas-scroll');const count=state.allPages?1:state.spread?2:1;const horizontal=(box.clientWidth-115-(count-1)*34)/(state.doc.paper.width*MM*count);const vertical=(box.clientHeight-124)/(state.doc.paper.height*MM);changeZoom(Math.min(horizontal,vertical,1.5));}
  function travelHistory(direction){if(history.travel(state,direction)){$('#doc-name').value=state.doc.name;$('#book-index-terms').value=(state.doc.indexTerms||[]).join('\n');render();}}
  function undo(){travelHistory('undo');}
  function redo(){travelHistory('redo');}
  function showError(error){console.error(error);notices.show(error?.message||'Unexpected error.',true);}

  const PREF_KEY='skoshpress-accessibility-v1';
  const LEGACY_PREF_KEY='tinypress-accessibility-v1';
  const DEFAULT_PREFS={theme:'light',largeText:false,highContrast:false,reducedMotion:false,largeHandles:false,simpleStage:false,readingComfort:false,enhancedFocus:false,announceSelection:true,showRulers:true,spellcheck:true,spellLanguage:'en-US'};
  function localGet(key){try{return localStorage.getItem(key);}catch(_err){return null;}}
  function localSet(key,value){try{localStorage.setItem(key,value);}catch(_err){}}
  function loadPreferences(){
    try {const raw=JSON.parse(localGet(PREF_KEY)||localGet(LEGACY_PREF_KEY)||'null');
      if(raw && typeof raw==='object')return {...DEFAULT_PREFS,...Object.fromEntries(Object.keys(DEFAULT_PREFS).filter(k=>k==='theme'?['light','dark','system'].includes(raw[k]):k==='spellLanguage'?['en-US','en-GB','en-CA','en-AU','fr','de','es'].includes(raw[k]):typeof raw[k]==='boolean').map(k=>[k,raw[k]]))};
    } catch(_error){}
    return {...DEFAULT_PREFS,theme:localGet('layoutlist-theme')==='dark'?'dark':'light'};
  }
  // Appearance Settings
  function applyPreferences(next){
    const root=document.documentElement;
    root.dataset.theme=next.theme==='system'?((typeof matchMedia==='function' && matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'):next.theme;
    for(const [prop,key] of [['largeText','large-text'],['highContrast','high-contrast'],['reducedMotion','reduced-motion'],['largeHandles','large-handles'],['simpleStage','simple-stage'],['readingComfort','reading-comfort'],['enhancedFocus','enhanced-focus']])root.setAttribute(`data-${key}`,String(Boolean(next[prop])));
    document.querySelectorAll('.frame-text').forEach(el=>{el.spellcheck=next.spellcheck!==false;el.lang=state.doc.metadata?.language||'en';});
    $('#theme-btn').setAttribute('aria-pressed',String(root.dataset.theme==='dark'));
    window.skoshPressAPI?.setSpelling?.(next.spellcheck!==false,next.spellLanguage||'en-US').catch(()=>{});
  }
  function setPreferences(next){preferences={...DEFAULT_PREFS,...next};localSet(PREF_KEY,JSON.stringify(preferences));applyPreferences(preferences);}
  function openSettings(){
    for(const [key,id] of [['largeText','large-text'],['highContrast','high-contrast'],['reducedMotion','reduced-motion'],['largeHandles','large-handles'],['simpleStage','simple-stage'],['readingComfort','reading-comfort'],['enhancedFocus','enhanced-focus']])$('#settings-'+id).checked=preferences[key];
    $('#settings-announce-selection').checked=preferences.announceSelection;$('#settings-announce-selection').checked=preferences.announceSelection;$('#settings-rulers').checked=preferences.showRulers;$('#settings-theme').value=preferences.theme;$('#settings-spellcheck').checked=preferences.spellcheck;$('#settings-spelling-language').value=preferences.spellLanguage;
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
      'frame-size','frame-leading','image-alt','page-label','metadata-author','metadata-description','metadata-publisher','metadata-rights','metadata-language-tag','page-width','page-height','page-margin','page-columns','page-gutter'];
    inputs.forEach(id=>document.getElementById(id)?.addEventListener('input',()=>markDirty()));
  }
  // Preference Controls
  function bindSettings(){
    onClick('#settings-btn',openSettings);
    onClick('#settings-close',()=>$('#settings-dialog').close());
    onClick('#settings-done',()=>$('#settings-dialog').close());
    onClick('#settings-reset',()=>{setPreferences(DEFAULT_PREFS);openSettingsUpdate();});
    onClick('#settings-focus-preview',()=>{$('#settings-focus-preview').focus();$('#settings-focus-status').textContent=preferences.enhancedFocus?'Strong focus outline enabled.':'Standard focus outline enabled.';});
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
    for(const [key,id] of [['largeText','large-text'],['highContrast','high-contrast'],['reducedMotion','reduced-motion'],['largeHandles','large-handles'],['simpleStage','simple-stage'],['readingComfort','reading-comfort'],['enhancedFocus','enhanced-focus']])$('#settings-'+id).addEventListener('change',e=>setPreferences({...preferences,[key]:e.target.checked}));
    $('#settings-announce-selection').addEventListener('change',e=>setPreferences({...preferences,announceSelection:e.target.checked}));
    $('#settings-rulers').addEventListener('change',e=>toggleRulers(e.target.checked));
  }
  const onClick=(selector,fn)=>$(selector).addEventListener('click',fn);
  function toggleRulers(enabled){setPreferences({...preferences,showRulers:Boolean(enabled)});render();toast(enabled?'Page rulers shown.':'Page rulers hidden.');}
  function openSettingsUpdate(){for(const [key,id] of [['largeText','large-text'],['highContrast','high-contrast'],['reducedMotion','reduced-motion'],['largeHandles','large-handles'],['simpleStage','simple-stage'],['readingComfort','reading-comfort'],['enhancedFocus','enhanced-focus']])$('#settings-'+id).checked=preferences[key];$('#settings-announce-selection').checked=preferences.announceSelection;$('#settings-rulers').checked=preferences.showRulers;$('#settings-theme').value=preferences.theme;$('#settings-spellcheck').checked=preferences.spellcheck;$('#settings-spelling-language').value=preferences.spellLanguage;}
  try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(preferences.theme==='system')applyPreferences(preferences);});}catch(_error){}


  // Editorial Counts
  function documentTextStats(){return textStats(state.doc);}
  function htmlToPlain(html){const el=document.createElement('div');el.innerHTML=sanitizeHtml(html);return el.textContent||'';}
  const BUITLINS=[['Default','Single editable A5 starter page'],['Book','Cover and chapter spread'],['Zine','Four half-letter pages'],['Pamphlet','Letter-sized three-panel draft']];
  // Template Controls
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
    if(saving)return;
    validateProject(doc);recoveryPaused=true;try{await clearRecovery();if(window.skoshPressAPI?.resetProjectPath)await window.skoshPressAPI.resetProjectPath();state.doc=clone(doc);$('#book-index-terms').value=(state.doc.indexTerms||[]).join('\n');state.doc.name='A Skosh Press Project';
    state.path=null;state.dirty=false;state.undo=[];state.redo=[];state.index=0;state.selected=null;
    $('#doc-name').value=state.doc.name;
    $('#templates-dialog').close();render();toast('New publication created from template.');}finally{recoveryPaused=false;if(state.dirty)scheduleRecovery();}
  }
  function bindTemplates(){
    const host=$('#builtin-templates');
    for(const [name,desc] of BUITLINS){const row=document.createElement('div');row.setAttribute('role','listitem');
      const b=document.createElement('button');b.type='button';b.className='template-entry';
      const t=document.createElement('strong');t.textContent=name;const d=document.createElement('small');d.textContent=desc;b.append(t,d);
      b.onclick=()=>{if(state.dirty&&!confirm('Discard unsaved edits and open a built-in template?'))return;startFromTemplate(builtInTemplate(name)).catch(showError);};row.append(b);host.append(row);}
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
      if(f.type!=='text'||!Publication.visible(state.doc,f))continue;
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
    let total=0;mutate(()=>{

    for(const [id,story] of Object.entries(state.doc.stories||{})){
      const out=replaceHtmlText(story.html,needle,replacement,sensitive,limit-total);story.html=out.html;total+=out.count;
      if(out.count)reflowStory(id);
    }
    for(const page of state.doc.pages)for(const frame of page.frames){
      if(frame.type!=='text' || frame.storyId || frame.locked || !Publication.visible(state.doc,frame) || total>=limit)continue;
      const out=replaceHtmlText(frame.html,needle,replacement,sensitive,limit-total);frame.html=out.html;total+=out.count;
    }
    });
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
      if(!frame){$('#find-result').textContent='Match no longer exists.';return;}if(frame.locked){$('#find-result').textContent='Unlock this object before replacing text.';return;}
      const query=$('#find-query').value,replacement=$('#replace-query').value,sensitive=$('#find-case').checked;
      let edited;
      if(frame.storyId){
        const story=state.doc.stories[frame.storyId];if(!story)return;
        const frames=frameChain(frame.storyId);
        let offset=hit.offset;
        for(const row of frames){if(row.frame.id===hit.id)break;offset+=htmlToPlain(row.frame.html).length;}
        edited=replaceAtTextOffset(story.html,offset,query,replacement,sensitive);
        if(edited.count)mutate(()=>{story.html=edited.html;reflowStory(frame.storyId);});
      }else{
        edited=replaceAtTextOffset(frame.html,hit.offset,query,replacement,sensitive);
        if(edited.count&&!frame.locked)mutate(()=>{frame.html=edited.html;});
      }
      if(edited?.count){updateEditorialPanel();findPosition=-1;$('#find-result').textContent='Replaced selected match.';}
      else $('#find-result').textContent='Could not replace across formatting boundaries. Try Replace all or edit that text directly.';
    });
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='f'&&SkoshEditorInterface.canUseProjectCommand(document)){e.preventDefault();$('#find-dialog').showModal();updateEditorialPanel();$('#find-query').focus();}});
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
  const LAB_FIELDS={name:'lab-name',sheetWidth:'lab-width',sheetHeight:'lab-height',margin:'lab-margin',binding:'lab-binding',duplex:'lab-duplex',color:'lab-color',copies:'lab-copies',bleed:'lab-bleed',cropMarks:'lab-marks',bindingGutter:'lab-gutter',signaturePages:'lab-signature',paperWeight:'lab-weight',paperFinish:'lab-finish',grain:'lab-grain',targetDpi:'lab-dpi',orientation:'lab-orientation',caliper:'lab-caliper'};
  const LAB_NUMBERS=new Set(['sheetWidth','sheetHeight','margin','copies','bleed','bindingGutter','signaturePages','paperWeight','targetDpi','caliper']);
  let printerProfiles=[];
  let selectedPrinterId=null;
  let labEstimate=null,labProfile=null,labSide=0;
  const LAB_COST_FIELDS=['lab-paper-cost','lab-ink-cost','lab-staple-cost','lab-other-cost'];
  function renderLabCosts(){
    const output=$('#lab-cost-total');
    try{const fields=LAB_COST_FIELDS.map(id=>$('#'+id));if(fields.some(field=>field.validity.badInput))throw new Error('Enter a valid amount.');const total=window.SkoshPrintLab.enteredCostTotal(fields.map(field=>field.value));output.textContent=total===null?'No amounts entered':costString(total);}
    catch(error){output.textContent=error.message;}
  }
  function clearLabCosts(){for(const id of LAB_COST_FIELDS)$('#'+id).value='';renderLabCosts();}
  function labForm(){return Object.fromEntries(Object.entries(LAB_FIELDS).map(([key,id])=>[key,key==='cropMarks'?$('#'+id).checked:LAB_NUMBERS.has(key)?($('#'+id).validity.badInput?NaN:$('#'+id).value.trim()===''?NaN:Number($('#'+id).value)):$('#'+id).value]));}
  function setLabForm(profile){const p=window.SkoshPrintLab.restoreProfile(profile);for(const [key,id] of Object.entries(LAB_FIELDS)){if(key==='cropMarks')$('#'+id).checked=p[key];else $('#'+id).value=p[key]??'';}}
  function labRenderProof(){
    const host=$('#lab-proof'),select=$('#lab-side');host.replaceChildren();
    if(!labEstimate){select.replaceChildren();$('#lab-proof-label').textContent='No valid sheet settings.';for(const id of ['lab-prev-side','lab-next-side','lab-export-proof','lab-export-production','lab-preflight'])$('#'+id).disabled=true;return;}
    const {geometry:g,sides}=labEstimate;labSide=clamp(labSide,0,sides.length-1);
    if(select.options.length!==sides.length||select.dataset.plan!==sides.map(s=>s.pages.join(',')+s.face).join(';')){
      select.replaceChildren(...sides.map((s,i)=>new Option(`Sheet ${s.sheet} · ${s.face}`,String(i))));select.dataset.plan=sides.map(s=>s.pages.join(',')+s.face).join(';');
    }
    select.value=String(labSide);const side=sides[labSide];
    $('#lab-prev-side').disabled=labSide===0;$('#lab-next-side').disabled=labSide===sides.length-1;
    $('#lab-export-proof').disabled=$('#lab-export-production').disabled=!labEstimate.physicalFit;$('#lab-preflight').disabled=false;
    const scale=Math.min(Math.max(100,host.clientWidth-8)/(g.width*MM),300/(g.height*MM),1);
    const wrapper=document.createElement('div');wrapper.className='lab-proof-sheet';Object.assign(wrapper.style,{width:g.width*MM*scale+'px',height:g.height*MM*scale+'px'});
    const sheet=document.createElement('div');sheet.className='lab-proof-paper';sheet.lang=state.doc.metadata?.language||'en';Object.assign(sheet.style,{width:g.width+'mm',height:g.height+'mm',transform:`scale(${scale})`});
    const template=document.createElement('template');template.innerHTML=productionSideMarkup(g,side);
    for(const el of template.content.querySelectorAll('[style]')){const style=el.getAttribute('style');el.removeAttribute('style');el.style.cssText=style;}
    sheet.append(template.content);sheet.classList.toggle('lab-gray-proof',$('#lab-gray').checked);
    if($('#lab-guides').checked){
      const guide=(kind,x,y,w,h)=>{const el=document.createElement('div');el.className='lab-guide '+kind;Object.assign(el.style,{left:x+'mm',top:y+'mm',width:w+'mm',height:h+'mm'});sheet.append(el);};
      const p=labProfile;guide('lab-printable-guide',p.margin,p.margin,g.width-2*p.margin,g.height-2*p.margin);
      g.cells.forEach((c,i)=>{guide('lab-bleed-guide',c.x-c.leftBleed,c.y-c.topBleed,c.w+c.leftBleed+c.rightBleed,c.h+c.topBleed+c.bottomBleed);guide('lab-trim-guide',c.x,c.y,c.w,c.h);const n=side.pages[i],gut=Math.min(p.bindingGutter,c.w);if(n!==null&&gut>0)guide('lab-gutter-guide',c.x+(n%2===0?c.w-gut:0),c.y,gut,c.h);});
    }
    wrapper.append(sheet);host.append(wrapper);
    const description=`${g.width} × ${g.height} mm · Sheet ${side.sheet} ${side.face}${side.signature?' · Signature '+side.signature:''} · Pages ${side.pages.map(n=>n??'blank').join(' | ')}${side.creep?' · Creep '+side.creep.toFixed(2)+' mm':''}${labEstimate.physicalFit?'':' · Does not fit at 100%'}`;
    $('#lab-proof-label').textContent=description;host.setAttribute('aria-label',description);
  }
  async function exportProduction(proof){
    try{const p=window.SkoshPrintLab.valid(labForm()),estimate=window.SkoshPrintLab.plan(state.doc,p);if(!estimate.physicalFit)throw new Error('Production does not fit the selected sheet at 100%.');if(!window.skoshPressAPI?.exportPdf)throw new Error('Open Skosh Press with Electron to export PDF.');const result=await window.skoshPressAPI.exportPdf(printHtml(false,estimate,proof?labSide:null),estimate.geometry.width,estimate.geometry.height,p.binding==='saddle',{trimWidth:estimate.geometry.trimWidth,trimHeight:estimate.geometry.trimHeight,bleed:p.bleed,caliper:p.caliper,maxCreep:estimate.maxCreep,signaturePages:p.signaturePages,sideCount:proof?1:estimate.sides.length,binding:p.binding});if(result)toast(`Production PDF saved: ${savePathName(result.path)}`);else toast('PDF export canceled.');}catch(error){showError(error);}
  }
  function labCheckProduction(){
    if(!labEstimate)return;
    const host=$('#lab-preflight-output');host.replaceChildren();
    const doc=Publication.outputDocument(state.doc),issues=window.SkoshPrintLab.productionIssues(doc,labProfile,window.SkoshPreflight.imageDimensions);
    const overflow=new Set(measureTextOverflow());doc.pages.forEach((page,index)=>{for(const f of page.frames)if(overflow.has(f.id))issues.push({severity:'error',page:index,frameId:f.id,title:'Text overflows frame'});});
    if(!labEstimate.physicalFit)issues.unshift({severity:'error',page:null,title:'Production exceeds printable sheet'});
    const summary=document.createElement('p');summary.textContent=issues.length?`${issues.filter(i=>i.severity==='error').length} errors · ${issues.filter(i=>i.severity==='warning').length} suggestions (up to 400 geometry and image findings).`:'No production issues found. Review the proof and print a test sheet.';host.append(summary);
    for(const issue of issues.slice(0,400)){const row=document.createElement('button');row.type='button';row.className='lab-issue';row.textContent=`${issue.severity==='error'?'Error':'Review'}${issue.page===null?'':' · Page '+(issue.page+1)}: ${issue.title}`;row.disabled=issue.page===null;row.onclick=()=>{const side=labEstimate.sides.findIndex(s=>s.pages.includes(issue.page+1));if(side>=0){labSide=side;labRenderProof();$('#lab-side').focus();}};host.append(row);}
  }
  const costString=n=>n===null?'Not entered':n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  function makeLabStats(parent,value,label){const box=document.createElement('div');box.className='lab-stat';const big=document.createElement('strong');big.textContent=String(value);const small=document.createElement('span');small.textContent=label;box.append(big,small);parent.append(box);}
  function labRender(){
    const output=$('#lab-output'),warning=$('#lab-warning'),pairs=$('#lab-pairings');
    output.replaceChildren();warning.replaceChildren();pairs.replaceChildren();$('#lab-preflight-output').textContent='Run a check against the current production settings.';
    let p,estimate;
    try{p=window.SkoshPrintLab.valid(labForm());estimate=window.SkoshPrintLab.plan(state.doc,p);}
    catch(error){labEstimate=null;labProfile=null;labRenderProof();output.textContent='Check the printing settings: '+error.message;$('#lab-export-pdf').disabled=true;$('#lab-export-booklet').disabled=true;return;}
    labEstimate=estimate;labProfile=p;labRenderProof();
    const stats=document.createElement('div');stats.className='lab-statgrid';
    makeLabStats(stats,estimate.sheetsPerCopy,'SHEETS PER COPY');
    makeLabStats(stats,estimate.totalSheets,'TOTAL SHEETS');
    output.append(stats);
    for(const [label,value] of [['Pages in document',estimate.pages],['Signatures',estimate.signatures],['Blank pages',estimate.blankPages],['Required area (mm)',`${round(estimate.requiredPrintableWidth)} × ${round(estimate.requiredPrintableHeight)}`],['Paper stock',`${p.paperWeight} gsm · ${p.paperFinish}`],['Total paper (kg)',costString(estimate.paperMassKg)],['Printed sides (all copies)',estimate.totalPrintedSides]]){
      const row=document.createElement('div');row.className='lab-row';const one=document.createElement('span');one.textContent=label;const two=document.createElement('strong');two.textContent=String(value);row.append(one,two);output.append(row);
    }
    for(const msg of estimate.warnings){const p=document.createElement('p');p.className='lab-alert';p.textContent='⚠ '+msg;warning.append(p);}
    if(!estimate.warnings.length){const p=document.createElement('p');p.className='panel-hint';p.textContent='Page size fits the declared sheet dimensions. Make a one-sheet proof to verify printer margins and flip direction.';warning.append(p);}
    if(estimate.mode==='saddle'){
      for(const row of estimate.pairings){
        const element=document.createElement('div');element.className='lab-pair';
        const label=document.createElement('strong');label.textContent='S'+row.signature+' · '+row.sheet;
        const front=document.createElement('span');front.textContent='Front: '+row.front.map(n=>n??'blank').join(' | ');
        const back=document.createElement('span');back.textContent='Back: '+row.back.map(n=>n??'blank').join(' | ');
        element.append(label,front,back);pairs.append(element);
      }

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
    clearLabCosts();$('#print-lab-dialog').showModal();
    try{printerProfiles=await (window.skoshPressAPI?.listPrinterProfiles?.()||Promise.resolve([]));labProfileSelect();if(selectedPrinterId)setLabForm(printerProfiles.find(x=>x.id===selectedPrinterId));}
    catch(error){$('#lab-profile-status').textContent='Could not load local profiles: '+error.message;}
    labRender();
  }
  // Printing Controls
  function bindPrintLab(){
    onClick('#print-lab-btn',openPrintLab);
    onClick('#lab-clear-costs',clearLabCosts);
    for(const id of LAB_COST_FIELDS)$('#'+id).addEventListener('input',renderLabCosts);
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
    $('#lab-side').addEventListener('change',e=>{labSide=Number(e.target.value);labRenderProof();});
    onClick('#lab-prev-side',()=>{labSide--;labRenderProof();});onClick('#lab-next-side',()=>{labSide++;labRenderProof();});
    for(const id of ['lab-guides','lab-gray'])$('#'+id).addEventListener('change',labRenderProof);
    onClick('#lab-preflight',labCheckProduction);onClick('#lab-export-proof',()=>exportProduction(true));onClick('#lab-export-production',()=>exportProduction(false));
    onClick('#lab-export-pdf',()=>{$('#print-lab-dialog').close();exportPdf(false);});
    onClick('#lab-export-booklet',()=>{$('#print-lab-dialog').close();exportPdf(true);});
  }

  // Document Checks
  let preflightResult=null;
  function measureTextOverflow(){
    const overflowing=[];
    const scale=MM*state.zoom;
    const host=document.createElement('div');host.className='frame';host.setAttribute('aria-hidden','true');
    Object.assign(host.style,{position:'fixed',top:'0',left:'-20000px',visibility:'hidden',pointerEvents:'none'});
    const content=document.createElement('div');content.className='frame-content frame-text';host.append(content);document.body.append(host);
    try{
      for(const page of state.doc.pages)for(const frame of page.frames){
        if(frame.type!=='text'||!Publication.visible(state.doc,frame))continue;
        Object.assign(host.style,{width:frame.w*scale+'px',height:frame.h*scale+'px'});
        Object.assign(content.style,styleProperties(effectiveStyle(frame),state.zoom));
        applyParagraphGap(content,effectiveStyle(frame));frameComposition(content,state.doc,page,frame,scale);applyInsets(content,state.doc,page,frame,scale);
        if(content.clientHeight&&content.scrollHeight>content.clientHeight+3)overflowing.push(frame.id);
      }
    }finally{host.remove();}
    return overflowing;
  }
  function checkPublication(){
    preflightResult=window.SkoshPreflight.audit(Publication.outputDocument(state.doc),{overflowIds:measureTextOverflow()});
    const result=preflightResult;
    const summary=$('#preflight-summary');summary.replaceChildren();
    for(const [value,label] of [[result.errors,'Must fix'],[result.warnings,'Suggestions'],[result.pages,'Pages'],[result.words,'Words'],[result.images,'Images']]){
      const stat=document.createElement('div');stat.className='preflight-stat';
      const strong=document.createElement('strong');strong.textContent=String(value);
      const small=document.createElement('span');small.textContent=label;stat.append(strong,small);summary.append(stat);
    }
    renderPreflightIssues();
  }
  function renderPreflightIssues(){
    const host=$('#preflight-issues');host.replaceChildren();
    if(!preflightResult)return;
    const filter=$('#preflight-filter').value;
    const issues=preflightResult.issues.filter(issue=>filter==='all'||issue.severity===filter);
    if(!issues.length){const p=document.createElement('p');p.className='preflight-empty';p.textContent='No issues in this category. Review exported pages visually before publishing.';host.append(p);return;}
    issues.forEach(issue=>{
      const row=document.createElement('div');row.setAttribute('role','listitem');
      const control=document.createElement(issue.page!==null?'button':'div');control.className='preflight-issue';
      if(issue.page!==null){control.type='button';control.setAttribute('aria-label',`Go to page ${issue.page+1}: ${issue.title}`);control.onclick=()=>{
        $('#preflight-dialog').close();if(document.documentElement.dataset.focusMode==='true')toggleFocusMode(false);
        selectPage(issue.page,true);
        if(issue.frameId){selectFrame(issue.frameId,issue.page);document.querySelector(`.frame[data-frame="${CSS.escape(issue.frameId)}"]`)?.focus({preventScroll:true});}
        else $('#page-list .page-list-item.active')?.focus({preventScroll:true});
      };}
      const badge=document.createElement('span');badge.className=`preflight-severity ${issue.severity}`;badge.textContent=issue.severity==='error'?'Must fix':'Suggestion';
      const body=document.createElement('span');const title=document.createElement('strong');title.textContent=issue.title;
      const detail=document.createElement('small');detail.textContent=(issue.page!==null?`Page ${issue.page+1} · `:'')+issue.detail;
      body.append(title,detail);control.append(badge,body);row.append(control);host.append(row);
    });
    if(preflightResult.errors+preflightResult.warnings>preflightResult.issues.length){
      const limit=document.createElement('p');limit.className='preflight-empty';limit.textContent='Showing the first 400 issues. Fix these and run the checks again.';host.append(limit);
    }
  }
  async function copyPreflight(){
    if(!preflightResult)checkPublication();
    const result=preflightResult;
    const report=[`${state.doc.name} — Document checks`,`${result.errors} must fix · ${result.warnings} suggestions · ${result.pages} pages`,...result.issues.map(issue=>`${issue.severity.toUpperCase()} ${issue.page!==null?'Page '+(issue.page+1)+': ':''}${issue.title} — ${issue.detail}`)].join('\n');
    try{await navigator.clipboard.writeText(report);$('#preflight-copy-status').textContent='Report copied to clipboard.';}
    catch{$('#preflight-copy-status').textContent='Clipboard unavailable. You can review the issues in this window.';}
  }
  function openPreflight(){
    checkPublication();$('#preflight-dialog').showModal();$('#preflight-filter').focus();
  }
  // Focus Controls
  function updateFocusTools(){
    $('#focus-page-position').textContent=`Page ${state.index+1} / ${state.doc.pages.length}`;
    $('#focus-previous-page').disabled=state.index===0;
    $('#focus-next-page').disabled=state.index>=state.doc.pages.length-1;
    $('#focus-duplicate').disabled=!selectedFrame()||selectionLocked();
    $('#focus-zoom-value').textContent=Math.round(state.zoom*100)+'%';
    $('#focus-zoom-out').disabled=state.zoom<=0.25;
    $('#focus-zoom-in').disabled=state.zoom>=1.8;
  }
  function focusAddedFrame(){
    const frame=[...document.querySelectorAll('.frame')].find(el=>el.dataset.frame===state.selected && el.closest('.paper')?.dataset.page===String(state.index));
    frame?.focus({preventScroll:true});
    frame?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function toggleFocusMode(value){
    const enabled=typeof value==='boolean'?value:document.documentElement.dataset.focusMode!=='true';
    document.documentElement.dataset.focusMode=String(enabled);
    $('#focus-tools').hidden=!enabled;
    $('#focus-mode-btn').setAttribute('aria-pressed',String(enabled));
    $('#focus-mode-btn').textContent=enabled?'◩ Exit focus':'◫ Focus';
    if(enabled){updateFocusTools();$('#focus-add-text').focus({preventScroll:true});}
    else $('#focus-mode-btn').focus({preventScroll:true});
    toast(enabled?'Focus view. Use the small toolbar above the page.':'Full editor restored.');
  }
  async function placeImage(){
    try{
      const image=await window.skoshPressAPI?.importImage();
      if(image){addFrame('image',image);if(document.documentElement.dataset.focusMode==='true')focusAddedFrame();}
      else if(!window.skoshPressAPI)toast('Run with Electron to place images.');
    }catch(error){showError(error);}
  }
  function bindFocusTools(){
    onClick('#focus-add-text',()=>{addFrame('text');focusAddedFrame();});
    onClick('#focus-add-image',()=>{void placeImage();});
    onClick('#focus-add-page',()=>{addPage();updateFocusTools();});
    onClick('#focus-duplicate',()=>{duplicateFrame();focusAddedFrame();});
    onClick('#focus-previous-page',()=>selectPage(state.index-1,true));
    onClick('#focus-next-page',()=>selectPage(state.index+1,true));
    onClick('#focus-zoom-out',()=>changeZoom(state.zoom-.1));
    onClick('#focus-zoom-in',()=>changeZoom(state.zoom+.1));
    onClick('#focus-exit',()=>toggleFocusMode(false));
    $('#focus-tools').addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || !event.target.closest('button'))return;
      const buttons=[...$('#focus-tools').querySelectorAll('button:not([disabled])')];
      const index=buttons.indexOf(event.target);if(index<0)return;
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowLeft'?(index+buttons.length-1)%buttons.length:(index+1)%buttons.length;
      event.preventDefault();buttons[next]?.focus();
    });
  }
  function bindPublishingTools(){
    onClick('#preflight-btn',openPreflight);onClick('#preflight-close',()=>$('#preflight-dialog').close());
    onClick('#preflight-refresh',checkPublication);onClick('#preflight-copy',()=>{void copyPreflight();});
    $('#preflight-filter').addEventListener('change',renderPreflightIssues);
    onClick('#focus-mode-btn',()=>toggleFocusMode());bindFocusTools();
    for(const button of document.querySelectorAll('[data-align]'))button.addEventListener('click',()=>attempt(()=>alignSelectedFrame(button.dataset.align)));
    onClick('#add-continuation',addContinuation);onClick('#book-contents',generateContents);onClick('#book-index',generateIndex);
    onClick('#section-apply',()=>{const title=$('#section-title').value.trim().slice(0,200),start=Number($('#section-start').value);if(title&&(!Number.isInteger(start)||start<1||start>10000))return toast('Enter a starting page number from 1 to 10000.');mutate(()=>{if(title)currentPage().section={title,start};else delete currentPage().section;});});
    onClick('#page-move-before',()=>moveCurrentPage(-1));onClick('#page-move-after',()=>moveCurrentPage(1));
    $('#page-label').addEventListener('change',event=>mutate(()=>{currentPage().label=event.target.value.trim().slice(0,200); }));
    for(const key of ['author','description','publisher','rights'])$('#metadata-'+key).addEventListener('change',event=>mutate(()=>{
      if(!state.doc.metadata)state.doc.metadata={};state.doc.metadata[key]=event.target.value.trim().slice(0,{author:160,description:1000,publisher:160,rights:300}[key]);
    }));
    $('#metadata-language').addEventListener('change',event=>{
      if(event.target.value==='other'){$('#metadata-language-custom').hidden=false;$('#metadata-language-tag').focus();return;}
      mutate(()=>{if(!state.doc.metadata)state.doc.metadata={};state.doc.metadata.language=event.target.value;for(const id of Object.keys(state.doc.stories||{}))reflowStory(id);});
    });
    $('#metadata-language-tag').addEventListener('change',event=>{
      const value=event.target.value.trim();if(!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(value)){toast('Enter a valid language tag, such as en-US.');return;}
      mutate(()=>{if(!state.doc.metadata)state.doc.metadata={};state.doc.metadata.language=value;for(const id of Object.keys(state.doc.stories||{}))reflowStory(id);});
    });
    $('#image-alt').addEventListener('change',event=>{const f=selectedFrame();if(f?.type==='image')mutate(()=>{f.alt=event.target.value.trim().slice(0,500);});});
    $('#image-decorative').addEventListener('change',event=>{const f=selectedFrame();if(f?.type==='image')mutate(()=>{f.decorative=event.target.checked;});});
    document.addEventListener('keydown',event=>{
      if(!(event.ctrlKey||event.metaKey)||!event.shiftKey||document.querySelector('dialog[open]'))return;
      if(event.key.toLowerCase()==='p'){event.preventDefault();openPreflight();}
      if(event.key.toLowerCase()==='l'){event.preventDefault();toggleFocusMode();}
    });
  }
  // Help Dialogs
  function openHelpDialog(selector){
    const dialog=$(selector);
    if(!dialog.open){dialog.showModal();dialog.querySelector('.help-content').scrollTop=0;dialog.querySelector('.help-close').focus();}
  }
  // Event Wiring
  // Parent Studio
  function bindMasterStudio(){
    const dialog=$('#master-dialog'),picker=$('#master-list');
    let workingId=null,blocks=[];
    function preview(){
      const host=$('#parent-layout-preview'),paper=state.doc.paper,scale=Math.min(220/paper.width,220/paper.height),id='master-preview';
      host.replaceChildren();host.style.width=paper.width*scale+'px';host.style.height=paper.height*scale+'px';
      const draft={...state.doc,masters:[{id,header:$('#master-header').value,footer:$('#master-footer').value,pageNumber:$('#master-numbers').checked,numberOffset:clamp(Math.round(number($('#master-offset').value,0)),-10000,10000),blocks}],pages:state.doc.pages.map((p,i)=>i===state.index?{...p,masterId:id}:p)};
      for(const part of Layout.masterParts(draft,state.index)){
        const el=document.createElement('div');el.className='thumbnail-parent';el.textContent=part.text;
        Object.assign(el.style,{left:part.x*scale+'px',top:part.y*scale+'px',width:part.w*scale+'px',height:part.h*scale+'px',textAlign:part.align,fontSize:(part.size||9)*96/72*scale/MM+'px'});host.append(el);
      }
    }
    for(const id of ['master-header','master-footer','master-numbers','master-offset'])$('#'+id).addEventListener('input',preview);
    function renderBlocks(){
      const host=$('#parent-blocks');host.replaceChildren();
      for(const [i,b] of blocks.entries()){
        const row=document.createElement('div');row.className='parent-block-row';
        const label=document.createElement('label');label.textContent='TEXT OBJECT '+(i+1);label.htmlFor='parent-text-'+i;
        const input=document.createElement('textarea');input.id=label.htmlFor;input.maxLength=2000;input.rows=2;input.value=b.text;input.oninput=()=>{b.text=input.value;preview();};row.append(label,input);
        const grid=document.createElement('div');grid.className='input-grid';
        for(const [key,title,min,max] of [['x','X / MM',0,1000],['y','Y / MM',0,1000],['w','WIDTH / MM',1,1000],['h','HEIGHT / MM',1,1000],['size','SIZE / PT',6,150]]){
          const cell=document.createElement('div'),label=document.createElement('label'),field=document.createElement('input');field.id=`parent-${key}-${i}`;label.htmlFor=field.id;label.textContent=title;field.type='number';field.min=min;field.max=max;field.step='0.5';field.value=b[key];field.onchange=()=>{b[key]=clamp(number(field.value,b[key]),min,max);field.value=b[key];preview();};cell.append(label,field);grid.append(cell);
        }
        const align=document.createElement('select');align.setAttribute('aria-label','Text object '+(i+1)+' alignment');for(const a of ['left','center','right'])align.add(new Option(a,a));align.value=b.align;align.onchange=()=>{b.align=align.value;preview();};
        const remove=document.createElement('button');remove.type='button';remove.textContent='Remove text object '+(i+1);remove.onclick=()=>{blocks.splice(i,1);renderBlocks();};row.append(grid,align,remove);host.append(row);
      }
      $('#parent-add-block').disabled=blocks.length>=30;preview();
    }
    $('#parent-add-block').onclick=()=>{const p=state.doc.paper;blocks.push({text:'{title}',x:p.margin,y:p.margin,w:p.width-2*p.margin,h:15,size:11,align:'left'});renderBlocks();$('#parent-text-'+(blocks.length-1)).focus();};
    function populate(){
      picker.replaceChildren(new Option('＋ New parent page',''));
      for(const item of state.doc.masters||[])picker.add(new Option(item.name,item.id));
      picker.value=workingId||'';
    }
    function load(id){
      workingId=id||null;const master=(state.doc.masters||[]).find(m=>m.id===id);
      $('#master-name').value=master?.name||'Standard';
      $('#master-header').value=master?.header||'';
      $('#master-footer').value=master?.footer||'';
      $('#master-numbers').checked=master?.pageNumber??true;
      $('#master-offset').value=master?.numberOffset||0;blocks=clone(master?.blocks||[]);renderBlocks();
      populate();
    }
    const open=()=>{load(currentPage().masterId||state.doc.masters?.[0]?.id||null);dialog.showModal();};
    $('#master-manage').addEventListener('click',open);
    $('#master-close').addEventListener('click',()=>dialog.close());
    $('#master-new').addEventListener('click',()=>load(null));
    picker.addEventListener('change',()=>load(picker.value));
    $('#master-save').addEventListener('click',()=>{
      if(!workingId&&(state.doc.masters||[]).length>=30)return toast('Maximum 30 parent pages per document.');
      const entry={id:workingId||'master-'+uid().toLowerCase(),name:$('#master-name').value.trim().slice(0,64)||'Standard',
        header:$('#master-header').value.slice(0,200),footer:$('#master-footer').value.slice(0,200),
        blocks:clone(blocks),pageNumber:$('#master-numbers').checked,numberOffset:clamp(Math.round(number($('#master-offset').value,0)),-10000,10000)};
      mutate(()=>{state.doc.masters ||= [];const i=state.doc.masters.findIndex(m=>m.id===entry.id);
        if(i>=0)state.doc.masters[i]=entry;else state.doc.masters.push(entry);
        currentPage().masterId=entry.id;});
      workingId=entry.id;populate();toast('Parent page saved and applied to the selected page.');
    });
    $('#master-remove').addEventListener('click',()=>{
      if(!workingId)return;
      const id=workingId;
      mutate(()=>{state.doc.masters=state.doc.masters.filter(m=>m.id!==id);for(const page of state.doc.pages)if(page.masterId===id)delete page.masterId;});
      load(null);toast('Parent page deleted; other page contents were not changed.');
    });
  }

  // Toolbar Personalization
  function bindToolbarCustomization(){
    const model=window.SkoshToolbar,KEY='skoshpress-quick-tools-v1';
    const strip=$('#pinned-tool-list'),list=$('#toolbar-customize-list'),dialog=$('#toolbar-customize-dialog');
    let pins;
    try{pins=model.normalize(JSON.parse(localGet(KEY)));}catch(_error){pins=[...model.DEFAULT];}
    let dragging=null;
    const itemFor=id=>model.CATALOG.find(item=>item.id===id);
    function store(next){pins=model.normalize(next);localSet(KEY,JSON.stringify(pins));render();}
    function render(){
      strip.replaceChildren();list.replaceChildren();
      for(const id of pins){
        const item=itemFor(id);if(!item)continue;
        const button=document.createElement('button');
        button.type='button';button.className='pinned-command';button.draggable=true;
        button.dataset.pinId=id;button.title=`${item.label}. Drag to reorder; Alt+Left / Alt+Right also moves.`;
        button.textContent=`${item.icon} ${item.label}`;
        button.setAttribute('aria-label',`Quick tool: ${item.label}`);
        button.onclick=()=>document.getElementById(id)?.click();
        button.addEventListener('keydown',event=>{
          if(!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
          event.preventDefault();const at=pins.indexOf(id),to=at+(event.key==='ArrowLeft'?-1:1);
          if(to<0||to>=pins.length)return;
          store(model.move(pins,id,to));strip.querySelector(`[data-pin-id="${id}"]`)?.focus();
        });
        button.addEventListener('dragstart',event=>{
          dragging=id;event.dataTransfer.effectAllowed='move';
          event.dataTransfer.setData('text/plain',id);
        });
        button.addEventListener('dragover',event=>{if(dragging!==null){event.preventDefault();button.classList.add('drag-over');}});
        button.addEventListener('dragleave',()=>button.classList.remove('drag-over'));
        button.addEventListener('drop',event=>{
          event.preventDefault();button.classList.remove('drag-over');
          if(dragging&&dragging!==id)store(model.move(pins,dragging,pins.indexOf(id)));
          dragging=null;
        });
        button.addEventListener('dragend',()=>{dragging=null;strip.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));});
        strip.append(button);
      }
      if(!pins.length){const note=document.createElement('span');note.className='favorite-empty';note.textContent='No quick tools pinned';strip.append(note);}
      for(const item of model.CATALOG){
        const at=pins.indexOf(item.id),row=document.createElement('div');row.className='toolbar-choice';
        const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=at>=0;
        box.setAttribute('aria-label',`Pin ${item.label}`);
        box.addEventListener('change',()=>{
          try{store(model.toggle(pins,item.id));$('#toolbar-customize-status').textContent=`${pins.length} of ${model.MAX_PINS} quick tools pinned.`;}
          catch(error){$('#toolbar-customize-status').textContent=error.message;render();}
        });
        const name=document.createElement('span');name.textContent=item.label;
        const group=document.createElement('small');group.textContent=item.group;
        label.append(box,name,group);row.append(label);
        if(at>=0){
          for(const [direction,symbol,labelText] of [[-1,'↑','Move earlier'],[1,'↓','Move later']]){
            const move=document.createElement('button');move.type='button';move.textContent=symbol;
            move.title=`${labelText}: ${item.label}`;move.setAttribute('aria-label',`${labelText}: ${item.label}`);
            move.disabled=at+direction<0||at+direction>=pins.length;
            move.onclick=()=>{store(model.move(pins,item.id,at+direction));$('#toolbar-customize-status').textContent=`Moved ${item.label}.`;};
            row.append(move);
          }
        }
        list.append(row);
      }
      if(!dialog.open)$('#toolbar-customize-status').textContent=`${pins.length} of ${model.MAX_PINS} quick tools pinned.`;
    }
    $('#toolbar-customize-btn').addEventListener('click',()=>{render();dialog.showModal();});
    $('#toolbar-customize-close').addEventListener('click',()=>dialog.close());
    $('#toolbar-customize-done').addEventListener('click',()=>dialog.close());
    $('#toolbar-defaults').addEventListener('click',()=>{store(model.DEFAULT);$('#toolbar-customize-status').textContent='Default quick tools restored.';});
    render();
  }

  // Toolbar Navigation
  function bindRibbonNavigation(){
    const tabs=[...document.querySelectorAll('[data-ribbon-tab]')];
    const panels=[...document.querySelectorAll('[data-ribbon-panel]')];
    function activate(name,focus=false){
      for(const tab of tabs){
        const active=tab.dataset.ribbonTab===name;
        tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
        if(active&&focus)tab.focus();
      }
      for(const panel of panels)panel.hidden=panel.dataset.ribbonPanel!==name;
    }
    for(const tab of tabs){
      tab.addEventListener('click',()=>activate(tab.dataset.ribbonTab));
      tab.addEventListener('keydown',event=>{
        const index=tabs.indexOf(tab);
        const next=event.key==='ArrowRight'?tabs[(index+1)%tabs.length]:event.key==='ArrowLeft'?tabs[(index+tabs.length-1)%tabs.length]:event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):null;
        if(!next)return;
        event.preventDefault();activate(next.dataset.ribbonTab,true);
      });
    }
    SkoshEditorInterface.bindMore(document);
  }

  // Typography Studio
  function bindTypographyStudio(){
    const dialog=$('#typography-studio-dialog'),designPicker=$('#studio-design'),charPicker=$('#studio-glyph');
    const board=$('#studio-vector-canvas'),VectorFont=window.SkoshVectorFont,SvgGlyph=window.SkoshSvgGlyph;
    const Word=window.SkoshTypeWorkspace,wordBoard=$('#studio-word-canvas'),GlyphTools=window.SkoshGlyphTools;
    const Outline=window.SkoshOutlineOperations,FontVariations=window.SkoshFontVariations;
    const Components=window.SkoshGlyphComponents,Integrity=window.SkoshFontIntegrity,Spacing=window.SkoshSpacingStudio,Master=window.SkoshMasterCompatibility,Specimen=window.SkoshTypeSpecimen;
    let wordDrag=null,wordSelectionIndex=0;
    const SVGNS='http://www.w3.org/2000/svg';
    let draft=null,currentChar='A',activeStyle='Regular',activeKind='base',activeSequence='',activeAlt=0,selection=null,drag=null,drawMode=false,drawPoints=[],lastTTF=null;
    const starterCache=new Map(),history=[],redoHistory=[];
    const Workbench=window.SkoshTypeWorkbench,GeneratedCheck=window.SkoshGeneratedFontCheck;
    let glyphPage=0,visibleGlyphs=[];
    let masterReport=null,reviewedIndex=-1,integrityReport=null;
    let specimenFace=null,specimenFont=null,specimenSerial=0,specimenDraftDirty=true;
    for(const [label,chars] of PixelFont.REPERTOIRE){
      const group=document.createElement('optgroup');group.label=label;
      for(const char of chars){
        const name=char===' '?'Space':char==='\u00a0'?'Nonbreaking space':char==='\u00ad'?'Soft hyphen':char;
        group.append(new Option(chars===PixelFont.CHARS?name:`${name} · U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}`,char));
        $('#studio-copy-from').add(new Option(name,char));
        if(chars===PixelFont.CHARS&&char!==' ')$('#studio-alt-char').add(new Option(char,char));
      }
      charPicker.append(group);
      $('#studio-glyph-group').add(new Option(label,label));
    }
    $('#studio-copy-from').value='B';
    $('#studio-alt-char').value='A';
    const node=(type,attrs={},parent=board)=>{
      const el=document.createElementNS(SVGNS,type);
      for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
      parent.append(el);return el;
    };
    function traceTemplate(ch){
      if(ch===' ')return [];
      const w=160,h=210,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.clearRect(0,0,w,h);ctx.fillStyle='#000';
      let size=172;ctx.font=`700 ${size}px Arial, sans-serif`;
      while(ctx.measureText(ch).width>w-8&&size>80){size-=4;ctx.font=`700 ${size}px Arial, sans-serif`;}
      ctx.fillText(ch,(w-ctx.measureText(ch).width)/2,175);
      const rgba=ctx.getImageData(0,0,w,h).data,bits=new Uint8Array(w*h);
      for(let i=0;i<bits.length;i++)bits[i]=rgba[i*4+3]>115?1:0;
      return VectorFont.traceBitmap(bits,w,h);
    }
    function template(ch){
      if(!starterCache.has(ch))starterCache.set(ch,traceTemplate(ch));
      return starterCache.get(ch);
    }
    function glyphFor(ch,style=activeStyle){
      const stored=(style==='Regular'?draft.glyphs:draft.variants?.[style]?.glyphs)?.[ch]??draft.glyphs[ch];
      return stored??(draft.componentLinks?.[ch]?.length?[]:template(ch));
    }
    function composed(ch,style=activeStyle){
      const base=Components.resolve(glyphFor(ch,style),draft.components||{},draft.componentLinks?.[ch]||[],false);
      return Spacing.resolveSpacing(base,draft,ch).glyph;
    }
    function refreshVariationControls(){
      $('#studio-variant-select').value=activeStyle;
      $('#studio-variant-create').disabled=activeStyle==='Regular';
      $('#studio-variant-delete').disabled=activeStyle==='Regular'||!draft?.variants?.[activeStyle];
      $('#studio-variant-state').textContent=activeStyle==='Regular'?'Editing Regular':draft?.variants?.[activeStyle]?`Editing ${activeStyle} face`:`${activeStyle} uses Regular until created`;
    }
    function markSpecimenStale(){
      specimenDraftDirty=true;
      if(specimenFont)$('#studio-specimen-status').textContent='Font design or spacing changed. Refresh compiled-font proof to reflect current edits.';
    }
    function markMasterReviewStale(){
      markSpecimenStale();
      $('#studio-master-word-status').textContent='Outlines changed. Refresh the interpolated word proof.';
      if(!masterReport)return;
      masterReport=null;reviewedIndex=-1;
      $('#studio-master-summary').textContent='Design changed since the last compatibility review. Recheck before exporting.';
      $('#studio-master-next').disabled=true;
      $('#studio-master-issues').replaceChildren();
    }
    function showMasterPlaceholder(svg,lines){
      const top=480-(lines.length-1)*33;
      for(const [index,message] of lines.entries()){
        const text=document.createElementNS(SVGNS,'text');
        text.setAttribute('x','380');
        text.setAttribute('y',String(top+index*66));
        text.setAttribute('text-anchor','middle');
        text.setAttribute('class','studio-master-placeholder');
        text.textContent=message;
        svg.append(text);
      }
    }
    function renderMasterPreview(){
      if(!draft)return;
      const input=$('#studio-master-weight');
      const min=draft.variants?.Light?300:400;
      input.min=String(min);
      if(Number(input.value)<min)input.value=String(min);
      const weight=Number(input.value);
      input.setAttribute('aria-valuetext',`${weight} font weight units`);
      $('#studio-master-weight-value').value=String(weight);
      $('#studio-master-middle-label').textContent=`Interpolated · ${weight}`;
      $('#studio-master-copy').disabled=activeKind!=='base'||activeStyle==='Regular'||!draft.variants?.[activeStyle]||activeStyle==='Italic';
      const issue=Master.inspectGlyph(draft,currentChar,template);
      const status=$('#studio-master-preview-message');
      const glyphName=Master.nameOf(currentChar);
      const choices={Regular:null,Bold:null,Interpolated:null},errors={};
      try{choices.Regular=Master.outline(draft,currentChar,'Regular',template);}catch(error){errors.Regular=error.message;}
      if(draft.variants?.Bold){
        try{choices.Bold=Master.outline(draft,currentChar,'Bold',template);}catch(error){errors.Bold=error.message;}
        try{choices.Interpolated=Master.interpolate(draft,currentChar,weight,template);}catch(error){errors.Interpolated=error.message;}
      }
      const elements=[['Regular','studio-master-regular'],['Interpolated','studio-master-interpolated'],['Bold','studio-master-bold']];
      for(const [face,id] of elements){
        const svg=$('#'+id);svg.replaceChildren();
        const guide=document.createElementNS(SVGNS,'line');guide.setAttribute('x1','0');guide.setAttribute('x2','760');guide.setAttribute('y1','800');guide.setAttribute('y2','800');guide.setAttribute('class','studio-master-guide');svg.append(guide);
        let placeholder=null;
        if(face!=='Regular'&&!draft.variants?.Bold)placeholder=['Generate a Bold master','under Font Variations'];
        else if(errors[face])placeholder=['Preview unavailable','Check master outlines'];
        else if(!choices[face]?.length)placeholder=['No outline for','this glyph'];
        if(placeholder)showMasterPlaceholder(svg,placeholder);
        else {
          const path=document.createElementNS(SVGNS,'path');path.setAttribute('d',VectorFont.path(choices[face]));
          path.setAttribute('class','studio-master-outline');svg.append(path);
        }
        svg.setAttribute('aria-label',`${face} outline preview for ${glyphName}${face==='Interpolated'?`, weight ${weight}`:''}.${placeholder?' '+placeholder.join(' ')+'.':''}`);
      }
      renderMasterOverlay();
      if(!draft.variants?.Bold)status.textContent='Generate a Bold master under Font Variations to enable interpolation.';
      else if(issue.level!=='ok')status.textContent=`${glyphName}: ${issue.problems.map(p=>p.message).join(' ')}`;
      else if(Object.keys(errors).length)status.textContent=`${glyphName}: ${Object.values(errors).join(' ')}`;
      else status.textContent=`${glyphName}: source outlines are compatible at ${weight} weight units.`;
    }
    function renderMasterOverlay(){
      if(!draft)return;
      const face=$('#studio-overlay-face').value;
      const svg=$('#studio-master-overlay'),status=$('#studio-overlay-summary');
      const glyphName=Master.nameOf(currentChar);
      svg.replaceChildren();
      svg.setAttribute('aria-label',`Overlaid Regular and ${face} master for ${glyphName}`);
      if(!draft.variants?.[face]){
        showMasterPlaceholder(svg,[`Generate a ${face} master`,'under Font Variations']);
        svg.setAttribute('aria-label',`Overlay unavailable for ${glyphName}. Generate a ${face} master under Font Variations.`);
        status.textContent=`Generate a ${face} master under Font Variations to compare outlines and anchors.`;
        return;
      }
      try{
        const result=Master.overlay(draft,currentChar,face,template);
        if(!result.regular.length&&!result.other.length){
          showMasterPlaceholder(svg,['No outline for','this glyph']);
          svg.setAttribute('aria-label',`No outline for ${glyphName} in either the Regular or ${face} master.`);
          status.textContent=`${glyphName}: neither master has an outline for this glyph.`;
          return;
        }
        const guide=document.createElementNS(SVGNS,'line');
        for(const [key,value] of Object.entries({x1:0,y1:800,x2:760,y2:800,class:'studio-master-guide'}))guide.setAttribute(key,String(value));
        svg.append(guide);
        for(const [glyph,cls] of [[result.regular,'studio-overlay-regular'],[result.other,'studio-overlay-other']]){
          if(!glyph.length)continue;
          const path=document.createElementNS(SVGNS,'path');path.setAttribute('d',VectorFont.path(glyph));path.setAttribute('class',cls);svg.append(path);
        }
        const nodes=$('#studio-overlay-nodes').checked,links=$('#studio-overlay-links').checked;
        for(const entry of result.matches){
          if(links){const line=document.createElementNS(SVGNS,'line');
            for(const [key,value] of Object.entries({x1:entry.regular[0],y1:entry.regular[1],x2:entry.other[0],y2:entry.other[1],class:'studio-overlay-link'}))line.setAttribute(key,String(value));
            svg.append(line);
          }
          if(nodes){
            for(const [point,cls] of [[entry.regular,'studio-overlay-anchor-base'],[entry.other,'studio-overlay-anchor-other']]){
              const dot=document.createElementNS(SVGNS,'circle');
              for(const [key,value] of Object.entries({cx:point[0],cy:point[1],r:6,class:cls}))dot.setAttribute(key,String(value));
              svg.append(dot);
            }
          }
        }
        if(nodes)for(const entry of result.matches.slice(0,24)){
          const label=document.createElementNS(SVGNS,'text');
          label.setAttribute('x',String((entry.regular[0]+entry.other[0])/2+9));
          label.setAttribute('y',String((entry.regular[1]+entry.other[1])/2-9));
          label.setAttribute('class','studio-overlay-anchor-label');
          label.textContent=`${entry.contour+1}:${entry.anchor+1}`;
          svg.append(label);
        }
        if(nodes)for(const entry of result.unmatched){
          const dot=document.createElementNS(SVGNS,'circle');
          for(const [key,value] of Object.entries({cx:entry.position[0],cy:entry.position[1],r:9,class:'studio-overlay-orphan'}))dot.setAttribute(key,String(value));
          svg.append(dot);
        }
        const state=result.issue?.level==='error'?'Incompatible topology':result.issue?.level==='warning'?'Check winding direction':'Matching contour and anchor counts';
        status.textContent=`${glyphName} · ${face}: ${state}. ${result.matches.length} paired anchors, ${result.unmatched.length} unpaired within preview.${result.limited?' Anchor display capped at 220 for readability.':''}${result.issue?' '+result.issue.reason:''}`;
      }catch(error){
        showMasterPlaceholder(svg,['Overlay unavailable','Check master outlines']);
        svg.setAttribute('aria-label',`Overlay unavailable for ${glyphName}. Check ${face} master outlines.`);
        status.textContent=`Overlay unavailable: ${error.message}`;
      }
    }
    $('#studio-overlay-face').addEventListener('change',renderMasterOverlay);
    $('#studio-overlay-nodes').addEventListener('change',renderMasterOverlay);
    $('#studio-overlay-links').addEventListener('change',renderMasterOverlay);
    function checkMasterCompatibility(){
      masterReport=Master.inspect(draft,template);reviewedIndex=-1;
      const report=masterReport,host=$('#studio-master-issues');host.replaceChildren();
      $('#studio-master-summary').textContent=`${report.ready?'Masters structurally compatible':'Variable export needs attention'} · ${report.total-report.errors.length}/${report.total} glyphs without blocking topology errors · ${report.errors.length} errors · ${report.warnings.length} advisories`;
      const needsReview=report.glyphs.filter(item=>item.level!=='ok');
      $('#studio-master-next').disabled=!needsReview.length;
      for(const entry of needsReview){
        const li=document.createElement('li');li.dataset.level=entry.level;
        const face=entry.problems[0]?.face||'Bold';
        const button=document.createElement('button');button.type='button';button.className='studio-master-issue-link';
        button.textContent=`Review ${face}: ${entry.label}`;
        button.setAttribute('aria-label',`Review ${face} master glyph ${entry.label}: ${entry.problems.map(p=>p.message).join(' ')}`);
        button.addEventListener('click',()=>goToMasterIssue(entry));li.append(button);
        const detail=document.createElement('span');detail.textContent=' · '+entry.problems.map(p=>p.message).join(' ');li.append(detail);host.append(li);
      }
      if(!needsReview.length){const li=document.createElement('li');li.textContent=report.missingBold?'No Bold master yet. Generate Bold from Regular to begin.':'No contour-count, anchor-count, or direction differences identified.';host.append(li);}
      for(const notice of report.notices){const li=document.createElement('li');li.textContent=notice;host.append(li);}
      return report;
    }
    function goToMasterIssue(entry){
      const face=entry.problems[0]?.face||'Bold';
      const previousStyle=activeStyle;
      if(draft.variants?.[face])activeStyle=face;
      else activeStyle='Regular';
      if(activeStyle!==previousStyle){history.length=0;redoHistory.length=0;}
      focusGlyph('b'+entry.char);
      $('#studio-status').textContent=`Reviewing ${entry.label} in ${activeStyle}: ${entry.problems.map(p=>p.message).join(' ')}`;
      $('#studio-vector-canvas').scrollIntoView({block:'nearest'});
    }
    $('#studio-master-check').addEventListener('click',()=>{
      if(!draft)return;
      try{checkMasterCompatibility();}catch(error){$('#studio-master-summary').textContent='Compatibility review failed: '+error.message;}
    });
    $('#studio-master-next').addEventListener('click',()=>{
      if(!masterReport)return;
      const issues=masterReport.glyphs.filter(item=>item.level!=='ok');if(!issues.length)return;
      reviewedIndex=(reviewedIndex+1)%issues.length;goToMasterIssue(issues[reviewedIndex]);
    });
    $('#studio-master-weight').addEventListener('input',renderMasterPreview);
    $('#studio-master-copy').addEventListener('click',()=>{
      if(!draft||activeKind!=='base'||!['Light','Bold'].includes(activeStyle)||!draft.variants?.[activeStyle])return;
      if(!window.confirm(`Replace the ${activeStyle} outline for ${Master.nameOf(currentChar)} with the Regular outline? This is undoable and linked components stay linked.`))return;
      const source=VectorFont.copy(glyphFor(currentChar,'Regular'));
      const applied=edit(glyph=>glyph.splice(0,glyph.length,...source));
      if(applied)$('#studio-status').textContent=`Copied Regular contour structure into ${activeStyle} ${Master.nameOf(currentChar)}. Move anchors to develop the weight, then recheck compatibility.`;
    });
    const key=()=>activeKind==='ligature'?`l${activeSequence}`:activeKind==='alternate'?`a${currentChar}${activeAlt}`:`b${currentChar}`;
    function glyphAt(target){
      if(target.startsWith('l'))return draft.ligatures[target.slice(1)]?.glyph;
      if(target.startsWith('a'))return draft.alternates[target[1]]?.[Number(target.slice(2))];
      const char=target.slice(1);return glyphFor(char);
    }
    function storeGlyph(target,glyph){
      if(target.startsWith('l'))draft.ligatures[target.slice(1)].glyph=glyph;
      else if(target.startsWith('a'))draft.alternates[target[1]][Number(target.slice(2))]=glyph;
      else if(activeStyle==='Regular')draft.glyphs[target.slice(1)]=glyph;
      else{draft.variants[activeStyle]??={glyphs:{}};draft.variants[activeStyle].glyphs[target.slice(1)]=glyph;}
    }
    function current(){return draft?glyphAt(key()):[];}
    function targetName(){return activeKind==='ligature'?`Ligature ${activeSequence}`:activeKind==='alternate'?`Alternate ${activeAlt+1} for ${currentChar}`:`${activeStyle} glyph ${currentChar}`;}
    function focusGlyph(target){
      if(target.startsWith('l')){activeKind='ligature';activeSequence=target.slice(1);currentChar=activeSequence[0];}
      else if(target.startsWith('a')){activeKind='alternate';currentChar=target[1];activeAlt=Number(target.slice(2));}
      else{activeKind='base';currentChar=target.slice(1);}
      charPicker.value=currentChar;selection=null;drawPoints=[];drawMode=false;
      refreshMetrics();renderEditor();
    }
    function edit(change){
      if(!draft)return false;
      const target=key(),previous=VectorFont.copy(current()),next=VectorFont.copy(previous);
      try{change(next);if(!VectorFont.valid(next))throw new Error('This letter has reached its contour or anchor limit.');}
      catch(error){$('#studio-status').textContent=error.message||'Could not change this outline.';return false;}
      history.push({key:target,glyph:previous});if(history.length>40)history.shift();redoHistory.length=0;
      storeGlyph(target,next);markMasterReviewStale();lastTTF=null;renderEditor();return true;
    }
    function renderGlyphWorkbench(){
      if(!draft||!$('#studio-workbench-panel').open)return;
      const chars=Workbench.search(draft,$('#studio-glyph-query').value,$('#studio-glyph-group').value,$('#studio-glyph-filter').value,activeStyle);
      glyphPage=Math.max(0,Math.min(glyphPage,Math.ceil(chars.length/64)-1));visibleGlyphs=chars.slice(glyphPage*64,glyphPage*64+64);
      const grid=$('#studio-glyph-grid');grid.replaceChildren();
      for(const ch of visibleGlyphs){const btn=document.createElement('button');btn.type='button';btn.textContent=/^\p{M}$/u.test(ch)?'◌'+ch:ch===' '?'␣':ch;btn.title=Master.nameOf(ch);btn.setAttribute('aria-label',btn.title);btn.dataset.authored=String(Workbench.authored(draft,ch,activeStyle));btn.setAttribute('aria-current',String(ch===currentChar));btn.addEventListener('click',()=>focusGlyph('b'+ch));grid.append(btn);}
      $('#studio-glyph-count').textContent=`${chars.length} matches · ${chars.length?glyphPage*64+1:0}–${Math.min(chars.length,(glyphPage+1)*64)} · underline indicates authored`;
      $('#studio-glyph-prev').disabled=glyphPage===0;$('#studio-glyph-next').disabled=(glyphPage+1)*64>=chars.length;
    }
    // Batch History
    function changeEntries(before,after){
      const patches=[];
      for(const field of ['glyphs','advances','leftBearings','kerning','components','componentLinks','variants']){
        const a=before[field]||{},b=after[field]||{};
        for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
          if(field==='variants'){
            const aa=a[k]?.glyphs||{},bb=b[k]?.glyphs||{};
            for(const ch of new Set([...Object.keys(aa),...Object.keys(bb)]))if(JSON.stringify(aa[ch])!==JSON.stringify(bb[ch]))patches.push({field,face:k,k:ch,before:aa[ch],after:bb[ch]});
          }else if(JSON.stringify(a[k])!==JSON.stringify(b[k]))patches.push({field,k,before:a[k],after:b[k]});
        }
      }
      return patches;
    }
    function applyPatches(patches,side){
      for(const p of patches){const dest=p.field==='variants'?draft.variants[p.face].glyphs:(draft[p.field]??={});if(p[side]===undefined)delete dest[p.k];else dest[p.k]=clone(p[side]);}
      lastTTF=null;markMasterReviewStale();refreshMetrics();refreshKerningList();renderEditor();
    }
    function commitWorkbench(next,message){
      validatePlacements(next);
      const patches=changeEntries(draft,next);if(!patches.length)return;
      if(JSON.stringify(patches).length>4*1024*1024)throw new Error('Batch exceeds the undo budget; use fewer characters.');
      history.push({patches:clone(patches)});while(history.length>40||history.reduce((n,h)=>n+(h.patches?JSON.stringify(h.patches).length:0),0)>8*1024*1024)history.shift();redoHistory.length=0;
      applyPatches(patches,'after');$('#studio-status').textContent=message;
    }
    function workbenchLookup(ch,face,fallback){
      if(Workbench.authored(draft,ch,face)||PixelFont.CHARS.includes(ch))return VectorFont.copy(glyphFor(ch,face));
      if(fallback)return VectorFont.copy(template(fallback));
      if(/^\p{M}$/u.test(ch))throw new Error('Draw combining mark '+Master.nameOf(ch)+' first.');
      return VectorFont.copy(template(ch));
    }
    $('#studio-workbench-panel').addEventListener('toggle',renderGlyphWorkbench);
    for(const id of ['studio-glyph-group','studio-glyph-query','studio-glyph-filter'])$('#'+id).addEventListener(id==='studio-glyph-query'?'input':'change',()=>{glyphPage=0;renderGlyphWorkbench();});
    $('#studio-glyph-prev').addEventListener('click',()=>{glyphPage--;renderGlyphWorkbench();});$('#studio-glyph-next').addEventListener('click',()=>{glyphPage++;renderGlyphWorkbench();});
    $('#studio-batch-add').addEventListener('click',()=>{try{$('#studio-batch-chars').value=Workbench.selection($('#studio-batch-chars').value+currentChar).join('');}catch(error){$('#studio-status').textContent=error.message;}});
    $('#studio-batch-page').addEventListener('click',()=>{$('#studio-batch-chars').value=visibleGlyphs.join('');});
    $('#studio-batch-operation').addEventListener('change',()=>{$('#studio-batch-value').value=({compose:24,advance:780,bearing:40,kern:-40})[$('#studio-batch-operation').value]??0;});
    $('#studio-batch-run').addEventListener('click',()=>{try{
      const chars=Workbench.selection($('#studio-batch-chars').value),op=$('#studio-batch-operation').value,value=Number($('#studio-batch-value').value);
      if(op==='copy'&&activeStyle==='Regular')throw new Error('Select a non-Regular master first.');
      if(['compose','center','copy'].includes(op)&&!window.confirm(`Replace the selected ${chars.length} outline(s) in ${activeStyle}?`))return;
      const next=Workbench.batch(draft,chars,op,{value,gap:value,right:$('#studio-batch-right').value},workbenchLookup,activeStyle);
      commitWorkbench(next,`Applied ${op} to ${chars.length} characters. Undo glyph reverses the batch.`);
    }catch(error){$('#studio-status').textContent=error.message;}});
    function convertPixelDesign(d){
      const converted={id:d.id,name:d.name,kind:'vector',glyphs:{},spacing:0,advances:{},kerning:{}};
      for(const [char,rows] of Object.entries(d.glyphs)){
        if(!PixelFont.isGlyph(rows))continue;
        const w=160,h=210,bits=new Uint8Array(w*h);
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const py=Math.floor(y*12/h),px=Math.floor(x*8/w);
          bits[y*w+x]=rows[py][px]==='1'?1:0;
        }
        converted.glyphs[char]=VectorFont.traceBitmap(bits,w,h);
      }
      return converted;
    }
    async function refreshLibraryPicker(preferred=''){
      const picker=$('#studio-library-picker');
      if(!window.skoshPressAPI?.listStudioFonts)return;
      try{
        const previous=preferred||picker.value;
        picker.replaceChildren(new Option('Select a saved library font…',''));
        for(const font of await window.skoshPressAPI.listStudioFonts())picker.add(new Option(font.name,font.id));
        picker.value=[...picker.options].some(o=>o.value===previous)?previous:'';
      }catch(error){$('#studio-status').textContent='Font library: '+error.message;}
    }
    function refreshComponents(){
      if(!draft)return;
      const picker=$('#studio-component-select'),previous=picker.value;
      picker.replaceChildren(new Option('Select a component…',''));
      for(const [id,component] of Object.entries(draft.components||{}))picker.add(new Option(component.name,id));
      picker.value=Object.hasOwn(draft.components||{},previous)?previous:'';
      const links=$('#studio-component-links'),oldLink=links.value;
      links.replaceChildren(new Option('Select a linked placement…',''));
      if(activeKind==='base')for(const [i,link] of (draft.componentLinks?.[currentChar]||[]).entries()){
        links.add(new Option(`${draft.components[link.id]?.name||'Missing'} · (${link.dx}, ${link.dy}) · ${link.scale}%`,String(i)));
      }
      links.value=oldLink!==''&&Number(oldLink)<(draft.componentLinks?.[currentChar]?.length||0)?oldLink:'';
      $('#studio-component-unlink').disabled=links.value==='';
      $('#studio-component-place').disabled=activeKind!=='base'||!picker.value;
      $('#studio-component-create').disabled=!selection||!current()?.[selection.ci];
      $('#studio-component-update').disabled=!selection||!picker.value;
      $('#studio-component-delete').disabled=!picker.value;
    }
    function refreshDesignPicker(){
      designPicker.replaceChildren(new Option('New unsaved design',''));
      for(const d of state.doc.fontDesigns||[])designPicker.add(new Option(d.name,d.id));
      designPicker.value=(state.doc.fontDesigns||[]).some(d=>d.id===draft?.id)?draft.id:'';
    }
    function loadDesign(id,libraryDesign=null){
      const stored=libraryDesign||(state.doc.fontDesigns||[]).find(d=>d.id===id);
      draft=stored?(stored.kind==='vector'?clone(stored):convertPixelDesign(stored)):
        {id:'font-'+uid().toLowerCase(),name:'My Skosh Vector',kind:'vector',glyphs:{},spacing:0,advances:{},kerning:{}};
      draft.spacing??=0;draft.advances??={};draft.kerning??={};draft.leftBearings??={};draft.kerningClasses??={left:{},right:{}};draft.classKerning??={};draft.ligatures??={};draft.alternates??={};draft.variants??={};draft.components??={};draft.componentLinks??={};
      $('#studio-word').value=Word.cleanWord(draft.previewWord??'AVATAR')||'AVATAR';
      draft.previewWord=$('#studio-word').value;
      currentChar='A';activeStyle='Regular';activeKind='base';activeSequence='';activeAlt=0;wordSelectionIndex=Word.cleanWord($('#studio-word').value).indexOf('A');if(wordSelectionIndex<0)wordSelectionIndex=null;charPicker.value=currentChar;selection=null;drawMode=false;drawPoints=[];history.length=0;redoHistory.length=0;lastTTF=null;
      $('#studio-name').value=draft.name;
      $('#studio-status').textContent=stored?.kind!=='vector'&&stored?'Legacy pixel design converted to editable vector outlines. Save to keep the conversion.':'Drag points and handles, or choose Draw path to create a new outline.';
      masterReport=null;reviewedIndex=-1;$('#studio-master-issues').replaceChildren();
      $('#studio-master-summary').textContent='Create a Bold master, then check compatibility.';
      $('#studio-master-word-status').textContent='';const proof=$('#studio-master-word-canvas');proof.getContext('2d').clearRect(0,0,proof.width,proof.height);
      $('#studio-batch-chars').value='';glyphPage=0;
      refreshDesignPicker();refreshMetrics();refreshKerningList();refreshFeatureLists();refreshVariationControls();renderEditor();
      integrityReport=null;$('#studio-integrity-summary').textContent='';$('#studio-integrity-counts').textContent='';$('#studio-integrity-results').replaceChildren();
      specimenDraftDirty=true;specimenSerial++;if(specimenFont){document.fonts.delete(specimenFont);specimenFont=null;}specimenFace=null;
      $('#studio-specimen-preset').value='lorem';$('#studio-specimen-text').value=Specimen.PRESETS.lorem;$('#studio-specimen-status').textContent='Select a sample and refresh to proof its compiled font.';$('#studio-specimen-coverage').textContent='';
    }
    function refreshMetrics(){
      if(!draft)return;
      $('#studio-spacing').value=String(draft.spacing??0);
      $('#studio-advance').value=String(draft.advances?.[currentChar]??780);
      $('#studio-advance').disabled=activeKind!=='base';$('#studio-reset-advance').disabled=activeKind!=='base';
      $('#studio-liga-advance').disabled=activeKind!=='ligature';
      if(activeKind==='ligature')$('#studio-liga-advance').value=String(draft.ligatures[activeSequence]?.advance??780);
      refreshKerningValue();refreshAdvancedSpacing();
    }
    function refreshAdvancedSpacing(){
      const base=Components.resolve(glyphFor(currentChar),draft.components||{},draft.componentLinks?.[currentChar]||[],false);
      const ink=Spacing.resolveSpacing(base,draft,currentChar);
      $('#studio-bearing-left').value=String(Math.round(ink.left));
      $('#studio-bearing-right').value=String(Math.round(ink.right));
      const disabled=activeKind!=='base';
      for(const id of ['studio-bearing-left','studio-bearing-right','studio-bearing-left-set','studio-bearing-right-set','studio-bearing-reset'])$('#'+id).disabled=disabled;
      const list=$('#studio-class-list'),previous=list.value;list.replaceChildren(new Option('Select class pair…',''));
      for(const [pair,val] of Object.entries(draft.classKerning||{}).sort(([a],[b])=>a.localeCompare(b)))list.add(new Option(`${pair} · ${val>0?'+':''}${val}`,pair));
      list.value=Object.hasOwn(draft.classKerning||{},previous)?previous:'';
      $('#studio-class-remove').disabled=!list.value;
    }
    function refreshKerningValue(){
      const pair=$('#studio-kern-pair').value;
      $('#studio-kern-value').value=String(draft?.kerning?.[pair]??0);
    }
    function refreshKerningList(){
      const picker=$('#studio-kern-list');
      const previous=picker.value;
      picker.replaceChildren(new Option('Select a pair…',''));
      for(const [pair,value] of Object.entries(draft?.kerning||{}).sort(([a],[b])=>a.localeCompare(b))){
        const label=pair.replace(/ /g,'␣');picker.add(new Option(`${label}  ${value>0?'+':''}${value}`,pair));
      }
      picker.value=Object.hasOwn(draft?.kerning||{},previous)?previous:'';
    }
    function refreshFeatureLists(){
      if(!draft)return;
      const liga=$('#studio-liga-list'),oldLiga=liga.value;
      liga.replaceChildren(new Option('Choose a ligature…',''));
      for(const seq of Object.keys(draft.ligatures).sort())liga.add(new Option(seq,seq));
      liga.value=activeKind==='ligature'?activeSequence:(Object.hasOwn(draft.ligatures,oldLiga)?oldLiga:'');
      $('#studio-liga-edit').disabled=$('#studio-liga-remove').disabled=!liga.value||activeStyle!=='Regular';
      if(activeKind==='ligature')$('#studio-liga-sequence').value=activeSequence;
      const alt=$('#studio-alt-list'),oldAlt=alt.value;
      alt.replaceChildren(new Option('Choose an alternate…',''));
      for(const [ch,versions] of Object.entries(draft.alternates).sort(([a],[b])=>a.localeCompare(b))){
        versions.forEach((_,i)=>alt.add(new Option(`${ch} · variation ${i+1}`,`a${ch}${i}`)));
      }
      alt.value=activeKind==='alternate'?key():oldAlt;
      if(![...alt.options].some(o=>o.value===alt.value))alt.value='';
      $('#studio-alt-edit').disabled=$('#studio-alt-remove').disabled=!alt.value||activeStyle!=='Regular';
      for(const id of ['studio-liga-create','studio-alt-create','studio-liga-advance'])$('#'+id).disabled=activeStyle!=='Regular';
      $('#studio-feature-target').textContent='Editing '+targetName();
      $('#studio-feature-base').disabled=activeKind==='base';
    }
    function sampleLigature(seq){
      const nodes=[],parts=[...seq];
      for(let i=0;i<parts.length;i++){
        const part=draft.glyphs[parts[i]]??template(parts[i]);
        for(const contour of part){
          if(nodes.length>=VectorFont.MAX_CONTOURS)break;
          nodes.push(contour.map(p=>p.map((v,j)=>j%2===0?Math.round((v/parts.length+i*690/parts.length+8)*10)/10:v)));
        }
      }
      return VectorFont.valid(nodes)?nodes:VectorFont.copy(draft.glyphs[seq[0]]??template(seq[0]));
    }
    function drawFeatureProof(){
      if(!draft)return;
      const canvas=$('#studio-feature-proof'),ctx=canvas.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fcfbf7';ctx.fillRect(0,0,canvas.width,canvas.height);
      const content=$('#studio-feature-proof-text').value.slice(0,40),useLiga=$('#studio-feature-preview-liga').checked;
      const alternate=Number($('#studio-feature-preview-alt').value),runs=[];
      for(let i=0;i<content.length;){
        let seq='';
        if(useLiga)for(const count of [3,2]){const part=content.slice(i,i+count);if(part.length===count&&draft.ligatures[part]){seq=part;break;}}
        if(seq){const entry=draft.ligatures[seq];runs.push({glyph:entry.glyph,width:entry.advance,source:seq,kind:'ligature'});i+=seq.length;continue;}
        const ch=content[i++];
        if(!PixelFont.isSupportedChar(ch))continue;
        const alt=alternate>0?draft.alternates[ch]?.[alternate-1]:null;
        runs.push({glyph:alt??composed(ch),width:VectorFont.advanceFor(draft,ch),source:ch,kind:alt?'alternate':'base'});
      }
      const total=runs.reduce((sum,r)=>sum+r.width,0)||750,scale=Math.min(.13,718/total);
      let x=10;for(const run of runs){
        if(run.glyph?.length){ctx.save();ctx.translate(x,5);ctx.scale(scale,scale);ctx.fillStyle=run.kind==='ligature'?'#8c4b25':run.kind==='alternate'?'#186466':'#163f59';ctx.fill(new Path2D(VectorFont.path(run.glyph)),'nonzero');ctx.restore();}
        x+=run.width*scale;
      }
      ctx.font='11px system-ui,sans-serif';ctx.fillStyle='#6c7382';
      ctx.fillText(`Ligatures ${useLiga?'on':'off'} · stylistic set ${alternate||'off'} · ${Object.keys(draft.ligatures).length} ligatures / ${Object.values(draft.alternates).reduce((n,a)=>n+a.length,0)} alternates`,10,158);
    }
    function refreshOutlineSelectors(glyph){
      const first=$('#studio-boolean-a'),second=$('#studio-boolean-b'),oldA=first.value,oldB=second.value;
      const options=(select,previous,fallback)=>{
        select.replaceChildren();
        glyph.forEach((contour,index)=>select.add(new Option(`Contour ${index+1} · ${contour.length} anchors`,String(index))));
        select.value=Number.isInteger(Number(previous))&&Number(previous)<glyph.length&&previous!==''?previous:String(fallback);
        if(!glyph.length)select.value='';
      };
      options(first,oldA,0);options(second,oldB,glyph.length>1?1:0);
      if(first.value===second.value&&glyph.length>1)second.value=first.value==='0'?'1':'0';
      for(const id of ['studio-boolean-union','studio-boolean-subtract','studio-boolean-intersect'])$('#'+id).disabled=glyph.length<2;
    }
    function renderEditor(){
      board.replaceChildren();const glyph=current();
      refreshOutlineSelectors(glyph);refreshFeatureLists();refreshVariationControls();refreshComponents();renderGlyphWorkbench();
      node('rect',{x:0,y:0,width:760,height:960,fill:'#faf9f5'});
      if($('#studio-grid-visible').checked){
        const step=Number($('#studio-grid-step').value)||20;
        for(let x=step;x<760;x+=step)node('line',{x1:x,y1:0,x2:x,y2:960,class:'vector-grid-line'});
        for(let y=step;y<960;y+=step)node('line',{x1:0,y1:y,x2:760,y2:y,class:'vector-grid-line'});
      }
      const advance=activeKind==='ligature'?(draft.ligatures[activeSequence]?.advance??780):VectorFont.advanceFor(draft||{},currentChar);
      if(advance<=760)node('line',{x1:advance,y1:0,x2:advance,y2:960,class:'vector-advance-guide'});
      for(const [y,label] of [[120,'CAP'],[430,'X-HEIGHT'],[800,'BASELINE']]){
        node('line',{x1:0,y1:y,x2:760,y2:y,class:'vector-guide'});
        const text=node('text',{x:10,y:y-10,class:'vector-guide-label'});text.textContent=label;
      }
      if($('#studio-reference').checked){
        const guide=node('text',{x:380,y:800,'text-anchor':'middle',class:'vector-trace-label'});guide.textContent=activeKind==='ligature'?activeSequence:currentChar;
      }
      const shape=VectorFont.path(glyph);
      if(shape)node('path',{d:shape,class:'vector-outline'});
      if(activeKind==='base'&&draft.componentLinks?.[currentChar]?.length){
        const attached=Components.resolve([],draft.components,draft.componentLinks[currentChar],false);
        const linkedPath=VectorFont.path(attached);
        if(linkedPath)node('path',{d:linkedPath,class:'vector-outline',fill:'#5575a8',opacity:.62,'pointer-events':'none'});
      }
      glyph.forEach((contour,ci)=>{
        node('path',{d:VectorFont.path([contour]),stroke:'transparent','stroke-width':22,fill:'none',
          'data-role':'contour','data-contour':ci});
        contour.forEach((pt,ni)=>{
          node('circle',{cx:pt[0],cy:pt[1],r:9,class:'vector-anchor'+(selection?.ci===ci&&selection?.ni===ni?' selected':''),
            'data-role':'anchor','data-contour':ci,'data-point':ni,'role':'button',
            'aria-label':`Anchor ${ni+1} of contour ${ci+1}, ${targetName()}; select then use arrow keys to reposition`,
            'tabindex':selection?.ci===ci&&selection?.ni===ni?'0':'-1'});
        });
      });
      if(selection&&glyph[selection.ci]?.[selection.ni]){
        const p=glyph[selection.ci][selection.ni];
        for(const [role,x,y] of [['in',p[2],p[3]],['out',p[4],p[5]]]){
          if(Math.hypot(x-p[0],y-p[1])<2)continue;
          node('line',{x1:p[0],y1:p[1],x2:x,y2:y,class:'vector-handle-line'});
          node('rect',{x:x-9,y:y-9,width:18,height:18,rx:2,class:'vector-handle',
            'data-role':role,'data-contour':selection.ci,'data-point':selection.ni,
            'role':'button','tabindex':'-1','aria-label':`${role==='in'?'Incoming':'Outgoing'} Bézier handle for anchor ${selection.ni+1}`});
        }
      }
      if(drawPoints.length){
        node('polyline',{points:drawPoints.map(p=>p.join(',')).join(' '),class:'vector-draw-line'});
        for(const p of drawPoints)node('circle',{cx:p[0],cy:p[1],r:8,fill:'#ce9220'});
      }
      $('#studio-draw').setAttribute('aria-pressed',String(drawMode));
      $('#studio-finish').disabled=drawPoints.length<3;
      $('#studio-insert').disabled=!selection;
      $('#studio-delete').disabled=!selection;
      $('#studio-smooth').disabled=!selection;
      $('#studio-corner').disabled=!selection;
      $('#studio-reverse').disabled=!selection;
      $('#studio-flip-x').disabled=!selection;
      $('#studio-flip-y').disabled=!selection;
      for(const id of ['studio-duplicate-contour','studio-align-cap','studio-align-base'])$('#'+id).disabled=!selection;
      $('#studio-undo').disabled=!history.length;
      $('#studio-redo').disabled=!redoHistory.length;
      const point=selection&&glyph[selection.ci]?.[selection.ni];
      board.setAttribute('aria-label',`Editable ${targetName()}: use Enter to select an anchor, arrows to nudge, Shift plus arrows for larger steps`);
      $('#studio-anchor-description').textContent=point?`Selected anchor ${selection.ni+1} in contour ${selection.ci+1} of ${targetName()}, X ${Math.round(point[0])}, Y ${Math.round(point[1])}. Use the arrow keys to nudge it.`:`No anchor selected in ${targetName()}. Select an anchor with the pointer, then use arrow keys to adjust its position.`;
      drawPreview();renderMasterPreview();
    }
    function renderWord(){
      if(!draft)return;
      const proof=Word.layout($('#studio-word').value,draft);
      wordBoard.replaceChildren();wordBoard.setAttribute('viewBox',`0 0 ${proof.total} 960`);
      wordBoard.style.width=`${Math.max(700,Math.round(proof.total*.215))}px`;
      node('rect',{x:0,y:0,width:proof.total,height:960,fill:'#fcfbf7'},wordBoard);
      for(const y of [120,430,800])node('line',{x1:0,y1:y,x2:proof.total,y2:y,class:'word-guide'},wordBoard);
      for(const item of proof.positions){
        const selected=wordSelectionIndex===item.index;
        if(selected)node('rect',{x:item.x-14,y:86,width:item.advance+28,height:735,class:'word-selected-region'},wordBoard);
        const outline=VectorFont.path(composed(item.char));
        if(outline)node('path',{d:outline,transform:`translate(${item.x},0)`,class:'word-glyph'+(selected?' active':''),
          'data-word-index':item.index,'aria-label':`Edit letter ${item.char} at position ${item.index+1}`},wordBoard);
        const hit=node('rect',{x:item.x,y:90,width:Math.max(150,item.advance-25),height:710,fill:'transparent',
          'data-word-index':item.index,class:'word-letter-hit'},wordBoard);
        hit.setAttribute('aria-label',`Select ${item.char}`);
        const label=node('text',{x:item.x+22,y:917,class:'word-char-label'},wordBoard);label.textContent=item.char===' '?'SPACE':item.char;
        if(item.pair){
          node('line',{x1:item.x,y1:105,x2:item.x,y2:830,class:'word-kerning-line'},wordBoard);
          const grip=node('circle',{cx:item.x,cy:875,r:30,class:'word-kern-grip',
            'data-word-pair':item.index,'aria-label':`Drag to adjust ${item.pair} kerning: ${item.adjust} units`},wordBoard);
          const tooltip=node('title',{},grip);tooltip.textContent=`${item.pair} kerning ${item.adjust} units — drag left or right`;
          const amount=node('text',{x:item.x+33,y:888,class:'word-kern-value'},wordBoard);amount.textContent=item.adjust?String(item.adjust):'0';
        }
      }
      $('#studio-word-selection').textContent=proof.word?`Editing ${currentChar}  ·  ${proof.word.length} letters  ·  ${Object.keys(draft.kerning||{}).length} saved pairs`:'Type up to 12 letters to begin.';
    }
    function selectWordLetter(index){
      const proof=Word.layout($('#studio-word').value,draft),item=proof.positions[index];
      if(!item)return;
      wordSelectionIndex=index;focusGlyph('b'+item.char);
      $('#studio-status').textContent=`Editing ${item.char} from the word workspace. Changes to its Bézier curves also appear in the word.`;
    }
    function wordPoint(event){
      const matrix=wordBoard.getScreenCTM();
      return matrix?new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()).x:0;
    }
    wordBoard.addEventListener('pointerdown',event=>{
      if(event.button!==0||!draft)return;
      const pairIndex=event.target.closest('[data-word-pair]')?.dataset.wordPair;
      if(pairIndex!==undefined){
        const item=Word.layout($('#studio-word').value,draft).positions[Number(pairIndex)];
        if(!item?.pair)return;
        wordDrag={pair:item.pair,origin:item.adjust,start:wordPoint(event),matrix:wordBoard.getScreenCTM(),pointerId:event.pointerId};
        wordBoard.setPointerCapture(event.pointerId);event.preventDefault();return;
      }
      const glyphIndex=event.target.closest('[data-word-index]')?.dataset.wordIndex;
      if(glyphIndex!==undefined){selectWordLetter(Number(glyphIndex));event.preventDefault();}
    });
    wordBoard.addEventListener('pointermove',event=>{
      if(!wordDrag||event.pointerId!==wordDrag.pointerId)return;
      const pointerX=wordDrag.matrix?new DOMPoint(event.clientX,event.clientY).matrixTransform(wordDrag.matrix.inverse()).x:wordPoint(event);
      const amount=Word.kernFromDrag(wordDrag.origin,wordDrag.start,pointerX);
      try{draft.kerning=Word.setPair(draft,wordDrag.pair,amount);}
      catch(error){$('#studio-status').textContent=error.message;return;}
      $('#studio-kern-pair').value=wordDrag.pair;$('#studio-kern-value').value=String(amount);
      lastTTF=null;markSpecimenStale();refreshKerningList();renderWord();drawPreviewCanvas();event.preventDefault();
    });
    function endWordDrag(event){
      if(!wordDrag||event.pointerId!==wordDrag.pointerId)return;
      const pair=wordDrag.pair,value=draft.kerning[pair]??0;
      wordDrag=null;refreshKerningList();renderWord();
      $('#studio-status').textContent=`${pair}: ${value} units of kerning. Save font to include this spacing in the exported TTF.`;
    }
    wordBoard.addEventListener('pointerup',endWordDrag);
    wordBoard.addEventListener('pointercancel',endWordDrag);
    wordBoard.addEventListener('keydown',event=>{
      if(['ArrowUp','ArrowDown'].includes(event.key)&&!event.altKey){
        const positions=Word.layout($('#studio-word').value,draft).positions;
        const item=positions[wordSelectionIndex??0];if(!item?.pair)return;
        event.preventDefault();
        const amount=Math.max(-400,Math.min(400,item.adjust+(event.key==='ArrowUp'?5:-5)));
        try{draft.kerning=Word.setPair(draft,item.pair,amount);markMasterReviewStale();lastTTF=null;
          $('#studio-kern-pair').value=item.pair;$('#studio-kern-value').value=String(amount);refreshKerningList();renderWord();drawPreviewCanvas();
          $('#studio-status').textContent=`${item.pair}: ${amount} kerning units.`;
        }catch(error){$('#studio-status').textContent=error.message;}return;
      }
      if(['ArrowLeft','ArrowRight'].includes(event.key)&&!event.altKey){
        const word=Word.cleanWord($('#studio-word').value);
        if(!word)return;
        event.preventDefault();selectWordLetter(Math.max(0,Math.min(word.length-1,(wordSelectionIndex??0)+(event.key==='ArrowLeft'?-1:1))));
      }
    });
    $('#studio-word').addEventListener('input',()=>{
      const input=$('#studio-word');const clean=Word.cleanWord(input.value);
      if(input.value!==clean)input.value=clean;
      if(draft)draft.previewWord=clean;
      wordSelectionIndex=clean.indexOf(currentChar);if(wordSelectionIndex<0)wordSelectionIndex=null;
      renderWord();
    });
    function drawPreview(){
      renderWord();drawPreviewCanvas();drawFeatureProof();
    }
    function drawPreviewCanvas(){
      const canvas=$('#studio-glyph-preview'),ctx=canvas.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      const paint=(ch,x,y,scale)=>{
        const glyph=composed(ch);
        if(!glyph?.length)return;
        ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
        ctx.fillStyle='#163f59';ctx.fill(new Path2D(VectorFont.path(glyph)),'nonzero');ctx.restore();
      };
      if(activeKind==='base')paint(currentChar,13,11,.132);
      else {const glyph=current();if(glyph?.length){ctx.save();ctx.translate(13,11);ctx.scale(.132,.132);ctx.fillStyle='#163f59';ctx.fill(new Path2D(VectorFont.path(glyph)),'nonzero');ctx.restore();}}
      ctx.strokeStyle='#d6dfe8';ctx.strokeRect(12,10,102,129);
      ctx.font='13px sans-serif';ctx.fillStyle='#333';ctx.fillText(`U+${currentChar.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')}`,135,30);
      ctx.fillText('Smooth Bézier outline',135,51);
      ctx.font='11px sans-serif';ctx.fillText('Editable anchors + handles',135,71);
      ctx.fillText(`Advance: ${activeKind==='ligature'?draft.ligatures[activeSequence].advance:VectorFont.advanceFor(draft||{},currentChar)} units`,135,92);
      let y=172;for(const line of ($('#studio-sample').value||'').split('\n').slice(0,2)){
        let x=6,previous='';for(const ch of line.slice(0,40)){
          if(!PixelFont.isSupportedChar(ch))continue;
          x+=VectorFont.kernFor(draft||{},previous+ch)*.023;
          if(x>canvas.width-8)break;
          paint(ch,x,y,.023);
          x+=VectorFont.advanceFor(draft||{},ch)*.023;
          previous=ch;
        }y+=36;
      }
    }
    function generateFont(face='Regular',variableCompatible=false,persistTemplates=true){
      if(!draft)throw new Error('No font selected.');
      if(!['Regular','Light','Bold','Italic'].includes(face)||face!=='Regular'&&!draft.variants?.[face])throw new Error('Create the selected font face before exporting it.');
      draft.name=$('#studio-name').value.trim().slice(0,64)||'My Skosh Vector';
      const glyphs={};
      // Variation Coverage
      const all=[...PixelFont.CHARS,...PixelFont.EXTENDED_CHARS.filter(ch=>Object.hasOwn(draft.glyphs,ch)||draft.componentLinks?.[ch]?.length||
        (variableCompatible?['Light','Bold'].some(master=>Object.hasOwn(draft.variants?.[master]?.glyphs||{},ch)):Object.hasOwn(draft.variants?.[face]?.glyphs||{},ch)))];
      for(const ch of all){
        glyphs[ch]=Components.resolve((face==='Regular'?draft.glyphs:draft.variants[face].glyphs)[ch]??draft.glyphs[ch]??(draft.componentLinks?.[ch]?.length?[]:template(ch)),draft.components,draft.componentLinks[ch]||[]);
        if(!VectorFont.valid(glyphs[ch]))throw new Error('Glyph '+ch+' has invalid outlines.');
      }
      const binary=VectorFont.buildTTF(glyphs,draft.name,{...draft,style:face},{variableCompatible});
      GeneratedCheck.check(binary,all);
      if(face==='Regular'){
        lastTTF=binary;
        // Component Preservation
        if(persistTemplates)for(const ch of PixelFont.CHARS)if(!Object.hasOwn(draft.glyphs,ch)&&!draft.componentLinks?.[ch]?.length)draft.glyphs[ch]=clone(template(ch));
      }
      return binary;
    }
    function base64(bytes){
      let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      return btoa(binary);
    }
    function saveDesign(){
      try{
        if(!draft)throw new Error('Create a design first.');
        if(!(state.doc.fontDesigns||[]).some(d=>d.id===draft.id)&&(state.doc.fontDesigns||[]).length>=6)throw new Error('This document has reached its limit of six editable font designs.');
        const faces=['Regular',...['Light','Bold','Italic'].filter(style=>draft.variants?.[style])];
        const ids=faces.map(style=>FontVariations.fontId(draft.id,style));
        const other=(state.doc.fonts||[]).filter(font=>font.id!==draft.id&&!['Light','Bold','Italic'].some(style=>font.id===`${draft.id}-${style.toLowerCase()}`));
        if(other.length+ids.length>30)throw new Error('The font library would exceed 30 fonts.');
        const entries=faces.map((style,index)=>{
          const bytes=generateFont(style);
          return {id:ids[index],name:`${draft.name} ${style}`,data:'data:font/ttf;base64,'+base64(bytes)};
        });
        if(other.reduce((n,f)=>n+f.data.length*3/4,0)+entries.reduce((n,f)=>n+f.data.length*3/4,0)>16*1024*1024)throw new Error('The font library would exceed 16 MB.');
        mutate(()=>{
          state.doc.fontDesigns ||= [];state.doc.fonts ||= [];
          const index=state.doc.fontDesigns.findIndex(f=>f.id===draft.id);
          if(index>=0)state.doc.fontDesigns[index]=clone(draft);else state.doc.fontDesigns.push(clone(draft));
          state.doc.fonts=[...other,...entries];
        });
        refreshDesignPicker();
        $('#studio-status').textContent=`Saved ${faces.join(', ')} as embedded TrueType faces for “${draft.name}”.`;
        return true;
      }catch(error){$('#studio-status').textContent=error.message;return false;}
    }
    function pointerPosition(event){
      const matrix=board.getScreenCTM();
      if(!matrix)return [0,0];
      const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
      return [Math.round(Math.max(0,Math.min(760,p.x))*10)/10,Math.round(Math.max(0,Math.min(960,p.y))*10)/10];
    }
    function finishDrawing(){
      if(drawPoints.length<3){$('#studio-status').textContent='Click at least three points to close the outline.';return;}
      const points=drawPoints.map(([x,y])=>VectorFont.anchor(x,y));
      edit(g=>{if(g.length>=VectorFont.MAX_CONTOURS)throw new Error('Too many contours.');g.push(points);});
      selection={ci:current().length-1,ni:0};drawPoints=[];drawMode=false;renderEditor();
      $('#studio-status').textContent='Path closed. Select its anchors and drag the square control handles to form curves.';
    }
    board.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      const target=e.target,role=target.dataset.role;
      if(drawMode){
        if(drawPoints.length>=VectorFont.MAX_NODES){$('#studio-status').textContent='Contour point limit reached.';return;}
        drawPoints.push(pointerPosition(e));renderEditor();e.preventDefault();return;
      }
      if(role==='contour'){selection={ci:Number(target.dataset.contour),ni:0};renderEditor();return;}
      if(!['anchor','in','out'].includes(role))return;
      selection={ci:Number(target.dataset.contour),ni:Number(target.dataset.point)};
      edit(()=>{});
      drag={role,ci:selection.ci,ni:selection.ni};board.setPointerCapture(e.pointerId);
      renderEditor();e.preventDefault();
    });
    board.addEventListener('pointermove',e=>{
      if(!drag||!draft)return;
      const contour=current()?.[drag.ci],p=contour?.[drag.ni];if(!p)return;
      let [x,y]=pointerPosition(e);
      if(drag.role==='anchor'&&$('#studio-grid-snap').checked){
        [x,y]=GlyphTools.snapPoint(x,y,Number($('#studio-grid-step').value));
        x=Math.min(760,x);y=Math.min(960,y);
      }
      const previousPoint=p.slice();
      if(drag.role==='anchor'){
        const dx=x-p[0],dy=y-p[1];
        for(let i=0;i<6;i+=2){p[i]=Math.round((p[i]+dx)*10)/10;p[i+1]=Math.round((p[i+1]+dy)*10)/10;}
      }else{
        const offset=drag.role==='in'?2:4,other=drag.role==='in'?4:2;
        p[offset]=x;p[offset+1]=y;
        if(e.shiftKey){p[other]=Math.round((2*p[0]-x)*10)/10;p[other+1]=Math.round((2*p[1]-y)*10)/10;}
      }
      if(!VectorFont.valid(current()))p.splice(0,6,...previousPoint);
      markMasterReviewStale();lastTTF=null;renderEditor();e.preventDefault();
    });
    const finishDrag=()=>{if(drag){drag=null;renderEditor();}};
    board.addEventListener('pointerup',finishDrag);
    board.addEventListener('pointercancel',finishDrag);
    board.addEventListener('dblclick',()=>{if(drawMode&&drawPoints.length>=3)finishDrawing();});
    $('#studio-library-load').addEventListener('click',async()=>{
      const id=$('#studio-library-picker').value;if(!id)return;
      try{const design=await window.skoshPressAPI.loadStudioFont(id);loadDesign(id,design);$('#studio-status').textContent=`Opened ${design.name} from the independent font library.`;}
      catch(error){$('#studio-status').textContent='Font library: '+error.message;}
    });
    $('#studio-library-save').addEventListener('click',async()=>{
      try{
        if(!draft||!window.skoshPressAPI?.saveStudioFont)throw new Error('Open the desktop application to save to your font library.');
        draft.name=$('#studio-name').value.trim().slice(0,64)||'My Skosh Vector';
        await window.skoshPressAPI.saveStudioFont(clone(draft));
        await refreshLibraryPicker(draft.id);
        $('#studio-status').textContent=`Saved ${draft.name} to Your Font Library. This did not modify the publication.`;
      }catch(error){$('#studio-status').textContent='Font library: '+error.message;}
    });
    $('#studio-library-delete').addEventListener('click',async()=>{
      const id=$('#studio-library-picker').value;if(!id||!window.skoshPressAPI?.deleteStudioFont)return;
      if(!window.confirm('Remove this design from Your Font Library? Publications that already embed it will not be affected.'))return;
      try{await window.skoshPressAPI.deleteStudioFont(id);await refreshLibraryPicker();$('#studio-status').textContent='Removed the saved library design. Existing publications were not changed.';}
      catch(error){$('#studio-status').textContent='Font library: '+error.message;}
    });
    function validatePlacements(next){
      if(!Components.valid(next.components,next.componentLinks))throw new Error('Invalid reusable component settings.');
      for(const [ch,links] of Object.entries(next.componentLinks))for(const face of ['Regular',...Object.keys(next.variants||{})]){
        const glyph=(face==='Regular'?next.glyphs:next.variants[face].glyphs)[ch]??next.glyphs[ch]??[];
        Components.resolve(glyph,next.components,links);
      }
    }
    $('#studio-component-whole').addEventListener('click',()=>{try{
      if(activeKind!=='base'||!current().length)throw new Error('Choose a nonempty base outline.');
      const name=$('#studio-component-name').value.trim().slice(0,48);if(!name)throw new Error('Give the component a name.');
      const next=clone(draft),id='component-'+uid().toLowerCase();next.components[id]={name,glyph:VectorFont.copy(current())};validatePlacements(next);
      commitWorkbench(next,'Saved entire base outline as a reusable component.');$('#studio-component-select').value=id;refreshComponents();
    }catch(error){$('#studio-status').textContent=error.message;}});
    $('#studio-component-reposition').addEventListener('click',()=>{try{
      const selected=$('#studio-component-links').value;if(selected==='')throw new Error('Select a placement.');
      const next=clone(draft),link=next.componentLinks[currentChar]?.[Number(selected)];if(!link)throw new Error('Select a placement.');
      Object.assign(link,{dx:Number($('#studio-component-dx').value),dy:Number($('#studio-component-dy').value),scale:Number($('#studio-component-scale').value)});validatePlacements(next);commitWorkbench(next,'Updated linked placement in every face.');
    }catch(error){$('#studio-status').textContent=error.message;}});
    $('#studio-component-bake').addEventListener('click',()=>{try{
      const links=draft.componentLinks[currentChar];if(activeKind!=='base'||!links?.length)throw new Error('Choose a glyph with linked components.');
      const next=clone(draft);for(const face of Object.keys(next.variants))next.variants[face].glyphs[currentChar]=Components.resolve(glyphFor(currentChar,face),next.components,links);
      next.glyphs[currentChar]=Components.resolve(glyphFor(currentChar,'Regular'),next.components,links);delete next.componentLinks[currentChar];commitWorkbench(next,'Detached component placements into editable contours in every face.');
    }catch(error){$('#studio-status').textContent=error.message;}});
    $('#studio-master-word').addEventListener('click',()=>{try{
      const canvas=$('#studio-master-word-canvas'),ctx=canvas.getContext('2d'),weight=Number($('#studio-master-weight').value),layout=Word.layout($('#studio-word').value,draft);
      const runs=layout.positions.map(item=>({item,glyph:Master.interpolate(draft,item.char,weight,template)}));
      ctx.clearRect(0,0,canvas.width,canvas.height);const scale=Math.min(.12,(canvas.width-20)/layout.total);ctx.save();ctx.translate(10,8);ctx.scale(scale,scale);ctx.fillStyle='#163f59';
      for(const {item,glyph} of runs){ctx.save();ctx.translate(item.x,0);ctx.fill(new Path2D(VectorFont.path(glyph)),'nonzero');ctx.restore();}ctx.restore();$('#studio-master-word-status').textContent=`Interpolated ${runs.length} characters at weight ${weight}.`;
    }catch(error){$('#studio-master-word-status').textContent=error.message;}});
    $('#studio-component-select').addEventListener('change',refreshComponents);
    $('#studio-component-links').addEventListener('change',()=>{const value=$('#studio-component-links').value;$('#studio-component-unlink').disabled=value==='';const link=value!==''?draft.componentLinks[currentChar]?.[Number(value)]:null;if(link){for(const field of ['dx','dy','scale'])$('#studio-component-'+field).value=String(link[field]);}});
    $('#studio-component-create').addEventListener('click',()=>{
      try{
        if(!selection||!current()?.[selection.ci])throw new Error('Select a contour first.');
        if(Object.keys(draft.components).length>=Components.MAX_COMPONENTS)throw new Error(`This font already has ${Components.MAX_COMPONENTS} components.`);
        const name=$('#studio-component-name').value.trim().slice(0,48);
        if(!name)throw new Error('Give the component a name.');
        const id='component-'+uid().toLowerCase();
        const next=clone(draft);next.components[id]={name,glyph:[VectorFont.copy(current()[selection.ci])]};commitWorkbench(next,'Saved reusable contour.');
        $('#studio-component-select').value=id;
        renderEditor();$('#studio-status').textContent=`Saved component “${name}”. Place linked copies in other letters.`;
      }catch(error){$('#studio-status').textContent=error.message;}
    });
    $('#studio-component-update').addEventListener('click',()=>{
      try{
        const id=$('#studio-component-select').value;
        if(!id||!selection||!current()?.[selection.ci])throw new Error('Select a saved component and a source contour.');
        const next=clone(draft);next.components[id].glyph=[VectorFont.copy(current()[selection.ci])];validatePlacements(next);commitWorkbench(next,`Updated component “${draft.components[id].name}” and all linked copies.`);
      }catch(error){$('#studio-status').textContent=error.message;}
    });
    $('#studio-component-delete').addEventListener('click',()=>{
      const id=$('#studio-component-select').value;if(!draft?.components?.[id])return;
      const count=Object.values(draft.componentLinks).reduce((n,links)=>n+links.filter(link=>link.id===id).length,0);
      if(!window.confirm(`Delete this component and remove ${count} linked placement(s) from this font?`))return;
      try{const next=clone(draft),name=next.components[id].name;delete next.components[id];
      for(const [ch,links] of Object.entries(next.componentLinks)){next.componentLinks[ch]=links.filter(link=>link.id!==id);if(!next.componentLinks[ch].length)delete next.componentLinks[ch];}
      commitWorkbench(next,`Deleted “${name}” and its linked placements.`);
      }catch(error){$('#studio-status').textContent=error.message;}
    });
    $('#studio-component-place').addEventListener('click',()=>{
      try{
        if(activeKind!=='base')throw new Error('Choose a base character to place a component.');
        const id=$('#studio-component-select').value;
        if(!draft.components[id])throw new Error('Select a saved component.');
        const dx=Number($('#studio-component-dx').value),dy=Number($('#studio-component-dy').value),scale=Number($('#studio-component-scale').value);
        const link={id,dx,dy,scale};
        const placements=draft.componentLinks[currentChar]||[];
        if(placements.length>=Components.MAX_LINKS)throw new Error('The character already has 12 linked components.');
        Components.resolve(glyphFor(currentChar),draft.components,[...placements,link]);
        const next=clone(draft);
        if(!Object.hasOwn(next.glyphs,currentChar)&&!Object.hasOwn(next.variants?.[activeStyle]?.glyphs||{},currentChar))next.glyphs[currentChar]=VectorFont.copy(glyphFor(currentChar));
        next.componentLinks[currentChar]=[...placements,link];commitWorkbench(next,`Placed a linked “${draft.components[id].name}” in ${currentChar}.`);
      }catch(error){$('#studio-status').textContent=error.message;}
    });
    $('#studio-component-unlink').addEventListener('click',()=>{
      const index=Number($('#studio-component-links').value),links=draft.componentLinks[currentChar];
      if(!links||!Number.isInteger(index)||index<0||index>=links.length)return;
      try{const next=clone(draft);next.componentLinks[currentChar].splice(index,1);if(!next.componentLinks[currentChar].length)delete next.componentLinks[currentChar];commitWorkbench(next,`Removed linked component from ${currentChar}.`);}catch(error){$('#studio-status').textContent=error.message;}
    });
    // Specimen Preview
    function paintSpecimen(){
      if(!draft||!specimenFont)return;
      const text=$('#studio-specimen-text').value;
      const cfg={text,layout:$('#studio-specimen-layout').value,size:Number($('#studio-specimen-size').value),leading:Number($('#studio-specimen-leading').value),fontFamily:specimenFont.family};
      const result=Specimen.draw($('#studio-specimen-canvas'),cfg);
      const missing=Specimen.missing(draft,text,specimenFace);
      $('#studio-specimen-canvas').setAttribute('aria-label',`${result.layout} specimen for ${draft.name}, ${specimenFace} face at ${cfg.size} pixels`);
      $('#studio-specimen-coverage').textContent=missing.length?`${missing.length} sample characters are not mapped in the generated face and may display fallback: ${missing.slice(0,18).map(ch=>`U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}`).join(', ')}${missing.length>18?'…':''}`:'Sample characters are supported or available as ASCII templates.';
      $('#studio-specimen-status').textContent=`${specimenFace} compiled TrueType proof · ${result.linesDrawn} lines/characters rendered.${result.clipped?' Text extends beyond the chosen layout.': ''}${specimenDraftDirty?' Font outlines changed; refresh the proof to update the generated font.':''}`;
    }
    async function refreshSpecimen(){
      if(!draft)return;
      const face=$('#studio-specimen-face').value;
      if(face!=='Regular'&&!draft.variants?.[face]){
        $('#studio-specimen-status').textContent=`Create the ${face} face before proofing it.`;
        return;
      }
      const revision=++specimenSerial;
      $('#studio-specimen-render').disabled=true;
      $('#studio-specimen-status').textContent=`Generating ${face} TrueType proof…`;
      try{
        const bytes=generateFont(face,false,false);
        const family=`SkoshProof_${revision}`;
        const generated=new FontFace(family,`url(data:font/ttf;base64,${base64(bytes)})`,{weight:'400',style:'normal'});
        await generated.load();
        if(revision!==specimenSerial)return;
        if(specimenFont)document.fonts.delete(specimenFont);
        document.fonts.add(generated);
        specimenFont=generated;specimenFace=face;specimenDraftDirty=false;
        paintSpecimen();
      }catch(error){
        if(revision===specimenSerial)$('#studio-specimen-status').textContent=`Compiled-font preview could not load: ${error.message}. Other font editing tools remain available.`;
      }finally{if(revision===specimenSerial)$('#studio-specimen-render').disabled=false;}
    }
    $('#studio-specimen-render').addEventListener('click',()=>void refreshSpecimen());
    $('#studio-specimen-preset').addEventListener('change',()=>{
      const preset=$('#studio-specimen-preset').value;
      if(Object.hasOwn(Specimen.PRESETS,preset))$('#studio-specimen-text').value=Specimen.PRESETS[preset];
      paintSpecimen();
    });
    $('#studio-specimen-reset').addEventListener('click',()=>{
      const preset=$('#studio-specimen-preset').value;
      if(Object.hasOwn(Specimen.PRESETS,preset))$('#studio-specimen-text').value=Specimen.PRESETS[preset];
      else{$('#studio-specimen-preset').value='lorem';$('#studio-specimen-text').value=Specimen.PRESETS.lorem;}
      paintSpecimen();
    });
    $('#studio-specimen-text').addEventListener('input',()=>{
      $('#studio-specimen-preset').value='custom';paintSpecimen();
    });
    $('#studio-specimen-layout').addEventListener('change',paintSpecimen);
    $('#studio-specimen-size').addEventListener('change',paintSpecimen);
    $('#studio-specimen-leading').addEventListener('change',paintSpecimen);
    $('#studio-specimen-face').addEventListener('change',()=>{
      if(specimenFace!==$('#studio-specimen-face').value)$('#studio-specimen-status').textContent='Face selection changed. Refresh the compiled-font proof to show the new face.';
    });
    function goToIntegrityIssue(issue){
      if(issue.target==='components')$('#studio-components-panel').open=true;
      if(issue.target==='spacing')$('#studio-advanced-spacing').open=true;
      if(issue.target==='master')$('.studio-variation-editor').open=true;
      if(issue.face&&draft.variants?.[issue.face]&&activeStyle!==issue.face){
        activeStyle=issue.face;history.length=0;redoHistory.length=0;
      }
      if(issue.glyph&&PixelFont.isSupportedChar(issue.glyph)){
        focusGlyph('b'+issue.glyph);
        $('#studio-vector-canvas').scrollIntoView({block:'nearest'});
      }else if(issue.target==='master')$('#studio-master-check').scrollIntoView({block:'nearest'});
      else if(issue.target==='spacing')$('#studio-advanced-spacing').scrollIntoView({block:'nearest'});
      else if(issue.target==='components')$('#studio-components-panel').scrollIntoView({block:'nearest'});
      $('#studio-status').textContent=`Font Integrity: ${issue.message}`;
    }
    function renderIntegrityIssues(){
      const host=$('#studio-integrity-results');host.replaceChildren();
      if(!integrityReport)return;
      const filter=$('#studio-integrity-filter').value;
      const issues=integrityReport.issues.filter(issue=>filter==='all'||issue.level===filter);
      for(const issue of issues.slice(0,170)){
        const li=document.createElement('li');li.dataset.level=issue.level;
        if(issue.glyph||issue.target){
          const button=document.createElement('button');button.type='button';button.className='studio-integrity-link';
          button.textContent=issue.glyph?`Review ${Master.nameOf(issue.glyph)}`:'Review settings';
          button.setAttribute('aria-label',`${button.textContent}: ${issue.message}`);
          button.addEventListener('click',()=>goToIntegrityIssue(issue));li.append(button);
        }
        const detail=document.createElement('span');detail.textContent=`${issue.level.toUpperCase()}: ${issue.message}`;li.append(detail);host.append(li);
      }
      if(issues.length>170){const li=document.createElement('li');li.textContent=`Showing the first 170 of ${issues.length} findings. Use the severity filter or address the flagged glyphs and review again.`;host.append(li);}
      if(!issues.length){const li=document.createElement('li');li.textContent=filter==='all'?'No issues identified by the local checks. Test exported fonts in the intended applications.':'No findings of this severity.';host.append(li);}
    }
    $('#studio-integrity-run').addEventListener('click',()=>{
      if(!draft)return;
      try{
        integrityReport=Integrity.inspect(draft,template);
        const result=integrityReport,counts=result.counts||{error:0,warning:0,notice:0};
        $('#studio-integrity-summary').textContent=`${result.ready?'Static font export has no blocking findings':'Resolve blocking errors before export'} · ${result.coverage}/${result.capacity} mapped characters · ${result.faces?.length||0} faces`;
        $('#studio-integrity-counts').textContent=`${counts.error} blocking errors · ${counts.warning} warnings · ${counts.notice} suggestions. Select an actionable finding to open the relevant editor.`;
        renderIntegrityIssues();
      }catch(error){$('#studio-integrity-summary').textContent=`Integrity review failed: ${error.message}`;}
    });
    $('#studio-integrity-filter').addEventListener('change',renderIntegrityIssues);
    const open=()=>{loadDesign(state.doc.fontDesigns?.[0]?.id||null);dialog.showModal();void refreshLibraryPicker(draft?.id);};
    $('#typography-studio-btn').addEventListener('click',open);
    $('#font-studio-open').addEventListener('click',open);
    $('#studio-close').addEventListener('click',()=>dialog.close());
    $('#studio-new').addEventListener('click',()=>loadDesign(null));
    designPicker.addEventListener('change',()=>loadDesign(designPicker.value));
    charPicker.addEventListener('change',()=>{const ch=charPicker.value;wordSelectionIndex=Word.cleanWord($('#studio-word').value).indexOf(ch);if(wordSelectionIndex<0)wordSelectionIndex=null;focusGlyph('b'+ch);});
    $('#studio-variant-select').addEventListener('change',()=>{
      if(!draft)return;
      activeStyle=$('#studio-variant-select').value;
      if(activeKind!=='base'){activeKind='base';activeSequence='';}
      history.length=0;redoHistory.length=0;selection=null;drawMode=false;drawPoints=[];
      lastTTF=null;refreshMetrics();renderEditor();
      $('#studio-status').textContent=activeStyle==='Regular'?'Editing original Regular outlines.':`Editing ${activeStyle}. Generate a starting face, or modify a letter to create an individual override.`;
    });
    $('#studio-variant-create').addEventListener('click',()=>{
      if(!draft||activeStyle==='Regular')return;
      try{
        const {face,simplified}=FontVariations.create(draft.glyphs,activeStyle,template);
        draft.variants[activeStyle]=face;history.length=0;redoHistory.length=0;selection=null;lastTTF=null;markSpecimenStale();
        markMasterReviewStale();refreshVariationControls();renderEditor();
        $('#studio-status').textContent=`Generated editable ${activeStyle} face from Regular${simplified?`; ${simplified} complex glyphs used a simplified transform`:''}. Save font family to keep it.`;
      }catch(error){$('#studio-status').textContent=error.message;}
    });
    $('#studio-variant-delete').addEventListener('click',()=>{
      if(activeStyle==='Regular'||!draft?.variants?.[activeStyle])return;
      delete draft.variants[activeStyle];history.length=0;redoHistory.length=0;selection=null;lastTTF=null;markSpecimenStale();
      markMasterReviewStale();refreshVariationControls();renderEditor();
      $('#studio-status').textContent=`Removed ${activeStyle} from this design. Save the font family to update embedded faces.`;
    });
    $('#studio-reference').addEventListener('change',renderEditor);
    $('#studio-grid-visible').addEventListener('change',renderEditor);
    $('#studio-grid-step').addEventListener('change',renderEditor);
    function replaceGlyph(change,message){
      if(!draft)return;
      try{
        // Glyph History
        if(edit(g=>{const transformed=change(g);g.splice(0,g.length,...transformed);}))$('#studio-status').textContent=message;
      }catch(error){$('#studio-status').textContent=error.message;}
    }
    $('#studio-transform-apply').addEventListener('click',()=>{
      const options={width:Number($('#studio-width-scale').value),height:Number($('#studio-height-scale').value),
        slant:Number($('#studio-slant').value),rotation:Number($('#studio-rotation').value)};
      const index=$('#studio-transform-scope').value==='contour'?selection?.ci:null;
      if($('#studio-transform-scope').value==='contour'&&index==null){$('#studio-status').textContent='Select a contour before transforming it.';return;}
      if(Object.values(options).some(n=>!Number.isFinite(n))){$('#studio-status').textContent='Enter valid transform values.';return;}
      replaceGlyph(g=>GlyphTools.transform(g,options,index),'Applied width, height, slant, and rotation to editable Bézier geometry.');
    });
    $('#studio-center').addEventListener('click',()=>{
      replaceGlyph(g=>GlyphTools.centerGlyph(g,VectorFont.advanceFor(draft,currentChar)),`Centered ${currentChar} within its advance width.`);
    });
    $('#studio-duplicate-contour').addEventListener('click',()=>{
      if(!selection)return;
      const index=selection.ci;
      replaceGlyph(g=>GlyphTools.duplicateContour(g,index),'Duplicated selected contour (offset 24 units).');
      if(current().length>index+1)selection={ci:index+1,ni:0};renderEditor();
    });
    for(const [button,target,label] of [['#studio-align-cap','cap','cap-height'],['#studio-align-base','baseline','baseline']]){
      $(button).addEventListener('click',()=>{
        if(!selection)return;
        replaceGlyph(g=>GlyphTools.alignContour(g,selection.ci,target),`Aligned selected contour to ${label} guide.`);
      });
    }
    $('#studio-weight-apply').addEventListener('click',()=>{
      const amount=Number($('#studio-weight').value),scope=$('#studio-weight-scope').value;
      const contour=scope==='contour'?selection?.ci:null;
      if(scope==='contour'&&contour==null){$('#studio-status').textContent='Select an anchor on the contour to adjust first.';return;}
      if(!Number.isInteger(amount)||Math.abs(amount)>60){$('#studio-status').textContent='Choose a whole-number weight from −60 to +60.';return;}
      replaceGlyph(g=>Outline.weight(g,amount,contour),`Adjusted ${scope==='all'?'the glyph':`contour ${contour+1}`} by ${amount>0?'+':''}${amount} weight units. Save to export the result.`);
    });
    for(const [button,operation,label] of [['#studio-boolean-union','union','combined'],['#studio-boolean-subtract','subtract','subtracted'],['#studio-boolean-intersect','intersect','intersected']]){
      $(button).addEventListener('click',()=>{
        const a=Number($('#studio-boolean-a').value),b=Number($('#studio-boolean-b').value);
        if(!Number.isInteger(a)||!Number.isInteger(b)||a===b||!current()[a]||!current()[b]){
          $('#studio-status').textContent='Choose two different contours A and B first.';return;
        }
        try{
          const ok=edit(g=>{const transformed=Outline.boolean(g,a,b,operation);g.splice(0,g.length,...transformed);});
          if(ok){selection=null;renderEditor();$('#studio-status').textContent=current().length?`Contours ${a+1} and ${b+1} ${label}. Other contours preserved. Save the font to keep this change.`:'No filled area remains after this operation. Use Undo glyph to restore the previous outlines.';}
        }catch(error){$('#studio-status').textContent=error.message;}
      });
    }
    $('#studio-liga-list').addEventListener('change',refreshFeatureLists);
    $('#studio-alt-list').addEventListener('change',refreshFeatureLists);
    $('#studio-liga-create').addEventListener('click',()=>{
      const seq=$('#studio-liga-sequence').value;
      if(!/^[!-~]{2,3}$/.test(seq)){$('#studio-status').textContent='Enter 2 or 3 printable non-space characters (such as fi or ffi).';return;}
      if(!draft.ligatures[seq]){
        if(Object.keys(draft.ligatures).length>=16){$('#studio-status').textContent='Maximum of 16 custom ligatures.';return;}
        if(Object.keys(draft.ligatures).length+Object.values(draft.alternates).reduce((n,a)=>n+a.length,0)>=64){$('#studio-status').textContent='The font has reached its 64 additional-glyph limit.';return;}
        draft.ligatures[seq]={glyph:sampleLigature(seq),advance:Math.min(2400,seq.length*650)};
      }
      lastTTF=null;markSpecimenStale();focusGlyph('l'+seq);$('#studio-status').textContent=`Editing custom ${seq} ligature. Modify its curves and save the font to include an OpenType liga substitution.`;
    });
    $('#studio-liga-edit').addEventListener('click',()=>{const seq=$('#studio-liga-list').value;if(draft.ligatures[seq])focusGlyph('l'+seq);});
    $('#studio-liga-remove').addEventListener('click',()=>{
      const seq=$('#studio-liga-list').value;if(!draft.ligatures[seq])return;
      delete draft.ligatures[seq];history.length=0;redoHistory.length=0;lastTTF=null;markSpecimenStale();
      if(activeKind==='ligature'&&activeSequence===seq)focusGlyph('b'+currentChar);else renderEditor();
      $('#studio-status').textContent=`Removed ligature ${seq}. Save font to update its substitutions.`;
    });
    $('#studio-liga-advance').addEventListener('change',()=>{
      if(activeKind!=='ligature')return;
      const n=Number($('#studio-liga-advance').value);
      if(Number.isInteger(n)&&n>=320&&n<=2400){draft.ligatures[activeSequence].advance=n;lastTTF=null;markSpecimenStale();renderEditor();$('#studio-status').textContent=`Ligature ${activeSequence} width is now ${n} font units.`;}
      else{$('#studio-status').textContent='Choose a ligature advance from 320 to 2400.';refreshMetrics();}
    });
    $('#studio-alt-create').addEventListener('click',()=>{
      const ch=$('#studio-alt-char').value;
      if(!/^[!-~]$/.test(ch))return;
      const versions=draft.alternates[ch]??[];
      if(versions.length>=3){$('#studio-status').textContent=`${ch} already has three alternates.`;return;}
      if(!draft.alternates[ch]&&Object.keys(draft.alternates).length>=24){$('#studio-status').textContent='Maximum of 24 characters with stylistic alternates.';return;}
      if(Object.keys(draft.ligatures).length+Object.values(draft.alternates).reduce((n,a)=>n+a.length,0)>=64){$('#studio-status').textContent='The font has reached its 64 additional-glyph limit.';return;}
      versions.push(VectorFont.copy(draft.glyphs[ch]??template(ch)));draft.alternates[ch]=versions;
      lastTTF=null;markSpecimenStale();focusGlyph(`a${ch}${versions.length-1}`);$('#studio-status').textContent=`Editing variation ${versions.length} of ${ch}. Its base glyph is unchanged.`;
    });
    $('#studio-alt-edit').addEventListener('click',()=>{const target=$('#studio-alt-list').value;if(target&&glyphAt(target))focusGlyph(target);});
    $('#studio-alt-remove').addEventListener('click',()=>{
      const target=$('#studio-alt-list').value;if(!target)return;
      const ch=target[1],index=Number(target.slice(2));if(!draft.alternates[ch]?.[index])return;
      draft.alternates[ch].splice(index,1);if(!draft.alternates[ch].length)delete draft.alternates[ch];
      history.length=0;redoHistory.length=0;lastTTF=null;
      if(activeKind==='alternate')focusGlyph('b'+ch);else renderEditor();
      $('#studio-status').textContent=`Removed alternate ${index+1} for ${ch}.`;
    });
    $('#studio-feature-base').addEventListener('click',()=>focusGlyph('b'+currentChar));
    for(const id of ['#studio-feature-proof-text','#studio-feature-preview-liga','#studio-feature-preview-alt']){
      $(id).addEventListener(id==='#studio-feature-proof-text'?'input':'change',drawFeatureProof);
    }
    $('#studio-bearing-left-set').addEventListener('click',()=>{
      const n=Number($('#studio-bearing-left').value);
      if(!Number.isInteger(n)||n<-300||n>450){$('#studio-status').textContent='Left sidebearing must be between −300 and 450.';return;}
      const previous=draft.leftBearings[currentChar];draft.leftBearings[currentChar]=n;
      const base=Components.resolve(glyphFor(currentChar),draft.components||{},draft.componentLinks?.[currentChar]||[],false);
      if(!VectorFont.valid(Spacing.resolveSpacing(base,draft,currentChar).glyph)){
        if(previous===undefined)delete draft.leftBearings[currentChar];else draft.leftBearings[currentChar]=previous;
        $('#studio-status').textContent='Sidebearing would exceed the editable outline limits.';return;
      }
      lastTTF=null;markSpecimenStale();refreshMetrics();renderEditor();$('#studio-status').textContent=`Left sidebearing for ${currentChar}: ${n} units.`;
    });
    $('#studio-bearing-right-set').addEventListener('click',()=>{
      const right=Number($('#studio-bearing-right').value),base=Components.resolve(glyphFor(currentChar),draft.components||{},draft.componentLinks?.[currentChar]||[],false);
      const ink=Spacing.bounds(base),left=draft.leftBearings[currentChar]??Math.round(ink.min);
      const width=Math.round(ink.max+left-ink.min+right-(draft.spacing??0));
      if(!Number.isInteger(right)||right<-300||right>450||width<320||width>1200){$('#studio-status').textContent='Right bearing or resulting advance is outside allowed limits.';refreshMetrics();return;}
      draft.advances[currentChar]=width;lastTTF=null;markSpecimenStale();refreshMetrics();renderEditor();$('#studio-status').textContent=`Right sidebearing for ${currentChar}: ${right} units.`;
    });
    $('#studio-bearing-reset').addEventListener('click',()=>{
      delete draft.leftBearings[currentChar];delete draft.advances[currentChar];lastTTF=null;markSpecimenStale();refreshMetrics();renderEditor();
    });
    $('#studio-class-list').addEventListener('change',()=>{
      const pair=$('#studio-class-list').value;
      $('#studio-class-remove').disabled=!pair;
      if(!pair)return;
      const [left,right]=pair.split('/');
      $('#studio-class-left-name').value=left;$('#studio-class-right-name').value=right;
      $('#studio-class-left-chars').value=(draft.kerningClasses.left?.[left]||[]).join('');
      $('#studio-class-right-chars').value=(draft.kerningClasses.right?.[right]||[]).join('');
      $('#studio-class-kern-value').value=String(draft.classKerning[pair]);
    });
    $('#studio-class-save').addEventListener('click',()=>{
      const left=$('#studio-class-left-name').value.trim(),right=$('#studio-class-right-name').value.trim();
      const lchars=[...$('#studio-class-left-chars').value],rchars=[...$('#studio-class-right-chars').value],amount=Number($('#studio-class-kern-value').value);
      const next=clone(draft);
      next.kerningClasses.left[left]=lchars;next.kerningClasses.right[right]=rchars;
      next.classKerning[`${left}/${right}`]=amount;
      if(!VectorFont.validMetrics(next)){$('#studio-status').textContent='Invalid classes: use unique supported members and valid names; limit expanded kerning to 2,500 pairs.';return;}
      draft.kerningClasses=next.kerningClasses;draft.classKerning=next.classKerning;
      lastTTF=null;markSpecimenStale();refreshAdvancedSpacing();refreshKerningList();renderWord();drawPreviewCanvas();
      $('#studio-status').textContent=`Saved class pair ${left}/${right}: ${amount} units.`;
    });
    $('#studio-class-remove').addEventListener('click',()=>{
      const pair=$('#studio-class-list').value;if(!pair)return;
      delete draft.classKerning[pair];lastTTF=null;markSpecimenStale();refreshAdvancedSpacing();renderWord();drawPreviewCanvas();
      $('#studio-status').textContent=`Removed class pair ${pair}.`; 
    });
    $('#studio-spacing').addEventListener('change',()=>{
      const n=Number($('#studio-spacing').value);
      if(Number.isInteger(n)&&n>=-250&&n<=350){draft.spacing=n;lastTTF=null;markSpecimenStale();drawPreview();$('#studio-status').textContent=`Global spacing set to ${n} font units.`;}
      else $('#studio-status').textContent='Letter spacing must be between −250 and 350.';
      refreshMetrics();
    });
    $('#studio-advance').addEventListener('change',()=>{
      const n=Number($('#studio-advance').value);
      if(Number.isInteger(n)&&n>=320&&n<=1200){draft.advances[currentChar]=n;lastTTF=null;markSpecimenStale();drawPreview();$('#studio-status').textContent=`Advance width for ${currentChar} set to ${n} units.`;}
      else $('#studio-status').textContent='Glyph advance must be between 320 and 1200.';
      refreshMetrics();
    });
    $('#studio-reset-advance').addEventListener('click',()=>{
      delete draft.advances[currentChar];lastTTF=null;markSpecimenStale();refreshMetrics();drawPreview();
    });
    $('#studio-kern-pair').addEventListener('input',refreshKerningValue);
    $('#studio-kern-list').addEventListener('change',()=>{
      const pair=$('#studio-kern-list').value;
      if(pair){$('#studio-kern-pair').value=pair;refreshKerningValue();}
    });
    $('#studio-kern-save').addEventListener('click',()=>{
      const pair=$('#studio-kern-pair').value,value=Number($('#studio-kern-value').value);
      if([...pair].length!==2||[...pair].some(c=>!PixelFont.isSupportedChar(c))||!Number.isInteger(value)||value<-400||value>400){
        $('#studio-status').textContent='Enter exactly two supported characters and a kerning value from −400 to 400.';return;
      }
      const previous=draft.kerning[pair];
      if(value===0)delete draft.kerning[pair];else draft.kerning[pair]=value;
      if(!VectorFont.validMetrics(draft)){if(previous===undefined)delete draft.kerning[pair];else draft.kerning[pair]=previous;$('#studio-status').textContent='Kerning pair limit reached (300 pairs).';return;}
      lastTTF=null;markSpecimenStale();refreshKerningList();drawPreview();
      $('#studio-status').textContent=value?`Saved ${pair} kerning adjustment: ${value} units.`:`Removed ${pair} kerning override.`;
    });
    $('#studio-kern-clear').addEventListener('click',()=>{
      const pair=$('#studio-kern-pair').value;delete draft.kerning[pair];lastTTF=null;markSpecimenStale();refreshKerningList();refreshKerningValue();drawPreview();
    });
    $('#studio-sample').addEventListener('input',drawPreview);
    $('#studio-draw').addEventListener('click',()=>{drawMode=!drawMode;drawPoints=[];selection=null;renderEditor();$('#studio-status').textContent=drawMode?'Click three or more positions, then Close path.':'Selection mode: drag anchor points and handles.';});
    $('#studio-finish').addEventListener('click',finishDrawing);
    $('#studio-ellipse').addEventListener('click',()=>{
      edit(g=>{
        const inner=g.length>0;
        const contour=VectorFont.ellipse(380,465,inner?118:212,inner?176:303)[0];
        g.push(inner?VectorFont.reverse([contour],0)[0]:contour);
      });
      selection={ci:current().length-1,ni:0};renderEditor();
    });
    $('#studio-rectangle').addEventListener('click',()=>{
      edit(g=>{if(g.length>=VectorFont.MAX_CONTOURS)throw new Error('Too many contours.');g.push(...VectorFont.rectangle());});
      selection={ci:current().length-1,ni:0};renderEditor();
    });
    for(const [id,axis] of [['#studio-flip-x','x'],['#studio-flip-y','y']]){
      $(id).addEventListener('click',()=>{
        if(!selection)return;
        const ci=selection.ci;
        edit(g=>{const updated=VectorFont.flip(g,axis,ci);g.splice(0,g.length,...updated);});
        selection={ci,ni:0};renderEditor();
      });
    }
    $('#studio-copy-glyph').addEventListener('click',()=>{
      const from=$('#studio-copy-from').value;
      if(!PixelFont.isSupportedChar(from))return;
      edit(g=>g.splice(0,g.length,...VectorFont.copy(glyphFor(from))));
      selection=null;renderEditor();$('#studio-status').textContent=`Copied outlines from ${from} into ${currentChar}.`;
    });
    $('#studio-import-svg').addEventListener('click',()=>$('#studio-svg-file').click());
    $('#studio-svg-file').addEventListener('change',async()=>{
      const input=$('#studio-svg-file'),file=input.files?.[0];if(!file)return;
      try{
        if(file.size>256*1024)throw new Error('SVG files must be 256 KB or smaller.');
        if(!/\.svg$/i.test(file.name))throw new Error('Select an SVG file.');
        const source=await file.text();
        if(/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('SVG documents with DTDs or entities are not supported.');
        const doc=new DOMParser().parseFromString(source,'image/svg+xml');
        if(doc.querySelector('parsererror'))throw new Error('The SVG document could not be parsed.');
        const glyph=SvgGlyph.fromDocument(doc);
        edit(g=>g.splice(0,g.length,...glyph));selection=null;renderEditor();
        $('#studio-status').textContent=`Imported ${glyph.length} editable SVG contour(s) into ${currentChar}.`;
      }catch(error){$('#studio-status').textContent='SVG import: '+error.message;}
      finally{input.value='';}
    });
    board.addEventListener('keydown',e=>{
      if((e.key==='Enter'||e.key===' ')&&!drawMode){
        e.preventDefault();const anchor=e.target.closest?.('[data-role="anchor"]');
        if(anchor)selection={ci:Number(anchor.dataset.contour),ni:Number(anchor.dataset.point)};
        else if(!selection&&current()?.[0]?.[0])selection={ci:0,ni:0};
        renderEditor();$('#studio-anchor-description').textContent=selection?`Selected anchor ${selection.ni+1} in contour ${selection.ci+1}. Arrow keys move it.`:'No anchors available to select.';return;
      }
      if(!selection||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
      const amt=e.shiftKey?10:1,dx=e.key==='ArrowLeft'?-amt:e.key==='ArrowRight'?amt:0,dy=e.key==='ArrowUp'?-amt:e.key==='ArrowDown'?amt:0;
      edit(g=>{const p=g[selection.ci][selection.ni];for(let i=0;i<6;i+=2){p[i]+=dx;p[i+1]+=dy;}});
      e.preventDefault();
    });
    $('#studio-insert').addEventListener('click',()=>{
      if(!selection)return;
      const {ci,ni}=selection;
      if(edit(g=>{const result=Workbench.splitAt(g,ci,ni,Number($('#studio-split-percent').value)/100);g.splice(0,g.length,...result);})) {selection={ci,ni:ni+1};renderEditor();}
    });
    $('#studio-delete').addEventListener('click',()=>{
      if(!selection)return;
      const {ci,ni}=selection;
      edit(g=>{if(g[ci].length===3)g.splice(ci,1);else g[ci].splice(ni,1);});
      selection=null;renderEditor();
    });
    $('#studio-reverse').addEventListener('click',()=>{
      if(!selection)return;
      edit(g=>{const updated=VectorFont.reverse(g,selection.ci);g.splice(0,g.length,...updated);});
    });
    function controlPoint(smooth){
      if(!selection)return;
      const {ci,ni}=selection;
      edit(g=>{
        const pts=g[ci],p=pts[ni],prev=pts[(ni+pts.length-1)%pts.length],next=pts[(ni+1)%pts.length];
        if(!smooth){p[2]=p[4]=p[0];p[3]=p[5]=p[1];return;}
        const dx=(next[0]-prev[0])/6,dy=(next[1]-prev[1])/6;
        p[2]=Math.round((p[0]-dx)*10)/10;p[3]=Math.round((p[1]-dy)*10)/10;
        p[4]=Math.round((p[0]+dx)*10)/10;p[5]=Math.round((p[1]+dy)*10)/10;
      });
    }
    $('#studio-smooth').addEventListener('click',()=>controlPoint(true));
    $('#studio-corner').addEventListener('click',()=>controlPoint(false));
    $('#studio-clear').addEventListener('click',()=>{edit(g=>g.splice(0,g.length));selection=null;renderEditor();});
    $('#studio-autofill').addEventListener('click',()=>{edit(g=>g.splice(0,g.length,...VectorFont.copy(template(currentChar))));selection=null;renderEditor();});
    $('#studio-undo').addEventListener('click',()=>{
      const previous=history.pop();if(!previous)return;
      if(previous.patches){redoHistory.push(previous);applyPatches(previous.patches,'before');return;}
      redoHistory.push({key:previous.key,glyph:VectorFont.copy(glyphAt(previous.key))});
      storeGlyph(previous.key,previous.glyph);focusGlyph(previous.key);
      lastTTF=null;refreshMetrics();renderEditor();
    });
    $('#studio-redo').addEventListener('click',()=>{
      const next=redoHistory.pop();if(!next)return;
      if(next.patches){history.push(next);applyPatches(next.patches,'after');return;}
      history.push({key:next.key,glyph:VectorFont.copy(glyphAt(next.key))});
      storeGlyph(next.key,next.glyph);focusGlyph(next.key);
      lastTTF=null;refreshMetrics();renderEditor();
    });
    $('#studio-save').addEventListener('click',saveDesign);
    $('#studio-apply').addEventListener('click',()=>{
      if(!saveDesign())return;
      if(selectedFrame()?.type!=='text'||selectionLocked()){toast('Font saved. Select a text frame to apply it.');return;}
      styleChange('font',FontVariations.fontId(draft.id,activeStyle));toast(`${activeStyle} vector font applied to selected text frame.`);
    });
    $('#studio-export').addEventListener('click',async()=>{
      try{
        if(!window.skoshPressAPI?.exportDesignedFont)throw new Error('Open the Electron desktop app to export TTF.');
        const data='data:font/ttf;base64,'+base64(generateFont(activeStyle));
        const result=await window.skoshPressAPI.exportDesignedFont(`${draft.name}-${activeStyle}`,data);
        $('#studio-status').textContent=result?`Exported ${draft.name}-${activeStyle}.ttf.`:'Export cancelled.';
      }catch(error){$('#studio-status').textContent=error.message;}
    });
    $('#studio-import-editable').addEventListener('click',async()=>{
      try{
        if(!window.skoshPressAPI?.importEditableFont)throw new Error('Editable import requires the Electron desktop application.');
        const result=await window.skoshPressAPI.importEditableFont();if(!result)return;
        if(!window.confirm('Open this imported design in Typography Studio? Unsaved studio edits will be replaced.'))return;
        const incoming=clone(result.design);incoming.id='font-'+uid().toLowerCase();
        loadDesign(incoming.id,incoming);
        $('#studio-status').textContent=`Imported ${result.imported??'editable'} glyphs. ${result.notice??''} Only edit/redistribute fonts when your license permits.`;
      }catch(error){$('#studio-status').textContent='Editable import: '+error.message;}
    });
    $('#studio-export-editable').addEventListener('click',async()=>{
      try{
        draft.name=$('#studio-name').value.trim().slice(0,64)||'My Skosh Vector';
        const result=await window.skoshPressAPI.exportEditableFont(clone(draft));
        $('#studio-status').textContent=result?'Exported lossless editable .skoshfont source.':'Source export cancelled.';
      }catch(error){$('#studio-status').textContent='Editable source: '+error.message;}
    });
    $('#studio-export-ufo').addEventListener('click',async()=>{
      try{
        draft.name=$('#studio-name').value.trim().slice(0,64)||'My Skosh Vector';
        const glyphs={};
        for(const char of PixelFont.ALL_CHARS)if(PixelFont.CHARS.includes(char)||Object.hasOwn(draft.glyphs,char)||draft.componentLinks[char]?.length)glyphs[char]=Components.resolve(glyphFor(char,'Regular'),draft.components,draft.componentLinks[char]||[]);
        const result=await window.skoshPressAPI.exportUFOFont(clone(draft),glyphs);
        $('#studio-status').textContent=result?'Exported editable UFO3 Regular outlines; Skosh features/masters remain in .skoshfont source.':'UFO export cancelled.';
      }catch(error){$('#studio-status').textContent='UFO export: '+error.message;}
    });
    $('#studio-export-variable').addEventListener('click',async()=>{
      try{
        const report=checkMasterCompatibility();
        if(!report.ready){
          $('#studio-master-check').closest('details').open=true;
          throw new Error(report.missingBold?'Create and edit a Bold master before exporting the wght variable axis.':`${report.errors.length} incompatible glyphs found. Review the Variable Font Workspace and repair the affected masters before exporting.`);
        }
        const masters={};for(const face of ['Regular',...(draft.variants?.Light?['Light']:[]),'Bold'])masters[face]='data:font/ttf;base64,'+base64(generateFont(face,true));
        const result=await window.skoshPressAPI.exportVariableFont(masters);
        $('#studio-status').textContent=result?'Exported real OpenType wght variable font. Test interpolation in your target software.':'Variable export cancelled.';
      }catch(error){$('#studio-status').textContent='Variable export: '+error.message;}
    });
    $('#studio-export-family').addEventListener('click',async()=>{
      try{
        if(!window.skoshPressAPI?.exportDesignedFamily)throw new Error('Open the Electron desktop application to export a font family.');
        const faces=['Regular',...FontVariations.OPTIONAL.filter(style=>draft.variants?.[style])].map(style=>({style,data:'data:font/ttf;base64,'+base64(generateFont(style))}));
        const result=await window.skoshPressAPI.exportDesignedFamily(draft.name,faces);
        $('#studio-status').textContent=result?`Exported ${result.faces} font faces in ${draft.name}-family.zip.`:'Family export cancelled.';
      }catch(error){$('#studio-status').textContent=error.message;}
    });
  }
  function bind() {
    notices=SkoshEditorInterface.createNotices(document);
    window.SkoshEditorWorkspace.bind({getDocument:()=>state.doc,goTo:(index,id)=>{selectPage(index,true);if(id){selectFrame(id,index);focusAddedFrame();}else $('#page-list .page-list-item.active')?.focus({preventScroll:true});},place:asset=>{if(currentPage().frames.length>=300)return toast('A page can hold at most 300 objects.');attempt(()=>addFrame('image',asset));focusAddedFrame();if(asset.mixedDescriptions)toast('Image placed. Review its alternative text in the inspector.');},applyFont:id=>{if(selectedFrame()?.type!=='text'||selectionLocked())return toast('Select an unlocked text frame before applying a font.');attempt(()=>styleChange('font',id));},libraryFont:file=>attempt(()=>embedFont(file)),saveCompact:()=>save(true,true),run:id=>{if(id==='@story'){const frame=selectedFrame();if(!frame?.storyId||selectionLocked())return toast('Select an unlocked linked manuscript frame first.');openStoryEditor(frame.storyId);return;}const button=document.getElementById(id);if(button?.disabled)return toast('This command is unavailable for the current selection.');button?.click();},exportPackage:async()=>{try{if(!window.skoshPressAPI?.exportPackage)throw Error('Open Skosh Press in Electron to package a publication.');if(!confirm('Package the complete editable publication, including hidden content and embedded fonts?'))return;const result=await window.skoshPressAPI.exportPackage(recoveryDocument());if(result)toast('Publication package saved: '+savePathName(result.path));}catch(error){showError(error);}}});
    bindRibbonNavigation();bindToolbarCustomization();bindSettings(); bindTemplates(); bindEditorial(); bindRevisions(); bindPrintLab(); bindStoryEditor(); bindPublishingTools(); bindMasterStudio();bindLayoutTools();bindTypographyStudio();
    const on=(id,fn)=>$(id).addEventListener('click',fn);
    on('#undo-btn',undo);on('#redo-btn',redo);
    on('#help-basics-btn',()=>openHelpDialog('#help-basics-dialog'));
    on('#help-basics-close',()=>$('#help-basics-dialog').close());
    on('#help-privacy-close',()=>$('#help-privacy-dialog').close());
    on('#new-btn',()=>freshProject());on('#open-btn',open);on('#save-btn',()=>save(false));on('#save-as-btn',()=>save(true));on('#import-btn',importManuscript);on('#genealogy-btn',()=>$('#genealogy-dialog').showModal());on('#genealogy-close',()=>$('#genealogy-dialog').close());on('#genealogy-import',importGenealogy);on('#genealogy-generate',generateGenealogy);on('#genealogy-csv',exportGenealogyCsv);on('#genealogy-batch',generateGenealogyBatch);on('#genealogy-chart-refresh',()=>refreshGenealogyView(false));on('#genealogy-chart-insert',appendGenealogyChart);on('#genealogy-photo-add',appendGenealogyPhoto);for(const id of ['genealogy-chart-search','genealogy-chart-depth','genealogy-chart-mode','genealogy-chart-root','genealogy-private'])$('#'+id).addEventListener('input',invalidateGenealogyView);$('#genealogy-chart-search').addEventListener('change',()=>refreshGenealogyView(true));$('#genealogy-private').addEventListener('change',()=>refreshGenealogyView(true));for(const id of ['genealogy-chart-root','genealogy-chart-mode','genealogy-chart-depth'])$('#'+id).addEventListener('change',()=>refreshGenealogyView());on('#genealogy-batch-cancel',()=>{genealogyBatchStop=true;$('#genealogy-batch-status').textContent='Finishing the current step before cancelling…';});on('#text-btn',()=>addFrame('text'));on('#image-btn',()=>{void placeImage();});
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
    for(const key of ['x','y','w','h'])$('#frame-'+key).addEventListener('change',e=>{const f=selectedFrame();if(f)attempt(()=>frameChange(key,measured(number(e.target.value,displayed(f[key])))));});
    $('#frame-font').addEventListener('change',e=>styleChange('font',fontChoice(e.target.value)));
    $('#frame-size').addEventListener('change',e=>styleChange('fontSize',clamp(number(e.target.value,11),6,150)));
    $('#frame-leading').addEventListener('change',e=>styleChange('leading',clamp(number(e.target.value,1.45),.8,3)));
    $('#frame-align').addEventListener('change',e=>styleChange('align',e.target.value));
    $('#frame-tracking').addEventListener('change',e=>styleChange('tracking',clamp(number(e.target.value,0),-3,12)));
    $('#frame-indent').addEventListener('change',e=>styleChange('indent',clamp(number(e.target.value,0),0,40)));
    $('#frame-hyphenate').addEventListener('change',e=>styleChange('hyphenate',e.target.checked));
    for(const [id,key,min,max,def] of [['frame-word-spacing','wordSpacing',-2,8,0],['frame-paragraph-gap','paragraphGap',0,2,.55]])$('#'+id).addEventListener('change',e=>styleChange(key,clamp(number(e.target.value,def),min,max)));
    for(const [id,key] of [['frame-kerning','kerning'],['frame-pretty','pretty']])$('#'+id).addEventListener('change',e=>styleChange(key,e.target.checked));
    $('#text-style-select').addEventListener('change',e=>applyTextStyle(e.target.value));
    on('#text-style-new',createTextStyle);on('#text-style-update',updateTextStyle);on('#text-style-remove',deleteTextStyle);
    $('#page-master-select').addEventListener('change',e=>mutate(()=>{if(e.target.value)currentPage().masterId=e.target.value;else delete currentPage().masterId;}));
    $('#image-fit').addEventListener('change',e=>{const f=selectedFrame();if(f)mutate(()=>{f.fit=e.target.value==='contain'?'contain':'cover';});});
    document.querySelectorAll('[data-format]').forEach(btn=>btn.addEventListener('mousedown',e=>e.preventDefault()));
    document.querySelectorAll('[data-format]').forEach(btn=>btn.addEventListener('click',()=>{applyFormatting(btn.dataset.format);}));
    $('#paragraph-style').addEventListener('change',e=>{applyFormatting('formatBlock',e.target.value);});
    on('#reflow-btn',()=>attempt(flowSelectedFrame));on('#duplicate-btn',()=>attempt(duplicateFrame));on('#delete-btn',()=>attempt(deleteFrame));
    $('#page-preset').addEventListener('change',e=>{const preset=e.target.value;attempt(()=>mutate(()=>{state.doc.paper.preset=preset;if(PRESETS[preset]){state.doc.paper.width=PRESETS[preset][0];state.doc.paper.height=PRESETS[preset][1];fitColumns();for(const [id,story] of Object.entries(state.doc.stories||{}))if(Book.options(story).bottomNotes)reflowStory(id);}}));});
    for(const key of ['width','height'])$('#page-'+key).addEventListener('change',e=>{attempt(()=>mutate(()=>{state.doc.paper[key]=clamp(measured(number(e.target.value,displayed(state.doc.paper[key]))),50,1000);state.doc.paper.preset='custom';fitColumns();for(const [id,story] of Object.entries(state.doc.stories||{}))if(Book.options(story).bottomNotes)reflowStory(id);}));});
    $('#page-margin').addEventListener('change',e=>{attempt(()=>mutate(()=>{state.doc.paper.margin=clamp(measured(number(e.target.value,displayed(state.doc.paper.margin))),0,Math.min(100,Math.min(state.doc.paper.width,state.doc.paper.height)/2-1));fitColumns();for(const [id,story] of Object.entries(state.doc.stories||{}))if(Book.options(story).bottomNotes)reflowStory(id);}));});
    $('#measurement-units').addEventListener('change',e=>{measurement.unit=e.target.value;render();});
    $('#custom-units-per-inch').addEventListener('change',e=>{measurement.perInch=clamp(number(e.target.value,10),.01,100000);render();});
    $('#nudge-step').addEventListener('change',e=>{measurement.nudge=e.target.value==='unit'?'unit':'pixel';});
    $('#page-columns').addEventListener('change',e=>mutate(()=>{state.doc.paper.columns=clamp(Math.round(number(e.target.value,1)),1,12);fitColumns();}));
    $('#page-gutter').addEventListener('change',e=>mutate(()=>{const maximum=Math.min(25,Math.max(0,(state.doc.paper.width-2*state.doc.paper.margin)/Math.max(1,state.doc.paper.columns||1)));state.doc.paper.gutter=clamp(measured(number(e.target.value,displayed(state.doc.paper.gutter??5))),0,maximum);}));
    $('#show-columns').addEventListener('change',e=>{state.showColumns=e.target.checked;renderStage();});
    $('#show-rulers').addEventListener('change',e=>toggleRulers(e.target.checked));
    $('#snap-columns').addEventListener('change',e=>{state.snapColumns=e.target.checked;});
    $('#show-guides').addEventListener('change',e=>{state.guides=e.target.checked;renderStage();});
    on('#duplicate-page-btn',()=>{if(state.doc.pages.length>=700)return toast('Publication exceeds the 700-page limit.');attempt(()=>mutate(()=>{const dup=clone(currentPage());dup.id=uid();dup.autoStory=undefined;const groups=new Map();dup.frames.forEach(f=>{f.id=uid();if(f.groupId){if(!groups.has(f.groupId))groups.set(f.groupId,'group-'+uid());f.groupId=groups.get(f.groupId);}delete f.storyId;delete f.manualFlow;});delete dup.contents;delete dup.indexPage;delete dup.section;state.doc.pages.splice(state.index+1,0,dup);state.index++;state.selected=null;}));});
    on('#delete-page-btn',()=>{if(currentPage().frames.some(f=>f.locked))return toast('Unlock objects before deleting this page.');if(state.doc.pages.length===1){toast('A publication needs at least one page.');return;}mutate(()=>{const removed=state.doc.pages.splice(state.index,1)[0],stories=new Set(removed.frames.map(f=>f.storyId).filter(Boolean));state.index=Math.min(state.index,state.doc.pages.length-1);state.selected=null;for(const id of stories)if(frameChain(id).length)reflowStory(id);else delete state.doc.stories[id];});});
    document.addEventListener('keydown',e=>{
      const active=document.activeElement;const inText=active?.isContentEditable;const inInput=active&&['INPUT','TEXTAREA','SELECT'].includes(active.tagName);
      if(document.querySelector('dialog[open]'))return;
      if(e.key==='Escape') {if(inInput)return;if(inText)active.blur();else {state.selected=null;render();}return;}
      if(inText || inInput) return;
      const workspaceFocus=active===document.body || active?.id==='canvas-scroll' || active?.classList?.contains('frame') || active?.classList?.contains('layer-item');
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey && selectedFrame() && (!active || active===document.body || active.classList.contains('frame') || active.classList.contains('layer-item'))){
        e.preventDefault();
        const f=selectedFrame();if(selectionLocked())return;const step=measurement.nudge==='unit'?Units.mmPerUnit(measurement.unit,measurement.perInch):Units.mmPerUnit('px');
        const delta=step*(e.shiftKey?10:1), before={x:f.x,y:f.y};
        const xDelta=e.key==='ArrowRight'?delta:e.key==='ArrowLeft'?-delta:0;
        const yDelta=e.key==='ArrowDown'?delta:e.key==='ArrowUp'?-delta:0;
        const picked=selectedObjects(),translation=Publication.translation(picked,state.doc.paper,xDelta,yDelta);
        const nx=f.x+translation.dx,ny=f.y+translation.dy;
        if(nx!==before.x || ny!==before.y){
          if(picked.some(item=>item.storyId||item.type==='image')&& (picked.some(item=>item.storyId)||wrapSignatures(state.doc).size)){
            const focused=active?.classList?.contains('frame')?'frame':active?.classList?.contains('layer-item')?'layer-item':null;
            attempt(()=>mutate(()=>{for(const item of picked){item.x=Number((item.x+translation.dx).toFixed(5));item.y=Number((item.y+translation.dy).toFixed(5));}for(const id of new Set(picked.map(item=>item.storyId).filter(Boolean))){for(const item of picked)if(item.storyId===id&&frameChain(id)[0]?.frame.id!==item.id)item.manualFlow=true;reflowStory(id);}}));
            if(focused)[...document.querySelectorAll('.'+focused)].find(el=>el.dataset.frame===f.id)?.focus({preventScroll:true});return;
          }
          if(!e.repeat || !state.nudgeHistoryOpen)checkpoint();state.nudgeHistoryOpen=true;
          for(const item of picked){item.x=Number((item.x+translation.dx).toFixed(5));item.y=Number((item.y+translation.dy).toFixed(5));const el=[...document.querySelectorAll('.frame')].find(el=>el.dataset.frame===item.id);if(el){el.style.left=item.x*MM*state.zoom+'px';el.style.top=item.y*MM*state.zoom+'px';}}state.dirty=true;
          const thumb=$(`#page-list .page-thumb[data-index="${state.index}"]`);if(thumb)renderThumbnail(thumb,state.index);
          updateHeader();renderInspector();showCoordinates(f);
        }
        return;
      }
      if(workspaceFocus && (e.key==='Delete'||e.key==='Backspace') && !e.ctrlKey && !e.altKey && !e.metaKey){if(selectedFrame()){e.preventDefault();attempt(deleteFrame);}}
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
    if(window.skoshPressAPI?.onMenu)window.skoshPressAPI.onMenu(action=>{if(!SkoshEditorInterface.canUseProjectCommand(document)){if(['undo','redo'].includes(action)&&document.activeElement?.isContentEditable)document.execCommand(action);return;}const commands={new:freshProject,open,save:()=>save(false),saveAs:()=>save(true),import:importManuscript,genealogy:()=>$('#genealogy-dialog').showModal(),font:importFont,templates:()=>$('#templates-btn').click(),find:()=>$('#find-btn').click(),revisions:showRevisions,printlab:openPrintLab,preflight:openPreflight,focus:()=>toggleFocusMode(),export:()=>exportPdf(false),formats:()=>$('#interchange-dialog').showModal(),scribus:()=>exportInterchange('sla'),indesign:()=>exportInterchange('rtf'),settings:openSettings,helpBasics:()=>openHelpDialog('#help-basics-dialog'),helpPrivacy:()=>openHelpDialog('#help-privacy-dialog'),theme:()=>$('#theme-btn').click(),undo:()=>{if(document.activeElement?.isContentEditable)document.execCommand('undo');else undo();},redo:()=>{if(document.activeElement?.isContentEditable)document.execCommand('redo');else redo();}};commands[action]?.();});
  }
  let preferences=loadPreferences();applyPreferences(preferences);
  try{$('#doc-name').value=state.doc.name;bind();render();void restoreRecovery();}catch(error){console.error('Skosh Press startup failed',error);const bar=$('#status-text');if(bar)bar.textContent='Startup error: '+error.message;}
})();
