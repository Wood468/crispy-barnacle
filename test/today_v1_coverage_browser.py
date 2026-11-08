"""Redesigned Today: boost rail from a real-shaped record, empty boost state, Ending soon from the real deadlines source,
undo window, midnight rollover and that the legacy agenda is unreachable for users. Covers the assertions the classic Today checks made."""
import os
import json, re
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8791/'
LIVE = {'id': 'leekduck:boost-fixture', 'name': 'Boost Fixture Event', 'type': 'event', 'start': '2026-11-08T00:00:00.000', 'end': '2026-11-09T09:00:00.000',
        'tzMode': 'local', 'scope': 'worldwide_local', 'status': 'official_confirmed', 'featured': [{'name': 'Electrike', 'shiny': True}], 'bonuses': [],
        'highlights': [{'type': 'boosted-shiny', 'label': 'BOOSTED SHINY · Electrike'}],
        'reports': [{'source': 'leekduck', 'status': 'community_reported', 'link': 'https://leekduck.com/events/boost-fixture/'}], 'link': 'https://leekduck.com/events/boost-fixture/'}

FILLER = [{'id': 'leekduck:filler-%d' % i, 'name': 'Filler Event %d' % i, 'type': 'event', 'start': '2026-11-%02dT10:00:00.000' % (12 + i), 'end': '2026-11-%02dT20:00:00.000' % (12 + i),
           'tzMode': 'local', 'scope': 'worldwide_local', 'status': 'official_confirmed', 'featured': [], 'bonuses': [], 'reports': [{'source': 'leekduck', 'status': 'community_reported', 'link': 'https://leekduck.com/events/filler-%d/' % i}], 'link': 'https://leekduck.com/events/filler-%d/' % i} for i in range(12)]

def run(playwright, events, clock):
    events = events + FILLER  # the app only trusts a live feed with at least 10 events
    browser = getattr(playwright, os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')).launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Australia/Melbourne', service_workers='block')
    ctx.route('**/api/**', lambda r: r.fulfill(body=json.dumps({'environment': 'production', 'database': True, 'enabled': True, 'readOnly': True, 'events': events}) if '/api/events' in r.request.url else '{}', content_type='application/json'))
    ctx.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
    page = ctx.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.clock.install(time=clock)
    return browser, page, errors

with sync_playwright() as p:
    # 1. Real-shaped boosted-shiny highlight: gold arrow + sparkle tile; count; no ordinary-shiny promotion.
    browser, page, errors = run(p, [LIVE], '2026-11-08T12:00:00+11:00')
    page.add_init_script("localStorage.setItem('gofn-classic-today','1')")  # a stale user flag must do nothing
    page.goto(BASE); page.wait_for_selector('#today-v1 .t1-glance')
    assert page.locator('html.classic-today').count() == 0 and page.locator('#today-legacy').is_hidden(), 'legacy agenda reachable'
    page.wait_for_selector('#today-v1 .t1-boost')
    tile = page.locator('#today-v1 .t1-boost').first
    assert 'Electrike' in tile.inner_text() and tile.locator('.t1-shiny--boost .t1-up').count() == 1
    assert page.locator('#today-v1 .t1-tile--shiny b').inner_text() == '1'
    assert page.locator('#today-v1 .t1-tile--shiny .t1-up').count() == 1
    # 2. Ending soon comes from the real deadlines source with a countdown, in the same hierarchy.
    page.wait_for_selector('#t1-ending .t1-ending')
    row = page.locator('#t1-ending .t1-ending').first
    assert 'Lucky Trinket' in row.inner_text() and re.search(r'Ends in \d', row.inner_text())
    assert row.locator('a[href^="https://"]').count() == 1
    page.wait_for_load_state('networkidle'); page.wait_for_timeout(500)
    # 3. Done undo window: the toast offers Undo, expires, and the restore list still restores.
    card = page.locator('#today-v1 article.t1-card[data-start]').first
    cid = card.get_attribute('data-id')
    card.locator('.t1-more').click(); page.locator('[data-t1-done]').click()
    assert page.locator('#t1-toast .t1-toast-undo').is_visible()
    page.clock.run_for(7500)
    assert page.locator('#t1-toast').is_hidden() and page.locator('#today-v1 .t1-done-list li').count() == 1
    # 4. Across Melbourne midnight the same occurrence stays done; a later occurrence is a different key.
    page.clock.run_for(13 * 3600 * 1000)
    assert page.locator(f'#today-v1 article[data-id="{cid}"]').count() == 0 or page.locator(f'#today-v1 article[data-id="{cid}"]').first.get_attribute('data-start') != card.get_attribute('data-start')
    assert errors == [], errors
    browser.close()
    # 5. Empty boost state is one compact line, and the tile shows no arrow at 0.
    browser, page, errors = run(p, [], '2026-11-08T12:00:00+11:00')
    page.goto(BASE); page.wait_for_selector('#today-v1 .t1-glance')
    line = page.locator('#today-v1 .t1-empty-line')
    assert line.count() == 1 and line.bounding_box()['height'] <= 40, line.bounding_box()
    assert page.locator('#today-v1 .t1-tile--shiny .t1-up').count() == 0
    assert page.locator('#today-v1 .t1-boost').count() == 0
    assert errors == [], errors
    browser.close()
print('PASS Today v1: boost rail, empty state, Ending soon, undo window, midnight, legacy unreachable')
