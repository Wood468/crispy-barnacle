"""Today: per-occurrence Done menu, Undo, restore list, persistence and Collection safety."""
import os
import re
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8791/'
with sync_playwright() as p:
    browser = getattr(p, os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')).launch()
    context = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Australia/Melbourne', service_workers='block')
    context.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
    context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.clock.install(time='2026-11-06T12:00:00+11:00')
    page.goto(BASE)
    page.evaluate("localStorage.setItem('gofn-dex-v1','{\"have\":{\"25\":1}}');localStorage.setItem('gofn-us-v1','{\"a\":{\"v\":1,\"t\":1}}');localStorage.setItem('gofn-stamp','7')")
    page.wait_for_selector('#today-v1 article.t1-card[data-start]')
    page.wait_for_load_state('networkidle'); page.wait_for_timeout(800)  # late feeds (season, venue times) may repaint once
    keep = "({d:localStorage.getItem('gofn-dex-v1'),u:localStorage.getItem('gofn-us-v1'),s:localStorage.getItem('gofn-stamp')})"
    before = page.evaluate(keep)
    # Use the curated occurrence, whose ID survives late source and catalogue updates.
    card = page.locator('#today-v1 article.t1-card[data-id="cur:sendai"][data-start]')
    card.wait_for()
    cid, start = card.get_attribute('data-id'), card.get_attribute('data-start')
    assert start == page.evaluate("GODASH.events().find(e => e.id === 'cur:sendai').start.toISOString()"), 'Today has a stale occurrence start after a source update'
    more = card.locator('.t1-more')
    more.scroll_into_view_if_needed()
    box = more.bounding_box(); assert box['width'] >= 44 and box['height'] >= 44, box
    more.focus(); page.keyboard.press('Enter')
    assert more.get_attribute('aria-expanded') == 'true'
    assert page.locator('.t1-menu [role=menuitem]').count() >= 1
    page.keyboard.press('Escape')
    assert page.locator('.t1-menu').count() == 0 and page.evaluate('document.activeElement.classList.contains("t1-more")')
    more.click(); page.locator('[data-t1-done]').click()
    assert page.locator(f'#today-v1 article[data-id="{cid}"][data-start="{start}"]').count() == 0, 'occurrence not hidden'
    assert page.locator('#t1-toast .t1-toast-undo').is_visible()
    stored = page.evaluate("JSON.parse(localStorage.getItem('gofn-today-done-v1'))")
    assert list(stored) == [f'{cid}@{start}'], stored
    page.wait_for_selector('#today-v1 .t1-done-list li', timeout=5000)
    assert page.locator('#today-v1 .t1-done-list li').count() == 1
    assert page.evaluate(keep) == before, 'Collection keys changed'
    page.reload(); page.wait_for_selector('#today-v1 .t1-card')
    assert page.locator(f'#today-v1 article[data-id="{cid}"][data-start="{start}"]').count() == 0, 'not persisted'
    page.locator('#today-v1 .t1-restore').first.click()
    # Reload can show the saved Done list before late curated/season feeds finish
    # repainting Today. Wait for the exact restored occurrence, not any card.
    restored = page.locator(f'#today-v1 article[data-id="{cid}"][data-start="{start}"]')
    restored.wait_for(state='attached', timeout=8000)
    assert restored.count() >= 1, 'restore failed'
    assert page.evaluate("localStorage.getItem('gofn-today-done-v1')") in ('{}', None)
    page.locator(f'#today-v1 article[data-id="{cid}"] .t1-more').first.click(); page.locator('[data-t1-done]').click()
    page.locator('.t1-toast-undo').click()
    restored.wait_for(state='attached', timeout=8000)
    assert restored.count() >= 1, 'toast undo failed'
    assert page.evaluate(keep) == before
    assert errors == [], errors
    print('PASS Today Done menu, undo, restore, persistence, Collection untouched')
    browser.close()
