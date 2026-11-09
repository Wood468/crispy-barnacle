"""Accuracy fixes: Global vs In person, offline banner wording, research task counts, GO Pass N of M.

Fixed Sydney clock. 320/360/390/430 dark. Set GO_FIELD_NOTES_SCREENSHOTS to keep screenshots.
"""
import os
import re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('GO_FIELD_NOTES_BATTLE_URL', 'http://127.0.0.1:8791')
SHOTS = os.environ.get('GO_FIELD_NOTES_SCREENSHOTS')
if SHOTS:
    os.makedirs(SHOTS, exist_ok=True)
MACHAMP = 'w-go-wild-area-gigantamax-machamp-power-up-timed-res'


def shot(page, name):
    if SHOTS:
        page.screenshot(path=f'{SHOTS}/{name}.png')


def context_for(browser, width):
    context = browser.new_context(viewport={'width': width, 'height': 860}, timezone_id='Australia/Sydney', service_workers='block', color_scheme='dark')
    context.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
    context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
    context.route(re.compile(r'^https://(lh3\.googleusercontent\.com|cdn\.leekduck\.com)/'), lambda r: r.abort())
    return context


def boot(page, when):
    page.clock.install(time=when)
    page.goto(BASE + '/')
    page.wait_for_function('!!window.GODASH && GOEventRegistry.settled()')


with sync_playwright() as p:
    browser = getattr(p, os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')).launch()
    for width in (320, 360, 390, 430):
        # 1. Today (7 Nov): Mexico City is in person, global timed research is Global.
        context = context_for(browser, width)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        boot(page, '2026-11-07T12:00:00+11:00')
        model = page.evaluate("(id) => { const m = GOEventRegistry.find(id); return m && { attendance: m.attendance, kind: GOEventRegistry.display ? GOEventRegistry.display(m).kind : '' }; }", MACHAMP)
        assert model and model['attendance'] == '' and model['kind'] != 'person', model
        sendai = page.locator('.t1-card', has_text='Wild Area: Sendai').first
        assert sendai.count() == 1 and 'IN PERSON' in sendai.inner_text().upper() and 'OVERSEAS' in sendai.inner_text().upper(), 'overseas in-person stays visible and labelled'
        for card in page.locator('.t1-card, .t1-week').all():
            t = card.inner_text()
            if 'Machamp' in t:
                assert 'In person' not in t and 'IN PERSON' not in t, t
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
        sendai.scroll_into_view_if_needed()
        shot(page, f'accuracy-today-inperson-global-{width}')

        # 2. Event Details for the global timed research: not an In person card.
        page.evaluate(f"GODETAIL.open('{MACHAMP}')")
        page.wait_for_selector('#evd .ue-hero')
        hero = page.locator('#evd .ue-hero').inner_text()
        assert 'In person' not in hero and 'No official banner' not in hero, hero
        assert page.locator('#evd .ev-art-theme b', has_text='In person').count() == 0
        shot(page, f'accuracy-machamp-details-{width}')

        # 3. Offline: the banner exists but cannot be fetched. The label says so.
        page.evaluate("GODETAIL.close && GODETAIL.close()")
        context.set_offline(True)
        page.evaluate("window.dispatchEvent(new Event('offline'))")
        page.evaluate("GODETAIL.open('sendai')")
        page.wait_for_selector('#evd .ue-hero')
        page.wait_for_function("document.querySelector('#evd .ev-art') && document.querySelector('#evd .ev-art').classList.contains('is-failed')", timeout=8000)
        tag = page.locator('#evd .ev-art .ev-art-tag').first.text_content()
        assert tag == 'Banner unavailable offline', tag
        assert 'no official banner' not in page.locator('#evd .ue-hero').inner_text().lower()
        shot(page, f'accuracy-offline-banner-{width}')
        context.set_offline(False)

        # 4. Research count and GO Pass total for Into the Wild.
        page.evaluate("GODETAIL.open('into')")
        page.wait_for_selector('#evd .ue-hero')
        chip = page.locator('#evd .ue-factchips li', has_text='Research').first.inner_text()
        m = re.search(r'(\d+) tasks?', chip)
        assert m, chip
        n = int(m.group(1))
        in_dom = page.locator('#evd #evd-s-research .research-task').count()
        assert n == in_dom and n > 0, (chip, in_dom)
        header = page.locator('#evd #evd-h-research').inner_text()
        assert f'{n} tasks' in header, header
        assert page.locator('#evd .evd-nav-link[data-sec="research"] .evd-nav-count').inner_text() == str(n)
        pc = page.locator('#evd .ue-pass-count').first.inner_text()
        assert re.search(r'\d+ of 600 ranks listed', pc), pc
        listed = int(re.match(r'(\d+) of', pc).group(1))
        assert listed >= 100, listed
        page.locator('#evd #evd-h-research').scroll_into_view_if_needed()
        page.evaluate('window.scrollBy(0, -110)')
        shot(page, f'accuracy-research-count-{width}')
        page.locator('#evd .ue-pass-count').first.scroll_into_view_if_needed()
        page.evaluate('window.scrollBy(0, -110)')
        shot(page, f'accuracy-gopass-total-{width}')
        assert not errors, errors
        context.close()
    browser.close()
print('accuracy fixes browser checks passed')
