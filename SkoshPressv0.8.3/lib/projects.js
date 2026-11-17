'use strict';
// Project Validation
const {validateFonts} = require('./fonts');
const VectorFont = require('./vector-font');
const FontVariations=require('./font-variations');
const {validDesign}=require('./font-design');
const MAX_PAGES = 700;
const MAX_FONT_DESIGNS=6;
const MAX_FRAMES = 300;
const MAX_PROJECT_BYTES = 65 * 1024 * 1024;
const finiteGeometry=g=>g && typeof g==='object' && ['x','y','w','h'].every(key=>Number.isFinite(g[key])) && g.w>0 && g.h>0 && g.w<=1000 && g.h<=1000 && Math.abs(g.x)<=1000 && Math.abs(g.y)<=1000;
const validStyle=s=>s && typeof s==='object' && typeof s.font==='string' && s.font.length<=120 && Number.isFinite(s.fontSize) && s.fontSize>=6 && s.fontSize<=150 && Number.isFinite(s.leading) && s.leading>=.8 && s.leading<=3;
const validImageData=src=>{
  if(typeof src!=='string'||src.length>25*1024*1024)return false;
  const match=/^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
  if(!match)return false;
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length<12||bytes.length>16*1024*1024)return false;
  const type=match[1];
  if(type==='png')return bytes.length>=24 && bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) && bytes.readUInt32BE(16)>0 && bytes.readUInt32BE(20)>0 && bytes.readUInt32BE(16)<=20000 && bytes.readUInt32BE(20)<=20000 && bytes.readUInt32BE(16)*bytes.readUInt32BE(20)<=100_000_000;
  if(type==='jpg'||type==='jpeg')return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(type==='gif')return bytes.subarray(0,6).toString('ascii').match(/^GIF8[79]a$/)!==null && bytes.readUInt16LE(6)>0 && bytes.readUInt16LE(8)>0;
  return bytes.subarray(0,4).toString('ascii')==='RIFF' && bytes.subarray(8,12).toString('ascii')==='WEBP';
};
const validTextStyle=s=>validStyle(s) && (s.align===undefined||['left','right','center','justify'].includes(s.align))
  && (s.tracking===undefined||(Number.isFinite(s.tracking)&&s.tracking>=-3&&s.tracking<=12))
  && (s.indent===undefined||(Number.isFinite(s.indent)&&s.indent>=0&&s.indent<=40))
  && (s.hyphenate===undefined||typeof s.hyphenate==='boolean');
