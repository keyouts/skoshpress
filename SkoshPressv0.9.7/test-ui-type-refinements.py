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
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('dialog',lambda d:d.accept())
  page.set_content(html)
  page.add_style_tag(content=(root/'src/styles.css').read_text())
  page.add_script_tag(content='''window.skoshPressAPI={
    reportDirty:()=>{},setSpelling:async()=>{},onMenu:()=>{},checkRecovery:async()=>null,
    snapshotRecovery:async()=>({saved:true}),clearRecovery:async()=>true,
    listFontLibrary:async()=>[],loadFontLibrary:async()=>null,
    importFont:async()=>null,exportFont:async()=>null
  };''')
  for script in scripts:
    file=(root/'src'/script).resolve()
    assert file.is_file(),(script,file)
    page.add_script_tag(content=file.read_text())
  assert not errors,errors
  page.locator('#typography-studio-btn').click()
  page.locator('#studio-variant-select').select_option('Bold')
  page.locator('#studio-variant-create').click()
  page.locator('#studio-master-check').click()
  summary=page.locator('#studio-master-summary').inner_text()
  print('MASTER:',summary)
  assert 'glyphs' in summary
  page.locator('#studio-overlay-face').select_option('Bold')
  assert page.locator('#studio-master-overlay path').count()>=2
  assert 'paired anchors' in page.locator('#studio-overlay-summary').inner_text()
  print('OVERLAY:',page.locator('#studio-overlay-summary').inner_text())
  page.locator('#studio-specimen-preset').select_option('pangram')
  assert 'quick brown fox' in page.locator('#studio-specimen-text').input_value()
  page.locator('#studio-specimen-layout').select_option('editorial')
  page.locator('#studio-specimen-face').select_option('Bold')
  page.locator('#studio-specimen-render').click()
  page.wait_for_function("document.querySelector('#studio-specimen-status').textContent.includes('compiled TrueType proof') || document.querySelector('#studio-specimen-status').textContent.includes('could not load')",timeout=45000)
  status=page.locator('#studio-specimen-status').inner_text()
  print('SPECIMEN:',status)
  assert 'compiled TrueType proof' in status,status
  assert page.locator('#studio-specimen-canvas').evaluate('c=>c.width')==960
  page.locator('#studio-integrity-panel summary').click()
  page.locator('#studio-integrity-run').click()
  count=page.locator('#studio-integrity-counts').inner_text()
  print('INTEGRITY:',count)
  assert 'blocking errors' in count
  page.locator('#studio-integrity-filter').select_option('warning')
  page.locator('#studio-ellipse').click()
  page.locator('#studio-master-check').click()
  assert 'errors' in page.locator('#studio-master-summary').inner_text()
  assert page.locator('#studio-master-overlay .studio-overlay-orphan').count()>0
  page.locator('#studio-master-overlay').scroll_into_view_if_needed()
  page.screenshot(path='/mnt/data/skosh_master_overlay_proof.png')
  page.locator('#studio-integrity-filter').select_option('error')
  page.locator('#studio-integrity-run').click()
  assert '1 blocking errors' in page.locator('#studio-integrity-counts').inner_text()
  page.locator('#studio-integrity-results .studio-integrity-link').first.click()
  assert page.locator('#studio-variant-select').input_value()=='Bold'
  assert page.locator('#studio-glyph').input_value()=='A'
  print('PASS: incompatible Bold contour appears in master overlay and actionable integrity review')
  assert not errors,errors
  page.locator('#studio-specimen-panel').scroll_into_view_if_needed()
  page.screenshot(path='/mnt/data/skosh_typography_refinements_proof.png')
  print('BROWSER SMOKE PASSED; errors',errors)
  browser.close()
