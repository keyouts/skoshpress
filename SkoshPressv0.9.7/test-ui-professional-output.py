from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path(__file__).resolve().parent
raw=(root/'src/index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>|<script[^>]*></script>|<link rel="stylesheet"[^>]*>','',raw)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1530,'height':1000})
    page.set_default_timeout(10000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:d.accept())
    page.set_content(html);page.add_style_tag(content=(root/'src/styles.css').read_text())
    page.add_script_tag(content='''window.saved=null;window.printed=null;window.bookSource='<h1>Chapter One</h1><p>First passage <sup>[1]</sup> with a source.</p><h1>Chapter Two</h1><p>'+('Second chapter with rich text and spaces. '.repeat(65))+'</p>';const style={font:'Georgia, serif',fontSize:11,leading:1.45};window.fixture={format:'skosh-press-1',version:4,name:'Book proof',paper:{preset:'a5',width:148,height:210,margin:12},pages:[{id:'p1',frames:[{id:'body',type:'text',label:'Manuscript',storyId:'s',html:'<p>First passage</p>',x:12,y:12,w:124,h:120,style},{id:'picture',type:'image',label:'Artwork',x:12,y:20,w:30,h:40,src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII='}]}],stories:{s:{id:'s',name:'Book',html:window.bookSource,style,geometry:{x:12,y:12,w:124,h:120}}},fonts:[]};window.skoshPressAPI={reportDirty:()=>{},setSpelling:async()=>{},checkRecovery:async()=>null,clearRecovery:async()=>true,snapshotRecovery:async()=>({saved:true}),openProject:async()=>({path:'book.skoshpress',project:JSON.parse(JSON.stringify(window.saved||window.fixture))}),saveProject:async doc=>{window.saved=JSON.parse(JSON.stringify(doc));return {path:'book.skoshpress'}},exportPdf:async html=>{window.printed=html;return {path:'proof.pdf'}}};''')
    for script in re.findall(r'<script defer src="([^"]+)"></script>',raw):page.add_script_tag(content=(root/'src'/script).resolve().read_text())
    page.locator('#open-btn').click();page.wait_for_function("document.querySelector('[data-frame=body]')")
    page.locator('#layers-list [data-frame=body]').click();page.locator('.paper [data-frame=body]').press('Enter')
    page.locator('#story-chapters').check();page.locator('#story-wrap').check();page.locator('#story-local-wrap').check()
    page.locator('.book-notes summary').click();page.locator('#story-notes').fill('1: Local source "quoted" <archive>')
    page.locator('#story-save').click();assert not page.locator('#story-dialog').evaluate('el=>el.open')
    body=page.locator('.paper [data-frame=body] .frame-text')
    assert body.locator('.wrap-exclusion').count()==1
    assert 'polygon(' in body.locator('.wrap-exclusion').evaluate('el=>getComputedStyle(el).shapeOutside')
    assert body.locator('.wrap-exclusion').evaluate('el=>el.offsetHeight')<body.evaluate('el=>el.clientHeight')
    page.locator('.paper [data-frame=body]').press('Enter');page.locator('#story-bottom-notes').check();page.locator('#story-save').click()
    assert not page.locator('#story-dialog').evaluate('el=>el.open')
    notes=body.locator('.composition-notes');assert notes.count()==1
    assert abs(notes.evaluate('el=>el.getBoundingClientRect().bottom')-body.evaluate('el=>el.getBoundingClientRect().bottom'))<3
    page.locator('#frame-word-spacing').fill('1.5');page.locator('#frame-word-spacing').press('Tab');page.locator('#frame-paragraph-gap').fill('0.8');page.locator('#frame-paragraph-gap').press('Tab');page.locator('#frame-kerning').check();page.locator('#frame-pretty').check()
    page.locator('#save-btn').click();page.wait_for_function('window.saved!==null')
    doc=page.evaluate('window.saved');assert doc['stories']['s']['html']==page.evaluate('window.bookSource');assert doc['pages'][0]['frames'][0]['h']==186
    assert doc['stories']['s']['style']['wordSpacing']==1.5
    page.locator('#tab-document').click();page.locator('#book-index-terms').fill('passage\nchapter\nmissing');page.locator('#book-index').click();page.locator('#save-btn').click();page.wait_for_function('saved.pages.some(p=>p.indexPage)')
    index=[p for p in page.evaluate('saved.pages') if p.get('indexPage')];assert len(index)==1;assert 'passage · 1' in index[0]['frames'][0]['html'];assert 'missing' not in index[0]['frames'][0]['html']
    page.locator('#book-index').click();page.locator('#save-btn').click();page.wait_for_timeout(150);assert len([p for p in page.evaluate('saved.pages') if p.get('indexPage')])==1
    page.locator('#ribbon-tab-output').click();page.locator('#pdf-btn').click();page.wait_for_function('window.printed!==null');printed=page.evaluate('window.printed');assert 'composition-notes' in printed and 'word-spacing:1.5px' in printed and 'font-kerning:normal' in printed and 'passage · 1' in printed
    page.locator('#ribbon-tab-file').click() if page.locator('#ribbon-tab-file').count() else None
    page.locator('#open-btn').click();page.wait_for_function("document.querySelector('[data-frame=body]')")
    assert body.locator('.composition-notes').count()==1;assert 'quoted' in body.locator('.composition-notes').inner_text()
    page.locator('#tab-document').click();assert 'passage' in page.locator('#book-index-terms').input_value()
    assert not errors,errors
    print('PASS: local wrap, bottom notes, precise typography, page index, saved settings and export parity')
    browser.close()
