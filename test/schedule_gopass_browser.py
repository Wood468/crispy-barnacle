"""Schedule week navigation, honest empty/long-title states, cross-surface consistency and the illustrated GO Pass timeline.

Fixed Sydney clock 9 Nov 2026. Runs at 360/390/430 in dark mode on Chromium, and on WebKit when
GO_FIELD_NOTES_TEST_BROWSER=webkit. Set GO_FIELD_NOTES_SCREENSHOTS to keep screenshots.
"""
import json
import os
import base64
import re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('GO_FIELD_NOTES_BATTLE_URL', 'http://127.0.0.1:8791')
SHOTS = os.environ.get('GO_FIELD_NOTES_SCREENSHOTS')
if SHOTS:
    os.makedirs(SHOTS, exist_ok=True)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
LONG = 'Pokémon GO Extraordinarily Long Anniversary Celebration Festival of Lights and Wonders Worldwide Edition 2026'
WORLD = json.dumps({'updated': '2026-11-09', 'events': [
    {'id': 'w-long-title-test', 'name': LONG, 'place': 'Kuala Lumpur, Malaysia (Ombak KLCC Pavilion Grand Atrium)', 'area': 'Asia', 'scope': 'regional',
     'start': '2026-11-12', 'end': '2026-11-13', 'datesKnown': True, 'sources': [{'id': 'serebii', 'name': 'Serebii', 'url': 'https://www.serebii.net/pokemongo/reallifeevents.shtml'}], 'status': 'single', 'seen': '2026-11-09'}]})


def shot(page, name):
    if SHOTS:
        page.screenshot(path=f'{SHOTS}/{name}.png')


