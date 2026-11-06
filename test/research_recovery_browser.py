"""Research freshness, recovery and narrow-layout acceptance checks with source fixtures."""
import json
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = 'http://127.0.0.1:8791'
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, theme in [(320, 'light'), (390, 'dark'), (1440, 'dark')]:
        context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=theme,
                                      service_workers='block')
        page = context.new_page()
        page.set_default_timeout(15000)
        state = {'fail': True, 'calls': 0}
        tasks = [{'eventId': 'fixture', 'task': 'Catch 3 Pokémon', 'category': 'field',
                  'eventWindow': {'start': '2026-11-01', 'end': '2026-11-30'},
                  'rewards': [{'type': 'item', 'name': 'Potion', 'quantity': 1}],
                  'sourceRefs': [{'name': 'Leek Duck', 'url': 'https://leekduck.com/events/fixture/'}]},
                 {'eventId': 'fixture', 'task': 'Win a raid', 'category': 'field',
                  'eventWindow': {'start': '2026-11-01', 'end': '2026-11-30'},
                  'checkedAt': '2026-10-01', 'rewards': []}]
        def respond(route):
            state['calls'] += 1
            if state['fail']:
                return route.fulfill(status=503, body='{}', content_type='application/json')
            payload = ({'asOf': '2026-11-06', 'events': {'fixture': {'researchTasks': tasks}}}
                       if 'event-details.json' in route.request.url else
                       {'events': [{'id': 'fixture', 't': 'Source-backed Research fixture'}]})
            route.fulfill(body=json.dumps(payload), content_type='application/json')
        page.route('**/event-details.json', respond)
        page.route('**/data.json', respond)
        page.clock.install(time=datetime(2026, 11, 6, 12))
        page.goto(BASE + '/offline.html')
        # Load the production styles and modules on an isolated Research surface; no unrelated API requests.
        page.set_content('<link rel="stylesheet" href="' + BASE + '/styles.css">'
                         '<link rel="stylesheet" href="' + BASE + '/dash.css">'
                         '<main><section id="sub-research"><h2>Research</h2>'
                         '<p id="research-status" role="status" aria-live="polite"></p>'
                         '<button class="pill" data-research-refresh aria-controls="research-list">Refresh research</button>'
                         '<div id="research-list" class="research-groups"></div></section></main>')
        page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
        page.add_script_tag(url=BASE + '/lib.js')
        page.add_script_tag(url=BASE + '/research.js')
        page.evaluate("document.dispatchEvent(new CustomEvent('gofn-view', {detail:{tab:'events',sub:'research'}}))")
        page.locator('[data-research-retry]').wait_for()
        state['fail'] = False
        page.locator('[data-research-retry]').click()
        page.get_by_role('heading', name='Catch 3 Pokémon').wait_for()
        assert 'Source check date unavailable' in page.locator('#research-list').inner_text()
        assert 'source check may be out of date' in page.locator('#research-list').inner_text()
        assert 'Checked 2026-11-06' not in page.locator('#research-list').inner_text()
        assert page.locator('.research-task-source a').get_attribute('href') == 'https://leekduck.com/events/fixture/'
        refresh = page.locator('[data-research-refresh]')
        state['fail'] = True
        refresh.focus()
        page.keyboard.press('Enter')
        page.wait_for_function("document.getElementById('research-status').textContent.includes('previous snapshot; it may be out of date')")
        assert page.get_by_role('heading', name='Catch 3 Pokémon').count() == 1
        assert refresh.evaluate('(el) => el === document.activeElement')
        state['fail'] = False
        page.keyboard.press('Enter')
        page.wait_for_function("document.getElementById('research-status').textContent.startsWith('Saved source snapshot.')")
        assert refresh.evaluate('(el) => el === document.activeElement')
        before = state['calls']
        page.clock.fast_forward(300001)
        page.evaluate("document.dispatchEvent(new CustomEvent('gofn-view', {detail:{tab:'events',sub:'research'}}))")
        page.wait_for_function("!document.getElementById('research-list').hasAttribute('aria-busy')")
        assert state['calls'] == before + 2
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        assert refresh.bounding_box()['height'] >= 44
        page.screenshot(path=f'/tmp/research-{width}-{theme}.png', full_page=True)
        print(f'PASS Research retry, retained results, keyboard refresh, freshness, expiry and layout {width}px {theme}')
        context.close()
    # Real loader timeout: advance the clock past its deadline while both requests remain unanswered.
    context = browser.new_context(service_workers='block')
    page = context.new_page()
    page.goto(BASE + '/offline.html')
    page.set_content('<p id="research-status"></p><button data-research-refresh>Refresh research</button><div id="research-list"></div>')
    page.clock.install()
    held = []
    page.route('**/event-details.json', lambda route: held.append(route))
    page.route('**/data.json', lambda route: held.append(route))
    page.add_script_tag(url=BASE + '/lib.js')
    page.add_script_tag(url=BASE + '/research.js')
    page.evaluate("document.dispatchEvent(new CustomEvent('gofn-view', {detail:{tab:'events',sub:'research'}}))")
    page.clock.fast_forward(10001)
    page.locator('[data-research-retry]').wait_for()
    assert page.locator('#research-list').get_attribute('aria-busy') is None
    print('PASS Research stalled request reaches retry state after ten seconds')
    for route in held:
        route.abort()
    page.unroute_all(behavior='wait')
    context.close()
    browser.close()
