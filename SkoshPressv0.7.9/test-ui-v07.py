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
 page=browser.new_page(viewport={'width':1530,'height':1000})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html)
 page.add_style_tag(content=(root/'src/styles.css').read_text())
 for name in ('booklet.js','units.js','revisions.js','print-lab.js'):
  page.add_script_tag(content=(root/'lib'/name).read_text())
 page.add_script_tag(content='''window._mock={dirties:[],profiles:[],doc:null,saveCount:0,deleted:false};
 window.skoshPressAPI={reportDirty:v=>_mock.dirties.push(v),setSpelling:async()=>{},listDictionaries:async()=>({installed:[],platform:'win32'}),
 saveProject:async doc=>{_mock.doc=JSON.parse(JSON.stringify(doc));_mock.saveCount++;return {path:'C:/books/book.skoshpress'};},
 chooseRevisionBaseline:async()=>({name:'Old edition.skoshpress',document:JSON.parse(JSON.stringify(_mock.doc))}),
 listPrinterProfiles:async()=>_mock.profiles,
 savePrinterProfile:async(row,id)=>{const result={...row,id:id||'11111111-1111-4111-8111-111111111111'};_mock.profiles=_mock.profiles.filter(p=>p.id!==result.id).concat(result);return result;},
 deletePrinterProfile:async id=>{_mock.profiles=_mock.profiles.filter(p=>p.id!==id);return true;},
 onSaveBeforeClose:fn=>{_mock.closeSave=fn},
 onMenu:fn=>{_mock.menu=fn}};''')
 page.add_script_tag(content=(root/'src/app.js').read_text())
 assert page.locator('.frame').count()==2, errors
 assert page.locator('#page-list .page-list-item').count()==1
 print('PASS initial publication and toolbar')
 page.locator('#save-btn').click()
 assert page.evaluate('_mock.doc.pages.length')==1
 page.locator('#add-page-btn').click()
 assert page.locator('#page-list .page-list-item').count()==2
 page.locator('#revisions-btn').click()
 assert page.locator('#revisions-dialog').evaluate('(el)=>el.open')
 page.locator('#revision-load').click()
 assert '1 change found' in page.locator('#revision-summary').inner_text()
 assert page.locator('#revision-results button').count()>0
 assert 'page count' in page.locator('#revision-results').inner_text().lower()
 page.screenshot(path='/mnt/data/Skosh-Press-v0.7-Revisions.png',full_page=True)
 page.locator('#revisions-close').click()
 print('PASS baseline comparison and changes')
 page.locator('#print-lab-btn').click()
 assert page.locator('#print-lab-dialog').evaluate('(el)=>el.open')
 assert 'TOTAL SHEETS' in page.locator('#lab-output').inner_text()
 page.locator('#lab-copies').fill('10')
 assert 'TOTAL SHEETS' in page.locator('#lab-output').inner_text()
 page.locator('#lab-save-profile').click()
 assert page.locator('#lab-saved-profile option').count()==2
 assert page.locator('#lab-delete-profile').is_enabled()
 assert page.evaluate('_mock.profiles.length')==1
 page.locator('#lab-binding').select_option('loose')
 assert page.locator('#lab-export-booklet').is_disabled()
 page.locator('#lab-binding').select_option('saddle')
 assert page.locator('#lab-export-booklet').is_enabled()
 print('PASS printer profiles, real-time costs, and booklet plan')
 page.screenshot(path='/mnt/data/Skosh-Press-v0.7-Print-Lab.png',full_page=True)
 page.locator('#print-lab-close').click()
 assert errors==[],errors
 page.screenshot(path='/mnt/data/Skosh-Press-v0.7-preview.png',full_page=True)
 print('PASS no script exceptions, screenshot saved')
 browser.close()
