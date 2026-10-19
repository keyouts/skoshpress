'use strict';
// Unit Conversion
                                                                                        
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SkoshUnits = api;
})(typeof window !== 'undefined' ? window : null, () => {
  const FACTORS = Object.freeze({mm:1, cm:10, in:25.4, pt:25.4/72, pc:25.4/6, px:25.4/96});
  const LABELS = Object.freeze({mm:'Millimeters (mm)',cm:'Centimeters (cm)',in:'Inches (in)',pt:'Points (pt)',pc:'Picas (pc)',px:'Pixels (96 dpi)',custom:'Custom units'});
  function mmPerUnit(unit, perInch = 10) {
    if (unit === 'custom') {
      if (!Number.isFinite(perInch) || perInch <= 0 || perInch > 100000) throw new RangeError('Custom units per inch must be between 0 and 100,000.');
      return 25.4/perInch;
    }
    if (!Object.hasOwn(FACTORS, unit)) throw new RangeError('Unknown print unit.');
    return FACTORS[unit];
  }
  const toMm = (value, unit, perInch) => Number(value)*mmPerUnit(unit,perInch);
  const fromMm = (value, unit, perInch) => Number(value)/mmPerUnit(unit,perInch);
  function display(value, unit, perInch) {
    const transformed=fromMm(value,unit,perInch);
    return Number(transformed.toFixed(unit==='px'||unit==='pt'?2:unit==='in'||unit==='pc'||unit==='custom'?3:2));
  }
  function columnBounds(paper) {
    const count=Math.max(1,Math.min(12,Math.floor(paper.columns||1)));
    const margin=paper.margin;
    const gutter=Math.max(0,Math.min(Number(paper.gutter)||0,25));
    const available=paper.width-2*margin-(count-1)*gutter;
    if(available<=0) return {count:1,gutter:0,width:paper.width-2*margin,starts:[margin],ends:[paper.width-margin],guides:[margin,paper.width-margin]};
    const width=available/count;
    const starts=Array.from({length:count},(_,i)=>margin+i*(width+gutter));
    const ends=starts.map(x=>x+width);
    return {count,gutter,width,starts,ends,guides:[...new Set([...starts,...ends])]};
  }
  function snapX(x,width,paper,toleranceMm=2) {
    const guides=columnBounds(paper).guides;
    let candidate=x,best=toleranceMm+0.000001;
    for(const point of guides)for(const edge of [0,width]){
      const distance=Math.abs(x+edge-point);
      if(distance<best){best=distance;candidate=point-edge;}
    }
    return candidate;
  }
  // Ruler Measurements
  function rulerMarks(lengthMm,pxPerMm,unit='mm',perInch=10) {
    if(!Number.isFinite(lengthMm)||lengthMm<=0||lengthMm>1000||!Number.isFinite(pxPerMm)||pxPerMm<=0||pxPerMm>20)throw new RangeError('Ruler dimensions must be finite and positive.');
    const unitMm=mmPerUnit(unit,perInch);
    const pixelsPerUnit=unitMm*pxPerMm;
    const desiredStep=60/pixelsPerUnit;
    const magnitude=10**Math.floor(Math.log10(desiredStep));
    const majorStep=[1,2,5,10].map(n=>n*magnitude).find(step=>step>=desiredStep) || 10*magnitude;
    const minorDivision=majorStep*pixelsPerUnit/5>=9?5:2;
    const minorStep=majorStep/minorDivision;
    const totalUnits=fromMm(lengthMm,unit,perInch);
    const count=Math.min(1500,Math.floor(totalUnits/minorStep+1e-8));
    const marks=[];
    for(let i=0;i<=count;i++) {
      const value=i*minorStep;
      const pixel=value*pixelsPerUnit;
      if(pixel>lengthMm*pxPerMm+0.1)break;
      const major=i%minorDivision===0;
      const rounded=Number(value.toPrecision(10));
      marks.push({pixel,major,label:major?String(rounded):''});
    }
    return marks;
  }
  return Object.freeze({FACTORS,LABELS,mmPerUnit,toMm,fromMm,display,columnBounds,snapX,rulerMarks});
});
