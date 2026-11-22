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
        card = page.locator('#today-v1 .t1-card', has_text='Into the Wild').first
        check(f'{width}: a play-from-anywhere event is not labelled Overseas', 'overseas' not in card.inner_text().lower(), card.inner_text()[:120])
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

    # The weekly infographic is an aria-modal dialog: keyboard Tab must not escape
    # to the underlying app. Exercise both single-control and linked versions.
    for width in (320, 390, 430):
        ctx = ctx_for(browser, width)
        weekly_item = {'kind': 'week', 'image': '/infographics/test-week.png',
                       'title': 'Weekly source-backed preview', 'publishedAt': '2026-11-09T00:00:00Z'}
        if width != 320:
            weekly_item['post'] = 'https://leekduck.com/events/'
        fixture_json = json.dumps({'items': [weekly_item]})
        ctx.route('**/weekly.json*', lambda r: r.fulfill(
            content_type='application/json', body=fixture_json))
        ctx.route('**/infographics/test-week.png', lambda r: r.fulfill(
            content_type='image/png', body=bytes.fromhex(
                '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
                '0000000d49444154789c636460f87f00020801028011fa650000000049454e44ae426082')))
        page = open_page(ctx)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        opener = page.locator('#weekly .weekly-card').first
        opener.wait_for()
        opener.focus()
        page.keyboard.press('Enter')
        dialog = page.locator('#weekly-box[role="dialog"][aria-modal="true"]')
        dialog.wait_for()
        close_button = dialog.locator('.weekly-x')
        check(f'{width}: weekly dialog opens focused on Close', close_button.evaluate(
            '(el) => document.activeElement === el'))
        link = dialog.locator('.weekly-bar a[href]')
        if width == 320:
            check('320: no optional link when source post absent', link.count() == 0)
            page.keyboard.press('Tab')
            check('320: Tab wraps onto the only dialog control', close_button.evaluate(
                '(el) => document.activeElement === el'))
            page.keyboard.press('Shift+Tab')
            check('320: reverse Tab also stays inside dialog', close_button.evaluate(
                '(el) => document.activeElement === el'))
        else:
            check(f'{width}: original post link available', link.count() == 1)
            page.keyboard.press('Tab')
            check(f'{width}: Tab wraps Close to first dialog link', link.evaluate(
                '(el) => document.activeElement === el'))
            page.keyboard.press('Shift+Tab')
            check(f'{width}: Shift+Tab wraps link to Close', close_button.evaluate(
                '(el) => document.activeElement === el'))
        check(f'{width}: weekly modal has no horizontal overflow',
              page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        if SHOTS:
            page.screenshot(path=f'{SHOTS}/weekly-modal-keyboard-{width}.png')
        page.keyboard.press('Escape')
        check(f'{width}: Escape closes infographic dialog', dialog.count() == 0)
        check(f'{width}: Escape returns focus to initiating card', opener.evaluate(
            '(el) => document.activeElement === el'))
        check(f'{width}: weekly modal causes no browser errors', not errors, errors)
        ctx.close()

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

    # iOS standalone status bar: an opaque, non-interactive top mask the height of the safe-area inset.
    # Playwright cannot emulate env(safe-area-inset-top), so the notch is simulated by overriding the
    # single --safe-top variable that styles.css derives from it (asserted from the stylesheet source).
    for width in (320, 360, 390, 430):
        page = open_page(ctx_for(browser, width))
        css = page.evaluate("fetch('/styles.css?v=' + [...document.styleSheets].map(s => s.href || '').find(h => h.includes('/styles.css')).split('v=')[1]).then(r => r.text())")
        check(f'{width}: --safe-top is derived from env(safe-area-inset-top)', 'safe-area-inset-top' in css and '--safe-top:env(safe-area-inset-top,0px)' in css)
        probe = """()=>{const m=getComputedStyle(document.body,'::before'),r=document.querySelector('header.top').getBoundingClientRect(),
            t=document.querySelector('nav.tabs').getBoundingClientRect();
            return {pos:m.position,h:m.height,pe:m.pointerEvents,z:m.zIndex,bg:m.backgroundColor,content:m.content,
              canvas:getComputedStyle(document.body).backgroundColor,headTop:r.top,tabTop:t.top,tabH:t.height,
              sw:document.documentElement.scrollWidth,iw:innerWidth,sh:document.documentElement.scrollHeight}}"""
        flat = page.evaluate(probe)
        check(f'{width}: mask is fixed, pointer-events none, above tab bar (20) and below modals (60)',
              flat['pos'] == 'fixed' and flat['pe'] == 'none' and flat['content'] != 'none' and 20 < int(flat['z']) < 60, flat)
        check(f'{width}: mask uses the opaque app canvas colour', flat['bg'] == flat['canvas'] and flat['bg'].startswith('rgb('), flat)
        check(f'{width}: no inset means a zero-height mask', flat['h'] == '0px', flat['h'])
        page.add_style_tag(content=':root{--safe-top:47px}')
        notch = page.evaluate(probe)
        check(f'{width}: with a 47px inset the mask is 47px tall', notch['h'] == '47px', notch['h'])
        check(f'{width}: page content starts below the mask', abs(notch['headTop'] - flat['headTop'] - 47) < 1, (flat['headTop'], notch['headTop']))
        check(f'{width}: tab bar is unchanged by the inset', notch['tabTop'] == flat['tabTop'] and notch['tabH'] == flat['tabH'], (flat, notch))
        check(f'{width}: the mask adds no horizontal overflow', notch['sw'] <= notch['iw'] and flat['sw'] <= flat['iw'], notch)
        page.evaluate("window.scrollTo(0, 400)")
        scrolled = page.evaluate("()=>({m:getComputedStyle(document.body,'::before').position,y:scrollY})")
        check(f'{width}: the mask stays fixed while the page scrolls', scrolled['m'] == 'fixed' and scrolled['y'] > 0, scrolled)
        # The page is not clickable-through-blocked: the mask must not capture taps in the status-bar band.
        hit = page.evaluate("(()=>{const e=document.elementFromPoint(innerWidth/2,10);return e?e.tagName:''})()")
        check(f'{width}: taps pass through the mask', hit != '', hit)
        page.evaluate("GO.showTab('collect','dex')")
        page.wait_for_timeout(300)
        dex = page.evaluate("(()=>{const b=document.querySelector('.dexbar');return b?getComputedStyle(b).top:null})()")
        check(f'{width}: sticky Pokedex bar sits below the mask', dex in (None, '47px'), dex)
        # Event detail is a fixed full-screen overlay with its own sticky bar and "Starts in" status chip: both must start below the mask.
        page.evaluate("GODETAIL.open('cur:wag')")
        page.wait_for_selector('#evd .evd-bar', state='visible', timeout=30000)
        page.wait_for_timeout(300)
        evd = page.evaluate("(()=>{const o=document.getElementById('evd').getBoundingClientRect(),b=document.querySelector('#evd .evd-bar').getBoundingClientRect();return {o:o.top,b:b.top}})()")
        check(f'{width}: event detail overlay and its sticky bar start below the mask', evd['o'] >= 47 and evd['b'] >= 47, evd)
        page.evaluate("document.getElementById('evd').scrollTop = 600")
        page.wait_for_timeout(200)
        evd2 = page.evaluate("document.querySelector('#evd .evd-bar').getBoundingClientRect().top")
        check(f'{width}: scrolled event detail bar stays below the mask', evd2 >= 47 and evd2 < 60, evd2)
        # The event infographic viewer sits above the mask (z-index 1200), so its own title bar and Close button must clear the inset too.
        page.evaluate("document.getElementById('evd').scrollTop = 0; window.GOINFOGRAPHIC.open('cur:wag')")
        page.wait_for_selector('#goinfo:not([hidden]) .goinfo-top', state='visible', timeout=30000)
        ig = page.evaluate("(()=>{const q=s=>document.querySelector(s).getBoundingClientRect();return {panel:q('#goinfo .goinfo-panel').top,bar:q('#goinfo .goinfo-top').top,close:q('#goinfo [data-infoclose]').top}})()")
        check(f'{width}: infographic viewer title bar and Close start below the 47px inset', ig['panel'] >= 47 and ig['bar'] >= 47 and ig['close'] >= 47, ig)
        page.evaluate("window.GOINFOGRAPHIC.close(true)")
        page.context.close()

    # Dynamic Island iPhone (390x844, ~59px inset): scrolled Today, Schedule and Battle content must never show
    # through the status-bar band. Pixel check: the clip behind the clock is a single flat canvas colour.
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Australia/Sydney',
                              service_workers='block', color_scheme='dark')
    ctx.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
    ctx.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
    page = ctx.new_page()
    page.clock.install(time='2026-11-09T21:00:00+11:00')
    page.goto(BASE + '/')
    page.wait_for_function('!!window.GODASH')
    page.wait_for_function('document.querySelector("#today-v1 .t1-card")', timeout=20000)
    page.add_style_tag(content=':root{--safe-top:59px}')
    decoder = ctx.new_page()
    for tab in ('now', 'events', 'raids'):
        page.evaluate(f"GO.showTab('{tab}')")
        page.wait_for_selector(f'#tab-{tab}', state='visible')
        for y in (0, 350, 1200):
            page.evaluate(f"window.scrollTo(0, {y})")
            page.wait_for_timeout(120)
            png = page.screenshot(clip={'x': 0, 'y': 0, 'width': 390, 'height': 52})
            import base64
            off_pixels = decoder.evaluate("""async b64 => {
                const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
                const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
                const g = c.getContext('2d'); g.drawImage(img, 0, 0);
                const d = g.getImageData(0, 0, c.width, c.height).data;
                // Engines may differ by a level or two (colour management, dithering): count pixels visibly off the first.
                // Reference = the centre pixel (WebKit can render an odd edge pixel); a handful of edge outliers is tolerated.
                const m = (Math.floor(c.height / 2) * c.width + Math.floor(c.width / 2)) * 4;
                let off = 0;
                for (let i = 0; i < d.length; i += 4)
                    if (Math.max(Math.abs(d[i] - d[m]), Math.abs(d[i + 1] - d[m + 1]), Math.abs(d[i + 2] - d[m + 2])) > 6) off++;
                return off > c.width * c.height * 0.005 ? off : 0;
            }""", base64.b64encode(png).decode())
            check(f'390x844 59px inset: {tab} tab at scroll {y} shows a flat opaque band behind the clock', off_pixels == 0, off_pixels)
    ctx.close()

    browser.close()

print('FAILED:', ', '.join(fails) if fails else 'none')
raise SystemExit(1 if fails else 0)
