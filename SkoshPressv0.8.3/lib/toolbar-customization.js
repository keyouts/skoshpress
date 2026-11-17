'use strict';
// Toolbar Configuration
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshToolbar=api;
})(typeof window!=='undefined'?window:null,()=>{
  const CATALOG=Object.freeze([
    {id:'text-btn',label:'Text frame',group:'Create',icon:'T+'},
    {id:'image-btn',label:'Place image',group:'Create',icon:'▧'},
    {id:'import-btn',label:'Import manuscript',group:'Create',icon:'↥'},
    {id:'typography-studio-btn',label:'Typography Studio',group:'Create',icon:'✎'},
    {id:'genealogy-btn',label:'Genealogy Studio',group:'Create',icon:'♧'},
    {id:'find-btn',label:'Find & replace',group:'Edit',icon:'⌕'},
    {id:'revisions-btn',label:'Revisions',group:'Edit',icon:'⇄'},
    {id:'preflight-btn',label:'Check document',group:'Edit',icon:'✓'},
    {id:'focus-mode-btn',label:'Focus view',group:'Edit',icon:'◫'},
    {id:'add-page-btn',label:'Add page',group:'Pages',icon:'＋'},
    {id:'single-view-btn',label:'Single page',group:'Pages',icon:'▢'},
    {id:'spread-btn',label:'Facing pages',group:'Pages',icon:'▣'},
    {id:'all-pages-btn',label:'All pages',group:'Pages',icon:'▤'},
    {id:'rulers-btn',label:'Toggle rulers',group:'Pages',icon:'▥'},
    {id:'pdf-btn',label:'Export PDF',group:'Output',icon:'↗'},
    {id:'booklet-btn',label:'Export booklet',group:'Output',icon:'▣'},
    {id:'interchange-btn',label:'More formats',group:'Output',icon:'⇄'},
    {id:'print-lab-btn',label:'Print Studio',group:'Output',icon:'▤'}
  ]);
  const DEFAULT=Object.freeze(['text-btn','image-btn','typography-studio-btn','pdf-btn']);
  const MAX_PINS=8;
  const known=new Set(CATALOG.map(item=>item.id));
  function normalize(value){
    if(!Array.isArray(value))return [...DEFAULT];
    const result=[];
    for(const id of value){if(typeof id==='string'&&known.has(id)&&!result.includes(id))result.push(id);if(result.length===MAX_PINS)break;}
    return result;
  }
  function toggle(value,id){
    if(!known.has(id))return normalize(value);
    const pins=normalize(value);
    if(pins.includes(id))return pins.filter(item=>item!==id);
    if(pins.length===MAX_PINS)throw new Error(`Pin up to ${MAX_PINS} commands.`);
    return [...pins,id];
  }
  function move(value,id,toIndex){
    const pins=normalize(value),at=pins.indexOf(id);
    if(at<0||!Number.isInteger(toIndex)||toIndex<0||toIndex>=pins.length)return pins;
    pins.splice(at,1);pins.splice(toIndex,0,id);return pins;
  }
  return Object.freeze({CATALOG,DEFAULT,MAX_PINS,normalize,toggle,move});
});
