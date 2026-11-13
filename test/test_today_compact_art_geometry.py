"""Geometry regression for compact Today artwork containment (#761).
Run from repository root: python -m pytest test/test_today_compact_art_geometry.py
Requires playwright browsers. Uses the actual Today CSS and nested image/fallback markup.
"""
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[1]
CSS = "\n".join((ROOT / "public" / name).read_text() for name in ("styles.css", "dash.css", "today.css", "ux-finish.css"))
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

def test_compact_today_artwork_contained():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        for browser_type in ((playwright.webkit,) if os.getenv('TODAY_ART_WEBKIT_ONLY') else (playwright.chromium,)):
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


def test_real_today_renderer_geometry():
    """Exercise GOTODAY.render, not hand-built cards, at every mobile breakpoint."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        browser_type = playwright.webkit if os.getenv("TODAY_ART_WEBKIT_ONLY") else playwright.chromium
        browser = browser_type.launch()
        try:
            for width in (320, 360, 390, 430):
                page = browser.new_page(viewport={"width": width, "height": 800}, device_scale_factor=2)
                page.set_content('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#0c1119;color:white"><main id="tab-now" style="padding:12px"><div class="t1" id="today-root"></div></main></body></html>')
                page.add_style_tag(content=CSS)
                page.add_script_tag(content=(ROOT / "public" / "today-logic.js").read_text())
                page.add_script_tag(content=(ROOT / "public" / "today.js").read_text())
                page.evaluate("""(png) => {
                  const now = Date.UTC(2026,10,14,10), hour = 3600000;
                  const minor = {id:'fixture-compact',name:'GO Wild Area: Global — long compact artwork containment fixture',
                    kind:'spot',start:now+hour,end:now+2*hour,region:'Global',
                    featured:[{name:'Fixture Pokémon'}],tags:[]};
                  const major = {id:'fixture-major',name:'Minior Showers: Leonids — major card fixture',
                    kind:'event',start:now+hour,end:now+48*hour,region:'Global',
                    featured:[{name:'Minior'}],tags:[]};
                  const ctx = {now,live:[],soon:[minor,major],week:[],regLive:[],regSoon:[],regWeek:[],
                    boosts:{live:[],upcoming:[]},seasons:[],done:[],hidden:[],ending:[],
                    kindOf:()=>['Event','#27a4b0'],overseas:()=>false,dayLabel:()=> 'Saturday',
                    fallbackArt:()=>'',monArt:()=>'<span class="art-fb" style="width:150px;height:150px"><img class="art" src="'+png+'" alt="Featured Pokémon"><span class="form-chip">Special form</span></span>'};
                  document.getElementById('today-root').innerHTML = GOTODAY.render(ctx);
                }""", PNG)
                # Wait for the renderer-inserted data-URI image to decode before measuring.
                # Keep the actual image-visibility assertion below.
                page.wait_for_function("""() => {
                  const img = document.querySelector('[data-id="fixture-compact"] .t1-minor-art img');
                  return !!img && img.complete && img.naturalWidth > 0;
                }""", timeout=10000)
                result = page.evaluate("""() => {
                  const compact = document.querySelector('[data-id="fixture-compact"]');
                  const majorCard = document.querySelector('[data-id="fixture-major"]');
                  const slot = compact && compact.querySelector('.t1-minor-art');
                  const menu = compact && compact.querySelector('.t1-more');
                  const title = compact && compact.querySelector('.t1-title');
                  const rect = e=>e.getBoundingClientRect();
                  const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
                  const a=slot&&rect(slot), c=compact&&rect(compact);
                  return {compact:!!compact&&compact.classList.contains('t1-minor'),
                    major:!!majorCard&&majorCard.classList.contains('t1-major'),
                    slotWithinCard:!!a&&a.left>=c.left-1&&a.right<=c.right+1&&a.top>=c.top-1&&a.bottom<=c.bottom+1,
                    slotContained:!!slot&&getComputedStyle(slot).overflow==='hidden',
                    imageVisible:!!slot&&!!slot.querySelector('img')&&slot.querySelector('img').naturalWidth>0,
                    separated:!!majorCard&&c.bottom<=rect(majorCard).top+1,
                    titleClear:!!title&&!!menu&&!overlap(rect(title),rect(menu)),
                    noOverflow:document.documentElement.scrollWidth<=innerWidth+1};
                }""")
                assert all(result.values()), (browser_type.name, width, result)
                page.close()
        finally:
            browser.close()

if __name__ == '__main__':
    test_compact_today_artwork_contained()
    test_real_today_renderer_geometry()
