"""Visual refinements: banner aspect handling (2.4:1, 16:9, square), Raids title, RAID HOUR badge at 320, Travel spacing,
checkbox targets, footer date, error and empty states. Fixed Sydney clock. Dark. Set GO_FIELD_NOTES_SCREENSHOTS to keep screenshots."""
import io
import json
import os
import re
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

BASE = os.environ.get('GO_FIELD_NOTES_BATTLE_URL', 'http://127.0.0.1:8791')
SHOTS = os.environ.get('GO_FIELD_NOTES_SCREENSHOTS')
if SHOTS:
    os.makedirs(SHOTS, exist_ok=True)
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
DATA = json.load(open(os.path.join(ROOT, 'data.json')))


def shot(page, name):
    if SHOTS:
        page.screenshot(path=f'{SHOTS}/{name}.png')


def banner(w, h):
    img = Image.new('RGB', (w, h), (40, 60, 120))
    d = ImageDraw.Draw(img)
    d.rectangle([w * .2, h * .2, w * .8, h * .8], fill=(230, 180, 40))
    d.rectangle([0, 0, w - 1, h - 1], outline=(255, 255, 255), width=4)
    out = io.BytesIO(); img.save(out, 'PNG'); return out.getvalue()


RATIOS = {'wide-2.4': (1200, 500), 'wide-16x9': (1280, 720), 'square': (800, 800)}


def context_for(browser, width, height=860):
    c = browser.new_context(viewport={'width': width, 'height': height}, timezone_id='Australia/Sydney', service_workers='block', color_scheme='dark')
    c.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
    c.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
    return c


def boot(page, tab=None):
    page.clock.install(time='2026-11-09T12:00:00+11:00')
    page.goto(BASE + '/')
    page.wait_for_function('!!window.GODASH && GOEventRegistry.settled()')


def empty_context(browser, width):
    c = context_for(browser, width)
    empty = json.loads(json.dumps(DATA))
    for k in ('spotlight', 'raidHour', 'rotation', 'maxBattles', 'raidNow', 'inPerson', 'worldEvents'):
        empty[k] = []
    old = json.loads(json.dumps(DATA['events'][0]))
    old.update({'s': '2026-01-05T10:00', 'e': '2026-01-05T18:00'})
    empty['events'] = [old]
    empty['maxRosters'] = {}
    c.route('**/data.json', lambda r: r.fulfill(body=json.dumps(empty), content_type='application/json'))
    c.route('**/events-v1.json', lambda r: r.fulfill(body=json.dumps({'schemaVersion': 1, 'species': [], 'costumes': [], 'events': []}), content_type='application/json'))
    c.route('**/world-events.json', lambda r: r.fulfill(body='{"events":[]}', content_type='application/json'))
    c.route('**/regional-events.json', lambda r: r.fulfill(body='{"events":[]}', content_type='application/json'))
    return c


