'use strict';
// Project Validation
const {validateFonts} = require('./fonts');
const MAX_PAGES = 700;
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
function validateProject(project) {
  if(!project || typeof project !== 'object' || !['skosh-press-1','tiny-press-1','layout-list-1'].includes(project.format)
   || typeof project.name !== 'string' || project.name.length > 100
   || !project.paper || !Number.isFinite(project.paper.width) || !Number.isFinite(project.paper.height)
   || project.paper.width < 50 || project.paper.width > 1000 || project.paper.height < 50 || project.paper.height > 1000
   || !Number.isFinite(project.paper.margin) || project.paper.margin < 0 || project.paper.margin > 100 || project.paper.margin*2>=Math.min(project.paper.width,project.paper.height)
   || !Array.isArray(project.pages) || !project.pages.length || project.pages.length > MAX_PAGES) throw new Error('Unsupported or invalid Skosh Press document.');
  const framesSeen=new Set();
  for(const page of project.pages) {
    if(!page || !Array.isArray(page.frames) || page.frames.length > MAX_FRAMES) throw new Error('Invalid page frame count.');
    if(page.id!==undefined && (typeof page.id!=='string'||page.id.length>100))throw new Error('Invalid page ID.');
    if(page.label!==undefined && (typeof page.label!=='string'||page.label.length>200))throw new Error('Invalid page label.');
    for(const frame of page.frames) {
      if(!frame || typeof frame.id!=='string' || frame.id.length > 100 || framesSeen.has(frame.id) || !['text','image'].includes(frame.type)
       || typeof frame.label !== 'string' || frame.label.length > 200
       || !['x','y','w','h'].every(key=>Number.isFinite(frame[key]))
       || frame.w < 1 || frame.h < 1 || frame.w > 1000 || frame.h > 1000 || Math.abs(frame.x)>1000 || Math.abs(frame.y)>1000) throw new Error('Invalid frame found in project.');
      framesSeen.add(frame.id);
      if(frame.note !== undefined && (typeof frame.note !== 'string' || frame.note.length > 2000))throw new Error('Invalid object note.');
      if(frame.storyId!==undefined && (typeof frame.storyId!=='string'||!frame.storyId||frame.storyId.length>100||['__proto__','constructor','prototype'].includes(frame.storyId)))throw new Error('Invalid story link.');
      if(frame.fit!==undefined && !['contain','cover'].includes(frame.fit))throw new Error('Invalid image fit.');
      if(frame.type==='text') {
        if(typeof frame.html!=='string' || frame.html.length > 5_000_000) throw new Error('Invalid text frame.');
        if(!validStyle(frame.style))throw new Error('Invalid text style.');
      } else if(!validImageData(frame.src)) throw new Error('Invalid image frame.');
    }
  }
  if(project.paper.columns!==undefined && (!Number.isInteger(project.paper.columns)||project.paper.columns<1||project.paper.columns>12))throw new Error('Invalid column count.');
  if(project.paper.gutter!==undefined && (!Number.isFinite(project.paper.gutter)||project.paper.gutter<0||project.paper.gutter>25))throw new Error('Invalid column gutter.');
  if((project.paper.columns||1)>1 && (project.paper.width-2*project.paper.margin-((project.paper.columns||1)-1)*(project.paper.gutter??5))<=0)throw new Error('Column settings exceed page width.');
  validateFonts(project.fonts || []);
  if(project.stories!==undefined){
    if(!project.stories || typeof project.stories!=='object' || Array.isArray(project.stories) || Object.keys(project.stories).length>1000)throw new Error('Invalid story collection.');
    let totalStoryText=0;
    for(const [id,story] of Object.entries(project.stories)){
      if(id.length>100 || !id || ['__proto__','prototype','constructor'].includes(id) || !story || typeof story!=='object' || Array.isArray(story) || story.id!==id
        || typeof story.name!=='string' || story.name.length>200 || typeof story.html!=='string' || story.html.length>5_000_000
        || !validStyle(story.style) || !finiteGeometry(story.geometry))throw new Error('Invalid manuscript story.');
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
  if(!project.stories)project.stories={};
  return project;
}
module.exports={validateProject,normalizeProject,MAX_PROJECT_BYTES};
