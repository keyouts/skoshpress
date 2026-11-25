from pathlib import Path
from playwright.sync_api import sync_playwright
import re, tempfile, subprocess, shutil, json
root=Path(__file__).resolve().parent
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1530,'height':1000})
    page.set_default_timeout(10000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    raw=(root/'src/index.html').read_text()
    html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>|<script[^>]*></script>|<link rel="stylesheet"[^>]*>','',raw)
    page.set_content(html);page.add_style_tag(content=(root/'src/styles.css').read_text())
    page.add_script_tag(content='''window.saved=null;window.exports=[];window.profiles=[];const style={font:'Georgia, serif',fontSize:11,leading:1.45};window.fixture={format:'skosh-press-1',version:4,name:'Press proof',paper:{preset:'a5',width:148,height:210,margin:12},pages:Array.from({length:9},(_,i)=>({id:'p'+i,frames:[{id:'text'+i,type:'text',label:'Text',html:'<h1>Proof page '+(i+1)+'</h1>',x:5,y:12,w:100,h:40,style}]})),fonts:[],stories:{},layers:[{id:'layer-hidden',name:'Hidden',visible:false}]};fixture.pages[0].frames.push({id:'image',type:'image',label:'Bleed image',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=',x:130,y:0,w:18,h:40,fit:'cover',alt:'Artwork'},{id:'hidden-text',type:'text',label:'Hidden',html:'<p>Private hidden text</p>',x:5,y:60,w:100,h:40,style,layerId:'layer-hidden'});window.skoshPressAPI={reportDirty:()=>{},setSpelling:async()=>{},checkRecovery:async()=>null,clearRecovery:async()=>true,snapshotRecovery:async()=>({saved:true}),openProject:async()=>({path:'proof.skoshpress',project:JSON.parse(JSON.stringify(window.saved||fixture))}),saveProject:async doc=>{window.saved=JSON.parse(JSON.stringify(doc));return {path:'proof.skoshpress'}},exportPdf:async(html,w,h,booklet,production)=>{window.exports.push({html,w,h,booklet,production});return {path:'proof.pdf'}},listPrinterProfiles:async()=>window.profiles,savePrinterProfile:async row=>{const record={...row,id:'11111111-1111-4111-8111-111111111111'};window.profiles=[record];return record;}};''')
    for script in re.findall(r'<script defer src="([^"]+)"></script>',raw):page.add_script_tag(content=(root/'src'/script).resolve().read_text())
    page.evaluate("""()=>{const meta=document.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content="style-src-attr 'none'; object-src 'none'; frame-src 'none'";document.head.append(meta);} """)
    page.locator('#open-btn').click();page.wait_for_selector('.paper [data-frame=image]')
    page.locator('#layers-list [data-frame=image]').click();page.locator('#frame-y').fill('-3');page.locator('#frame-y').press('Tab');page.locator('#frame-w').fill('21');page.locator('#frame-w').press('Tab')
    page.locator('#save-btn').click();page.wait_for_function('window.saved!==null');assert page.evaluate("saved.pages[0].frames.find(f=>f.id==='image').y")==-3
    page.locator('#ribbon-tab-output').click();page.locator('#print-lab-btn').click();page.locator('#lab-width').fill('330');page.locator('#lab-height').fill('250');page.locator('#lab-bleed').fill('3');page.locator('#lab-gutter').fill('12');page.locator('#lab-marks').check();page.locator('#lab-signature').select_option('8');page.locator('#lab-caliper').fill('0.15');page.locator('#lab-weight').fill('120');page.locator('#lab-finish').select_option('matte');page.locator('#lab-grain').select_option('short')
    assert 'Pages 8 | 1' in page.locator('#lab-proof-label').inner_text()
    assert page.locator('#lab-proof .production-clip').count()==2
    assert page.locator('#lab-proof .production-mark').count()==10
    assert page.locator('#lab-proof .production-clip').first.evaluate('el=>getComputedStyle(el).position')=='absolute'
    assert page.locator('#lab-proof .production-clip').first.evaluate('el=>parseFloat(getComputedStyle(el).width)')>500
    assert 'Proof page 8' in page.locator('#lab-proof').inner_text() and 'Private hidden text' not in page.locator('#lab-proof').inner_text()
    assert page.locator('#lab-proof .lab-gutter-guide').count()==2
    page.locator('#lab-guides').uncheck();assert page.locator('#lab-proof .lab-guide').count()==0
    page.locator('#lab-gray').check();assert page.locator('#lab-proof .production-clip').first.evaluate('el=>getComputedStyle(el).filter')=='grayscale(1)'
    page.locator('#lab-next-side').click();assert 'Pages 2 | 7' in page.locator('#lab-proof-label').inner_text()
    page.locator('#lab-side').select_option('2');assert 'Creep 0.15 mm' in page.locator('#lab-proof-label').inner_text();page.locator('#lab-side').select_option('4');assert 'Pages blank | 9' in page.locator('#lab-proof-label').inner_text()
    page.locator('#lab-save-profile').click();page.wait_for_function('profiles.length===1');assert page.evaluate('profiles[0].paperWeight')==120;assert page.evaluate('profiles[0].caliper')==.15
    page.locator('#lab-preflight').click();assert 'binding gutter' in page.locator('#lab-preflight-output').inner_text();assert 'dpi target' in page.locator('#lab-preflight-output').inner_text()
    page.locator('#lab-preflight-output button').filter(has_text='dpi target').first.click();assert 'Pages 8 | 1' in page.locator('#lab-proof-label').inner_text()
    page.locator('#lab-export-proof').click();page.wait_for_function('exports.length===1');page.locator('#lab-export-production').click();page.wait_for_function('exports.length===2')
    proof,full=page.evaluate('exports');assert (full['w'],full['h'])==(330,250);assert full['html'].count('class="print-page"')==6 and proof['html'].count('class="print-page"')==1
    assert full['production']['maxCreep']==.15 and full['production']['sideCount']==6 and proof['production']['sideCount']==1;assert 'left:3.15mm' in full['html'];assert 'Private hidden text' not in full['html'] and 'lab-guide' not in full['html'] and 'grayscale' not in full['html']
    assert full['html'].index('Proof page 8')<full['html'].index('Proof page 1')<full['html'].index('Proof page 2');assert 'top:-3mm' in full['html']
    page.locator('#lab-width').fill('100');assert page.locator('#lab-export-production').is_disabled() and page.locator('#lab-export-proof').is_disabled()
    page.locator('#print-lab-close').click();page.locator('#ribbon-tab-output').click();page.locator('#booklet-btn').click();page.wait_for_function('exports.length===3')
    legacy=page.evaluate('exports[2]');assert (legacy['w'],legacy['h'])==(296,210);assert 'production-mark' not in legacy['html']
    print('PASS: profiles, image bleed, sheet preview, guides, grayscale, signatures, preflight, legacy and production output')
    pdf_page=browser.new_page();pdf_page.set_content(full['html']);pdf_page.evaluate('document.fonts.ready')
    with tempfile.TemporaryDirectory() as tmp:
        pdf=Path(tmp)/'production.pdf';pdf_page.pdf(path=str(pdf),prefer_css_page_size=True,print_background=True)
        if shutil.which('pdfinfo'):
            stamped=Path(tmp)/'stamped.pdf';subprocess.run(['node','-e',"const fs=require('node:fs');const p=require('./lib/production-pdf');fs.writeFileSync(process.argv[2],p.addProductionMetadata(fs.readFileSync(process.argv[1]),330,250,JSON.parse(process.argv[3])));",str(pdf),str(stamped),json.dumps(full['production'])],cwd=root,check=True)
            info=subprocess.check_output(['pdfinfo','-box',str(stamped)],text=True);assert 'maximum creep 0.15 mm' in info;assert 'TrimBox:' in info and 'BleedBox:' in info;assert re.search(r'Pages:\s+6\b',info),info
            size=re.search(r'Page size:\s+([\d.]+) x ([\d.]+) pts',info);assert size and abs(float(size[1])-330*72/25.4)<2 and abs(float(size[2])-250*72/25.4)<2,info
            print('PASS: Chromium generated six physical 330 × 250 mm PDF sides with production metadata')
    assert errors==[],errors
    browser.close()
