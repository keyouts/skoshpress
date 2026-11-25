'use strict';
const {performance}=require('node:perf_hooks');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const History=require('../lib/editor-history');
const {normalizeProject}=require('../lib/projects');
const src='data:image/png;base64,'+readFileSync(path.join(__dirname,'../assets/SkoshPressIcon.png')).toString('base64');
const doc=normalizeProject({format:'skosh-press-1',name:'Repeated artwork benchmark',paper:{width:148,height:210,margin:16},pages:Array.from({length:80},(_,i)=>({id:'page-'+i,frames:[{type:'image',id:'image-'+i,label:'Repeated artwork',src,x:10,y:10,w:80,h:80},{type:'text',id:'text-'+i,label:'Caption',x:10,y:95,w:80,h:20,html:'<p>Page '+(i+1)+'</p>',style:{font:'Georgia, serif',fontSize:11,leading:1.45}}]}))});
const state={doc,index:79,selected:null,dirty:false,undo:[],redo:[]},history=History.create();
function memory(){if(global.gc)global.gc();const {heapUsed,rss}=process.memoryUsage();return {heapBytes:heapUsed,rssBytes:rss};}
const expandedBytes=Buffer.byteLength(JSON.stringify(doc)),before=memory(),start=performance.now();
for(let i=0;i<12;i++)history.transaction(state,()=>{state.doc.pages[79].frames[0].x+=1;},()=>{});
const milliseconds=performance.now()-start,after=memory(),entries=state.undo.length,retainedBytes=history.bytes?history.bytes(state.undo):state.undo.reduce((total,e)=>total+e.size,0);
let undoCount=0;while(history.travel(state,'undo'))undoCount++;
let redoCount=0;while(history.travel(state,'redo'))redoCount++;
const compact=process.env.SKOSH_LEGACY_BENCHMARK==='1'?null:Buffer.byteLength(require('../lib/compact-project').encode(doc));
console.log(JSON.stringify({pages:80,edits:12,expandedBytes,compactBytes:compact,entries,retainedBytes,milliseconds:Math.round(milliseconds),before,after,undoCount,redoCount},null,2));
