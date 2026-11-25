'use strict';
(function(root){
  function activeDialog(doc){return [...doc.querySelectorAll('dialog[open]')].at(-1)||null;}
  function createNotices(doc){
    const global=doc.getElementById('toast'),status=doc.getElementById('status-text');
    let timer,visible=null;
    const entries=new Map();
    for(const dialog of doc.querySelectorAll('dialog')){
      const panel=doc.createElement('div');panel.className='dialog-notice';panel.hidden=true;
      const message=doc.createElement('span');message.setAttribute('role','status');message.setAttribute('aria-live','polite');message.setAttribute('aria-atomic','true');
      const dismiss=doc.createElement('button');dismiss.type='button';dismiss.textContent='Dismiss';dismiss.setAttribute('aria-label','Dismiss message');
      panel.append(message,dismiss);dialog.append(panel);const entry={panel,message,dismiss,returnFocus:null};entries.set(dialog,entry);
      dismiss.addEventListener('click',()=>{panel.hidden=true;if(dialog.open){const target=entry.returnFocus;if(target?.isConnected&&dialog.contains(target)&&!target.disabled)target.focus({preventScroll:true});else dialog.querySelector('button:not(.dialog-notice button)')?.focus({preventScroll:true});}});
      dialog.addEventListener('close',()=>{if(!dialog.open){panel.hidden=true;message.textContent='';}});
    }
    function show(value,error=false){
      const text=String(value||'Unexpected error.');clearTimeout(timer);if(visible)visible.hidden=true;
      status.textContent=text;const entry=entries.get(activeDialog(doc));
      if(entry){entry.returnFocus=doc.activeElement;entry.panel.dataset.error=String(error);entry.panel.hidden=false;entry.message.textContent=text;visible=entry.panel;}
      else{global.textContent=text;global.dataset.error=String(error);global.hidden=false;visible=global;}
      if(!error||!entry){const shown=visible;timer=setTimeout(()=>{shown.hidden=true;},error?10000:4200);}
    }
    return {show};
  }
  function bindMore(doc){
    const more=doc.getElementById('project-more'),summary=more.querySelector('summary');
    more.addEventListener('keydown',event=>{if(event.key==='Escape'&&more.open){event.preventDefault();event.stopPropagation();more.open=false;summary.focus();}});
    more.querySelector('.project-more-menu').addEventListener('click',event=>{if(event.target.closest('button')){summary.focus({preventScroll:true});more.open=false;}},true);
    doc.addEventListener('pointerdown',event=>{if(more.open&&!more.contains(event.target))more.open=false;});
  }
  function canUseProjectCommand(doc){return !activeDialog(doc);}
  const api={activeDialog,createNotices,bindMore,canUseProjectCommand};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.SkoshEditorInterface=api;
})(globalThis);
