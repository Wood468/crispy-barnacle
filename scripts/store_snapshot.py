"""Reads the public Pokemon GO web store (no sign-in) and writes what is on sale to a JSON file.
Usage: python scripts/store_snapshot.py out.json"""
import json, sys, time
from playwright.sync_api import sync_playwright

JS = """() => [...document.querySelectorAll('.catalog__section')].flatMap(sec =>
  [...sec.querySelectorAll('.webstore-sku-card__container')].map(c => ({
    section: sec.id,
    name: (c.querySelector('[data-testid="sku-card.name"]') || {}).innerText || '',
    price: ((c.querySelector('[data-testid="sku-card.cta.price-with-or-without-discount"]') || {}).innerText || '').trim().split('\\n').pop(),
    tag: ((c.querySelector('[data-testid="sku-card.tag-primary"]') || {}).innerText || '').trim(),
    limit: ((c.querySelector('[data-testid="sku-card.tag-purchase-limit"]') || {}).innerText || '').trim(),
    left: ((/(\\d+)\\s*(day|hour|minute)s?\\s*left/i.exec(c.innerText || '')) || [''])[0],
    imgs: [...c.querySelectorAll('img')].filter(i => !i.closest('.badge')).map(i => i.currentSrc || i.src).filter(Boolean).slice(0, 3),
    href: (c.querySelector('a[href*="/purchase/"]') ? c.querySelector('a[href*="/purchase/"]').getAttribute('href') : ''),
  })))"""

def main(out):
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(locale="en-AU", user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", viewport={"width": 1280, "height": 1600}).new_page()
        try:
            pg.goto("https://store.pokemongo.com/", wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_selector('[data-testid="sku-card.name"]', timeout=45000)
        except Exception as e:
            body = ""
            try: body = pg.inner_text("body")[:300].replace("\n", " ")
            except Exception: pass
            print("::error title=Store page did not load::%s | title=%s | text=%s" % (str(e).splitlines()[0][:150], pg.title(), body))
            sys.exit(1)
        for _ in range(6):  # scroll so lazy sections load
            pg.mouse.wheel(0, 2500); time.sleep(0.8)
        items = [i for i in pg.evaluate(JS) if i["name"]]
        b.close()
    if len(items) < 3:
        sys.exit("Store page returned too few items (%d); not saving" % len(items))
    json.dump({"fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "items": items}, open(out, "w"), indent=1)
    print("Saved %d items" % len(items))

main(sys.argv[1])
