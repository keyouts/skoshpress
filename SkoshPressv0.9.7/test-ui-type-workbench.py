from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path(__file__).resolve().parent
raw=(root/'src/index.html').read_text()
scripts=re.findall(r'<script defer src="([^"]+)"></script>',raw)
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',raw)
html=re.sub(r'<script defer src="[^"]+"></script>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1500,'height':950})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  page.set_content(html);page.add_style_tag(content=(root/'src/styles.css').read_text())
  page.add_script_tag(content='''window.skoshPressAPI={reportDirty:()=>{},setSpelling:async()=>{},onMenu:()=>{},checkRecovery:async()=>null,snapshotRecovery:async()=>({saved:true}),clearRecovery:async()=>true,listFontLibrary:async()=>[],loadFontLibrary:async()=>null,exportDesignedFont:async(name,data)=>{window.exportedFont=data;return {path:name+'.ttf'};},exportEditableFont:async(d)=>{window.exportedDesign=d;return true;}};''')
  for script in scripts:page.add_script_tag(content=(root/'src'/script).resolve().read_text())
  loc=page.locator
  loc('#typography-studio-btn').click();loc('#studio-workbench-panel summary').click()
  loc('#studio-glyph-group').select_option('Greek and Coptic');loc('#studio-glyph-query').fill('U+03A9')
  assert loc('#studio-glyph-grid button').count()==1
  loc('#studio-glyph-grid button').click();assert loc('#studio-glyph').input_value()=='Ω'
  loc('#studio-clear').click();loc('#studio-rectangle').click()
  loc('#studio-batch-chars').fill('ΩЖ');loc('#studio-batch-operation').select_option('advance');loc('#studio-batch-value').fill('920');loc('#studio-batch-run').click()
  assert loc('#studio-advance').input_value()=='920'
  loc('#studio-undo').click();assert loc('#studio-advance').input_value()=='780'
  loc('#studio-redo').click();assert loc('#studio-advance').input_value()=='920'
  loc('#studio-glyph').select_option('A');loc('#studio-clear').click();loc('#studio-rectangle').click()
  loc('#studio-glyph').select_option('\u0301');loc('#studio-clear').click();loc('#studio-rectangle').click()
  loc('#studio-batch-chars').fill('Á');loc('#studio-batch-operation').select_option('compose');loc('#studio-batch-run').click()
  assert 'Applied compose' in loc('#studio-status').inner_text(),loc('#studio-status').inner_text()
  loc('#studio-glyph').select_option('Á');loc('#studio-components-panel summary').click();loc('#studio-component-whole').click()
  assert 'Saved entire' in loc('#studio-status').inner_text()
  loc('#studio-glyph').select_option('Ж');loc('#studio-clear').click();loc('#studio-component-place').click()
  assert 'Placed a linked' in loc('#studio-status').inner_text(),loc('#studio-status').inner_text()
  loc('#studio-component-links').select_option('0');loc('#studio-component-dx').fill('10');loc('#studio-component-reposition').click()
  assert 'Updated linked placement' in loc('#studio-status').inner_text()
  loc('#studio-component-bake').click();assert 'Detached' in loc('#studio-status').inner_text()
  loc('#studio-undo').click();assert loc('#studio-component-links option').count()==2
  loc('#studio-redo').click();assert loc('#studio-component-links option').count()==1
  loc('#studio-variant-select').select_option('Bold');loc('#studio-variant-create').click()
  loc('#studio-master-weight').fill('550');loc('#studio-word').fill('AΩЖ');loc('#studio-master-word').click()
  assert 'Interpolated 3' in loc('#studio-master-word-status').inner_text(),loc('#studio-master-word-status').inner_text()
  loc('#studio-variant-select').select_option('Regular');loc('#studio-specimen-preset').select_option('scripts');loc('#studio-specimen-leading').fill('1.8');loc('#studio-specimen-render').click()
  page.wait_for_function("document.querySelector('#studio-specimen-status').textContent.includes('compiled TrueType proof')",timeout=45000)
  loc('#studio-export').click();page.wait_for_function('!!window.exportedFont')
  report=page.evaluate("SkoshGeneratedFontCheck.check(Uint8Array.from(atob(window.exportedFont.split(',')[1]),c=>c.charCodeAt(0)),['Á','Ω','Ж','\\u0301'])")
  assert report['mapped']>=99,report
  loc('#studio-export-editable').click();page.wait_for_function('!!window.exportedDesign')
  assert page.evaluate("window.exportedDesign.glyphs['Á'].length>1 && window.exportedDesign.advances['Ω']===920 && !window.exportedDesign.componentLinks['Ж'] && !!window.exportedDesign.variants.Bold.glyphs['Ω']")
  assert not errors,errors
  print('WORKBENCH PASSED',report)
  browser.close()
