"""Research tab (grouped, searchable, long-list collapse), event-specific research, freshness / missing states, Sources page, offline reload.

Fixed Sydney clock 9 Nov 2026. 360/390/430 dark. Chromium by default, WebKit with GO_FIELD_NOTES_TEST_BROWSER=webkit.
Set GO_FIELD_NOTES_SCREENSHOTS to keep screenshots.
"""
import base64
import json
import os
import re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('GO_FIELD_NOTES_BATTLE_URL', 'http://127.0.0.1:8791')
SHOTS = os.environ.get('GO_FIELD_NOTES_SCREENSHOTS')
if SHOTS:
    os.makedirs(SHOTS, exist_ok=True)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')


def shot(page, name):
    if SHOTS:
        page.screenshot(path=f'{SHOTS}/{name}.png')


def tasks(n, event='fixture', category='field'):
    return [{'eventId': event, 'task': f'Catch {i + 1} Rookidee', 'category': category, 'checkedAt': '2026-11-09',
             'eventWindow': {'start': '2026-11-09', 'end': '2026-11-30'},
             'rewards': [{'type': 'encounter', 'name': 'Rookidee', 'cpMin': 258, 'cpMax': 285},
                         {'type': 'item', 'name': 'Stardust', 'quantity': 500 + i}],
             'status': 'single', 'sources': ['leekduck'],
             'sourceRefs': [{'id': 'leekduck', 'name': 'Leek Duck', 'url': 'https://leekduck.com/events/fixture/'}]} for i in range(n)]


def open_research(page):
    page.evaluate("GO.showTab('events','research')")
    page.wait_for_selector('#research-list .research-event, #research-list .research-empty')


def context_for(browser, width, details=None, offline_ok=False):
    context = browser.new_context(viewport={'width': width, 'height': 860}, timezone_id='Australia/Sydney',
                                  service_workers='allow' if offline_ok else 'block', color_scheme='dark')
    context.route('**/api/art**', lambda r: r.fulfill(body=PNG, content_type='image/png'))
    context.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
    context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
    if details is not None:
        context.route('**/event-details.json', lambda r: r.fulfill(body=json.dumps(details), content_type='application/json'))
    return context


live = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'public', 'event-details.json')))
REAL = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'public', 'data.json')))


def with_events(context, extra):
    data = json.loads(json.dumps(REAL))
    base = next(e for e in REAL['events'] if e['id'] == 'into')
    clones = []
    for e in extra:  # full-shaped copies of a real event, so the app's own parsing sees what it expects
        c = json.loads(json.dumps(base))
        for k in ('link', 'sourceUrl', 'img', 'detailIds', 'artPageUrl', 'bonuses', 'feat', 'featured', 'mons'):
            c.pop(k, None)
        c.update(e)
        clones.append(c)
    data['events'] = data['events'] + clones
    context.route('**/data.json', lambda r: r.fulfill(body=json.dumps(data), content_type='application/json'))


def merged(extra, updated, drop_tasks=False):
    out = json.loads(json.dumps(live))
    out['updated'] = updated
    if drop_tasks:
        for record in out['events'].values():
            record['researchTasks'] = []
    out['events'].update(extra)
    return out


def boot(page):
    page.clock.install(time='2026-11-09T12:00:00+11:00')
    page.goto(BASE + '/')
    page.wait_for_function('!!window.GODASH && GOEventRegistry.settled()')


