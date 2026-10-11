const test=require('node:test');const assert=require('node:assert/strict');
const {toScribusSla,toIndesignRtf,plainFromHtml,pt}=require('../lib/interchange');
const sample={name:'Sample',paper:{width:148,height:210,margin:16},pages:[{frames:[{type:'text',label:'Foo',x:10,y:20,w:80,h:40,style:{fontSize:12},html:'<h1>Hi &amp; bye</h1><p>Résumé — ☺</p>'}]},{frames:[{type:'text',label:'Second',x:10,y:30,w:50,h:60,style:{fontSize:10},html:'<p>Next</p>'}]}]};
test('text interchange safely strips markup',()=>assert.equal(plainFromHtml('<p>X &amp; Y</p><script>bad</script>').includes('<script>'),false));
test('RTF unicode editable text without scripts',()=>{const s=toIndesignRtf(sample).toString();assert.match(s,/\\rtf1/);assert.match(s,/Hi & bye/);assert.match(s,/\\b\\fs40/);assert.match(s,/\\u/);assert.match(s,/Next/);});
test('Scribus XML includes pages and text geometry',()=>{const xml=toScribusSla(sample);assert.match(xml,/SCRIBUSUTF8NEW/);assert.match(xml,/ANZPAGES="2"/);assert.equal((xml.match(/<PAGE NUM=/g)||[]).length,2);assert.match(xml,/FONTSIZE="12"/);assert.match(xml,/Hi &amp; bye/);assert.equal(pt(25.4),72);});
