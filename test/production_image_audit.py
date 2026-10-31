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

def run_audit(target: str) -> dict:
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
                viewport=VIEWPORT,
                device_scale_factor=DEVICE_SCALE_FACTOR,
                is_mobile=True,
                has_touch=True,
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

            # Return to Today, then measure full Season/GO Pass posters only after opening each card.
            phase["name"] = "today_reactivation"
            today_tab = None
            for index in range(tabs.count()):
                tab = tabs.nth(index)
                if (tab.get_attribute("aria-controls") or "") == "tab-now":
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
                "viewport": VIEWPORT,
                "device_scale_factor": DEVICE_SCALE_FACTOR,
                "fresh_context": True,
                "service_workers": "blocked",
                "api_requests": "blocked",
                "non_read_methods": "blocked",
                "schedule_tab_opened": schedule_opened,
                "today_tab_reactivated": today_tab_reactivated,
                "season_detail_cards_opened": detail_opened,
                "season_detail_posters": poster_results,
                "season_detail_errors": detail_errors,
                "phases": {
                    "today_initial": summarize(today_records),
                    "schedule_activation_incremental": summarize(schedule_records),
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
        report = run_audit(target)
        write_summary(report)
        if not report["schedule_tab_opened"]:
            print("::warning::The Schedule tab was not found; only Today was measured.")
        if report["page_errors"]:
            print(f"::warning::{len(report['page_errors'])} page error(s) occurred during the sample.")
        if report["season_detail_errors"]:
            print(f"::warning::{len(report['season_detail_errors'])} Season/GO Pass detail audit issue(s) occurred.")
        for item in report["season_detail_posters"]:
            if not item["loaded"]:
                print(f"::warning::On-demand poster was not observed for {item['name'] or item['id']}.")
        return 0
    except Exception as exc:
        print(f"::warning::Production image audit could not complete: {exc}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
