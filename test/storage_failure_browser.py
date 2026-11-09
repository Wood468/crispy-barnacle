"""Done/Undo and Collection writes must not report success when localStorage throws; data is retained and recovery works."""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8791/'
ENGINE = os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')
OUT = Path(os.environ.get('GO_FIELD_NOTES_SCREENSHOTS', '/tmp/gofn-screenshots')); OUT.mkdir(parents=True, exist_ok=True)
FAIL_INIT = """
(() => {
  window.__failStorage = false;
  const real = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (window.__failStorage && /^gofn-(today-done|dex|us|stamp)/.test(k)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    return real.call(this, k, v);
  };
})();
"""
KEYS = ['gofn-dex-v1', 'gofn-us-v1', 'gofn-stamp', 'gofn-today-done-v1']
ERR = 'storage is full or unavailable'
SEED = {'gofn-dex-v1': json.dumps({'have': {'25': 1}, 'm': {'own': {'25': 1}}}), 'gofn-us-v1': json.dumps({'a': {'v': 1, 't': 1}}), 'gofn-stamp': '7',
        'gofn-today-done-v1': json.dumps({'cur:other@2026-11-01T00:00:00.000Z': {'at': 1, 'end': None}})}
READ = "(keys)=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))"

with sync_playwright() as p:
    browser = getattr(p, ENGINE).launch()
    for width in (360, 390, 430):
        context = browser.new_context(viewport={'width': width, 'height': 844}, timezone_id='Australia/Melbourne', service_workers='block', color_scheme='dark')
        context.add_init_script(FAIL_INIT)
        context.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
        context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.clock.install(time='2026-11-06T12:00:00+11:00')
        page.goto(BASE)
        page.evaluate('(seed)=>Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v))', SEED)
        page.reload()
        page.wait_for_selector('#today-v1 article.t1-card[data-id="cur:sendai"][data-start]')
        page.wait_for_load_state('networkidle'); page.wait_for_timeout(800)
        before = page.evaluate(READ, KEYS)
        card = '#today-v1 article.t1-card[data-id="cur:sendai"][data-start]'

        # --- Mark done while storage throws: nothing hides, error toast, data byte-identical ---
        page.evaluate('window.__failStorage = true')
        page.locator(card).locator('.t1-more').click(); page.locator('[data-t1-done]').click()
        toast = page.locator('#t1-toast')
        toast.wait_for(state='visible')
        assert ERR in toast.inner_text(), toast.inner_text()
        assert 'marked done' not in toast.inner_text() and page.locator('.t1-toast-undo[data-t1-undo]').count() == 0, 'false success shown'
        assert page.locator(card).count() == 1, 'event was hidden although nothing was saved'
        assert page.evaluate(READ, KEYS) == before, 'stored data changed by a failed write'
        page.screenshot(path=str(OUT / f'storage-error-done-{width}.png'))
        # still failing: retry keeps the same state
        page.locator('[data-t1-retry]').click()
        assert ERR in toast.inner_text() and page.locator(card).count() == 1
        # --- storage works again: retry succeeds, event hides, undo offered ---
        page.evaluate('window.__failStorage = false')
        page.locator('[data-t1-retry]').click()
        page.wait_for_function("!document.querySelector('#today-v1 article.t1-card[data-id=\"cur:sendai\"][data-start]')")
        assert 'marked done' in toast.inner_text() and page.locator('.t1-toast-undo[data-t1-undo]').count() == 1
        stored = json.loads(page.evaluate("localStorage.getItem('gofn-today-done-v1')"))
        assert any(k.startswith('cur:sendai@') for k in stored) and 'cur:other@2026-11-01T00:00:00.000Z' in stored, stored
        after_mark = page.evaluate(READ, KEYS)

        # --- Undo while storage throws: reports failure, stays hidden, data unchanged ---
        page.evaluate('window.__failStorage = true')
        page.locator('.t1-toast-undo[data-t1-undo]').click()
        assert ERR in toast.inner_text()
        assert page.locator(card).count() == 0, 'undo reported success without saving'
        assert page.evaluate(READ, KEYS) == after_mark
        page.evaluate('window.__failStorage = false')
        page.locator('[data-t1-retry]').click()
        page.wait_for_selector(card)
        assert 'cur:sendai@' not in page.evaluate("localStorage.getItem('gofn-today-done-v1')")
        assert 'cur:other@2026-11-01T00:00:00.000Z' in page.evaluate("localStorage.getItem('gofn-today-done-v1')")

        # --- Collection writes: dex mark and user-state entry while storage throws ---
        before = page.evaluate(READ, KEYS)
        page.evaluate('window.__failStorage = true')
        page.evaluate("GO.markOwn(['1'])")
        alert = page.locator('#gofn-storage-alert')
        alert.wait_for(state='visible')
        assert ERR in alert.inner_text() and alert.get_attribute('role') == 'alert'
        assert page.evaluate(READ, KEYS) == before, 'Collection data changed by a failed write'
        assert page.evaluate("GO.dex().m.own['1']") == 1 and page.evaluate("GO.dex().m.own['25']") == 1, 'in-memory state must stay consistent'
        page.evaluate("GODASH.usSet('saved:cur:x', true)")
        assert page.evaluate("localStorage.getItem('gofn-us-v1')") == before['gofn-us-v1']
        page.screenshot(path=str(OUT / f'storage-error-collection-{width}.png'))
        page.evaluate('window.__failStorage = false')
        page.locator('.storage-alert-retry').click()
        page.wait_for_function("document.getElementById('gofn-storage-alert').hidden")
        dex = json.loads(page.evaluate("localStorage.getItem('gofn-dex-v1')"))
        assert dex['m']['own']['1'] == 1 and dex['m']['own']['25'] == 1 and dex['have']['25'] == 1, dex
        us = json.loads(page.evaluate("localStorage.getItem('gofn-us-v1')"))
        assert us['a']['v'] == 1, us
        errors = [e for e in errors if 'access control checks' not in e]  # WebKit reports blocked stub fetches as page errors
        assert not errors, errors
        context.close()

    # --- corrupt Collection JSON is kept, never wiped by a later save ---
    context = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    context.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
    context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
    page = context.new_page()
    page.goto(BASE)
    page.evaluate("localStorage.setItem('gofn-dex-v1','{corrupt');localStorage.setItem('gofn-us-v1','not-json')")
    page.reload(); page.wait_for_function('!!window.GO && !!window.GODASH')
    page.evaluate("GO.markOwn(['2'])"); page.evaluate("GODASH.usSet('saved:cur:y', true)")
    assert page.evaluate("localStorage.getItem('gofn-dex-v1-corrupt')") == '{corrupt'
    assert page.evaluate("localStorage.getItem('gofn-us-v1-corrupt')") == 'not-json'
    assert json.loads(page.evaluate("localStorage.getItem('gofn-dex-v1')"))['m']['own']['2'] == 1
    context.close()
    browser.close()
print(f'PASS {ENGINE} storage failures: no false success for Done/Undo/Collection, data retained, visible error, retry recovers, corrupt JSON kept')
