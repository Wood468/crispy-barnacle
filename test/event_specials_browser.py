"""A single event-details path for correct sourced Roaming art, eggs and daily raids."""
import base64
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get('GO_FIELD_NOTES_BATTLE_URL','http://127.0.0.1:8791')
SHOTS=Path(os.environ.get('GO_FIELD_NOTES_SCREENSHOTS','/tmp/gofn-screenshots'))
SHOTS.mkdir(parents=True,exist_ok=True)
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')

with sync_playwright() as pw:
    browser=getattr(pw,os.environ.get('GO_FIELD_NOTES_TEST_BROWSER','chromium')).launch()
    for width in (360,390,430):
        ctx=browser.new_context(viewport={'width':width,'height':844},
                                timezone_id='Australia/Melbourne',service_workers='block')
        def api(route):
            if '/api/art' in route.request.url:
                route.fulfill(body=PNG,content_type='image/png')
            else:
                route.fulfill(body='{"enabled":false,"events":[],"sources":[]}',content_type='application/json')
        ctx.route('**/api/**',api)
        ctx.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
        ctx.route(re.compile(r'^https://(?:cdn\.leekduck\.com|lh3\.googleusercontent\.com)/'),
                  lambda r:r.fulfill(body=PNG,content_type='image/png'))
        page=ctx.new_page()
        errors=[]
        page.on('pageerror',lambda exc:errors.append(str(exc)))
        page.clock.install(time='2026-11-11T12:00:00+11:00')
        page.goto(BASE+'/')
        page.wait_for_function('!!window.GODETAIL&&!!window.GOEventRegistry&&GOEventRegistry.settled()')
        page.evaluate("GODETAIL.open('into')")
        page.wait_for_selector('#evd .ue-mon[data-identity="999:roaming:none"]',timeout=25000)
        roaming=page.locator('#evd .ue-mon[data-identity="999:roaming:none"]').first
        assert 'Coin Bag' in roaming.inner_text(),(width,roaming.inner_text())
        assert roaming.locator('img.art').get_attribute('src').startswith('/api/art?n=Gimmighoul%20(Roaming%20Form)'),width
        assert page.locator('#evd .ue-mon[data-identity="999:base:none"]').count()==0, 'Chest Form must not replace the Coin Bag encounter'
        page.screenshot(path=str(SHOTS/f'into-coin-bag-roaming-{width}.png'))
        print('PASS Into the Wild Coin Bag Roaming Form at',width)

        page.evaluate("GODETAIL.open('cur:wag')")
        page.wait_for_selector('#evd .ue-raid-days [data-raid-date="2026-11-14"]',timeout=25000)
        egg=page.locator('#evd .ue-mon .ue-egg-corner.ue-egg-10')

        if egg.count()!=4:
            debug=page.evaluate("""async () => {
                const data=await fetch('/event-details.json').then(r=>r.json());
                const src=data.events['leekduck:pokemon-go-wild-area-2026-global'];
                const model=GOEventRegistry.find('wag');
                const known=GOEventAdapter.reconcileSourcedEggs(model,src);
                const ev=GODASH.events().find(e=>e.id==='cur:wag'||e.id==='wag');
                return {
                    eventRecord:ev&&{id:ev.id,detailIds:ev.detailIds,sourceIds:ev.aliasIds},
                    sourceEggNotes:src?.fields?.eggs,
                    sourceEggCount:src?.encounters?.filter(e=>e.method==='egg').length,
                    registryId:model?.eventId,
                    registryEggCount:model?.encounters?.filter(e=>e.method==='egg').length,
                    reconciledEggCount:known?.encounters?.filter(e=>e.method==='egg').length,
                    reconciledEggNames:(known?.encounters||[]).filter(e=>e.method==='egg').map(e=>(known?.pokemon||[]).find(p=>p.key===e.identityKey)?.name),
                    activities:(model?.activities||[]).filter(a=>(a.pokemonRefs||[]).length).map(a=>({id:a.id,kind:a.kind,method:a.encounterMethod,refCount:a.pokemonRefs.length})).slice(0,10)
                };
            }""")
            print('EVENT_EGG_DIAGNOSTICS',debug,flush=True)
        assert egg.count()==4,(width,egg.count(),page.locator('#evd .ue-method[data-method="egg"]').inner_text())
        for item in ('Honedge','Klefki','Drampa','Duraludon'):
            mon=page.locator('#evd .ue-mon',has_text=item).first
            assert mon.count() and mon.locator('.ue-egg-corner img[src="/ico/g/egg-10km.webp"]').count()==1,(width,item)
            # An icon, not a coloured 10 km plate or a second Egg pill.
            marker=mon.locator('.ue-egg-corner')
            visual=marker.evaluate("""el => {
                const cs=getComputedStyle(el), r=el.getBoundingClientRect();
                const img=el.querySelector('img');
                return {children:el.children.length, text:el.textContent.trim(),
                    width:r.width, height:r.height,
                    background:cs.backgroundColor, border:cs.borderTopWidth,
                    shadow:cs.boxShadow, imgWidth:img?.getBoundingClientRect().width};
            }""")
            assert visual['children']==1 and visual['text']=='',(width,item,visual)
            assert 0<visual['width']<=22 and 0<visual['height']<=22,(width,item,visual)
            assert visual['imgWidth']<=22,(width,item,visual)
            assert visual['background']=='rgba(0, 0, 0, 0)',(width,item,visual)
            assert visual['border']=='0px' and visual['shadow']=='none',(width,item,visual)
            assert mon.locator('.ue-b-egg,.ue-km-10').count()==0,(width,item,'redundant egg pill')
            assert '10 km egg' in mon.get_attribute('aria-label'),(width,item,'lost accessible hatch distance')
        saturday=page.locator('#evd .ue-raid-day[data-raid-date="2026-11-14"]').inner_text()
        sunday=page.locator('#evd .ue-raid-day[data-raid-date="2026-11-15"]').inner_text()
        for boss in ('Zekrom','White Kyurem','Dynamax Dialga','Gigantamax Duraludon'):
            assert boss in saturday,(width,boss,saturday)
        for boss in ('Reshiram','Black Kyurem','Dynamax Palkia','Gigantamax Duraludon'):
            assert boss in sunday,(width,boss,sunday)
        assert 'Reshiram' not in saturday and 'White Kyurem' not in sunday
        assert not page.evaluate('document.documentElement.scrollWidth>window.innerWidth+1'),width
        assert not errors,errors
        page.screenshot(path=str(SHOTS/f'go-wild-eggs-raids-{width}.png'))
        print('PASS Wild Area 10 km Eggs and day-separated Raids at',width)

        # Regression from the deployed site: a canonical registry link can open
        # after the event has left the dashboard's visible list. In this path
        # GOEventRegistry.display() has no detailIds. It must still join the
        # curated event's exact source IDs and render only the 4 sourced eggs.
        if width == 360:
            page.evaluate("""() => {
                window.__originalGODASHEvents = GODASH.events;
                GODASH.events = () => [];
            }""")
            try:
                page.evaluate("GODETAIL.open('wag')")
                page.wait_for_selector('#evd [data-evlink="wag"]', timeout=25000)
                canonical_eggs = page.locator('#evd .ue-method[data-method="egg"] .ue-mon')
                assert canonical_eggs.count() == 4, (
                    'Registry-only event fallback lost its verified hatch pool',
                    canonical_eggs.count(), canonical_eggs.all_inner_texts()
                )
                assert canonical_eggs.locator('.ue-egg-corner.ue-egg-10').count() == 4
                page.screenshot(path=str(SHOTS/'go-wild-registry-only-eggs-360.png'))
                print('PASS registry-only event source join retains the four official hatch tiles')
            finally:
                page.evaluate("GODASH.events = window.__originalGODASHEvents")
        ctx.close()
    browser.close()
