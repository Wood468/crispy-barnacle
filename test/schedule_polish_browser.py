"""Schedule / Research polish: live order on Schedule, generic reward shapes, unclipped form-art note, banner crop.

Fixed 17 Nov 2026 Melbourne clock (Dynamax Trails, Cresselia/Darkrai, Mega Banette and Minior Showers are all live).
Run against a static server of /public on 127.0.0.1:8791. 320/375/390 px.
"""
import base64
import re
import struct
import zlib
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8791"


def png(w, h, rgb_top_left=(255, 0, 0), rgb=(30, 30, 30), mark=0.06):
    """A w x h PNG with a small red 'logo' square in the top-left corner."""
    mw, mh = int(w * mark), int(h * mark)
    raw = b""
    for y in range(h):
        row = b"".join(bytes(rgb_top_left if (x < mw and y < mh) else rgb) for x in range(w))
        raw += b"\x00" + row
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def new_context(browser, width):
    ctx = browser.new_context(viewport={"width": width, "height": 860}, timezone_id="Australia/Melbourne", locale="en-AU", service_workers="block", color_scheme="dark")
    ctx.route("**/api/**", lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type="application/json"))
    ctx.route(re.compile(r"^https://fonts\."), lambda r: r.fulfill(body="", content_type="text/css"))
    ctx.route(re.compile(r"^https://(lh3\.googleusercontent\.com|cdn\.leekduck\.com)/"), lambda r: r.abort())
    return ctx


with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (320, 375, 390):
        ctx = new_context(browser, width)
        page = ctx.new_page()
        page.clock.install(time="2026-11-17T12:00:00+11:00")
        page.goto(BASE + "/")
        page.wait_for_function("!!window.GODASH && GOEventRegistry.settled()")

        # A. Schedule > Happening now: larger events first (Trails, raid rotations, then Minior Showers).
        page.locator('nav.tabs button[data-tab="events"]').click()
        page.wait_for_selector("#evtimeline .evc")
        names = page.evaluate("""() => {
            const out = []; let on = false;
            for (const n of document.querySelectorAll('#evtimeline > *')) {
                if (n.matches('h2.sec2')) on = n.textContent.trim() === 'Happening now';
                else if (on) n.querySelectorAll('.evc h3, .evc .evc-name, .evc .nm').forEach(x => out.push(x.textContent.trim()));
            }
            return out;
        }""")
        if not names:
            names = page.evaluate("""() => { const h = [...document.querySelectorAll('#evtimeline h2.sec2')].find(x => x.textContent.trim() === 'Happening now'); const out = [];
                for (let n = h && h.nextElementSibling; n && !n.matches('h2,details'); n = n.nextElementSibling) out.push(n.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80)); return out; }""")
        joined = " | ".join(names)
        i_t, i_m = joined.find("Dynamax Trails"), joined.find("Minior")
        assert i_t >= 0 and i_m >= 0 and i_t < i_m, (width, "Trails must precede Minior Showers", joined)
        # Raid rotations are not in this tab's default list; when present they sit between the two.
        for k in ("Cresselia", "Banette"):
            i = joined.find(k)
            assert i < 0 or i_t < i < i_m, (width, k, joined)

        # B + C. Research tab of Dynamax Trails.
        page.evaluate("GODETAIL.open('dyntrails')")
        page.wait_for_selector("#evd .ue-hero")
        page.locator('#evd .evd-nav-link[data-sec="research"]').click()
        for nm, kind in (("Eternatus Candy", "candy"), ("Pinap Berry", "berry")):
            tile = page.locator("#evd-s-research .research-reward-item").filter(has=page.locator("b", has_text=re.compile(r"^(?:\d+× )?" + nm + "$"))).first
            tile.scroll_into_view_if_needed()
            g = tile.locator(f'.ue-reward-category[data-item-glyph="{kind}"] svg')
            assert g.count() == 1 and g.is_visible(), (width, nm, tile.inner_html())
            assert tile.locator(".ue-reward-dot, img").count() == 0, (width, nm, "dot or picture")
            box = g.bounding_box()
            assert box["width"] >= 20 and box["height"] >= 20, (width, nm, box)
        tile = page.locator("#evd-s-research .research-reward-encounter", has_text="Grookey").first
        tile.scroll_into_view_if_needed()
        m = tile.evaluate("""el => {
            const t = el.getBoundingClientRect(), text = el.querySelector(':scope > span:last-child'), after = getComputedStyle(text, '::after');
            const chip = el.querySelector('.form-chip'), c = chip && chip.getBoundingClientRect();
            return {tileW: t.width, textScrollW: text.scrollWidth, textClientW: text.clientWidth, afterContent: after.content, afterDisplay: after.display, afterWS: after.whiteSpace,
                    chipText: chip && chip.textContent, chipW: c && c.width, chipH: c && c.height};
        }""")
        assert m["afterContent"] == '"Form art unavailable"' and m["afterWS"] == "normal", (width, m)
        assert m["textScrollW"] <= m["textClientW"] + 1, (width, "note overflows its column", m)
        assert m["chipText"] == "Form art unavailable" and m["chipW"] <= 2 and m["chipH"] <= 2, (width, "full text kept, no clipped visible chip", m)
        doc = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert doc <= 2, (width, doc)

        # D. Banner crop: a 16:9 official-style image with a logo at the very top-left keeps its top edge.
        ctx.route("**/__banner.png", lambda r: r.fulfill(body=png(160, 90), content_type="image/png"))
        res = page.evaluate("""async () => {
            const card = document.createElement('div');
            card.innerHTML = '<article class="evc cmp" style="width:300px"><div class="evc-art"><span class="evc-banner"><img alt="" src="/__banner.png" width="320" height="160"></span></div></article>';
            document.body.appendChild(card);
            const img = card.querySelector('img'); await img.decode();
            const box = card.querySelector('.evc-banner').getBoundingClientRect(), pos = getComputedStyle(img).objectPosition.split(' ');
            const scale = box.width / img.naturalWidth, scaledH = img.naturalHeight * scale, overflow = Math.max(0, scaledH - box.height);
            const clippedTop = overflow * parseFloat(pos[1]) / 100;
            card.remove();
            return {ratio: box.width / box.height, scaledH, boxH: box.height, clippedTopPct: 100 * clippedTop / scaledH};
        }""")
        assert abs(res["ratio"] - 2) < 0.02, (width, res)
        assert res["clippedTopPct"] < 2, (width, "top edge cropped", res)
        print(f"PASS schedule polish {width}px: order, candy/berry shapes, Grookey note unclipped, banner top kept ({res['clippedTopPct']:.1f}% top crop on 16:9)")
        ctx.close()
    browser.close()
