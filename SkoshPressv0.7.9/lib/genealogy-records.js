'use strict';
// Genealogy Conversion
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.SkoshGenealogyRecords = api;
})(typeof window !== 'undefined' ? window : null, function () {
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const txt = v => String(v ?? '').trim();
  const kids = (node, tag) => (node?.children || []).filter(n => n.tag === tag);
  const one = (node, tag) => kids(node, tag)[0] || null;
  function full(node) {
    if (!node) return '';
    let s = String(node.value ?? '');
    for (const n of node.children || []) {
      if (n.tag === 'CONT') s += '\n' + full(n);
      if (n.tag === 'CONC') s += full(n);
    }
    return s.replace(/@@/g,'@').trim();
  }
  const val = (node, tag) => full(one(node,tag));
  function name(person) {
    const n = one(person,'NAME');
    const original = full(n).replace(/\//g,'').replace(/\s+/g,' ').trim();
    return original || [val(n,'GIVN'),val(n,'SURN')].filter(Boolean).join(' ') || '(Unnamed person)';
  }
  const surname = person => val(one(person,'NAME'),'SURN') || (full(one(person,'NAME')).match(/\/([^/]+)\//)?.[1] || '');
  const idOf = node => node?.ref || '(no GEDCOM ID)';
  const sortText = (a,b) => String(a).localeCompare(String(b),undefined,{sensitivity:'base',numeric:true});
  function yearFrom(date) {
    const m = String(date || '').match(/(?:^|\D)(1[0-9]{3}|20\d{2}|21\d{2})(?!\d)/);
    return m ? Number(m[1]) : null;
  }
  function possiblyLiving(person, presentYear = new Date().getFullYear()) {
    if (one(person,'DEAT') || one(person,'BURI') || one(person,'CREM')) return false;
    const year = yearFrom(val(one(person,'BIRT'),'DATE')) ?? yearFrom(val(one(person,'CHR'),'DATE'));
    return year === null || year > presentYear-115;
  }
  const EVENT_LABELS = Object.freeze({BIRT:'Birth',CHR:'Christening',BAPM:'Baptism',DEAT:'Death',BURI:'Burial',CREM:'Cremation',ADOP:'Adoption',MARR:'Marriage',DIV:'Divorce',ENGA:'Engagement',MARB:'Marriage banns',MARL:'Marriage license',ANUL:'Annulment',SEPA:'Separation',RESI:'Residence',OCCU:'Occupation',EDUC:'Education',RELI:'Religion',TITL:'Title',IMMI:'Immigration',EMIG:'Emigration',NATU:'Naturalization',PROB:'Probate',WILL:'Will',CENS:'Census',RETI:'Retirement',GRAD:'Graduation',EVEN:'Event',FACT:'Fact',DSCR:'Description',NATI:'Nationality',CAST:'Caste',IDNO:'ID number',SSN:'Social Security number'});
  // Sensitive Fields
  const PRIVATE_TAGS = new Set(['SSN','IDNO']);
  function safeEvents(node) {
    return (node?.children || []).filter(n => Object.hasOwn(EVENT_LABELS,n.tag) && !PRIVATE_TAGS.has(n.tag)).map(n=>({
      tag:n.tag, label:n.tag==='EVEN'||n.tag==='FACT' ? (val(n,'TYPE') || EVENT_LABELS[n.tag]) : EVENT_LABELS[n.tag],
      date:val(n,'DATE'),place:val(n,'PLAC'),detail:!['Y','N'].includes(full(n))?full(n):'',
      note:kids(n,'NOTE').filter(n=>!/^@[^@]+@$/.test(n.value)).map(full).join('; '),node:n
    }));
  }
  function noteText(node, tree) {
    const target = /^@[^@\s]+@$/.test(node?.value || '') ? tree.records.get(node.value) : node;
    return full(target || node);
  }
  function sourceReference(node,tree) {
    const source = tree.records.get(node.value);
    const root = source?.tag==='SOUR' ? source : null;
    const title = root ? (val(root,'TITL') || val(root,'ABBR') || root.value || node.value) : (full(node) || '(Source not identified)');
    const information = [title, val(root,'AUTH') && `Author: ${val(root,'AUTH')}`,val(root,'PUBL') && `Publication: ${val(root,'PUBL')}`,
      val(root,'REPO') && `Repository: ${val(root,'REPO')}`,val(node,'PAGE') && `Detail: ${val(node,'PAGE')}`,
      val(node,'QUAY') && `Quality code: ${val(node,'QUAY')}`,
      val(one(node,'DATA'),'DATE') && `Access/date: ${val(one(node,'DATA'),'DATE')}`,
      val(one(node,'DATA'),'TEXT') && `Extract: ${val(one(node,'DATA'),'TEXT')}`,
      val(node,'TEXT') && `Quotation: ${val(node,'TEXT')}`].filter(Boolean);
    return {ref:node.value || '', title, label:information.join(' — ')};
  }
  function citationsFor(node,tree) {return kids(node,'SOUR').map(n=>sourceReference(n,tree));}
  function build(tree, options={}) {
    if(!tree || !Array.isArray(tree.persons) || !Array.isArray(tree.families) || !(tree.records instanceof Map))
      throw Error('Import a GEDCOM file first.');
    const protectLiving=options.protectLiving!==false;
    const includeNotes=options.includeNotes===true;
    const filter=txt(options.surname).toLocaleLowerCase();
    const visible = p => !!p && (!protectLiving || !possiblyLiving(p));
    const peopleById = new Map(tree.persons.filter(p=>p.ref).map(p=>[p.ref,p]));
    const parentFamilies=new Map(),partnerFamilies=new Map();
    function attach(map,key,f){ if(!key)return; if(!map.has(key))map.set(key,[]);map.get(key).push(f); }
    for(const f of tree.families){
      for(const n of kids(f,'CHIL'))attach(parentFamilies,n.value,f);
      for(const role of ['HUSB','WIFE'])attach(partnerFamilies,val(f,role),f);
    }
    function refs(nodes) {return nodes.flatMap(n=>citationsFor(n,tree));}
    const allPeople=tree.persons.filter(visible);
    const persons=allPeople.filter(p=>!filter||surname(p).toLocaleLowerCase().includes(filter));
    const chosenIds = new Set(persons.map(p=>p.ref));
    const link = id => {const person=peopleById.get(id);return visible(person) ? {id,name:name(person)} : null;};
    const personRecords=persons.map(person=>{
      const childhood=parentFamilies.get(person.ref)||[],adulthood=partnerFamilies.get(person.ref)||[];
      const parentIds=childhood.flatMap(f=>[val(f,'HUSB'),val(f,'WIFE')]);
      const spouseIds=adulthood.map(f=>val(f,'HUSB')===person.ref ? val(f,'WIFE') : val(f,'HUSB'));
      const childIds=adulthood.flatMap(f=>kids(f,'CHIL').map(c=>c.value));
      const uniques=ids=>[...new Set(ids.filter(Boolean))].map(link).filter(Boolean);
      const events=safeEvents(person);
      const notes=includeNotes?kids(person,'NOTE').map(n=>noteText(n,tree)).filter(Boolean):[];
      return {id:idOf(person),name:name(person),surname:surname(person),sex:val(person,'SEX'),
        events,parents:uniques(parentIds),spouses:uniques(spouseIds),children:uniques(childIds),
        citations:refs([person,...events.map(e=>e.node)]),notes,original:person};
    });
    // Family Privacy
    const familyRecords=tree.families.filter(f=>{
      const adults=[val(f,'HUSB'),val(f,'WIFE')].filter(Boolean);
      const memberIds=[...adults,...kids(f,'CHIL').map(c=>c.value)];
      return memberIds.some(id=>chosenIds.has(id)) && adults.every(id=>visible(peopleById.get(id)));
    }).map(f=>{
      const people=['HUSB','WIFE'].map(role=>link(val(f,role))).filter(Boolean);
      const children=kids(f,'CHIL').map(c=>link(c.value)).filter(Boolean);
      const events=safeEvents(f);
      return {id:idOf(f),people,children,events,notes:includeNotes?kids(f,'NOTE').map(n=>noteText(n,tree)).filter(Boolean):[],
        citations:refs([f,...events.map(e=>e.node)]),original:f};
    });
    const individualEvents=personRecords.flatMap(p=>p.events.map(e=>({...e,recordType:'individual',personId:p.id,personName:p.name,citations:citationsFor(e.node,tree)})));
    const familyEvents=familyRecords.flatMap(f=>f.events.map(e=>({...e,recordType:'family',personId:f.id,
      personName:'Family of '+(f.people.map(p=>p.name).join(' & ') || f.id),citations:citationsFor(e.node,tree),
      relatedPeople:[...f.people,...f.children]})));
    const events=[...individualEvents,...familyEvents];
    const places=new Map();
    for(const e of events){if(!e.place)continue;
      const key=e.place.toLocaleLowerCase();
      if(!places.has(key))places.set(key,{place:e.place,records:new Map(),events:0});
      const place=places.get(key);place.events++;
      const subjects=e.recordType==='family'?e.relatedPeople:[{id:e.personId,name:e.personName}];
      for(const subject of subjects)place.records.set(subject.id,subject.name);
    }
    const placeRecords=[...places.values()].map(p=>({place:p.place,events:p.events,people:[...p.records].map(([id,name])=>({id,name}))})).sort((a,b)=>sortText(a.place,b.place));
    const allCitations=[...personRecords.flatMap(p=>p.citations),...familyRecords.flatMap(f=>f.citations)];
    const sources=new Map();
    for(const s of allCitations){const key=s.label;
      if(!sources.has(key))sources.set(key,{...s,uses:0});sources.get(key).uses++;
    }
    return {people:personRecords,families:familyRecords,events,places:placeRecords,sources:[...sources.values()],
      excludedLiving:tree.persons.length-allPeople.length,filter,protectLiving,includeNotes,version:tree.version||'unknown'};
  }
  const asName = p => `${p.name} (${p.id})`;
  const asRefs = people => people.length ? people.map(asName).join('; ') : 'Not listed';
  // Batch Ordering
  function selection(tree,options={}) {
    const mode = ['register','families','timeline','places','sources'].includes(options.mode) ? options.mode : 'register';
    const dataset=build(tree,options);
    let collection = mode==='register'?dataset.people:mode==='families'?dataset.families:mode==='timeline'?dataset.events:mode==='places'?dataset.places:dataset.sources;
    if(mode==='register')collection=[...collection].sort((a,b)=>sortText(a.surname,b.surname)||sortText(a.name,b.name)||sortText(a.id,b.id));
    if(mode==='families')collection=[...collection].sort((a,b)=>sortText(a.people[0]?.name||'',b.people[0]?.name||'')||sortText(a.id,b.id));
    if(mode==='timeline')collection=[...collection].sort((a,b)=>(yearFrom(a.date)??Infinity)-(yearFrom(b.date)??Infinity)||sortText(a.date,b.date)||sortText(a.personName,b.personName));
    if(mode==='sources')collection=[...collection].sort((a,b)=>sortText(a.title,b.title));
    if(!collection.length)throw Error('No publishable records match these options and privacy settings.');
    return {mode,dataset,collection};
  }
  function entryReference(entry,mode) {
    if(mode==='register'||mode==='families')return entry.id;
    if(mode==='timeline')return entry.personId;
    if(mode==='sources')return entry.ref || '(inline citation)';
    return entry.place;
  }
  function batchPlan(tree,options={},volumeSize=100) {
    if(!Number.isSafeInteger(volumeSize)||volumeSize<1||volumeSize>200)throw Error('Choose 1–200 entries per volume.');
    const {mode,collection}=selection(tree,options);
    const count=Math.ceil(collection.length/volumeSize);
    if(count>150)throw Error('More than 150 volumes would be needed; narrow the filter or choose larger volumes.');
    const volumes=[];
    for(let start=0;start<collection.length;start+=volumeSize){
      const slice=collection.slice(start,start+volumeSize);
      volumes.push({number:volumes.length+1,start,end:start+slice.length,
        recordIds:slice.map(e=>entryReference(e,mode))});
    }
    return {mode,total:collection.length,volumeSize,volumes};
  }
  function publication(tree, options={}) {
    const {mode,dataset,collection}=selection(tree,options);
    const limit=Number(options.limit ?? 40);
    if(!Number.isSafeInteger(limit) || limit<1 || limit>200)throw Error('Choose between 1 and 200 entries per report.');
    const offset=options.offset ?? 0;
    if(!Number.isSafeInteger(offset)||offset<0||offset>=collection.length)throw Error('Invalid publication entry offset.');
    const density=options.density==='detailed'?'detailed':'compact';
    const title=txt(options.title).slice(0,140)||'Genealogical Research Register';
    const includeSources=options.includeSources!==false;
    const includeSurnameIndex=options.surnameIndex===true;
    const includePlaceIndex=options.placeIndex===true;
    const chosen=collection.slice(offset,offset+limit);
    const citemap=new Map(),citationList=[];
    const cite = sources => {
      if(!includeSources)return '';
      const numbers=[];
      for(const item of sources||[]){
        if(!citemap.has(item.label)){citemap.set(item.label,citemap.size+1);citationList.push(item);}
        numbers.push(citemap.get(item.label));
      }
      return numbers.length ? ' '+[...new Set(numbers)].map(x=>`[${x}]`).join(', ') : '';
    };
    const out=[`<h1>${esc(title)}</h1>`,
      `<p><strong>${esc({register:'Individual record register',families:'Family-group register',timeline:'Chronological event register',places:'Place gazetteer',sources:'Cited source inventory'}[mode])}</strong> · entries ${offset+1}–${offset+chosen.length} of ${collection.length} · GEDCOM ${esc(dataset.version)}</p>`,
      '<p><em>Research compilation. Dates are reproduced as supplied; names, relationships, citations and privacy status require review before deposit or publication.</em></p>'];
    const p = (label,value) => {if(txt(value))out.push(`<p><strong>${esc(label)}:</strong> ${esc(value)}</p>`);};
    if(mode==='register')for(const person of chosen){
      out.push(`<h2>${esc(person.name)} [${esc(person.id)}]</h2>`);
      p('Record ID',person.id);p('Surname',person.surname);p('Sex (as recorded)',person.sex);
      p('Parents',asRefs(person.parents));p('Spouses / partners',asRefs(person.spouses));p('Children',asRefs(person.children));
      if(density==='compact'){
        for(const e of person.events){
          const details=[e.date,e.place,e.detail].filter(Boolean).join(' · ');
          out.push(`<p><strong>${esc(e.label)}:</strong> ${esc(details||'Recorded')}${esc(cite(citationsFor(e.node,tree)))}</p>`);
        }
      }else{
        for(const e of person.events){
          out.push(`<h3>${esc(e.label)}</h3>`);
          p('Date (verbatim)',e.date);p('Place (verbatim)',e.place);p('Value',e.detail);
          if(dataset.includeNotes)p('Event note',e.note);
          const citations=cite(citationsFor(e.node,tree));if(citations)p('Evidence references',citations);
        }
      }
      if(dataset.includeNotes)for(const note of person.notes)p('Research note',note);
      const direct=cite(citationsFor(person.original,tree));if(direct)p('Person citations',direct);
    }
    if(mode==='families')for(const family of chosen){
      out.push(`<h2>Family [${esc(family.id)}]</h2>`);
      p('Partners',asRefs(family.people));p('Children',asRefs(family.children));
      for(const event of family.events){
        const detail=[event.date,event.place,event.detail].filter(Boolean).join(' · ');
        out.push(`<p><strong>${esc(event.label)}:</strong> ${esc(detail||'Recorded')}${esc(cite(citationsFor(event.node,tree)))}</p>`);
        if(density==='detailed'&&dataset.includeNotes)p('Event note',event.note);
      }
      if(dataset.includeNotes)for(const note of family.notes)p('Research note',note);
      const direct=cite(citationsFor(family.original,tree));if(direct)p('Family citations',direct);
    }
    if(mode==='timeline')for(const e of chosen){
      out.push(`<p><strong>${esc(e.date||'[Undated]')} — ${esc(e.label)}:</strong> ${esc(e.personName)} [${esc(e.personId)}]${e.place?' · '+esc(e.place):''}${e.detail?' · '+esc(e.detail):''}${esc(cite(e.citations))}</p>`);
    }
    if(mode==='places')for(const place of chosen){
      out.push(`<h2>${esc(place.place)}</h2>`);
      p('Occurrences in selected individual events',place.events);
      p('Persons (GEDCOM references)',asRefs(place.people));
    }
    if(mode==='sources')for(const source of chosen){
      out.push(`<p><strong>${esc(source.title)}</strong> — ${esc(source.label)} (references: ${source.uses})</p>`);
    }
    // Stable Indices
    const chosenPersonIds=mode==='register' ? new Set(chosen.map(p=>p.id))
      : mode==='families' ? new Set(chosen.flatMap(f=>[...f.people,...f.children].map(p=>p.id)))
      : mode==='timeline' ? new Set(chosen.flatMap(e=>e.recordType==='family' ? e.relatedPeople.map(p=>p.id) : [e.personId]))
      : new Set();
    if(includeSurnameIndex && (mode==='register'||mode==='families'||mode==='timeline')){
      const names=new Map();
      for(const person of dataset.people.filter(p=>chosenPersonIds.has(p.id))){
        const key=person.surname||'(No surname recorded)';
        if(!names.has(key))names.set(key,[]);
        names.get(key).push(person);
      }
      out.push('<h2>Surname index (GEDCOM identifiers)</h2>');
      for(const [surname,people] of [...names].sort((a,b)=>sortText(a[0],b[0])))
        out.push(`<p><strong>${esc(surname)}:</strong> ${esc(people.map(asName).join('; '))}</p>`);
    }
    if(includePlaceIndex && (mode==='register'||mode==='families'||mode==='timeline')){
      const allowed=chosenPersonIds;
      out.push('<h2>Place index (GEDCOM identifiers)</h2>');
      for(const place of dataset.places){
        const people=place.people.filter(p=>allowed.has(p.id));
        if(people.length)out.push(`<p><strong>${esc(place.place)}:</strong> ${esc(asRefs(people))}</p>`);
      }
    }
    if(includeSources && citationList.length){
      out.push('<h2>Source citation inventory</h2>');
      citationList.forEach((source,i)=>out.push(`<p>[${i+1}] ${esc(source.label)}${source.ref?' ('+esc(source.ref)+')':''}</p>`));
    }
    return {html:out.join('\n'),title,mode,count:chosen.length,total:collection.length,citations:citationList.length,
      offset,recordIds:chosen.map(e=>entryReference(e,mode)),excludedLiving:dataset.excludedLiving};
  }
  const HEADERS=Object.freeze({
    people:['record_id','name','surname','sex','birth_date_raw','birth_place_raw','death_date_raw','death_place_raw','parent_record_ids','spouse_record_ids','child_record_ids','source_count'],
    events:['record_type','record_id','subject','event_type','date_raw','place_raw','detail','source_count'],
    families:['family_id','partner_ids','partner_names','child_ids','child_names','event_summary','source_count'],
    places:['place_raw','event_count','person_ids','person_names'],
    sources:['source_record_id','source_title','citation_detail','reference_count']
  });
  // Spreadsheet Safety
  function cell(v){
    let value=String(v ?? '');
    if (/^[\s\x00-\x1F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]*[=+\-@]/u.test(value))value="'"+value;
    return '"'+value.replace(/"/g,'""')+'"';
  }
  function exportCsv(tree,options={}) {
    const type=Object.hasOwn(HEADERS,options.type)?options.type:'people';
    const data=build(tree,options);
    const birth=p=>p.events.find(e=>e.tag==='BIRT')||{};
    const death=p=>p.events.find(e=>e.tag==='DEAT')||{};
    const rows = type==='people'?data.people.map(p=>[p.id,p.name,p.surname,p.sex,birth(p).date,birth(p).place,death(p).date,death(p).place,p.parents.map(x=>x.id).join('; '),p.spouses.map(x=>x.id).join('; '),p.children.map(x=>x.id).join('; '),p.citations.length])
      :type==='events'?data.events.map(e=>[e.recordType,e.personId,e.personName,e.label,e.date,e.place,e.detail,e.citations.length])
      :type==='families'?data.families.map(f=>[f.id,f.people.map(x=>x.id).join('; '),f.people.map(x=>x.name).join('; '),f.children.map(x=>x.id).join('; '),f.children.map(x=>x.name).join('; '),f.events.map(e=>[e.label,e.date,e.place].filter(Boolean).join(' ')).join('; '),f.citations.length])
      :type==='places'?data.places.map(p=>[p.place,p.events,p.people.map(x=>x.id).join('; '),p.people.map(x=>x.name).join('; ')])
      :data.sources.map(s=>[s.ref,s.title,s.label,s.uses]);
    const contents='\uFEFF'+[HEADERS[type].map(cell).join(','),...rows.map(row=>row.map(cell).join(','))].join('\r\n')+'\r\n';
    if(new TextEncoder().encode(contents).byteLength>16*1024*1024)throw Error('CSV output exceeds the 16 MB export limit. Narrow the surname filter.');
    return {type,count:rows.length,csv:contents};
  }
  return Object.freeze({build,publication,batchPlan,exportCsv,possiblyLiving,yearFrom});
});
