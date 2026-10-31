#!/usr/bin/env python3
"""Read-only production image waterfall sampler for GO Field Notes."""
from __future__ import annotations
import json
import os
import sys
from datetime import datetime, timezone
from urllib.parse import urlsplit, urljoin

DEFAULT_URL = "https://pogo.michaelpuff.com/"
VIEWPORT = {"width": 390, "height": 844}
DEVICE_SCALE_FACTOR = 3
VIEWPORT_PROFILES = [
    {"name": "mobile-compact", "viewport": {"width": 320, "height": 740}, "device_scale_factor": 3},
    {"name": "mobile-standard", "viewport": {"width": 390, "height": 844}, "device_scale_factor": 3},
    {"name": "desktop", "viewport": {"width": 1440, "height": 900}, "device_scale_factor": 1},
]


def scroll_positions(content_height: int, viewport_height: int, fraction: float = 0.75) -> list[int]:
    """Return overlapping document scroll positions, including the final viewport."""
    height = max(0, int(content_height or 0))
    viewport = max(1, int(viewport_height or 1))
    bottom = max(0, height - viewport)
    if bottom == 0:
        return [0]
    step = max(1, int(viewport * fraction))
    positions = list(range(0, bottom + 1, step))
    if positions[-1] != bottom:
        positions.append(bottom)
    return positions


def scroll_document(page, viewport_height: int, delay_ms: int = 250) -> dict:
    """Scroll through the full document in overlapping viewport-sized increments."""
    height = int(page.evaluate(
        "() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)"
    ))
    positions = scroll_positions(height, viewport_height)
    for y in positions:
        page.evaluate("(y) => window.scrollTo(0, y)", y)
        page.wait_for_timeout(delay_ms)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(350)
    return {
        "content_height": height,
        "steps": len(positions),
        "last_y": positions[-1] if positions else 0,
    }

def image_kind(url: str) -> str:
    path = urlsplit(url).path.lower()
    return "infographic-poster" if path.startswith(("/infographics/", "/img/ext/")) else "other-image"

def payload_bytes(headers: dict, body: bytes) -> int:
    raw = headers.get("content-length") or headers.get("Content-Length") or ""
    try:
        declared = int(raw)
    except (TypeError, ValueError):
        declared = 0
    return declared if declared > 0 else len(body or b"")

def resource_label(url: str) -> str:
    parsed = urlsplit(url)
    return (parsed.hostname or "local") + parsed.path

def summarize(records: list[dict]) -> dict:
    posters = [item for item in records if item["kind"] == "infographic-poster"]
    return {
        "image_responses": len(records),
        "image_payload_bytes": sum(item["bytes"] for item in records),
        "poster_responses": len(posters),
        "poster_payload_bytes": sum(item["bytes"] for item in posters),
        "largest_posters": [
            {"resource": item["resource"], "bytes": item["bytes"], "status": item["status"]}
            for item in sorted(posters, key=lambda item: item["bytes"], reverse=True)[:5]
        ],
    }


def is_today_tab(attributes: dict) -> bool:
    """Recognise the live app tab and the temporary boot-navigation tab."""
    return (
        attributes.get("data-tab") == "now"
        or attributes.get("data-boot-tab") == "now"
        or attributes.get("aria-controls") == "tab-now"
    )


def detail_poster_results(expected: list[dict], records: list[dict]) -> list[dict]:
    """Match each event poster to an image response observed after its detail opens."""
    results = []
    for item in expected:
        matches = [
            record for record in records
            if record.get("phase") == "season_details_on_demand"
            and record.get("resource") == item["resource"]
        ]
        results.append({
            "id": item.get("id", ""),
            "name": item.get("name", ""),
            "resource": item["resource"],
            "loaded": any(record.get("status") == 200 and record.get("bytes", 0) > 0 for record in matches),
            "bytes": sum(record.get("bytes", 0) for record in matches),
            "status": matches[-1].get("status") if matches else None,
        })
    return results


def format_bytes(value: int) -> str:
    return f"{value:,} B"

