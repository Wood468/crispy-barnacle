#!/usr/bin/env python3
"""Read-only production image waterfall sampler for GO Field Notes."""
from __future__ import annotations
import json
import os
import sys
from datetime import datetime, timezone
from urllib.parse import urlsplit

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
                "phases": {
                    "today_initial": summarize(today_records),
                    "schedule_activation_incremental": summarize(schedule_records),
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
        "",
        "Largest poster responses:",
    ]
    largest = today["largest_posters"] + schedule["largest_posters"]
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
        return 0
    except Exception as exc:
        print(f"::warning::Production image audit could not complete: {exc}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
