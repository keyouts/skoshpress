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
    page=browser.new_page(viewport={'width':1530,'height':1000})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(html)
    page.add_style_tag(content=(root/'src/styles.css').read_text())
    for name in ['booklet.js','units.js','revisions.js','story-flow.js','print-lab.js']:
        page.add_script_tag(content=(root/'lib'/name).read_text())
    page.add_script_tag(content='''window.storyLog={snapshots:[],saved:[],cleared:0};
      window.skoshPressAPI={
        reportDirty:()=>{},setSpelling:async()=>{},onMenu:()=>{},
        checkRecovery:async()=>null,
        snapshotRecovery:async doc=>{storyLog.snapshots.push(JSON.parse(JSON.stringify(doc)));return {saved:true}},
        clearRecovery:async()=>{storyLog.cleared++;return true},
        saveProject:async doc=>{storyLog.saved.push(JSON.parse(JSON.stringify(doc)));return {path:'C:/books/story.skoshpress'}}
      };''')
    page.add_script_tag(content=(root/'src/app.js').read_text())
    page.locator('.frame').filter(has_text='Start here.').click()
    page.locator('#reflow-btn').click()
    page.locator('.frame').filter(has_text='Start here.').dblclick()
    assert page.locator('#story-dialog').evaluate('(el)=>el.open')
    canonical='<h1>Story heading</h1><p>The <em>first</em> '+('chapter text '*850)+'</p><p><strong>Second paragraph.</strong> Keep this separate.</p>'
    page.locator('#story-editable').evaluate('''(element,source)=>{
      element.innerHTML=source;
      element.dispatchEvent(new Event('input',{bubbles:true}));
    }''',canonical)
    page.locator('#story-save').click(timeout=20000)
    assert not page.locator('#story-dialog').evaluate('(el)=>el.open')
    page.locator('#save-btn').click()
    doc=page.evaluate('storyLog.saved.at(-1)')
    assert doc['stories'] and len(doc['stories'])==1
    story=next(iter(doc['stories'].values()))
    assert story['html']==canonical, 'pagination changed canonical rich HTML'
    pages=[f for pg in doc['pages'] for f in pg['frames'] if f.get('storyId')==story['id']]
    assert len(pages)>1, 'test manuscript should cross page boundaries'
    print('PASS: rich manuscript spans multiple frames without changing canonical HTML')
    page.locator('.frame').filter(has_text='Story heading').dblclick(timeout=10000)
    assert page.locator('#story-editable').inner_html()==canonical
    page.locator('#story-editable').evaluate("el=>{el.innerHTML+='<p>Discard this edit.</p>';el.dispatchEvent(new Event('input',{bubbles:true}));}")
    page.wait_for_function('storyLog.snapshots.length>0',timeout=8000)
    recovery=page.evaluate('storyLog.snapshots.at(-1)')
    recovered_story=next(iter(recovery['stories'].values()))
    assert 'Discard this edit.' in recovered_story['html']
    assert any('Discard this edit.' in frame['html'] for sheet in recovery['pages'] for frame in sheet['frames'] if frame.get('storyId')==story['id'])
    print('PASS: recovery captures in-progress linked-manuscript edits')
    page.locator('#story-cancel-button').click()
    page.locator('.frame').filter(has_text='Story heading').dblclick()
    assert page.locator('#story-editable').inner_html()==canonical
    print('PASS: editor cancel restores the canonical manuscript')
    page.locator('#story-cancel-button').click()
    assert not errors,errors
    print('PASS: no browser script exceptions')
    browser.close()
