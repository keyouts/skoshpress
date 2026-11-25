from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path(__file__).resolve().parent
raw=(root/'src/index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>|<script[^>]*></script>|<link rel="stylesheet"[^>]*>','',raw)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1024,'height':768});page.set_default_timeout(8000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    page.set_content(html);page.add_style_tag(content=(root/'src/styles.css').read_text())
    page.add_script_tag(content='''window.saved=null;window.resetFails=false;window.skoshPressAPI={reportDirty:()=>{},setSpelling:async()=>{},checkRecovery:async()=>null,snapshotRecovery:async()=>({saved:true}),clearRecovery:async()=>true,onMenu:fn=>window.menu=fn,importGedcom:async()=>{throw Error("Unable to read tree.");},resetProjectPath:async()=>{if(resetFails)throw Error('Local storage unavailable.');},saveProject:async doc=>{window.saved=doc;return {path:'test.skoshpress'}},openProject:async()=>({path:'large.skoshpress',project:{format:'skosh-press-1',version:4,name:'Large book',paper:{preset:'custom',width:300,height:300,margin:100,columns:1,gutter:5},pages:Array.from({length:700},(_,i)=>({id:'p'+i,frames:[]})),stories:{},fonts:[]}})};''')
    for script in re.findall(r'<script defer src="([^"]+)"></script>',raw):page.add_script_tag(content=(root/'src'/script).resolve().read_text())
    loc=page.locator
    loc('#ribbon-tab-edit').click();assert loc('#undo-btn').is_disabled();assert loc('#redo-btn').is_disabled();loc('#ribbon-tab-create').click();loc('#text-btn').click();assert loc('.frame').count()==3;loc('#ribbon-tab-edit').click();loc('#undo-btn').click();assert loc('.frame').count()==2;loc('#redo-btn').click();assert loc('.frame').count()==3;loc('#undo-btn').click();assert loc('.frame').count()==2;loc('#ribbon-tab-create').click()
    loc('.frame').first.click();loc('#project-more summary').click();page.keyboard.press('Escape');assert loc('.frame.selected').count()==1;assert not loc('#project-more').evaluate('e=>e.open')
    loc('#project-more summary').click();loc('#help-basics-btn').click();assert loc('#help-basics-dialog').is_visible();page.keyboard.press('Escape');page.wait_for_function("document.activeElement===document.querySelector('#project-more summary')")
    page.keyboard.press('Control+k');loc('#workspace-search').fill('bleed');assert loc('.workspace-result').count()==1;page.keyboard.press('Enter');assert loc('#print-lab-dialog').is_visible();page.keyboard.press('Control+f');assert not loc('#find-dialog').is_visible();page.evaluate("menu('new')");assert loc('#print-lab-dialog').is_visible();page.keyboard.press('Escape')
    page.keyboard.press('Control+k');loc('#workspace-search').fill('no such command');assert loc('.workspace-empty').is_visible();assert loc('.workspace-result').count()==0;loc('#workspace-mode').select_option('assets');assert 'No embedded' in loc('.workspace-empty').inner_text();loc('#workspace-header-close').click()
    loc('#genealogy-btn').click();assert loc('#genealogy-dialog .studio-guide').is_visible();loc('#genealogy-dialog .studio-guide summary').click();assert loc('#genealogy-dialog .studio-guide p').is_visible()
    loc('#genealogy-import').click();notice=loc('#genealogy-dialog .dialog-notice');notice.wait_for();assert 'Unable to read tree.' in notice.inner_text();assert notice.get_attribute('data-error')=='true';assert loc('#toast').is_hidden();notice.get_by_role('button',name='Dismiss message').click();assert notice.is_hidden();page.keyboard.press('Escape')
    page.evaluate('resetFails=true');loc('#new-btn').click();page.wait_for_function("document.querySelector('#toast').textContent.includes('Local storage unavailable')");assert loc('.frame').count()==2;page.evaluate('resetFails=false')
    loc('#open-btn').click();page.wait_for_function("document.querySelector('#page-count').textContent==='700'");loc('#tab-document').click();loc('#duplicate-page-btn').click();assert loc('#page-count').inner_text()=='700'
    loc('#page-preset').select_option('a5');loc('#save-btn').click();page.wait_for_function('saved!==null');assert page.evaluate('saved.paper.margin < saved.paper.width/2');assert page.evaluate('saved.pages.length')==700
    assert not errors,errors
    print('PASS modal isolation, help, empty states, keyboard navigation, messages, history controls, page ceiling and valid paper margins')
    browser.close()