def run_audit(target: str, viewport: dict | None = None, device_scale_factor: int | None = None) -> dict:
    active_viewport = viewport or VIEWPORT
    active_scale = DEVICE_SCALE_FACTOR if device_scale_factor is None else device_scale_factor
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError("Playwright is not installed") from exc

    records: list[dict] = []
    page_errors: list[str] = []
    phase = {"name": "today"}

    def guard(route):
        request = route.request
        if urlsplit(request.url).path.startswith("/api/") or request.method not in ("GET", "HEAD"):
            route.abort()
        else:
            route.continue_()

    def capture(response):
        request = response.request
        if request.resource_type != "image":
            return
        try:
            headers = response.headers
            body = response.body()
            size = payload_bytes(headers, body)
        except Exception:
            headers = {}
            size = 0
        records.append({
            "phase": phase["name"],
            "resource": resource_label(response.url),
            "kind": image_kind(response.url),
            "status": response.status,
            "bytes": size,
            "content_type": headers.get("content-type", ""),
        })

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                viewport=active_viewport,
                device_scale_factor=active_scale,
                is_mobile=active_viewport["width"] <= 560,
                has_touch=active_viewport["width"] <= 560,
                service_workers="block",
            )
            context.route("**/*", guard)
            page = context.new_page()
            page.on("response", capture)
            page.on("pageerror", lambda error: page_errors.append(str(error)[:300]))
            response = page.goto(target, wait_until="domcontentloaded", timeout=45000)
            if response is not None and response.status >= 400:
                raise RuntimeError(f"Production page returned HTTP {response.status}")
            page.wait_for_function(
                "() => !!window.GO && !!document.querySelector('#tabs [role=tab]')",
                timeout=25000,
            )
            page.wait_for_timeout(2000)
            today_records = [item for item in records if item["phase"] == "today"]

            schedule_opened = False
            tabs = page.locator("#tabs [role=tab]")
            for index in range(tabs.count()):
                tab = tabs.nth(index)
                label = tab.inner_text().strip().lower()
                if "schedule" in label or label == "events":
                    phase["name"] = "schedule"
                    tab.click(timeout=10000)
                    page.wait_for_function(
                        "() => { const el = document.getElementById('tab-events'); return !!el && !el.hidden; }",
                        timeout=10000,
                    )
                    page.wait_for_timeout(2000)
                    schedule_opened = True
                    break

            schedule_records = [item for item in records if item["phase"] == "schedule"]

            schedule_scroll = {"content_height": 0, "steps": 0, "last_y": 0}
            if schedule_opened:
                phase["name"] = "schedule_deep_scroll"
                schedule_scroll = scroll_document(page, active_viewport["height"])
                page.wait_for_timeout(500)
            schedule_deep_records = [item for item in records if item["phase"] == "schedule_deep_scroll"]

            # Return to Today, then measure full Season/GO Pass posters only after opening each card.
            phase["name"] = "today_reactivation"
            today_tab = None
            for index in range(tabs.count()):
                tab = tabs.nth(index)
                attributes = {
                    "data-tab": tab.get_attribute("data-tab") or "",
                    "data-boot-tab": tab.get_attribute("data-boot-tab") or "",
                    "aria-controls": tab.get_attribute("aria-controls") or "",
                }
                if is_today_tab(attributes):
                    today_tab = tab
                    break
            today_tab_reactivated = today_tab is not None
            if today_tab is not None:
                today_tab.click(timeout=10000)
                page.wait_for_function(
                    "() => { const el = document.getElementById('tab-now'); return !!el && !el.hidden; }",
                    timeout=10000,
                )

            season_cards = page.locator("#seasonbar .ssn-card")
            season_items = []
            season_bar = page.locator("#seasonbar")
            if season_bar.count() and season_bar.is_visible():
                season_items = season_cards.evaluate_all(
                    """cards => cards.map(card => {
                        const id = card.dataset.open || "";
                        const events = window.GOSEASON && window.GOSEASON.events ? window.GOSEASON.events() : [];
                        const event = events.find(item => item.id === id);
                        return { id, name: event ? event.name : card.innerText.trim(), img: event ? event.img : "" };
                    })"""
                )

            expected_posters = [
                {**item, "resource": resource_label(urljoin(target, item["img"]))}
                for item in season_items if item.get("img")
            ]
            detail_errors = []
            detail_opened = 0
            phase["name"] = "season_details_on_demand"
            for index, item in enumerate(season_items):
                if not item.get("img"):
                    continue
                try:
                    season_cards.nth(index).click(timeout=10000)
                    page.wait_for_function(
                        "() => { const modal = document.getElementById('evd'); return !!modal && !modal.hidden; }",
                        timeout=10000,
                    )
                    detail_opened += 1
                    page.wait_for_function(
                        """expected => {
                            const modal = document.getElementById('evd');
                            const img = modal && modal.querySelector('img.evd-banner');
                            return !!img && img.getAttribute('src') === expected && img.complete && img.naturalWidth > 0;
                        }""",
                        arg=item["img"],
                        timeout=15000,
                    )
                    page.wait_for_timeout(250)
                except Exception as exc:
                    detail_errors.append({
                        "id": item.get("id", ""),
                        "name": item.get("name", ""),
                        "error": str(exc)[:200],
                    })
                finally:
                    try:
                        close = page.locator("#evd-x")
                        if close.count() and close.is_visible():
                            close.click(timeout=5000)
                            page.wait_for_function(
                                "() => { const modal = document.getElementById('evd'); return !modal || modal.hidden; }",
                                timeout=5000,
                            )
                    except Exception as exc:
                        detail_errors.append({
                            "id": item.get("id", ""),
                            "name": item.get("name", ""),
                            "error": "close: " + str(exc)[:180],
                        })

            today_reactivation_records = [item for item in records if item["phase"] == "today_reactivation"]
            detail_records = [item for item in records if item["phase"] == "season_details_on_demand"]
            poster_results = detail_poster_results(expected_posters, records)
            report = {
                "measured_at_utc": datetime.now(timezone.utc).isoformat(),
                "target": target,
                "viewport": active_viewport,
                "device_scale_factor": active_scale,
                "fresh_context": True,
                "service_workers": "blocked",
                "api_requests": "blocked",
                "non_read_methods": "blocked",
                "schedule_tab_opened": schedule_opened,
                "schedule_scroll": schedule_scroll,
                "today_tab_reactivated": today_tab_reactivated,
                "season_detail_cards_opened": detail_opened,
                "season_detail_posters": poster_results,
                "season_detail_errors": detail_errors,
                "phases": {
                    "today_initial": summarize(today_records),
                    "schedule_activation_incremental": summarize(schedule_records),
                    "schedule_deep_scroll": summarize(schedule_deep_records),
                    "today_reactivation": summarize(today_reactivation_records),
                    "season_details_on_demand": summarize(detail_records),
                },
                "page_errors": page_errors,
                "method": "Content-Length when present; otherwise Playwright response-body length.",
            }
            context.close()
        finally:
            browser.close()
    return report


