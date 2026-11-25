from pathlib import Path
from playwright.sync_api import sync_playwright
import re, base64, json
root=Path(__file__).resolve().parent
raw=(root/'src/index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>|<script[^>]*></script>|<link rel="stylesheet"[^>]*>','',raw)
source='data:image/png;base64,'+base64.b64encode((root/'assets/SkoshPressIcon.png').read_bytes()).decode()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':980});page.set_default_timeout(8000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    page.set_content(html);page.add_style_tag(content=(root/'src/styles.css').read_text())
    page.add_script_tag(content='window.source='+json.dumps(source)+';window.stored=[];window.saved=null;window.skoshPressAPI={reportDirty:()=>{},setSpelling:async()=>{},checkRecovery:async()=>null,snapshotRecovery:async()=>({saved:true}),clearRecovery:async()=>true,resetProjectPath:async()=>true,importImage:async()=>({name:"Portrait",src:source}),listAssets:async()=>stored.map(({id,kind,name})=>({id,kind,name})),loadAsset:async id=>stored.find(x=>x.id===id),saveAsset:async asset=>{stored=[{...asset,id:"one"}];return stored[0]},removeAsset:async id=>{stored=stored.filter(x=>x.id!==id)},saveProject:async(doc,saveAs,compact)=>{window.saved={doc,saveAs,compact};return {path:compact?"archive.skoshcompact":"archive.skoshpress"}}};')
    for script in re.findall(r'<script defer src="([^"]+)"></script>',raw):page.add_script_tag(content=(root/'src'/script).resolve().read_text())
    loc=page.locator
    loc('#image-btn').click();page.wait_for_function("document.querySelectorAll('.frame').length===3")
    page.wait_for_function("document.querySelector('.page-thumb img')?.src.length<source.length")
    assert page.evaluate('SkoshImageCache.stats().entries')==1
    assert loc('.frame-image img').get_attribute('src')==source
    loc('#workspace-open').click();loc('#workspace-mode').select_option('library');loc('.workspace-result').get_by_text('Keep image: Portrait').click();page.wait_for_function('stored.length===1');loc('.workspace-result').get_by_text('Use image: Portrait').wait_for()
    page.keyboard.press('Escape');loc('#new-btn').click();page.wait_for_function("document.querySelectorAll('.frame').length===2")
    loc('#workspace-open').click();loc('#workspace-mode').select_option('library');loc('.workspace-result').get_by_text('Use image: Portrait').click();page.wait_for_function("document.querySelectorAll('.frame').length===3")
    assert loc('.frame-image img').get_attribute('src')==source
    loc('#workspace-open').click();loc('#workspace-mode').select_option('library');loc('.workspace-result').get_by_text('Remove from library: Portrait').click();page.wait_for_function('stored.length===0');page.keyboard.press('Escape')
    assert loc('.frame-image img').get_attribute('src')==source
    page.keyboard.press('Control+k');loc('#workspace-search').fill('Save compact project');page.keyboard.press('Enter');page.wait_for_function('saved!==null');assert page.evaluate('saved.compact && saved.saveAs');assert page.evaluate('saved.doc.pages[0].frames.find(f=>f.type==="image").src===source')
    assert not errors,errors
    print('PASS local asset reuse across publications, removal, bounded preview cache, original image preservation and compact save command')
    browser.close()
