"""Collection opportunity search, ownership boundaries and event handoffs in the real app."""
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8791'
ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / 'public/data.json').read_text())
DATA['events'] = [
    {'id': f'planner-{i}', 't': f'Planner Festival {i}', 's': f'2026-11-{7+i:02}T10:00',
     'e': f'2026-11-{7+i:02}T18:00', 'k': 'event', 'scope': 'worldwide_local',
     'sourceUrl': 'https://pokemongo.com/news/fixture', 'art': ['Pikachu'], 'p': []}
    for i in range(5)
] + [
    {'id': 'planner-zorua', 't': 'Zorua Moonlight', 's': '2026-11-07T10:00', 'e': '2026-11-07T18:00',
     'art': ['Zorua'], 'p': [], 'sourceUrl': 'https://pokemongo.com/news/fixture'},
    {'id': 'planner-owned', 't': 'Bulbasaur Garden', 's': '2026-11-08T10:00', 'e': '2026-11-08T18:00',
     'art': ['Bulbasaur'], 'p': [], 'sourceUrl': 'https://pokemongo.com/news/fixture'}
]
for event in DATA['events']:
    event['tags'] = []
DATA['spotlight'] = []
DATA['raidHour'] = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, theme in [(320, 'light'), (390, 'dark'), (1440, 'dark')]:
        context = browser.new_context(viewport={'width': width, 'height': 900}, timezone_id='Australia/Sydney',
                                      service_workers='block')
        context.set_default_timeout(10000)
        context.set_default_navigation_timeout(15000)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.clock.install(time='2026-11-06T12:00:00+11:00')
        page.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
        def api(route):
            if route.request.url.endswith('/api/events'):
                return route.fulfill(body='{"enabled":false,"events":[]}', content_type='application/json')
            if route.request.url.endswith('/api/sources'):
                return route.fulfill(body='{"enabled":false,"sources":[]}', content_type='application/json')
            route.fulfill(status=404, body='{}', content_type='application/json')
        page.route('**/api/**', api)
        page.route('**/data.json', lambda r: r.fulfill(body=json.dumps(DATA), content_type='application/json'))
        page.add_init_script("""localStorage.setItem('gofn-us-v1', JSON.stringify({
            'pref:gen:1':{v:true,t:1}, 'follow:pikachu':{v:'Pikachu',t:1}
        }));localStorage.setItem('gofn-dex-v1',JSON.stringify({m:{own:{1:1}}}));""")
        page.goto(BASE + '/')
        try:
            page.wait_for_function('!!window.GODASH && !!window.GODETAIL')
        except Exception:
            print('Bootstrap errors:', errors)
            raise
        page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
        page.locator('#tabs [data-tab="collect"]').click()
        page.locator('#subnav-collect [data-sub="opps"]').click()
        search = page.locator('#opp-search')
        mode = page.locator('#opp-filter')
        search.fill('Pikachu')
        assert page.locator('#opps .opp.missing').count() == 1
        assert search.evaluate('(el) => el === document.activeElement')
        assert page.locator('#opps .opp-event:visible').count() == 3
        page.locator('#opps .opp-more summary').click()
        assert page.locator('#opps .opp-event:visible').count() == 5
        last = page.locator('#opps .opp-event').last
        last.focus()
        page.keyboard.press('Enter')
        page.locator('#evd').wait_for(state='visible')
        assert 'Planner Festival 4' in page.locator('#evd').inner_text()
        page.keyboard.press('Escape')
        assert last.evaluate('(el) => el === document.activeElement')
        search.fill('Moonlight')
        assert page.locator('#opps .opp.unknown').count() == 1
        assert page.locator('#opps .opp.missing').count() == 0
        mode.select_option('need')
        assert page.locator('#opps .opp').count() == 0
        assert 'No opportunities match' in page.locator('#opps').inner_text()
        page.locator('#opp-clear').click()
        assert search.input_value() == '' and mode.input_value() == 'all'
        assert search.evaluate('(el) => el === document.activeElement')
        search.fill('Bulbasaur')
        assert page.locator('#opps .opp.have:visible').count() == 1, 'owned search result expands automatically'
        search.fill('')
        mode.select_option('following')
        assert page.locator('#opps .opp').count() == 1
        page.locator('#opps [data-follow]').click()
        assert page.locator('#opps .opp').count() == 0
        assert 'None of the Pokémon you follow' in page.locator('#opps').inner_text()
        assert search.evaluate('(el) => el === document.activeElement'), 'removed row returns focus to search'
        page.locator('#opp-clear').click()
        search.fill('Planner Festival 2')
        assert page.locator('#opps .opp').count() == 1
        page.locator('#tabs [data-tab="now"]').click()
        page.locator('#tabs [data-tab="collect"]').click()
        assert search.input_value() == 'Planner Festival 2'
        assert page.locator('#opps .opp').count() == 1
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        targets = page.locator('#opp-search, #opp-filter, #opp-clear, #opps .opp-event:visible')
        assert all(el['height'] >= 44 for el in targets.evaluate_all('els => els.map(el => ({height:el.getBoundingClientRect().height}))'))
        marks = page.evaluate("JSON.parse(localStorage.getItem('gofn-dex-v1'))")
        assert marks['m']['own']['1'] == 1
        assert not errors, errors
        page.screenshot(path=f'/tmp/opportunity-planner-{width}-{theme}.png', full_page=True)
        print(f'PASS opportunity search, filters, ownership, event handoff, expansion, focus and layout {width}px {theme}')
        context.close()
    browser.close()
