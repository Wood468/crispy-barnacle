"""Final polish: shared hit targets, focus ring, long names, loading/error/offline states, stale infographic label.

Fixed Sydney clock 9 Nov 2026, dark. Chromium by default, WebKit with GO_FIELD_NOTES_TEST_BROWSER=webkit.
The offline reload of every tab runs in Chromium only (WebKit offline is covered by test/pwa_upgrade_browser.py).
Set GO_FIELD_NOTES_SCREENSHOTS to keep screenshots.
"""
import json
import os
import re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('GO_FIELD_NOTES_BATTLE_URL', 'http://127.0.0.1:8791')
SHOTS = os.environ.get('GO_FIELD_NOTES_SCREENSHOTS')
ENGINE = os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')
if SHOTS:
    os.makedirs(SHOTS, exist_ok=True)
fails = []


def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (' ' + str(extra) if extra and not cond else ''))
    if not cond:
        fails.append(name)


def ctx_for(browser, width, sw='block', routes=True):
    ctx = browser.new_context(viewport={'width': width, 'height': 860}, timezone_id='Australia/Sydney',
                              service_workers=sw, color_scheme='dark')
    if routes:
        ctx.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
        ctx.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
    return ctx


def open_page(ctx):
    page = ctx.new_page()
    page.clock.install(time='2026-11-09T21:00:00+11:00')
    page.goto(BASE + '/')
    page.wait_for_function('!!window.GODASH')
    page.wait_for_function('document.querySelector("#today-v1 .t1-card")', timeout=20000)
    return page


with sync_playwright() as p:
    browser = getattr(p, ENGINE).launch()
    for width in (360, 390, 430):
        page = open_page(ctx_for(browser, width))
        # Opportunity cards: names wrap by word, the chip never squeezes a name into broken words.
        page.evaluate("GO.showTab('collect','opps')")
        page.wait_for_selector('.opp h3')
        broken = page.evaluate("""()=>[...document.querySelectorAll('.opp-top h3')].filter(h=>{
            const r=document.createRange();r.selectNodeContents(h);return h.scrollWidth>h.clientWidth+1}).length""")
        check(f'{width}: opportunity names never overflow their column', broken == 0, broken)
        one_word = page.evaluate("""()=>[...document.querySelectorAll('.opp-top h3')].filter(h=>{
            const t=h.textContent.trim().split(/\\s+/);if(t.length!==1)return false;
            const lh=parseFloat(getComputedStyle(h).lineHeight)||20;return h.getBoundingClientRect().height>lh*1.6}).length""")
        check(f'{width}: single-word opportunity names stay on one line', one_word == 0, one_word)
        # Mega rows: the name keeps its width next to the art and shiny fallback badge.
        page.evaluate("GO.showTab('collect','megas')")
        page.wait_for_selector('.mega-row')
        overlap = page.evaluate("""()=>[...document.querySelectorAll('.mega-row .mega-mon')].slice(0,12).filter(m=>{
            const n=m.querySelector('.mega-name').getBoundingClientRect(),s=m.querySelector('.mega-shiny');
            if(!s)return false;const r=s.getBoundingClientRect();return n.right>r.left+1&&n.left<r.right-1}).length""")
        check(f'{width}: Mega names do not sit under the shiny badge', overlap == 0, overlap)
        # Touch targets for the inline links that used to be 14-19px tall.
        page.evaluate("GO.showTab('events','world')")
        page.wait_for_timeout(300)
        small = page.evaluate("""()=>[...document.querySelectorAll('#sub-world li > b > a')].filter(a=>{
            const r=a.getBoundingClientRect();return r.width&&r.height&&r.height<44}).length""")
        check(f'{width}: world event links have a 44px hit area', small == 0, small)
        # Keyboard focus is visible on the primary navigation.
        page.focus('nav.tabs button[data-tab="raids"]')
        page.keyboard.press('Tab')
        outline = page.evaluate("(()=>{const a=document.activeElement;return a?getComputedStyle(a).outlineStyle+' '+getComputedStyle(a).outlineWidth:''})()")
        check(f'{width}: focused control shows a focus ring', outline.startswith('solid') or outline.startswith('auto'), outline)
        page.evaluate("GO.showTab('now')")
        check(f'{width}: Infographics header uses the shared section style',
              page.evaluate("getComputedStyle(document.querySelector('#weekly-title')).textTransform") in ('uppercase', 'none'))
        check(f'{width}: no horizontal scroll', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        if SHOTS:
            page.screenshot(path=f'{SHOTS}/polish-{width}.png')
        page.context.close()

    # A weekly picture published last week is labelled as such, not presented as this week's.
    ctx = ctx_for(browser, 390)
    ctx.route('**/weekly.json*', lambda r: r.fulfill(content_type='application/json', body=json.dumps({'items': [
        {'kind': 'week', 'image': '/infographics/x.png', 'title': 'Week', 'publishedAt': '2026-11-02T00:00:00Z'}]})))
    page = open_page(ctx)
    page.wait_for_selector('.weekly-card')
    txt = page.inner_text('.weekly-card')
    check('stale weekly picture says it has not been updated yet', 'not updated yet' in txt and 'Published' in txt, txt)
    ctx.close()

    # A failed load shows one error panel, not an error next to a stale "Getting your day ready" line.
    ctx = ctx_for(browser, 390)
    ctx.route(re.compile(r'/data\.json'), lambda r: r.abort())
    page = ctx.new_page()
    page.goto(BASE + '/')
    page.wait_for_selector('#load-error:not([hidden])', timeout=20000)
    visible_loading = page.evaluate("""()=>{const l=document.querySelector('#today-v1 .t1-loading');
        return !!l&&getComputedStyle(l).display!=='none'}""")
    check('load error hides the stale loading line', not visible_loading)
    check('load error offers Try again', page.locator('#load-retry').is_visible())
    ctx.close()

    # Offline: every main tab still renders from the cache (Chromium; WebKit offline is in pwa_upgrade_browser.py).
    if ENGINE == 'chromium':
        ctx = ctx_for(browser, 390, sw='allow', routes=False)
        ctx.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
        ctx.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
        page = ctx.new_page()
        page.goto(BASE + '/')
        page.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.ready.then(()=>true)', timeout=20000)
        page.reload()
        page.wait_for_function('!!window.GODASH && document.querySelector("#today-v1 .t1-card")', timeout=20000)
        ctx.set_offline(True)
        page.reload()
        page.wait_for_function('!!window.GODASH', timeout=20000)
        for tab in ('now', 'events', 'raids', 'collect'):
            page.click(f'nav.tabs button[data-tab="{tab}"]')
            page.wait_for_timeout(400)
            n = page.evaluate("document.querySelector('.panel:not([hidden])').innerText.trim().length")
            err = page.evaluate("!document.getElementById('load-error').hidden")
            check(f'offline reload: {tab} tab renders cached content', n > 80 and not err, (n, err))
        ctx.close()
    browser.close()

print('FAILED:', ', '.join(fails) if fails else 'none')
raise SystemExit(1 if fails else 0)
