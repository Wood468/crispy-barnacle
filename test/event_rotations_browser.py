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
            # Compatible with both the current universal sheet and the
            # upcoming one-panel-at-a-time Event Details navigation.
            encounter_tab=page.locator('#evd .evd-nav-link[data-sec="encounters"]')
            if encounter_tab.count():
                encounter_tab.click()
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
            # Importer #538 now declares 10 Free/day-mighty Incense and
            # six ticket-only species. Per-day Mighty and ticket Lati@s
            # have their own official groups; only the four exact letter
            # Unown encounters must survive as flat ticket Incense cards.
            incense=page.locator('#evd-s-encounters .ue-method[data-method="incense"] .ue-mon')
            identities=sorted(incense.evaluate_all("(els)=>els.map(el=>el.dataset.identity)"))
            assert identities==['201:d:none','201:i:none','201:l:none','201:w:none'],(width,label,identities)
            for tile in incense.all():
                assert tile.locator('.ue-incense-corner img[src="/ico/incense.webp"]').count()==1,(width,label,'missing Incense corner')
                assert 'paid' in tile.inner_text().lower(),(width,label,'missing source ticket label')
            duplicate_names=('Alolan Exeggutor','Azumarill','Scizor','Latias','Latios')
            duplicate_tiles=[name for name in duplicate_names if page.locator(
                '#evd-s-encounters .ue-method[data-method="incense"] .ue-mon',
                has_text=name).count()>0]
            assert not duplicate_tiles,(width,label,'source-backed day-Mighty or shared ticket duplicates',duplicate_tiles)
            # Shared day-specific Mighty group tiles retain both source-backed
            # statuses without a second flat encounter. Exactly 10 public
            # Mighty have an Incense source edge, plus ticket Lati@s.
            days=root.locator('.uer-mighty-day .uer-pokemon-tile')
            ticketed=root.locator('.uer-mighty-shared .uer-pokemon-tile')
            assert days.count()==18 and ticketed.count()==2,(width,label,'Mighty roster tiles')
            assert root.locator('.uer-mighty-mark').count()==20,(width,label,'missing Mighty !!!')
            assert root.locator('.uer-mighty-day [data-incense="true"] .uer-incense-corner img[src="/ico/incense.webp"]').count()==10,(width,label,'Free Mighty Incense markers')
            assert ticketed.locator('.uer-incense-corner img[src="/ico/incense.webp"]').count()==2,(width,label,'paid Latias/Latios Incense markers')
            assert root.locator('.uer-habitat .uer-mighty-mark,.uer-habitat .uer-incense-corner').count()==0,(width,label,'ordinary rotating wild must not inherit methods')
            for tile in root.locator('.uer-mighty-day [data-incense="true"],.uer-mighty-shared [data-incense="true"]').all():
                name=tile.get_attribute('data-pokemon')
                label_text=tile.get_attribute('aria-label') or ''
                assert 'Mighty' in label_text and 'Incense' in label_text,(width,label,name,label_text)
                markers=tile.evaluate("""el => {
                    const a=el.querySelector('.uer-mighty-mark').getBoundingClientRect();
                    const b=el.querySelector('.uer-incense-corner').getBoundingClientRect();
                    const c=el.getBoundingClientRect();
                    return {left:a.right,right:b.left,iconW:b.width,iconH:b.height,
                        tileLeft:c.left,tileRight:c.right};
                }""")
                assert markers['left']<markers['right'] and 0<markers['iconW']<=22 and 0<markers['iconH']<=22,(width,label,name,markers)
            for tile in incense.all():
                assert tile.locator('.uer-mighty-mark,.uer-incense-corner').count()==0,(width,label,'ordinary Unown must not be mighty')
            raid_sat=page.locator('#evd .ue-raid-day[data-raid-date="2026-11-14"]')
            raid_sun=page.locator('#evd .ue-raid-day[data-raid-date="2026-11-15"]')
            assert all(x in raid_sat.inner_text() for x in ('Zekrom','White Kyurem','Dynamax Dialga','Gigantamax Duraludon')),(width,label,'Saturday raids')
            assert all(x in raid_sun.inner_text() for x in ('Reshiram','Black Kyurem','Dynamax Palkia','Gigantamax Duraludon')),(width,label,'Sunday raids')
            assert 'Reshiram' not in raid_sat.inner_text() and 'White Kyurem' not in raid_sun.inner_text(),(width,label,'day cross-contamination')
            assert not errors,(width,label,errors)
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),(width,label,'overflow')
            root.scroll_into_view_if_needed()
            page.screenshot(path=str(SHOTS/f'wild-hour-mighty-{label}-{width}.png'),animations='disabled')
            print(f'PASS GO Wild Area {label}: habitats 22+22, Mighty 9+9+2, day-split raids, {width}px')
            ctx.close()
    browser.close()
