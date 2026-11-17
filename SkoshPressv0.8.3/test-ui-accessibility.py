from pathlib import Path
from playwright.sync_api import sync_playwright
import re

root=Path(__file__).resolve().parent
html=(root/'src/index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
html=re.sub(r'<script[^>]*></script>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
with sync_playwright() as playwright:
    browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1530,'height':960})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(html)
    page.add_style_tag(content=(root/'src/styles.css').read_text())
    for name in ['booklet.js','units.js','revisions.js','story-flow.js','print-lab.js']:
        page.add_script_tag(content=(root/'lib'/name).read_text())
    page.add_script_tag(content='''window.skoshPressAPI={
      reportDirty:()=>{},setSpelling:async()=>{},onMenu:()=>{},checkRecovery:async()=>null,
      snapshotRecovery:async()=>({saved:true}),clearRecovery:async()=>true
    };''')
    page.add_script_tag(content=(root/'src/app.js').read_text())
    assert page.locator('#canvas-scroll').get_attribute('aria-describedby')=='canvas-help'
    assert page.locator('.page-list-item').get_attribute('aria-current')=='page'
    assert page.locator('#canvas-help').evaluate('el=>getComputedStyle(el).position')=='absolute'
    assert page.locator('button[data-story-command="bold"]').get_attribute('aria-label')=='Bold selected manuscript text'
    assert page.get_by_role('button',name='Dark mode').get_attribute('aria-pressed')=='false'
    page.get_by_role('button',name='Dark mode').click()
    assert page.get_by_role('button',name='Dark mode').get_attribute('aria-pressed')=='true'
    page.get_by_role('button',name='Dark mode').click()
    assert page.get_by_role('button',name='Dark mode').get_attribute('aria-pressed')=='false'
    page.get_by_role('tab',name='OBJECT').focus()
    page.get_by_role('tab',name='OBJECT').press('ArrowRight')
    assert page.get_by_role('tab',name='DOCUMENT').get_attribute('aria-selected')=='true'
    assert page.evaluate('document.activeElement.id')=='tab-document'
    page.get_by_role('tab',name='DOCUMENT').press('End')
    assert page.get_by_role('tab',name='FONTS').get_attribute('aria-selected')=='true'
    page.get_by_role('tab',name='FONTS').press('Home')
    assert page.get_by_role('tab',name='OBJECT').get_attribute('aria-selected')=='true'
    print('PASS: inspector keyboard tab navigation and theme state')
    page.locator('#templates-btn').click()
    templates=page.get_by_role('list',name='Built-in layouts')
    assert templates.get_by_role('listitem').count()==4
    assert templates.get_by_role('button',name='Book Single editable A5 starter page').count()==0
    assert templates.get_by_role('button',name='Default Single editable A5 starter page').count()==1
    page.locator('#templates-close').click()
    print('PASS: template list semantics and native buttons')
    print('PASS: hidden screen-reader descriptions and accessible toolbar names')
    frame=page.locator('.frame').filter(has_text='Start here.').first
    frame.focus()
    assert frame.get_attribute('aria-current')=='true'
    frame.press('Enter')
    assert page.locator('.paper .frame-text[contenteditable="true"]').count()==1
    assert page.evaluate('document.activeElement.classList.contains("frame-text")')
    page.locator('.paper .frame-text[contenteditable="true"]').press('Escape')
    print('PASS: keyboard Enter opens standalone text editing')
    page.locator('.frame').first.click()
    original_frame_count=page.locator('.frame').count()
    page.locator('#settings-btn').click()
    page.locator('#settings-reset').focus()
    page.keyboard.press('Delete')
    assert page.locator('.frame').count()==original_frame_count, 'Delete within settings unexpectedly removed a frame'
    page.locator('#settings-reset').press('Escape')
    assert not page.locator('#settings-dialog').evaluate('el=>el.open'), 'Escape did not close settings'
    assert page.locator('.frame.selected').count()==1, 'Closing settings discarded the selected frame'
    page.locator('#templates-btn').click()
    page.locator('#templates-close').press('Backspace')
    assert page.locator('.frame').count()==original_frame_count, 'Backspace within templates unexpectedly removed a frame'
    page.locator('#templates-close').click()
    print('PASS: editing shortcuts are isolated from modal dialogs')
    page.locator('.frame.selected').focus()
    page.keyboard.press('Delete')
    assert page.locator('.frame').count()==original_frame_count-1, 'Delete on the canvas did not remove the selected frame'
    assert page.locator('#save-state').inner_text()=='Unsaved changes.'
    print('PASS: canvas Delete works and announces unsaved changes')
    page.locator('#canvas-scroll').focus()
    page.keyboard.press('Control+z')
    assert page.locator('.frame').count()==original_frame_count
    page.locator('.frame').filter(has_text='Start here.').click()
    page.locator('#reflow-btn').click()
    linked=page.locator('.frame').filter(has_text='Start here.').first
    linked.focus()
    linked.press('F2')
    assert page.locator('#story-dialog').evaluate('el=>el.open')
    assert page.get_by_role('textbox',name='Entire linked manuscript').count()==1
    page.get_by_role('button',name='Bold selected manuscript text').count()==1
    page.locator('#story-cancel-button').click()
    assert not page.locator('#story-dialog').evaluate('el=>el.open')
    print('PASS: keyboard F2 opens linked manuscript dialog with named editor')
    page.locator('#sidebar-add-page').click()
    assert page.locator('.page-list-item').count()==2
    first=page.locator('.page-list-item').first
    first.focus()
    first.press('Enter')
    assert page.locator('.page-list-item').first.get_attribute('aria-current')=='page'
    assert page.evaluate('document.activeElement.classList.contains("page-list-item")')
    print('PASS: page navigation retains keyboard focus after selection')
    page.locator('.page-list-item').first.click()
    layer=page.locator('.layer-item').last
    layer.focus()
    layer.press('Enter')
    assert page.evaluate('document.activeElement.classList.contains("layer-item")')
    print('PASS: object navigation retains keyboard focus after selection')
    page.locator('.page-list-item').last.click()
    page.locator('#text-btn').click()
    page.locator('.page-list-item').first.click()
    page.locator('#spread-btn').click()
    page.locator('.paper[data-page="1"] .frame').first.focus()
    assert page.evaluate('document.activeElement?.classList.contains("frame")')
    assert page.evaluate('document.activeElement?.closest(".paper")?.dataset.page')=='1'
    print('PASS: spread navigation preserves focus when the canvas re-renders')
    assert not errors,errors
    print('PASS: no browser script exceptions')
    browser.close()
