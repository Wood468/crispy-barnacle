#!/usr/bin/env python3
"""Read-only live art acceptance check for exact Pokémon forms and Into the Wild.

Unlike local browser tests, this requests the *deployed* Worker and compares its
PNG payload byte-for-byte with the expected PokeAPI form artwork. It also opens
the live event at three phone widths and saves tile screenshots and diagnostics.

Do not insert secrets, authenticate, or perform non-GET requests here.
"""
from __future__ import annotations

import hashlib
import json
import os
import struct
import sys
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit

from playwright.sync_api import sync_playwright

BASE = os.environ.get("GOFN_ART_QA_URL", "https://pogo.michaelpuff.com").rstrip("/")
OUT = Path(os.environ.get("GOFN_ART_QA_OUT", "artifacts/live-form-art"))
UPSTREAM = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/"
CASES = (
    ("Crowned Sword Zacian", 10188, "Zacian", 888),
    ("Crowned Shield Zamazenta", 10189, "Zamazenta", 889),
    ("Gimmighoul (Roaming Form)", 10263, "Gimmighoul", 999),
    ("Gimmighoul (Chest Form)", 999, "Gimmighoul", 999),
)
CROWNED = CASES[:2]
DYNAMAX = ("Dynamax Registeel", "Dynamax Regidrago",
           "Dynamax Latias", "Dynamax Latios")
DISPLAY_NAMES = tuple(item[0] for item in CROWNED) + DYNAMAX
PNG = b"\x89PNG\r\n\x1a\n"


