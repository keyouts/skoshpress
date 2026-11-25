'use strict';
// Specimen Layout
(function(root,factory){
  const load=typeof module==='object'&&module.exports;
  const api=factory(load?require('./pixel-font'):root.SkoshPixelFont);
  if(load)module.exports=api;
  if(root)root.SkoshTypeSpecimen=api;
})(typeof window!=='undefined'?window:null,Pixel=>{
  const PRESETS=Object.freeze({
    lorem:'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    pangram:'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. Sphinx of black quartz, judge my vow. Waltz, bad nymph, for quick jigs vex!',
    editorial:'The Art of the Printed Word\nA study in rhythm, character, and the quiet confidence of a well-designed page.\nEvery line offers a chance to measure the space between ideas. Letterforms bring their own voice to the page, while thoughtful spacing allows the story to breathe.',
    unicode:'ÀÁÂÃÄÅ Æ Ç ÈÉÊË ÌÍÎÏ Ñ ÒÓÔÕÖ Ø ÙÚÛÜ Ý Þ ß\ná à â ä æ ç é è ê ë î ï ñ ô ö œ ù û ü ÿ\n€ £ ¥ © ® ™ — – “Curly quotes” ‘apostrophes’…\n0123456789   1/2   10:30   2026',
    scripts:'Ελληνικά · ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ\nКириллица · АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ\nČeský · Polski · Tiếng Việt · Français',
    spacing:'AV AVA VA WA TA To Te Ty Yo LT LY\nHHHOHHH OOOHOOO nnnonnn ooonooo\n0123456789  111  000  888',
    numerals:'0123456789   123,456.78   $99.95   €45.00\n0123456789   0123456789\n1 11 111 1111     0 O 8 B 6 9\n(123) 456-7890   09:30–17:45'
  });
  const LAYOUTS=Object.freeze({book:'Book page',editorial:'Editorial spread',poster:'Poster',glyph:'Character sheet'});
  const clean=(text,max=1800)=>typeof text==='string'?text.replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0B-\x1F\x7F]/g,'').slice(0,max):'';
  function settings(value={}){
    const layout=Object.hasOwn(LAYOUTS,value.layout)?value.layout:'book';
    const size=Number(value.size);
    return {layout,size:Number.isFinite(size)?Math.max(12,Math.min(92,Math.round(size))):30,
      leading:Number.isFinite(Number(value.leading))?Math.max(1,Math.min(2.4,Number(value.leading))):1.53,text:clean(value.text??PRESETS.lorem)};
  }
  function missing(design,text,face='Regular'){
    const authored=new Set(Object.keys(design?.glyphs||{}));
    for(const [ch,links] of Object.entries(design?.componentLinks||{}))if(links?.length)authored.add(ch);
    if(face!=='Regular')for(const ch of Object.keys(design?.variants?.[face]?.glyphs||{}))authored.add(ch);
    return [...new Set([...clean(text)].filter(ch=>ch!=='\n'&&ch!=='\t'&&(!Pixel.isSupportedChar(ch)||(!Pixel.CHARS.includes(ch)&&!authored.has(ch)))))];
  }
  function wrap(ctx,text,maxWidth){
    const result=[];
    for(const para of clean(text).split('\n')){
      if(!para.trim()){result.push('');continue;}
      let line='';
      for(const token of para.split(/\s+/)){
        const trial=line?line+' '+token:token;
        if(ctx.measureText(trial).width<=maxWidth){line=trial;continue;}
        if(line){result.push(line);line='';}
        // Word Wrapping
        for(const ch of token){const next=line+ch;if(line&&ctx.measureText(next).width>maxWidth){result.push(line);line=ch;}else line=next;}
      }
      result.push(line);
    }
    return result;
  }
  function draw(canvas,options={}){
    const config=settings(options),ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Canvas preview is unavailable.');
    const width=config.layout==='book'?740:960,height=config.layout==='book'?920:660;
    canvas.width=width;canvas.height=height;
    ctx.clearRect(0,0,width,height);ctx.fillStyle='#f7f4ec';ctx.fillRect(0,0,width,height);
    const family=typeof options.fontFamily==='string'&&/^SkoshProof_[a-zA-Z0-9_]+$/.test(options.fontFamily)?options.fontFamily:'serif';
    const ink='#243343';ctx.fillStyle=ink;
    let clipped=false,linesDrawn=0;
    function setFont(px){ctx.font=`${Math.round(px)}px "${family}", serif`;ctx.textBaseline='alphabetic';}
    function textLines(text,x,y,maxWidth,leading,px,maxY){
      setFont(px);
      for(const line of wrap(ctx,text,maxWidth)){
        if(y>maxY){clipped=true;break;}
        ctx.fillText(line,x,y);y+=leading;linesDrawn++;
      }
      return y;
    }
    if(config.layout==='book'){
      ctx.fillStyle='#fffefc';ctx.fillRect(60,24,620,872);
      ctx.strokeStyle='#ddd8cf';ctx.strokeRect(60,24,620,872);
      ctx.fillStyle=ink;setFont(14);ctx.fillText('SKOSH PRESS  •  TYPE SPECIMEN',110,79);
      const lead=config.size*config.leading;
      textLines(config.text,112,160,518,lead,config.size,816);
      setFont(14);ctx.fillText('01',620,864);
    }else if(config.layout==='editorial'){
      ctx.fillStyle='#fffefc';ctx.fillRect(24,24,912,612);ctx.fillStyle=ink;
      setFont(13);ctx.fillText('TYPOGRAPHY / EDITORIAL PROOF',55,63);
      const parts=config.text.split(/\n/);
      const heading=parts.length>1?parts.shift():'The printed word';
      textLines(heading,55,128,855,64,Math.max(39,config.size*1.6),206);
      const content=parts.length?parts.join(' '):config.text;
      const leading=config.size*config.leading;
      setFont(config.size);
      const editorialLines=wrap(ctx,content,400);
      const perColumn=Math.max(1,Math.floor((599-272)/leading)+1);
      for(let i=0;i<Math.min(editorialLines.length,perColumn*2);i++){
        const col=Math.floor(i/perColumn),row=i%perColumn;
        ctx.fillText(editorialLines[i],col?510:55,272+row*leading);
        linesDrawn++;
      }
      if(editorialLines.length>perColumn*2)clipped=true;
      ctx.fillStyle='#b3a793';ctx.fillRect(485,240,1,355);
    }else if(config.layout==='poster'){
      ctx.fillStyle='#192f40';ctx.fillRect(0,0,width,height);ctx.fillStyle='#f7efde';
      setFont(16);ctx.fillText('SKOSH / DISPLAY STUDY',48,70);
      textLines(config.text,52,195,856,Math.max(60,config.size*1.42),Math.max(44,config.size*1.65),575);
      setFont(15);ctx.fillText('TYPE IS A VOICE IN PRINT',52,622);
    }else{
      ctx.fillStyle='#fffefc';ctx.fillRect(24,24,912,612);ctx.fillStyle=ink;
      setFont(15);ctx.fillText('CHARACTER & SPACING PROOF',48,65);
      const chars=[...new Set([...config.text].filter(c=>c!=='\n'&&c!=='\t'&&c!==' '))].slice(0,120);
      const cells=12,size=Math.min(50,Math.max(25,config.size));setFont(size);
      chars.forEach((ch,i)=>{const x=48+(i%cells)*73,y=139+Math.floor(i/cells)*49;if(y>615){clipped=true;return;}ctx.fillText(ch,x,y);linesDrawn++;});
    }
    return {linesDrawn,clipped,width,height,layout:config.layout};
  }
  return Object.freeze({PRESETS,LAYOUTS,clean,settings,missing,wrap,draw});
});
