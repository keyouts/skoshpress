'use strict';
// Print Planning
                 
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshPrintLab=api;
})(typeof window!=='undefined'?window:null,()=>{
  const TYPES=['loose','saddle'];
  const DUPLEX=['none','long','short'];
  const COLORS=['mono','color'];
  const defaults=Object.freeze({name:'Home Letter Printer',sheetWidth:215.9,sheetHeight:279.4,margin:5,binding:'saddle',duplex:'short',color:'mono',copies:25,bleed:0,cropMarks:false,bindingGutter:0,signaturePages:0,paperWeight:90,paperFinish:'uncoated',grain:'unknown',targetDpi:300,orientation:'auto',caliper:0});
  function valid(value){
    if(!value||typeof value!=='object')throw new Error('Invalid printer profile.');
    const p={...defaults,...value};
    if(typeof p.name!=='string'||!p.name.trim()||p.name.length>70)throw new Error('Profile name must be 1–70 characters.');
    for(const [key,min,max] of [['sheetWidth',50,1000],['sheetHeight',50,1000],['margin',0,35],['bleed',0,25],['bindingGutter',0,50],['paperWeight',40,500],['targetDpi',72,1200],['caliper',0,0.5]])if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw new Error(`Invalid ${key}.`);
    if(!Number.isInteger(p.copies)||p.copies<1||p.copies>100000)throw new Error('Copies must be between 1 and 100,000.');
    if(!TYPES.includes(p.binding)||!DUPLEX.includes(p.duplex)||!COLORS.includes(p.color))throw new Error('Invalid printing options.');
    if(typeof p.cropMarks!=='boolean'||!Number.isInteger(p.signaturePages)||p.signaturePages<0||p.signaturePages>64||p.signaturePages%4!==0||!['uncoated','coated','matte','gloss'].includes(p.paperFinish)||!['unknown','long','short'].includes(p.grain)||!['auto','portrait','landscape'].includes(p.orientation))throw new Error('Invalid production settings.');
    if(p.margin*2>=Math.min(p.sheetWidth,p.sheetHeight))throw new Error('Printable area is too small.');
    return Object.fromEntries(Object.keys(defaults).map(k=>[k,p[k]]));
  }
  function restoreProfile(raw){
    if(!raw||typeof raw!=='object')throw new Error('Invalid printer profile.');
    return valid(raw);
  }
  function pairs(pages){const padded=Math.ceil(pages/4)*4,rows=[];
    for(let i=0;i<padded/4;i++)rows.push({sheet:i+1,front:[padded-i*2,i*2+1].map(n=>n>pages?null:n),back:[i*2+2,padded-i*2-1].map(n=>n>pages?null:n)});
    return rows;
  }
  function signaturePairs(pages,size=0){
    if(!Number.isInteger(pages)||pages<1||pages>700||!Number.isInteger(size)||size<0||size>64||size%4!==0)throw new Error('Invalid signature size or page count.');
    const rows=[];let offset=0,signature=0;
    while(offset<pages){
      signature++;const count=Math.min(size||pages,pages-offset);
      for(const row of pairs(count))rows.push({sheet:rows.length+1,signature,signatureSheet:row.sheet,front:row.front.map(n=>n===null?null:n+offset),back:row.back.map(n=>n===null?null:n+offset)});
      offset+=count;
    }
    return rows;
  }
  function sheetGeometry(paper,rawProfile){
    const p=valid(rawProfile),w=paper?.width,h=paper?.height;
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<50||h<50||w>1000||h>1000)throw new Error('Invalid publication dimensions.');
    const spread=p.binding==='saddle',trimWidth=w*(spread?2:1),markAllowance=p.cropMarks?5:0,edge=p.bleed+markAllowance;
    const requiredWidth=trimWidth+2*edge,requiredHeight=h+2*edge;
    const short=Math.min(p.sheetWidth,p.sheetHeight),long=Math.max(p.sheetWidth,p.sheetHeight);
    const candidates=p.orientation==='portrait'?[[short,long]]:p.orientation==='landscape'?[[long,short]]:[[p.sheetWidth,p.sheetHeight],[p.sheetHeight,p.sheetWidth]];
    const score=([width,height])=>Math.min((width-2*p.margin)/requiredWidth,(height-2*p.margin)/requiredHeight);
    const [width,height]=candidates.reduce((best,next)=>score(next)>score(best)+1e-9?next:best);
    const x=(width-trimWidth)/2,y=(height-h)/2,b=p.bleed;
    const cells=Array.from({length:spread?2:1},(_,i)=>({x:x+i*w,y,w,h,leftBleed:spread&&i===1?0:b,rightBleed:spread&&i===0?0:b,topBleed:b,bottomBleed:b}));
    const marks=[];
    if(p.cropMarks){
      for(const yy of [y,y+h]){marks.push({x:x-b-5,y:yy,w:4,h:.15},{x:x+trimWidth+b+1,y:yy,w:4,h:.15});}
      for(const xx of [x,...(spread?[x+w]:[]),x+trimWidth])marks.push({x:xx,y:y-b-5,w:.15,h:4},{x:xx,y:y+h+b+1,w:.15,h:4});
    }
    return {width,height,trimWidth,trimHeight:h,requiredWidth,requiredHeight,cells,marks,fit:score([width,height])>=1-1e-8};
  }
  function sheetSides(pages,rawProfile){
    const p=valid(rawProfile);
    if(!Number.isInteger(pages)||pages<1||pages>700)throw new Error('Invalid publication page count.');
    if(p.binding==='saddle')return signaturePairs(pages,p.signaturePages).flatMap(row=>['front','back'].map(face=>({sheet:row.sheet,signature:row.signature,signatureSheet:row.signatureSheet,face,pages:row[face],...(p.caliper?{creep:Math.round((row.signatureSheet-1)*p.caliper*1000)/1000}:{})})));
    return Array.from({length:pages},(_,i)=>({sheet:p.duplex==='none'?i+1:Math.floor(i/2)+1,signature:null,face:p.duplex==='none'||i%2===0?'front':'back',pages:[i+1]}));
  }
  function plan(project,rawProfile){
    const p=valid(rawProfile),pages=project?.pages?.length,paper=project?.paper;
    const sides=sheetSides(pages,p),geometry=sheetGeometry(paper,p),saddle=p.binding==='saddle';
    const pairings=saddle?signaturePairs(pages,p.signaturePages):[],sheetsPerCopy=sides.at(-1).sheet;
    const totalSheets=sheetsPerCopy*p.copies,totalPrintedSides=sides.length*p.copies;
    const maxCreep=Math.max(0,...sides.map(s=>s.creep||0));
    const blankPages=saddle?sides.length*2-pages:0,warnings=[];
    if(!geometry.fit)warnings.push('The publication does not fit the printer sheet at 100% scale, including bleed, marks and its unprintable margin.');
    if(saddle&&p.duplex==='none')warnings.push('Manual duplex is required: the booklet PDF contains front and back sheet sides.');
    if(saddle&&p.duplex==='long')warnings.push('Check flip-edge orientation with a one-sheet proof; short-edge is a common landscape booklet setting.');
    if(blankPages)warnings.push(`The booklet requires ${blankPages} blank page${blankPages===1?'':'s'} for folding.`);
    if(!saddle&&p.duplex!=='none')warnings.push('Loose-page duplex printing must be enabled in your printer driver.');
    if(saddle&&p.grain!=='unknown'&&geometry.width!==geometry.height&&p.grain!==(geometry.height>geometry.width?'long':'short'))warnings.push('Declared paper grain runs across the fold. Check folding and cracking with the selected stock.');
    if(maxCreep>0)warnings.push(`Maximum inward creep adjustment: ${maxCreep.toFixed(2)} mm. Verify with a folded physical proof.`);
    if(maxCreep>=paper.width/2)warnings.push('Creep exceeds half the page width; reduce stock caliper or signature size.');
    if(p.bindingGutter>=paper.width/2)warnings.push('Binding gutter occupies at least half of the page width.');
    return {mode:p.binding,physicalFit:geometry.fit&&maxCreep<paper.width/2,maxCreep,profile:p,pages,sheetsPerCopy,totalSheets,totalPrintedSides,blankPages,fullSheetWidth:geometry.trimWidth,fullSheetHeight:geometry.trimHeight,requiredPrintableWidth:geometry.requiredWidth,requiredPrintableHeight:geometry.requiredHeight,printerPrintableWidth:geometry.width-2*p.margin,printerPrintableHeight:geometry.height-2*p.margin,warnings,pairings,sides,geometry,signatures:saddle?pairings.at(-1).signature:0,paperMassKg:totalSheets*p.sheetWidth*p.sheetHeight*p.paperWeight/1e9};
  }
  function productionIssues(doc,rawProfile,imageDimensions){
    const p=valid(rawProfile),issues=[],w=doc.paper.width,h=doc.paper.height,b=p.bleed;
    const creepByPage=new Map(sheetSides(doc.pages.length,p).flatMap(side=>side.pages.filter(n=>n!==null).map(n=>[n-1,side.creep||0])));
    const add=(severity,page,frame,title)=>{if(issues.length<400)issues.push({severity,page,frameId:frame?.id||null,title});};
    doc.pages.forEach((page,index)=>{
      for(const f of page.frames||[]){
        const shift=(creepByPage.get(index)||0)*(index%2===0?-1:1),right=f.x+f.w+shift,bottom=f.y+f.h,edges=[f.x+shift,f.y,w-right,h-bottom];
        const outerEdges=edges.filter((_,i)=>p.binding!=='saddle'||i!==(index%2===0?0:2));
        if(f.x+shift < -b-.05||f.y < -b-.05||right>w+b+.05||bottom>h+b+.05)add('error',index,f,'Object exceeds configured bleed area');
        if(f.type==='text'){
          if(Math.min(...edges)<-.05)add('error',index,f,'Text crosses the trim edge');
          else if(Math.min(...edges)<3)add('warning',index,f,'Text is within 3 mm of trim');
          const inner=index%2===0?f.x+shift:w-right;
          if(p.bindingGutter>0&&inner<p.bindingGutter-.05)add('warning',index,f,'Text enters the binding gutter');
        }else if(f.type==='image'){
          if(b>0&&outerEdges.some(edge=>edge<=.05&&edge>-b+.05))add('warning',index,f,'Edge artwork does not reach the full bleed');
          const dimensions=imageDimensions?.(f.src);
          if(dimensions&&f.w>0&&f.h>0){const x=dimensions.width*25.4/f.w,y=dimensions.height*25.4/f.h;const dpi=Math.round(f.fit==='contain'?Math.max(x,y):Math.min(x,y));if(dpi<p.targetDpi)add('warning',index,f,`Image resolution ${dpi} dpi is below the ${p.targetDpi} dpi target`);}
          else if(imageDimensions)add('warning',index,f,'Image resolution could not be determined');
          if(f.fit==='contain'&&b>0&&outerEdges.some(edge=>edge<=.05))add('warning',index,f,'Contained artwork may leave an unprinted bleed edge');
        }
      }
    });
    return issues;
  }
  function enteredCostTotal(amounts){
    let cents=0,entered=0;
    for(const value of amounts){
      if(typeof value!=='string')throw new Error('Enter a nonnegative amount with up to two decimal places.');
      const text=value.trim();if(!text)continue;
      if(!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(text)||Number(text)>1000000000)throw new Error('Enter an amount from 0 to 1,000,000,000 with up to two decimal places.');
      const [whole,fraction='']=text.split('.');
      cents+=Number(whole||'0')*100+Number(fraction.padEnd(2,'0'));entered++;
    }
    return entered?cents/100:null;
  }
  return Object.freeze({defaults,valid,restoreProfile,enteredCostTotal,plan,pairs,signaturePairs,sheetGeometry,sheetSides,productionIssues});
});
