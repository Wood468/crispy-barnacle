"""Installed-PWA upgrade evidence (automated): real previous shell -> offline -> new service worker -> data intact.

Runs in chromium and in WebKit (GO_FIELD_NOTES_TEST_BROWSER). This is NOT a physical-device installed-iPhone proof;
see docs/IPHONE_PWA_VERIFICATION.md for the manual protocol.
"""
import json
import os
import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get('GO_FIELD_NOTES_RELEASE_URL', 'http://127.0.0.1:8791').rstrip('/')
ENGINE = os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')
NEW_SW = (ROOT / 'public/sw.js').read_text()
NEW_CACHE = re.search(r"const SHELL_CACHE = '([^']+)'", NEW_SW)[1]
OLD_CACHE = 'gofn-shell-v1-previous'
# The previous release: the same real shell and fetch logic, under an older cache name.
OLD_SW = NEW_SW.replace(f"'{NEW_CACHE}'", f"'{OLD_CACHE}'", 1)
# Releases before this one had no navigation-time purge; it must not run in the "old" worker (it would delete the new cache).
OLD_SW = re.sub(r"^  if \(request\.mode === 'navigate' && Date\.now\(\) - lastStalePurge.*$", '', OLD_SW, flags=re.M)
assert OLD_SW != NEW_SW and 'lastStalePurge >' not in OLD_SW and 'lastStalePurge >' not in OLD_SW.replace(' ', '')

KEYS = ['gofn-dex-v1', 'gofn-us-v1', 'gofn-stamp', 'gofn-today-done-v1']
SEED = {
    'gofn-dex-v1': json.dumps({'have': {'25': 1}, 'hundo': {'25': 1}, 'm': {'own': {'25': 1}, 'shiny': {'25': 1}}, 'bt': {}}),
    'gofn-us-v1': json.dumps({'follow:pikachu': {'v': 'Pikachu', 't': 1}, 'saved:cur:twilightwishes': {'v': True, 't': 1}, 'form:19:alola': {'v': 0, 't': 1}}),
    'gofn-stamp': '1730000000000',
    'gofn-today-done-v1': json.dumps({'cur:sendai@2026-11-06T00:00:00.000Z': 1730000000000}),
}
READ_KEYS = "(keys)=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))"

def wait_for_async(page, predicate, *, arg=None, timeout=30000):
    """Await each predicate result; wait_for_function treats a Promise as truthy."""
    deadline = time.monotonic() + timeout / 1000
    while True:
        if page.evaluate(predicate, arg):
            return
        if time.monotonic() >= deadline:
            raise AssertionError('Timed out waiting for asynchronous PWA state')
        page.wait_for_timeout(50)  # Poll the condition, not a fixed readiness delay.


