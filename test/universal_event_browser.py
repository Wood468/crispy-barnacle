"""Universal event rendering with real catalogue plus clearly synthetic future announcements."""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
BASE='http://127.0.0.1:8791'
DEX=json.loads((ROOT/'public/dex.json').read_text())
CATALOGUE=json.loads((ROOT/'public/events-v1.json').read_text())
FESTIVAL={
 'schemaVersion':1,'eventId':'synthetic-future-festival','title':'Synthetic Future Festival','family':'go-fest',
 'schedule':{'timeBasis':'instant','start':'2026-11-07T00:00Z','end':'2026-11-09T00:00Z'},
 'pokemon':[{'speciesId':'25','name':'Pikachu','shiny':'yes'},
            {'speciesId':'26','name':'Raichu','formId':'alola'},
            {'speciesId':'25','name':'Pikachu','costumeId':'synthetic-sun','label':'Test sun crown'},
            {'speciesId':'25','name':'Pikachu','costumeId':'synthetic-moon','label':'Test moon crown'}],
 'encounters':[{'identityKey':'25:base:none','method':'wild'}, {'identityKey':'25:base:none','method':'raid'},
               {'identityKey':'26:alola:none','method':'wild'},
               {'identityKey':'25:base:synthetic-sun','method':'wild'}, {'identityKey':'25:base:synthetic-moon','method':'wild'}],
 'activities':[{'id':'habitat','title':'Synthetic habitat'},
               {'id':'hour-one','parentId':'habitat','kind':'incense','title':'Synthetic afternoon',
                'access':'Ticket holders','pokemonRefs':['25:base:none'],
                'schedule':{'timeBasis':'instant','start':'2026-11-07T03:00Z','end':'2026-11-07T04:00Z'}}],
 'research':[{'task':'Catch 5 Pokémon','rewards':[{'type':'item','name':'Rare Candy','quantity':3}]}],
 'passes':[{'title':'Synthetic GO Pass','stages':[{'rank':2,'points':100,'free':['1 Rare Candy'],'deluxe':['1 Premium Battle Pass']}]}],
 'tickets':[{'title':'Synthetic festival ticket','access':'Optional paid access','price':{'currency':'JPY','amount':1000},'url':'https://example.invalid/ticket'}],
 'internalValidation':{'native':True},'sources':[{'name':'Synthetic fixture only','url':'https://example.invalid/fixture'}]
}
NATIVE_PASS={**FESTIVAL,'eventId':'synthetic-native-pass','title':'Synthetic native GO Pass','family':'go-pass'}
FUTURE={'schemaVersion':1,'eventId':'synthetic-future-community-day','title':'Synthetic Future Community Day',
 'schedule':{'timeBasis':'player-local','start':'2026-11-08T14:00','end':'2026-11-08T17:00'},
 'pokemon':[{'speciesId':'25','name':'Pikachu','methods':['wild']}], 'internalValidation':{'native':True}}
UNDATED={'schemaVersion':1,'eventId':'synthetic-undated-overseas','title':'Synthetic Overseas Announcement',
 'attendance':'in-person','location':'Synthetic overseas destination','lifecycle':'announced',
 'internalValidation':{'native':True}}

def api(route):
    if route.request.url.split('?',1)[0].endswith(('/api/events','/api/sources')):
        route.fulfill(body='{"enabled":false,"events":[],"sources":[]}',content_type='application/json')
    else:route.fulfill(status=404,body='{}',content_type='application/json')

