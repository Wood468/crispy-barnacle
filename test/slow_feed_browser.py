#!/usr/bin/env python3
"""Read-only browser fault-injection smoke for the Today live-event feed.

The /api/events request is held inside Chromium and never reaches the Worker.
All other API requests are answered locally. Non-GET/HEAD requests are aborted,
except Cloudflare's /cdn-cgi/rum beacon, which is fulfilled locally (never sent). The same script runs against the local static build in CI and the
live production site from its dedicated scheduled workflow.
"""
import json
import os
import time
from datetime import datetime, timedelta
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

BASE = os.environ.get("GO_FIELD_NOTES_SLOW_FEED_URL", "http://127.0.0.1:8791").rstrip("/")
MELBOURNE = ZoneInfo("Australia/Melbourne")


def live_feed_fixture():
    start = (datetime.now(MELBOURNE) + timedelta(days=2)).replace(
        hour=10, minute=0, second=0, microsecond=0
    )
    end = start + timedelta(days=1)
    events = []
    for index in range(1, 11):
        events.append({
            "id": f"slow-feed-smoke-{index:02d}",
            "name": f"Slow-feed smoke fixture {index:02d}",
            "type": "event",
            "start": start.isoformat(timespec="minutes"),
            "end": end.isoformat(timespec="minutes"),
            "status": "community_reported",
            "source": "Synthetic smoke fixture",
            "scope": "global",
            "region": "Global",
            "featured": [],
            "bonuses": [],
            "reports": [],
        })
    return {"enabled": True, "events": events}


def main():
    held_feed_routes = []
    blocked_writes = []
    blocked_api_paths = []
    intercepted_telemetry = []
    page_errors = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            timezone_id="Australia/Melbourne",
            locale="en-AU",
            service_workers="block",
        )
        page = context.new_page()
        page.set_default_timeout(15000)
        page.set_default_navigation_timeout(30000)
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        def safe_route(route, request):
            path = urlparse(request.url).path
            method = request.method.upper()

            # Fault injection happens entirely in the browser. This request
            # remains paused and is never forwarded to the production Worker.
            if path == "/api/events" and method == "GET":
                held_feed_routes.append(route)
                return

            # Cloudflare's browser RUM beacon is expected on production pages.
            # Fulfil it locally so telemetry is not sent by this read-only smoke.
            if path == "/cdn-cgi/rum" and method == "POST":
                intercepted_telemetry.append(path)
                route.fulfill(status=204, body="")
                return

            # Fail closed before considering API paths: no other non-read request
            # is ever allowed to leave the browser.
            if method not in ("GET", "HEAD"):
                blocked_writes.append(f"{method} {path}")
                route.abort()
                return

            # This smoke needs no account, sync, owner, or other API data.
            if path.startswith("/api/"):
                blocked_api_paths.append(path)
                route.fulfill(status=404, body="{}", content_type="application/json")
                return

            route.continue_()

        page.route("**/*", safe_route)
        page.goto(BASE + "/", wait_until="domcontentloaded", timeout=30000)

        deadline = time.monotonic() + 20
        while not held_feed_routes and time.monotonic() < deadline:
            page.wait_for_timeout(100)
        if not held_feed_routes:
            raise AssertionError("The page never requested /api/events")

        # The normal 8-second feed timeout must render the curated copy rather
        # than leave Today blank while the intercepted request is still pending.
        page.wait_for_function(
            """() => window.GODASH &&
              window.GODASH.eventsState() === 'degraded' &&
              document.getElementById('home-now')?.hasAttribute('data-render-key')""",
            timeout=20000,
        )
        fallback = page.evaluate("""() => {
          const home = document.getElementById('home-now');
          const bar = document.getElementById('netbar');
          return {
            state: window.GODASH.eventsState(),
            rendered: !!home && home.hasAttribute('data-render-key'),
            homeHeight: home ? home.offsetHeight : 0,
            homeTextLength: home ? home.innerText.trim().length : 0,
            noticeVisible: !!bar && !bar.hidden,
            noticeText: bar ? bar.innerText : ''
          };
        }""")
        if fallback["state"] != "degraded":
            raise AssertionError(f"Expected degraded feed state, got {fallback}")
        if not fallback["rendered"] or fallback["homeHeight"] < 150 or fallback["homeTextLength"] < 20:
            raise AssertionError(f"Today did not render a useful curated fallback: {fallback}")
        if not fallback["noticeVisible"] or "saved copy" not in fallback["noticeText"].lower():
            raise AssertionError(f"Today did not explain that it is showing the saved copy: {fallback}")

        # Release a synthetic, valid live response after the timeout. This
        # proves the late-answer path recovers without a page reload.
        held_feed_routes[0].fulfill(
            status=200,
            body=json.dumps(live_feed_fixture()),
            content_type="application/json",
        )
        page.wait_for_function(
            """() => window.GODASH &&
              window.GODASH.eventsState() === 'live' &&
              window.GODASH.events().some(event => event.name === 'Slow-feed smoke fixture 01')""",
            timeout=15000,
        )
        recovered = page.evaluate("""() => {
          const bar = document.getElementById('netbar');
          const dash = performance.getEntriesByType('resource')
            .map(entry => entry.name)
            .find(name => { try { return new URL(name).pathname === '/dash.js'; } catch (_) { return false; } });
          return {
            state: window.GODASH.eventsState(),
            fixtureVisible: window.GODASH.events().some(event => event.name === 'Slow-feed smoke fixture 01'),
            noticeHidden: !bar || bar.hidden,
            dashAsset: dash || null
          };
        }""")
        if recovered["state"] != "live" or not recovered["fixtureVisible"] or not recovered["noticeHidden"]:
            raise AssertionError(f"The late live response did not recover Today cleanly: {recovered}")
        if not recovered["dashAsset"]:
            raise AssertionError("The dashboard script was not loaded from the selected site")
        if blocked_writes:
            raise AssertionError(f"Unexpected write requests were attempted and blocked: {blocked_writes}")
        if page_errors:
            raise AssertionError(f"Browser JavaScript errors: {page_errors}")

        print(json.dumps({
            "site": BASE,
            "fallback": fallback,
            "recovered": recovered,
            "heldFeedRequests": len(held_feed_routes),
            "blockedOtherApiRequests": len(blocked_api_paths),
            "interceptedTelemetryRequests": len(intercepted_telemetry),
            "blockedWrites": blocked_writes,
            "pageErrors": page_errors,
            "productionMutation": "none; /api/events was intercepted before network",
        }, indent=2))
        context.close()
        browser.close()


if __name__ == "__main__":
    main()
