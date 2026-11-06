"""Real-content visual acceptance for Today, Schedule and event details.

Set GO_FIELD_NOTES_SCREENSHOTS to retain the three screens at every viewport.
API responses are disabled; published local event data and real UI actions are used.
"""
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8791'
OUT = os.environ.get('GO_FIELD_NOTES_SCREENSHOTS')
if OUT:
    Path(OUT).mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    engine = os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')
    browser = getattr(p, engine).launch()
    for width, theme in [(320, 'light'), (390, 'dark'), (768, 'light'), (1440, 'dark')]:
        context = browser.new_context(viewport={'width': width, 'height': 900},
                                      timezone_id='Australia/Sydney', service_workers='block')
        context.route('**/api/**', lambda r: r.fulfill(
            body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
        context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.clock.install(time='2026-11-06T12:00:00+11:00')
        page.goto(BASE + '/')
        page.wait_for_function('!!window.GODASH && !!window.GODETAIL')
        page.evaluate('(theme)=>document.documentElement.dataset.theme=theme', theme)
        page.wait_for_function('document.querySelector("#home-now [data-open]")')

        def capture(name):
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (name, width)
            if OUT:
                page.screenshot(path=str(Path(OUT) / f'{name}-{width}.png'))

        # A live overseas event remains unfolded and starts above the bottom navigation.
        first = page.locator('#home-now .evc').first
        assert 'Sendai' in first.inner_text()
        title = first.locator('.evc-title-row h3')
        assert title.bounding_box()['y'] + title.bounding_box()['height'] < 820, (width, title.bounding_box())
        brief = page.locator('#today-brief-details')
        assert not brief.evaluate('(el)=>el.open')
        brief.locator('summary').first.focus()
        page.keyboard.press('Enter')
        assert page.locator('#today-focus-raids').is_visible()
        assert page.locator('#today-focus-raids').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1')
        page.keyboard.press('Enter')
        page.evaluate('scrollTo(0,0)')
        capture('today')
        page.locator('#tabs [data-tab="events"]').click()
        page.wait_for_function('document.querySelector("#evtimeline [data-open]")')
        titles = page.locator('#evtimeline .evc-title-row h3')
        assert titles.first.is_visible()
        assert titles.evaluate_all('(els)=>els.every(e=>e.scrollHeight<=e.clientHeight+1)'), 'event title clipped'
        capture('schedule')
        # Select a date with the actual control, retaining keyboard focus and all seven targets.
        next_week = page.locator('#weekstrip [data-wk="1"]')
        next_week.focus()
        page.keyboard.press('Enter')
        assert next_week.evaluate('(el)=>el===document.activeElement')
        page.locator('#weekstrip [data-wk="-1"]').click()
        days = page.locator('.wk-days .wd')
        assert days.count() == 7
        assert days.evaluate_all('(els)=>els.every(e=>e.getBoundingClientRect().width>=44 && e.getBoundingClientRect().height>=44)')
        days.first.focus()
        page.keyboard.press('Enter')
        assert days.first.get_attribute('aria-pressed') == 'true'
        assert days.first.evaluate('(el)=>el===document.activeElement')
        # Clear the date selection so a sourced live event is available again.
        days.first.click()
        event = page.locator('#evtimeline [data-open]').first
        event.focus()
        page.keyboard.press('Enter')
        page.locator('#evd').wait_for(state='visible')
        assert page.locator('#evd-t').is_visible()
        assert page.locator('.evd-jump a').evaluate_all('(els)=>els.every(e=>e.getBoundingClientRect().height>=44)')
        hero = page.locator('.evd-hero')
        assert hero.evaluate('(el)=>el.scrollWidth<=el.clientWidth'), 'detail hero overflow'
        capture('detail')
        before_hash = page.evaluate('location.hash')
        page.locator('.evd-jump a[href="#evd-sources"]').focus()
        page.keyboard.press('Enter')
        assert page.locator('#evd-sources').is_visible()
        assert page.locator('#evd-sources').evaluate('(el)=>el===document.activeElement')
        assert page.evaluate('location.hash') == before_hash
        page.keyboard.press('Escape')
        assert page.locator('#evd').is_hidden()
        assert event.evaluate('(el)=>el===document.activeElement'), 'detail close lost trigger focus'
        assert errors == [], errors
        print(f'PASS premium surfaces {engine} {width}px {theme}: live overseas visibility, full titles, calendar keyboard focus, detail links and close focus')
        context.close()
    browser.close()
