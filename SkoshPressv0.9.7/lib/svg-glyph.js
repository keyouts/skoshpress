'use strict';
// SVG Import
(function(root,factory){
  const vector=typeof module==='object'&&module.exports?require('./vector-font'):root.SkoshVectorFont;
  const api=factory(vector);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshSvgGlyph=api;
})(typeof window!=='undefined'?window:null,Vector=>{
  const r=n=>Math.round(n*10)/10;
  const number=/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  const pairs=(x,y)=>[x,y];
  const make=(x,y)=>Vector.anchor(x,y);
  function parsePath(path){
    if(typeof path!=='string'||path.length>150000)throw new Error('SVG path is too long.');
    const tokens=path.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)||[];
    if(path.replace(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g,'').replace(/[\s,]/g,'')!=='')throw new Error('Malformed SVG path.');
    let pos=0,command='',x=0,y=0,start=[0,0],contour=null,previous='',quad=null;
    const outlines=[];
    const splitShortContour=(nodes)=>{
      while(nodes.length<3){
        const a=nodes[0],b=nodes[nodes.length===1?0:1],mix=(p,q)=>[(p[0]+q[0])/2,(p[1]+q[1])/2];
        const p0=[a[0],a[1]],p1=[a[4],a[5]],p2=[b[2],b[3]],p3=[b[0],b[1]];
        const q0=mix(p0,p1),q1=mix(p1,p2),q2=mix(p2,p3),r0=mix(q0,q1),r1=mix(q1,q2),mid=mix(r0,r1);
        a[4]=q0[0];a[5]=q0[1];b[2]=q2[0];b[3]=q2[1];
        nodes.splice(1,0,Vector.anchor(mid[0],mid[1],r0[0],r0[1],r1[0],r1[1]));
      }
    };
    const isCommand=t=>t!==undefined&&/^[a-zA-Z]$/.test(t);
    const read=()=>{if(pos>=tokens.length||isCommand(tokens[pos]))throw new Error('Incomplete SVG path segment.');const v=Number(tokens[pos++]);if(!Number.isFinite(v)||Math.abs(v)>1e7)throw new Error('SVG coordinates are out of range.');return v;};
    const point=(rel)=>{const px=read(),py=read();return [rel?x+px:px,rel?y+py:py];};
    const add=(px,py,c1=null,c2=null)=>{
      if(!contour)throw new Error('SVG path needs an initial M command.');
      const a=contour[contour.length-1];a[4]=c1?c1[0]:a[0];a[5]=c1?c1[1]:a[1];
      contour.push(Vector.anchor(px,py,c2?.[0]??px,c2?.[1]??py));x=px;y=py;
    };
    const finish=()=>{
      if(!contour)return;
      const first=contour[0],last=contour[contour.length-1];
      if(contour.length>1&&Math.abs(last[0]-first[0])<.001&&Math.abs(last[1]-first[1])<.001){
        first[2]=last[2];first[3]=last[3];contour.pop();
      }
      if(contour.length<1)throw new Error('Empty SVG path.');
      if(contour.length<3)splitShortContour(contour);
      outlines.push(contour);contour=null;
    };
    while(pos<tokens.length){
      if(isCommand(tokens[pos]))command=tokens[pos++];
      else if(!command)throw new Error('SVG path must begin with M.');
      const rel=command===command.toLowerCase(),cmd=command.toUpperCase(),before=pos;
      if(cmd==='Z'){
        if(!contour)throw new Error('Unexpected SVG close-path command.');
        finish();x=start[0];y=start[1];previous='Z';command='';continue;
      }
      if(cmd==='M'){
        const [px,py]=point(rel);
        if(contour)throw new Error('SVG contours must be explicitly closed with Z.');
        x=px;y=py;start=[x,y];contour=[make(x,y)];command=rel?'l':'L';previous='M';quad=null;continue;
      }
      if(!contour)throw new Error('SVG paths must be closed with Z before another command.');
      if(cmd==='L'){const p=point(rel);add(...p);quad=null;}
      else if(cmd==='H'){const px=read();add(rel?x+px:px,y);quad=null;}
      else if(cmd==='V'){const py=read();add(x,rel?y+py:py);quad=null;}
      else if(cmd==='C'){
        const c1=point(rel),c2=point(rel),end=point(rel);add(...end,c1,c2);quad=null;
      }else if(cmd==='S'){
        const a=contour[contour.length-1];
        const c1=['C','S'].includes(previous)?[2*x-a[2],2*y-a[3]]:[x,y];
        const c2=point(rel),end=point(rel);add(...end,c1,c2);quad=null;
      }else if(cmd==='Q'){
        const q=point(rel),end=point(rel);
        add(...end,[x+(q[0]-x)*2/3,y+(q[1]-y)*2/3],[end[0]+(q[0]-end[0])*2/3,end[1]+(q[1]-end[1])*2/3]);quad=q;
      }else if(cmd==='T'){
        const q=['Q','T'].includes(previous)&&quad?[2*x-quad[0],2*y-quad[1]]:[x,y],end=point(rel);
        add(...end,[x+(q[0]-x)*2/3,y+(q[1]-y)*2/3],[end[0]+(q[0]-end[0])*2/3,end[1]+(q[1]-end[1])*2/3]);quad=q;
      }else if(cmd==='A')throw new Error('SVG arc commands are not supported yet; convert arcs to Bézier paths before import.');
      else throw new Error(`Unsupported SVG path command ${cmd}.`);
      if(before===pos)throw new Error('Invalid SVG path.');
      previous=cmd;
    }
    if(contour)throw new Error('SVG path has an open outline. Close it in your vector editor first.');
    if(outlines.length>Vector.MAX_CONTOURS||outlines.some(c=>c.length>Vector.MAX_NODES))throw new Error('SVG contains too many contours or anchors.');
    return outlines;
  }
  const identity=[1,0,0,1,0,0];
  function multiply(m,n){return [m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];}
  function transform(input=''){
    if(typeof input!=='string'||input.length>1500)throw new Error('Invalid SVG transform.');
    let matrix=identity,used='';
    const regex=/\b(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
    for(const match of input.matchAll(regex)){
      used+=match[0];
      const [name,args]=[match[1],[...(match[2].matchAll(number))].map(m=>Number(m[0]))];
      if(match[2].replace(number,'').replace(/[\s,]/g,'')||args.some(x=>!Number.isFinite(x)||Math.abs(x)>1e7))throw new Error('Invalid SVG transform coordinates.');
      let part;
      if(name==='matrix'&&args.length===6)part=args;
      else if(name==='translate'&&[1,2].includes(args.length))part=[1,0,0,1,args[0],args[1]||0];
      else if(name==='scale'&&[1,2].includes(args.length))part=[args[0],0,0,args[1]??args[0],0,0];
      else if(name==='rotate'&&[1,3].includes(args.length)){
        const angle=args[0]*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
        const rot=[c,s,-s,c,0,0];part=args.length===1?rot:multiply(multiply([1,0,0,1,args[1],args[2]],rot),[1,0,0,1,-args[1],-args[2]]);
      }else if((name==='skewX'||name==='skewY')&&args.length===1){const t=Math.tan(args[0]*Math.PI/180);part=name==='skewX'?[1,0,t,1,0,0]:[1,t,0,1,0,0];}
      else throw new Error('Unsupported SVG transform.');
      matrix=multiply(matrix,part);
    }
    if(input.replace(regex,'').trim()!=='')throw new Error('Unsupported SVG transform expression.');
    return matrix;
  }
  function fromDocument(doc){
    const svg=doc?.documentElement;
    if(!svg||svg.localName!=='svg'||doc.doctype)throw new Error('Select a valid SVG document without a DOCTYPE.');
    const shapes=[];let visited=0;
    function walk(element,parent=identity,depth=0){
      if(depth>50||++visited>650)throw new Error('SVG structure is too complex.');
      if(shapes.length>80)throw new Error('SVG contains too many shapes.');
      const tag=element.localName;
      if(['defs','style','metadata','title','desc','clipPath','mask','filter','pattern','symbol'].includes(tag))return;
      if(['use','text','image','foreignObject'].includes(tag))throw new Error('SVG linked artwork and text must be converted to outline paths first.');
      const matrix=multiply(parent,transform(element.getAttribute('transform')||''));
      const get=k=>Number(element.getAttribute(k)||0);
      let contours=[];
      if(tag==='path')contours=parsePath(element.getAttribute('d')||'');
      if(tag==='rect'){
        const x=get('x'),y=get('y'),w=get('width'),h=get('height');if(w>0&&h>0)contours=[[make(x,y),make(x+w,y),make(x+w,y+h),make(x,y+h)]];
      }
      if(tag==='circle'||tag==='ellipse'){
        const rx=tag==='circle'?get('r'):get('rx'),ry=tag==='circle'?get('r'):get('ry');
        if(rx>0&&ry>0)contours=Vector.ellipse(get('cx'),get('cy'),rx,ry);
      }
      if(tag==='polygon'){
        const coordinates=[...(element.getAttribute('points')||'').matchAll(number)].map(m=>Number(m[0]));
        if(coordinates.length>=6&&coordinates.length%2===0)contours=[Array.from({length:coordinates.length/2},(_,i)=>make(coordinates[2*i],coordinates[2*i+1]))];
      }
      for(const contour of contours){
        for(const a of contour)for(let i=0;i<6;i+=2){const x=a[i],y=a[i+1];a[i]=matrix[0]*x+matrix[2]*y+matrix[4];a[i+1]=matrix[1]*x+matrix[3]*y+matrix[5];}
        shapes.push(contour);
      }
      for(const child of element.children||[])walk(child,matrix,depth+1);
    }
    walk(svg);
    if(!shapes.length)throw new Error('No filled SVG paths, polygons, rectangles, or ellipses found. Convert artwork to outlines first.');
    if(shapes.length>Vector.MAX_CONTOURS||shapes.reduce((n,c)=>n+c.length,0)>Vector.MAX_POINTS)throw new Error('SVG artwork exceeds the font contour limit.');
    const values=shapes.flatMap(c=>c.flatMap(a=>[[a[0],a[1]],[a[2],a[3]],[a[4],a[5]]]));
    const minX=Math.min(...values.map(v=>v[0])),maxX=Math.max(...values.map(v=>v[0]));
    const minY=Math.min(...values.map(v=>v[1])),maxY=Math.max(...values.map(v=>v[1]));
    const width=maxX-minX,height=maxY-minY;
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('SVG artwork has invalid bounds.');
    const factor=Math.min(620/width,690/height);
    const offsetX=380-(minX+maxX)*factor/2,offsetY=465-(minY+maxY)*factor/2;
    for(const c of shapes)for(const a of c)for(let i=0;i<6;i+=2){a[i]=r(a[i]*factor+offsetX);a[i+1]=r(a[i+1]*factor+offsetY);}
    if(!Vector.valid(shapes))throw new Error('Imported SVG exceeds the editable glyph limits.');
    return shapes;
  }
  return Object.freeze({parsePath,transform,fromDocument});
});