with sync_playwright() as p:
    browser = getattr(p, os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')).launch()

    # 1. Banner ratios on the Today major card: no letterbox bars, no stretching, no layout shift, key area kept.
    for width in (320, 360, 390, 430, 1280):
        for label, (bw, bh) in RATIOS.items():
            c = context_for(browser, width, 900 if width >= 900 else 860)
            holder = {}

            body = banner(bw, bh)
            c.route(re.compile(r'into-the-wild-2026'), lambda route, request, body=body: route.fulfill(body=body, content_type='image/png'))
            page = c.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.add_init_script("window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true})")
            boot(page)
            fig = page.locator('#today-v1 .t1-major .ev-art--official').first
            fig.wait_for(state='attached')
            before = fig.bounding_box()
            page.wait_for_function("(() => { const i = document.querySelector('#today-v1 .t1-major .ev-art--official .ev-art-img'); return i && i.complete && i.naturalWidth > 0; })()", timeout=10000)
            page.wait_for_timeout(300)
            after = fig.bounding_box()
            img = fig.locator('.ev-art-img').first.bounding_box()
            expected = 2.4 if width >= 900 else 16 / 9
            assert abs(after['width'] / after['height'] - expected) < 0.05, (width, label, after)
            assert abs(before['height'] - after['height']) < 1 and abs(before['width'] - after['width']) < 1, ('box moved when the banner loaded', before, after)
            assert abs(img['width'] - after['width']) < 1.5 and abs(img['height'] - after['height']) < 1.5, ('image must fill the reserved box', img, after)
            tall = fig.evaluate("f => f.classList.contains('is-tall')")
            fit = fig.locator('.ev-art-img').first.evaluate('i => getComputedStyle(i).objectFit')
            ar = bw / bh
            box_ar = after['width'] / after['height']
            if ar < 1.45:
                assert tall and fit == 'contain', (label, tall, fit)  # shown whole over a blurred fill, never cropped or stretched
            else:
                assert not tall and fit == 'cover', (label, tall, fit)
                vis_w, vis_h = min(1, box_ar / ar), min(1, ar / box_ar)
                assert vis_w >= .7 and vis_h >= .7, ('key area clipped', label, vis_w, vis_h)
            cls = page.evaluate('window.__cls')
            assert cls < 0.01, ('layout shift', cls)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            assert not errors, errors
            fig.scroll_into_view_if_needed()
            page.evaluate('window.scrollBy(0,-120)')
            shot(page, f'banner-{label}-{width}')
            c.close()

    # 2. Raids title, RAID HOUR badge, Travel spacing, checkbox targets, footer, at phone and desktop widths.
    for width in (320, 360, 390, 430, 1280):
        c = context_for(browser, width, 900 if width >= 900 else 860)
        page = c.new_page()
        boot(page)
        page.evaluate("GO.showTab('raids')")
        page.wait_for_selector('#tab-raids .prio-head .sec2')
        title = page.locator('#tab-raids .prio-head .sec2').first.evaluate("e => { const s = getComputedStyle(e); return [s.textTransform, parseFloat(s.fontSize), s.fontWeight, e.textContent]; }")
        assert title[0] == 'none' and title[1] >= 27 and title[2] in ('700', 'bold'), title
        shot(page, f'raids-{width}')
        if width <= 430:
            page.evaluate("GO.showTab('now')")
            badge = page.locator('#today-v1 .t1-tier', has_text=re.compile('raid hour', re.I)).first
            badge.scroll_into_view_if_needed()
            box = badge.bounding_box()
            assert box['height'] < 30, ('RAID HOUR badge wraps', box)
            shot(page, f'raid-hour-badge-{width}')
        page.evaluate("GO.showTab('events','travel')")
        page.wait_for_selector('#sub-travel h2')
        gaps = page.evaluate("""() => { const q = s => document.querySelector(s).getBoundingClientRect();
            return [q('#sub-travel .intro').top - q('#sub-travel h2').bottom, q('#sub-travel .travel-search').top - q('#sub-travel .intro').bottom, q('#travel-regions').top - q('#sub-travel .travel-search').bottom]; }""")
        assert all(g <= 24 for g in gaps), ('Travel spacing', gaps)
        shot(page, f'travel-{width}')
        for tab in ("GO.showTab('now')", "GO.showTab('collect')", "GO.showTab('raids')"):
            page.evaluate(tab)
            page.wait_for_timeout(300)
            small = page.evaluate("""() => [...document.querySelectorAll('input[type=checkbox]')].filter(i => i.getBoundingClientRect().width > 0).map(i => { const r = (i.closest('label') || i).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter(s => s[0] < 44 || s[1] < 44)""")
            assert not small, ('checkbox target under 44px', tab, small)
        assert 'Events as of .' not in page.locator('footer, body').first.inner_text()
        c.close()

    # 3. Footer with no data date, error state, empty Raids and Schedule.
    for width in (320, 360, 390, 430, 1280):
        c = empty_context(browser, width)
        page = c.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.clock.install(time='2026-11-09T12:00:00+11:00')
        page.goto(BASE + '/')
        page.wait_for_selector('#today-v1', state='attached')
        page.wait_for_timeout(2500)
        print('EMPTY', width, errors[:3], page.evaluate('[!!window.GODASH, window.GOEventRegistry && GOEventRegistry.settled()]'))
        assert 'Events as of .' not in page.locator('body').inner_text()
        page.evaluate("GO.showTab('raids')")
        page.wait_for_timeout(600)
        shot(page, f'empty-raids-{width}')
        page.evaluate("GO.showTab('events','calendar')")
        page.wait_for_timeout(600)
        assert 'Nothing listed for this month' in page.locator('#calday').inner_text()
        page.locator('#calday').scroll_into_view_if_needed()
        shot(page, f'empty-schedule-{width}')
        page.evaluate("GO.showTab('now')")
        page.wait_for_timeout(300)
        shot(page, f'empty-today-{width}')
        c.close()
        c = context_for(browser, width)
        c.route('**/data.json', lambda r: r.fulfill(status=500, body='{}', content_type='application/json'))
        page = c.new_page()
        page.clock.install(time='2026-11-09T12:00:00+11:00')
        page.goto(BASE + '/')
        page.wait_for_timeout(2500)
        assert 'Events as of .' not in page.locator('body').inner_text()
        shot(page, f'error-state-{width}')
        c.close()
    browser.close()
print('visual refinements browser checks passed')
