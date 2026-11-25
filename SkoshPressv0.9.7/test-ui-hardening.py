from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path(__file__).resolve().parent
raw=(root/'src/index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>|<script[^>]*></script>|<link rel="stylesheet"[^>]*>','',raw)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':980});page.set_default_timeout(8000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    page.set_content(html);page.add_style_tag(content=(root/'src/styles.css').read_text())
    page.add_script_tag(content='''window.packaged=null;window.skoshPressAPI={reportDirty:()=>{},setSpelling:async()=>{},checkRecovery:async()=>null,snapshotRecovery:async()=>({saved:true}),clearRecovery:async()=>true,importImage:async()=>({name:'portrait.png',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII='}),exportPackage:async doc=>{window.packaged=JSON.parse(JSON.stringify(doc));return {path:'archive.zip'}}};''')
    for script in re.findall(r'<script defer src="([^"]+)"></script>',raw):page.add_script_tag(content=(root/'src'/script).resolve().read_text())
    loc=page.locator
    assert page.evaluate("""()=>SkoshEditorText.sanitizeHtml('<p onclick=\"x()\">Hello <strong>world</strong><script>bad</script></p>')""")== '<p>Hello <strong>world</strong></p>'
    assert page.evaluate("""()=>{const raw='<span>'.repeat(4000)+'text'+'</span>'.repeat(4000);return SkoshEditorText.sanitizeHtml(raw).includes('text');}""")
    loc('#workspace-open').click();loc('#workspace-mode').select_option('package');assert 'Open the ZIP directly' in loc('#workspace-status').inner_text()
    assert loc('.workspace-result').evaluate('(e)=>e===document.activeElement');page.keyboard.press('ArrowUp');assert loc('.workspace-result').evaluate('(e)=>e===document.activeElement')
    page.keyboard.press('Escape');assert loc('#workspace-open').evaluate('(e)=>e===document.activeElement')
    loc('#workspace-open').click();loc('#workspace-mode').select_option('pages');loc('#workspace-search').fill('Page 1');loc('.workspace-result').first.click();assert loc('#page-list .active').evaluate('(e)=>e===document.activeElement')
    assert not errors,errors
    print('PASS safe markup, package navigation, keyboard boundaries and page focus')
    browser.close()