with sync_playwright() as p:
    browser = getattr(p, os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')).launch()
    for width in (360, 390, 430):
        # 1. Current research from the shipped snapshot: grouped, compact, exact art, honest wording.
        recent = json.loads(json.dumps(live))
        recent['updated'] = '2026-11-09T01:00:00.000Z'  # fresh against the fixed clock
        context = context_for(browser, width, recent)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        boot(page)
        open_research(page)
        groups = page.locator('#research-list .research-event')
        assert groups.count() >= 1
        assert page.locator('#research-list [data-research-category="field"] h3').first.inner_text().lower().startswith('field research')
        assert 'Each task gives one of its listed rewards' in page.locator('#research-list').inner_text()
        assert 'One of' in page.locator('#research-list .rs-alt').first.inner_text() or 'possible reward' in page.locator('#research-list .rs-alt').first.inner_text()
        assert page.locator('#research-list .research-reward .ue-reward-art').count() >= 3
        body = page.locator('#research-list').inner_text()
        assert 'Shiny' not in body, 'Shiny is shown only when a source says so; the shipped research snapshot never does'
        assert 'Updated' in page.locator('#research-fresh').inner_text(), page.locator('#research-fresh').inner_text()
        # no horizontal page scroll
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
        shot(page, f'research-current-{width}')

        # Event-specific: Into the Wild research from Event Details, then anchored in the tab.
        page.evaluate("GODETAIL.open('into')")
        page.wait_for_selector('#evd .ue-hero')
        page.locator('#evd .evd-nav-link[data-sec="research"]').click()
        assert page.locator('#evd .evd-sec:not([hidden])').count() == 1
        page.locator('#evd .evd-research').scroll_into_view_if_needed()
        assert page.locator('#evd .evd-research .research-task').count() >= 3
        assert 'One of 3 possible rewards' in page.locator('#evd .evd-research').inner_text() or page.locator('#evd .evd-research [aria-label^="One of"]').count() >= 1
        shot(page, f'research-event-into-the-wild-{width}')
        page.locator('#evd [data-open-research]').first.click()
        page.wait_for_selector('#research-list .research-event')
        # The tab opens on the event it was opened from (an earlier-starting event may sit above it in the list).
        page.wait_for_timeout(600)
        assert page.locator('#research-list .research-event', has_text='Into the Wild').first.evaluate('(el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }')

        # Search by Pokémon / reward, and an honest no-match state.
        page.fill('#research-search', 'magnemite')
        assert page.locator('#research-list .research-task').count() >= 1
        assert 'Magnemite' in page.locator('#research-list').inner_text()
        page.fill('#research-search', 'zzzz-nothing')
        page.wait_for_function("document.querySelector('#research-list').innerText.includes('No task or reward matches')", timeout=5000)
        assert 'No task or reward matches' in page.locator('#research-list').inner_text()
        page.fill('#research-search', '')
        assert page.locator('#research-list .research-event').count() >= 1
        assert not errors, errors
        context.close()

        # 2. A long list collapses and expands; search expands it.
        long_details = merged({'fixture': {'name': 'Long Research Fixture', 'sources': [], 'researchTasks': tasks(26)}}, '2026-11-09T01:00:00.000Z')
        context = context_for(browser, width, long_details)
        page = context.new_page()
        with_events(context, [{'id': 'fixture', 't': 'Long Research Fixture', 's': '2026-11-09T10:00', 'e': '2026-11-30T20:00'}])
        boot(page)
        open_research(page)
        G = '#research-list [data-research-group="cur:fixture"] '
        assert page.locator(G + '.research-task').count() == 8
        btn = page.locator('[data-research-more="cur:fixture|field"]')
        assert 'Show all 26 tasks' in btn.inner_text()
        page.locator(G).first.scroll_into_view_if_needed()
        page.evaluate("document.querySelector('[data-research-group=\"cur:fixture\"] .research-more').scrollIntoView({block: 'center'})")
        shot(page, f'research-long-list-{width}')
        btn.click()
        assert page.locator(G + '.research-task').count() == 26
        page.fill('#research-search', 'Catch 12')
        assert page.locator('#research-list .research-task').count() == 1
        context.close()

        # 3. Stale snapshot and missing data states.
        stale = merged({'fixture': {'name': 'Stale Fixture', 'sources': [], 'researchTasks': tasks(3)}}, '2026-11-05T01:00:00.000Z')
        context = context_for(browser, width, stale)
        page = context.new_page()
        with_events(context, [{'id': 'fixture', 't': 'Stale Fixture', 's': '2026-11-09T10:00', 'e': '2026-11-30T20:00'}])
        boot(page)
        open_research(page)
        fresh = page.locator('#research-fresh').inner_text()
        assert 'May be out of date' in fresh and 'may have changed' in fresh, fresh
        shot(page, f'research-stale-{width}')
        context.close()

        empty = merged({'x': {'name': 'Mentions only', 'sources': [], 'fields': {'research': [{'text': 'Special Research will be available.', 'sources': ['leekduck'], 'status': 'single'}]}}}, '2026-11-09T01:00:00.000Z', drop_tasks=True)
        context = context_for(browser, width, empty)
        page = context.new_page()
        with_events(context, [{'id': 'x', 't': 'Mentions only', 's': '2026-11-09T10:00', 'e': '2026-11-30T20:00'}])
        boot(page)
        open_research(page)
        text = page.locator('#research-list').inner_text()
        assert 'Not announced yet' in text and 'Not available from source' in text and 'Mentions only' in text, text
        shot(page, f'research-missing-{width}')
        context.close()

        # 4. Sources page: attribution, licensing, cadence, importer freshness.
        context = context_for(browser, width, recent)
        page = context.new_page()
        boot(page)
        page.evaluate("GO.showTab('saved','menu')")
        page.evaluate("document.getElementById('srcdd').open = true")
        page.wait_for_selector('#srcbody .about-data')
        page.wait_for_function("document.getElementById('srcbody').innerText.includes('Event write-ups and research')")
        src = page.locator('#srcbody').inner_text()
        for needle in ('Leek Duck', 'Pokémon GO news (official)', 'PokeMiners', 'Niantic', 'every hour', 'Not announced yet', 'Last updated'):
            assert needle in src, needle
        assert page.locator('#srcbody a[href="https://leekduck.com/events/"]').count() == 1
        page.get_by_text('Event write-ups and research').first.scroll_into_view_if_needed()
        shot(page, f'sources-importer-{width}')
        page.locator('#srcbody .about-data').scroll_into_view_if_needed()
        shot(page, f'sources-about-{width}')
        context.close()

    # 5. Offline reload of Research and Sources (service worker precache).
    context = context_for(browser, 390, None, offline_ok=True)
    context.unroute('**/api/**')
    page = context.new_page()
    page.goto(BASE + '/')
    page.wait_for_function('!!window.GODASH && GOEventRegistry.settled()')
    page.evaluate("navigator.serviceWorker.ready.then(() => 0)")
    page.wait_for_function('navigator.serviceWorker.controller !== null', timeout=30000)
    open_research(page)
    context.set_offline(True)
    page.reload()
    page.wait_for_function('!!window.GODASH && GOEventRegistry.settled()', timeout=30000)
    open_research(page)
    assert page.locator('#research-list .research-event').count() >= 1
    shot(page, 'offline-research-390')
    page.evaluate("GO.showTab('saved','menu')")
    page.evaluate("document.getElementById('srcdd').open = true")
    page.wait_for_selector('#srcbody .about-data')
    page.locator('#srcbody .about-data').scroll_into_view_if_needed()
    shot(page, 'offline-sources-390')
    context.close()
    browser.close()
print('research and sources checks passed')
