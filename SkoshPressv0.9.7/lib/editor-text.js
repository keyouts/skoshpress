'use strict';
(()=>{
  function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '').slice(0, 5_000_000);
    const allowed = new Set(['P','H1','H2','H3','STRONG','B','EM','I','U','S','BR','UL','OL','LI','SPAN','DIV','SUP','SUB','SMALL','HR']);
    const blocked = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','META','LINK','VIDEO','AUDIO']);
    const stack=[{node:template.content,exit:false}];
    while(stack.length){
      const {node,exit}=stack.pop();
      if(node.nodeType===Node.COMMENT_NODE){node.remove();continue;}
      if(node.nodeType===Node.ELEMENT_NODE){
        if(blocked.has(node.tagName)){node.remove();continue;}
        if(exit){
          for(const attr of [...node.attributes])node.removeAttribute(attr.name);
          if(!allowed.has(node.tagName)){
            while(node.firstChild)node.before(node.firstChild);
            node.remove();
          }
          continue;
        }
        stack.push({node,exit:true});
      }
      for(let child=node.lastChild;child;child=child.previousSibling)stack.push({node:child,exit:false});
    }
    return template.innerHTML;
  }

  function createTextStats(){
    const cache=new WeakMap();
    return doc=>{
      let words=0,characters=0,frames=0;
      for(const page of doc.pages)for(const frame of page.frames){
        if(frame.type!=='text')continue;
        let entry=cache.get(frame);
        if(!entry||entry.html!==frame.html){
          const el=document.createElement('div');el.innerHTML=sanitizeHtml(frame.html.replace(/<\/(p|h1|h2|h3|li|div)>/gi,' </$1>'));
          const plain=el.textContent||'';entry={html:frame.html,words:(plain.match(/\S+/g)||[]).length,characters:plain.length};cache.set(frame,entry);
        }
        words+=entry.words;characters+=entry.characters;frames++;
      }
      return {words,characters:characters+Math.max(0,frames-1),pages:doc.pages.length};
    };
  }
  window.SkoshEditorText={sanitizeHtml,createTextStats};
})();
