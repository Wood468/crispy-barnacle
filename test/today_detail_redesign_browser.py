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
        page.wait_for_selector('#today-v1 .t1-card')
        heads = page.locator('#today-v1 .t1-sec-head h2, #today-v1 .t1-h-main').all_inner_texts()
        assert heads[0].lower() == 'today at a glance' and 'happening now' in [h.lower() for h in heads], heads
        assert page.locator('#today-v1 .t1-tile').count() == 3
        assert page.locator('#today-v1 .t1-card').count() > 0
        assert page.locator('#today-v1 .t1-place em').count() > 0, 'overseas in-person events must stay visible and labelled'
        assert not page.locator('#today-v1 [data-follow],#today-v1 [data-mark],#today-v1 .own').count()
        assert not page.locator('#foryou-sec').is_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        for box in page.locator('#today-v1 .t1-more').all()[:3]:
            b = box.bounding_box(); assert b['width'] >= 43.5 and b['height'] >= 43.5, b
        page.screenshot(path=str(OUT / f'redesign-today-{width}.png'))

        before = page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})")
        page.locator('#today-v1 .t1-place').first.locator('xpath=ancestor::article//button[@data-open]').click()
        page.wait_for_selector('#evd .ue-hero')
        assert 'Sendai' in page.locator('#evd-t').inner_text()
        assert page.locator('#evd .ue-mon').count() > 0
        assert page.locator('#evd .ue-gallery').count() > 0
        assert page.locator('#evd .own,#evd [data-follow],#evd [data-mark],#evd .ue-mon-controls').count() == 0
        assert page.evaluate('document.querySelector("#evd").scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT / f'redesign-detail-{width}.png'))

        # Section tabs: one panel at a time, roving tabindex, arrow keys.
        tabs = page.locator('#evd [role=tab]')
        assert tabs.count() >= 3 and page.locator('#evd [role=tablist]').count() == 1
        assert page.locator('#evd [role=tabpanel]:not([hidden])').count() == 1
        tabs.first.focus(); page.keyboard.press('ArrowRight')
        assert tabs.nth(1).get_attribute('aria-selected') == 'true' and tabs.nth(1).get_attribute('tabindex') == '0'
        assert tabs.first.get_attribute('tabindex') == '-1'
        assert page.locator('#evd [role=tabpanel]:not([hidden])').count() == 1
        panel_id = tabs.nth(1).get_attribute('aria-controls')
        assert page.locator(f'#{panel_id}:not([hidden])').count() == 1
        page.locator('#evd #evd-tab-encounters').click()
        assert page.locator('#evd .ue-mon').first.bounding_box()['height'] >= 43.5
        page.locator('#evd .ue-mon').first.click()
        assert page.locator('#ue-sheet [role=dialog]').count() == 1
        page.keyboard.press('Escape')
        assert page.locator('#ue-sheet').count() == 0 and page.locator('#evd').is_visible()
        assert page.evaluate('document.activeElement.classList.contains("ue-mon")')
        page.locator('#evd #evd-tab-research').click()
        assert page.locator('#evd .research-task').count() == 12
        assert page.locator('#evd .research-reward').count() > 12
        assert page.locator('#evd .research-reward-item .ue-reward-item-icon').count() > 0
        page.screenshot(path=str(OUT / f'redesign-research-{width}.png'))
        assert page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})") == before
        page.keyboard.press('Escape')
        page.evaluate("GODETAIL.open('cur:gopassnov')")
        page.wait_for_selector('#evd #evd-tab-passes')
        page.locator('#evd #evd-tab-passes').click()
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
