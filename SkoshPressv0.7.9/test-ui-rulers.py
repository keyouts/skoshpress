from pathlib import Path
from playwright.sync_api import sync_playwright
import re, base64
root=Path(__file__).resolve().parent
html=(root/'src/index.html').read_text()
for icon in ['../assets/icon-32.png']:
    html=html.replace(icon,'data:image/png;base64,'+base64.b64encode((root/icon.removeprefix('../')).read_bytes()).decode())
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>','',html)
html=re.sub(r'<script[^>]*></script>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1530,'height':940})
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content(html)
    page.add_style_tag(content=(root/'src/styles.css').read_text())
    for file in ['booklet','units','revisions','print-lab']:
        page.add_script_tag(content=(root/f'lib/{file}.js').read_text())
    page.add_script_tag(content='window.skoshPressAPI={setSpelling:async()=>{},listDictionaries:async()=>({installed:[],platform:"win32"})};')
    page.add_script_tag(content=(root/'src/app.js').read_text())
    assert page.locator('.paper').count()==1,errors
    assert page.locator('.page-ruler').count()==2,errors
    assert page.locator('#rulers-btn').get_attribute('aria-pressed')=='true'
    assert page.locator('.page-ruler.horizontal').evaluate('(e)=>e.width>100 && e.height>0')
    assert page.locator('.page-ruler.vertical').evaluate('(e)=>e.height>100 && e.width>0')
    print('PASS: rulers appear on default publication page')
    page.locator('#rulers-btn').click()
    assert page.locator('.page-ruler').count()==0
    assert page.locator('#rulers-btn').get_attribute('aria-pressed')=='false'
    page.locator('#rulers-btn').click()
    assert page.locator('.page-ruler').count()==2
    print('PASS: toolbar toggle with pressed state')
    page.locator('#settings-btn').click()
    assert page.locator('#settings-rulers').is_checked()
    page.locator('#settings-rulers').uncheck()
    page.locator('#settings-done').click()
    assert page.locator('.page-ruler').count()==0
    page.locator('#settings-btn').click()
    page.locator('#settings-rulers').check()
    page.locator('#settings-done').click()
    assert page.locator('.page-ruler').count()==2
    print('PASS: settings toggle sync and redraw')
    page.locator('#tab-document').click()
    page.locator('#measurement-units').select_option('in')
    assert page.locator('.ruler-corner').inner_text()=='IN'
    page.locator('#custom-unit-controls').is_hidden()
    page.locator('#measurement-units').select_option('custom')
    page.locator('#custom-units-per-inch').fill('8')
    page.locator('#custom-units-per-inch').press('Tab')
    assert page.locator('.ruler-corner').inner_text()=='CU'
    print('PASS: inch/custom ruler display follows unit input')
    first=page.locator('.page-ruler.horizontal').evaluate('(e)=>e.width')
    page.locator('#zoom-in-btn').click()
    assert page.locator('.page-ruler.horizontal').evaluate('(e)=>e.width')>first
    print('PASS: ruler rescales with zoom')
    page.locator('#add-page-btn').click()
    page.locator('#spread-btn').click()
    assert page.locator('.page-ruler').count()==4
    page.locator('#add-page-btn').click()
    page.locator('#all-pages-btn').click()
    assert page.locator('.page-ruler').count()==6
    assert page.locator('.paper').count()==3
    page.screenshot(path='/mnt/data/Skosh-Press-v0.7.3-all-pages-preview.png')
    page.locator('.page-list-item').first.click()
    page.locator('#single-view-btn').click()
    page.locator('#tab-object').click()
    frame=page.locator('.frame').first
    frame.click(position={'x':15,'y':33},force=True)
    frame.press('ArrowRight')
    assert page.locator('#coordinate-hud').is_visible()
    assert page.locator('.page-ruler').count()==2
    page.screenshot(path='/mnt/data/Skosh-Press-v0.7.3-rulers-preview.png')
    print('PASS: both spread and all-pages rulers; object movement unaffected')
    assert not errors,errors
    print('Browser errors:',errors)
    browser.close()
