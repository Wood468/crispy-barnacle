"""Focused browser regression for the two narrow-screen Schedule overflow defects.

The fixed 9 Oct 2026 Melbourne clock keeps World Space Week active, so its
Schedule card exercises the Details / Check infographic / star action footer.
The seven-day strip keeps 44px day targets and may scroll internally; the page
and event card must never grow wider than the viewport.
"""
import base64
import re
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8791"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")


def api(route):
    path = route.request.url.split("?", 1)[0]
    if path.endswith("/api/sources"):
        return route.fulfill(
            body='{"environment":"production","database":true,"enabled":false,"sources":[]}',
            content_type="application/json",
        )
    if path.endswith("/api/events"):
        return route.fulfill(body='{"enabled":false,"events":[]}', content_type="application/json")
    return route.fulfill(status=404, body="{}")


with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (320, 375, 390):
        context = browser.new_context(
            viewport={"width": width, "height": 844},
            timezone_id="Australia/Melbourne",
            locale="en-AU",
            service_workers="block",
            has_touch=True,
        )
        page = context.new_page()
        page.set_viewport_size({"width": width, "height": 844})
        page.set_default_timeout(15000)
        page.clock.install(time="2026-10-09T22:45:00+11:00")
        page.route(re.compile(r"^https://fonts\.(googleapis|gstatic)\.com/"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
        page.route("**/api/**", api)
        page.route(re.compile(r"/(img/ext|infographics)/"), lambda r: r.fulfill(body=PNG, content_type="image/png"))
        page.goto(BASE + "/", wait_until="domcontentloaded")
        page.wait_for_selector(".pc, .prio-empty", state="attached")
        page.wait_for_function("document.getElementById('home-now')?.hasAttribute('data-render-key')", timeout=30000)

        page.locator('nav.tabs button[data-tab="events"]').click()
        page.wait_for_selector("#tab-events:not([hidden])")
        timeline = page.locator('#subnav-events button[data-sub="timeline"]')
        if timeline.count():
            timeline.click()
        page.wait_for_selector(".wk-days")

        week = page.evaluate("""() => {
          const el = document.querySelector('#tab-events .wk-days');
          const days = [...el.querySelectorAll('.wd')];
          return {
            pageWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            weekClientWidth: el.clientWidth,
            weekScrollWidth: el.scrollWidth,
            dayWidths: days.map(day => day.getBoundingClientRect().width),
            dayHeights: days.map(day => day.getBoundingClientRect().height)
          };
        }""")
        assert week["viewportWidth"] == width, f"browser did not apply the requested {width}px CSS viewport: {week}"
        assert week["pageWidth"] <= week["viewportWidth"], f"{width}px Schedule page overflow: {week}"
        assert all(w >= 44 for w in week["dayWidths"]), f"{width}px day target narrower than 44px: {week}"
        assert all(h >= 44 for h in week["dayHeights"]), f"{width}px day target shorter than 44px: {week}"
        assert week["weekClientWidth"] <= week["viewportWidth"], f"{width}px week strip exceeds viewport: {week}"

        page.wait_for_function("""() => Array.from(document.querySelectorAll('#tab-events .evc.cmp')).some(card =>
          card.querySelector('.evc-foot .star') &&
          Array.from(card.querySelectorAll('.evc-foot .more')).some(button =>
            /Check infographic/i.test(button.textContent || '')
          )
        )""", timeout=20000)
        footer = page.evaluate("""() => {
          const card = [...document.querySelectorAll('#tab-events .evc.cmp')].find(el =>
            el.getBoundingClientRect().width > 0 &&
            el.getBoundingClientRect().height > 0 &&
            el.querySelector('.evc-foot .star') &&
            [...el.querySelectorAll('.evc-foot .more')].some(button => /Check infographic/i.test(button.textContent || ''))
          );
          const foot = card.querySelector('.evc-foot');
          const actions = [...foot.querySelectorAll('.more, .star')];
          return {
            pageWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            cardRight: card.getBoundingClientRect().right,
            footerClientWidth: foot.clientWidth,
            footerScrollWidth: foot.scrollWidth,
            display: getComputedStyle(foot).display,
            flexWrap: getComputedStyle(foot).flexWrap,
            actions: actions.map(el => {
              const r = el.getBoundingClientRect();
              return { label: (el.textContent || el.getAttribute('aria-label') || '').trim(), width: r.width, height: r.height };
            })
          };
        }""")
        assert footer["pageWidth"] <= footer["viewportWidth"], f"{width}px page overflow with live event card: {footer}"
        assert footer["cardRight"] <= width + 1, f"{width}px event card exceeds viewport: {footer}"
        assert footer["footerScrollWidth"] <= footer["footerClientWidth"] + 1, f"{width}px footer content overflows instead of wrapping: {footer}"
        assert footer["display"] == "flex" and footer["flexWrap"] == "wrap", f"{width}px footer is not wrapping flex: {footer}"
        assert all(a["width"] >= 44 and a["height"] >= 44 for a in footer["actions"]), f"{width}px action target below 44px: {footer}"
        print(f"PASS Schedule narrow layout {width}px: contained week strip, no page/card/footer overflow, 44px targets")

        context.close()
    browser.close()
