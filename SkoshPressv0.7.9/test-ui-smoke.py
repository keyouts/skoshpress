from playwright.sync_api import sync_playwright
from pathlib import Path
import re, json, base64
root=Path(__file__).resolve().parent
html=(root/'src/index.html').read_text()
icon_data='data:image/png;base64,'+base64.b64encode((root/'assets/icon-32.png').read_bytes()).decode('ascii')
html=html.replace('../assets/icon-32.png',icon_data)
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>','',html)
html=re.sub(r'<script[^>]*></script>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1530,'height':960})
 page.on('dialog',lambda d:d.accept())
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html)
 page.add_style_tag(content=(root/'src/styles.css').read_text())
 page.add_script_tag(content=(root/'lib/booklet.js').read_text())
 page.add_script_tag(content=(root/'lib/units.js').read_text())
 page.add_script_tag(content='''window._mock={saved:[],exports:[],spelling:[],templates:[]};
   window.skoshPressAPI={
    resetProjectPath:async()=>true,
    saveProject:async(doc)=>{window._mock.saved.push(JSON.parse(JSON.stringify(doc)));return {path:'C:/test/default.skoshpress'};},
    openProject:async()=>null,importManuscript:async()=>({name:'Story',html:'<h1>Imported story</h1><p>Text from a document.</p>'}),
    importImage:async()=>null,importFont:async()=>null,
    exportPdf:async(html,w,h,booklet)=>{window._mock.exports.push({html,w,h,booklet});return {path:'C:/test/doc.pdf'};},
    setSpelling:async(enabled,language)=>{window._mock.spelling.push({enabled,language});},
    listTemplates:async()=>window._mock.templates.map((d,i)=>({name:d.name,id:String(i),pages:d.doc.pages.length})),
    saveTemplate:async(name,doc)=>{window._mock.templates.push({name,doc:JSON.parse(JSON.stringify(doc))});return {id:'mock'};},
    loadTemplate:async(id)=>JSON.parse(JSON.stringify(window._mock.templates[Number(id)].doc)),
    deleteTemplate:async(id)=>{window._mock.templates.splice(Number(id),1);return true;}
   };''')
 page.add_script_tag(content=(root/'src/app.js').read_text())
 assert page.locator('.page-list-item').count()==1,errors
 assert page.locator('.frame').count()==2,errors
 assert page.locator('.page-row-name').first.inner_text().startswith('DEFAULT')
 print('PASS: populated Default startup')
 page.locator('#tab-document').click()
 assert page.locator('#inspector-document').is_visible()
 assert page.locator('#tab-document').evaluate('(b)=>b.scrollWidth<=b.clientWidth+1')
 print('PASS: DOCUMENT inspector tab fits')
 page.locator('#page-columns').fill('3');page.locator('#page-columns').press('Tab')
 assert page.locator('.column-guide').count()==6
 page.locator('#page-gutter').fill('6');page.locator('#page-gutter').press('Tab')
 assert abs(page.locator('.column-guide').count()-6)<1
 print('PASS: 3-column guides and gutter inputs')
 page.locator('#measurement-units').select_option('in')
 assert page.locator('#page-width').input_value()=='5.827'
 page.locator('#measurement-units').select_option('pt')
 assert abs(float(page.locator('#page-width').input_value())-419.53)<.02
 page.locator('#measurement-units').select_option('custom')
 page.locator('#custom-units-per-inch').fill('8');page.locator('#custom-units-per-inch').press('Tab')
 assert abs(float(page.locator('#page-width').input_value())-46.614)<0.01
 print('PASS: physical unit conversions including user-defined custom')
 page.locator('#measurement-units').select_option('mm')
 page.locator('#nudge-step').select_option('pixel')
 page.locator('#tab-object').click()
 frame=page.locator('.frame').first
 frame.click(position={'x':15,'y':35},force=True)
 assert page.locator('#frame-inspector').is_visible()
 original=float(page.locator('#frame-x').input_value())
 frame.press('ArrowRight')
 assert page.locator('#coordinate-hud').is_visible(),errors
 nudged=float(page.locator('#frame-x').input_value())
 assert abs(nudged-original-.2646)<0.015,(nudged,original)
 page.keyboard.down('Shift');frame.press('ArrowDown');page.keyboard.up('Shift')
 print('PASS: arrow movement and blue coordinates HUD')
 page.locator('.frame-text').first.dblclick(position={'x':15,'y':35},force=True)
 assert page.locator('.frame-text').first.get_attribute('contenteditable')=='true'
 page.locator('.frame-text').first.press('Escape')
 print('PASS: double-click text edit')
 page.locator('#settings-btn').click()
 page.locator('#settings-spellcheck').uncheck()
 page.locator('#settings-spelling-language').select_option('en-GB')
 assert page.evaluate('window._mock.spelling.at(-1)')=={'enabled':False,'language':'en-GB'}
 page.locator('#settings-done').click()
 print('PASS: Electron spellcheck preference bridge')
 page.locator('#save-btn').click(); page.wait_for_timeout(40)
 saved=page.evaluate('window._mock.saved')
 assert len(saved)==1 and saved[0]['paper']['columns']==3 and saved[0]['paper']['gutter']==6,saved
 page.locator('#pdf-btn').click();page.locator('#booklet-btn').click();page.wait_for_timeout(40)
 exps=page.evaluate('window._mock.exports')
 assert len(exps)==2 and not exps[0]['booklet'] and exps[1]['booklet']
 assert 'column-guide' not in exps[0]['html']
 print('PASS: save, both export buttons, no printable columns')
 page.locator('#templates-btn').click();assert page.locator('#builtin-templates button').count()==4
 page.locator('#template-name').fill('Reusable 3 col layout');page.locator('#template-save').click()
 page.wait_for_timeout(50);assert page.locator('#user-templates button.template-entry').count()==1
 print('PASS: templates')
 page.locator('#templates-close').click()
 page.screenshot(path='/mnt/data/Skosh-Press-v0.4-preview.png',full_page=True)
 print('Browser exceptions:',errors)
 assert not errors
 browser.close()
