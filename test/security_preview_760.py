import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright

base = os.environ["PREVIEW"].rstrip("/")
expected = {
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "strict-transport-security": "max-age=31536000",
}
for path in ("/", "/index.html"):
    try:
        response = urlopen(Request(base + path, headers={"User-Agent": "GOFN-preview-security-acceptance"}), timeout=25)
    except HTTPError as error:
        print("PREVIEW_HTTP_DIAGNOSTIC", "path=", path, "status=", error.code,
              "final_url=", error.url, "server=", error.headers.get("server"),
              "cf-ray-present=", bool(error.headers.get("cf-ray")),
              "content-type=", error.headers.get("content-type"),
              "body-prefix=", error.read(300).decode("utf-8", "replace").replace("\\n", " "), flush=True)
        raise
    with response:
        assert response.status == 200, (path, response.status)
        headers = response.headers
        for key, value in expected.items():
            assert headers.get(key, "").strip().lower() == value.lower(), (path, key, headers.get(key))
        csp = headers.get("Content-Security-Policy", "")
        for directive in ("default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"):
            assert directive in csp, (path, directive)
        assert "'unsafe-eval'" not in csp, path
        assert "script-src 'self' 'unsafe-inline'" not in csp, path
        print("PASS effective security response headers:", path)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    response = page.goto(base + "/", wait_until="domcontentloaded", timeout=45000)
    assert response and response.status == 200
    page.wait_for_timeout(3000)
    assert page.locator("body").is_visible()
    assert page.locator("body").inner_text().strip()
    assert not errors, errors[:5]
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2"), "390px overflow"
    manifest = page.locator('link[rel="manifest"]').first
    assert manifest.count(), "Missing PWA manifest link"
    href = manifest.get_attribute("href")
    assert href, "Empty PWA manifest href"
    manifest_url = href if href.startswith("http") else base + "/" + href.lstrip("/")
    assert page.request.get(manifest_url).status == 200
    print("PASS public 390px browser and PWA smoke")
    browser.close()
