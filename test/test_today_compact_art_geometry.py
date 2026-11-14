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
                      <a class="t1-open" href="#"><strong class="t1-title">A small activity — A very long localized title that must wrap</strong><small>Starts in 1h 33m</small></a>
                      <span aria-label="shiny">✦</span><button class="t1-more" type="button">⋯</button>
                    </article>
                    <article class="t1-card t1-major"><div class="t1-major-art" style="height:100px;background:#23326a"></div>
                      <a class="t1-open" href="#">A multi-feature flagship</a></article>
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
                  // Real normalization: worldwide Wild Area is 'global'; multi-day
                  // single-Pokémon activity remains compact even with a debut tag.
                  const major = {id:'fixture-global',name:'GO Wild Area: Global',
                    kind:'global',start:now-hour,end:now+48*hour,region:'Global',
                    featured:[{name:'Toxtricity'}],tags:[]};
                  const minor = {id:'fixture-minior',name:'Minior Showers: Leonids',
                    kind:'event',start:now+hour,end:now+5*24*hour,region:'Global',
                    featured:[{name:'Minior'}],tags:['Debut']};
                  const ctx = {now,live:[major],soon:[minor],week:[],regLive:[],regSoon:[],regWeek:[],
                    boosts:{live:[],upcoming:[]},seasons:[],done:[],hidden:[],ending:[],
                    kindOf:()=>['Event','#27a4b0'],overseas:()=>false,dayLabel:()=> 'Saturday',
                    fallbackArt:()=>'',monArt:()=>'<span class="art-fb" style="width:150px;height:150px"><img class="art" src="'+png+'" alt="Featured Pokémon"><span class="form-chip">Special form</span></span>'};
                  document.getElementById('today-root').innerHTML = GOTODAY.render(ctx);
                }""", PNG)
                # Wait for the renderer-inserted data-URI image to decode before measuring.
                # Keep the actual image-visibility assertion below.
                page.wait_for_function("""() => {
                  const img = document.querySelector('[data-id="fixture-minior"] .t1-minor-art img');
                  return !!img && img.complete && img.naturalWidth > 0;
                }""", timeout=10000)
                result = page.evaluate("""() => {
                  const compact = document.querySelector('[data-id="fixture-minior"]');
                  const majorCard = document.querySelector('[data-id="fixture-global"]');
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
                    separated:!!majorCard&&rect(majorCard).bottom<=c.top+1,
                    majorArtworkAboveCopy:!!majorCard&&!!majorCard.querySelector(':scope > .t1-major-art')&&
                      rect(majorCard.querySelector(':scope > .t1-major-art')).bottom<=
                      rect(majorCard.querySelector(':scope > .t1-open')).top+1,
                    majorLargerThanMinor:!!majorCard&&rect(majorCard).height>c.height,
                    titleClear:!!title&&!!menu&&!overlap(rect(title),rect(menu)),
                    noOverflow:document.documentElement.scrollWidth<=innerWidth+1};
                }""")
                assert all(result.values()), (browser_type.name, width, result)
                page.close()
        finally:
            browser.close()


def test_hidden_done_restore_rows_geometry():
    """Real Today renderer: long in-person names, metadata, and distinct Restore controls.

    Cover the regressions in #761 in Chromium and WebKit at every supported
    phone width. A text-only/CSS-selector assertion can pass even if the
    on-screen event label collides with its venue or Restore control.
    """
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        engine = playwright.webkit if os.getenv("TODAY_ART_WEBKIT_ONLY") else playwright.chromium
        browser = engine.launch()
        try:
            for width in (320, 360, 390, 430):
                page = browser.new_page(viewport={"width": width, "height": 800}, device_scale_factor=2)
                page.set_content(
                    '<!doctype html><html><head><meta name="viewport" '
                    'content="width=device-width,initial-scale=1"></head>'
                    '<body style="margin:0;background:#0c1119;color:white">'
                    '<main id="tab-now" style="padding:12px">'
                    '<div class="t1" id="today-root"></div></main></body></html>'
                )
                page.add_style_tag(content=CSS)
                page.add_script_tag(content=(ROOT / "public" / "today-logic.js").read_text())
                page.add_script_tag(content=(ROOT / "public" / "today.js").read_text())
                page.evaluate("""() => {
                  const name = 'Pokémon GO City Safari — A deliberately long, fully translated ' +
                    'international event name for Osaka, Sendai/Tohoku and Mexico City';
                  const when = 'In person · Osaka, Japan · Overseas · Saturday, 14 November 2026';
                  const now = Date.UTC(2026, 10, 14, 10);
                  const ctx = {
                    now, live:[], soon:[], week:[], regLive:[], regSoon:[], regWeek:[],
                    boosts:{live:[],upcoming:[]}, seasons:[], ending:[],
                    hidden:[{key:'osaka@2026-11-14T00:00:00.000Z',name,when}],
                    done:[{key:'sendai@2026-11-14T00:00:00.000Z',name,when}],
                    kindOf:()=>['In person','#27a4b0'], overseas:()=>true,
                    dayLabel:()=> 'Saturday', fallbackArt:()=>'', monArt:()=>''
                  };
                  document.querySelector('#today-root').innerHTML = GOTODAY.render(ctx);
                }""")
                result = page.evaluate("""() => {
                  const rows = [
                    document.querySelector('.t1-hidden .t1-done-list li'),
                    document.querySelector('.t1-done:not(.t1-hidden) .t1-done-list li')
                  ];
                  const rect = el => el.getBoundingClientRect();
                  return {
                    noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
                    noTracking: !document.querySelector('#today-root [data-track], #today-root [data-follow]'),
                    rowCount: rows.filter(Boolean).length,
                    rows: rows.filter(Boolean).map((li, i) => {
                      const label = li.querySelector(':scope > span:first-child');
                      const secondary = label && label.querySelector('small');
                      const button = li.querySelector('button.t1-restore');
                      if (!label || !secondary || !button || !label.firstChild) return {valid:false};
                      const title = document.createRange();
                      title.selectNode(label.firstChild);
                      const tr = title.getBoundingClientRect(), mr = rect(secondary);
                      const lr = rect(label), br = rect(button), rr = rect(li);
                      return {
                        valid: true,
                        titleBeforeMetadata: tr.bottom <= mr.top + 1,
                        metadataOwnLine: getComputedStyle(label).display === 'grid' &&
                          getComputedStyle(secondary).display === 'block',
                        labelClearOfButton: lr.right <= br.left + 1,
                        titleInsideLabel: tr.left >= lr.left - 1 && tr.right <= lr.right + 1,
                        rowInsideViewport: rr.left >= -1 && rr.right <= innerWidth + 1,
                        buttonInsideRow: br.left >= rr.left - 1 && br.right <= rr.right + 1,
                        buttonTouchSized: br.width >= 44 && br.height >= 44,
                        metadataPreserved: ['In person','Osaka, Japan','Overseas'].every(
                          s => secondary.textContent.includes(s)),
                        exactAction: i === 0
                          ? !!button.getAttribute('data-t1-unhide')
                          : !!button.getAttribute('data-t1-undo'),
                        accessibleAction: button.getAttribute('aria-label')?.startsWith('Restore ')
                      };
                    })
                  };
                }""")
                assert result["rowCount"] == 2 and result["noPageOverflow"] and result["noTracking"], (
                    engine.name, width, result)
                assert all(all(row.values()) for row in result["rows"]), (engine.name, width, result)
                page.close()
        finally:
            browser.close()

if __name__ == '__main__':
    test_compact_today_artwork_contained()
    test_real_today_renderer_geometry()
    test_hidden_done_restore_rows_geometry()
