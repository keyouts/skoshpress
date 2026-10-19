from pathlib import Path
from playwright.sync_api import sync_playwright
import re, base64, json
root=Path(__file__).resolve().parent
html=(root/'src/index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>','',html)
html=re.sub(r'<script[^>]*></script>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
logo='data:image/png;base64,'+base64.b64encode((root/'assets/icon-32.png').read_bytes()).decode()
html=html.replace('../assets/icon-32.png',logo)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1350,'height':900})
    page.on('dialog',lambda dialog:dialog.accept())
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html)
    page.add_style_tag(content=(root/'src/styles.css').read_text())
    for name in ['booklet.js','units.js','revisions.js','print-lab.js']:
        page.add_script_tag(content=(root/'lib'/name).read_text())
    page.add_script_tag(content='''window.recoveryLog={snapshots:[],checked:0,cleared:0};
     window.skoshPressAPI={
      reportDirty:()=>{},setSpelling:async()=>{},resetProjectPath:async()=>true,
      checkRecovery:async()=>{window.recoveryLog.checked++;return null},
      snapshotRecovery:async doc=>{window.recoveryLog.snapshots.push(JSON.parse(JSON.stringify(doc)));return {saved:true}},
      clearRecovery:async()=>{window.recoveryLog.cleared++;return true},
      saveProject:async()=>{window.recoveryLog.cleared++;return {path:'C:/published/new.skoshpress'}},onSaveBeforeClose:()=>{},
      onMenu:()=>{}
     };''')
    page.add_script_tag(content=(root/'src/app.js').read_text())
    page.wait_for_function('window.recoveryLog.checked===1')
    frame=page.locator('.frame-text').first
    frame.dblclick(force=True)
    assert frame.get_attribute('contenteditable')=='true'
    frame.fill('Recovery should keep these words')
    assert frame.get_attribute('contenteditable')=='true'
    page.wait_for_function('window.recoveryLog.snapshots.length>0',timeout=6000)
    recovered=page.evaluate('window.recoveryLog.snapshots.at(-1)')
    assert any('Recovery should keep these words' in f['html'] for pg in recovered['pages'] for f in pg['frames'] if f['type']=='text')
    assert not errors,errors
    print('PASS: actively edited text is snapshotted without blur')
    frame.press('Escape',timeout=3000)
    page.locator('#save-btn').click(timeout=4000)
    page.wait_for_function('window.recoveryLog.cleared>0',timeout=4000)
    print('PASS: successful save clears recovery')
    browser.close()
