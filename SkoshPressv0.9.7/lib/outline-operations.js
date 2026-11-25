'use strict';
(function(root,factory){
  const Vector=typeof module==='object'&&module.exports?require('./vector-font'):root.SkoshVectorFont;
  const api=factory(Vector);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshOutlineOperations=api;
})(typeof window!=='undefined'?window:null,Vector=>{
  const rounded=n=>Math.round(n*10)/10;
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const EPS=1e-7;
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
  const diff=(a,b)=>[a[0]-b[0],a[1]-b[1]];
  const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  const cubic=(a,b,c,d,t)=>{const s=1-t;return s*s*s*a+3*s*s*t*b+3*s*t*t*c+t*t*t*d;};
  const signedArea=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
  function flattened(contour){
    const pts=[];
    for(let i=0;i<contour.length;i++){
      const a=contour[i],b=contour[(i+1)%contour.length];
      const extent=Math.hypot(b[0]-a[0],b[1]-a[1])+Math.hypot(a[4]-a[0],a[5]-a[1])+Math.hypot(b[2]-b[0],b[3]-b[1]);
      const steps=clamp(Math.ceil(extent/17),2,42);
      for(let j=0;j<steps;j++){
        const t=j/steps,p=[cubic(a[0],a[4],b[2],b[0],t),cubic(a[1],a[5],b[3],b[1],t)];
        if(!pts.length||dist(pts[pts.length-1],p)>EPS)pts.push(p);
      }
    }
    if(pts.length>1&&dist(pts[0],pts[pts.length-1])<EPS)pts.pop();
    return pts;
  }
  function contains(poly,p){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  }
  function segments(poly,source){return poly.map((a,i)=>({a,b:poly[(i+1)%poly.length],source,t:[0,1]})).filter(e=>dist(e.a,e.b)>EPS);}
  function intersect(e,f){
    const r=diff(e.b,e.a),s=diff(f.b,f.a),den=cross(r,s),d=diff(f.a,e.a);
    if(Math.abs(den)>EPS){
      const t=cross(d,s)/den,u=cross(d,r)/den;
      if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS){e.t.push(clamp(t,0,1));f.t.push(clamp(u,0,1));return true;}
      return false;
    }
    if(Math.abs(cross(d,r))>EPS)return false;
    let hit=false;
    for(const [edge,p] of [[e,f.a],[e,f.b],[f,e.a],[f,e.b]]){
      const v=diff(edge.b,edge.a),len=v[0]*v[0]+v[1]*v[1];
      const t=((p[0]-edge.a[0])*v[0]+(p[1]-edge.a[1])*v[1])/len;
      if(t>=-EPS&&t<=1+EPS){edge.t.push(clamp(t,0,1));hit=true;}
    }
    return hit;
  }
  function rebuild(ring){
    let points=ring.filter((p,i)=>i===0||dist(p,ring[i-1])>.17);
    if(points.length>2&&dist(points[0],points[points.length-1])<.17)points.pop();
    let changed=true;
    while(changed&&points.length>3){
      changed=false;
      for(let i=0;i<points.length;i++){
        const prev=points[(i+points.length-1)%points.length],at=points[i],next=points[(i+1)%points.length];
        const v=diff(next,prev),d=dist(prev,next),height=d?Math.abs(cross(v,diff(at,prev)))/d:0;
        const before=diff(at,prev),after=diff(next,at),cos=(before[0]*after[0]+before[1]*after[1])/(dist(at,prev)*dist(next,at)||1);
        if(height<.9&&cos>.92){points.splice(i,1);changed=true;break;}
      }
    }
    if(points.length<3||points.length>Vector.MAX_NODES)throw new Error('Result is too detailed for one contour. Simplify the input paths or use smaller shapes.');
    return points.map((p,i)=>{
      const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
      const a=diff(p,prev),b=diff(next,p),da=dist(prev,p),db=dist(p,next);
      const co=(a[0]*b[0]+a[1]*b[1])/(da*db||1);
      const tangent=diff(next,prev),length=Math.hypot(...tangent);
      if(co<.80||length<EPS)return Vector.anchor(p[0],p[1]);
      const ux=tangent[0]/length,uy=tangent[1]/length;
      const back=Math.min(da*.35,db*.35),forward=Math.min(db*.35,da*.35);
      return Vector.anchor(p[0],p[1],p[0]-ux*back,p[1]-uy*back,p[0]+ux*forward,p[1]+uy*forward);
    });
  }
  function normalized(contour,positive){
    const pts=flattened(contour),actual=signedArea(pts)>0;
    return actual===positive?Vector.copy([contour])[0]:Vector.reverse([contour],0)[0];
  }
  function boolean(glyph,first,second,operation){
    if(!Vector.valid(glyph))throw new Error('Invalid glyph.');
    if(!['union','subtract','intersect'].includes(operation))throw new Error('Choose Combine, Subtract, or Intersect.');
    if(!Number.isInteger(first)||!Number.isInteger(second)||first===second||!glyph[first]||!glyph[second])throw new Error('Choose two different contours.');
    const A=flattened(glyph[first]),B=flattened(glyph[second]);
    if(A.length<3||B.length<3||Math.abs(signedArea(A))<3||Math.abs(signedArea(B))<3)throw new Error('Contours need a closed, non-empty shape before combining.');
    const aEdges=segments(A,0),bEdges=segments(B,1);
    if(aEdges.length>700||bEdges.length>700||aEdges.length*bEdges.length>180000)throw new Error('Paths are too complex for this operation. Simplify the contours first.');
    let crossings=0;
    for(const a of aEdges)for(const b of bEdges)if(intersect(a,b))crossings++;
    const others=glyph.filter((_,i)=>i!==first&&i!==second);
    if(!crossings){
      const aInB=contains(B,A[0]),bInA=contains(A,B[0]);
      let result=[];
      if(operation==='union')result=aInB?[normalized(glyph[second],true)]:bInA?[normalized(glyph[first],true)]:[normalized(glyph[first],true),normalized(glyph[second],true)];
      if(operation==='intersect')result=aInB?[normalized(glyph[first],true)]:bInA?[normalized(glyph[second],true)]:[];
      if(operation==='subtract')result=aInB?[]:bInA?[normalized(glyph[first],true),normalized(glyph[second],false)]:[normalized(glyph[first],true)];
      const complete=[...others,...result];
      if(!Vector.valid(complete))throw new Error('Result exceeds glyph limits.');
      return complete;
    }
    const edges=[...aEdges,...bEdges];
    const key=p=>`${Math.round(p[0]*1000)},${Math.round(p[1]*1000)}`;
    const evaluate=p=>{
      const a=contains(A,p),b=contains(B,p);
      return operation==='union'?a||b:operation==='subtract'?a&&!b:a&&b;
    };
    const directed=new Map();
    for(const edge of edges){
      const ts=[...new Set(edge.t.map(t=>Math.round(t*1e8)/1e8))].sort((a,b)=>a-b);
      for(let j=0;j<ts.length-1;j++){
        const from=lerp(edge.a,edge.b,ts[j]),to=lerp(edge.a,edge.b,ts[j+1]);
        const len=dist(from,to);if(len<.0005)continue;
        const mid=lerp(from,to,.5),normal=[-(to[1]-from[1])/len,(to[0]-from[0])/len];
        const epsilon=Math.min(.15,len*.18),left=evaluate([mid[0]+normal[0]*epsilon,mid[1]+normal[1]*epsilon]),right=evaluate([mid[0]-normal[0]*epsilon,mid[1]-normal[1]*epsilon]);
        if(left===right)continue;
        const start=left?from:to,end=left?to:from,forward=key(start)+'>'+key(end);
        directed.set(forward,{start,end,from:key(start),to:key(end),used:false});
      }
    }
    const adjacency=new Map();
    for(const edge of directed.values()){if(!adjacency.has(edge.from))adjacency.set(edge.from,[]);adjacency.get(edge.from).push(edge);}
    const rings=[];
    for(const starting of directed.values()){
      if(starting.used)continue;
      let cur=starting,steps=0,ring=[];
      while(cur&&!cur.used&&steps++<=directed.size+1){
        cur.used=true;ring.push(cur.start);
        if(cur.to===starting.from)break;
        const available=(adjacency.get(cur.to)||[]).filter(e=>!e.used);
        if(!available.length)throw new Error('The outlines touch or self-intersect in a way that cannot be joined. Move the contours slightly and retry.');
        if(available.length===1){cur=available[0];continue;}
        const travel=diff(cur.end,cur.start),angle=Math.atan2(travel[1],travel[0]);
        available.sort((a,b)=>{
          const turn=e=>Math.abs(Math.atan2(cross(travel,diff(e.end,e.start)),travel[0]*(e.end[0]-e.start[0])+travel[1]*(e.end[1]-e.start[1])));
          return turn(a)-turn(b);
        });
        cur=available[0];
      }
      if(cur?.to!==starting.from)throw new Error('Could not close a Boolean outline. Adjust the source contours and retry.');
      if(ring.length>=3&&Math.abs(signedArea(ring))>2)rings.push(ring);
    }
    const completed=[...others,...rings.map(rebuild)];
    if(!Vector.valid(completed))throw new Error('Boolean result exceeds the editable outline limits. Simplify the source shapes first.');
    return completed;
  }
  function weight(glyph,amount,contourIndex=null){
    if(!Vector.valid(glyph))throw new Error('Invalid glyph.');
    if(!Number.isInteger(amount)||amount<-60||amount>60)throw new Error('Weight must be between −60 and +60 font units.');
    if(contourIndex!==null&&(!Number.isInteger(contourIndex)||!glyph[contourIndex]))throw new Error('Select a contour first.');
    if(amount===0)return Vector.copy(glyph);
    const outlines=glyph.map(flattened),changed=Vector.copy(glyph);
    for(let index=0;index<glyph.length;index++){
      if(contourIndex!==null&&index!==contourIndex)continue;
      const ring=outlines[index],area=signedArea(ring);
      if(ring.length>1000)throw new Error('This contour is too detailed for automatic weight. Simplify the outline first.');
      if(Math.abs(area)<2)throw new Error('The selected contour is too small to adjust its weight.');
      const sample=ring[0],depth=outlines.reduce((n,other,j)=>n+(j!==index&&contains(other,sample)?1:0),0);
      const polarity=Math.sign(area)*(depth%2?-1:1);
      const moved=ring.map((p,i)=>{
        const before=ring[(i+ring.length-1)%ring.length],after=ring[(i+1)%ring.length];
        const edgeIn=diff(p,before),edgeOut=diff(after,p),lenIn=Math.hypot(...edgeIn),lenOut=Math.hypot(...edgeOut);
        const n1=[polarity*edgeIn[1]/lenIn,-polarity*edgeIn[0]/lenIn],n2=[polarity*edgeOut[1]/lenOut,-polarity*edgeOut[0]/lenOut];
        let bisector=[n1[0]+n2[0],n1[1]+n2[1]],length=Math.hypot(...bisector);
        if(length<EPS){bisector=n2;length=1;}
        const normal=[bisector[0]/length,bisector[1]/length],denom=Math.max(.33,normal[0]*n2[0]+normal[1]*n2[1]);
        return [p[0]+amount*normal[0]/denom,p[1]+amount*normal[1]/denom];
      });
      if(Math.sign(signedArea(moved))!==Math.sign(area)||Math.abs(signedArea(moved))<12)throw new Error('Weight collapses a contour. Try a smaller value.');
      changed[index]=rebuild(moved);
    }
    if(!Vector.valid(changed))throw new Error('Weight exceeds the editable glyph area or outline limits. Try a smaller value.');
    return changed;
  }
  return Object.freeze({flattened,boolean,weight});
});
