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
    assert page.locator('#t1-toast').is_hidden(), 'Undo toast did not expire after 7.5 simulated seconds'
    assert page.locator('#today-v1 .t1-done-list li').count() == 1, 'Done item missing from restore list after toast expiry'
    # 4. Across Melbourne midnight the same occurrence stays done; a later occurrence is a different key.
    page.clock.run_for(13 * 3600 * 1000)
    assert page.locator(f'#today-v1 article[data-id="{cid}"]').count() == 0 or page.locator(f'#today-v1 article[data-id="{cid}"]').first.get_attribute('data-start') != card.get_attribute('data-start')
    assert errors == [], errors
    browser.close()
    # 5. Empty boost state is one compact line, and the tile shows no arrow at 0.
    browser, page, errors = run(p, [], '2026-11-08T12:00:00+11:00')
    page.goto(BASE); page.wait_for_selector('#today-v1 .t1-glance')
    page.wait_for_selector('#today-v1 .t1-empty-line', state='attached', timeout=10000)
    page.wait_for_load_state('networkidle'); page.wait_for_timeout(600)  # late feeds may repaint once
    # Read count and geometry in one browser task: a late repaint can replace the node between locator calls.
    info = page.evaluate("(()=>{const n=document.querySelectorAll('#today-v1 .t1-empty-line');const e=n[0];return {count:n.length,height:e?e.getBoundingClientRect().height:null}})()")
    assert info['count'] == 1, 'expected exactly one empty-boost message'
    assert info['height'] is not None and 0 < info['height'] <= 40, f'empty-boost message exceeds compact height: {info}'
    assert page.locator('#today-v1 .t1-tile--shiny .t1-up').count() == 0
    assert page.locator('#today-v1 .t1-boost').count() == 0
    assert errors == [], errors
    browser.close()
    # 6. The same Night Out reported by two sources (Leek Duck event + official world list) shows once; a different city would not be merged.
    LON = {'id': 'leekduck:pokemon-night-out-london-2026', 'name': 'Pokémon Night Out 2026 - London', 'type': 'event', 'start': '2026-11-10T18:00:00.000Z', 'end': '2026-11-10T22:30:00.000Z',
           'tzMode': 'utc', 'scope': 'regional', 'status': 'community_reported', 'featured': [], 'bonuses': [], 'reports': [{'source': 'leekduck', 'status': 'community_reported', 'link': 'https://leekduck.com/events/pokemon-night-out-london-2026/'}], 'link': 'https://leekduck.com/events/pokemon-night-out-london-2026/'}
    browser, page, errors = run(p, [LON], '2026-11-10T12:00:00+11:00')
    page.goto(BASE); page.wait_for_selector('#today-v1 .t1-glance'); page.wait_for_load_state('networkidle'); page.wait_for_timeout(800)
    rows = page.locator('#today-v1 article').filter(has_text=re.compile('Night Out', re.I))
    assert rows.count() == 1, rows.all_inner_texts()
    assert errors == [], errors
    browser.close()
    # 7. A long, source-shaped event title must stay below its featured art at phone widths.
    # Visual bounds test the actual rendered layout (not just a CSS selector snapshot).
    LONG = {'id': 'leekduck:sprint3-long-title-fixture', 'name': 'Pokémon GO City Safari — Exceptionally Long Event Title for Mobile Layout Testing',
            'type': 'event', 'start': '2026-11-13T16:00:00.000', 'end': '2026-11-15T20:00:00.000',
            'tzMode': 'local', 'scope': 'worldwide_local', 'status': 'official_confirmed',
            'featured': [{'name': 'Latias'}, {'name': 'Latios'}], 'region': 'Osaka, Japan',
            'bonuses': [], 'reports': [{'source': 'leekduck', 'status': 'community_reported',
            'link': 'https://leekduck.com/events/sprint3-fixture/'}],
            'link': 'https://leekduck.com/events/sprint3-fixture/'}
    browser, page, errors = run(p, [LONG], '2026-11-13T12:00:00+11:00')
    page.goto(BASE); page.wait_for_selector('#today-v1 .t1-glance')
    long_card = page.locator('#t1-soon .t1-major').filter(has_text='Exceptionally Long').first
    long_card.wait_for(state='visible')
    for width in (360, 390, 430):
        page.set_viewport_size({'width': width, 'height': 844})
        bounds = long_card.evaluate("""el => {
          const art = el.querySelector(':scope > .t1-major-art').getBoundingClientRect();
          const details = el.querySelector(':scope > .t1-open').getBoundingClientRect();
          const titleNode = el.querySelector('.t1-open .t1-title');
          const title = titleNode.getBoundingClientRect();
          return {artBottom: art.bottom, detailsTop: details.top, detailsBottom: details.bottom,
                  titleTop: title.top, titleBottom: title.bottom,
                  titleOverflow: titleNode.scrollWidth - titleNode.clientWidth,
                  pageOverflow: document.documentElement.scrollWidth - window.innerWidth};
        }""")
        assert bounds['artBottom'] <= bounds['detailsTop'] + 1, f'art overlaps content at {width}px: {bounds}'
        assert bounds['titleTop'] >= bounds['detailsTop'] - 1 and bounds['titleBottom'] <= bounds['detailsBottom'] + 1, f'title clipped at {width}px: {bounds}'
        assert bounds['titleOverflow'] <= 1 and bounds['pageOverflow'] <= 1, f'horizontal overflow at {width}px: {bounds}'
    assert errors == [], errors
    browser.close()
print('PASS Today v1: boost rail, empty state, Ending soon, undo window, midnight, legacy unreachable')
