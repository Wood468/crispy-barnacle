"""Combined release checks: source-bound costumes/GO Pass, real PWA upgrade, and read-only production smoke."""
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get('GO_FIELD_NOTES_RELEASE_URL', 'http://127.0.0.1:8791').rstrip('/')
ENGINE = os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')
PRODUCTION = BASE.startswith('https://')
SW = (ROOT / 'public/sw.js').read_text()
CACHE = re.search(r"const SHELL_CACHE = '([^']+)'", SW)[1]

def open_context(browser, width=390, workers='block'):
    ctx = browser.new_context(viewport={'width': width, 'height': 844}, timezone_id='Australia/Sydney', service_workers=workers)
    ctx.set_default_timeout(15000)
    ctx.set_default_navigation_timeout(20000)
    return ctx

def stub_api(route):
    payload = '{"enabled":false,"events":[],"sources":[]}'
    route.fulfill(status=200 if route.request.url.endswith(('/api/events', '/api/sources')) else 404,
                  body=payload, content_type='application/json')

with sync_playwright() as pw:
    browser = getattr(pw, ENGINE).launch()
    if PRODUCTION:
        for width in (320, 390, 1440):
            context = open_context(browser, width)
            page = context.new_page()
            blocked = []
            def read_only(route):
                if route.request.method not in ('GET', 'HEAD', 'OPTIONS'):
                    blocked.append(route.request.url)
                    return route.fulfill(status=204, body='')
                route.continue_()
            context.route('**/api/**', read_only)
            page.goto(BASE + '/')
            page.wait_for_function('!!window.GODASH && !!window.GODETAIL')
            if width == 390:
                refs = re.findall(r"'(/[^']+\.(?:js|css)(?:\?v=[^']+)?)'", SW)
                refs = list(dict.fromkeys(refs))
                for url in ['/sw.js'] + refs:
                    content = page.evaluate('async url => {const r=await fetch(url,{cache:"reload"}); if(!r.ok) throw Error(url+": "+r.status); return r.text()}', url)
                    expected = (ROOT / 'public' / url.split('?', 1)[0].lstrip('/')).read_bytes()
                    assert hashlib.sha256(content.encode()).digest() == hashlib.sha256(expected).digest(), 'stale production asset: ' + url
                print('PASS production script/style/service-worker hashes match the release checkout')
                page.evaluate('GOEventRegistry.ready')
                integrity=page.evaluate("async()=>GOEventCatalogue.validate(await fetch('/events-v1.json',{cache:'reload'}).then(r=>r.json())).diagnostics")
                assert integrity['rejectedCount']==0 and not integrity['conflicts'],integrity
                assert page.evaluate('GOEventRegistry.events().length')>0
                print('PASS production catalogue validates with no rejected events or identity collisions')
                before=page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})")
                assert page.evaluate('GOEventClock.viewerZone()')=='Australia/Melbourne'
                for choice,expected in [('America/New_York','America/New_York'),('','Australia/Sydney')]:
                    page.locator('#hmenu').click()
                    page.locator('#timezonedd > summary').click()
                    page.locator('#timezone-choice').select_option(choice)
                    page.locator('#timezone-form button').click()
                    page.wait_for_function('!!window.GODASH && !!window.GODETAIL && GOEventRegistry.settled()')
                    assert page.evaluate('GOEventClock.viewerZone()')==expected
                assert page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})")==before
                print('PASS production Melbourne default → override → explicit device time with unchanged collection storage')
                # Production-only full core-journey smoke. Source data is live:
                # choose a published event by its contract, never a fixture ID.
                page.locator('#tabs [data-tab="now"]').click()
                page.wait_for_selector('#today-v1 .t1-glance', timeout=15000)
                assert page.locator('#today-v1 .t1-tiles').count() == 1, 'Today summary did not render'
                assert not page.locator('#today-v1 [data-follow],#today-v1 [data-mark],#today-v1 .own').count(), 'Follow/Track controls must not appear on Today'
                assert page.locator('#today-v1').evaluate('(el) => el.scrollWidth <= el.clientWidth'), 'Today overflows on mobile'
                page.locator('#tabs [data-tab="raids"]').click()
                page.wait_for_function("document.querySelector('#rotnow')?.innerText?.length > 60", timeout=15000)
                assert page.locator('#tab-raids').is_visible(), 'Battle panel is missing'
                assert 'Raid' in page.locator('#rotnow').inner_text(), 'Raid/Max information did not render'
                assert page.locator('#rotnow').evaluate('(el) => el.scrollWidth <= el.clientWidth'), 'Battle content overflows'
                page.locator('#tabs [data-tab="events"]').click()
                event_id = page.evaluate("""() => {
                    const models = GOEventRegistry.events();
                    const event = models.find(e => e.schedule && ((e.pokemon || []).length || (e.activities || []).length));
                    return event && event.eventId;
                }""")
                assert event_id, 'No published event with a dated schedule and details'
                page.evaluate('(id) => GODETAIL.open(id)', event_id)
                page.wait_for_selector('#evd .ue-hero', timeout=15000)
                assert page.locator('#evd-t').is_visible(), 'Event title missing'
                assert page.locator('#evd .evd-nav-link').count() >= 1, 'Universal event navigation missing'
                assert not page.locator('#evd [data-follow],#evd [data-mark],#evd .own').count(), 'Follow/Track controls must not appear on Event Details'
                assert page.locator('#evd').evaluate('(el) => el.scrollWidth <= el.clientWidth'), 'Event Details overflows'
                page.keyboard.press('Escape')
                page.locator('#evd').wait_for(state='hidden', timeout=15000)
                pass_id = page.evaluate("""() => {
                    const event = GOEventRegistry.events().find(e => (e.passes || []).some(p => Array.isArray(p.stages) && p.stages.length));
                    return event && event.eventId;
                }""")
                assert pass_id, 'GO Pass stage information missing from the published catalogue'
                page.evaluate('(id) => GODETAIL.open(id)', pass_id)
                page.wait_for_selector('#evd .ue-pass', timeout=15000)
                assert page.locator('#evd .ue-pass-rank').count() > 0, 'GO Pass rank timeline did not render'
                assert page.locator('#evd').evaluate('(el) => el.scrollWidth <= el.clientWidth'), 'GO Pass overflows'
                page.keyboard.press('Escape')
                page.locator('#evd').wait_for(state='hidden', timeout=15000)
                assert not blocked, 'Read-only production navigation must not write to a private API'
                print('PASS production Today → Battle → Event Details → GO Pass mobile read-only smoke; no Track/Follow controls')
            page.locator('#tabs [data-tab="events"]').click()
            assert page.locator('.schedule-heading').is_visible()
            page.locator('#tabs [data-tab="collect"]').click()
            page.locator('#subnav-collect [data-sub="opps"]').click()
            page.locator('#opp-search').fill('zz-release-no-matching-pokemon')
            page.locator('#opp-clear').click()
            assert page.locator('#opp-search').evaluate('(el)=>el===document.activeElement')
            page.locator('#tabs [data-tab="events"]').click()
            page.locator('#subnav-events [data-sub="research"]').click()
            page.wait_for_function('!document.getElementById("research-list").hasAttribute("aria-busy")')
            assert 'could not be loaded' not in page.locator('#research-status').inner_text().lower()
            assert page.locator('[data-research-refresh]').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            print(f'PASS read-only production navigation/Collection/Research {ENGINE} {width}px; blocked writes: {len(blocked)}')
            context.close()
    else:
        context = open_context(browser)
        context.route('**/api/**', stub_api)
        context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
        details = json.loads((ROOT / 'public/event-details.json').read_text())
        # Use the captured source excerpt through the real parser, then the real detail renderer.
        source = "import{readFileSync}from'node:fs';import{extractLeekDuckGoPassRewards as parse}from'./scripts/importer/gopass.mjs';console.log(JSON.stringify(parse(readFileSync('test/fixtures/leekduck-gopass-november-2026-excerpts.html','utf8'),{allowPartialExcerpt:true})))"
        parsed = json.loads(subprocess.run(['node', '--input-type=module', '-e', source], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
        details['events']['leekduck:go-pass-november-2026'] = {
            'name': 'GO Pass: November', 'updated': '2026-11-06T01:00:00Z',
            'goPassParseWarning': 'GO Pass source parsing failed; previously published rank rewards were retained.',
            'goPassRetainedAt': '2026-11-01T10:00:00Z',
            'sources': [{'id': 'leekduck', 'name': 'Leek Duck', 'trust': 'community', 'url': 'https://leekduck.com/events/go-pass-november-2026/'}],
            'fields': {'tickets': [{'text': text, 'sources': ['leekduck'], 'status': 'single'} for text in parsed['tickets']]}
        }
        context.route('**/event-details.json', lambda r: r.fulfill(body=json.dumps(details), content_type='application/json'))
        # Deliberately fail one exact, verified costume image to exercise its honest fallback.
        costumes = json.loads((ROOT / 'public/costumes.json').read_text())
        known = costumes['pictures']['pikachu|hat and capelet']
        context.route('**' + known, lambda r: r.fulfill(status=404, body=''))
        page = context.new_page()
        page.clock.install(time='2026-11-06T12:00:00+11:00')
        page.goto(BASE + '/')
        page.wait_for_function('!!window.GO && !!window.GODASH && !!window.GODETAIL')
        page.wait_for_function("GO.art({n:'Pikachu',costume:true,label:'hat and capelet'},'ea').includes('/img/ext/')")
        page.evaluate("""() => {
            const host=document.createElement('div');host.id='release-costumes';
            host.innerHTML=GO.art({n:'Pikachu (sun crown)',costume:true,label:'sun crown'},'ea')+GO.art({n:'Pikachu',costume:true,label:'hat and capelet'},'ea');document.body.append(host);
        }""")
        page.locator('#release-costumes').scroll_into_view_if_needed()
        page.wait_for_function("document.querySelectorAll('#release-costumes .costume-unavailable').length===2")
        assert page.locator('#release-costumes img:not(.va-base)').count() == 0, 'only the small badged species picture may appear in a costume fallback'
        assert 'sun crown' in page.locator('#release-costumes').inner_text()
        page.locator('[data-open="season:pass-november"]').first.click()
        page.locator('#evd').wait_for(state='visible')
        page.evaluate("document.querySelectorAll('#evd [role=tabpanel]').forEach(p=>p.hidden=false)")
        assert 'Saved rank snapshot: 2026-11-01' in page.locator('#evd').inner_text()
        ranks = page.locator('#evd .ss-tab tbody th').all_text_contents()
        assert ranks == ['2', '3', '100', '200'], ranks
        assert 'Groudon' in page.locator('#evd').inner_text()
        assert page.locator('#evd .ss-tab').locator('text=199').count() == 0
        page.keyboard.press('Escape')
        print('PASS combined source-parser → GO Pass UI, retained snapshot warning, exact ranks and costume failures')
        context.close()

        # Upgrade from a previously installed shell and verify cache + player-state survival offline.
        context = open_context(browser, workers='allow')
        context.route('**/api/**', stub_api)
        phase = {'new': False}
        legacy = """const OLD='gofn-shell-release-old';self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(OLD);await c.put('/app.js?v=old',new Response('STALE-RELEASE-ASSET'));await self.skipWaiting()})()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.url.includes('/app.js?v=old'))e.respondWith(caches.open(OLD).then(c=>c.match(e.request)))})"""
        def sw_route(route):
            route.fulfill(body=SW if phase['new'] else legacy, content_type='application/javascript', headers={'cache-control': 'no-store'})
        context.route('**/sw.js', sw_route)
        page = context.new_page()
        page.goto(BASE + '/')
        page.evaluate('navigator.serviceWorker.ready')
        page.wait_for_function('!!navigator.serviceWorker.controller')
        seed = {'gofn-dex-v1': json.dumps({'m': {'own': {'25': 1}, 'shiny': {'25': 1}}}),
                'gofn-us-v1': json.dumps({'follow:pikachu': {'v': 'Pikachu', 't': 1}, 'saved:cur:twilightwishes': {'v': True, 't': 1}, 'form:19:alola': {'v': 0, 't': 1}})}
        page.evaluate('(seed)=>Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v))', seed)
        assert page.evaluate("fetch('/app.js?v=old').then(r=>r.text())") == 'STALE-RELEASE-ASSET'
        page.evaluate('window.__oldReleaseController=navigator.serviceWorker.controller')
        phase['new'] = True
        page.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())')
        page.wait_for_function('(cache)=>caches.keys().then(keys=>keys.includes(cache)&&!keys.includes("gofn-shell-release-old"))', arg=CACHE, timeout=30000)
        page.wait_for_function('(cache)=>caches.open(cache).then(c=>c.match("/index.html")).then(Boolean)', arg=CACHE)
        page.wait_for_function('navigator.serviceWorker.controller && navigator.serviceWorker.controller!==window.__oldReleaseController')
        context.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('!!window.GODASH && !!window.GODETAIL')
        for key, value in seed.items():
            assert json.loads(page.evaluate('(key)=>localStorage.getItem(key)', key)) == json.loads(value), key
        assert page.evaluate('GO.dex().m.own[25]') == 1
        assert page.evaluate("GODASH.usGet('follow:pikachu')") == 'Pikachu'
        assert page.evaluate("GODASH.usGet('form:19:alola')") == 0
        current = page.evaluate("fetch('/app.js?v=old').then(r=>r.text())")
        assert hashlib.sha256(current.encode()).digest() == hashlib.sha256((ROOT / 'public/app.js').read_bytes()).digest()
        assert page.evaluate('(cache)=>caches.open(cache).then(c=>c.keys()).then(keys=>keys.every(k=>!new URL(k.url).pathname.startsWith("/api/")))', CACHE)
        page.locator('#tabs [data-tab="collect"]').click()
        page.locator('#subnav-collect [data-sub="opps"]').click()
        page.locator('#opp-search').fill('Pikachu')
        assert page.locator('#opp-filter').is_visible()
        print(f'PASS {ENGINE} real service-worker upgrade to {CACHE}, exact offline shell and preserved Dex/shiny/form/follow/saved state')
        context.close()
    browser.close()