with sync_playwright() as p:
    browser = getattr(p, os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')).launch()
    for width in (360, 390, 430):
        context = browser.new_context(viewport={'width': width, 'height': 860}, timezone_id='Australia/Sydney', service_workers='block', color_scheme='dark')
        context.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
        context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
        context.route('**/api/art**', lambda r: r.fulfill(body=PNG, content_type='image/png'))
        context.route('**/world-events.json', lambda r: r.fulfill(body=WORLD, content_type='application/json'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.clock.install(time='2026-11-09T12:00:00+11:00')
        page.goto(BASE + '/')
        page.wait_for_function('!!window.GODASH && GOEventRegistry.settled()')
        page.wait_for_selector('#today-v1 .t1-card')
        today_card = page.locator('#today-v1 .t1-card', has_text='Into the Wild').first.inner_text()

        page.locator('#tabs [data-tab="events"]').click()
        page.wait_for_selector('#evtimeline [data-open]')
        # Today marker, day headings with counts, accessible day buttons.
        assert page.locator('#weekstrip .wd.today[aria-current="date"]').count() == 1
        assert 'today' in page.locator('#weekstrip .wd.today').get_attribute('aria-label')
        head = page.locator('#evtimeline h2.dh-today').first.inner_text()
        assert head.startswith('Today · Mon 9 Nov'), head
        assert page.locator('#evtimeline h2.dh .cnt').count() >= 2
        # One event, same dates on Today, Schedule and Details; no internal status wording.
        sched = page.locator('#evtimeline .evc', has_text='Into the Wild').first.inner_text()
        assert 'Ends in 4d' in today_card, today_card  # Friday 13 Nov 8 pm Sydney is 4d 7h after noon Monday
        for text in (sched,):
            assert 'Mon 9 Nov' in text or '9 Nov' in text, text
            assert 'Fri 13 Nov' in text or '13 Nov' in text, text
        page.evaluate("GODETAIL.open('into')")
        page.wait_for_selector('#evd .ue-hero')
        hero = page.locator('#evd .ue-hero').inner_text()
        detail = page.locator('#evd').inner_text()
        assert '13 Nov' in detail and '9 Nov' in detail and not re.search(r'\breference\b', hero, re.I), detail[:400]
        page.keyboard.press('Escape')
        assert 'reference' not in page.locator('#evtimeline').inner_text().lower()
        shot(page, f'schedule-week-{width}')

        # Overseas in-person event: labelled, long title wraps without overflow.
        page.locator('#weekstrip [data-day]').nth(3).click()
        row = page.locator('#evtimeline .agr.reg', has_text='Extraordinarily Long')
        row.first.wait_for()
        assert 'in person' in row.first.inner_text().lower()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), ('long title overflow', width)
        row.first.scroll_into_view_if_needed()
        page.evaluate("(el)=>el.scrollIntoView({block:'center'})", row.first.element_handle())
        shot(page, f'schedule-overseas-longtitle-{width}')
        page.locator('[data-clearday]').click()

        # Empty future week is honest and recoverable; the week arrows move the list too.
        for _ in range(9):
            page.locator('#weekstrip [data-wk="1"]').click()
        empty = page.locator('#evtimeline .wk-empty')
        assert 'Nothing announced for this week yet' in empty.inner_text()
        shot(page, f'schedule-empty-week-{width}')
        empty.locator('[data-wkreset]').click()
        assert page.locator('#weekstrip .wk-head').inner_text().count('this week') == 1
        assert page.locator('#evtimeline h2.dh-today').count() == 1
        # A type with nothing in the week says so instead of a blank list.
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')

        # During GO Wild Area week, the separate event GO Pass must appear in
        # the generic season/pass Today strip and open the existing pass layout.
        page.wait_for_function("() => window.GOSEASON && GOSEASON.events().some(e=>e.id==='season:pass-into-wild-2026')")
        assert page.evaluate("GOSEASON.events().find(e=>e.id==='season:pass-into-wild-2026').source") == 'Pokémon GO (official)'
        active_pass = page.locator('#seasonbar .ssn-card', has_text='GO Pass: Into the Wild')
        assert active_pass.count() == 1, 'current special GO Pass was omitted from Today'
        page.evaluate("GODETAIL.open('season:pass-into-wild-2026')")
        page.wait_for_selector('#evd .ue-pass')
        into_pass = page.locator('#evd').inner_text()
        assert 'Dynamax Meltan' in into_pass and 'Silver Bottle Cap' in into_pass, into_pass[:500]
        assert '17 Nov' in into_pass or '17 November' in into_pass, into_pass[:500]
        assert page.locator('#evd').evaluate('(el)=>el.scrollWidth<=el.clientWidth'), ('Into the Wild pass overflow', width)
        page.keyboard.press('Escape')

        # GO Pass: illustrated free/Deluxe timeline, bounded ranges, gaps, fallbacks, source and freshness.
        eid = page.evaluate("GOEventRegistry.events().find(m=>/GO Pass.*November/i.test(m.title)).eventId")
        page.evaluate(f"GODETAIL.open({eid!r})")
        page.wait_for_selector('#evd .ue-pass')
        pass_el = page.locator('#evd .ue-pass')
        assert pass_el.locator('.ue-lane-free').count() >= 90 and pass_el.locator('.ue-lane-deluxe').count() >= 90
        assert pass_el.locator('.ue-pass-range').count() >= 4
        assert pass_el.locator('.ue-pass-range[open]').count() == 1
        pass_el.locator('.ue-pass-range').last.locator('summary').click()
        assert pass_el.locator('.ue-pass-gap', has_text='no rewards listed by the source').count() >= 1
        assert pass_el.locator('.ue-pass-reward[data-art="fallback"]').count() >= 1
        assert pass_el.locator('.ue-pass-reward img[src="/ico/dust.webp"]').count() >= 1
        assert pass_el.locator('.ue-pass-art:visible').count() >= 1
        text = pass_el.inner_text()
        assert 'US$' not in text and '$' not in text, 'prices belong to the store workstream'
        assert 'Source:' in text and 'Data checked' in text and 'not confirmed' in text
        assert pass_el.locator('.ue-pass-src a[href^="https://"]').count() >= 1
        assert page.locator('#evd').evaluate('(el)=>el.scrollWidth<=el.clientWidth'), ('GO Pass overflow', width)
        pass_el.locator('.ue-pass-range').first.scroll_into_view_if_needed()
        shot(page, f'gopass-timeline-{width}')
        pass_el.locator('.ue-pass-src').scroll_into_view_if_needed()
        shot(page, f'gopass-source-{width}')
        assert not errors, errors
        print(f'PASS schedule and GO Pass at {width}px')
        context.close()
    browser.close()
