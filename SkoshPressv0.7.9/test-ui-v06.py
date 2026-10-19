from playwright.sync_api import sync_playwright
from pathlib import Path
import re,base64
root=Path(__file__).parent
html=(root/'src/index.html').read_text()
for name in ('icon-32.png',):
 data=(root/'assets'/name).read_bytes()
 html=html.replace('../assets/'+name,'data:image/png;base64,'+base64.b64encode(data).decode())
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>','',html)
html=re.sub(r'<script[^>]*></script>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1530,'height':960})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html)
 page.add_style_tag(content=(root/'src/styles.css').read_text())
 page.add_script_tag(content=(root/'lib/booklet.js').read_text())
 page.add_script_tag(content=(root/'lib/units.js').read_text())
 page.add_script_tag(content='''window._mock={dirties:[],saveResult:null,saveCount:0,closeSave:null};
  window.skoshPressAPI={reportDirty:v=>window._mock.dirties.push(v),onSaveBeforeClose:fn=>{window._mock.closeSave=fn;return ()=>{}},saveProject:async(doc)=>{window._mock.saveCount++;return window._mock.saveResult;},setSpelling:async()=>{},listDictionaries:async()=>({installed:[],platform:'win32'})};''')
 page.add_script_tag(content=(root/'src/app.js').read_text())
 assert page.locator('.frame').count()==2, errors
 assert page.evaluate('window._mock.dirties.at(-1)') is False
 print('PASS: startup and initial clean state')
 
 page.evaluate("document.querySelector('#tab-document').click()")
 assert page.locator('#tab-document').evaluate('(el)=>el.classList.contains("tactile-click")')
 assert page.locator('#tab-document').evaluate('(el)=>getComputedStyle(el).animationName')=='press-pop'
 print('PASS: tactile click pulse triggered')
 page.locator('#settings-btn').click()
 page.locator('#settings-reduced-motion').check()
 assert page.evaluate('document.documentElement.dataset.reducedMotion')=='true'
 page.locator('#settings-done').click()
 page.evaluate("document.querySelector('#tab-fonts').click()")
 assert page.locator('#tab-fonts').evaluate('(el)=>el.classList.contains("tactile-click")') is False
 assert page.locator('#tab-fonts').evaluate('(el)=>getComputedStyle(el).animationName')=='none'
 print('PASS: application reduced-motion toggle suppresses animation')
 page.locator('#settings-btn').click();page.locator('#settings-reduced-motion').uncheck();page.locator('#settings-done').click()
 page.emulate_media(reduced_motion='reduce')
 page.evaluate("document.querySelector('#tab-object').click()")
 assert page.locator('#tab-object').evaluate('(el)=>getComputedStyle(el).animationName')=='none'
 print('PASS: OS prefers-reduced-motion overrides animations')
 page.emulate_media(reduced_motion='no-preference')
 
 page.locator('#doc-name').fill('Publication in progress');page.locator('#doc-name').press('Tab')
 assert page.evaluate('window._mock.dirties.at(-1)') is True
 canceled=page.evaluate('window._mock.closeSave()')
 assert canceled is False
 assert page.evaluate('window._mock.dirties.at(-1)') is True
 page.evaluate("window._mock.saveResult={path:'C:/demo/test.skoshpress'}")
 saved=page.evaluate('window._mock.closeSave()')
 assert saved is True
 assert page.evaluate('window._mock.dirties.at(-1)') is False
 print('PASS: dirty status; canceled save keeps changes; successful save cleans state')
 frame=page.locator('.frame-text').first
 frame.dblclick(position={'x':15,'y':30},force=True)
 frame.press('End');frame.type('Hello')
 assert page.evaluate('window._mock.dirties.at(-1)') is True
 assert errors==[],errors
 print('PASS: in-progress editable text signals unsaved state before blur')
 browser.close()