def open_schedule_tab(page) -> bool:
    tabs = page.locator("#tabs [role=tab]")
    for index in range(tabs.count()):
        tab = tabs.nth(index)
        label = tab.inner_text().strip().lower()
        if "schedule" in label or label == "events":
            tab.click(timeout=10000)
            page.wait_for_function(
                "() => { const el = document.getElementById('tab-events'); return !!el && !el.hidden; }",
                timeout=10000,
            )
            return True
    return False


def run_offline_cache_audit(target: str) -> dict:
    """Prime the live app online, then verify a service-worker-cached revisit offline.

    This pass performs navigation and scrolling only. It does not click event actions,
    submit forms, or issue any application writes.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError("Playwright is not installed") from exc

    records: list[dict] = []
    page_errors: list[str] = []
    failed_images: list[dict] = []
    non_read_methods: list[str] = []
    phase = {"name": "online_today"}
    controller = False
    offline_reload_ok = False
    offline_error = ""
    online_schedule_opened = False
    offline_schedule_opened = False
    online_scroll = {"content_height": 0, "steps": 0, "last_y": 0}
    offline_scroll = {"content_height": 0, "steps": 0, "last_y": 0}

    def capture(response):
        request = response.request
        if request.resource_type != "image":
            return
        try:
            headers = response.headers
            body = response.body()
            size = payload_bytes(headers, body)
        except Exception:
            headers = {}
            size = 0
        try:
            from_service_worker = bool(response.from_service_worker)
        except Exception:
            from_service_worker = False
        records.append({
            "phase": phase["name"],
            "resource": resource_label(response.url),
            "kind": image_kind(response.url),
            "status": response.status,
            "bytes": size,
            "content_type": headers.get("content-type", ""),
            "from_service_worker": from_service_worker,
        })

    def on_request(request):
        if request.method not in ("GET", "HEAD"):
            non_read_methods.append(request.method)

    def on_request_failed(request):
        if request.resource_type == "image":
            failed_images.append({
                "phase": phase["name"],
                "resource": resource_label(request.url),
                "failure": str(request.failure or "request failed")[:180],
            })

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                viewport=VIEWPORT,
                device_scale_factor=DEVICE_SCALE_FACTOR,
                is_mobile=True,
                has_touch=True,
                service_workers="allow",
            )
            page = context.new_page()
            page.on("response", capture)
            page.on("request", on_request)
            page.on("requestfailed", on_request_failed)
            page.on("pageerror", lambda error: page_errors.append(str(error)[:300]))
            response = page.goto(target, wait_until="domcontentloaded", timeout=45000)
            if response is not None and response.status >= 400:
                raise RuntimeError(f"Production page returned HTTP {response.status}")
            page.wait_for_function(
                "() => !!window.GO && !!document.querySelector('#tabs [role=tab]')",
                timeout=25000,
            )
            page.wait_for_timeout(1500)
            try:
                page.wait_for_function(
                    "() => !!navigator.serviceWorker && !!navigator.serviceWorker.controller",
                    timeout=15000,
                )
                controller = True
            except Exception:
                controller = False

            if controller:
                # Reload once while online so this page is definitely controlled before going offline.
                page.reload(wait_until="domcontentloaded", timeout=30000)
                page.wait_for_function(
                    "() => !!window.GO && !!document.querySelector('#tabs [role=tab]')",
                    timeout=25000,
                )
                page.wait_for_timeout(1000)
                online_schedule_opened = open_schedule_tab(page)
                if online_schedule_opened:
                    phase["name"] = "online_schedule_deep_scroll"
                    online_scroll = scroll_document(page, VIEWPORT["height"])
                    page.wait_for_timeout(500)

                context.set_offline(True)
                phase["name"] = "offline_reload_today"
                try:
                    page.reload(wait_until="domcontentloaded", timeout=30000)
                    page.wait_for_function(
                        "() => !!window.GO && !!document.querySelector('#tabs [role=tab]')",
                        timeout=20000,
                    )
                    page.wait_for_timeout(1200)
                    offline_reload_ok = True
                except Exception as exc:
                    offline_error = str(exc)[:300]

                if offline_reload_ok:
                    phase["name"] = "offline_schedule_deep_scroll"
                    offline_schedule_opened = open_schedule_tab(page)
                    if offline_schedule_opened:
                        offline_scroll = scroll_document(page, VIEWPORT["height"])
                        page.wait_for_timeout(500)
            context.close()
        finally:
            browser.close()

    phase_names = [
        "online_today",
        "online_schedule_deep_scroll",
        "offline_reload_today",
        "offline_schedule_deep_scroll",
    ]
    phases = {
        name: summarize([item for item in records if item["phase"] == name])
        for name in phase_names
    }
    offline_image_records = [
        item for item in records
        if item["phase"] in ("offline_reload_today", "offline_schedule_deep_scroll")
    ]
    return {
        "measured_at_utc": datetime.now(timezone.utc).isoformat(),
        "target": target,
        "viewport": VIEWPORT,
        "device_scale_factor": DEVICE_SCALE_FACTOR,
        "service_worker_controlled": controller,
        "offline_reload_ok": offline_reload_ok,
        "offline_reload_error": offline_error,
        "online_schedule_opened": online_schedule_opened,
        "offline_schedule_opened": offline_schedule_opened,
        "online_schedule_scroll": online_scroll,
        "offline_schedule_scroll": offline_scroll,
        "offline_image_responses_from_service_worker": sum(
            1 for item in offline_image_records if item.get("from_service_worker")
        ),
        "non_read_methods": non_read_methods,
        "failed_images": failed_images,
        "page_errors": page_errors,
        "phases": phases,
        "method": "Read-only navigation/scrolling; image payload uses Content-Length when present, otherwise response-body length.",
    }


def run_matrix(target: str) -> dict:
    profiles = []
    for profile in VIEWPORT_PROFILES:
        try:
            report = run_audit(
                target,
                viewport=profile["viewport"],
                device_scale_factor=profile["device_scale_factor"],
            )
            report["profile"] = profile["name"]
        except Exception as exc:
            report = {"profile": profile["name"], "error": str(exc)[:400]}
        profiles.append(report)

    try:
        offline = run_offline_cache_audit(target)
    except Exception as exc:
        offline = {"error": str(exc)[:400], "service_worker_controlled": False, "offline_reload_ok": False}

    return {
        "measured_at_utc": datetime.now(timezone.utc).isoformat(),
        "target": target,
        "profiles": profiles,
        "offline_cache": offline,
    }


def write_matrix_summary(report: dict) -> None:
    lines = [
        "## Production image waterfall matrix (read-only)",
        "",
        f"- Measured: {report['measured_at_utc']}",
        f"- Target: {report['target']}",
        "- Fresh viewport passes block service workers, /api/* and non-GET/HEAD requests.",
        "- Cached-session pass performs only navigation and scrolling; it records any non-read method if one unexpectedly appears.",
        "",
    ]
    for profile in report["profiles"]:
        lines.append(f"### {profile['profile']}")
        if profile.get("error"):
            lines.append(f"- Audit error: {profile['error']}")
            lines.append("")
            continue
        viewport = profile["viewport"]
        lines.append(f"- Viewport: {viewport['width']}×{viewport['height']} at DPR {profile['device_scale_factor']}")
        lines.extend([
            "",
            "| Phase | Image responses | Image payload | Infographic posters | Poster payload |",
            "|---|---:|---:|---:|---:|",
        ])
        phase_labels = [
            ("today_initial", "Today initial load"),
            ("schedule_activation_incremental", "Schedule activation"),
            ("schedule_deep_scroll", "Schedule deep scroll"),
            ("today_reactivation", "Today reactivation"),
            ("season_details_on_demand", "Season/GO Pass details"),
        ]
        for key, label in phase_labels:
            value = profile["phases"][key]
            lines.append(
                f"| {label} | {value['image_responses']} | {format_bytes(value['image_payload_bytes'])} "
                f"| {value['poster_responses']} | {format_bytes(value['poster_payload_bytes'])} |"
            )
        scroll = profile.get("schedule_scroll", {})
        lines.append("")
        lines.append(
            f"- Schedule scroll: {scroll.get('steps', 0)} positions across "
            f"{scroll.get('content_height', 0):,}px of document height."
        )
        if profile.get("season_detail_posters"):
            lines.append("- On-demand detail posters:")
            for item in profile["season_detail_posters"]:
                state = "loaded" if item["loaded"] else "not observed"
                lines.append(f"  - {item['name']} — {state}; {format_bytes(item['bytes'])}; {item['resource']}")
        if profile.get("page_errors"):
            lines.append(f"- Page errors: {len(profile['page_errors'])}")
        if profile.get("season_detail_errors"):
            lines.append(f"- Detail audit warnings: {len(profile['season_detail_errors'])}")
        lines.append("")

    offline = report["offline_cache"]
    lines.extend([
        "### Offline cached-session revisit",
        "",
        f"- Service worker controlled page: {offline.get('service_worker_controlled', False)}",
        f"- Offline reload succeeded: {offline.get('offline_reload_ok', False)}",
        f"- Schedule opened online/offline: {offline.get('online_schedule_opened', False)} / {offline.get('offline_schedule_opened', False)}",
        f"- Offline image responses served by service worker: {offline.get('offline_image_responses_from_service_worker', 0)}",
        f"- Unexpected non-read methods: {len(offline.get('non_read_methods', []))}",
        "",
        "| Phase | Image responses | Image payload |",
        "|---|---:|---:|",
    ])
    for key, label in [
        ("online_today", "Online Today"),
        ("online_schedule_deep_scroll", "Online Schedule deep scroll"),
        ("offline_reload_today", "Offline cached Today reload"),
        ("offline_schedule_deep_scroll", "Offline cached Schedule deep scroll"),
    ]:
        value = offline.get("phases", {}).get(key, {})
        lines.append(
            f"| {label} | {value.get('image_responses', 0)} | "
            f"{format_bytes(value.get('image_payload_bytes', 0))} |"
        )
    if offline.get("error") or offline.get("offline_reload_error"):
        lines.append("")
        lines.append(f"- Offline audit warning: {offline.get('error') or offline.get('offline_reload_error')}")
    if offline.get("failed_images"):
        lines.append(f"- Failed image requests: {len(offline['failed_images'])}")
    if offline.get("page_errors"):
        lines.append(f"- Page errors: {len(offline['page_errors'])}")
    if offline.get("non_read_methods"):
        lines.append(f"- Non-read methods observed: {', '.join(offline['non_read_methods'])}")

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as stream:
            stream.write("\n".join(lines) + "\n")
    print(json.dumps(report, indent=2))

def write_summary(report: dict) -> None:
    phases = report["phases"]
    today = phases["today_initial"]
    schedule = phases["schedule_activation_incremental"]
    reactivated = phases["today_reactivation"]
    details = phases["season_details_on_demand"]
    lines = [
        "## Production image waterfall (read-only)",
        "",
        f"- Measured: {report['measured_at_utc']}",
        f"- Target: {report['target']}",
        f"- Viewport: {report['viewport']['width']}x{report['viewport']['height']} at DPR {report['device_scale_factor']}",
        "- Safety: fresh context; service workers, /api/*, and non-GET/HEAD requests blocked.",
        "",
        "| Phase | Image responses | Image payload | Infographic posters | Poster payload |",
        "|---|---:|---:|---:|---:|",
        f"| Today initial load | {today['image_responses']} | {format_bytes(today['image_payload_bytes'])} | {today['poster_responses']} | {format_bytes(today['poster_payload_bytes'])} |",
        f"| Schedule activation | {schedule['image_responses']} | {format_bytes(schedule['image_payload_bytes'])} | {schedule['poster_responses']} | {format_bytes(schedule['poster_payload_bytes'])} |",
        f"| Today reactivation | {reactivated['image_responses']} | {format_bytes(reactivated['image_payload_bytes'])} | {reactivated['poster_responses']} | {format_bytes(reactivated['poster_payload_bytes'])} |",
        f"| Season/GO Pass details | {details['image_responses']} | {format_bytes(details['image_payload_bytes'])} | {details['poster_responses']} | {format_bytes(details['poster_payload_bytes'])} |",
        "",
        f"- Season/GO Pass detail cards opened: {report['season_detail_cards_opened']}",
        "",
        "On-demand Season/GO Pass poster loads:",
    ]
    if report["season_detail_posters"]:
        for item in report["season_detail_posters"]:
            state = "loaded" if item["loaded"] else "not observed"
            lines.append(f"- {item['name']} — {state}; {format_bytes(item['bytes'])}; {item['resource']}")
    else:
        lines.append("- No live Season/GO Pass poster cards were available in this sample.")
    if report["season_detail_errors"]:
        lines.extend(["", "Detail audit warnings:"])
        for item in report["season_detail_errors"]:
            lines.append(f"- {item['name'] or item['id']}: {item['error']}")
    lines.extend(["", "Largest poster responses:"])
    largest = today["largest_posters"] + schedule["largest_posters"] + reactivated["largest_posters"] + details["largest_posters"]
    if largest:
        for item in sorted(largest, key=lambda row: row["bytes"], reverse=True)[:5]:
            lines.append(f"- {item['resource']} — {format_bytes(item['bytes'])} (HTTP {item['status']})")
    else:
        lines.append("- No infographic poster responses were observed in these phases.")
    lines.extend(["", f"Measurement method: {report['method']}"])
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as stream:
            stream.write("\n".join(lines) + "\n")
    print(json.dumps(report, indent=2))

def main() -> int:
    target = os.environ.get("GO_FIELD_NOTES_AUDIT_URL", DEFAULT_URL)
    try:
        report = run_matrix(target)
        write_matrix_summary(report)
        for profile in report["profiles"]:
            if profile.get("error"):
                print(f"::warning::{profile['profile']} image audit could not complete: {profile['error']}")
                continue
            if not profile["schedule_tab_opened"]:
                print(f"::warning::The Schedule tab was not found at {profile['profile']}.")
            if profile["page_errors"]:
                print(f"::warning::{len(profile['page_errors'])} page error(s) at {profile['profile']}.")
            if profile["season_detail_errors"]:
                print(f"::warning::{len(profile['season_detail_errors'])} detail audit issue(s) at {profile['profile']}.")
            for item in profile["season_detail_posters"]:
                if not item["loaded"]:
                    print(f"::warning::On-demand poster was not observed for {item['name'] or item['id']}.")
        offline = report["offline_cache"]
        if not offline.get("service_worker_controlled"):
            print("::warning::The production page was not controlled by its service worker; offline cache verification was skipped.")
        elif not offline.get("offline_reload_ok"):
            print(f"::warning::The offline cached-session reload failed: {offline.get('offline_reload_error') or offline.get('error') or 'unknown error'}")
        if offline.get("online_schedule_opened") and not offline.get("offline_schedule_opened"):
            print("::warning::The Schedule tab could not be opened during the offline cached-session pass.")
        if offline.get("failed_images"):
            print(f"::warning::{len(offline['failed_images'])} image request(s) failed during the offline cached-session pass.")
        if offline.get("non_read_methods"):
            print(f"::warning::Unexpected non-read methods observed: {', '.join(offline['non_read_methods'])}")
        if offline.get("page_errors"):
            print(f"::warning::{len(offline['page_errors'])} page error(s) during the offline cached-session pass.")
        return 0
    except Exception as exc:
        print(f"::warning::Production image matrix audit could not complete: {exc}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
