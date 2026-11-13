"""Store PR-head visual contract with synthetic, non-owner prices only.

Run against the real static application served on localhost:8791. No owner API
response, credentials or actual regional price data enter CI artifacts.
"""
import json
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
         "source": "synthetic-test-only", "status": "verified"}
    ],
}
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (320, 390, 430):
        context = browser.new_context(viewport={"width": width, "height": 844},
                                      service_workers="block", locale="en-AU")
        page = context.new_page()
        page.route("**/api/**", lambda route: route.fulfill(status=404, body="{}"))
        page.goto(BASE, wait_until="domcontentloaded")
        # The regional Store is rendered inside the Events timeline panel.
        # Activate that real app surface before checking visibility or layout.
        page.locator('nav.tabs button[data-tab="events"]').click()
        page.wait_for_selector("#tab-events:not([hidden])")
        page.wait_for_selector("#sub-timeline:not([hidden])")
        page.wait_for_function("Boolean(window.GOLIB && window.GORegionalPrices && window.GOStoreOfferIdentities)")
        # Replace the private loader before rerunning the real Store renderer.
        # Only synthetic data is rendered or saved to the artifact.
        page.evaluate("""fixture => {
            window.GOLIB.loadPrices = async () => fixture;
            window.GOStoreFX = null;
            if (!document.getElementById('evsource')) {
                const host = document.createElement('div');
                host.id = 'evsource';
                document.body.appendChild(host);
            }
        }""", FIXTURE)
        page.add_script_tag(url="/store.js?v=20261113o-store770")
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
                localPrice: cells[1].querySelector('.sp-local-price')?.textContent.trim() || null
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
        print(f"PASS Store synthetic owner layout {width}px: {json.dumps(metrics)}", flush=True)
        context.close()
    browser.close()
