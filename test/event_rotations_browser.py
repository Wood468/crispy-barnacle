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
    # Test both event days in fresh mobile sessions: a Saturday-only screenshot
    # cannot protect Sunday's Dragon hour or the changing Mighty day indicator.
    for width in (360,390,430):
        for label, local_time, active_id, current_date in (
            ('saturday-steel','2026-11-14T10:20:00+11:00','steel','2026-11-14'),
            ('sunday-dragon','2026-11-15T11:20:00+11:00','dragon','2026-11-15'),
        ):
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
            page.clock.install(time=local_time)
            page.goto(BASE+'/')
            page.wait_for_function('!!window.GODETAIL && !!window.GOEventRegistry && GOEventRegistry.settled()',timeout=40000)
            page.evaluate("GODETAIL.open('cur:wag')")
            # Check sourced day-specific raid bosses in Overview before changing tabs.
            page.locator('#evd .ue-raid-day[data-raid-date="2026-11-14"]').wait_for(state='visible',timeout=30000)
            raid_sat=page.locator('#evd .ue-raid-day[data-raid-date="2026-11-14"]')
            raid_sun=page.locator('#evd .ue-raid-day[data-raid-date="2026-11-15"]')
            assert all(n in raid_sat.inner_text() for n in ('Zekrom','White Kyurem','Dynamax Dialga','Gigantamax Duraludon')),(width,label,'Saturday raids')
            assert all(n in raid_sun.inner_text() for n in ('Reshiram','Black Kyurem','Dynamax Palkia','Gigantamax Duraludon')),(width,label,'Sunday raids')
            assert 'Reshiram' not in raid_sat.inner_text() and 'White Kyurem' not in raid_sun.inner_text(),(width,label,'day cross-contamination')
            page.locator('#evd .evd-nav-link[data-sec="encounters"]').click()
            root=page.locator('#evd-s-encounters .uer-root')
            root.wait_for(state='visible',timeout=30000)
            assert root.get_attribute('data-rotation-id')=='gowa-2026-global',(width,label)
            steel=root.locator('[data-habitat="steel"]')
            dragon=root.locator('[data-habitat="dragon"]')
            assert steel.locator('.uer-pokemon-tile').count()==22,(width,label,'steel')
            assert dragon.locator('.uer-pokemon-tile').count()==22,(width,label,'dragon')
            for name, tile in (('steel',steel),('dragon',dragon)):
                assert (tile.get_attribute('data-active')=='true')==(name==active_id),(width,label,name)
            saturday=root.locator('[data-mighty-date="2026-11-14"]')
            sunday=root.locator('[data-mighty-date="2026-11-15"]')
            assert saturday.locator('.uer-pokemon-tile').count()==9,(width,label,'Saturday')
            assert sunday.locator('.uer-pokemon-tile').count()==9,(width,label,'Sunday')
            for date, day in (('2026-11-14',saturday),('2026-11-15',sunday)):
                assert (day.get_attribute('data-current-day')=='true')==(date==current_date),(width,label,date)
            assert 'Metagross' in saturday.inner_text() and 'Hydreigon' not in saturday.inner_text(),(width,label)
            assert 'Hydreigon' in sunday.inner_text() and 'Metagross' not in sunday.inner_text(),(width,label)
            shared=root.locator('[data-shared-id="ticket-incense"]')
            assert shared.locator('.uer-pokemon-tile').count()==2,(width,label)
            assert all(s in shared.inner_text() for s in ('Latias','Latios','Ticket-only Incense')),(width,label)
            assert root.locator('.uer-pokemon-tile').count()==64,(width,label)
            assert root.locator('a[href="https://leekduck.com/pokemon-go-wild-area/mighty/"]').count()==1,(width,label)
            assert page.locator('#evd .ue-method[data-method="wild"] .ue-mon',has_text='Magnemite').count()==0,'no duplicate hourly wild'
            assert page.locator('#evd .ue-method[data-method="incense"] .ue-mon',has_text='Metagross').count()==0,'Mighty is not ordinary Incense'
            # The ten Free Mighty Incense methods are separately published for
            # both days. Day-specific wild Mighty are a different encounter
            # method, not duplicate Incense. Two paid legends are source-backed
            # Incense shared Mighty; four ticket Unown stay in the flat gallery.
            incense=page.locator('#evd-s-encounters .ue-method[data-method="incense"] .ue-mon')
            free_keys=['103:alola:none','184:base:none','212:base:none',
                       '230:base:none','306:base:none','330:base:none',
                       '395:base:none','462:base:none','534:base:none','635:base:none']
            unown_keys=['201:d:none','201:i:none','201:l:none','201:w:none']
            identities=sorted(incense.evaluate_all("(els)=>els.map(el=>el.dataset.identity)"))
            assert identities==sorted(free_keys+unown_keys),(width,label,identities)
            for tile in incense.all():
                assert tile.locator('.ue-incense-corner img[src="/ico/incense.webp"]').count()==1,(width,label,'missing Incense corner')
                key=tile.get_attribute('data-identity')
                is_mighty=key in free_keys
                assert tile.locator('.ue-mighty-corner').count()==int(is_mighty),(width,label,key,'wrong Mighty status')
                label_text=tile.get_attribute('aria-label') or ''
                assert ('Mighty' in label_text)==is_mighty,(width,label,key,label_text)
                if key in unown_keys:
                    assert 'paid' in tile.inner_text().lower(),(width,label,'missing ticket access')
                if is_mighty:
                    corners=tile.evaluate("""el => {
                        const a=el.querySelector('.ue-mighty-corner').getBoundingClientRect();
                        const b=el.querySelector('.ue-incense-corner').getBoundingClientRect();
                        return {mightyRight:a.right,incenseLeft:b.left,iconWidth:b.width,iconHeight:b.height};
                    }""")
                    assert corners['mightyRight']<corners['incenseLeft'] and 0<corners['iconWidth']<=22 and 0<corners['iconHeight']<=22,(width,label,key,corners)
            assert page.locator('#evd-s-encounters .ue-method[data-method="incense"] .ue-mon[data-identity="380:base:none"],#evd-s-encounters .ue-method[data-method="incense"] .ue-mon[data-identity="381:base:none"]').count()==0,(width,label,'paid legends belong to shared Mighty')
            days=root.locator('.uer-mighty-day .uer-pokemon-tile')
            ticketed=root.locator('.uer-mighty-shared .uer-pokemon-tile')
            assert days.count()==18 and ticketed.count()==2,(width,label,'Mighty roster tiles')
            assert root.locator('.uer-mighty-corner').count()==20,(width,label,'missing Mighty !!!')
            assert root.locator('.uer-mighty-day .uer-incense-corner').count()==0,(width,label,'dated wild Mighty must remain wild')
            assert ticketed.locator('.uer-incense-corner img[src="/ico/incense.webp"]').count()==2,(width,label,'paid Latias/Latios Incense markers')
            assert root.locator('.uer-habitat .uer-mighty-corner,.uer-habitat .uer-incense-corner').count()==0,(width,label,'ordinary rotating wild must not inherit methods')
            for tile in ticketed.all():
                name=tile.get_attribute('data-pokemon')
                label_text=tile.get_attribute('aria-label') or ''
                assert 'Mighty' in label_text and 'Incense' in label_text,(width,label,name,label_text)
            assert not errors,(width,label,errors)
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),(width,label,'overflow')
            root.scroll_into_view_if_needed()
            page.screenshot(path=str(SHOTS/f'wild-hour-mighty-{label}-{width}.png'),animations='disabled')
            print(f'PASS GO Wild Area {label}: habitats 22+22, Mighty 9+9+2, day-split raids, {width}px')
            ctx.close()
    browser.close()
