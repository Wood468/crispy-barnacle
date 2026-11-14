#!/usr/bin/env python3
"""Read-only mobile production acceptance for the core public GO Field Notes journey.

Unlike fixture browser tests, this opens the actually deployed site. No private
endpoints, authentication, player-state changes, or non-GET requests are allowed.
An absent currently announced GO Pass is reported as a skipped conditional check,
not filled with invented rank/reward data.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright
from live_banner_readiness import wait_for_today_banner_art

BASE = os.environ.get("GOFN_ART_QA_URL", "https://pogo.michaelpuff.com").rstrip("/")
OUT = Path(os.environ.get("GOFN_CORE_QA_OUT", "artifacts/live-core-mobile"))
WIDTHS = (320, 360, 390, 430)


def screenshot(page, width: int, label: str, failures: list) -> None:
    try:
        page.screenshot(
            path=str(OUT / f"{label}-{width}.png"),
            full_page=True, animations="disabled", timeout=15000,
        )
    except Exception as exc:
        failures.append({"width": width, "screenshot": label, "error": str(exc)})


def no_overflow(page, width: int, location: str) -> None:
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2"), (
        f"{width}px: {location} has horizontal page overflow"
    )


def inspect(page, width: int, failures: list) -> dict:
    row = {"width": width, "screens": {}, "page_errors": []}
    page.on("pageerror", lambda exc: row["page_errors"].append(str(exc)))

    response = page.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
    assert response is not None and response.ok, f"{width}px: homepage unavailable"
    page.wait_for_function(
        "() => !!window.GODASH && !!window.GO && !!window.GODETAIL && "
        "!!window.GOEventRegistry && GOEventRegistry.settled()",
        timeout=45000,
    )

    page.locator("#today-v1 .t1-glance").wait_for(timeout=30000)
    cards = page.locator("#today-v1 .t1-card").count()
    assert cards >= 1, f"{width}px: no published Today event cards"
    assert page.locator("#today-v1 .t1-tile").count() == 3, (
        f"{width}px: live/upcoming/highlights overview incomplete"
    )
    assert page.locator(
        "#today-v1 [data-follow],#today-v1 [data-mark],"
        "#today-v1 .ue-mon-controls"
    ).count() == 0, f"{width}px: forbidden tracking controls on Today"
    no_overflow(page, width, "Today")
    # A ready Today DOM does not mean its async official banner has decoded.
    # Do not produce a misleading blank 320px acceptance screenshot.
    art = wait_for_today_banner_art(page, width)
    row["screens"]["today"] = {"cards": cards, "overview_tiles": 3, "banner_art": art}
    screenshot(page, width, "today", failures)

    # The primary touch navigation must remain reachable and named on iPhone.
    nav_targets = page.evaluate("""() => [...document.querySelectorAll('#tabs [data-tab]')]
      .filter(el => el.getClientRects().length > 0)
      .map(el => { const r = el.getBoundingClientRect();
        return {width:r.width,height:r.height,label:(el.getAttribute('aria-label') || el.innerText || '').trim()};
      })""")
    assert len(nav_targets) >= 4, f"{width}px: core navigation has too few accessible tabs"
    for target in nav_targets:
        assert target["width"] >= 44 and target["height"] >= 44, (
            f"{width}px: navigation touch target below 44px"
        )
        assert target["label"], f"{width}px: navigation tab without accessible name"
    row["screens"]["navigation"] = {
        "tabs": len(nav_targets), "min_hit_px": min(int(min(t["width"], t["height"])) for t in nav_targets)
    }

    # Follow a real Today event card through its Event Details modal and back.
    # Pass-only tests do not catch broken links from the most-used home screen.
    event_open = page.locator("#today-v1 article.t1-card button.t1-open[data-open]").first
    event_open.wait_for(state="visible", timeout=15000)
    opened_id = event_open.get_attribute("data-open")
    event_open.scroll_into_view_if_needed()
    event_open.focus()
    event_open.click()
    page.locator("#evd .ue-hero").wait_for(state="visible", timeout=20000)
    assert page.locator('#evd .evd-nav-link[data-sec="overview"]').count() == 1, (
        f"{width}px: event details missing Overview navigation"
    )
    assert page.locator("#evd [data-follow],#evd [data-mark],#evd .ue-mon-controls").count() == 0, (
        f"{width}px: forbidden Pokémon tracking actions in Event Details"
    )
    page.keyboard.press("Tab")
    assert page.evaluate("document.getElementById('evd').contains(document.activeElement)"), (
        f"{width}px: keyboard focus escaped open Event Details"
    )
    assert page.locator("#evd").evaluate("(el) => el.scrollWidth <= el.clientWidth + 2"), (
        f"{width}px: Event Details horizontal overflow"
    )
    screenshot(page, width, "today-event-details", failures)
    page.keyboard.press("Escape")
    page.locator("#evd").wait_for(state="hidden", timeout=10000)
    assert page.locator("#today-v1").is_visible(), f"{width}px: closing details lost Today"
    row["screens"]["event_details"] = {"opened_from_today": opened_id, "returned_to_today": True}

    # Season/pass feed loads independently of the main event catalogue.
    page.wait_for_function("() => !!window.GOSEASON", timeout=30000)
    active_passes = page.evaluate("""() => {
      const now = Date.now();
      const when = value => value instanceof Date ? value.getTime() : new Date(value).getTime();
      return GOSEASON.events().filter(e => {
        const start = when(e.start), end = when(e.end);
        return /GO Pass/i.test(e.name || '') && Number.isFinite(start) &&
          Number.isFinite(end) && start <= now && now < end;
      }).map(e => ({id:e.id,name:e.name,source:e.source}));
    }""")
    row["screens"]["pass"] = {"active_passes": len(active_passes), "checked": []}
    if active_passes:
        # Verify the special live pass as well as the long-running monthly pass.
        # Selecting only the first active item would silently miss Into the Wild.
        choices = sorted(
            active_passes, key=lambda item: (
                item["id"] != "season:pass-into-wild-2026", item["id"]
            )
        )[:3]
        for choice in choices:
            card = page.locator("#seasonbar .ssn-card", has_text=choice["name"])
            assert card.count() == 1, f"{width}px: active GO Pass {choice['id']} missing on Today"
            page.evaluate("(id) => { GODETAIL.open(id); return true; }", choice["id"])
            # Event Details is now one visible panel at a time. Exercise
            # the actual GO Pass tab instead of waiting on hidden rank cards.
            pass_tab = page.locator('#evd .evd-nav-link[data-sec="passes"]')
            pass_tab.wait_for(state="visible", timeout=30000)
            pass_tab.click()
            page.locator("#evd .ue-pass").wait_for(state="visible", timeout=30000)
            ranges = page.locator("#evd .ue-pass-range")
            assert ranges.count() >= 1, f"{width}px: {choice['id']} has no illustrated rank stages"
            assert page.locator("#evd .ue-pass-src a[href^='https://']").count() >= 1, (
                f"{width}px: {choice['id']} has no published source link"
            )
            assert page.locator("#evd [data-follow],#evd [data-mark],#evd .ue-mon-controls").count() == 0, (
                f"{width}px: forbidden tracking controls in pass details"
            )
            assert page.locator("#evd").evaluate("(el) => el.scrollWidth <= el.clientWidth + 2"), (
                f"{width}px: GO Pass details overflow"
            )
            if choice["id"] == "season:pass-into-wild-2026":
                assert choice["source"] == "Pokémon GO (official)", (
                    f"{width}px: Into the Wild pass lost official provenance"
                )
                # Ranks outside the first expanded group are hidden from
                # inner_text() until the player opens their range. Test the
                # actual visible reward after expanding Rank 45 and Rank 100;
                # reading the hidden DOM alone would mask a real UX defect.
                assert pass_tab.count() == 1 and pass_tab.is_visible(), (
                    f"{width}px: special GO Pass section inaccessible"
                )
                for rank, name in ((45, "Dynamax Meltan"), (100, "Silver Bottle Cap")):
                    tile = page.locator(f'#evd .ue-pass-rank[data-rank="{rank}"]')
                    assert tile.count() == 1, f"{width}px: source-backed Rank {rank} missing"
                    group = tile.locator(
                        "xpath=ancestor::details[contains(@class, 'ue-pass-range')]"
                    ).first
                    assert group.count() == 1, f"{width}px: Rank {rank} has no expandable range"
                    if not group.evaluate("(el) => el.open"):
                        group.locator("summary").click()
                    tile.scroll_into_view_if_needed(timeout=10000)
                    assert tile.is_visible() and name in tile.inner_text(), (
                        f"{width}px: {name} not visible at verified Rank {rank}"
                    )
                    screenshot(page, width, f"gopass-{rank}-" + choice["id"].split(":")[-1], failures)
            row["screens"]["pass"]["checked"].append({
                "source": choice["source"], "id": choice["id"], "rank_ranges": ranges.count()
            })
            suffix = choice["id"].replace("season:", "").replace(":", "-")
            screenshot(page, width, "gopass-" + suffix, failures)
            # Capture the actual illustrated stages, not just the Overview hero.
            ranges.first.scroll_into_view_if_needed(timeout=10000)
            screenshot(page, width, "gopass-stages-" + suffix, failures)
            page.keyboard.press("Escape")
    else:
        row["screens"]["pass"]["note"] = "No currently active verified GO Pass; no rewards inferred"

    page.locator('#tabs [data-tab="events"]').click()
    page.locator("#tab-events").wait_for(state="visible", timeout=15000)
    page.locator("#evtimeline [data-open], #evtimeline .wk-empty").first.wait_for(timeout=30000)
    assert page.locator("#weekstrip").count() == 1, (
        f"{width}px: Schedule week navigation missing"
    )
    no_overflow(page, width, "Schedule")
    row["screens"]["schedule"] = {"event_rows": page.locator("#evtimeline [data-open]").count()}
    screenshot(page, width, "schedule", failures)

    # A Schedule card must open the same Event Details view without
    # navigating away or losing the selected Schedule tab.
    if row["screens"]["schedule"]["event_rows"]:
        schedule_open = page.locator("#evtimeline [data-open]").first
        schedule_id = schedule_open.get_attribute("data-open")
        schedule_open.scroll_into_view_if_needed()
        schedule_open.click()
        page.locator("#evd .ue-hero").wait_for(state="visible", timeout=20000)
        screenshot(page, width, "schedule-event-details", failures)
        page.keyboard.press("Escape")
        page.locator("#evd").wait_for(state="hidden", timeout=10000)
        assert page.locator("#tab-events").is_visible(), (
            f"{width}px: closing Schedule details lost the Schedule view"
        )
        row["screens"]["schedule"]["opened_event_id"] = schedule_id
    else:
        row["screens"]["schedule"]["detail_link_skipped"] = "No schedule events in the live week"

    # Research must render real verified groups, not a perpetual loading placeholder.
    page.evaluate("() => { GO.showTab('events', 'research'); return true; }")
    page.locator("#sub-research").wait_for(state="visible", timeout=20000)
    page.locator("#research-list .research-event, #research-list .research-empty").first.wait_for(timeout=30000)
    research_count = page.locator("#research-list .research-event").count()
    assert research_count >= 1, f"{width}px: verified live research groups missing"
    assert page.locator("#research-search").count() == 1, (
        f"{width}px: Research search unavailable"
    )
    no_overflow(page, width, "Research")
    row["screens"]["research"] = {"groups": research_count}
    screenshot(page, width, "research", failures)

    page.locator('#tabs [data-tab="raids"]').click()
    page.locator("#tab-raids").wait_for(state="visible", timeout=15000)
    page.locator("#rotnow .rw-raid, #rotnow .rw-max-pokemon, #rotnow .rw-empty").first.wait_for(
        timeout=30000
    )
    battle = page.locator("#rotnow").inner_text().strip()
    assert len(battle) >= 30, f"{width}px: Battle screen missing rotation information"
    no_overflow(page, width, "Battle")
    row["screens"]["battle"] = {"has_raid_content": bool(battle)}
    screenshot(page, width, "battle", failures)

    page.locator('#tabs [data-tab="collect"]').click()
    page.locator("#tab-collect").wait_for(state="visible", timeout=15000)
    page.locator("#tab-dex").wait_for(state="visible", timeout=15000)
    page.locator("#dq").wait_for(state="visible", timeout=15000)
    page.wait_for_function(
        "() => Number(document.getElementById('dTotal')?.textContent || 0) > 0",
        timeout=30000,
    )
    no_overflow(page, width, "Collection")
    row["screens"]["collection"] = {
        "dex_total": int(page.locator("#dTotal").inner_text().replace(",", "").strip())
    }
    screenshot(page, width, "collection", failures)

    assert not row["page_errors"], f"{width}px: browser errors {row['page_errors']}"
    return row


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"target": BASE, "checks": [], "failures": []}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        try:
            for width in WIDTHS:
                print(f"LIVE_CORE_BEGIN {width}px", flush=True)
                context = browser.new_context(
                    viewport={"width": width, "height": 844},
                    timezone_id="Australia/Melbourne",
                    is_mobile=True, has_touch=True,
                    color_scheme="dark", service_workers="block",
                )
                context.route(
                    "**/*",
                    lambda route: route.continue_()
                    if route.request.method in ("GET", "HEAD") else route.abort(),
                )
                page = context.new_page()
                try:
                    report["checks"].append(inspect(page, width, report["failures"]))
                    print(f"PASS live Today, GO Pass, Schedule, Research, Battle, Collection {width}px", flush=True)
                except Exception as exc:
                    report["failures"].append({"width": width, "error": str(exc)})
                    print(f"FAIL live core journey {width}px: {exc}", flush=True)
                    screenshot(page, width, "failed-journey", report["failures"])
                finally:
                    context.close()
        finally:
            browser.close()
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    return 1 if report["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
