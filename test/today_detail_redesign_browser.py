"""Visual geometry and interaction regression for Today and universal event details.

WebKit CI retains screenshots at each supported phone width for review.
"""
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8791/'
OUT = Path(os.environ.get('GO_FIELD_NOTES_SCREENSHOTS', '/tmp/gofn-redesign-screenshots'))
OUT.mkdir(parents=True, exist_ok=True)
ENGINE = os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')

with sync_playwright() as p:
    browser = getattr(p, ENGINE).launch()
    for width in (320, 375, 390, 430):
        context = browser.new_context(viewport={'width': width, 'height': 844},
                                      timezone_id='Australia/Melbourne', service_workers='block')
        context.route('**/api/**', lambda r: r.fulfill(
            body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
        context.route(re.compile(r'^https://fonts\.'),
                      lambda r: r.fulfill(body='', content_type='text/css'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.clock.install(time='2026-11-06T12:00:00+11:00')
        page.goto(BASE)
        page.wait_for_selector('#today-v1 .t1-card')
        heads = page.locator('#today-v1 .t1-sec-head h2, #today-v1 .t1-h-main').all_inner_texts()
        assert heads[0].lower() == 'today at a glance' and 'happening now' in [h.lower() for h in heads], heads
        assert page.locator('#today-v1 .t1-tile').count() == 3
        assert page.locator('#today-v1 .t1-card').count() > 0
        page.wait_for_function("document.querySelector('#today-v1').innerText.toLowerCase().includes('overseas')", timeout=8000)
        assert page.locator('#today-v1 .t1-place em, #today-v1 .t1-reg').count() > 0, 'overseas in-person events must stay visible and labelled'
        assert not page.locator('#today-v1 [data-follow],#today-v1 [data-mark],#today-v1 .own').count()
        assert not page.locator('#foryou-sec').is_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        menu_boxes = page.evaluate("[...document.querySelectorAll('#today-v1 .t1-more')].slice(0,3).map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height}})")
        assert menu_boxes and all(b['width'] >= 43.5 and b['height'] >= 43.5 for b in menu_boxes), menu_boxes
        page.screenshot(path=str(OUT / f'redesign-today-{width}.png'))

        before = page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})")
        page.locator('#today-v1 .t1-place').first.locator('xpath=ancestor::article//button[@data-open]').click()
        page.wait_for_selector('#evd .ue-hero')
        assert 'Sendai' in page.locator('#evd-t').inner_text()
        shortcut = page.locator('#evd .evd-infographic-shortcut')
        assert shortcut.count() == 1, 'Event Details has one poster shortcut slot'
        assert shortcut.get_attribute('data-infographic'), 'The poster action is bound to an event'
        if shortcut.is_visible():
            assert shortcut.bounding_box()['height'] >= 43.5, 'Visible poster action must be thumb-sized'
            shortcut.click()
            page.wait_for_selector('#goinfo:not([hidden]) [role="dialog"]')
            page.keyboard.press('Escape')
            assert page.locator('#evd').is_visible(), 'Closing an infographic returns to Event Details'
        assert page.locator('#evd .ue-mon').count() > 0
        assert page.locator('#evd .ue-gallery').count() > 0
        assert page.locator('#evd .own,#evd [data-follow],#evd [data-mark],#evd .ue-mon-controls').count() == 0
        assert page.evaluate('document.querySelector("#evd").scrollWidth <= innerWidth')
        # The top of Event Details stays compact at every mobile width.
        # All debut forms remain available by horizontal scrolling, never
        # truncated or replaced by a summary count.
        glance = page.evaluate("""() => {
            const stats = document.querySelector('#evd .ue-factchips');
            const debut = document.querySelector('#evd .ue-debuts .ue-chips');
            return {
                stats: stats?.children.length,
                columns: stats ? getComputedStyle(stats).gridTemplateColumns.split(' ').length : 0,
                debutCount: debut?.children.length,
                debutScrollable: debut ? debut.scrollWidth > debut.clientWidth : false,
                debutKeyboard: debut?.tabIndex === 0,
                debutRole: debut?.getAttribute('role'),
                debutOverflow: debut ? getComputedStyle(debut).overflowX : '',
            };
        }""")
        assert glance['stats'] == 3 and glance['columns'] == 3, (width, glance)
        assert glance['debutCount'] >= 5, (width, glance)
        assert glance['debutScrollable'] and glance['debutKeyboard'] and glance['debutRole'] == 'region', (width, glance)
        assert glance['debutOverflow'] == 'auto', (width, glance)
        page.screenshot(path=str(OUT / f'redesign-detail-{width}.png'))

        # Continuous page: every section is in the document, nav links (not tabs) scroll to headings.
        nav = page.locator('#evd nav.evd-nav[aria-label="Event sections"]')
        links = nav.locator('.evd-nav-link')
        assert links.count() >= 3 and page.locator('#evd [role=tablist],#evd [role=tabpanel],#evd [hidden].evd-sec').count() == 0
        assert page.locator('#evd section.evd-sec').count() == links.count()
        assert links.first.get_attribute('aria-current') == 'true' and page.locator('#evd .evd-nav-link[aria-current="true"]').count() == 1
        def stack_bottom():
            return page.evaluate("document.querySelector('#evd .evd-nav').getBoundingClientRect().bottom")
        def active():
            return page.evaluate("document.querySelector('#evd .evd-nav-link[aria-current=\"true\"]').dataset.sec")
        def scroll_idle(limit=6000):
            # Smooth scrolling takes as long as the machine lets it (WebKit under CI load is the slow case): wait for the scroll position to stop moving
            # for several consecutive frames instead of sleeping a fixed time, so the assertion never races the animation.
            page.wait_for_function('''() => { const o = document.querySelector('#evd'); const now = o.scrollTop;
                const prev = window.__scrollPrev; window.__scrollPrev = now;
                window.__scrollStill = prev === now ? (window.__scrollStill || 0) + 1 : 0; return window.__scrollStill >= 8; }''', timeout=limit, polling='raf')
            page.evaluate('window.__scrollPrev = undefined; window.__scrollStill = 0')
        def tap(sec):
            page.evaluate('window.__scrollPrev = undefined; window.__scrollStill = 0')
            page.locator(f'#evd .evd-nav-link[data-sec="{sec}"]').click(); page.wait_for_timeout(120); scroll_idle()
            top = page.evaluate(f"document.querySelector('#evd-h-{sec}').getBoundingClientRect().top")
            maxed = page.evaluate("(()=>{const o=document.querySelector('#evd');return o.scrollTop+o.clientHeight>=o.scrollHeight-4})()")
            assert maxed or top >= stack_bottom() - 2, (sec, top, stack_bottom())
            assert active() == sec, (sec, active())
        sections = page.evaluate("[...document.querySelectorAll('#evd .evd-sec')].map(s=>s.dataset.sec)")
        assert 'encounters' in sections and 'research' in sections
        tap('encounters'); tap('research')
        # Scrolling (not tapping) updates the active link, including deep inside a long gallery and at the very bottom.
        # The overlay uses smooth scrolling, so a programmatic scrollTop animates: wait for it to stop, then for the link to follow (never a fixed sleep).
        def scroll_to(expr):
            page.evaluate('window.__scrollPrev = undefined; window.__scrollStill = 0')
            page.evaluate("(()=>{const o=document.querySelector('#evd');" + expr + "})()")
            page.wait_for_timeout(60); scroll_idle()
        def expect_active(sec):
            try:
                page.wait_for_function('(s) => document.querySelector("#evd .evd-nav-link[aria-current=true]").dataset.sec === s', arg=sec, timeout=6000)
            except Exception:
                pass
            assert active() == sec, (sec, active())
        scroll_to("const s=document.querySelector('#evd-s-encounters');o.scrollTop=s.offsetTop+s.offsetHeight*0.6;")
        expect_active('encounters')
        # Deep inside the long research list the active link stays Research.
        scroll_to("const s=document.querySelector('#evd-s-research');o.scrollTop=s.offsetTop+s.offsetHeight*0.7;")
        expect_active('research')
        scroll_to("o.scrollTop=o.scrollHeight;")
        expect_active(sections[-1])
        scroll_to("o.scrollTop=0;")
        expect_active(sections[0])
        # Reduced motion: the jump is immediate.
        page.emulate_media(reduced_motion='reduce')
        page.locator('#evd .evd-nav-link[data-sec="research"]').click(); page.wait_for_timeout(250)
        assert abs(page.evaluate("document.querySelector('#evd-h-research').getBoundingClientRect().top") - stack_bottom()) < 40 and active() == 'research'
        page.emulate_media(reduced_motion='no-preference')
        page.locator('#evd .evd-nav-link[data-sec="overview"]').click(); page.wait_for_timeout(1200)
        assert page.evaluate('document.querySelector("#evd").scrollWidth <= innerWidth')
        page.locator('#evd .evd-nav-link[data-sec="encounters"]').click(); page.wait_for_timeout(1000)
        assert page.locator('#evd .ue-mon').first.bounding_box()['height'] >= 43.5
        page.locator('#evd .ue-mon').first.click()
        assert page.locator('#ue-sheet [role=dialog]').count() == 1
        page.keyboard.press('Escape')
        assert page.locator('#ue-sheet').count() == 0 and page.locator('#evd').is_visible()
        assert page.evaluate('document.activeElement.classList.contains("ue-mon")')
        page.locator('#evd .evd-nav-link[data-sec="research"]').click(); page.wait_for_timeout(1000)
        assert page.locator('#evd .research-task').count() == 12
        assert page.locator('#evd .research-reward').count() > 12
        assert page.locator('#evd .research-reward-item .ue-reward-item-icon').count() > 0
        assert page.locator('#evd .rs-rewards .ue-reward-item-icon img[src^="/ico/"]').count() > 0, 'verified item icons replace the generic placeholder'
        assert page.evaluate("[...document.querySelectorAll('#evd .rs-rewards .research-reward b')].every(b=>getComputedStyle(b).wordBreak!=='break-all'&&getComputedStyle(b).overflowWrap!=='anywhere')")
        assert page.locator('#evd .ue-bonuses .ue-bonus').count() > 0 and page.locator('#evd .ue-notes .ue-note').count() > 0, 'bonuses and conditions are visually separate'
        page.screenshot(path=str(OUT / f'redesign-research-{width}.png'))
        assert page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})") == before
        page.keyboard.press('Escape')
        page.evaluate("GODETAIL.open('cur:gopassnov')")
        page.wait_for_selector('#evd .evd-nav-link[data-sec="passes"]')
        page.wait_for_selector('#evd .ue-pass-range')
        page.locator('#evd .ue-pass-range').first.locator('summary').click()
        assert page.locator('#evd .ue-pass-stages > li').count() >= 90
        assert page.locator('#evd .ue-mon-controls,#evd [data-follow]').count() == 0
        assert page.evaluate('document.querySelector("#evd").scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT / f'redesign-gopass-{width}.png'))
        page.keyboard.press('Escape')
        # Release UX contract: every event detail is informational, not a second
        # collection tracker. Check both featured events, not only Sendai.
        for event_id in ('into', 'cur:wag'):
            page.evaluate("(id) => GODETAIL.open(id)", event_id)
            page.wait_for_selector('#evd .ue-hero')
            assert page.locator('#evd .ue-mon-controls,#evd [data-follow],#evd [data-mark],#evd .own').count() == 0, (width, event_id, 'unexpected tracking control')
            assert page.evaluate('document.querySelector("#evd").scrollWidth <= innerWidth'), (width, event_id, 'horizontal overflow')
        page.keyboard.press('Escape')
        assert errors == [], errors
        print(f'PASS {ENGINE} Today and detail redesign {width}px: visual geometry, sections, research, pass, read-only collection')
        context.close()
    browser.close()
