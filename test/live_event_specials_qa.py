#!/usr/bin/env python3
"""Read-only production acceptance: Coin Bag form, 10 km eggs and dated raid bosses.

This uses the deployed public app and public images, not local fixtures or
mocked API replies. It must not write player state, access private endpoints,
or substitute guessed artwork when a verified source cannot render.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("GOFN_ART_QA_URL", "https://pogo.michaelpuff.com").rstrip("/")
OUT = Path(os.environ.get("GOFN_EVENT_QA_OUT", "artifacts/live-event-specials"))
WIDTHS = (360, 390, 430)
EGGS = ("Honedge", "Klefki", "Drampa", "Duraludon")
BOSSES = {
    "2026-11-14": ("Zekrom", "White Kyurem", "Dynamax Dialga", "Gigantamax Duraludon"),
    "2026-11-15": ("Reshiram", "Black Kyurem", "Dynamax Palkia", "Gigantamax Duraludon"),
}


def inspect(page, width: int) -> dict:
    report: dict = {"width": width, "errors": []}
    errors = report["errors"]
    page.on("pageerror", lambda error: errors.append(str(error)))
    response = page.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
    assert response is not None and response.ok, f"{width}px: public app HTTP error"
    page.wait_for_function(
        "() => !!window.GODETAIL && !!window.GOEventRegistry && GOEventRegistry.settled()",
        timeout=45000,
    )
    print(f"LIVE_EVENT_QA_STAGE {width}px shell-ready", flush=True)

    # Coin Bag should never silently render a Chest Form sprite or wild edge.
    # GODETAIL.open may return a pending promise while content is loading;
    # do not let Playwright wait forever on its return value. The selector
    # assertion below is the bounded, user-visible readiness check.
    page.evaluate("() => { GODETAIL.open('into'); return true; }")
    page.wait_for_selector('#evd .ue-mon[data-identity="999:roaming:none"]', timeout=30000)
    coin = page.locator('#evd .ue-mon[data-identity="999:roaming:none"]').first
    assert "Coin Bag" in coin.inner_text(), f"{width}px: Roaming encounter lacks Coin Bag access"
    assert page.locator('#evd .ue-mon[data-identity="999:base:none"]').count() == 0, (
        f"{width}px: unverified generic/Chest Gimmighoul on Into the Wild"
    )
    report["coin_bag_roaming"] = True
    print(f"LIVE_EVENT_QA_STAGE {width}px roaming-ready", flush=True)

    page.evaluate("() => { GODETAIL.open('cur:wag'); return true; }")
    page.wait_for_selector('#evd .ue-raid-day[data-raid-date="2026-11-14"]', timeout=30000)

    # Source-declared hatch distance must be shown as the actual colour-specific
    # 10 km egg art in the top-right of each matching Pokémon tile.
    egg_cards = page.locator('#evd .ue-method[data-method="egg"] .ue-mon')
    report["egg_tiles"] = egg_cards.count()
    print(f"LIVE_EVENT_QA_STAGE {width}px egg-tiles={report['egg_tiles']}", flush=True)
    if egg_cards.count() != 4:
        # Keep production-only mismatch diagnostics even when the browser
        # assertion blocks the PR. Never mutate the source or player data.
        report["source_join"] = page.evaluate("""async () => {
          let details = {}, fetchError = null;
          try {
            const response = await fetch('/event-details.json', {
              cache:'no-store', signal:AbortSignal.timeout(15000)
            });
            details = (await response.json()).events || {};
          } catch (error) { fetchError = String(error).slice(0,160); }
          const source = details['leekduck:pokemon-go-wild-area-2026-global'];
          const ev = (GODASH.events()||[]).find(x=>x.id==='cur:wag'||x.id==='wag');
          const curated = ((GO.D&&GO.D.events)||[]).find(x=>x.id==='wag');
          const model = GOEventRegistry.find('wag');
          const trySource = source&&model&&GOEventAdapter.reconcileSourcedEggs(model,source);
          const list = (m) => (m?.encounters||[]).filter(e=>e.method==='egg')
            .map(e=>(m.pokemon||[]).find(p=>p.key===e.identityKey)?.name||e.identityKey);
          return {
            fetchError,
            eventId:ev?.id, eventDetailIds:ev?.detailIds||null,
            curatedDetailIds:curated?.detailIds||null,
            sourceEggs:list(source), registryEggs:list(model),
            reconciledFromDirectSource:list(trySource),
            directSourceComplete:!!source?.fields?.eggs?.some(e=>/the following pok/i.test(e.text||'')),
            appSupportsEggPool:String(GOEventAdapter.reconcileSourcedEggs).includes('eggPool'),
            worldVersion:document.querySelector('link[href*="event-redesign.css"]')?.getAttribute('href')
          };
        }""")
        print("LIVE_EGG_SOURCE_JOIN", json.dumps(report["source_join"]), flush=True)
    assert egg_cards.count() == 4, f"{width}px: expected 4 sourced egg encounters, got {egg_cards.count()}"
    report["eggs"] = []
    report["egg_marker_visual"] = {}
    for name in EGGS:
        card = egg_cards.filter(has_text=name)
        assert card.count() == 1, f"{width}px: missing/duplicate egg encounter {name}"
        image = card.locator('.ue-egg-corner.ue-egg-10 img[src="/ico/g/egg-10km.webp"]')
        assert image.count() == 1, f"{width}px: {name} lacks correct colour/distance egg image"
        # The gallery sits below Overview and the icon has loading="lazy".
        # Scroll to trigger the real user-visible request before decoding.
        image.first.scroll_into_view_if_needed(timeout=15000)
        # Locator.evaluate can await img.decode() indefinitely: the locator
        # timeout covers element resolution, not a pending image Promise.
        # Bound the decode itself and fail with actionable evidence.
        # Egg tiles are below the initial phone viewport, and the icon can be
        # lazy-loaded. Scroll the actual icon into view before decoding it.
        # Preserve the real-byte image requirement; never accept a placeholder.
        image.first.scroll_into_view_if_needed(timeout=10000)
        try:
            image.first.evaluate("""img => Promise.race([
                img.decode(),
                new Promise((_, reject) => setTimeout(
                    () => reject(new Error('10 km egg icon decode timed out')), 10000))
            ])""")
        except Exception as exc:
            state = image.first.evaluate("""img => ({
                src: img.getAttribute('src'), loading: img.loading,
                complete: img.complete, naturalWidth: img.naturalWidth,
                currentSrc: img.currentSrc
            })""")
            raise AssertionError(f"{width}px: {name} 10 km egg image not decoded: {state}") from exc
        assert image.first.evaluate("(img) => img.complete && img.naturalWidth > 0"), (
            f"{width}px: {name} 10 km egg art did not render"
        )
        report["eggs"].append(name)
        # Production CSS must match the approved icon-only UI, not merely
        # return an image successfully. Test all four hatch tiles at phone widths.
        visual = image.first.evaluate("""img => {
            const marker = img.parentElement, tile = img.closest('button.ue-mon');
            const style = getComputedStyle(marker);
            const box = marker.getBoundingClientRect();
            const icon = img.getBoundingClientRect();
            const art = tile?.querySelector('.ue-mon-art')?.getBoundingClientRect();
            return {
                width: box.width, height: box.height,
                iconWidth: icon.width, iconHeight: icon.height,
                artWidth: art?.width || 0,
                background: style.backgroundColor,
                border: style.borderTopWidth,
                shadow: style.boxShadow,
                text: marker.textContent.trim(),
                children: marker.children.length,
                extraEggPill: !!tile?.querySelector('.ue-b-egg, .ue-km-10'),
                accessible: tile?.getAttribute('aria-label') || '',
                insideTile: !!tile && box.right <= tile.getBoundingClientRect().right + 1
                    && box.left >= tile.getBoundingClientRect().left - 1
            };
        }""")
        assert visual["children"] == 1 and visual["text"] == "", (
            f"{width}px: {name} has an oversized text-bearing egg marker: {visual}"
        )
        assert 0 < visual["width"] <= 22 and 0 < visual["height"] <= 22, (
            f"{width}px: {name} corner marker is too large: {visual}"
        )
        assert 0 < visual["iconWidth"] <= 22 and 0 < visual["iconHeight"] <= 22, (
            f"{width}px: {name} egg artwork is too large: {visual}"
        )
        assert visual["background"] in ("transparent", "rgba(0, 0, 0, 0)"), (
            f"{width}px: {name} still has a filled badge behind its egg: {visual}"
        )
        assert visual["border"] == "0px" and visual["shadow"] == "none", (
            f"{width}px: {name} egg marker still has a badge border/shadow: {visual}"
        )
        assert not visual["extraEggPill"] and "10 km egg" in visual["accessible"], (
            f"{width}px: {name} has a redundant km badge or missing accessible distance: {visual}"
        )
        assert visual["insideTile"] and visual["artWidth"] >= 50, (
            f"{width}px: {name} egg marker overlaps outside the Pokémon tile: {visual}"
        )
        report["egg_marker_visual"][name] = visual
    # Capture the actual in-production egg gallery, not only the page's hero.
    # This makes the user's reported obscured Pokémon art visually reviewable.
    page.locator('#evd .ue-method[data-method="egg"]').first.screenshot(
        path=str(OUT / f"go-wild-egg-icons-{width}.png"),
        animations="disabled", timeout=15000,
    )
    print(f"LIVE_EGG_ICON_ONLY_QA {width}px " + json.dumps(report["egg_marker_visual"]), flush=True)
    egg_resource = page.request.get(BASE + "/ico/g/egg-10km.webp", timeout=20000)
    assert egg_resource.status == 200 and "image/" in egg_resource.headers.get("content-type", ""), (
        "The live 10 km icon did not return an image"
    )

    report["raid_days"] = {}
    report["raid_form_art"] = {}
    gigantamax_sources = set()
    for date, names in BOSSES.items():
        day = page.locator(f'#evd .ue-raid-day[data-raid-date="{date}"]')
        assert day.count() == 1, f"{width}px: missing or duplicate day-specific raid block {date}"
        text = day.inner_text()
        for name in names:
            assert name in text, f"{width}px: {date} missing {name}"
            boss = day.locator("li").filter(has_text=name)
            assert boss.count() == 1, f"{width}px: {date} duplicate/missing {name} artwork row"
            assert boss.locator("img").count() >= 1, f"{width}px: {name} has no image element"
            # For each published Max form, verify the *displayed* image, not
            # just the existence of an img tag or an inferred event-title badge.
            # This is a reusable form-identity assertion: future event rosters
            # that use Dynamax/Gigantamax prefixes inherit the same check.
            if name.startswith(("Dynamax ", "Gigantamax ")):
                art = boss.locator(".ue-raid-day-art img.art").first
                assert art.count() == 1, f"{width}px: {date} {name} missing form artwork"
                # CSS animates the Dynamax glow continuously, so Playwright's
                # scroll_into_view_if_needed() will never see a "stable" image.
                # Browser-native scrolling has no stability precondition.
                art.evaluate("(img) => img.scrollIntoView({block: 'center', behavior: 'instant'})")
                art.evaluate("(img) => img.decode()", timeout=20000)
                visual = art.evaluate("""(img) => ({
                    src: img.getAttribute('src'),
                    alt: img.alt,
                    loaded: img.complete && img.naturalWidth > 0,
                    dynamax: img.getAttribute('data-sd') === '1',
                    gigantamax: img.classList.contains('gm-real'),
                    glow: getComputedStyle(img).filter
                })""")
                assert visual["loaded"], f"{width}px: {date} {name} image has no pixels"
                assert visual["alt"].startswith(name), f"{width}px: {name} lost its form-specific alt text"
                if name.startswith("Dynamax "):
                    assert visual["dynamax"] and visual["glow"] != "none", (
                        f"{width}px: {name} appears without its visible Dynamax treatment: {visual}"
                    )
                else:
                    assert visual["gigantamax"], (
                        f"{width}px: {name} is using an unverified/non-Gigantamax sprite: {visual}"
                    )
                    gigantamax_sources.add(visual["src"])
                report["raid_form_art"][f"{date}:{name}"] = visual
        report["raid_days"][date] = list(names)

    # The same species appears as ordinary Duraludon in the sourced 10 km
    # hatch gallery; Gigantamax Duraludon must not reuse its ordinary icon.
    ordinary_duraludon = egg_cards.filter(has_text="Duraludon").first.locator("img.art").first
    assert ordinary_duraludon.count() == 1, f"{width}px: ordinary Duraludon egg art missing"
    ordinary_src = ordinary_duraludon.get_attribute("src")
    assert len(gigantamax_sources) == 1 and ordinary_src not in gigantamax_sources, (
        f"{width}px: Gigantamax Duraludon uses normal sprite or varies by raid day"
    )
    assert "Reshiram" not in page.locator('[data-raid-date="2026-11-14"]').inner_text()
    assert "White Kyurem" not in page.locator('[data-raid-date="2026-11-15"]').inner_text()

    # Verify the actual deployed page, not only a fixture, preserves the
    # two hourly habitats and two different Mighty day lineups. These are
    # informational tiles, never Collection Track/Follow controls.
    rotations = page.locator('#evd-s-encounters .uer-root[data-rotation-id="gowa-2026-global"]')
    assert rotations.count() == 1, f"{width}px: source-backed Wild Area rotations missing"
    habitat_counts = {
        kind: rotations.locator(f'[data-habitat="{kind}"] .uer-pokemon-tile').count()
        for kind in ("steel", "dragon")
    }
    assert habitat_counts == {"steel": 22, "dragon": 22}, (
        f"{width}px: wrong published hourly habitat roster: {habitat_counts}"
    )
    mighty = {
        day: rotations.locator(f'[data-mighty-date="{day}"]')
        for day in ("2026-11-14", "2026-11-15")
    }
    assert all(tile.locator('.uer-pokemon-tile').count() == 9 for tile in mighty.values()), (
        f"{width}px: day-specific Mighty Pokémon roster missing"
    )
    assert "Metagross" in mighty["2026-11-14"].inner_text() and "Hydreigon" not in mighty["2026-11-14"].inner_text()
    assert "Hydreigon" in mighty["2026-11-15"].inner_text() and "Metagross" not in mighty["2026-11-15"].inner_text()
    ticket_only = rotations.locator('[data-shared-id="ticket-incense"]')
    assert ticket_only.locator('.uer-pokemon-tile').count() == 2
    assert all(x in ticket_only.inner_text() for x in ("Latias", "Latios", "Ticket-only Incense"))
    assert rotations.locator('.uer-pokemon-tile').count() == 64
    assert not rotations.locator('[data-track],[data-follow],.ue-mon-controls').count()
    report["wild_area_rotations"] = {
        "habitats": habitat_counts,
        "mighty": {"2026-11-14": 9, "2026-11-15": 9},
        "ticket_incense": ["Latias", "Latios"],
    }

    report["horizontal_overflow"] = page.evaluate(
        "() => document.documentElement.scrollWidth > window.innerWidth + 1"
    )
    assert not report["horizontal_overflow"], f"{width}px: horizontal overflow in event details"
    assert not errors, f"{width}px: page errors: {errors}"
    return report


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"target": BASE, "checks": [], "failures": []}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        try:
            for width in WIDTHS:
                print(f"LIVE_EVENT_QA_BEGIN {width}px", flush=True)
                ctx = browser.new_context(
                    viewport={"width": width, "height": 844},
                    timezone_id="Australia/Melbourne",
                    is_mobile=True, has_touch=True, service_workers="block",
                )
                def readonly(route):
                    if route.request.method in ("GET", "HEAD"):
                        route.continue_()
                    else:
                        route.abort()
                ctx.route("**/*", readonly)
                page = ctx.new_page()
                try:
                    item = inspect(page, width)
                    report["checks"].append(item)
                    print(f"PASS live event form, 4 hatch tiles, dated raid groups at {width}px", flush=True)
                except Exception as exc:
                    report["failures"].append({"width": width, "error": str(exc)})
                    print(f"FAIL live event-specials {width}px: {exc}", flush=True)
                finally:
                    try:
                        page.screenshot(
                            path=str(OUT / f"go-wild-event-details-{width}.png"),
                            full_page=True, animations="disabled", timeout=15000,
                        )
                    except Exception as exc:
                        report["failures"].append({"width": width, "screenshot": str(exc)})
                    ctx.close()
        finally:
            browser.close()
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    return 1 if report["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
