"""Universal event rendering with real catalogue plus clearly synthetic future announcements."""
import json
import os
from datetime import datetime,timedelta,timezone
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
 'pokemon':[{'speciesId':'25','name':'Pikachu'}],
 'activities':[{'id':'wild','kind':'wild','pokemonRefs':['25:base:none','25:base:none']},{'id':'raid','kind':'raid','pokemonRefs':['25:base:none']}], 'internalValidation':{'native':True}}
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
    for width in [320,375,390,430,1440]:
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
            const el=document.querySelector('#today-v1 [data-open]');el.focus();
            GODASH.renderAll();return el.isConnected&&document.activeElement===el;
        }"""), 'unchanged Today refresh replaced the focused event button'
        page.locator('#tabs [data-tab="events"]').click()
        target=page.locator('#evtimeline [data-open="synthetic-future-community-day"]')
        target.focus()
        assert target.evaluate('(el)=>{GODASH.renderAll();return el.isConnected&&document.activeElement===el;}'), 'unchanged Schedule refresh replaced the focused event button'
        target.click()
        try:
            page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic Future Community Day'")
            page.evaluate("document.querySelectorAll('#evd [role=tabpanel]').forEach(p=>p.hidden=false)")
        except Exception:
            print('Event handoff failure:',errors,page.evaluate("({title:document.getElementById('evd-t')?.textContent,hidden:document.getElementById('evd')?.hidden,active:document.activeElement?.outerHTML,events:GODASH.events().filter(e=>e.id==='synthetic-future-community-day').map(e=>({id:e.id,name:e.name}))})"),flush=True)
            raise
        assert page.locator('#evd [data-method="wild"]').count()==1
        assert page.locator('#evd [data-method="raid"] [data-identity="25:base:none"]').count()==1
        assert page.locator('#evd [data-method="wild"] [data-identity="25:base:none"]').count()==1
        assert page.locator('#evd-research-title').count()==0, 'unknown research section invented'
        page.keyboard.press('Escape')
        page.evaluate("GODETAIL.open('synthetic-future-festival')")
        page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic Future Festival'")
        page.evaluate("document.querySelectorAll('#evd [role=tabpanel]').forEach(p=>p.hidden=false)")
        for method in ['wild','raid','incense']:
            assert page.locator(f'#evd [data-method="{method}"]').is_visible()
        base=page.locator('#evd [data-method="wild"] [data-identity="25:base:none"]')
        alola=page.locator('#evd [data-identity="26:alola:none"]')
        sun=page.locator('#evd [data-identity="25:base:synthetic-sun"]')
        moon=page.locator('#evd [data-identity="25:base:synthetic-moon"]')
        assert 'Pikachu' in base.inner_text()
        assert 'Alolan Raichu' in alola.inner_text()
        assert sun.count()==1 and moon.count()==1, 'distinct costumes were merged'
        assert sun.locator('img').count()==moon.locator('img').count()==0, 'synthetic costume used ordinary artwork'
        assert moon.locator('.costume-unavailable').count()==1
        assert page.locator('#evd .own,#evd [data-follow],#evd .ue-mon-controls,#evd [data-mark]').count()==0
        assert page.evaluate("GODASH.usGet('form:26:alola')")!=1, 'reading an event changed collection data'
        assert 'Catch 5 Pokémon' in page.locator('#evd').inner_text()
        assert 'Rare Candy' in page.locator('#evd').inner_text()
        assert 'Synthetic afternoon' in page.locator('#evd').inner_text()
        assert 'Rank 2' in page.locator('#evd').inner_text()
        assert 'JPY' in page.locator('#evd').inner_text()
        assert page.locator('#evd .st,#evd .evd-claim-source,#evd .research-task-source,#evd .evd-fresh').count()==0
        assert page.locator('#evd .ue-sources').count()==1
        assert 'example.invalid' not in page.locator('#evd').inner_text()
        assert page.locator('#evd').evaluate('(el)=>el.scrollWidth<=el.clientWidth'), (engine,width)
        page.locator('.evd-nav-link[data-sec="details"]').click()
        assert page.locator('#evd-s-details #evd-sources').evaluate('(el)=>el.open')
        page.keyboard.press('Escape')
        page.evaluate("GODETAIL.open('synthetic-undated-overseas')")
        page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic Overseas Announcement'")
        page.evaluate("document.querySelectorAll('#evd [role=tabpanel]').forEach(p=>p.hidden=false)")
        assert 'Dates to be announced' in page.locator('#evd').inner_text()
        assert 'Invalid Date' not in page.locator('#evd').inner_text()
        page.keyboard.press('Escape')
        page.evaluate("GODETAIL.open('synthetic-native-pass')")
        page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic native GO Pass'")
        page.evaluate("document.querySelectorAll('#evd [role=tabpanel]').forEach(p=>p.hidden=false)")
        assert 'Rank 2' in page.locator('#evd-pass').inner_text()
        assert 'Premium Battle Pass' in page.locator('#evd-pass').inner_text()
        assert errors==[],errors
        context.close()
        print(f'PASS universal {engine} {width}px: future discovery, optional sections, nested activities, exact artwork/forms, read-only Pokémon identities, source privacy, no overflow')
    # Every committed catalogue record must open in the real renderer, including date-unknown references.
    context=browser.new_context(viewport={'width':390,'height':900},timezone_id='Australia/Melbourne',service_workers='block')
    context.route('**/api/**',api)
    context.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/');page.wait_for_function('!!window.GODETAIL&&!!window.GOEventRegistry')
    page.evaluate('GOEventRegistry.ready')
    # Today shows only currently live regional events. A real catalogue may have none
    # at the runner's wall-clock time; verify that case with a deterministic live
    # overseas fixture rather than treating an empty live rail as a product failure.
    regional=page.locator('#today-v1 .t1-reg [data-open]').first
    used_fixture=regional.count()==0 or not regional.is_visible()
    if used_fixture:
        # Real wall-clock window (a faked clock stalls in-page wait_for_function polling).
        now=datetime.now(timezone.utc)
        iso=lambda d:d.strftime('%Y-%m-%dT%H:%MZ');day=lambda d:d.strftime('%Y-%m-%d')
        live_world={'updated':day(now),'events':[{'id':CATALOGUE['events'][0]['eventId'],
            'name':'Zzyzx Synthetic Showcase','place':'Reykjavik, Iceland','area':'Asia','scope':'regional',
            'start':day(now-timedelta(days=2)),'end':day(now+timedelta(days=3)),'datesKnown':True,
            'sources':[{'id':'official','name':'Synthetic fixture only','url':'https://example.invalid/fixture'}],
            'status':'official','seen':day(now)}]}
        # A fresh context: the app persists catalogue state per origin, so the old context would keep the real data.
        context.close()
        context=browser.new_context(viewport={'width':390,'height':900},timezone_id='Australia/Melbourne',service_workers='block')
        context.route('**/api/**',api)
        context.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
        context.route('**/world-events.json',lambda route:route.fulfill(body=json.dumps(live_world),content_type='application/json'))
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/')
        page.wait_for_function('!!window.GODETAIL&&!!window.GOEventRegistry')
        page.evaluate('GOEventRegistry.ready')
        regional=page.locator('#today-v1 .t1-reg [data-open]').first
    try:regional.wait_for(state='visible')
    except Exception:
        print('DIAG used_fixture=%s errors=%s reg=%s'%(used_fixture,errors,page.evaluate("[...document.querySelectorAll('#today-v1 .t1-reg')].map(e=>e.outerHTML.slice(0,260))")))
        print('DIAG today=%s'%page.evaluate("document.querySelector('#today-v1').innerText.slice(0,400)"))
        raise
    regional_id=regional.get_attribute('data-open')
    expected_title=page.evaluate('(id)=>GOEventRegistry.find(id).title',regional_id)
    source_url=page.evaluate('(id)=>GOEventRegistry.find(id).sources.map(s=>s.url)[0]',regional_id)
    regional.click()
    page.wait_for_function('(title)=>document.getElementById("evd-t")?.textContent===title',arg=expected_title)
    assert len(context.pages)==1, 'known overseas event escaped to its external source'
    assert page.locator('#evd-sources a').evaluate_all('(links,url)=>links.some(a=>a.href===url)',source_url)
    page.keyboard.press('Escape')
    page.wait_for_function('!GONAV.internal&&GONAV.pending.length===0')
    print('PASS overseas Today listing opens the universal sheet and retains its source link')
    # Restore the unmodified catalogue for the exhaustive real-event sweep.
    if used_fixture:
        context.unroute('**/world-events.json')
        page.goto(BASE+'/')
        page.wait_for_function('!!window.GODETAIL&&!!window.GOEventRegistry')
        page.evaluate('GOEventRegistry.ready')
    # Exercise every renderer using one sheet session. Hundreds of synthetic push/back
    # operations exceed WebKit's history traversal rate limit and obscure the render checks.
    # Actual close/focus/history journeys are verified separately above and below.
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
    late_target=page.locator('#evtimeline [data-open="synthetic-future-community-day"]')
    late_target.scroll_into_view_if_needed()
    page.wait_for_function("""()=>{
        const el=document.querySelector('#evtimeline [data-open="synthetic-future-community-day"]');
        if(!el)return false;
        const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return hit?.closest('[data-open]')===el;
    }""")
    late_target.click()
    try:
        page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic Future Community Day'")
        page.evaluate("document.querySelectorAll('#evd [role=tabpanel]').forEach(p=>p.hidden=false)")
    except Exception:
        print('Late catalogue handoff failure:',errors,sorted(pending),page.evaluate("({title:document.getElementById('evd-t')?.textContent,hidden:document.getElementById('evd')?.hidden,active:document.activeElement?.outerHTML.slice(0,240),depth:GONAV.depth,settled:GOEventRegistry.settled(),handoff:window.__handoff,places:!!window.GOPLACES,events:GODASH.events().filter(e=>e.id==='synthetic-future-community-day').map(e=>({id:e.id,name:e.name}))})"),flush=True)
        raise
    assert errors==[],errors
    print('PASS late catalogue announces future events without a reload or user-state edit')
    context.close()
    context=browser.new_context(viewport={'width':390,'height':900},timezone_id='America/New_York',service_workers='block')
    context.add_init_script("localStorage.setItem('gofn-timezone','America/New_York')")
    context.route('**/api/**',api)
    dst={**FUTURE,'eventId':'synthetic-dst-gap','title':'Synthetic DST gap','schedule':{'timeBasis':'player-local','start':'2027-03-14T02:30','end':'2027-03-14T03:30'}}
    context.route('**/events-v1.json',lambda r:r.fulfill(body=json.dumps({'schemaVersion':1,'species':DEX,'events':[dst]}),content_type='application/json'))
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/');page.wait_for_function('!!window.GODETAIL&&!!window.GOEventRegistry');page.evaluate('GOEventRegistry.ready')
    page.evaluate("GODETAIL.open('synthetic-dst-gap')")
    page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic DST gap'")
    page.evaluate("document.querySelectorAll('#evd [role=tabpanel]').forEach(p=>p.hidden=false)")
    assert page.locator('#evd a[download]').count()==0
    assert errors==[],errors
    print('PASS player-local DST gap keeps detail readable and withholds invalid calendar')
    context.close()
    # A supplementary source that never answers cannot block the validated announcement.
    context=browser.new_context(viewport={'width':390,'height':900},timezone_id='Asia/Tokyo',service_workers='block')
    context.route('**/api/**',api)
    context.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
    context.route('**/events-v1.json',lambda r:r.fulfill(body=json.dumps({'schemaVersion':1,'species':DEX,'events':[FUTURE]}),content_type='application/json'))
    stalled=[];context.route('**/event-details.json',lambda r:stalled.append(r))
    context.add_init_script("localStorage.setItem('gofn-dex-v1',JSON.stringify({m:{own:{25:1}}}));localStorage.setItem('gofn-us-v1',JSON.stringify({'follow:pikachu':{v:'Pikachu',t:1}}));")
    page=context.new_page();page.clock.install(time='2026-11-07T12:00:00+09:00')
    page.goto(BASE+'/',wait_until='domcontentloaded')
    page.wait_for_function('!!window.GODETAIL&&GOEventRegistry.settled()')
    before=page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})")
    page.evaluate("GODETAIL.open('synthetic-future-community-day')")
    page.clock.run_for(8100)
    page.wait_for_function("document.getElementById('evd-t')?.textContent==='Synthetic Future Community Day'")
    page.evaluate("document.querySelectorAll('#evd [role=tabpanel]').forEach(p=>p.hidden=false)")
    assert page.locator('#evd [data-method="wild"]').count()==1
    assert page.locator('#evd [data-method="wild"] .ue-mon').count()==1
    assert page.locator('#evd .own,#evd [data-follow],#evd [data-mark]').count()==0
    assert page.locator('#evd-research-title').count()==0
    assert 'supplementary event information could not be loaded' in page.locator('#evd-sources').inner_text()
    assert page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})")==before
    for route in stalled:route.abort()
    print('PASS stalled supplementary source retains canonical details, optional sections and collection state')
    context.close();browser.close()
