'use strict';
const {createHash}=require('node:crypto');
const {normalizeProject,MAX_PROJECT_BYTES}=require('./projects');
const {inventory}=require('./project-workspace');
const {makeZip}=require('./publishing-exports');
const {readPackageEntries,MAX_BYTES}=require('./package-reader');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function* assetEntries(doc){
  const assets=inventory(doc);
  if(assets.images.length+assets.fonts.length>1997)throw Error('Too many assets for one publication package.');
  for(const [i,row] of assets.images.entries()){
    const match=/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(row.src);
    if(!match)throw Error('Invalid packaged image.');
    yield {name:`images/image-${i+1}.${match[1]==='jpeg'?'jpg':match[1]}`,content:Buffer.from(match[2],'base64'),details:{label:row.name,pages:row.pages,uses:row.uses}};
  }
  for(const [i,row] of assets.fonts.entries()){
    const match=/^data:font\/(ttf|otf|woff2?);base64,(.+)$/.exec(row.data);
    if(!match)throw Error('Invalid packaged font.');
    yield {name:`fonts/font-${i+1}.${match[1]}`,content:Buffer.from(match[2],'base64'),details:{label:row.name,ids:row.ids}};
  }
}
function packageEntries(input){
  const raw=JSON.stringify(input);
  if(!raw||Buffer.byteLength(raw)>MAX_PROJECT_BYTES)throw Error('Project exceeds the 65 MB size limit.');
  const doc=normalizeProject(JSON.parse(raw));
  const entries=[],files=[];
  let total=0;
  function add(name,content,details={}){const bytes=Buffer.isBuffer(content)?content:Buffer.from(content);total+=bytes.length;if(total>MAX_BYTES)throw Error('Uncompressed package exceeds 96 MB.');entries.push({name,content:bytes});files.push({name,bytes:bytes.length,sha256:digest(bytes),...details});}
  const normalized=JSON.stringify(doc);
  if(Buffer.byteLength(normalized)>MAX_PROJECT_BYTES)throw Error('Project exceeds the 65 MB size limit.');
  add('publication.skoshpress',normalized);
  for(const row of assetEntries(doc))add(row.name,row.content,row.details);
  add('README.txt','Open this ZIP in Skosh Press 0.9.1 or later, or extract publication.skoshpress and open it in Skosh Press. The editable project already embeds its images and fonts. Separate copies are provided for archival convenience. Verify file hashes against manifest.json. This archive contains the full editable document, including hidden content. Check font redistribution rights before sharing.\n');
  const manifest=JSON.stringify({format:'skosh-publication-package-1',name:doc.name,pages:doc.pages.length,files},null,2);
  if(Buffer.byteLength(manifest)>4*1024*1024)throw Error('Package manifest exceeds 4 MB.');
  if(total+Buffer.byteLength(manifest)>MAX_BYTES)throw Error('Uncompressed package exceeds 96 MB.');
  entries.push({name:'manifest.json',content:manifest});
  return entries;
}
function buildPackage(input){
  const entries=packageEntries(input);
  return {buffer:makeZip(entries),files:entries.length};
}
function openPackage(buffer){
  const entries=readPackageEntries(buffer);
  const invalid=()=>{throw Error('Publication package integrity verification failed.');};
  if(!entries.has('manifest.json')||!entries.has('publication.skoshpress')||!entries.has('README.txt')||entries.get('manifest.json').length>4*1024*1024||entries.get('publication.skoshpress').length>MAX_PROJECT_BYTES)invalid();
  let manifest,doc;
  try{manifest=JSON.parse(entries.get('manifest.json').toString('utf8'));doc=normalizeProject(JSON.parse(entries.get('publication.skoshpress').toString('utf8')));}catch(_error){invalid();}
  if(manifest?.format!=='skosh-publication-package-1'||manifest.name!==doc.name||manifest.pages!==doc.pages.length||!Array.isArray(manifest.files)||manifest.files.length!==entries.size-1)invalid();
  const seen=new Set();
  for(const row of manifest.files){
    if(!row||typeof row.name!=='string'||row.name==='manifest.json'||seen.has(row.name)||!entries.has(row.name))invalid();
    const bytes=entries.get(row.name);
    if(row.bytes!==bytes.length||row.sha256!==digest(bytes))invalid();
    seen.add(row.name);
  }
  let assetCount=0;
  for(const row of assetEntries(doc)){assetCount++;if(!entries.has(row.name)||!entries.get(row.name).equals(row.content))invalid();}
  if(assetCount!==entries.size-3)invalid();
  return doc;
}
module.exports={buildPackage,openPackage,MAX_BYTES};