with sync_playwright() as pw:
    browser = getattr(pw, ENGINE).launch()
    context = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Australia/Melbourne', service_workers='allow')
    context.set_default_timeout(20000)
    context.set_default_navigation_timeout(25000)
    context.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
    context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
    phase = {'new': False}
    context.route('**/sw.js', lambda r: r.fulfill(body=NEW_SW if phase['new'] else OLD_SW, content_type='application/javascript', headers={'cache-control': 'no-store'}))
    problems = []
    failed_requests = []
    page = context.new_page()
    page.on('requestfailed', lambda req: failed_requests.append('requestfailed: ' + req.url.split('?')[0].replace(BASE, '') + ' (' + str(req.failure) + ')') if req.url.startswith(BASE + '/') else None)
    page.on('pageerror', lambda e: problems.append('pageerror: ' + str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and 'Failed to preconnect' not in m.text and problems.append('console: ' + m.text))

    # 1. Install the old shell while online and let it precache.
    page.goto(BASE + '/')
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('!!navigator.serviceWorker.controller')
    wait_for_async(page, '(c)=>caches.open(c).then(x=>x.match("/index.html")).then(Boolean)', arg=OLD_CACHE, timeout=30000)
    page.wait_for_function('!!window.GODASH && !!window.GODETAIL', timeout=60000)
    page.evaluate('(seed)=>Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v))', SEED)
    assert page.evaluate(READ_KEYS, KEYS) == SEED

    # 2. Offline reload on the OLD shell still renders from the cache.
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('!!window.GODASH && !!window.GODETAIL', timeout=60000)
    assert page.evaluate(READ_KEYS, KEYS) == SEED, 'keys changed by an offline reload on the old shell'
    context.set_offline(False)

    # 3. A new release is published: new SW installs, activates, claims, and deletes only the old shell cache.
    # Capture after the old-shell reload: window properties from the first page are gone.
    old_controller = page.evaluate_handle('navigator.serviceWorker.controller')
    page.evaluate("caches.open('gofn-unrelated-cache').then(c=>c.put('/x',new Response('keep')))")
    phase['new'] = True
    page.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())')
    wait_for_async(page, '(c)=>caches.keys().then(k=>k.includes(c)&&!k.includes("gofn-shell-v1-previous"))', arg=NEW_CACHE, timeout=40000)
    wait_for_async(page, """async (oldController) => {
        const registration = await navigator.serviceWorker.getRegistration();
        const controller = navigator.serviceWorker.controller;
        return !!controller && controller !== oldController &&
            controller === registration?.active && controller.state === 'activated';
    }""", arg=old_controller, timeout=20000)
    old_controller.dispose()
    # The cache name/index alone can appear before all startup resources are stored.
    # Prove the new shell can boot before the harness disconnects its network.
    wait_for_async(page, """async (name) => {
        const cache = await caches.open(name);
        const required = ['/index.html', '/data.json', '/app.js', '/dash.js', '/detail.js'];
        const responses = await Promise.all(required.map(path => cache.match(path, {ignoreSearch: true})));
        return responses.every(response => response && response.ok);
    }""", arg=NEW_CACHE, timeout=30000)
    names = page.evaluate('caches.keys()')
    assert 'gofn-unrelated-cache' in names and NEW_CACHE in names, names
    assert page.evaluate(READ_KEYS, KEYS) == SEED, 'Collection/Done/stamp keys changed by the upgrade'

    # 4. Offline reload on the NEW shell: Today, Event Details and Schedule all work from cached data.
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    try:
        page.wait_for_function('!!window.GODASH && !!window.GODETAIL', timeout=60000)
    except Exception:
        # Diagnose missing application scripts without logging player state.
        try:
            diagnostics = page.evaluate("""() => ({
                readyState: document.readyState,
                controller: navigator.serviceWorker.controller?.scriptURL || null,
                dash: !!window.GODASH,
                detail: !!window.GODETAIL,
                scriptPaths: Array.from(document.scripts).filter(s => s.src).map(s => new URL(s.src).pathname)
            })""")
            print('Offline upgraded shell diagnostic:', json.dumps(diagnostics, sort_keys=True), flush=True)
        except Exception as err:
            print('Offline upgraded shell diagnostic error:', str(err), flush=True)
        print('Shell caches at activation:', json.dumps(names), flush=True)
        print('Offline upgraded shell failed requests:', json.dumps(failed_requests[-25:]), flush=True)
        print('Offline upgraded shell browser errors:', json.dumps(problems[-25:]), flush=True)
        raise
    page.locator('nav.tabs button[data-tab="now"]').click()
    page.wait_for_selector('#today-v1 .t1-card', timeout=20000)
    assert page.locator('#today-v1 .t1-card').count() > 0
    # Only superseded gofn-shell-* caches are removed (the outgoing worker may re-create its cache once; a navigation purges it).
    wait_for_async(page, '(c)=>caches.keys().then(k=>k.filter(n=>n.startsWith("gofn-shell-")).join()===c&&k.includes("gofn-unrelated-cache"))', arg=NEW_CACHE, timeout=15000)
    page.locator('#today-v1 article.t1-card button[data-open]').first.click()
    page.wait_for_selector('#evd .ue-hero', timeout=15000)
    assert page.locator('#evd-t').inner_text().strip()
    page.keyboard.press('Escape')
    page.locator('nav.tabs button[data-tab="events"]').click()
    page.wait_for_selector('#tab-events:not([hidden])')
    # A hidden first event card may precede the visible Schedule cards;
    # check actual visible content instead of waiting on the first DOM match.
    page.wait_for_selector('#tab-events .evc:visible', timeout=15000)
    assert page.locator('#tab-events .evc:visible').count() > 0, 'no visible Schedule cards after offline PWA upgrade'
    assert page.evaluate(READ_KEYS, KEYS) == SEED, 'keys changed after offline navigation on the new shell'
    assert page.evaluate('GO.dex().m.own[25]') == 1

    # 5. Cached shell references versioned assets that are missing under that exact ?v= (older/newer page):
    #    re-key every cached versioned file so the exact URL misses; ignoreSearch must still serve it (no blank page).
    page.evaluate("""async (c) => {
      const cache = await caches.open(c);
      for (const req of await cache.keys()) {
        const u = new URL(req.url);
        if (u.search && /\\.(js|css)$/.test(u.pathname)) {
          const res = await cache.match(req);
          await cache.delete(req);
          await cache.put(u.pathname + '?v=moved', res);
        }
      }
    }""", NEW_CACHE)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('!!window.GODASH && !!window.GODETAIL', timeout=60000)
    page.locator('nav.tabs button[data-tab="now"]').click()
    page.wait_for_selector('#today-v1 .t1-card', timeout=20000)
    assert page.evaluate("document.body.innerText.trim().length") > 200, 'blank page when versioned assets miss the exact cache key'
    assert page.evaluate(READ_KEYS, KEYS) == SEED
    assert not problems, problems
    print(f'PASS {ENGINE} PWA upgrade {OLD_CACHE} -> {NEW_CACHE}: offline old shell, activate/claim, only old shell cache removed, '
          'Collection/Done/stamp keys byte-identical, offline Today/Event Details/Schedule, ignoreSearch fallback, no console errors')
    context.close()
    browser.close()
