from pathlib import Path
from playwright.sync_api import sync_playwright
import re,json,subprocess
root=Path(__file__).resolve().parent
raw=(root/'src/index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>|<script[^>]*></script>|<link rel="stylesheet"[^>]*>','',raw)
fixture=json.loads(subprocess.check_output(['node','-e',"const t=require('./lib/gedcom').parse(require('fs').readFileSync('test/fixtures/fictional-family.ged','utf8'));const w=require('./lib/genealogy-workbench');const r=require('./lib/genealogy-records');console.log(JSON.stringify({views:Object.fromEntries(t.persons.flatMap(p=>['ancestors','descendants','timeline'].map(m=>[p.ref+m,w.preview(t,{rootId:p.ref,chartMode:m})]))),report:r.publication(t,{footnotes:true,personIndex:true,limit:200})}));"],cwd=root))
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1500,'height':1000});page.set_default_timeout(10000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    page.set_content(html);page.add_style_tag(content=(root/'src/styles.css').read_text())
    page.add_script_tag(content='window.fixture='+json.dumps(fixture)+';')
    page.add_script_tag(content='''window.saved=null;window.printed=null;window.skoshPressAPI={reportDirty:()=>{},setSpelling:async()=>{},checkRecovery:async()=>null,snapshotRecovery:async()=>({saved:true}),clearRecovery:async()=>true,importGedcom:async()=>({name:'Family',version:'5.5.1',warnings:[],stats:{people:3,families:1,sources:2}}),previewGenealogy:async o=>window.fixture.views[(o.rootId||'@I1@')+o.chartMode],generateGenealogyPublication:async()=>window.fixture.report,resetProjectPath:async()=>{},importImage:async()=>({name:'photo.png',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII='}),saveProject:async doc=>{window.saved=JSON.parse(JSON.stringify(doc));return {path:'family.skoshpress'}},openProject:async()=>({path:'family.skoshpress',project:window.saved}),exportPdf:async html=>{window.printed=html;return {path:'family.pdf'}}};''')
    for script in re.findall(r'<script defer src="([^"]+)"></script>',raw):page.add_script_tag(content=(root/'src'/script).resolve().read_text())
    loc=page.locator
    loc('#genealogy-btn').click();loc('#genealogy-import').click();loc('#genealogy-footnotes').check();loc('#genealogy-person-index').check();loc('#genealogy-generate').click()
    page.wait_for_function("!document.querySelector('#genealogy-dialog').open")
    loc('#save-btn').click();page.wait_for_function('window.saved!==null');doc=page.evaluate('window.saved')
    assert any(s['notes'] for s in doc['stories'].values());assert any('Individual name index' in f['html'] for p in doc['pages'] for f in p['frames'])
    loc('#genealogy-btn').click();loc('#genealogy-workbench summary').click();loc('#genealogy-chart-refresh').click()
    loc('#genealogy-chart-root').select_option('@I3@');page.wait_for_function("document.querySelectorAll('.genealogy-chart-card').length===3")
    assert loc('#genealogy-chart-mode option:checked').inner_text()=='Ancestor tree'
    assert 'Daniel Bennett' in loc('#genealogy-chart-preview').inner_text();assert 'No citations' in loc('#genealogy-review').inner_text()
    loc('#genealogy-chart-insert').click();page.wait_for_function("!document.querySelector('#genealogy-dialog').open")
    loc('#save-btn').click();page.wait_for_function("window.saved.pages.at(-1).label==='Ancestor tree'")
    assert 'Ancestor tree:' in page.evaluate('window.saved.pages.at(-1).frames[0].html')
    loc('#genealogy-btn').click();loc('#genealogy-chart-refresh').click()
    loc('#genealogy-chart-mode').select_option('timeline');page.wait_for_function("document.querySelectorAll('.genealogy-timeline-card').length>0")
    loc('#genealogy-chart-mode').select_option('descendants');loc('#genealogy-chart-root').select_option('@I1@');page.wait_for_function("document.querySelectorAll('.genealogy-chart-card').length===2")
    loc('#genealogy-chart-insert').click();page.wait_for_function("!document.querySelector('#genealogy-dialog').open")
    loc('#genealogy-btn').click();loc('#genealogy-photo-caption').fill('Family album, used with permission');loc('#genealogy-photo-add').click();page.wait_for_function("!document.querySelector('#genealogy-dialog').open")
    loc('#save-btn').click();page.wait_for_function("window.saved.pages.at(-1).label==='Family photograph'")
    doc=page.evaluate('window.saved');assert doc['pages'][-1]['frames'][1]['type']=='image';assert 'Family album' in doc['pages'][-1]['frames'][2]['html'];assert any(p.get('label')=='Descendant tree' for p in doc['pages'])
    loc('#open-btn').click();loc('#ribbon-tab-output').click();loc('#pdf-btn').click();page.wait_for_function('window.printed!==null');printed=page.evaluate('window.printed');assert 'Family album' in printed and 'Ancestor tree' in printed and 'Descendant tree' in printed and 'Entry 14' in printed
    assert not errors,errors
    print('PASS genealogy charts, timelines, review, footnotes, photographs, indexes, save, reopen and PDF markup')
    browser.close()
