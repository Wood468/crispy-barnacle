"""Store PR-head visual contract with synthetic, non-owner prices only.

Run against the real static application served on localhost:8791. No owner API
response, credentials or actual regional price data enter CI artifacts.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8791"
OUT = Path("/tmp/gofn-store-visual")
OUT.mkdir(parents=True, exist_ok=True)
FIXTURE = {
    "owner": True,
    "prices": [
        {"product": "store-synthetic-ticket", "label": "Synthetic Test Ticket",
         "group": "Tickets", "currency": "AUD", "amount": 9.99,
         "region": "AU", "verified": True, "observed": "2026-11-01"},
        {"product": "store-synthetic-max-potion", "label": "Max Potions x10",
         "group": "Items", "currency": "AUD", "amount": 5.99,
         "region": "AU", "verified": True, "observed": "2026-11-01"},
        {"product": "store-synthetic-unmapped", "label": "Synthetic Unmapped Item",
         "group": "Items", "currency": "AUD", "amount": 3.49,
         "region": "AU", "verified": True, "observed": "2026-11-01"},
        {"product": "store-synthetic-october-pass", "label": "GO Pass Deluxe: October",
         "group": "Tickets", "currency": "AUD", "amount": 12.99,
         "region": "AU", "verified": True, "observed": "2026-10-12"}
    ],
    "regional": [
        {"id": "synthetic-id-ticket", "product": "Synthetic Test Ticket",
         "kind": "ticket", "region": "ID", "channel": "web",
         "currency": "IDR", "amount": 76000, "observed": "2026-11-01",
         "source": "synthetic-test-only", "status": "verified"},
        {"id": "synthetic-in-ticket", "product": "Synthetic Test Ticket",
         "kind": "ticket", "region": "IN", "channel": "in-app",
         "currency": "INR", "amount": 439, "observed": "2026-11-01",
         "source": "synthetic-test-only", "status": "recorded"},
        {"id": "synthetic-id-sept", "product": "GO Pass Deluxe: September",
         "kind": "monthly-pass", "region": "ID", "channel": "web",
         "currency": "IDR", "amount": 76000, "observed": "2026-11-01",
         "source": "synthetic-test-only", "status": "verified"},
        {"id": "synthetic-in-sept", "product": "GO Pass Deluxe: September",
         "kind": "monthly-pass", "region": "IN", "channel": "in-app",
         "currency": "INR", "amount": 439, "observed": "2026-11-01",
         "source": "synthetic-test-only", "status": "verified"}
    ],
}
# Fixed product identities but a fresh synthetic observation timestamp so
# future releases keep testing the same transition without relying on November
# 2026 continuing to be on sale.
SEEN = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
SOURCE_IMAGE = ("https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/"
                "v1/sku_assets/bundle3.sprite.a-da6f21e79d79/w256.webp")
def listing(name, retired=False):
    return {"name": name, "image": SOURCE_IMAGE, "lastSeen": SEEN,
            "endsAt": None, "goneAt": SEEN if retired else None}
SOURCE_FIXTURE = {
    "version": 1, "updated": SEEN,
    "items": [listing("Synthetic Test Ticket"), listing("GO Pass Deluxe: November")],
    "gone": [listing("GO Pass Deluxe: October", retired=True)]
}
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (320, 360, 390, 430):
        context = browser.new_context(viewport={"width": width, "height": 844},
                                      service_workers="block", locale="en-AU")
        page = context.new_page()
        page.route("**/api/**", lambda route: route.fulfill(status=404, body="{}"))
        page.route("**/store-current-snapshot.json",
                   lambda route: route.fulfill(status=200, content_type="application/json",
                                               body=json.dumps(SOURCE_FIXTURE)))
        page.goto(BASE, wait_until="domcontentloaded")
        # The regional Store is rendered inside the Events timeline panel.
        # Activate that real app surface before checking visibility or layout.
        page.locator('nav.tabs button[data-tab="events"]').click()
        page.wait_for_selector("#tab-events:not([hidden])")
        page.wait_for_selector("#sub-timeline:not([hidden])")
        page.wait_for_function("Boolean(window.GOLIB && window.GORegionalPrices && window.GOStoreOfferIdentities && window.GOStoreFX)")
        # Replace the private loader before rerunning the real Store renderer.
        # Only synthetic data is rendered or saved to the artifact.
        page.evaluate("""fixture => {
            window.GOLIB.loadPrices = async () => fixture;
            // Deterministic synthetic FX, no private prices or network.
            window.GOStoreFX.retrieve = async () => window.GOStoreFX.fromApi({
                result: 'success', base_code: 'AUD',
                time_last_update_unix: Date.parse('2026-11-12T00:00:00Z') / 1000,
                rates: {IDR: 11000, INR: 60}
            }, Date.parse('2026-11-13T00:00:00Z'));
            if (!document.getElementById('evsource')) {
                const host = document.createElement('div');
                host.id = 'evsource';
                document.body.appendChild(host);
            }
        }""", FIXTURE)
        page.add_script_tag(url="/store.js?v=20261115c-nianticimg")
        # Wait for attachment first: the product may live in a collapsed category.
        target = ".storep-regional [data-sp-name*='synthetic test ticket']"
        page.wait_for_selector(target, state="attached")
        # The real price-free Store snapshot must separate retired exact offers
        # from current official listings, and use their own Niantic SKU art.
        listing = page.evaluate("""() => {
            const cards = [...document.querySelectorAll('.sp-product')];
            const named = n => cards.find(x => x.querySelector('.sp-name')?.textContent === n);
            const october = named('GO Pass Deluxe: October');
            const november = named('GO Pass Deluxe: November');
            const octoberGroup = october?.closest('[data-sp-group]');
            return {
                octoberStatus: october?.getAttribute('data-sp-listing'),
                octoberGroup: octoberGroup?.getAttribute('data-sp-group'),
                novemberStatus: november?.getAttribute('data-sp-listing'),
                novemberArt: november?.querySelector('img')?.getAttribute('src') || null,
                novemberTile: !!november?.querySelector('.sp-i-token,[data-sp-art],[data-sp-fallback]'),
                novemberEstimate: november?.querySelectorAll('.sp-est-mark').length || 0,
                novemberText: november?.innerText || ''
            };
        }""")
        assert listing["octoberStatus"] == "archived", f"{width}px expired October pass mixed with active offers: {listing}"
        assert listing["octoberGroup"] == "earlier", f"{width}px October pass must be in previous offers: {listing}"
        assert listing["novemberStatus"] == "listed", f"{width}px November official listing missing: {listing}"
        art = listing["novemberArt"]
        assert art is None or art.startswith("https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/"), f"{width}px only the exact owner-approved Niantic image may render: {listing}"
        assert not listing["novemberTile"], f"{width}px placeholder tile must not render: {listing}"
        assert listing["novemberEstimate"] == 2, f"{width}px modelled ID and IN values carry est.: {listing}"

        page.evaluate("""selector => {
            const card = document.querySelector(selector);
            if (!card) throw new Error("Synthetic Store fixture card was not rendered");
            if (card.hidden) throw new Error("Synthetic Store fixture card is hidden by filtering");
            for (let node = card; node; node = node.parentElement) {
                if (node instanceof HTMLDetailsElement) node.open = true;
            }
            card.scrollIntoView({block: "center"});
        }""", target)
        page.wait_for_selector(target + " .sp-prices", state="visible")
        page.wait_for_function("""selector => {
            const cells = [...document.querySelector(selector).querySelectorAll('.sp-price')];
            return cells.length === 3 && cells.slice(1).every(cell =>
                cell.querySelector('.sp-aud-equivalent')?.textContent.includes('≈ A$'));
        }""", arg=target)
        # The exact-art card sits in a collapsed category and the image is lazy: open it, scroll to it and wait for the decode.
        page.evaluate("""() => {
            const potion = [...document.querySelectorAll('.sp-product')].find(x => x.querySelector('.sp-name')?.textContent === 'Max Potions x10');
            for (let node = potion; node; node = node.parentElement) if (node instanceof HTMLDetailsElement) node.open = true;
            potion.scrollIntoView({block: 'center'});
        }""")
        page.wait_for_function("""() => {
            const img = [...document.querySelectorAll('.sp-product')].find(x => x.querySelector('.sp-name')?.textContent === 'Max Potions x10')?.querySelector('img.sp-i');
            return !!img && img.complete && img.naturalWidth > 0;
        }""")
        page.evaluate("""selector => { const c = document.querySelector(selector); c.scrollIntoView({block: 'center'}); }""", target)
        metrics = page.evaluate("""selector => {
            const card = document.querySelector(selector);
            if (!card || !card.getClientRects().length) throw new Error("Synthetic Store card is not visible");
            const grid = card.querySelector('.sp-prices');
            const cells = [...grid.querySelectorAll(':scope > .sp-price')];
            const bounds = cells.map(c => {
                const r = c.getBoundingClientRect();
                return {left:r.left,right:r.right,width:r.width};
            });
            const potion = [...document.querySelectorAll('.sp-product')].find(x => x.querySelector('.sp-name')?.textContent === 'Max Potions x10');
            const unmapped = [...document.querySelectorAll('.sp-product')].find(x => x.querySelector('.sp-name')?.textContent === 'Synthetic Unmapped Item');
            const img = potion?.querySelector('img.sp-i');
            const imgBox = img && img.getBoundingClientRect();
            const clipped = [...document.querySelectorAll('.storep-regional .sp-product *')].filter(n => {
                const r = n.getBoundingClientRect();
                return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
            }).length;
            const summaries = [...document.querySelectorAll('.storep-regional summary')].filter(x => x.getClientRects().length);
            return {
                viewport: window.innerWidth,
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
                cardWidth: card.getBoundingClientRect().width,
                gridColumns: getComputedStyle(grid).gridTemplateColumns,
                cellCount: cells.length,
                bounds,
                cardText: card.innerText,
                regions: cells.map(c => c.getAttribute('data-sp-region')),
                markets: cells.map(c => {
                    const aud = c.querySelector('.sp-aud-equivalent');
                    const local = c.querySelector('.sp-local-price');
                    return {
                        aud: aud?.textContent.trim() || null,
                        local: local?.textContent.trim() || null,
                        audBeforeLocal: !!aud && !!local &&
                            !!(aud.compareDocumentPosition(local) & Node.DOCUMENT_POSITION_FOLLOWING),
                        localOnlyAriaLabel: c.hasAttribute('aria-label'),
                        fxProvenance: aud?.querySelector('.sp-aud-source')?.textContent.trim() || null,
                        estimateMarks: c.querySelectorAll('.sp-est-mark').length,
                        olderMarks: c.querySelectorAll('.sp-older-mark').length
                    };
                }),
                image: img ? {src: img.getAttribute('src'), alt: img.alt, loading: img.loading,
                    width: imgBox.width, height: imgBox.height, fit: getComputedStyle(img).objectFit,
                    loaded: img.complete && img.naturalWidth > 0,
                    beforeName: !!(img.compareDocumentPosition(potion.querySelector('.sp-name')) & Node.DOCUMENT_POSITION_FOLLOWING)} : null,
                unmappedImages: unmapped ? unmapped.querySelectorAll('img,.sp-i-token').length : -1,
                clipped,
                foot: document.querySelector('.storep-regional [data-sp-foot]')?.innerText || null,
                footVisible: !!document.querySelector('.storep-regional [data-sp-foot]')?.getClientRects().length,
                legendCount: document.querySelectorAll('.storep-regional [data-sp-legend]').length,
                shortSummaries: summaries.filter(x => x.getBoundingClientRect().height < 43.5).map(x => x.textContent.trim())
            };
        }""", target)
        (OUT / f"store-{width}.json").write_text(json.dumps(metrics, indent=2))
        page.screenshot(path=str(OUT / f"store-{width}.png"), full_page=True)
        assert metrics["scrollWidth"] <= width, f"{width}px document overflow: {metrics}"
        assert metrics["clientWidth"] <= width, f"{width}px client overflow: {metrics}"
        assert metrics["clipped"] == 0, f"{width}px a card element overflows the viewport: {metrics}"
        assert metrics["cellCount"] == 3, f"{width}px expected three regions: {metrics}"
        assert metrics["regions"] == ["AU", "ID", "IN"], f"{width}px region order: {metrics}"
        assert all(x["width"] > 0 for x in metrics["bounds"]), f"{width}px zero-width column"
        assert all(x["right"] <= width + 1 and x["left"] >= -1 for x in metrics["bounds"]), f"{width}px columns overflow"
        assert all(abs(metrics["bounds"][i]["left"] - metrics["bounds"][0]["left"]) > 1
                   for i in (1, 2)), f"{width}px columns stacked rather than aligned"
        assert not metrics["shortSummaries"], f"{width}px summary targets under 44px: {metrics['shortSummaries']}"
        # Only the name and prices: none of the removed provenance text.
        for banned in ("Verified", "Recorded", "FX ·", "Not observed", "last verified", "Seen in", "dated observations",
                       "Official published", "not confirmed", "historical", "Based on", "Included in", "Official description",
                       "confidence", "checkout price"):
            assert banned.lower() not in metrics["cardText"].lower(), f"{width}px removed text '{banned}' on card: {metrics['cardText']}"
        image = metrics["image"]
        assert image, f"{width}px exact item art missing for Max Potions x10: {metrics}"
        assert image["src"] == "/ico/i/max-potion.webp", f"{width}px image must be the exact same-origin asset: {image}"
        assert image["alt"] == "Max Potions x10" and image["loading"] == "lazy", f"{width}px image attrs: {image}"
        assert image["fit"] == "contain" and abs(image["width"] - 40) < 1 and abs(image["height"] - 40) < 1, f"{width}px image box: {image}"
        assert image["loaded"] and image["beforeName"], f"{width}px image must load beside the name: {image}"
        assert metrics["unmappedImages"] == 0, f"{width}px unmapped item must have no image slot or tile: {metrics}"
        indonesia, india = metrics["markets"][1:]
        assert indonesia["aud"] == "≈ A$6.91", f"{width}px IDR reference: {indonesia}"
        assert indonesia["local"] == "Rp 76,000", f"{width}px original IDR price: {indonesia}"
        assert india["aud"] == "≈ A$7.32", f"{width}px INR reference: {india}"
        assert india["local"] and "439" in india["local"] and "₹" in india["local"], f"{width}px INR local: {india}"
        for market in (indonesia, india):
            assert market["audBeforeLocal"], f"{width}px AUD must precede local checkout price: {market}"
            assert not market["localOnlyAriaLabel"], f"{width}px parent label masks AUD for VoiceOver: {market}"
            assert market["fxProvenance"] is None, f"{width}px FX provenance is tooltip-only: {market}"
            assert market["estimateMarks"] == 0, f"{width}px observed value must not carry est.: {market}"
        assert indonesia["olderMarks"] == 0, f"{width}px verified ID price must be unmarked: {indonesia}"
        assert india["olderMarks"] == 1, f"{width}px recorded IN price needs the older marker: {india}"
        assert metrics["footVisible"] and metrics["foot"].startswith("Prices are dated observations, not live checkout quotes."), f"{width}px footer: {metrics['foot']}"
        assert metrics["legendCount"] == 1, f"{width}px legend must exist once: {metrics['legendCount']}"
        print(f"PASS Store synthetic owner layout {width}px: {json.dumps(metrics)}", flush=True)
        context.close()
    browser.close()
