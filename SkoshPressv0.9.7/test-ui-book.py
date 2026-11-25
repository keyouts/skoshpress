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
    page.locator('#story-chapters').check();page.locator('#story-wrap').check();page.locator('#story-widows').select_option('3')
    page.locator('.book-notes summary').click();page.locator('#story-notes').fill('1: Local source <archive>')
    page.locator('#story-save').click();assert not page.locator('#story-dialog').evaluate('el=>el.open')
    page.locator('#save-btn').click();page.wait_for_function('window.saved!==null')
    doc=page.evaluate('window.saved');assert doc['stories']['s']['html']==page.evaluate('window.bookSource')
    assert 'Chapter Two' not in doc['pages'][0]['frames'][0]['html']
    assert 'Chapter Two' in doc['pages'][1]['frames'][0]['html']
    assert 'Local source &lt;archive&gt;' in doc['pages'][0]['frames'][0]['html']
    assert 'Local source' not in doc['pages'][1]['frames'][0]['html']
    assert float(page.locator('.paper [data-frame=body] .frame-text').evaluate('el=>parseFloat(el.style.paddingLeft)'))>50
    print('PASS: chapter breaks, measured wrapping and local footnotes preserve the canonical manuscript')
    page.locator('#page-list .page-list-item').nth(1).click();page.locator('#layers-list .layer-item').first.click()
    page.locator('#frame-w').fill('90');page.locator('#frame-w').press('Tab')
    page.locator('#save-btn').click();page.wait_for_function('window.saved.pages[1].frames[0].manualFlow===true')
    assert page.evaluate('window.saved.pages[1].frames[0].w')==90
    page.locator('#add-continuation').click();page.locator('#save-btn').click();page.wait_for_function('window.saved.pages.at(-1).frames[0].manualFlow===true')
    print('PASS: independent continuation size and explicit continuation page survive reflow')
    page.locator('#page-list .page-list-item').nth(1).click();page.locator('#tab-document').click()
    page.locator('#section-title').fill('Part Two');page.locator('#section-start').fill('10');page.locator('#section-apply').click()
    page.locator('#book-contents').click();page.locator('#save-btn').click();page.wait_for_function('window.saved.pages.some(p=>p.contents)')
    doc=page.evaluate('window.saved');contents=[p for p in doc['pages'] if p.get('contents')];assert len(contents)==1
    assert 'Chapter Two · 3' in contents[0]['frames'][0]['html'];assert 'Part Two · 3' in contents[0]['frames'][0]['html']
    assert doc['pages'][2]['section']=={'title':'Part Two','start':10}
    page.locator('#book-contents').click();page.locator('#save-btn').click();page.wait_for_timeout(150)
    assert len([p for p in page.evaluate('window.saved.pages') if p.get('contents')])==1
    page.locator('#ribbon-tab-output').click();page.locator('#pdf-btn').click();page.wait_for_function('window.printed!==null')
    printed=page.evaluate('window.printed');assert 'padding-left:33mm' in printed and 'Local source &lt;archive&gt;' in printed and 'Part Two · 3' in printed
    page.locator('#ribbon-tab-file').click() if page.locator('#ribbon-tab-file').count() else None
    page.locator('#open-btn').click();page.wait_for_function("document.querySelector('.page-row-name')?.textContent.includes('Contents')")
    page.locator('#page-list .page-list-item').nth(1).click()
    assert page.locator('.paper [data-frame=body] .frame-text').inner_text().find('Local source <archive>')>=0
    assert not errors,errors
    print('PASS: generated contents, section metadata, PDF markup and reopening remain consistent')
    browser.close()
