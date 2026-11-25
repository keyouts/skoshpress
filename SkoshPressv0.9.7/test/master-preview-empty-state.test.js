'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const start=source.indexOf('    function showMasterPlaceholder(svg,lines){');
const end=source.indexOf("    $('#studio-overlay-face').addEventListener('change',renderMasterOverlay);",start);
const functions=source.slice(start,end);

function makeWorkspace({bold=false,light=false,blank=false,brokenInterpolation=false,brokenOverlay=false}={}){
  const elements=new Map();
  function element(){
    return {
      attributes:{},children:[],value:'',checked:true,textContent:'',disabled:false,
      setAttribute(name,value){this.attributes[name]=String(value);},
      replaceChildren(){this.children=[];},
      append(child){this.children.push(child);}
    };
  }
  const $=selector=>{
    if(!elements.has(selector))elements.set(selector,element());
    return elements.get(selector);
  };
  $('#studio-master-weight').value='400';
  $('#studio-overlay-face').value='Bold';
  const regular=blank?[]:[[[30,40],[90,40],[90,130],[30,130]]];
  const other=blank?[]:[[[35,35],[95,35],[95,135],[35,135]]];
  const draft={variants:{...(bold?{Bold:{}}:{}),...(light?{Light:{}}:{})}};
  const Master={
    nameOf:ch=>`${ch} (U+0041)`,
    inspectGlyph:()=>({level:'ok',problems:[]}),
    outline:(_draft,_char,face)=>face==='Regular'?regular:other,
    interpolate:()=>{
      if(brokenInterpolation)throw new Error('Master contours differ.');
      return regular;
    },
    overlay:()=>{
      if(brokenOverlay)throw new Error('Cannot draw these masters.');
      return {regular,other,matches:[],unmatched:[],limited:false,issue:null};
    }
  };
  const VectorFont={path:()=> 'M 30 40 L 90 40 Z'};
  const document={createElementNS:(_namespace,tagName)=>Object.assign(element(),{tagName})};
  const load=new Function('draft','activeKind','activeStyle','currentChar','Master','VectorFont','template','document','$','SVGNS',`${functions}\nreturn {renderMasterPreview,renderMasterOverlay};`);
  const functionsReady=load(draft,'base','Regular','A',Master,VectorFont,()=>regular,document,$,'http://www.w3.org/2000/svg');
  return {...functionsReady,$};
}
function textNodes(svg){return svg.children.filter(node=>node.tagName==='text').map(node=>node.textContent);}
function paths(svg){return svg.children.filter(node=>node.tagName==='path');}

test('new font designs explain missing comparison and interpolated outlines',()=>{
  const ui=makeWorkspace();ui.renderMasterPreview();
  assert.equal(paths(ui.$('#studio-master-regular')).length,1);
  assert.deepEqual(textNodes(ui.$('#studio-master-bold')),['Generate a Bold master','under Font Variations']);
  assert.deepEqual(textNodes(ui.$('#studio-master-interpolated')),['Generate a Bold master','under Font Variations']);
  assert.deepEqual(textNodes(ui.$('#studio-master-overlay')),['Generate a Bold master','under Font Variations']);
  assert.match(ui.$('#studio-master-bold').attributes['aria-label'],/Generate a Bold master/);
  assert.match(ui.$('#studio-master-overlay').attributes['aria-label'],/Overlay unavailable/);
  assert.match(ui.$('#studio-master-preview-message').textContent,/enable interpolation/);
});

test('created masters display paths rather than empty-state explanations',()=>{
  const ui=makeWorkspace({bold:true});ui.renderMasterPreview();
  for(const id of ['studio-master-regular','studio-master-bold','studio-master-interpolated','studio-master-overlay']){
    assert.equal(paths(ui.$('#'+id)).length>0,true,id);
    assert.equal(textNodes(ui.$('#'+id)).length,0,id);
  }
  assert.match(ui.$('#studio-master-preview-message').textContent,/source outlines are compatible/);
});

test('missing selected Light master gives its own overlay guidance',()=>{
  const ui=makeWorkspace({bold:true});ui.$('#studio-overlay-face').value='Light';ui.renderMasterOverlay();
  assert.deepEqual(textNodes(ui.$('#studio-master-overlay')),['Generate a Light master','under Font Variations']);
  assert.match(ui.$('#studio-overlay-summary').textContent,/Generate a Light master/);
});

test('broken interpolation or overlay has a visible error state',()=>{
  const ui=makeWorkspace({bold:true,brokenInterpolation:true,brokenOverlay:true});ui.renderMasterPreview();
  assert.deepEqual(textNodes(ui.$('#studio-master-interpolated')),['Preview unavailable','Check master outlines']);
  assert.deepEqual(textNodes(ui.$('#studio-master-overlay')),['Overlay unavailable','Check master outlines']);
  assert.match(ui.$('#studio-master-preview-message').textContent,/Master contours differ/);
  assert.match(ui.$('#studio-overlay-summary').textContent,/Cannot draw these masters/);
});

test('empty glyphs are explained without presenting them as failed masters',()=>{
  const ui=makeWorkspace({bold:true,blank:true});ui.renderMasterPreview();
  for(const id of ['studio-master-regular','studio-master-bold','studio-master-interpolated','studio-master-overlay']){
    assert.deepEqual(textNodes(ui.$('#'+id)),['No outline for','this glyph']);
  }
});

test('master image names and guidance are exposed to assistive technology',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
  for(const id of ['studio-master-regular','studio-master-interpolated','studio-master-bold']){
    assert.match(html,new RegExp(`<svg id="${id}"[^>]+role="img"[^>]+aria-describedby="studio-master-preview-message"`));
  }
  assert.match(html,/id="studio-master-preview-message"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(html,/id="studio-master-overlay"[^>]+aria-describedby="studio-overlay-help studio-overlay-summary"/);
});