with sync_playwright() as p:
    engine=os.environ.get('GO_FIELD_NOTES_TEST_BROWSER','chromium')
    browser=getattr(p,engine).launch()
    for width in [320,390,430,1440]:
        context=browser.new_context(viewport={'width':width,'height':900},timezone_id='Australia/Melbourne',service_workers='block')
        context.set_default_timeout(15000)
        context.route('**/api/**',api)
        context.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
        context.route('**/events-v1.json',lambda r:r.fulfill(body=json.dumps({'schemaVersion':1,'species':DEX,'events':[FESTIVAL,FUTURE,UNDATED,NATIVE_PASS]}),content_type='application/json'))
        context.add_init_script("""localStorage.setItem('gofn-dex-v1',JSON.stringify({m:{own:{25:1}}}));localStorage.setItem('gofn-us-v1',JSON.stringify({'form:26:alola':{v:0,t:1},'costume:25:pikachutestsuncrown':{v:1,t:1}}));""")
        page=context.new_page();errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.clock.install(time='2026-11-07T12:00:00+11:00')
        page.goto(BASE+'/')
        page.wait_for_function("!!window.GODASH&&!!window.GODETAIL&&GODASH.events().some(e=>e.id==='synthetic-future-community-day')&&GODASH.DEXBY.raichu===26")
        assert page.locator('#universal-announced-tab-now').is_visible(), 'undated overseas announcement hidden'
        assert page.evaluate("""()=>{
            GODASH.renderAll();
            const el=document.querySelector('#home-now [data-open]');el.focus();
            GODASH.renderAll();return el.isConnected&&document.activeElement===el;
        }"""), 'unchanged Today refresh replaced the focused event button'
        page.locator('#tabs [data-tab="events"]').click()
        target=page.locator('#evtimeline [data-open="synthetic-future-community-day"]')
        target.focus()
        assert target.evaluate('(el)=>{GODASH.renderAll();return el.isConnected&&document.activeElement===el;}'), 'unchanged Schedule refresh replaced the focused event button'
        target.click()
        try:
            page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic Future Community Day'")
        except Exception:
            print('Event handoff failure:',errors,page.evaluate("({title:document.getElementById('evd-t')?.textContent,hidden:document.getElementById('evd')?.hidden,active:document.activeElement?.outerHTML,events:GODASH.events().filter(e=>e.id==='synthetic-future-community-day').map(e=>({id:e.id,name:e.name}))})"),flush=True)
            raise
        assert page.locator('#evd [data-method="wild"]').count()==1
        assert page.locator('#evd-research-title').count()==0, 'unknown research section invented'
        page.keyboard.press('Escape')
        page.evaluate("GODETAIL.open('synthetic-future-festival')")
        page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic Future Festival'")
        for method in ['wild','raid','incense']:
            assert page.locator(f'#evd [data-method="{method}"]').is_visible()
        base=page.locator('#evd [data-method="wild"] [data-identity="25:base:none"]')
        alola=page.locator('#evd [data-identity="26:alola:none"]')
        sun=page.locator('#evd [data-identity="25:base:synthetic-sun"]')
        moon=page.locator('#evd [data-identity="25:base:synthetic-moon"]')
        assert base.locator('.own').inner_text()=='Have'
        assert 'Alolan Raichu' in alola.inner_text()
        assert alola.locator('.own').inner_text()=='Need', 'form inherited base ownership'
        assert sun.locator('.own').inner_text()=='Have'
        assert moon.locator('.own').inner_text()=='Not tracked', 'costume inherited base or sibling ownership'
        assert sun.locator('img').count()==moon.locator('img').count()==0, 'synthetic costume used ordinary artwork'
        assert moon.locator('.costume-unavailable').count()==1
        alola.locator('.ue-marking > summary').click()
        alola.locator('[data-val="1"]').click()
        assert page.evaluate("GODASH.usGet('form:26:alola')")==1
        assert alola.locator('.own').inner_text()=='Have'
        alola.locator('.ue-follow').click()
        assert alola.locator('.ue-follow').get_attribute('aria-pressed')=='true'
        assert 'Catch 5 Pokémon' in page.locator('#evd').inner_text()
        assert 'Rare Candy' in page.locator('#evd').inner_text()
        assert 'Synthetic afternoon' in page.locator('#evd').inner_text()
        assert 'Rank 2' in page.locator('#evd').inner_text()
        assert 'JPY' in page.locator('#evd').inner_text()
        assert page.locator('#evd .st,#evd .evd-claim-source,#evd .research-task-source,#evd .evd-fresh').count()==0
        assert page.locator('#evd .ue-sources').count()==1
        assert 'example.invalid' not in page.locator('#evd').inner_text()
        assert page.locator('#evd').evaluate('(el)=>el.scrollWidth<=el.clientWidth'), (engine,width)
        page.locator('.evd-jump a[href="#evd-sources"]').click()
        assert page.locator('#evd-sources').evaluate('(el)=>el.open&&el===document.activeElement')
        page.keyboard.press('Escape')
        page.evaluate("GODETAIL.open('synthetic-undated-overseas')")
        page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic Overseas Announcement'")
        assert 'Dates to be announced' in page.locator('#evd').inner_text()
        assert 'Invalid Date' not in page.locator('#evd').inner_text()
        page.keyboard.press('Escape')
        page.evaluate("GODETAIL.open('synthetic-native-pass')")
        page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic native GO Pass'")
        assert 'Rank 2' in page.locator('#evd-pass').inner_text()
        assert 'Premium Battle Pass' in page.locator('#evd-pass').inner_text()
        assert errors==[],errors
        context.close()
        print(f'PASS universal {engine} {width}px: future discovery, optional sections, nested activities, exact artwork/forms, shared ownership, follow, source privacy, no overflow')
    # Every committed catalogue record must open in the real renderer, including date-unknown references.
    context=browser.new_context(viewport={'width':390,'height':900},timezone_id='Australia/Melbourne',service_workers='block')
    context.route('**/api/**',api)
    context.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/');page.wait_for_function('!!window.GODETAIL&&!!window.GOEventRegistry')
    page.evaluate('GOEventRegistry.ready')
    regional=page.locator('#home-now .agr.reg[data-open]').first
    regional.wait_for(state='visible')
    regional_id=regional.get_attribute('data-open')
    expected_title=page.evaluate('(id)=>GOEventRegistry.find(id).title',regional_id)
    source_url=regional.get_attribute('href')
    regional.click()
    page.wait_for_function('(title)=>document.getElementById("evd-t")?.textContent===title',arg=expected_title)
    assert len(context.pages)==1, 'known overseas event escaped to its external source'
    assert page.locator('#evd-sources a').evaluate_all('(links,url)=>links.some(a=>a.href===url)',source_url)
    page.keyboard.press('Escape')
    page.wait_for_function('!GONAV.internal&&GONAV.pending.length===0')
    print('PASS overseas Today listing opens the universal sheet and retains its source link')
    for item in CATALOGUE['events']:
        page.evaluate('(id)=>GODETAIL.open(id)',item['eventId'])
        page.wait_for_function('(title)=>document.getElementById("evd-t")?.textContent===title',arg=item['title'],timeout=10000)
        assert page.locator('#evd .ue-hero').count()==1,item['eventId']
        assert page.locator('#evd .ue-sources').count()==1,item['eventId']
        assert page.locator('#evd').evaluate('(el)=>el.scrollWidth<=el.clientWidth'),item['eventId']
        page.evaluate('GODETAIL.close()')
    page.wait_for_function('!GONAV.internal&&GONAV.pending.length===0')
    assert page.evaluate('GONAV.depth')==0
    assert page.url.rstrip('/')==BASE
    assert errors==[],errors
    print(f'PASS all {len(CATALOGUE["events"])} catalogue records open with universal renderer in {engine}')
    context.close()
    # A slow catalogue must publish new announcements after Today is already usable.
    context=browser.new_context(viewport={'width':390,'height':900},timezone_id='Australia/Melbourne',service_workers='block')
    context.route('**/api/**',api)
    context.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
    held=[]
    context.route('**/events-v1.json',lambda route:held.append(route))
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    pending=set()
    page.on('request',lambda r:pending.add(r.url))
    page.on('requestfinished',lambda r:pending.discard(r.url))
    page.on('requestfailed',lambda r:pending.discard(r.url))
    page.add_init_script("""window.__handoff=[];['pointerdown','pointerup','click'].forEach(type=>document.addEventListener(type,e=>window.__handoff.push({type,target:e.target.closest('[data-open]')?.getAttribute('data-open')||e.target.tagName}),true));""")
    page.clock.install(time='2026-11-07T12:00:00+11:00')
    page.goto(BASE+'/',wait_until='domcontentloaded')
    page.wait_for_function("!!window.GODETAIL&&GODASH.eventsState()!=='pending'")
    assert held and not page.evaluate("GODASH.events().some(e=>e.id==='synthetic-future-community-day')")
    held[0].fulfill(body=json.dumps({'schemaVersion':1,'species':DEX,'events':[FUTURE]}),content_type='application/json')
    page.wait_for_function("GODASH.events().some(e=>e.id==='synthetic-future-community-day')")
    page.locator('#tabs [data-tab="events"]').click()
    page.locator('#evtimeline [data-open="synthetic-future-community-day"]').click()
    try:
        page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic Future Community Day'")
    except Exception:
        print('Late catalogue handoff failure:',errors,sorted(pending),page.evaluate("({title:document.getElementById('evd-t')?.textContent,hidden:document.getElementById('evd')?.hidden,active:document.activeElement?.outerHTML,depth:GONAV.depth,settled:GOEventRegistry.settled(),handoff:window.__handoff,places:!!window.GOPLACES,events:GODASH.events().filter(e=>e.id==='synthetic-future-community-day').map(e=>({id:e.id,name:e.name}))})"),flush=True)
        page.evaluate("GODETAIL.open('synthetic-future-community-day')")
        page.wait_for_timeout(300)
        print('Direct open diagnostic:',page.locator('#evd-t').all_text_contents(),sorted(pending),flush=True)
        raise
    assert errors==[],errors
    print('PASS late catalogue announces future events without a reload or user-state edit')
    context.close()
    context=browser.new_context(viewport={'width':390,'height':900},timezone_id='America/New_York',service_workers='block')
    context.route('**/api/**',api)
    dst={**FUTURE,'eventId':'synthetic-dst-gap','title':'Synthetic DST gap','schedule':{'timeBasis':'player-local','start':'2027-03-14T02:30','end':'2027-03-14T03:30'}}
    context.route('**/events-v1.json',lambda r:r.fulfill(body=json.dumps({'schemaVersion':1,'species':DEX,'events':[dst]}),content_type='application/json'))
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/');page.wait_for_function('!!window.GODETAIL&&!!window.GOEventRegistry');page.evaluate('GOEventRegistry.ready')
    page.evaluate("GODETAIL.open('synthetic-dst-gap')")
    page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic DST gap'")
    assert page.locator('#evd a[download]').count()==0
    assert errors==[],errors
    print('PASS player-local DST gap keeps detail readable and withholds invalid calendar')
    context.close();browser.close()
