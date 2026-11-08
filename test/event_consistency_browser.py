"""One event, one record: Into the Wild shows the same canonical identity on Today, Schedule, Details and Battle."""
import os
import re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('GO_FIELD_NOTES_BATTLE_URL', 'http://127.0.0.1:8791')
with sync_playwright() as p:
    browser = getattr(p, os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')).launch()
    for width in (320, 390):
        context = browser.new_context(viewport={'width': width, 'height': 900}, timezone_id='Australia/Sydney', service_workers='block')
        context.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
        context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.clock.install(time='2026-11-09T12:00:00+11:00')
        page.goto(BASE + '/')
        page.wait_for_function('!!window.GODASH && GOEventRegistry.settled()')
        page.wait_for_selector('#today-v1 .t1-card')
        # One catalogue record, not the curated card plus two importer duplicates.
        assert page.evaluate("GOEventRegistry.events().filter(m=>/^Into the Wild$/i.test(m.title)).length") == 1
        assert page.locator('#today-v1 .t1-card', has_text='Into the Wild').count() == 1
        today_text = page.locator('#today-v1 .t1-card', has_text='Into the Wild').first.inner_text()
        assert 'Crowned Sword Zacian' in today_text and 'Dynamax Regidrago' in today_text, today_text
        page.locator('#tabs [data-tab="events"]').click()
        page.wait_for_selector('#evtimeline [data-open]')
        assert page.locator('#evtimeline .evc', has_text='Into the Wild').count() == 1
        page.locator('#tabs [data-tab="raids"]').click()
        roster = page.locator('#rotnow .rw-max-pokemon')
        names = roster.locator('b').all_inner_texts()
        assert {'Dynamax Registeel', 'Dynamax Regidrago', 'Dynamax Latias', 'Dynamax Latios'} <= set(names), names
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), width
        assert not [e for e in errors], errors
        print(f'PASS event consistency across Today, Schedule and Battle at {width}px')
        context.close()
    browser.close()
