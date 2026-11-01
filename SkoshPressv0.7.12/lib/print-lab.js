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
  const defaults=Object.freeze({name:'Home Letter Printer',sheetWidth:215.9,sheetHeight:279.4,margin:5,binding:'saddle',duplex:'short',color:'mono',copies:25,paperPerSheet:.08,inkPerSide:.035,staplesPerCopy:.025});
  function valid(value){
    if(!value||typeof value!=='object')throw new Error('Invalid printer profile.');
    const p={...defaults,...value};
    if(typeof p.name!=='string'||!p.name.trim()||p.name.length>70)throw new Error('Profile name must be 1–70 characters.');
    for(const [key,min,max] of [['sheetWidth',50,1000],['sheetHeight',50,1000],['margin',0,35],['paperPerSheet',0,10000],['inkPerSide',0,10000],['staplesPerCopy',0,10000]])if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw new Error(`Invalid ${key}.`);
    if(!Number.isInteger(p.copies)||p.copies<1||p.copies>100000)throw new Error('Copies must be between 1 and 100,000.');
    if(!TYPES.includes(p.binding)||!DUPLEX.includes(p.duplex)||!COLORS.includes(p.color))throw new Error('Invalid printing options.');
    if(p.margin*2>=Math.min(p.sheetWidth,p.sheetHeight))throw new Error('Printable area is too small.');
    return Object.fromEntries(Object.keys(defaults).map(k=>[k,p[k]]));
  }
  function pairs(pages){const padded=Math.ceil(pages/4)*4,rows=[];
    for(let i=0;i<padded/4;i++)rows.push({sheet:i+1,front:[padded-i*2,i*2+1].map(n=>n>pages?null:n),back:[i*2+2,padded-i*2-1].map(n=>n>pages?null:n)});
    return rows;
  }
  function fits(w,h,freeW,freeH){return (w<=freeW+0.0001&&h<=freeH+0.0001)||(h<=freeW+0.0001&&w<=freeH+0.0001);}
  function plan(project,rawProfile){
    const p=valid(rawProfile),pages=project?.pages?.length, paper=project?.paper;
    if(!Number.isInteger(pages)||pages<1||pages>700||!paper||!Number.isFinite(paper.width)||!Number.isFinite(paper.height)||paper.width<=0||paper.height<=0)throw new Error('Invalid publication dimensions.');
    const saddle=p.binding==='saddle',sidesPerCopy=saddle?Math.ceil(pages/4)*2:pages;
    const sheetSides=p.duplex==='none'?1:2;
    const sheetsPerCopy=saddle?Math.ceil(pages/4):Math.ceil(sidesPerCopy/sheetSides);
    const totalSheets=sheetsPerCopy*p.copies,totalPrintedSides=(saddle?sheetsPerCopy*2:pages)*p.copies;
    const fullW=(saddle?paper.width*2:paper.width),fullH=paper.height;
    const freeW=p.sheetWidth-2*p.margin,freeH=p.sheetHeight-2*p.margin;
    const warnings=[];
    if(!fits(fullW,fullH,freeW,freeH))warnings.push('The publication does not fit the printer sheet at 100% scale, including its unprintable margin.');
    if(saddle&&p.duplex==='none')warnings.push('Manual duplex is required: the booklet PDF contains front and back sheet sides.');
    if(saddle&&p.duplex==='long')warnings.push('Check flip-edge orientation with a one-sheet proof; short-edge is a common landscape booklet setting.');
    if(saddle&&pages%4!==0)warnings.push(`The booklet requires ${4-pages%4} blank page${4-pages%4===1?'':'s'} for folding.`);
    if(!saddle&&p.duplex!=='none')warnings.push('Loose-page duplex printing must be enabled in your printer driver.');
    const paperCost=totalSheets*p.paperPerSheet,inkCost=totalPrintedSides*p.inkPerSide,fasteningCost=saddle?p.copies*p.staplesPerCopy:0;
    return {mode:p.binding,physicalFit:fits(fullW,fullH,freeW,freeH),pages,sheetsPerCopy,totalSheets,totalPrintedSides,blankPages:saddle?(4-pages%4)%4:0,fullSheetWidth:fullW,fullSheetHeight:fullH,requiredPrintableWidth:fullW,requiredPrintableHeight:fullH,printerPrintableWidth:freeW,printerPrintableHeight:freeH,paperCost,inkCost,fasteningCost,totalCost:paperCost+inkCost+fasteningCost,costPerCopy:(paperCost+inkCost+fasteningCost)/p.copies,warnings,pairings:saddle?pairs(pages):[]};
  }
  return Object.freeze({defaults,valid,plan,pairs});
});
