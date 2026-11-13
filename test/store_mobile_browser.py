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
         "region": "AU", "verified": True, "observed": "2026-11-01"}
    ],
    "regional": [
        {"id": "synthetic-id-ticket", "product": "Synthetic Test Ticket",
         "kind": "ticket", "region": "ID", "channel": "web",
         "currency": "IDR", "amount": 76000, "observed": "2026-11-01",
         "source": "synthetic-test-only", "status": "verified"},
        {"id": "synthetic-in-ticket", "product": "Synthetic Test Ticket",
         "kind": "ticket", "region": "IN", "channel": "in-app",
         "currency": "INR", "amount": 439, "observed": "2026-11-01",
         "source": "synthetic-test-only", "status": "recorded"}
    ],
}
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (320, 390, 430):
        context = browser.new_context(viewport={"width": width, "height": 844},
                                      service_workers="block", locale="en-AU")
        page = context.new_page()
        page.route("**/api/**", lambda route: route.fulfill(status=404, body="{}"))
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        # Current-SKU membership is public and contains no prices. Route only
        # the exact synthetic fixture; do not use the owner's real checkout data.
        source = {"version": 1, "updated": now, "items": [
            {"name": "Synthetic Test Ticket", "slug": "synthetic-test-ticket", "seenAt": now}
        ]}
        page.route("**/store-current.json", lambda route: route.fulfill(
            status=200, content_type="application/json", body=json.dumps(source)))
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
        page.add_script_tag(url="/store.js?v=20261114a-store798")
        # Wait for attachment first: the product may live in a collapsed category.
        target = ".storep-regional [data-sp-name*='synthetic test ticket']"
        page.wait_for_selector(target, state="attached")
        page.evaluate("""selector => {
            const card = document.querySelector(selector);
            if (!card) throw new Error("Synthetic Store fixture card was not rendered");
            if (card.hidden) throw new Error("Synthetic Store fixture card is hidden by filtering");
            for (let node = card; node; node = node.parentElement) {
                if (node instanceof HTMLDetailsElement) node.open = true;
            }
            card.scrollIntoView({block: "center"});
        }""", target)
        page.wait_for_selector(target + " .sp-market-grid", state="visible")
        page.wait_for_function("""selector => {
            const cells = [...document.querySelector(selector).querySelectorAll('.sp-market')];
            return cells.length === 3 && cells.slice(1).every(cell =>
                cell.querySelector('.sp-aud-equivalent')?.textContent.includes('≈ A$'));
        }""", arg=target)
        metrics = page.evaluate("""selector => {
            const card = document.querySelector(selector);
            if (!card || !card.getClientRects().length) throw new Error("Synthetic Store card is not visible");
            const grid = card.querySelector('.sp-market-grid');
            const cells = [...grid.querySelectorAll(':scope > .sp-market')];
            const bounds = cells.map(c => {
                const r = c.getBoundingClientRect();
                return {left:r.left,right:r.right,width:r.width};
            });
            return {
                viewport: window.innerWidth,
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
                cardWidth: card.getBoundingClientRect().width,
                gridColumns: getComputedStyle(grid).gridTemplateColumns,
                cellCount: cells.length,
                bounds,
                labels: cells.map(c => c.querySelector('.sp-market-label')?.textContent.trim()),
                channelsVisible: cells.map(c => {
                    const channel = c.querySelector('.sp-market-label small');
                    return !!channel && getComputedStyle(channel).display !== 'none';
                }),
                markets: cells.map(c => {
                    const aud = c.querySelector('.sp-aud-equivalent');
                    const local = c.querySelector('.sp-local-price');
                    const parent = c.querySelector('.sp-regional-value');
                    return {
                        aud: aud?.textContent.trim() || null,
                        local: local?.textContent.trim() || null,
                        audBeforeLocal: !!aud && !!local &&
                            !!(aud.compareDocumentPosition(local) & Node.DOCUMENT_POSITION_FOLLOWING),
                        localOnlyAriaLabel: !!parent?.hasAttribute('aria-label'),
                        fxProvenance: aud?.querySelector('.sp-aud-source')?.textContent.trim() || null
                    };
                })
            };
        }""", target)
        (OUT / f"store-{width}.json").write_text(json.dumps(metrics, indent=2))
        page.screenshot(path=str(OUT / f"store-{width}.png"), full_page=True)
        assert metrics["scrollWidth"] <= width, f"{width}px document overflow: {metrics}"
        assert metrics["clientWidth"] <= width, f"{width}px client overflow: {metrics}"
        assert metrics["cellCount"] == 3, f"{width}px expected three regions: {metrics}"
        assert all(x["width"] > 0 for x in metrics["bounds"]), f"{width}px zero-width column"
        assert all(x["right"] <= width + 1 and x["left"] >= -1 for x in metrics["bounds"]), f"{width}px columns overflow"
        assert all(abs(metrics["bounds"][i]["left"] - metrics["bounds"][0]["left"]) > 1
                   for i in (1, 2)), f"{width}px columns stacked rather than aligned"
        assert all(x in " ".join(metrics["labels"]) for x in ("Australia", "Indonesia", "India"))
        assert all(metrics["channelsVisible"]), f"{width}px purchase channels must remain visible: {metrics}"
        assert all(x in " ".join(metrics["labels"]) for x in ("Web", "in-app"))
        indonesia, india = metrics["markets"][1:]
        assert indonesia["aud"] == "≈ A$6.91FX · 12 Nov 2026", f"{width}px IDR reference: {indonesia}"
        assert indonesia["local"] == "Rp 76,000", f"{width}px original IDR price: {indonesia}"
        assert india["aud"] == "≈ A$7.32FX · 12 Nov 2026", f"{width}px INR reference: {india}"
        assert india["local"] and "439" in india["local"] and "₹" in india["local"], f"{width}px INR local: {india}"
        for market in (indonesia, india):
            assert market["audBeforeLocal"], f"{width}px AUD must precede local checkout price: {market}"
            assert not market["localOnlyAriaLabel"], f"{width}px parent label masks AUD for VoiceOver: {market}"
            assert market["fxProvenance"] == "FX · 12 Nov 2026", f"{width}px dated FX provenance: {market}"
        print(f"PASS Store synthetic owner layout {width}px: {json.dumps(metrics)}", flush=True)
        context.close()
    browser.close()
