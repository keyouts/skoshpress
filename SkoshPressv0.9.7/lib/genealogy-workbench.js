'use strict';
const {build,yearFrom,dateKey}=require('./genealogy-records');
const {possiblyLiving}=require('./genealogy-records');
const kids=(n,t)=>(n?.children||[]).filter(c=>c.tag===t);
const val=(n,t)=>kids(n,t)[0]?.value||'';
function review(tree,options={}){
  const visible=p=>p&&p.tag==='INDI'&&(options.protectLiving===false||!possiblyLiving(p));
  const counts={},findings=[];
  const add=(kind,detail)=>{counts[kind]=(counts[kind]||0)+1;if(findings.length<100)findings.push({kind,detail});};
  const parents=new Map();
  for(const f of tree.families){
    const adults=['HUSB','WIFE'].map(t=>val(f,t)).filter(Boolean);
    const children=kids(f,'CHIL').map(n=>n.value);
    if(![...adults,...children].some(id=>visible(tree.records.get(id))))continue;
    for(const id of [...adults,...children])if(tree.records.get(id)?.tag!=='INDI')add('Unresolved relationship','A family member reference does not resolve.');
    if(new Set(children).size!==children.length)add('Duplicate child','A family lists the same child more than once.');
    for(const id of children){if(!parents.has(id))parents.set(id,new Set());for(const adult of adults)parents.get(id).add(adult);}
  }
  const checked=new Set(),active=new Set();
  function visit(start){
    const stack=[[start,false]];
    while(stack.length){const [id,exit]=stack.pop();if(exit){active.delete(id);checked.add(id);continue;}
      if(active.has(id)){add('Ancestry cycle','A parent relationship loops back to an ancestor.');continue;}
      if(checked.has(id))continue;active.add(id);stack.push([id,true]);for(const p of parents.get(id)||[])stack.push([p,false]);
    }
  }
  for(const p of tree.persons){if(!visible(p))continue;visit(p.ref);
    const birth=yearFrom(val(kids(p,'BIRT')[0],'DATE')),death=yearFrom(val(kids(p,'DEAT')[0],'DATE'));
    if(birth!==null&&death!==null&&birth>death)add('Date conflict',`Record ${p.ref||'(missing ID)'}: birth year follows death year.`);
    for(const tag of ['FAMC','FAMS'])for(const link of kids(p,tag)){const family=tree.records.get(link.value);if(family?.tag!=='FAM')add('Unresolved family link',`Record ${p.ref||'(missing ID)'}: points to a missing family.`);else if(tag==='FAMC'?!kids(family,'CHIL').some(c=>c.value===p.ref):!['HUSB','WIFE'].some(role=>val(family,role)===p.ref))add('Nonreciprocal family link',`Record ${p.ref||'(missing ID)'}: individual and family disagree on a relationship.`);}
    if(!kids(p,'NAME').length)add('Missing name',`Record ${p.ref||'(missing ID)'}: no name record.`);
    const stack=[p];let cited=false;
    while(stack.length){const n=stack.pop();if(n.tag==='SOUR'){cited=true;if(/^@[^@]+@$/.test(n.value)&&tree.records.get(n.value)?.tag!=='SOUR')add('Unresolved source',`Record ${p.ref||'(missing ID)'}: a citation refers to a missing source.`);}for(const child of n.children)stack.push(child);}
    if(!cited)add('No citations',`Record ${p.ref||'(missing ID)'}: no recorded source citation.`);
  }
  return {counts,findings,importWarnings:tree.warnings.length};
}
function preview(tree,options={}){
  const data=build(tree,{...options,surname:'',includeNotes:false});
  const byId=new Map(data.people.map(p=>[p.id,p]));
  const query=String(options.surname||'').toLocaleLowerCase();
  const candidates=data.people.filter(p=>!query||`${p.name} ${p.id}`.toLocaleLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  const people=candidates.slice(0,200).map(({id,name})=>({id,name}));
  const requested=byId.get(options.rootId);
  const root=requested&&(!query||`${requested.name} ${requested.id}`.toLocaleLowerCase().includes(query))?requested:byId.get(people[0]?.id);
  const mode=['ancestors','descendants','timeline'].includes(options.chartMode)?options.chartMode:'ancestors';
  const depth=Math.max(1,Math.min(5,options.depth||3));
  const rows=[],events=[];let truncated=false;
  if(root&&mode==='timeline'){
    for(const e of data.events.filter(e=>e.personId===root.id||e.relatedPeople?.some(p=>p.id===root.id)).sort((a,b)=>dateKey(a.date)-dateKey(b.date)||a.date.localeCompare(b.date)).slice(0,100))events.push({date:e.date,label:e.label,place:e.place,detail:e.detail,subject:e.personName});
  }else if(root){
    const walk=(p,generation,parent,path)=>{
      if(rows.length>=63){truncated=true;return;}
      const cycle=path.has(p.id),index=rows.length;
      rows.push({id:p.id,name:p.name,generation,parent,cycle,dates:p.events.filter(e=>['BIRT','DEAT'].includes(e.tag)).map(e=>e.date).filter(Boolean).join(' – ')});
      if(cycle||generation>=depth)return;
      const next=new Set(path);next.add(p.id);
      for(const link of mode==='ancestors'?p.parents:p.children){const target=byId.get(link.id);if(target)walk(target,generation+1,index,next);}
    };
    walk(root,0,-1,new Set());
  }
  return {people,totalPeople:candidates.length,root:root?{id:root.id,name:root.name}:null,mode,rows,events,truncated,review:review(tree,options)};
}
function volumeIndex(files){
  const index=new Map();for(const file of files)for(const id of new Set(file.recordIds)){if(!index.has(id))index.set(id,[]);index.get(id).push(file.volume);}
  return [...index].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).map(([recordId,volumes])=>({recordId,volumes}));
}
module.exports={preview,review,volumeIndex};
