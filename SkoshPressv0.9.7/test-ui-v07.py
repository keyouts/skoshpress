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
 page.add_script_tag(content='''window._mock={dirties:[],profiles:[],doc:null,saveCount:0,deleted:false};
 window.skoshPressAPI={reportDirty:v=>_mock.dirties.push(v),setSpelling:async()=>{},listDictionaries:async()=>({installed:[],platform:'win32'}),
 saveProject:async doc=>{_mock.doc=JSON.parse(JSON.stringify(doc));_mock.saveCount++;return {path:'C:/books/book.skoshpress'};},
 chooseRevisionBaseline:async()=>({name:'Old edition.skoshpress',document:JSON.parse(JSON.stringify(_mock.doc))}),
 listPrinterProfiles:async()=>_mock.profiles,
 savePrinterProfile:async(row,id)=>{const result={...row,id:id||'11111111-1111-4111-8111-111111111111'};_mock.profiles=_mock.profiles.filter(p=>p.id!==result.id).concat(result);return result;},
 deletePrinterProfile:async id=>{_mock.profiles=_mock.profiles.filter(p=>p.id!==id);return true;},
 onSaveBeforeClose:fn=>{_mock.closeSave=fn},
 onMenu:fn=>{_mock.menu=fn}};''')
 for script in re.findall(r'<script defer src="([^"]+)"></script>',(root/'src/index.html').read_text()):
     page.add_script_tag(content=(root/'src'/script).resolve().read_text())
 assert page.locator('.frame').count()==2, errors
 assert page.locator('#page-list .page-list-item').count()==1
 print('PASS initial publication and toolbar')
 page.locator('#save-btn').click()
 assert page.evaluate('_mock.doc.pages.length')==1
 page.locator('#ribbon-tab-pages').click();page.locator('#add-page-btn').click()
 assert page.locator('#page-list .page-list-item').count()==2
 page.locator('#ribbon-tab-edit').click();page.locator('#revisions-btn').click()
 assert page.locator('#revisions-dialog').evaluate('(el)=>el.open')
 page.locator('#revision-load').click()
 assert '1 change found' in page.locator('#revision-summary').inner_text()
 assert page.locator('#revision-results button').count()>0
 assert 'page count' in page.locator('#revision-results').inner_text().lower()
 page.screenshot(path='/mnt/data/Skosh-Press-v0.7-Revisions.png',full_page=True)
 page.locator('#revisions-close').click()
 print('PASS baseline comparison and changes')
 page.locator('#ribbon-tab-output').click();page.locator('#print-lab-btn').click()
 assert page.locator('#print-lab-dialog').evaluate('(el)=>el.open')
 assert 'TOTAL SHEETS' in page.locator('#lab-output').inner_text()
 fields=['lab-paper-cost','lab-ink-cost','lab-staple-cost','lab-other-cost']
 assert all(page.locator('#'+id).input_value()=='' for id in fields)
 total=page.locator('#lab-cost-total')
 assert total.inner_text()=='No amounts entered'
 page.locator('#lab-paper-cost').fill('12.50')
 assert total.inner_text()=='12.50'
 page.locator('#lab-ink-cost').fill('7.25')
 page.locator('#lab-staple-cost').fill('2.00')
 page.locator('#lab-other-cost').fill('0.25')
 assert total.inner_text()=='22.00'
 page.locator('#lab-copies').fill('10')
 assert page.locator('#lab-output .lab-stat strong').all_inner_texts()==['1','10']
 assert total.inner_text()=='22.00'
 page.locator('#lab-copies').fill('50')
 page.locator('#lab-color').select_option('color')
 page.locator('#lab-binding').select_option('loose')
 page.locator('#lab-duplex').select_option('none')
 assert total.inner_text()=='22.00'
 assert page.locator('#lab-export-booklet').is_disabled()
 page.locator('#lab-binding').select_option('saddle')
 assert page.locator('#lab-export-booklet').is_enabled()
 page.locator('#lab-ink-cost').fill('-1')
 assert 'Enter an amount' in total.inner_text()
 assert page.locator('#lab-export-pdf').is_enabled()
 page.locator('#lab-ink-cost').fill('7.25')
 page.locator('#lab-save-profile').click()
 assert page.locator('#lab-saved-profile option').count()==2
 assert page.locator('#lab-delete-profile').is_enabled()
 assert page.evaluate('_mock.profiles.length')==1
 assert page.evaluate("!['paperPerSheet','inkPerSide','staplesPerCopy','paperCost','totalCost'].some(k=>k in _mock.profiles[0])")
 page.locator('#lab-saved-profile').select_option('')
 page.locator('#lab-saved-profile').select_option('11111111-1111-4111-8111-111111111111')
 assert total.inner_text()=='22.00'
 page.locator('#lab-clear-costs').click()
 assert total.inner_text()=='No amounts entered'
 page.locator('#lab-paper-cost').fill('0')
 assert total.inner_text()=='0.00'
 page.locator('#lab-paper-cost').fill('35')
 page.locator('#print-lab-close').click()
 page.locator('#print-lab-btn').click()
 assert total.inner_text()=='No amounts entered'
 assert all(page.locator('#'+id).input_value()=='' for id in fields)
 print('PASS actual job costs independent of quantities, profile storage and print export')
 page.screenshot(path='/mnt/data/Skosh-Press-v0.7-Print-Lab.png',full_page=True)
 page.locator('#print-lab-close').click()
 assert errors==[],errors
 page.screenshot(path='/mnt/data/Skosh-Press-v0.7-preview.png',full_page=True)
 print('PASS no script exceptions, screenshot saved')
 browser.close()
