'use strict';
// Vector Glyphs
(function(root,factory){
  const base=typeof module==='object'&&module.exports?require('./pixel-font'):root.SkoshPixelFont;
  const spacing=typeof module==='object'&&module.exports?require('./spacing-studio'):root.SkoshSpacingStudio;
  const api=factory(base,spacing);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshVectorFont=api;
})(typeof window!=='undefined'?window:null,(PixelFont,Spacing)=>{
  const MAX_CONTOURS=24,MAX_NODES=180,MAX_POINTS=600;
  const round=n=>Math.round(n*10)/10;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const copy=glyph=>JSON.parse(JSON.stringify(glyph));
  const anchor=(x,y,ix=x,iy=y,ox=x,oy=y)=>[round(x),round(y),round(ix),round(iy),round(ox),round(oy)];
  const empty=()=>[];
  function valid(glyph){
    if(!Array.isArray(glyph)||glyph.length>MAX_CONTOURS)return false;
    let count=0;
    for(const contour of glyph){
      if(!Array.isArray(contour)||contour.length<3||contour.length>MAX_NODES)return false;
      count+=contour.length;
      if(count>MAX_POINTS)return false;
      for(const node of contour){
        if(!Array.isArray(node)||node.length!==6||node.some((value,i)=>!Number.isFinite(value)||value<(i%2===0?-300:-300)||value>(i%2===0?1100:1300)))return false;
      }
    }
    return true;
  }
  const cubic=(a,b,c,d,t)=>{const s=1-t;return s*s*s*a+3*s*s*t*b+3*s*t*t*c+t*t*t*d;};
  function pointAt(a,b,t){
    return [cubic(a[0],a[4],b[2],b[0],t),cubic(a[1],a[5],b[3],b[1],t)];
  }
  function toQuadratic(glyph,fixedSteps=false){
    if(!valid(glyph))throw new Error('Invalid vector glyph.');
    return glyph.map(contour=>{
      const points=[];
      for(let i=0;i<contour.length;i++){
        const a=contour[i],b=contour[(i+1)%contour.length];
        const length=Math.hypot(b[0]-a[0],b[1]-a[1])+Math.hypot(a[4]-a[0],a[5]-a[1])+Math.hypot(b[2]-b[0],b[3]-b[1]);
        const steps=fixedSteps?4:clamp(Math.ceil(length/50),4,18);
        for(let s=0;s<steps;s++){
          const t0=s/steps,t1=(s+1)/steps,p0=pointAt(a,b,t0),p1=pointAt(a,b,t1),middle=pointAt(a,b,(t0+t1)/2);
          if(s===0)points.push({x:round(p0[0]),y:round(800-p0[1]),on:true});
          const control=[2*middle[0]-(p0[0]+p1[0])/2,2*middle[1]-(p0[1]+p1[1])/2];
          points.push({x:round(control[0]),y:round(800-control[1]),on:false});
          if(s<steps-1)points.push({x:round(p1[0]),y:round(800-p1[1]),on:true});
        }
      }
      return points;
    });
  }
  function validMetrics(metrics={}){
    if(!metrics||typeof metrics!=='object'||Array.isArray(metrics))return false;
    if(metrics.style!==undefined&&!['Regular','Light','Bold','Italic'].includes(metrics.style))return false;
    if(metrics.spacing!==undefined&&(!Number.isInteger(metrics.spacing)||metrics.spacing<-250||metrics.spacing>350))return false;
    const advances=metrics.advances??{},kerning=metrics.kerning??{};
    if(!advances||typeof advances!=='object'||Array.isArray(advances)||Object.keys(advances).length>PixelFont.ALL_CHARS.length)return false;
    if(!kerning||typeof kerning!=='object'||Array.isArray(kerning)||Object.keys(kerning).length>300)return false;
    for(const [ch,width] of Object.entries(advances))if(!PixelFont.isSupportedChar(ch)||!Number.isInteger(width)||width<320||width>1200)return false;
    for(const [pair,value] of Object.entries(kerning))if(pair.length!==2||[...pair].some(ch=>!PixelFont.isSupportedChar(ch))||!Number.isInteger(value)||value<-400||value>400)return false;
    const ligatures=metrics.ligatures??{},alternates=metrics.alternates??{};
    if(!ligatures||typeof ligatures!=='object'||Array.isArray(ligatures)||Object.keys(ligatures).length>16)return false;
    if(!alternates||typeof alternates!=='object'||Array.isArray(alternates)||Object.keys(alternates).length>24)return false;
    let extraGlyphs=0;
    for(const [sequence,item] of Object.entries(ligatures)){
      if(!/^[!-~]{2,3}$/.test(sequence)||!item||typeof item!=='object'||Array.isArray(item)||!valid(item.glyph)||!Number.isInteger(item.advance)||item.advance<320||item.advance>2400)return false;
      extraGlyphs++;
    }
    for(const [ch,items] of Object.entries(alternates)){
      if(!/^[!-~]$/.test(ch)||!Array.isArray(items)||items.length<1||items.length>3||items.some(g=>!valid(g)))return false;
      extraGlyphs+=items.length;
    }
    if(extraGlyphs>64)return false;
    return Spacing.valid(metrics);
  }
  function advanceFor(metrics={},ch){return Math.max(200,Math.min(1550,(metrics.advances?.[ch]??780)+(metrics.spacing??0)));}
  function kernFor(metrics={},pair){return Spacing.kernFor(metrics,pair);}
  function buildTTF(glyphs={},family='Skosh Vector',metrics={},options={}){
    if(!validMetrics(metrics))throw new Error('Invalid font letter spacing or kerning.');
    if(!glyphs||typeof glyphs!=='object'||Array.isArray(glyphs))throw new Error('Invalid vector font glyph collection.');
    for(const ch of Object.keys(glyphs))if(!PixelFont.isSupportedChar(ch))throw new Error('Unsupported Unicode glyph.');
    const converted={};for(const char of PixelFont.CHARS)converted[char]=toQuadratic(Spacing.resolveSpacing(glyphs[char]||[],metrics,char).glyph,options.variableCompatible===true);
    for(const char of PixelFont.EXTENDED_CHARS)if(Object.hasOwn(glyphs,char))converted[char]=toQuadratic(Spacing.resolveSpacing(glyphs[char],metrics,char).glyph,options.variableCompatible===true);
    const extra={...metrics,kerning:Spacing.expand(metrics),ligatures:{},alternates:{}};
    for(const [sequence,record] of Object.entries(metrics.ligatures||{}))extra.ligatures[sequence]={advance:record.advance,glyph:toQuadratic(record.glyph)};
    for(const [ch,items] of Object.entries(metrics.alternates||{}))extra.alternates[ch]=items.map(toQuadratic);
    return PixelFont.buildOutlineTTF(converted,family,extra);
  }
  // Ellipse Generation
  function ellipse(cx=380,cy=465,rx=220,ry=305){
    const k=0.5522847498;
    return [[
      anchor(cx,cy-ry,cx-k*rx,cy-ry,cx+k*rx,cy-ry),
      anchor(cx+rx,cy+0,cx+rx,cy-k*ry,cx+rx,cy+k*ry),
      anchor(cx,cy+ry,cx+k*rx,cy+ry,cx-k*rx,cy+ry),
      anchor(cx-rx,cy,cx-rx,cy+k*ry,cx-rx,cy-k*ry)
    ]];
  }
  function reverse(glyph,index){
    if(!valid(glyph)||!glyph[index])throw new Error('No contour to reverse.');
    const flipped=copy(glyph);
    flipped[index]=flipped[index].reverse().map(a=>anchor(a[0],a[1],a[4],a[5],a[2],a[3]));
    return flipped;
  }
  // Curve Splitting
  function split(glyph,ci,segment,t=.5){
    if(!valid(glyph)||!glyph[ci]||!glyph[ci][segment])throw new Error('Choose an outline segment first.');
    const updated=copy(glyph),nodes=updated[ci],a=nodes[segment],b=nodes[(segment+1)%nodes.length];
    const mix=(p,q)=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
    const p0=[a[0],a[1]],p1=[a[4],a[5]],p2=[b[2],b[3]],p3=[b[0],b[1]];
    const q0=mix(p0,p1),q1=mix(p1,p2),q2=mix(p2,p3),r0=mix(q0,q1),r1=mix(q1,q2),mid=mix(r0,r1);
    a[4]=round(q0[0]);a[5]=round(q0[1]);b[2]=round(q2[0]);b[3]=round(q2[1]);
    const inserted=anchor(mid[0],mid[1],r0[0],r0[1],r1[0],r1[1]);
    nodes.splice(segment+1,0,inserted);
    return updated;
  }
  function traceBitmap(bitmap,width,height){
    if(!(bitmap instanceof Uint8Array)||!Number.isInteger(width)||!Number.isInteger(height)||width<10||height<10||width>350||height>350||bitmap.length!==width*height)throw new Error('Invalid tracing template.');
    const active=(x,y)=>x>=0&&x<width&&y>=0&&y<height&&bitmap[y*width+x]>0;
    const edges=[],heads=new Map();
    function edge(x,y,nx,ny,dir){
      const e={x,y,nx,ny,dir,used:false},index=edges.length;edges.push(e);
      const key=`${x},${y}`;if(!heads.has(key))heads.set(key,[]);heads.get(key).push(index);
    }
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      if(!active(x,y))continue;
      if(!active(x,y-1))edge(x,y,x+1,y,0);
      if(!active(x+1,y))edge(x+1,y,x+1,y+1,1);
      if(!active(x,y+1))edge(x+1,y+1,x,y+1,2);
      if(!active(x-1,y))edge(x,y+1,x,y,3);
    }
    function simplify(points,tolerance){
      if(points.length<4)return points;
      const distance=(p,a,b)=>{
        const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
        if(!len)return Math.hypot(p[0]-a[0],p[1]-a[1]);
        const t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len,0,1);
        return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);
      };
      let split=0,far=0;for(let i=1;i<points.length;i++){const d=Math.hypot(points[i][0]-points[0][0],points[i][1]-points[0][1]);if(d>far){far=d;split=i;}}
      const indices=new Set([0,split]);
      function walk(a,b){let max=tolerance,at=-1;for(let i=a+1;i<b;i++){const d=distance(points[i],points[a],points[b]);if(d>max){max=d;at=i;}}if(at>=0){indices.add(at);walk(a,at);walk(at,b);}}
      walk(0,split);
      const list=points.concat([points[0]]);
      function walkWrap(a,b){let max=tolerance,at=-1;for(let i=a+1;i<b;i++){const d=distance(list[i],list[a],list[b]);if(d>max){max=d;at=i;}}if(at>=0){indices.add(at);walkWrap(a,at);walkWrap(at,b);}}
      walkWrap(split,points.length);
      return [...indices].sort((a,b)=>a-b).map(i=>points[i]);
    }
    const contours=[];
    for(const first of edges){
      if(first.used)continue;
      let current=first,steps=0;const ring=[];
      while(current&&!current.used&&steps++<edges.length+1){
        current.used=true;ring.push([current.x,current.y]);
        if(current.nx===first.x&&current.ny===first.y)break;
        const choices=(heads.get(`${current.nx},${current.ny}`)||[]).map(i=>edges[i]).filter(e=>!e.used);
        choices.sort((a,b)=>{const rank=e=>{const turn=(e.dir-current.dir+4)%4;return [1,0,3,2].indexOf(turn);};return rank(a)-rank(b);});
        current=choices[0];
      }
      if(ring.length<12)continue;
      let nodes=simplify(ring,3.2);
      if(nodes.length>MAX_NODES)nodes=simplify(ring,4);
      if(nodes.length<3||nodes.length>MAX_NODES)continue;
      const contour=nodes.map((p,i)=>{
        const prev=nodes[(i+nodes.length-1)%nodes.length],next=nodes[(i+1)%nodes.length];
        const d0=[p[0]-prev[0],p[1]-prev[1]],d1=[next[0]-p[0],next[1]-p[1]];
        const cos=(d0[0]*d1[0]+d0[1]*d1[1])/(Math.hypot(...d0)*Math.hypot(...d1)||1);
        const smooth=cos>.13;
        const vx=smooth?(next[0]-prev[0])/6:0,vy=smooth?(next[1]-prev[1])/6:0;
        const fx=x=>round(x*760/width),fy=y=>round(y*960/height);
        return anchor(fx(p[0]),fy(p[1]),fx(p[0]-vx),fy(p[1]-vy),fx(p[0]+vx),fy(p[1]+vy));
      });
      contours.push(contour);
      if(contours.length>=MAX_CONTOURS)break;
    }
    return valid(contours)?contours:[];
  }
  function rectangle(x=135,y=180,w=490,h=565){
    return [[anchor(x,y),anchor(x+w,y),anchor(x+w,y+h),anchor(x,y+h)]];
  }
  function flip(glyph,axis='x',contourIndex=null){
    if(!valid(glyph)||!['x','y'].includes(axis))throw new Error('Invalid vector transformation.');
    const transformed=copy(glyph),indices=contourIndex===null?transformed.map((_,i)=>i):[contourIndex];
    for(const i of indices){
      if(!transformed[i])throw new Error('Select a contour to mirror.');
      for(const a of transformed[i])for(let j=axis==='x'?0:1;j<6;j+=2)a[j]=round((axis==='x'?760:960)-a[j]);
      transformed[i]=transformed[i].reverse().map(a=>anchor(a[0],a[1],a[4],a[5],a[2],a[3]));
    }
    return transformed;
  }
  function path(glyph){
    if(!valid(glyph))return '';
    const fmt=n=>String(round(n));
    return glyph.map(contour=>{
      let d=`M ${fmt(contour[0][0])} ${fmt(contour[0][1])}`;
      for(let i=0;i<contour.length;i++){
        const a=contour[i],b=contour[(i+1)%contour.length];
        d+=` C ${fmt(a[4])} ${fmt(a[5])} ${fmt(b[2])} ${fmt(b[3])} ${fmt(b[0])} ${fmt(b[1])}`;
      }
      return d+' Z';
    }).join(' ');
  }
  return Object.freeze({empty,anchor,ellipse,rectangle,flip,valid,validMetrics,advanceFor,kernFor,copy,reverse,split,traceBitmap,toQuadratic,buildTTF,path,MAX_CONTOURS,MAX_NODES,MAX_POINTS});
});