def png_metadata(data: bytes) -> dict:
    if len(data) < 33 or not data.startswith(PNG) or data[12:16] != b"IHDR":
        raise ValueError("Not a valid PNG header")
    width, height = struct.unpack(">II", data[16:24])
    if not 16 <= width <= 8192 or not 16 <= height <= 8192:
        raise ValueError("Implausible PNG dimensions")
    return {
        "bytes": len(data),
        "width": width,
        "height": height,
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def get_image(request, url: str, errors: list, label: str):
    try:
        response = request.get(url, timeout=30000)
        status = response.status
        body = response.body()
        record = {"url": url, "status": status,
                  "content_type": response.headers.get("content-type", "")}
        if status != 200:
            errors.append(f"{label}: HTTP {status} at {url}")
            return record, b""
        if not record["content_type"].lower().startswith("image/png"):
            errors.append(f"{label}: unexpected MIME {record['content_type']!r}")
        try:
            record.update(png_metadata(body))
        except ValueError as exc:
            errors.append(f"{label}: {exc}")
        return record, body
    except Exception as exc:
        errors.append(f"{label}: request failed: {exc}")
        return {"url": url, "error": str(exc)}, b""


def event_data(request, errors: list) -> dict:
    result = {"url": BASE + "/event-details.json"}
    try:
        response = request.get(result["url"], timeout=30000)
        result["status"] = response.status
        if response.status != 200:
            errors.append(f"Live event-details.json returned HTTP {response.status}")
            return result
        event = response.json()["events"]["into"]
        mons = {p["key"]: p for p in event["pokemon"]}
        encounters = {(e["identityKey"], e["method"]) for e in event["encounters"]}
        expected = (
            ("888:crowned-sword:none", "raid"),
            ("889:crowned-shield:none", "raid"),
            ("379:dynamax:none", "max"),
            ("895:dynamax:none", "max"),
            ("380:dynamax:none", "max"),
            ("381:dynamax:none", "max"),
        )
        missing = [{"key": key, "method": method} for key, method in expected
                   if key not in mons or (key, method) not in encounters]
        result["identities_checked"] = len(expected)
        result["missing_identites"] = missing
        result["updated"] = event.get("updated")
        if missing:
            errors.append(f"Live Into the Wild is missing exact encounters: {missing}")
    except Exception as exc:
        errors.append(f"Could not inspect live event-details.json: {exc}")
        result["error"] = str(exc)
    return result


def live_event_browser(pw, errors: list) -> list:
    snapshots = []
    browser = pw.chromium.launch()
    try:
        for width in (360, 390, 430):
            row = {"width": width, "pokemon": [], "page_errors": []}
            context = None
            try:
                context = browser.new_context(
                    viewport={"width": width, "height": 844},
                    device_scale_factor=2, is_mobile=True, has_touch=True,
                    timezone_id="Australia/Melbourne", service_workers="block",
                )
                # Safely visit public pages without submitting settings or player data.
                def readonly(route):
                    if route.request.method in ("GET", "HEAD"):
                        route.continue_()
                    else:
                        route.abort()
                context.route("**/*", readonly)
                page = context.new_page()
                page.on("pageerror", lambda exc: row["page_errors"].append(str(exc)))
                page.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
                page.wait_for_function(
                    "() => !!window.GODETAIL && !!window.GOEventRegistry && GOEventRegistry.settled()",
                    timeout=45000,
                )
                page.evaluate("() => GODETAIL.open('into')")
                page.wait_for_selector("#evd .ue-mon", timeout=30000)
                row["tile_count"] = page.locator("#evd .ue-mon").count()
                # Some sources use hyphenated Crowned form IDs while others
                # omit the separator. Both keys remain valid in Collection;
                # the raid gallery must display each physical boss only once.
                row["crowned_raid_tiles"] = {}
                for species, canonical, alias in (
                    ("888", "crowned-sword", "crownedsword"),
                    ("889", "crowned-shield", "crownedshield"),
                ):
                    selector = ", ".join(
                        f'#evd .ue-method[data-method="raid"] '
                        f'.ue-mon[data-identity="{species}:{form}:none"]'
                        for form in (canonical, alias)
                    )
                    tiles = page.locator(selector)
                    count = tiles.count()
                    row["crowned_raid_tiles"][species] = {
                        "count": count,
                        "identities": [
                            tiles.nth(i).get_attribute("data-identity")
                            for i in range(count)
                        ],
                    }
                    if count != 1:
                        errors.append(
                            f"{width}px: expected one Crowned raid tile for "
                            f"species {species}, found {count}"
                        )
                # The Coin Bag and GO Pass may use the correct *name* but
                # still accidentally point to the default Chest Form picture.
                row["gimmighoul_art"] = page.evaluate("""() => [
                    ...document.querySelectorAll('#evd img[alt*="Gimmighoul"]')
                ].map(i => ({
                    alt: i.alt, src: i.getAttribute('src'),
                    near: i.closest('.ue-mon,.ue-pass-rank,.research-reward')?.textContent?.slice(0,160)
                }))""")
                row["gimmighoul_models"] = page.evaluate("""() => ({
                    catalogue: (GOEventRegistry.find('into')?.pokemon || []).filter(
                        p => /gimmighoul/i.test(p.name||'') || String(p.speciesId)==='999'
                    ),
                    pass: (GOEventRegistry.find('into')?.passes || []).filter(
                        p => JSON.stringify(p).toLowerCase().includes('gimmighoul')
                    ).map(p => ({ title: p.title, ranks: (p.stages || []).filter(
                        s => JSON.stringify(s).toLowerCase().includes('gimmighoul')
                    ) }))
                })""")

                for name in DISPLAY_NAMES:
                    mon = {"name": name}
                    tile = page.locator("#evd .ue-mon").filter(has_text=name).first
                    if tile.count() == 0:
                        errors.append(f"{width}px: missing {name} tile in live Event Details")
                        mon["error"] = "tile absent"
                        row["pokemon"].append(mon)
                        continue
                    tile.scroll_into_view_if_needed(timeout=15000)
                    img = tile.locator("img.art").first
                    try:
                        if img.count():
                            img.evaluate("(i) => i.decode()", timeout=20000)
                    except Exception as exc:
                        mon["decode_error"] = str(exc)[:280]
                    # The image error handler may replace a failed image with
                    # an explicitly labelled base-art placeholder.
                    mon["fallback_label"] = tile.locator(".art-fb .form-chip, .costume-unavailable").all_inner_texts()
                    img = tile.locator("img.art").first
                    if img.count():
                        mon.update(img.evaluate("""i => ({
                            alt: i.alt, src: i.getAttribute('src'),
                            current_src: i.currentSrc, complete: i.complete,
                            natural_width: i.naturalWidth, natural_height: i.naturalHeight
                        })"""))
                    else:
                        mon["error"] = "exact image not rendered"
                    if mon["fallback_label"]:
                        errors.append(f"{width}px: {name} renders the unavailable-art fallback")
                    if not mon.get("complete") or mon.get("natural_width", 0) <= 0:
                        errors.append(f"{width}px: {name} image did not decode")
                    src_name = parse_qs(urlsplit(mon.get("src", "")).query).get("n", [""])[0]
                    if src_name != name:
                        errors.append(f"{width}px: {name} uses unexpected art URL {mon.get('src')}")
                    if name in DYNAMAX:
                        # Game Dynamax is a species image with a visible Dynamax
                        # treatment, not an invented independent sprite.
                        route_params = parse_qs(urlsplit(mon.get("src", "")).query)
                        mon["dynamax_treatment"] = route_params.get("dynamax") == ["1"]
                        if not mon["dynamax_treatment"]:
                            errors.append(f"{width}px: {name} is missing its Dynamax treatment flag")
                    if name.lower() not in str(mon.get("alt", "")).lower():
                        errors.append(f"{width}px: {name} image has incorrect alt {mon.get('alt')}")
                    try:
                        tile.screenshot(path=str(OUT / f"{width}-{name.lower().replace(' ', '-')}.png"),
                                        timeout=15000)
                    except Exception as exc:
                        mon["screenshot_error"] = str(exc)[:180]
                    row["pokemon"].append(mon)
                row["horizontal_overflow"] = page.evaluate(
                    "() => document.documentElement.scrollWidth > window.innerWidth + 1"
                )
                if row["horizontal_overflow"]:
                    errors.append(f"{width}px: Event Details overflows horizontally")
                page.screenshot(path=str(OUT / f"{width}-into-the-wild.png"),
                                animations="disabled", timeout=20000)
            except Exception as exc:
                row["error"] = str(exc)
                errors.append(f"{width}px live Event Details check failed: {exc}")
            finally:
                if context:
                    context.close()
            snapshots.append(row)
    finally:
        browser.close()
    return snapshots


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    errors = []
    report = {"target": BASE, "form_art": [], "event_details": {}, "viewport_checks": []}
    try:
        with sync_playwright() as pw:
            request = pw.request.new_context(
                user_agent="GO-Field-Notes-read-only-art-QA/1.0",
                extra_http_headers={"Accept": "image/png,application/json"},
            )
            try:
                for name, pokemon_id, base_name, dex_id in CASES:
                    live_url = BASE + "/api/art?n=" + quote(name, safe="")
                    expected_url = UPSTREAM + str(pokemon_id) + ".png"
                    live, live_body = get_image(request, live_url, errors, name + " live")
                    expected, expected_body = get_image(request, expected_url, errors, name + " reference")
                    match = bool(live_body and expected_body and live_body == expected_body)
                    row = {"name": name, "dex_id": dex_id, "expected_form_id": pokemon_id,
                           "live": live, "reference": expected, "matches_exact_png": match}
                    if not match:
                        errors.append(f"{name}: live bytes do not match exact PokeAPI form {pokemon_id}")
                    report["form_art"].append(row)
                # Explicitly reject a fabricated, unpublished future form.
                missing_url = BASE + "/api/art?n=" + quote("Gimmighoul (unannounced future Form)", safe="")
                response = request.get(missing_url, timeout=30000)
                report["unknown_form"] = {"status": response.status, "url": missing_url}
                if response.status != 404:
                    errors.append(f"Unknown future form returned {response.status}, expected 404")
                report["event_details"] = event_data(request, errors)
            finally:
                request.dispose()
            report["viewport_checks"] = live_event_browser(pw, errors)
    except Exception as exc:
        errors.append(f"Live QA could not finish: {exc}")
    report["errors"] = errors
    report["passed"] = not errors
    (OUT / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n",
                                      encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if errors:
        print(f"FAIL: {len(errors)} live artwork acceptance issue(s)", file=sys.stderr)
        return 1
    print("PASS: exact live form bytes and phone Event Details artwork verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