function validateProject(project) {
  if(!project || typeof project !== 'object' || !['skosh-press-1','tiny-press-1','layout-list-1'].includes(project.format)
   || typeof project.name !== 'string' || project.name.length > 100
   || !project.paper || !Number.isFinite(project.paper.width) || !Number.isFinite(project.paper.height)
   || project.paper.width < 50 || project.paper.width > 1000 || project.paper.height < 50 || project.paper.height > 1000
   || !Number.isFinite(project.paper.margin) || project.paper.margin < 0 || project.paper.margin > 100 || project.paper.margin*2>=Math.min(project.paper.width,project.paper.height)
   || !Array.isArray(project.pages) || !project.pages.length || project.pages.length > MAX_PAGES) throw new Error('Unsupported or invalid Skosh Press document.');
  if(project.textStyles!==undefined){
    if(!Array.isArray(project.textStyles)||project.textStyles.length>60)throw new Error('Invalid text style collection.');
    const seen=new Set();
    for(const item of project.textStyles){
      if(!item||typeof item.id!=='string'||!/^style-[a-z0-9-]{1,80}$/i.test(item.id)||seen.has(item.id)||typeof item.name!=='string'||item.name.length<1||item.name.length>64||!validTextStyle(item.style))throw new Error('Invalid reusable text style.');
      seen.add(item.id);
    }
  }
  if(project.masters!==undefined){
    if(!Array.isArray(project.masters)||project.masters.length>30)throw new Error('Invalid parent page collection.');
    const seen=new Set();
    for(const master of project.masters){
      if(!master||typeof master.id!=='string'||!/^master-[a-z0-9-]{1,80}$/i.test(master.id)||seen.has(master.id)||typeof master.name!=='string'||master.name.length<1||master.name.length>64
        ||typeof master.header!=='string'||master.header.length>200||typeof master.footer!=='string'||master.footer.length>200||typeof master.pageNumber!=='boolean'
        ||(master.numberOffset!==undefined&&(!Number.isInteger(master.numberOffset)||Math.abs(master.numberOffset)>10000)))throw new Error('Invalid parent page.');
      seen.add(master.id);
    }
  }
  if(project.fontDesigns!==undefined){
    if(!Array.isArray(project.fontDesigns)||project.fontDesigns.length>MAX_FONT_DESIGNS)throw new Error('Invalid typography studio designs.');
    const seen=new Set();
    for(const d of project.fontDesigns){
      if(d.variants!==undefined&&!FontVariations.valid(d.variants))throw new Error('Invalid font variation collection.');
      if(d?.glyphs&&typeof d.glyphs==='object'&&!Array.isArray(d.glyphs)){
        for(const [ch,glyph] of Object.entries(d.glyphs)){
          if(!require('./pixel-font').isSupportedChar(ch)||(d.kind==='vector'?!VectorFont.valid(glyph):(!Array.isArray(glyph)||glyph.length!==12||glyph.some(row=>typeof row!=='string'||!/^[01]{8}$/.test(row)))))throw new Error('Invalid typography glyph.');
        }
      }
      if(!validDesign(d)||seen.has(d.id))throw new Error('Invalid typography studio design.');
      seen.add(d.id);
    }
  }
  const framesSeen=new Set();
  for(const page of project.pages) {
    if(!page || !Array.isArray(page.frames) || page.frames.length > MAX_FRAMES) throw new Error('Invalid page frame count.');
    if(page.id!==undefined && (typeof page.id!=='string'||page.id.length>100))throw new Error('Invalid page ID.');
    if(page.label!==undefined && (typeof page.label!=='string'||page.label.length>200))throw new Error('Invalid page label.');
    if(page.masterId!==undefined && (typeof page.masterId!=='string'||!project.masters?.some(m=>m.id===page.masterId)))throw new Error('Missing parent page.');
    for(const frame of page.frames) {
      if(!frame || typeof frame.id!=='string' || frame.id.length > 100 || framesSeen.has(frame.id) || !['text','image'].includes(frame.type)
       || typeof frame.label !== 'string' || frame.label.length > 200
       || !['x','y','w','h'].every(key=>Number.isFinite(frame[key]))
       || frame.w < 1 || frame.h < 1 || frame.w > 1000 || frame.h > 1000 || Math.abs(frame.x)>1000 || Math.abs(frame.y)>1000) throw new Error('Invalid frame found in project.');
      framesSeen.add(frame.id);
      if(frame.note !== undefined && (typeof frame.note !== 'string' || frame.note.length > 2000))throw new Error('Invalid object note.');
      if(frame.alt!==undefined && (typeof frame.alt!=='string'||frame.alt.length>500))throw new Error('Invalid image alternative text.');
      if(frame.decorative!==undefined && typeof frame.decorative!=='boolean')throw new Error('Invalid decorative image setting.');
      if(frame.storyId!==undefined && (typeof frame.storyId!=='string'||!frame.storyId||frame.storyId.length>100||['__proto__','constructor','prototype'].includes(frame.storyId)))throw new Error('Invalid story link.');
      if(frame.fit!==undefined && !['contain','cover'].includes(frame.fit))throw new Error('Invalid image fit.');
      if(frame.styleId!==undefined&&(typeof frame.styleId!=='string'||!project.textStyles?.some(s=>s.id===frame.styleId)))throw new Error('Missing reusable text style.');
      if(frame.type==='text') {
        if(typeof frame.html!=='string' || frame.html.length > 5_000_000) throw new Error('Invalid text frame.');
        if(!validTextStyle(frame.style))throw new Error('Invalid text style.');
      } else if(!validImageData(frame.src)) throw new Error('Invalid image frame.');
    }
  }
  if(project.paper.columns!==undefined && (!Number.isInteger(project.paper.columns)||project.paper.columns<1||project.paper.columns>12))throw new Error('Invalid column count.');
  if(project.paper.gutter!==undefined && (!Number.isFinite(project.paper.gutter)||project.paper.gutter<0||project.paper.gutter>25))throw new Error('Invalid column gutter.');
  if((project.paper.columns||1)>1 && (project.paper.width-2*project.paper.margin-((project.paper.columns||1)-1)*(project.paper.gutter??5))<=0)throw new Error('Column settings exceed page width.');
  if(project.metadata!==undefined){
    if(!project.metadata||typeof project.metadata!=='object'||Array.isArray(project.metadata))throw new Error('Invalid publication details.');
    for(const [key,limit] of Object.entries({author:160,description:1000,publisher:160,rights:300,language:35})){
      if(project.metadata[key]!==undefined && (typeof project.metadata[key]!=='string'||project.metadata[key].length>limit))throw new Error('Invalid publication '+key+'.');
    }
    if(project.metadata.language && !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(project.metadata.language))throw new Error('Invalid publication language.');
  }
  validateFonts(project.fonts || []);
  if(project.stories!==undefined){
    if(!project.stories || typeof project.stories!=='object' || Array.isArray(project.stories) || Object.keys(project.stories).length>1000)throw new Error('Invalid story collection.');
    let totalStoryText=0;
    for(const [id,story] of Object.entries(project.stories)){
      if(id.length>100 || !id || ['__proto__','prototype','constructor'].includes(id) || !story || typeof story!=='object' || Array.isArray(story) || story.id!==id
        || typeof story.name!=='string' || story.name.length>200 || typeof story.html!=='string' || story.html.length>5_000_000
        || !validTextStyle(story.style) || !finiteGeometry(story.geometry) || (story.styleId!==undefined && !project.textStyles?.some(s=>s.id===story.styleId)))throw new Error('Invalid manuscript story.');
      totalStoryText+=story.html.length;
      if(totalStoryText>15_000_000)throw new Error('Manuscript stories exceed the size limit.');
    }
  }
  for(const page of project.pages)for(const frame of page.frames){
    if(frame.storyId!==undefined && (!project.stories || !Object.hasOwn(project.stories,frame.storyId)))throw new Error('Missing manuscript story.');
  }
  return project;
}
function normalizeProject(project) {
  validateProject(project);
  project.format='skosh-press-1';project.version=4;
  if(!Number.isInteger(project.paper.columns))project.paper.columns=1;
  if(!Number.isFinite(project.paper.gutter))project.paper.gutter=5;
  if(!project.fonts)project.fonts=[];
  if(!project.textStyles)project.textStyles=[];
  if(!project.masters)project.masters=[];
  if(!project.fontDesigns)project.fontDesigns=[];
  if(!project.stories)project.stories={};
  if(!project.metadata)project.metadata={language:'en',author:'',description:'',publisher:'',rights:''};
  return project;
}
module.exports={validateProject,normalizeProject,MAX_PROJECT_BYTES};
