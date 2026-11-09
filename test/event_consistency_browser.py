"""One event, one record: Into the Wild shows the same canonical identity on Today, Schedule, Details and Battle."""
import base64
import os
import re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('GO_FIELD_NOTES_BATTLE_URL', 'http://127.0.0.1:8791')
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
with sync_playwright() as p:
    browser = getattr(p, os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')).launch()
    for width in (320, 390):
        context = browser.new_context(viewport={'width': width, 'height': 900}, timezone_id='Australia/Sydney', service_workers='block')
        context.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
        context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
        context.route(re.compile(r'^https://(?:cdn\.leekduck\.com|lh3\.googleusercontent\.com)/'), lambda r: r.fulfill(body=PNG, content_type='image/png'))
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
        # Verified promotional artwork is the default; the Illustration tag only belongs to themed fallbacks.
        card = page.locator('#today-v1 .t1-card', has_text='Into the Wild').first
        assert card.locator('.ev-art--official .ev-art-img[src*="into-the-wild-2026"]').count() == 1
        assert not card.locator('.ev-art-tag').is_visible()
        box = card.locator('.ev-art--official').bounding_box()
        assert abs(box['width'] / box['height'] - 16 / 9) < 0.05, box
        # Equal-or-stricter than the old forced 16:9: the picture fills the reserved box (no letterbox bars) and crops, never stretches.
        img_box = card.locator('.ev-art--official .ev-art-img').bounding_box()
        assert abs(img_box['width'] - box['width']) < 1.5 and abs(img_box['height'] - box['height']) < 1.5, (img_box, box)
        assert card.locator('.ev-art--official .ev-art-img').evaluate('i => getComputedStyle(i).objectFit') in ('cover', 'contain')
        assert card.locator('.t1-more').is_visible()
        page.locator('#tabs [data-tab="events"]').click()
        page.wait_for_selector('#evtimeline [data-open]')
        assert page.locator('#evtimeline .evc', has_text='Into the Wild').count() == 1
        page.locator('#tabs [data-tab="raids"]').click()
        roster = page.locator('#rotnow .rw-max-pokemon')
        names = roster.locator('b').all_inner_texts()
        assert {'Dynamax Registeel', 'Dynamax Regidrago', 'Dynamax Latias', 'Dynamax Latios'} <= set(names), names
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), width
        assert not [e for e in errors], errors
        page.locator('#tabs [data-tab="now"]').click()
        card.locator('[data-open]').first.click()
        page.wait_for_selector('#evd .ev-art--official .evd-banner')
        assert 'into-the-wild-2026' in page.locator('#evd .ev-art--official .evd-banner').first.get_attribute('src')
        # Merged records show a natural status, never the internal 'reference' type; ambassador photography stays themed; series art is labelled.
        for event_id in ('into', 'twilightwishes', 'smr2'):
            page.evaluate(f"GODETAIL.open('{event_id}')")
            page.wait_for_selector('#evd .ue-hero')
            assert not re.search(r'\breference\b', page.locator('#evd .ue-hero').inner_text(), re.I), event_id
        page.evaluate("GODETAIL.open('w-go-wild-area-global-meetup-karlsruhe')")
        page.wait_for_selector('#evd .ue-hero')
        assert page.locator('#evd .ev-art--themed').count() == 1 and page.locator('#evd .ev-art--official').count() == 0
        assert page.locator('#evd .ev-art-tag').is_visible()
        mall = page.evaluate("GOEventRegistry.events().find(m=>/Mall Exploration/.test(m.title)&&m.image).eventId")
        page.evaluate(f"GODETAIL.open({mall!r})")
        page.wait_for_selector('#evd .ev-art--official[data-art-scope="series"]')
        assert page.locator('#evd .ev-art-scope').is_visible()
        print(f'PASS event consistency across Today, Schedule and Battle at {width}px')
        context.close()

    # A banner that fails to load falls back to the labelled themed card instead of a broken image.
    context = browser.new_context(viewport={'width': 390, 'height': 900}, timezone_id='Australia/Sydney', service_workers='block')
    context.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
    context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
    context.route(re.compile(r'^https://(?:cdn\.leekduck\.com|lh3\.googleusercontent\.com)/'), lambda r: r.abort())
    page = context.new_page()
    page.clock.install(time='2026-11-09T12:00:00+11:00')
    page.goto(BASE + '/')
    page.wait_for_selector('#today-v1 .t1-card')
    page.wait_for_selector('#today-v1 .ev-art.is-failed .ev-art-tag', state='visible', timeout=8000)
    print('PASS failed banner falls back to the labelled themed card')
    browser.close()
