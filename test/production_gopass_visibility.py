#!/usr/bin/env python3
"""Read-only LIVE production GO Pass visibility diagnostic; never relies on local fixtures.

Diagnostics are intentionally separate from local-render tests because PWA cache,
production CDN routing and actual published pass data can differ from source checkout.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get("GO_FIELD_NOTES_LIVE_GO_PASS_URL", "https://pogo.michaelpuff.com").rstrip("/")
OUT = Path(os.environ.get("GO_FIELD_NOTES_LIVE_GO_PASS_SCREENSHOTS", "/tmp/gopass-live-check"))
OUT.mkdir(parents=True, exist_ok=True)
expected_url = next(
    ("/" + fragment.split('"', 1)[0])
    for fragment in (Path(__file__).resolve().parent.parent / "public/index.html").read_text().split('<script src="/')
    if fragment.startswith("go-pass-navigation.js?v=")
)
report = {"site": URL, "expectedNavAsset": expected_url, "checks": [], "pass_results": [], "page_errors": []}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    for workers in ("block", "allow"):
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844}, timezone_id="Australia/Melbourne",
            service_workers=workers,
            is_mobile=True, has_touch=True
        )
        def guard(route):
            # Do not write to the user's production account endpoints.
            if route.request.method not in ("GET", "HEAD", "OPTIONS"):
                route.fulfill(status=204, body="")
            elif "/api/" in route.request.url and "/api/art?" not in route.request.url:
                route.fulfill(status=200, content_type="application/json",
                              body='{"enabled":false,"events":[],"sources":[]}')
            else:
                route.continue_()
        ctx.route("**/*", guard)
        page = ctx.new_page()
        page.on("pageerror", lambda e: report["page_errors"].append(str(e)[:500]))
        item = {"mode": "clean" if workers == "block" else "fresh-pwa", "passes": []}
        try:
            response = page.goto(URL + "/", wait_until="domcontentloaded", timeout=45000)
            item["http_status"] = response.status if response else None
            page.wait_for_function("!!window.GODASH && !!window.GODETAIL && !!window.GOEventRegistry && !!window.GOSEASON",
                                   timeout=30000)
            item["assets"] = page.evaluate("""async () => {
              const paths=['/go-pass-navigation.js?v=20261118a','/go-pass-reward-art.js?v=20261118a','/detail.js?v=20261118a'];
              return Promise.all(paths.map(async path => {
                try {const r=await fetch(path,{cache:'reload'});return {path,status:r.status,bytes:(await r.text()).length};}
                catch(error){return {path,error:String(error)}}
              }));
            }""")
            item["artDebug"] = page.evaluate("""() => {
                const names=['Dynamax Meltan','Meltan','Sandygast','Dynamax Rookidee','Rookidee','Groudon'];
                return names.map(name=>{
                  const p=GOEventAdapter.pokemon({name});
                  const parsed=GOLIB.parseForm(name);
                  let art='';
                  try{art=GO.art({n:name,dynamax:/^Dynamax /i.test(name)},'ea')||'';}
                  catch(error){art=String(error);}
                  return {name,parsed,formId:p.formId,speciesId:p.speciesId,collectionName:GOEventAdapter.collectionName(p),
                          html:art.slice(0,300)};
                })
            }""")
            item["browserGlobals"] = page.evaluate("""() => ({
                navigator: typeof window.GOGoPassNavigation,
                semanticReward: typeof window.GOGoPassRewardArt,
                eventDetail: typeof window.GODETAIL,
                version: document.querySelector('script[src*="go-pass-navigation.js"]')?.src || null
            })""")
            item["availablePasses"] = page.evaluate("""() => ({
                seasons:(window.GOSEASON?.events?.()||[]).filter(e=>/GO Pass/i.test(e.name||e.title||''))
                    .map(e=>({id:e.id,name:e.name||e.title})).slice(0,12),
                registry:(window.GOEventRegistry?.events?.()||[]).filter(e=>(e.passes||[]).some(p=>Array.isArray(p.stages)&&p.stages.length))
                    .map(e=>({id:e.eventId,name:e.title,ranks:e.passes.reduce((sum,p)=>sum+(p.stages?.length||0),0)})).slice(0,12)
            })""")
            choices = item["availablePasses"]["seasons"]
            preferred = sorted(choices, key=lambda p: (not "Into the Wild" in p["name"], not "November" in p["name"]))
            if not preferred:
                preferred = [dict(id=p["id"],name=p["name"]) for p in item["availablePasses"]["registry"]]
            for candidate in preferred[:2]:
                result = {"id": candidate["id"], "name": candidate["name"]}
                try:
                    page.evaluate("(id) => GODETAIL.open(id)", candidate["id"])
                    page.wait_for_selector("#evd:not([hidden]) .ue-hero", timeout=12000)
                    tab = page.locator('#evd .evd-nav-link[data-sec="passes"]')
                    result["has_pass_tab"] = tab.count() > 0
                    if result["has_pass_tab"]:
                        tab.first.click(timeout=12000)
                        page.wait_for_selector("#evd-s-passes:not([hidden])", timeout=12000)
                    result.update(page.evaluate("""() => {
                       const d=document.getElementById('evd'),pass=d?.querySelector('#evd-s-passes');
                       const nav=pass?.querySelector('.ue-pass-nav');
                       const box=nav?.getBoundingClientRect();
                       return {
                         passVisible:!!pass&&!pass.hidden,
                         rankCount:pass?.querySelectorAll('.ue-pass-rank[data-rank]').length||0,
                         rewardCount:pass?.querySelectorAll('.ue-pass-reward').length||0,
                         navCount:pass?.querySelectorAll('.ue-pass-nav').length||0,
                         navBeforeOverview:!!nav&&!!pass?.querySelector('.ue-pass-overview')
                           &&!!(nav.compareDocumentPosition(pass.querySelector('.ue-pass-overview')) & 4),
                         sampleRewards:[...(pass?.querySelectorAll('.ue-pass-reward')||[])].slice(0,5)
                           .map(el=>({text:el.innerText.slice(0,100),html:el.innerHTML.slice(0,280)})),
                         navVisible:!!nav&&!!box&&box.width>0&&box.height>0,
                         navText:nav?.innerText?.slice(0,260)||'',
                         passText:pass?.innerText?.slice(0,250)||'',
                         viewportOverflow:!!d&&(d.scrollWidth>d.clientWidth),
                         activePanel:d?.querySelector('.evd-sec:not([hidden])')?.getAttribute('data-sec')||null,
                         images:pass?.querySelectorAll('.ue-pass-reward img').length||0
                       };
                    }"""))
                    file = OUT / (item["mode"] + "-" + str(len(item["passes"])) + ".png")
                    page.screenshot(path=str(file))
                    result["screenshot"] = file.name
                    page.keyboard.press("Escape")
                    page.wait_for_function("document.getElementById('evd')?.hidden===true", timeout=10000)
                except Exception as error:
                    result["error"] = str(error)[:900]
                    page.screenshot(path=str(OUT / (item["mode"] + "-error.png")))
                item["passes"].append(result)
        except Exception as error:
            item["error"] = str(error)[:900]
            page.screenshot(path=str(OUT / (item["mode"] + "-boot-error.png")))
        report["checks"].append(item)
        ctx.close()
    browser.close()

print("GO_PASS_LIVE_PROBE_RESULT")
print(json.dumps(report, indent=2, ensure_ascii=False))
# Read-only diagnostic: report real evidence and signal a missing control on real passes.
has_published_pass = any(p.get("rankCount", 0)>0 for check in report["checks"] for p in check.get("passes", []))
has_visible_control = any(p.get("navVisible") for check in report["checks"] for p in check.get("passes", []))
if not has_published_pass or not has_visible_control:
    raise SystemExit("Live published GO Pass/navigator not confirmed; inspect screenshot and JSON report")
if os.environ.get("GOFN_EXPECT_NAV_FIRST") == "1":
    for check in report["checks"]:
        actual = check.get("browserGlobals", {}).get("version") or ""
        if not actual.endswith(expected_url):
            raise SystemExit("Production still serves stale navigator URL: " + actual)
        for item in check.get("passes", []):
            if item.get("rankCount", 0) and not item.get("navBeforeOverview"):
                raise SystemExit("GO Pass navigator still below milestones for " + item["name"])

