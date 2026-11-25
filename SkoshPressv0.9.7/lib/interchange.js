'use strict';
// Export Interchange
                                                                                                     
                                                                                                          
const pt=mm=>Number((mm*72/25.4).toFixed(5));
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
function decodeHtml(str){
 return String(str??'').replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,(raw,e)=>{
   if(e[0]==='#'){const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';}
   return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',mdash:'—',ndash:'–',hellip:'…',ldquo:'“',rdquo:'”',lsquo:'‘',rsquo:'’'})[e.toLowerCase()]??raw;
 });
}
function plainFromHtml(html){
 return decodeHtml(String(html??'')
  .replace(/<\s*br\s*\/?\s*>/gi,'\n')
  .replace(/<\s*\/\s*(p|h[1-6]|li|div)\s*>/gi,'\n')
  .replace(/<\s*li[^>]*>/gi,'• ')
  .replace(/<[^>]*>/g,''))
  .replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').trim();
}
function allText(doc){return doc.pages.flatMap(page=>page.frames.filter(frame=>frame.type==='text').map(frame=>plainFromHtml(frame.html))).filter(Boolean).join('\n\n');}
function rtfUnicode(str){return Array.from(str).map(char=>{const cp=char.codePointAt(0);if(char==='\\'||char==='{'||char==='}')return '\\'+char;if(char==='\n')return '\\par\n';if(cp===9)return '\\tab ';if(cp>=32&&cp<127)return char;const utf16=Buffer.from(char,'utf16le');let out='';for(let i=0;i<utf16.length;i+=2){let n=utf16.readUInt16LE(i);if(n>32767)n-=65536;out+=`\\u${n}?`;}return out;}).join('');}
function htmlToRtf(html){
  let out='', bold=0, italic=0;
  const allowedBlock=/^(p|div|h1|h2|h3|li)$/;
  for(const token of String(html).match(/<[^>]*>|[^<]+/g)||[]){
    if(token[0]!=='<'){out+=rtfUnicode(decodeHtml(token));continue;}
    const match=token.match(/^<\s*(\/)?\s*([a-z][\w-]*)/i);if(!match)continue;
    const closing=!!match[1],tag=match[2].toLowerCase();
    if(['strong','b'].includes(tag)){bold+=closing?-1:1;out+=bold>0?'\\b ':'\\b0 ';}
    else if(['em','i'].includes(tag)){italic+=closing?-1:1;out+=italic>0?'\\i ':'\\i0 ';}
    else if(tag==='u')out+=closing?'\\ul0 ':'\\ul ';
    else if(tag==='br')out+='\\line ';
    else if(/^h[123]$/.test(tag)){
      out+=closing?'\\b0\\fs22\\par\n':`\\b\\fs${tag==='h1'?40:tag==='h2'?32:26} `;
    } else if(allowedBlock.test(tag)&&closing)out+='\\par\n';
    else if(tag==='li'&&!closing)out+='\\bullet\\tab ';
  }
  return out.trim();
}
function toIndesignRtf(doc){
  const runs=doc.pages.flatMap(page=>page.frames.filter(frame=>frame.type==='text').map(frame=>htmlToRtf(frame.html)));
  const text=runs.filter(Boolean).join('\\par\\par\n');
  return Buffer.from(`{\\rtf1\\ansi\\deff0\\uc1{\\fonttbl{\\f0\\fnil Georgia;}}\\f0\\fs22\n${text}\n}`,'utf8');
}
function scribusObject(frame,pageIndex,absoluteX,absoluteY,id){
 const w=pt(frame.w),h=pt(frame.h),x=pt(absoluteX),y=pt(absoluteY);
 const geometry=`M0 0 L${w} 0 L${w} ${h} L0 ${h} L0 0 Z`;
 const common=`XPOS="${x}" YPOS="${y}" OwnPage="${pageIndex}" ItemID="${id}" WIDTH="${w}" HEIGHT="${h}" FRTYPE="0" PWIDTH="0" PLINEART="1" LOCALSCX="1" LOCALSCY="1" LOCALX="0" LOCALY="0" LOCALROT="0" SCALETYPE="1" RATIO="1" COLUMNS="1" COLGAP="0" AUTOTEXT="0" EXTRA="0" TEXTRA="0" BEXTRA="0" REXTRA="0" VAlign="0" FLOP="0" PLTSHOW="0" BASEOF="0" LAYER="0" NEXTITEM="-1" BACKITEM="-1" path="${geometry}" copath="${geometry}"`;
 if(frame.type==='image')return '';
 const size=Math.max(6,Math.min(150,Number(frame.style?.fontSize)||11));
 const text=plainFromHtml(frame.html).split('\n');
 const runs=text.map((line,i)=>`${i?'<para/>':''}<ITEXT FONT="Arial Regular" FONTSIZE="${size}" CH="${esc(line)}"/>`).join('');
 return `<PAGEOBJECT PTYPE="4" ${common} ANNAME="${esc(frame.label)}"><StoryText><DefaultStyle FONT="Arial Regular"/>${runs}<trail/></StoryText></PAGEOBJECT>`;
}
function toScribusSla(doc){
 const w=pt(doc.paper.width),h=pt(doc.paper.height),margin=pt(doc.paper.margin);
 const gap=20;
 const pageXML=doc.pages.map((page,i)=>`<PAGE NUM="${i}" PAGEYPOS="${i*(h+gap)}" PAGEXPOS="0" PAGEWIDTH="${w}" PAGEHEIGHT="${h}" LEFT="${margin}" RIGHT="${margin}" TOP="${margin}" BOTTOM="${margin}" />`).join('\n');
 let item=100000;const objects=doc.pages.flatMap((page,i)=>page.frames.map(frame=>scribusObject(frame,i,frame.x,frame.y+i*(h+gap)*25.4/72,++item))).join('\n');
 return `<?xml version="1.0" encoding="UTF-8"?>\n<SCRIBUSUTF8NEW Version="1.5.8"><DOCUMENT ANZPAGES="${doc.pages.length}" PAGEWIDTH="${w}" PAGEHEIGHT="${h}" PAGEORIENTATION="0" PAGESIZE="Custom" ScratchLeft="0" ScratchTop="0" ScratchRight="0" ScratchBottom="0" BORDERLEFT="${margin}" BORDERRIGHT="${margin}" BORDERTOP="${margin}" BORDERBOTTOM="${margin}" DFONT="Arial Regular" DSIZE="12" UNITS="0" GROUPC="0" BOOK="0" AUTOMATIC="0" AUTOSPALTEN="1" ABSTSPALTEN="0"><LAYERS NUMMER="0" LEVEL="0" NAME="Background" SICHTBAR="1" DRUCKEN="1" EDIT="1" FLOW="1" TRANS="1" BLEND="0" OUTL="0"/><COLOR NAME="Black" SPACE="CMYK" C="0" M="0" Y="0" K="100"/><COLOR NAME="White" SPACE="CMYK" C="0" M="0" Y="0" K="0"/>${pageXML}${objects}</DOCUMENT></SCRIBUSUTF8NEW>`;
}
module.exports={toScribusSla,toIndesignRtf,plainFromHtml,decodeHtml,pt,esc};
