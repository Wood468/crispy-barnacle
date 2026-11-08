"""Visual geometry and interaction regression for Today and universal event details.

WebKit CI retains screenshots at each supported phone width for review.
"""
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8791/'
OUT = Path(os.environ.get('GO_FIELD_NOTES_SCREENSHOTS', '/tmp/gofn-redesign-screenshots'))
OUT.mkdir(parents=True, exist_ok=True)
ENGINE = os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')

with sync_playwright() as p:
    browser = getattr(p, ENGINE).launch()
    for width in (320, 375, 390, 430):
        context = browser.new_context(viewport={'width': width, 'height': 844},
                                      timezone_id='Australia/Melbourne', service_workers='block')
        context.route('**/api/**', lambda r: r.fulfill(
            body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
        context.route(re.compile(r'^https://fonts\.'),
                      lambda r: r.fulfill(body='', content_type='text/css'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.clock.install(time='2026-11-06T12:00:00+11:00')
        page.goto(BASE)
        page.wait_for_selector('#home-now .today-event')
        assert page.locator('#day-brief-title').inner_text() == 'Today'
        assert page.locator('#home-now .today-event').count() > 0
        assert page.locator('#home-now .today-event').first.locator('.today-event-art').count() == 1
        assert page.locator('#home-now .today-event').first.locator('.today-event-status').count() == 1
        assert page.locator('#home-now .agw .reg').count() > 0, 'overseas events disappeared'
        assert not page.locator('#foryou-sec').is_visible()
        assert page.locator('#action-centre [data-quick-go="collect"]').count() == 0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT / f'redesign-today-{width}.png'))

        before = page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})")
        page.locator('#home-now .today-event-open').first.click()
        page.wait_for_selector('#evd .ue-hero')
        assert 'Sendai' in page.locator('#evd-t').inner_text()
        assert page.locator('#evd .ue-mon').count() > 0
        assert page.locator('#evd .ue-gallery').count() > 0
        assert page.locator('#evd .own,#evd [data-follow],#evd [data-mark],#evd .ue-mon-controls').count() == 0
        assert page.evaluate('document.querySelector("#evd").scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT / f'redesign-detail-{width}.png'))

        # Navigate each published section, including a long research list and tickets.
        for href in ('#evd-pokemon', '#evd-highlights', '#evd-research-title', '#evd-tickets'):
            jump = page.locator(f'#evd .evd-jump a[href="{href}"]')
            if not jump.count():
                continue
            jump.click()
            placement = page.evaluate('''(href) => {
              const target=document.querySelector(href), bar=document.querySelector('#evd .evd-bar'), nav=document.querySelector('#evd .evd-jump');
              return {target:target.getBoundingClientRect().top, bar:bar.getBoundingClientRect().bottom,
                      nav:nav.getBoundingClientRect().bottom, current:document.querySelector('#evd .evd-jump [aria-current="location"]')?.getAttribute('href')};
            }''', href)
            assert placement['target'] >= placement['nav'] - 1, (width, href, placement)
            assert placement['nav'] >= placement['bar'] - 1, (width, href, placement)
            assert placement['current'] == href, (width, href, placement)
        assert page.locator('#evd .research-task').count() == 12
        assert page.locator('#evd .research-reward').count() > 12
        assert page.locator('#evd .research-reward-item .ue-reward-item-icon').count() > 0
        page.screenshot(path=str(OUT / f'redesign-research-{width}.png'))
        assert page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})") == before
        page.keyboard.press('Escape')
        page.evaluate("GODETAIL.open('cur:gopassnov')")
        page.wait_for_selector('#evd .ue-pass-range')
        page.locator('#evd .ue-pass-range').first.locator('summary').click()
        assert page.locator('#evd .ue-pass-stages > li').count() >= 90
        assert page.locator('#evd .ue-mon-controls,#evd [data-follow]').count() == 0
        assert page.evaluate('document.querySelector("#evd").scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT / f'redesign-gopass-{width}.png'))
        page.keyboard.press('Escape')
        assert errors == [], errors
        print(f'PASS {ENGINE} Today and detail redesign {width}px: visual geometry, sections, research, pass, read-only collection')
        context.close()
    browser.close()
