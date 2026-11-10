"""Source-verified hourly habitats and Mighty Pokémon render on actual Event Details at phone widths."""
import base64
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get('GO_FIELD_NOTES_BATTLE_URL','http://127.0.0.1:8791')
SHOTS=Path(os.environ.get('GO_FIELD_NOTES_SCREENSHOTS','/tmp/gofn-screenshots'))
SHOTS.mkdir(parents=True,exist_ok=True)
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')

def api(route):
    if '/api/art' in route.request.url:
        route.fulfill(body=PNG,content_type='image/png')
    else:
        route.fulfill(body='{"enabled":false,"events":[],"sources":[]}',content_type='application/json')

with sync_playwright() as pw:
    browser=getattr(pw,os.environ.get('GO_FIELD_NOTES_TEST_BROWSER','chromium')).launch()
    for width in (360,390,430):
        ctx=browser.new_context(
            viewport={'width':width,'height':844},
            timezone_id='Australia/Melbourne',
            service_workers='block',
        )
        ctx.route('**/api/**',api)
        ctx.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
        ctx.route(re.compile(r'^https://(?:cdn\.leekduck\.com|lh3\.googleusercontent\.com)/'),
                  lambda r:r.fulfill(body=PNG,content_type='image/png'))
        page=ctx.new_page()
        errors=[]
        page.on('pageerror',lambda exc:errors.append(str(exc)))
        page.clock.install(time='2026-11-14T10:20:00+11:00')
        page.goto(BASE+'/')
        page.wait_for_function('!!window.GODETAIL && !!window.GOEventRegistry && GOEventRegistry.settled()',timeout=40000)
        page.evaluate("GODETAIL.open('cur:wag')")
        root=page.locator('#evd-s-encounters .uer-root')
        root.wait_for(state='visible',timeout=30000)
        assert root.get_attribute('data-rotation-id')=='gowa-2026-global',width
        steel=root.locator('[data-habitat="steel"]')
        dragon=root.locator('[data-habitat="dragon"]')
        assert steel.locator('.uer-pokemon-tile').count()==22,(width,'steel')
        assert dragon.locator('.uer-pokemon-tile').count()==22,(width,'dragon')
        assert steel.get_attribute('data-active')=='true',(width,'steel not active at 10:20')
        assert dragon.get_attribute('data-active') is None,width
        saturday=root.locator('[data-mighty-date="2026-11-14"]')
        sunday=root.locator('[data-mighty-date="2026-11-15"]')
        assert saturday.locator('.uer-pokemon-tile').count()==9,width
        assert sunday.locator('.uer-pokemon-tile').count()==9,width
        assert saturday.get_attribute('data-current-day')=='true',width
        assert 'Metagross' in saturday.inner_text() and 'Hydreigon' not in saturday.inner_text(),width
        assert 'Hydreigon' in sunday.inner_text() and 'Metagross' not in sunday.inner_text(),width
        shared=root.locator('[data-shared-id="ticket-incense"]')
        assert shared.locator('.uer-pokemon-tile').count()==2,width
        assert all(s in shared.inner_text() for s in ('Latias','Latios','Ticket-only Incense')),width
        assert root.locator('.uer-pokemon-tile').count()==64,width
        assert root.locator('a[href="https://leekduck.com/pokemon-go-wild-area/mighty/"]').count()==1,width
        assert page.locator('#evd .ue-method[data-method="wild"] .ue-mon',has_text='Magnemite').count()==0, 'do not duplicate Steel wild in flat gallery'
        assert page.locator('#evd .ue-method[data-method="incense"] .ue-mon',has_text='Metagross').count()==0, 'do not mislabel Mighty as ordinary Incense'
        assert not errors,(width,errors)
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),width
        root.scroll_into_view_if_needed()
        page.screenshot(path=str(SHOTS/f'wild-hour-mighty-{width}.png'),animations='disabled')
        print(f'PASS GO Wild Area rotating wild (22+22) and Mighty (9+9+2) at {width}px')
        ctx.close()
    browser.close()
