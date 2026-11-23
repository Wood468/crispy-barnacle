"""Today must not overflow horizontally when the upcoming-shiny-boost rail renders (regression: rail bleed margins)."""
import os
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8791'
with sync_playwright() as p:
    browser = getattr(p, os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')).launch()
    for width in (320, 375, 390):
        context = browser.new_context(viewport={'width': width, 'height': 800}, timezone_id='Australia/Melbourne', service_workers='block')
        page = context.new_page()
        page.clock.install(time='2026-11-23T19:00:00+11:00')
        page.goto(BASE + '/')
        page.locator('#tabs [data-tab="now"]').click()
        page.wait_for_selector('#today-v1 .t1-glance', timeout=15000)
        assert page.locator('#today-v1 .t1-boost-rail').count() == 1, 'boost rail fixture did not render'
        assert page.locator('#today-v1').evaluate('(el) => el.scrollWidth <= el.clientWidth'), 'Today overflows at %dpx' % width
        context.close()
    browser.close()
print('PASS Today boost rail does not overflow at 320/375/390')
