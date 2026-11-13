#!/usr/bin/env python3
"""Manual, read-only production browser probe for Store AUD reference quotes.

Checks that public HTML actually permits the app's fixed CORS FX fetch and
the app accepts its current dated AUD/IDR/INR response. Never authenticates,
touches owner/private prices or sends product/account data.
This is not a scheduled release gate: temporary external-provider failure
must not block unrelated GO Field Notes deployments.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("GOFN_FX_QA_URL", "https://pogo.michaelpuff.com").rstrip("/")
OUT = Path(os.environ.get("GOFN_FX_QA_OUT", "artifacts/live-store-fx"))
PROVIDER = "https://open.er-api.com/v6/latest/AUD"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"site": BASE, "provider": PROVIDER, "passed": False}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            try:
                context = browser.new_context()
                page = context.new_page()
                try:
                    response = page.goto(BASE + "/", wait_until="domcontentloaded", timeout=45000)
                    assert response and response.ok, "Public GO Field Notes homepage unavailable"
                    csp = response.headers.get("content-security-policy", "")
                    connect = next((part.strip() for part in csp.split(";")
                                    if part.strip().startswith("connect-src ")), "")
                    report["http_status"] = response.status
                    report["observed_connect_src"] = connect or "(absent)"
                    report["csp_present"] = bool(csp)
                    assert connect == "connect-src 'self' " + PROVIDER, (
                        "Production CSP does not allow exactly the configured FX reference URL"
                    )
                    assert "script-src 'self'" in csp and "form-action 'self'" in csp, (
                        "Existing script and form restrictions must remain active"
                    )
                    report["csp"] = connect
                    page.wait_for_function(
                        "() => !!window.GOStoreFX && typeof GOStoreFX.retrieve === 'function'",
                        timeout=20000
                    )
                    # Execute the actual in-app FX fetch helper from the deployed
                    # page origin. A blocked CSP, CORS failure or expired provider
                    # response results in no validated quote, not a fabricated rate.
                    result = page.evaluate("""async () => {
                        const fx = window.GOStoreFX;
                        const start = Date.now();
                        const quote = await fx.retrieve(window.fetch.bind(window),
                            null, start, 3000);
                        const id = quote && quote.IDR, ind = quote && quote.INR;
                        const conversion = id && ind ? {
                            idr: fx.display({currency:'IDR',amount:16000},quote),
                            inr: fx.display({currency:'INR',amount:90},quote)
                        } : null;
                        return { endpoint: fx.ENDPOINT,
                            idrDate: id && id.observed, inrDate: ind && ind.observed,
                            idrSource: id && id.source, inrSource: ind && ind.source,
                            idrValid: !!(id && Number.isFinite(id.audPerUnit) && id.audPerUnit > 0),
                            inrValid: !!(ind && Number.isFinite(ind.audPerUnit) && ind.audPerUnit > 0),
                            bothConverted: !!(conversion && conversion.idr && conversion.inr
                                && conversion.idr.text.startsWith('≈ A$')
                                && conversion.inr.text.startsWith('≈ A$'))
                        };
                    }""")
                    assert result["endpoint"] == PROVIDER, "Client FX endpoint changed"
                    assert result["idrValid"] and result["inrValid"], (
                        "Real browser could not obtain both current IDR and INR AUD reference rates"
                    )
                    assert result["bothConverted"], "Both reference AUD labels must render"
                    assert result["idrSource"] == result["inrSource"] == "ExchangeRate-API", (
                        "FX quote must originate from the validated public provider"
                    )
                    assert result["idrDate"] == result["inrDate"], (
                        "Both currencies must use the same dated provider snapshot"
                    )
                    report["fx"] = result
                    report["passed"] = True
                finally:
                    context.close()
            finally:
                browser.close()
    except Exception as exc:
        report["error"] = str(exc)
    (OUT / "report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
