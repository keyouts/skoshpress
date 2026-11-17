'use strict';
// GEDCOM Conversion
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.SkoshGEDCOM = api;
})(typeof window !== 'undefined' ? window : null, function () {
  const MAX_CHARACTERS = 12 * 1024 * 1024;
  const MAX_LINES = 350000;
  const escapeHtml = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const text = value => String(value ?? '').trim();
  function child(node, tag) { return (node?.children || []).find(n => n.tag === tag); }
  function children(node, tag) { return (node?.children || []).filter(n => n.tag === tag); }
  function value(node, tag) { return text(child(node, tag)?.value); }
  function noteContent(node, records) {
    if (!node) return '';
    const linked = /^@[^@\s]+@$/.test(node.value) ? records.get(node.value) : null;
    const source = linked || node;
    return text(source.value).replace(/@@/g, '@');
  }
  function lineText(node) {
    let result = String(node?.value || '');
    for (const c of node?.children || []) {
      if (c.tag === 'CONT') result += '\n' + lineText(c);
      else if (c.tag === 'CONC') result += lineText(c);
    }
    return result.replace(/@@/g, '@').trim();
  }
  function displayName(record) {
    const item = child(record, 'NAME');
    if (!item) return '(Unnamed person)';
    const raw = lineText(item).replace(/\//g,'').replace(/\s+/g, ' ').trim();
    return raw || [value(item,'GIVN'),value(item,'SURN')].filter(Boolean).join(' ') || '(Unnamed person)';
  }
  function surname(record) {
    const name = child(record,'NAME');
    if (!name) return '';
    return value(name,'SURN') || (lineText(name).match(/\/([^/]+)\//)?.[1] || '');
  }
  function events(record) {
    const labels = {BIRT:'Born',CHR:'Christened',BAPM:'Baptized',DEAT:'Died',BURI:'Buried',CREM:'Cremated',MARR:'Married',DIV:'Divorced',RESI:'Residence',OCCU:'Occupation',EDUC:'Education',IMMI:'Immigrated',EMIG:'Emigrated',NATU:'Naturalized',PROB:'Probate',WILL:'Will',CENS:'Census',RETI:'Retired',EVEN:'Event',FACT:'Fact'};
    return (record?.children || []).filter(n => Object.prototype.hasOwnProperty.call(labels,n.tag))
      .map(n => ({node:n, label:labels[n.tag],date:value(n,'DATE'),place:lineText(child(n,'PLAC')),detail:lineText(n),note:children(n,'NOTE').map(x=>lineText(x)).filter(Boolean).join('; ')}));
  }
  function yearFrom(date) {
    const match = String(date || '').match(/(?:^|\D)(1[5-9]\d{2}|20\d{2}|21\d{2})(?!\d)/);
    return match ? Number(match[1]) : null;
  }
  function maybeLiving(record, year = new Date().getFullYear()) {
    if (child(record,'DEAT') || child(record,'BURI') || child(record,'CREM')) return false;
    const birth = yearFrom(value(child(record,'BIRT'),'DATE')) || yearFrom(value(child(record,'CHR'),'DATE'));
    // Privacy Estimate
    return birth === null || birth > year - 115;
  }
  function parse(source) {
    const input = String(source ?? '').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
    if (!input || input.length > MAX_CHARACTERS) throw Error('GEDCOM must be a nonempty file smaller than 12 MB of text.');
    const lines = input.split('\n');
    if (lines.length > MAX_LINES) throw Error('GEDCOM has too many lines for the local import limit.');
    const roots = [], records = new Map(), warnings = [], parents = [];
    let lineNumber = 0;
    for (const raw of lines) {
      lineNumber++;
      if (!raw.trim()) continue;
      const match = raw.match(/^(\d{1,3})\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/);
      if (!match) { if (warnings.length < 25) warnings.push(`Skipped malformed line ${lineNumber}.`); continue; }
      const level = Number(match[1]);
      const node = {tag:match[3].toUpperCase(),ref:match[2] || null,value:match[4] || '',children:[]};
      if (level === 0) {
        roots.push(node);parents.length = 0;parents[0] = node;
        if (node.ref) {
          if (records.has(node.ref)) throw Error(`Duplicate GEDCOM identifier ${node.ref} at line ${lineNumber}.`);
          records.set(node.ref,node);
        }
      } else {
        const parent = parents[level-1];
        if (!parent) { if(warnings.length < 25)warnings.push(`Orphan GEDCOM line ${lineNumber}.`);continue; }
        parent.children.push(node);parents[level]=node;parents.length=level+1;
      }
    }
    if (!roots.some(n => n.tag === 'HEAD') || !roots.some(n => n.tag === 'TRLR'))
      throw Error('This file does not appear to be a complete GEDCOM export (HEAD/TRLR missing).');
    const gedc = child(roots.find(n=>n.tag==='HEAD'),'GEDC');
    const version = value(gedc,'VERS') || 'unknown';
    const persons = roots.filter(n => n.tag === 'INDI');
    const families = roots.filter(n => n.tag === 'FAM');
    if (!persons.length && !families.length) throw Error('No individual or family records were found in the GEDCOM file.');
    if (version !== 'unknown' && !/^(?:5\.5(?:\.1)?|7\.\d+)(?:$|\s)/.test(version)) warnings.push('GEDCOM version '+version+' may use structures this experimental importer does not understand.');
    return {persons,families,records,version,warnings,stats:{people:persons.length,families:families.length,sources:roots.filter(n=>n.tag==='SOUR').length,notes:roots.filter(n=>n.tag==='NOTE').length}};
  }
  function personById(tree,id) {const node=tree.records.get(id);return node?.tag==='INDI'?node:null;}
  function recordSources(node, tree) {
    return children(node,'SOUR').map(source => {
      const linked = tree.records.get(source.value);
      const title=linked?(value(linked,'TITL') || value(linked,'ABBR') || linked.value || source.value):lineText(source);
      const author=linked?value(linked,'AUTH'):'';
      const publication=linked?value(linked,'PUBL'):'';
      const page=value(source,'PAGE');
      const qualifier=value(source,'QUAY');
      return [title, author&&('Author: '+author),publication&&('Publication: '+publication),page&&('Page/detail: '+page),qualifier&&('Quality: '+qualifier)].filter(Boolean).join(' — ');
    }).filter(Boolean);
  }
  function format(tree, options={}) {
    if (!tree?.persons || !tree?.records) throw Error('Import a GEDCOM file before creating a report.');
    const mode=options.mode==='families'?'families':'profiles';
    const includeSources=options.includeSources!==false;
    const protectLiving=options.protectLiving!==false;
    const includeNotes=options.includeNotes===true;
    const filter=text(options.surname).toLocaleLowerCase();
    const requested=Math.floor(Number(options.limit ?? 40));
    if (!Number.isFinite(requested)||requested<1||requested>200) throw Error('Choose between 1 and 200 entries per report.');
    const visible=node => !!node && (!protectLiving || !maybeLiving(node));
    const title=text(options.title).slice(0,140)||'Family History Research';
    const citeMap=new Map(), orderedCitations=[];
    function citationRefs(nodes) {
      if(!includeSources)return '';
      const sources=nodes.flatMap(n=>recordSources(n,tree));
      const numbers=[];
      for(const s of sources){if(!citeMap.has(s)){citeMap.set(s,citeMap.size+1);orderedCitations.push(s);}numbers.push(citeMap.get(s));}
      return [...new Set(numbers)].map(n=>` <strong>[${n}]</strong>`).join('');
    }
    function name(record) {return !record?'[Not recorded]':visible(record)?escapeHtml(displayName(record)):'[Private / possibly living]';}
    function namedIds(ids) {return ids.map(id=>personById(tree,id)).filter(visible).map(p=>escapeHtml(displayName(p)));}
    function renderEvent(event) {
      const parts=[event.date, event.place].filter(Boolean).join(' · ');
      const extra=event.detail && !['Y','N'].includes(event.detail)?event.detail:'';
      const e=[parts,extra,includeNotes?event.note:''].filter(Boolean).join('; ');
      return `<p><strong>${escapeHtml(event.label)}:</strong> ${escapeHtml(e || 'Recorded without further detail')}${citationRefs([event.node])}</p>`;
    }
    function renderNotes(record) {
      return children(record,'NOTE').map(n=>{
        const payload = /^@[^@\s]+@$/.test(n.value) ? tree.records.get(n.value) : n;
        return lineText(payload || n);
      }).filter(Boolean).map(n=>`<p><strong>Research note:</strong> ${escapeHtml(n)}</p>`).join('');
    }
    function findRelatives(person) {
      const familyAsChild = tree.families.filter(f=>children(f,'CHIL').some(c=>c.value===person.ref));
      const familyAsParent = tree.families.filter(f=>value(f,'HUSB')===person.ref||value(f,'WIFE')===person.ref);
      const parents=[...new Set(familyAsChild.flatMap(f=>[value(f,'HUSB'),value(f,'WIFE')]).filter(Boolean))];
      const spouses=[...new Set(familyAsParent.map(f=>value(f,'HUSB')===person.ref?value(f,'WIFE'):value(f,'HUSB')).filter(Boolean))];
      const childrenIds=[...new Set(familyAsParent.flatMap(f=>children(f,'CHIL').map(n=>n.value)))];
      return {parents,spouses,childrenIds};
    }
    const byName=(a,b)=>displayName(a).localeCompare(displayName(b),undefined,{sensitivity:'base',numeric:true});
    let candidates=[];
    if(mode==='profiles'){
      candidates=tree.persons.filter(visible).filter(p=>!filter||surname(p).toLocaleLowerCase().includes(filter)).sort(byName);
    } else {
      candidates=tree.families.filter(f=>{
        const main=[personById(tree,value(f,'HUSB')),personById(tree,value(f,'WIFE'))];
        return main.some(visible) && main.filter(Boolean).every(visible) && (!filter||main.some(p=>p&&surname(p).toLocaleLowerCase().includes(filter)));
      }).sort((a,b)=>{
        const aName=displayName(personById(tree,value(a,'HUSB'))||personById(tree,value(a,'WIFE')));
        const bName=displayName(personById(tree,value(b,'HUSB'))||personById(tree,value(b,'WIFE')));
        return aName.localeCompare(bName,undefined,{sensitivity:'base'});
      });
    }
    const total=candidates.length;
    const selected=candidates.slice(0,requested);
    if(!selected.length)throw Error('No records match this filter and privacy setting. Try a different surname or report option.');
    const fragments=[`<h1>${escapeHtml(title)}</h1>`,`<p>${mode==='profiles'?'Biographical profiles':'Family-group sheets'} · ${selected.length} of ${total} matching entries · GEDCOM ${escapeHtml(tree.version)}</p>`,
      '<p><em>Working research draft. Verify dates, relationships, citations, and living-person consent before publication.</em></p>'];
    if(mode==='profiles'){
      for(const person of selected){
        fragments.push(`<h2>${name(person)}</h2>`);
        const relatives=findRelatives(person);
        for(const [label,ids] of [['Parents',relatives.parents],['Spouses/partners',relatives.spouses],['Children',relatives.childrenIds]]){
          const names=namedIds(ids);if(names.length)fragments.push(`<p><strong>${label}:</strong> ${names.join('; ')}</p>`);
        }
        for(const e of events(person))fragments.push(renderEvent(e));
        if(includeNotes)fragments.push(renderNotes(person));
        const notes=citationRefs([person]);if(notes)fragments.push(`<p><strong>Person sources:</strong>${notes}</p>`);
      }
    }else{
      for(const family of selected){
        const husband=personById(tree,value(family,'HUSB'));
        const wife=personById(tree,value(family,'WIFE'));
        fragments.push(`<h2>${name(husband)} &amp; ${name(wife)}</h2>`);
        const partners=[husband,wife].filter(visible);
        for(const person of partners){
          const summarised=events(person).filter(e=>['Born','Died','Buried','Occupation'].includes(e.label));
          fragments.push(`<p><strong>${name(person)}:</strong> ${summarised.map(e=>escapeHtml([e.label,e.date,e.place].filter(Boolean).join(' '))+citationRefs([e.node])).join('; ')||'See original record'}${citationRefs([person])}</p>`);
        }
        for(const e of events(family))fragments.push(renderEvent(e));
        const kids=namedIds(children(family,'CHIL').map(n=>n.value));
        fragments.push(`<p><strong>Children:</strong> ${kids.length?kids.join('; '):'None listed for publication'}</p>`);
        if(includeNotes)fragments.push(renderNotes(family));
        const sources=citationRefs([family]);if(sources)fragments.push(`<p><strong>Family sources:</strong>${sources}</p>`);
      }
    }
    if(orderedCitations.length){
      fragments.push('<h2>Source references</h2>');
      orderedCitations.forEach((citation,i)=>fragments.push(`<p>[${i+1}] ${escapeHtml(citation)}</p>`));
    }
    return {html:fragments.filter(Boolean).join('\n'),title,count:selected.length,total,
      citations:orderedCitations.length,mode,privateExcluded:protectLiving};
  }
  return Object.freeze({parse,format,maybeLiving,displayName,surname,events});
});
