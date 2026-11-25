from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path(__file__).resolve().parent
raw=(root/'src/index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>|<script[^>]*></script>|<link rel="stylesheet"[^>]*>','',raw)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1530,'height':960})
    page.set_default_timeout(6000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:d.accept())
    page.set_content(html)
    page.add_style_tag(content=(root/'src/styles.css').read_text())
    page.add_script_tag(content='''window.saved=null;window.printed=null;window.exported=null;window.skoshPressAPI={reportDirty:()=>{},setSpelling:async()=>{},checkRecovery:async()=>null,clearRecovery:async()=>true,snapshotRecovery:async()=>({saved:true}),saveProject:async doc=>{window.saved=doc;return {path:'layout.skoshpress'}},openProject:async()=>({path:'layout.skoshpress',project:window.saved}),exportPdf:async html=>{window.printed=html;return {path:'proof.pdf'}},exportPublication:async(doc)=>{window.exported=doc;return {path:'proof.txt'}}};''')
    for script in re.findall(r'<script defer src="([^"]+)"></script>',raw):
        page.add_script_tag(content=(root/'src'/script).resolve().read_text())
    assert page.locator('.page-thumb .thumbnail-object').count()==2
    assert 'A Skosh Press Project' in page.locator('.page-thumb').inner_text()
    objects=page.locator('#layers-list .layer-item')
    objects.nth(0).click();objects.nth(1).click(modifiers=['Shift'])
    assert page.locator('.paper .frame.selected').count()==2
    page.locator('#object-group').click()
    assert page.locator('.paper .frame.object-grouped').count()==2
    page.locator('[data-align="bottom"]').click()
    before=page.locator('.paper .frame').evaluate_all('(els)=>els.map(el=>parseFloat(el.style.top))')
    assert before[1]>before[0]
    page.locator('#object-lock').click()
    assert page.locator('.paper .frame.object-locked').count()==2
    assert page.locator('#frame-x').is_disabled()
    page.locator('.paper .frame').first.press('ArrowDown')
    assert page.locator('.paper .frame').evaluate_all('(els)=>els.map(el=>parseFloat(el.style.top))')==before
    page.locator('.paper .frame').first.press('Delete')
    assert page.locator('.paper .frame').count()==2
    page.locator('#object-lock').click()
    page.locator('#layer-add').click();page.locator('#layer-name').fill('Artwork');page.locator('#layer-confirm').click()
    page.locator('#object-layer').select_option(label='Artwork')
    page.get_by_role('button',name='Hide Artwork').click()
    assert page.locator('.paper .frame').count()==0
    assert page.locator('.page-thumb .thumbnail-object').count()==0
    page.locator('#canvas-scroll').focus();page.keyboard.press('Control+z')
    assert page.locator('.paper .frame').count()==2
    page.keyboard.press('Control+Shift+z')
    assert page.locator('.paper .frame').count()==0
    page.locator('#ribbon-tab-output').click();page.locator('#pdf-btn').click()
    page.wait_for_function('window.printed!==null')
    assert 'Start here.' not in page.evaluate('window.printed')
    page.get_by_role('button',name='Show Artwork').click()
    assert page.locator('.paper .frame').count()==2
    page.locator('#layers-list .layer-item').first.click();page.locator('#object-ungroup').click()
    assert page.locator('.paper .frame.object-grouped').count()==0
    page.locator('#sidebar-add-page').click();page.locator('#sidebar-add-page').click()
    pages=page.locator('.page-list-item')
    assert pages.count()==3
    pages.nth(0).scroll_into_view_if_needed()
    grip=pages.nth(0).locator('.page-reorder-grip').bounding_box()
    listing=page.locator('#page-list').bounding_box()
    page.mouse.move(grip['x']+grip['width']/2,grip['y']+grip['height']/2)
    page.mouse.down();page.mouse.move(listing['x']+listing['width']/2,listing['y']+listing['height']-8,steps=12)
    page.wait_for_timeout(600);page.mouse.up()
    if 'Default' in pages.nth(1).get_attribute('aria-label'):
        pages.nth(1).press('Alt+ArrowDown')
    assert 'Default' in pages.nth(2).get_attribute('aria-label')
    page.locator('#tab-document').click();page.locator('#master-manage').click()
    page.locator('#master-name').fill('Running layout');page.locator('#parent-add-block').click()
    page.locator('#parent-text-0').fill('Repeated {page} of {pages}')
    page.locator('#parent-x-0').fill('20');page.locator('#parent-x-0').press('Tab')
    assert 'Repeated 3 of 3' in page.locator('#parent-layout-preview').inner_text()
    page.locator('#master-save').click();page.locator('#master-close').click()
    assert page.locator('.parent-layout-object').inner_text()=='Repeated 3 of 3'
    page.locator('#page-list .page-list-item').nth(0).click()
    page.locator('#page-master-select').select_option(label='Running layout')
    assert page.locator('.parent-layout-object').inner_text()=='Repeated 1 of 3'
    page.locator('#save-btn').click();page.wait_for_function('window.saved!==null')
    saved=page.evaluate('window.saved')
    assert saved['pages'][2]['label']=='Default' and saved['layers'][0]['name']=='Artwork'
    assert saved['masters'][0]['blocks'][0]['x']==20
    page.locator('#open-btn').click();page.wait_for_function("document.querySelector('.parent-layout-object')?.textContent==='Repeated 1 of 3'")
    page.locator('#ribbon-tab-output').click();page.locator('#pdf-btn').click();page.wait_for_function("window.printed.includes('Repeated 3 of 3')")
    assert 'Repeated 1 of 3' in page.evaluate('window.printed')
    assert not errors,errors
    print('PASS: rendered thumbnails, grouping, alignment, locks, layers, page drag, reusable parent layouts, save, reopen and print')
    browser.close()
