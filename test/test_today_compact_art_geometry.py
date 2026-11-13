"""Geometry regression for compact Today artwork containment (#761).
Run from repository root: python -m pytest test/test_today_compact_art_geometry.py
Requires playwright browsers. Uses the actual Today CSS and nested image/fallback markup.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "public/today.css").read_text() + "\n" + (ROOT / "public/ux-finish.css").read_text()
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

def test_compact_today_artwork_contained():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        for browser_type in (playwright.chromium, playwright.webkit):
            browser = browser_type.launch()
            try:
                for width in (320, 360, 390, 430):
                    page = browser.new_page(viewport={"width": width, "height": 800}, device_scale_factor=2)
                    page.set_content(f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
                    <body style="margin:0;background:#0c1119;color:white">
                    <main id="tab-now" style="padding:12px"><div class="t1">
                    <section class="t1-sec"><h2>STARTING SOON</h2><div class="t1-list">
                    <article class="t1-card t1-minor" style="--k:#27a4b0">
                      <div class="t1-minor-art"><span class="art-fb" style="width:150px;height:150px">
                        <img class="art" src="{PNG}" alt="Featured Pokémon"><span class="form-chip">Special form</span>
                      </span></div>
                      <a class="t1-open" href="#"><strong class="t1-title">GO Wild Area: Global — A very long localized event title that must wrap</strong><small>Starts in 1h 33m</small></a>
                      <span aria-label="shiny">✦</span><button class="t1-more" type="button">⋯</button>
                    </article>
                    <article class="t1-card t1-major"><div class="t1-major-art" style="height:100px;background:#23326a"></div>
                      <a class="t1-open" href="#">Minior Showers: Leonids</a></article>
                    </div></section><section class="t1-sec"><h2>NEXT 7 DAYS</h2></section>
                    </div></main></body></html>""")
                    page.add_style_tag(content=CSS)
                    result = page.evaluate("""() => {
                      const slot=document.querySelector('.t1-minor-art');
                      const art=slot.querySelector('img');
                      const card=slot.closest('.t1-card');
                      const next=card.nextElementSibling;
                      const heading=document.querySelectorAll('.t1-sec h2')[1];
                      const rect=e=>e.getBoundingClientRect();
                      const a=rect(slot), c=rect(card), n=rect(next), h=rect(heading);
                      const overflow=getComputedStyle(slot).overflow;
                      const intersects=(x,y)=>x.left<y.right && x.right>y.left && x.top<y.bottom && x.bottom>y.top;
                      return {overflow, slotWithinCard:a.left>=c.left-1 && a.right<=c.right+1 &&
                        a.top>=c.top-1 && a.bottom<=c.bottom+1,
                        cardSeparated:c.bottom<=n.top+1, sectionSeparated:n.bottom<=h.top+1,
                        imageVisible:art.complete && art.naturalWidth>0,
                        imageClip:overflow==='hidden' || overflow==='clip',
                        titleVisible:!intersects(rect(card.querySelector('.t1-title')),rect(card.querySelector('.t1-more'))),
                        documentOverflow:document.documentElement.scrollWidth>innerWidth+1};
                    }""")
                    assert result["imageVisible"], (browser_type.name,width,result)
                    assert result["imageClip"] and result["slotWithinCard"], (browser_type.name,width,result)
                    assert result["cardSeparated"] and result["sectionSeparated"], (browser_type.name,width,result)
                    assert result["titleVisible"] and not result["documentOverflow"], (browser_type.name,width,result)
                    page.close()
            finally:
                browser.close()
