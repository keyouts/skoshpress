from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path(__file__).resolve().parent
raw=(root/'src/index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>|<script[^>]*></script>|<link rel="stylesheet"[^>]*>','',raw)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':980});page.set_default_timeout(8000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    page.set_content(html);page.add_style_tag(content=(root/'src/styles.css').read_text())
    page.add_script_tag(content='''window.packaged=null;window.skoshPressAPI={reportDirty:()=>{},setSpelling:async()=>{},checkRecovery:async()=>null,snapshotRecovery:async()=>({saved:true}),clearRecovery:async()=>true,importImage:async()=>({name:'portrait.png',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII='}),exportPackage:async doc=>{window.packaged=JSON.parse(JSON.stringify(doc));return {path:'archive.zip'}}};''')
    for script in re.findall(r'<script defer src="([^"]+)"></script>',raw):page.add_script_tag(content=(root/'src'/script).resolve().read_text())
    loc=page.locator
    page.keyboard.press('Control+k');assert loc('#workspace-dialog').is_visible();assert loc('#workspace-search').evaluate('(e)=>e===document.activeElement')
    loc('#workspace-search').fill('Genealogy Studio');assert loc('.workspace-result').count()==1;page.keyboard.press('Enter');assert loc('#genealogy-dialog').is_visible();page.keyboard.press('Escape')
    loc('#image-btn').click();page.wait_for_function("document.querySelectorAll('.frame').length===3")
    loc('#workspace-open').click();loc('#workspace-mode').select_option('assets');assert loc('.workspace-result').count()==1;loc('.workspace-result').click();assert loc('.frame').count()==4
    loc('#workspace-open').click();loc('#workspace-mode').select_option('assets');assert '2 placement(s)' in loc('.workspace-result').inner_text();loc('#workspace-mode').select_option('pages');loc('#workspace-search').fill('Publication title');assert loc('.workspace-result').count()==1;page.keyboard.press('ArrowDown');page.keyboard.press('Enter');assert loc('.frame.selected').count()==1
    loc('#workspace-open').click();loc('#workspace-mode').select_option('package');loc('.workspace-result').click();page.wait_for_function('window.packaged!==null');assert len(page.evaluate('window.packaged.pages[0].frames'))==4
    loc('#workspace-open').click();page.keyboard.press('Escape');assert loc('#workspace-open').evaluate('(e)=>e===document.activeElement')
    assert not errors,errors
    print('PASS workspace keyboard, studio navigation, asset reuse, package snapshot and focus restoration')
    browser.close()
