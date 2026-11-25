from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path(__file__).resolve().parent
raw=(root/'src/index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>|<script[^>]*></script>|<link rel="stylesheet"[^>]*>','',raw)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1500,'height':900})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:d.accept())
    page.set_content(html)
    page.add_style_tag(content=(root/'src/styles.css').read_text())
    page.add_script_tag(content='''window.saved=null;window.skoshPressAPI={reportDirty:()=>{},setSpelling:async()=>{},checkRecovery:async()=>null,clearRecovery:async()=>true,snapshotRecovery:async()=>({saved:true}),saveProject:async doc=>{window.saved=doc;return {path:'book.skoshpress'}},openProject:async()=>({path:'large.skoshpress',project:{format:'skosh-press-1',version:4,name:'Large book',paper:{preset:'a5',width:148,height:210,margin:16,columns:1,gutter:5},pages:Array.from({length:120},(_,i)=>({id:'p'+i,label:'Chapter '+(i+1),frames:[{id:'f'+i,type:'text',label:'Body '+i,x:16,y:16,w:110,h:80,html:'<p>Page content '+(i+1)+'</p>',style:{font:'Georgia, serif',fontSize:11,leading:1.45}}]})),stories:{},fonts:[]}})};''')
    for script in re.findall(r'<script defer src="([^"]+)"></script>',raw):
        page.add_script_tag(content=(root/'src'/script).resolve().read_text())
    page.locator('#open-btn').click()
    page.wait_for_function("document.querySelectorAll('.page-list-item').length===120")
    page.locator('#ribbon-tab-pages').click();page.locator('#all-pages-btn').click()
    page.wait_for_function("document.querySelectorAll('.paper[data-deferred]').length>100")
    assert page.locator('.paper').count()==120
    assert page.locator('.frame').count()<20
    page.locator('.page-list-item').nth(119).click()
    page.wait_for_function("document.querySelector('.paper[data-page=\"119\"] .frame')!==null")
    assert 'Page content 120' in page.locator('.paper[data-page="119"] .frame-text').inner_text()
    page.locator('.paper[data-page="119"] .frame-text').dblclick(force=True)
    page.locator('.paper[data-page="119"] .frame-text').fill('Updated last page')
    page.locator('.paper[data-page="119"] .frame-text').press('Escape')
    page.locator('#canvas-scroll').focus();page.keyboard.press('Control+z')
    assert 'Page content 120' in page.locator('.paper[data-page="119"] .frame-text').inner_text()
    page.keyboard.press('Control+Shift+z')
    assert 'Updated last page' in page.locator('.paper[data-page="119"] .frame-text').inner_text()
    page.locator('#save-btn').click()
    page.wait_for_function('window.saved!==null')
    assert page.evaluate('window.saved.pages.length')==120
    assert 'Updated last page' in page.evaluate('window.saved.pages[119].frames[0].html')
    assert not errors,errors
    print('PASS: bounded rendering, distant page selection, editing, undo, redo and full-document save (120 pages)')
    browser.close()
