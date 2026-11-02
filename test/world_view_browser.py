#!/usr/bin/env python3
"""Browser regression for In person, world and destination-search Schedule views."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:" + os.environ.get("UI_PORT", "8791")
ROOT = Path(__file__).resolve().parent.parent


def main():
    data = json.loads((ROOT / "public" / "data.json").read_text(encoding="utf-8"))
    data["inPerson"] = [{
        "tags": ["In person", "Debut"],
        "title": "In-person fixture: Kyoto",
        "when": "6–8 Nov · published local event window",
        "art": [],
        "bullets": ["Fixture only; no production event data is changed."]
    }]
    data["pastFests"] = []
    data["worldEvents"] = [
        {"t": "Asia world-event fixture", "where": "Kyoto, Japan", "region": "Asia", "s": "2026-11-06", "e": "2026-11-08", "link": "https://example.test/asia", "note": "Ticketed in-person fixture.", "kind": "event"},
        {"t": "Americas world-event fixture", "where": "Mexico City, Mexico", "region": "Americas", "s": "2026-11-06", "e": "2026-11-08", "link": "https://example.test/americas", "note": "Ticketed in-person fixture.", "kind": "event"},
        {"t": "Global world-event fixture", "where": "Play from anywhere", "region": "Global", "s": "2026-11-14", "e": "2026-11-15", "link": "https://example.test/global", "note": "Global play fixture.", "kind": "event"}
    ]
    data["worldNote"] = "Deterministic browser fixture."
    world_today = {"events": [
        {"id": "fixture-overseas-inperson",
         "name": "Overseas In-Person Fixture",
         "place": "Kyoto, Japan",
         "area": "Asia",
         "scope": "regional",
         "start": "2026-11-02",
         "end": "2026-11-03",
         "sources": [{"url": "https://example.test/overseas"}]},
        {"id": "fixture-mexico",
         "name": "Mexico City Wild Area Fixture",
         "place": "Mexico City, Mexico",
         "area": "Americas",
         "scope": "regional",
         "start": "2026-11-06",
         "end": "2026-11-08",
         "sources": [{"url": "https://example.test/mexico"}]},
        {"id": "fixture-global",
         "name": "Global In-Game Fixture",
         "place": "",
         "area": "Worldwide",
         "scope": "global",
         "start": "2026-11-14",
         "end": "2026-11-15",
         "sources": [{"url": "https://example.test/global"}]}
    ]}
    empty_api = {"enabled": False, "events": []}
    failures = []

    def expect(name, condition, detail=""):
        print(("PASS " if condition else "FAIL ") + name + ((" — " + str(detail)) if detail and not condition else ""))
        if not condition:
            failures.append(name)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                viewport={"width": 390, "height": 844},
                device_scale_factor=2,
                timezone_id="Australia/Melbourne",
                locale="en-AU",
                service_workers="block"
            )
            context.set_default_timeout(10000)
            context.set_default_navigation_timeout(15000)
            page = context.new_page()
            page_errors = []
            page.on("pageerror", lambda error: page_errors.append(str(error)[:250]))
            page.clock.install(time="2026-11-02T13:08:00+11:00")
            page.route("https://fonts.googleapis.com/**", lambda route: route.fulfill(status=200, body="", content_type="text/css"))
            page.route("https://fonts.gstatic.com/**", lambda route: route.fulfill(status=200, body="", content_type="font/woff2"))
            page.route("**/data.json", lambda route: route.fulfill(status=200, body=json.dumps(data), content_type="application/json"))
            page.route("**/world-events.json", lambda route: route.fulfill(status=200, body=json.dumps(world_today), content_type="application/json"))
            page.route("**/regional-events.json", lambda route: route.fulfill(status=200, body=json.dumps({"events": []}), content_type="application/json"))
            page.route("**/api/sources", lambda route: route.fulfill(status=200, body=json.dumps({"environment": "production", "database": True, "enabled": False, "sources": []}), content_type="application/json"))
            page.route("**/api/events", lambda route: route.fulfill(status=200, body=json.dumps(empty_api), content_type="application/json"))
            page.route("**/api/world", lambda route: route.fulfill(status=200, body=json.dumps({"events": []}), content_type="application/json"))
            page.route("**/api/venue-times*", lambda route: route.fulfill(status=200, body=json.dumps({"items": []}), content_type="application/json"))
            page.route("**/api/userstate*", lambda route: route.fulfill(status=404, body="{}", content_type="application/json"))
            page.route("**/api/dex", lambda route: route.fulfill(status=401, body="{}", content_type="application/json"))
            page.route("**/api/art*", lambda route: route.fulfill(status=404, body=""))
            response = page.goto(BASE, wait_until="domcontentloaded")
            expect("entry page loads", response is not None and response.status < 400)
            page.wait_for_selector("#tabs [role=tab]", timeout=15000)
            # The Schedule sub-navigation is hidden until its parent tab is active.
            page.locator('nav.tabs button[data-tab="events"]').click()
            page.wait_for_selector("#subnav-events button[data-sub=world]", timeout=15000)
            page.locator('#subnav-events button[data-sub="world"]').click()
            page.wait_for_function("() => { const el=document.getElementById('sub-world'); return !!el && !el.hidden; }")
            # app.js creates the sub-navigation before its initial data render completes.
            page.wait_for_function("() => { const el=document.querySelector('#inperson article h3'); return !!el && el.textContent.includes('In-person fixture: Kyoto'); }", timeout=10000)
            expect("In person is a visible third Schedule view",
                   page.locator("#sub-world").is_visible() and page.locator("#subnav-events button").count() == 4)
            person_titles = page.locator("#inperson article h3").all_text_contents()
            expect("ticketed in-person event cards render in the view",
                   person_titles.count("In-person fixture: Kyoto") == 1, person_titles)
            world_text = page.locator("#world").inner_text()
            expect("world events render with destinations and regional filters",
                   all(x in world_text for x in ["Asia world-event fixture", "Americas world-event fixture", "Kyoto, Japan", "Mexico City, Mexico"]))
            expect("global play remains separately identified",
                   "Global world-event fixture" in world_text)
            page.locator('#world [data-w="Asia"]').click()
            asia_text = page.locator("#world").inner_text()
            expect("Asia filter selects only the Asia event in the event list",
                   page.locator('#world [data-w="Asia"]').get_attribute("aria-pressed") == "true" and
                   "Asia world-event fixture" in asia_text and "Americas world-event fixture" not in asia_text)
            page.locator('#world [data-w="all"]').click()
            all_text = page.locator("#world").inner_text()
            expect("All restores the complete regional event list",
                   page.locator('#world [data-w="all"]').get_attribute("aria-pressed") == "true" and
                   "Asia world-event fixture" in all_text and "Americas world-event fixture" in all_text)
            page.locator('#subnav-events button[data-sub="travel"]').click()
            page.wait_for_function("() => { const el=document.getElementById('sub-travel'); return !!el && !el.hidden; }")
            page.wait_for_function("() => document.querySelectorAll('#travel-results .agw').length >= 2")
            # A global hide preference may affect Today/Timeline, but must not silently remove a destination from Travel.
            page.evaluate("() => { window.GODASH.usSet('hide:fixture-mexico', true); }")
            page.locator('#travel-regions [data-travel-region="all"]').click()
            travel_text = page.locator("#travel-results").inner_text()
            expect("Travel is a separate fourth Schedule view",
                   page.locator("#sub-travel").is_visible() and page.locator("#sub-world").is_hidden() and
                   page.locator("#subnav-events button[data-sub=travel]").get_attribute("aria-pressed") == "true")
            expect("Travel shows dated regional destinations but excludes global in-game events",
                   "Kyoto, Japan" in travel_text and "Mexico City, Mexico" in travel_text and
                   "Global In-Game Fixture" not in travel_text, travel_text)
            expect("Travel is independent of per-event hide preferences and has no global hide control",
                   "Mexico City Wild Area Fixture" in travel_text and
                   page.locator("#travel-results [data-hide]").count() == 0, travel_text)
            expect("Travel datalist contains exact source-listed places",
                   page.locator('#travel-destinations option[value="Kyoto, Japan"]').count() == 1 and
                   page.locator('#travel-destinations option[value="Mexico City, Mexico"]').count() == 1)
            page.locator("#travel-q").fill("Kyoto")
            travel_text = page.locator("#travel-results").inner_text()
            expect("destination search narrows to the matching place",
                   "Overseas In-Person Fixture" in travel_text and "Mexico City Wild Area Fixture" not in travel_text,
                   travel_text)
            page.locator("#travel-q").fill("")
            asia_filter = page.locator('#travel-regions [data-travel-region="Asia"]')
            asia_filter.focus()
            page.keyboard.press("Enter")
            asia_travel = page.locator("#travel-results").inner_text()
            expect("Travel region filter selects Asia only and preserves keyboard focus",
                   page.locator('#travel-regions [data-travel-region="Asia"]').get_attribute("aria-pressed") == "true" and
                   page.evaluate("() => document.activeElement.getAttribute('data-travel-region')") == "Asia" and
                   "Kyoto, Japan" in asia_travel and "Mexico City, Mexico" not in asia_travel)
            page.locator('#travel-regions [data-travel-region="all"]').click()
            expect("All destinations restores the full dated regional list",
                   "Mexico City, Mexico" in page.locator("#travel-results").inner_text())
            travel_rows_text = page.locator("#travel-results").inner_text()
            expect("Travel rows preserve the exact source calendar dates",
                   "2 Nov 2026" in travel_rows_text and "6 Nov 2026 – 8 Nov 2026" in travel_rows_text,
                   travel_rows_text)
            expect("Travel rows do not invent venue-local times",
                   "Venue:" not in travel_rows_text)
            action_sizes = page.locator("#travel-results .ag-actions .agx").evaluate_all(
                "(els) => els.map(el => { const r=el.getBoundingClientRect(); return [r.width,r.height]; })")
            expect("Travel row action controls retain 44px touch targets",
                   bool(action_sizes) and all(w >= 43.5 and h >= 43.5 for w,h in action_sizes), action_sizes)
            region_sizes = page.locator("#travel-regions .fchip").evaluate_all(
                "(els) => els.map(el => el.getBoundingClientRect().height)")
            expect("Travel region filters retain 44px touch targets",
                   bool(region_sizes) and all(h >= 43.5 for h in region_sizes), region_sizes)
            page.locator('#subnav-events button[data-sub="timeline"]').click()
            expect("Timeline remains a separate working view",
                   page.locator("#sub-timeline").is_visible() and page.locator("#sub-travel").is_hidden())
            page.locator('#subnav-events button[data-sub="world"]').click()
            expect("In person can be reopened after Timeline",
                   page.locator("#sub-world").is_visible())
            page.locator('#subnav-events button[data-sub="travel"]').click()
            for width in (390, 320):
                page.set_viewport_size({"width": width, "height": 844})
                page.wait_for_timeout(100)
                dimensions = page.evaluate("() => { const p=document.querySelector('#sub-travel'); return {viewport:innerWidth,document:document.documentElement.scrollWidth,panel:p.scrollWidth,client:p.clientWidth}; }")
                expect(f"Travel view has no page overflow at {width}px",
                       dimensions["document"] <= dimensions["viewport"] and dimensions["panel"] <= dimensions["client"],
                       dimensions)
            for width in (390, 320):
                page.set_viewport_size({"width": width, "height": 844})
                page.wait_for_timeout(100)
                dimensions = page.evaluate("() => { const p=document.querySelector('#sub-world'),w=p.querySelector('.tablewrap'); return {viewport:innerWidth,document:document.documentElement.scrollWidth,panel:p.scrollWidth,client:p.clientWidth,tableWrapClient:w.clientWidth,tableWrapScroll:w.scrollWidth,tableWrapOverflow:getComputedStyle(w).overflowX}; }")
                expect(f"In person view has no page overflow at {width}px",
                       dimensions["document"] <= dimensions["viewport"] and dimensions["panel"] <= dimensions["client"] and
                       dimensions["tableWrapOverflow"] == "auto" and dimensions["tableWrapScroll"] >= dimensions["tableWrapClient"],
                       dimensions)
            page.locator('nav.tabs button[data-tab="now"]').click()
            page.wait_for_selector("#home-now .agr.reg", timeout=10000)
            overseas = page.locator("#home-now .agr.reg").filter(has_text="Overseas In-Person Fixture")
            overseas_text = overseas.inner_text() if overseas.count() else ""
            expect("overseas in-person event remains visible on Today by default",
                   overseas.count() == 1 and overseas.is_visible() and "Kyoto, Japan" in overseas_text, overseas_text)
            expect("overseas event stays in the unfolded Today agenda",
                   overseas.count() == 1 and overseas.evaluate("el => !!el.closest('.today-phase-group') && !el.closest('details')"))
            expect("unverified venue-local time is not invented",
                   "Venue:" not in overseas_text, overseas_text)
            expect("no browser page errors", not page_errors, page_errors)
            context.close()
        finally:
            browser.close()
    if failures:
        raise SystemExit("FAILED: " + ", ".join(failures))
    print("All In person/world view browser checks passed.")


if __name__ == "__main__":
    main()
