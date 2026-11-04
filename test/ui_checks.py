"""Browser checks for the Phase 2 dashboard (needs: pip install playwright; a static server: cd public && python3 -m http.server 8791; UI_PORT overrides the port).
Run: python3 test/ui_checks.py. Mocks every /api/* call, fixes the clock to Fri 10 Oct 2026 22:45 Melbourne time."""
import json,sys,re,base64
PNG1=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')

# Stable fixture: two sourced Brisbane City Safari locations, with no raid hotspots.
PLACES_FIXTURE = r'''{"updated":"2026-10-10","tags":["Event venue","Community Day","Raids","Gyms","PokéStops"],"places":[{"id":"queen-street-mall-brisbane","name":"Queen Street Mall","city":"Brisbane","region":"Queensland","country":"Australia","lat":-27.4696,"lng":153.0252,"type":"City Safari hub","role":"City Safari Hub, 26 and 27 Sep 2026, 9 am to 6 pm; also the rain backup for the Saturday community photo","tags":["Event venue"],"sources":[{"label":"Pokémon GO Hub","url":"https://pokemongohub.net/post/event/pokemon-go-city-safari-2026-brisbane-australia/","vouches":"Role as the hub, its hours and dates","trust":"community"}],"coords":{"label":"Wikipedia, article “Queen Street Mall”","url":"https://en.wikipedia.org/wiki/Queen_Street_Mall","note":"Marks the mall (Wikipedia gives -27.4696, 153.0252). Not an official event pin"},"coordinateStatus":"community-reference","route":null,"events":[{"name":"City Safari: Brisbane","from":"2026-09-26","to":"2026-09-27"}]},{"id":"king-george-square-brisbane","name":"King George Square","city":"Brisbane","region":"Queensland","country":"Australia","lat":-27.4683,"lng":153.0243,"type":"Community photo and trade hour","role":"Community photo 12 pm and trade hour 4 pm, Sunday 27 Sep 2026","tags":["Event venue"],"sources":[{"label":"Pokémon GO Hub","url":"https://pokemongohub.net/post/event/pokemon-go-city-safari-2026-brisbane-australia/","vouches":"Role, times and date","trust":"community"}],"coords":{"label":"Wikipedia, article “King George Square”","url":"https://en.wikipedia.org/wiki/King_George_Square","note":"Taken from the article's map link (-27.468333, 153.024313), rounded to 4 places. Marks the square, not an official event pin"},"coordinateStatus":"community-reference","route":null,"events":[{"name":"City Safari: Brisbane","from":"2026-09-27","to":"2026-09-27"}]}]}'''
from playwright.sync_api import sync_playwright
OUT='/tmp/go_ui_'
def ful(body,ct='application/json'): return lambda route,req: route.fulfill(body=body,content_type=ct)
fails=[]
import os
from pathlib import Path
BASE='http://localhost:'+os.environ.get('UI_PORT','8791')  # static server; set UI_PORT to run shards or baselines side by side locally (CI keeps 8791)
SHARD=os.environ.get('UI_SHARD','')  # a, b or c runs one third in CI; empty runs everything
def on(k): return SHARD in ('',k)
def ev(i,name,type,start,end,status,feat=None): return {'id':'leekduck:'+i,'name':name,'type':type,'start':start,'end':end,'tzMode':'local','scope':'worldwide_local','region':None,'featured':feat or [],'bonuses':[],'status':status,'reports':[{'source':'leekduck','link':'https://leekduck.com/events/'+i+'/'}]}
def settle(pg,js,timeout=10000):
    """Wait for an async app effect (a JS expression on the page) instead of sleeping a fixed time; returns False on timeout so the check that follows reports the failure."""
    try: pg.wait_for_function(js,timeout=timeout); return True
    except Exception: return False
def check(name,cond,extra=''):
    print(('PASS ' if cond else 'FAIL ')+name+(' '+str(extra) if extra and not cond else ''))
    if not cond: fails.append(name)

# Design-token contract: semantic roles are shared by the base and dashboard layers,
# and versioned stylesheets are included in the offline shell.
ROOT = Path(__file__).resolve().parent.parent
TREK_EVENT_INFO = json.loads((ROOT / 'public' / 'event-info.json').read_text())
TREK_INFOGRAPHIC_URL = next((item.get('url', '') for item in TREK_EVENT_INFO.get('events', {}).get('trek', {}).get('infographics', []) if item.get('url')), '')
TREK_THUMB_URL = '/infographic-thumbs/' + TREK_INFOGRAPHIC_URL.lstrip('/') + '.webp' if TREK_INFOGRAPHIC_URL.startswith(('/infographics/', '/img/ext/')) else ''
BASE_CSS = (ROOT / 'public' / 'styles.css').read_text()
BASE_COMPONENT_CSS = BASE_CSS[BASE_CSS.index('*{box-sizing:border-box}'):]
DASH_CSS = (ROOT / 'public' / 'dash.css').read_text()
DASH_JS = (ROOT / 'public' / 'dash.js').read_text()
RAID_SHARE_JS = (ROOT / 'public' / 'raid-share.js').read_text()
DETAIL_JS = (ROOT / 'public' / 'detail.js').read_text()
INDEX_HTML = (ROOT / 'public' / 'index.html').read_text()
SW_JS = (ROOT / 'public' / 'sw.js').read_text()
APP_JS = (ROOT / 'public' / 'app.js').read_text()
SEASON_JS = (ROOT / 'public' / 'season.js').read_text()
SEASON_DATA = json.loads((ROOT / 'public' / 'season.json').read_text())
def asset_ref(source, pattern):
    match = re.search(pattern, source)
    return match.group(1) if match else '__missing_asset_reference__'

APP_URL = asset_ref(INDEX_HTML, r'<script src="(/app\.js\?v=[^"]+)"')
DASH_URL = asset_ref(APP_JS, r"ds\.src='(/dash\.js\?v=[^']+)'")
STYLES_URL = asset_ref(INDEX_HTML, r'href="(/styles\.css\?v=[^"]+)"')
DASH_CSS_URL = asset_ref(INDEX_HTML, r'href="(/dash\.css\?v=[^"]+)"')
ACCOUNT_URL = asset_ref(INDEX_HTML, r'<script src="(/account\.js\?v=[^"]+)"')
DETAIL_URL = asset_ref(DASH_JS, r"y\.src = '(/detail\.js\?v=[^']+)'")
REVIEW_URL = asset_ref(DASH_JS, r"rv\.src = '(/review\.js\?v=[^']+)'")
SEASON_URL = asset_ref(INDEX_HTML, r'<script src="(/season\.js\?v=[^"]+)"')
SHELL_CACHE = asset_ref(SW_JS, r"const SHELL_CACHE = '(gofn-shell-v\d+)'")
EVENT_MOVES = json.loads((ROOT / 'public' / 'event-moves.json').read_text())
PIN_JS = (ROOT / 'public' / 'pin.js').read_text()
ACCOUNT_JS = (ROOT / 'public' / 'account.js').read_text()
REVIEW_JS = (ROOT / 'public' / 'review.js').read_text()
INFO_JS = (ROOT / 'public' / 'infographic.js').read_text()
LIB_JS = (ROOT / 'public' / 'lib.js').read_text()
ESC_RENDERERS = [APP_JS] + [(ROOT / 'public' / name).read_text() for name in [
    'account.js', 'buy.js', 'move.js', 'nudge.js', 'review.js',
    'season.js', 'store.js', 'weekly.js', 'whatsnew.js'
]]
check('design tokens define semantic colour, spacing, radius, typography and motion roles',
      all(token in BASE_CSS for token in ['--color-canvas:', '--color-surface:', '--color-text-muted:', '--space-4:', '--radius-card:', '--font-body:', '--motion-standard:', '--motion-quick:']))

EVENT_KIND_PALETTE = [
    ('.p-raid', 'raid', '#D7373C', '#fff'),
    ('.p-cd', 'community-day', '#F76B15', '#1A0E04'),
    ('.p-max', 'max-battle', '#6E56CF', '#fff'),
    ('.p-shiny', 'shiny', '#FFD43B', '#1D1700'),
    ('.p-debut', 'debut', '#12A594', '#031F1B'),
    ('.p-bg', 'background-bonus', '#C2338F', '#fff'),
    ('.p-person', 'in-person', '#3E63DD', '#fff'),
    ('.p-costume', 'costume', '#FF8FB1', '#2A0A15'),
    ('.p-shadow', 'shadow', '#5B3F9B', '#fff'),
    ('.p-mega', 'mega', '#FFB224', '#1A1100'),
    ('.p-primal', 'primal', '#8E1B1B', '#fff'),
    ('.p-giga', 'gigantamax', '#D6336C', '#fff'),
]
def event_kind_rule(selector):
    marker = selector + '{'
    start = BASE_CSS.find(marker)
    return BASE_CSS[start + len(marker):].split('}', 1)[0] if start >= 0 else ''
BASE_ROOT_CSS = BASE_CSS.split(':root[data-theme="light"]', 1)[0]
check('base event-kind badges use semantic foreground/background roles with the original palette',
      all(f'--color-kind-{role}:{background}' in BASE_ROOT_CSS and f'--color-on-kind-{role}:{foreground}' in BASE_ROOT_CSS
          for _, role, background, foreground in EVENT_KIND_PALETTE) and
      all(f'background:var(--color-kind-{role});color:var(--color-on-kind-{role})' in event_kind_rule(selector) and
          '#' not in event_kind_rule(selector) and 'rgb' not in event_kind_rule(selector)
          for selector, role, _, _ in EVENT_KIND_PALETTE))
STATUS_PALETTE = [
    ('.st-a', 'positive', '#26833A', '#fff'),
    ('.st-d', 'caution', '#F59F00', '#1D1300'),
    ('.st-r', 'released', '#1971c2', '#fff'),
]
def status_rule(selector):
    marker = selector + '{'
    start = BASE_CSS.find(marker)
    return BASE_CSS[start + len(marker):].split('}', 1)[0] if start >= 0 else ''
check('base affirmative and provisional status pills use semantic foreground/background roles with unchanged palette values',
      all(f'--color-status-{role}:{background}' in BASE_ROOT_CSS and f'--color-on-status-{role}:{foreground}' in BASE_ROOT_CSS
          for _, role, background, foreground in STATUS_PALETTE) and
      all(f'background:var(--color-status-{role});color:var(--color-on-status-{role})' in status_rule(selector) and
          '#' not in status_rule(selector) and 'rgb' not in status_rule(selector)
          for selector, role, _, _ in STATUS_PALETTE))

SHINY_FILTER_PALETTE = [
    ('--color-filter-shiny-start', '#7b5cff'),
    ('--color-filter-shiny-end', '#d65bd0'),
    ('--color-on-filter-shiny', '#fff'),
]
SHINY_FILTER_SELECTOR = '.tg.x.s[aria-pressed="true"]{'
shiny_start = BASE_CSS.find(SHINY_FILTER_SELECTOR)
shiny_rule = BASE_CSS[shiny_start + len(SHINY_FILTER_SELECTOR):].split('}', 1)[0] if shiny_start >= 0 else ''
check('selected Shiny filter uses semantic gradient tokens with unchanged palette values',
      all(f'{token}:{value}' in BASE_ROOT_CSS for token, value in SHINY_FILTER_PALETTE) and
      'background:linear-gradient(135deg,var(--color-filter-shiny-start),var(--color-filter-shiny-end))' in shiny_rule and
      'color:var(--color-on-filter-shiny)' in shiny_rule and '#' not in shiny_rule and 'rgb' not in shiny_rule)

TYPE_SCALE = {
    '--type-caption-compact': ('.62rem', 2),
    '--type-caption': ('.68rem', 2),
    '--type-overline': ('.72rem', 3),
    '--type-label': ('.75rem', 7),
    '--type-meta': ('.78rem', 4),
    '--type-meta-compact': ('.8rem', 4),
    '--type-body-sm': ('.82rem', 6),
    '--type-body-compact': ('.84rem', 2),
    '--type-button': ('.85rem', 4),
    '--type-body-emphasis': ('.9rem', 3),
    '--type-intro': ('1.05rem', 5),
    '--type-body-lg': ('1.1rem', 2),
    '--type-heading': ('1.5rem', 2),
    '--type-stat': ('2rem', 1),
    '--type-section': ('2.4rem', 2),
    '--type-hero': ('clamp(3.2rem,9vw,7rem)', 1),
    '--type-hero-number': ('clamp(5rem,13vw,9rem)', 1),
    '--type-hero-compact': ('clamp(3.4rem,10vw,5rem)', 1),
    '--type-body-base': ('15px', 1),
}
check('base stylesheet semantic type-scale roles preserve their exact values and declaration counts',
      all(re.search(re.escape(token) + r'\s*:\s*' + re.escape(value) + r'\s*;', BASE_CSS) and
          len(re.findall(r'font-size\s*:\s*var\(' + re.escape(token) + r'\)(?=[;}])', BASE_COMPONENT_CSS)) == count
          for token, (value, count) in TYPE_SCALE.items()))
DASH_TYPE_SCALE = {
    '--type-meta': 12,
    '--type-meta-compact': 12,
    '--type-body-compact': 9,
    '--type-label': 8,
    '--type-body-sm': 7,
    '--type-overline': 6,
    '--type-button': 7,
    '--type-caption': 11,
    '--type-intro': 5,
    '--type-body-emphasis': 5,
    '--type-stat': 3,
    '--type-heading': 1,
    '--type-caption-compact': 7,
    '--type-body-lg': 2,
}
DASH_TYPE_VALUES = ['.78rem', '.8rem', '.84rem', '.75rem', '.82rem', '.72rem', '.85rem', '.68rem', '1.05rem', '.9rem', '2rem', '1.5rem', '.62rem', '1.1rem']
check('dashboard uses the shared semantic type scale for 95 exact font-size declarations',
      all(len(re.findall(r'font-size\s*:\s*var\(' + re.escape(token) + r'\)(?=[;}])', DASH_CSS)) == count
          for token, count in DASH_TYPE_SCALE.items()) and
      all(not re.search(r'font-size\s*:\s*' + re.escape(value) + r'(?=[;}])', DASH_CSS)
          for value in DASH_TYPE_VALUES))
BASE_FONT_SHORTHAND_SCALE = {
    '--type-caption': 1,
    '--type-overline': 2,
    '--type-meta-compact': 3,
    '--type-meta': 2,
    '--type-body-sm': 1,
    '--type-body-emphasis': 1,
}
DASH_FONT_SHORTHAND_SCALE = {
    '--type-body-sm': 12,
    '--type-caption': 17,
    '--type-meta': 8,
    '--type-heading': 7,
    '--type-meta-compact': 7,
    '--type-body-emphasis': 4,
    '--type-button': 2,
    '--type-label': 9,
    '--type-overline': 12,
    '--type-body-lg': 1,
    '--type-intro': 1,
    '--type-caption-compact': 13,
    '--type-body-base': 1,
}
def font_shorthand_role_count(css, token):
    return len(re.findall(r'(?<![-\w])font\s*:\s*[^;{}]*var\(' + re.escape(token) + r'\)', css))
check('base and dashboard font shorthands reuse shared semantic type roles',
      all(font_shorthand_role_count(BASE_CSS, token) == count for token, count in BASE_FONT_SHORTHAND_SCALE.items()) and
      all(font_shorthand_role_count(DASH_CSS, token) == count for token, count in DASH_FONT_SHORTHAND_SCALE.items()))
check('base stylesheet components use semantic palette and typography roles while legacy aliases remain defined',
      re.search(r'var\(--(?:bg|panel|soft|line|fg|muted|body|inv-bg|inv-fg|gold|gold-fg|display|sans|mono)\b', BASE_COMPONENT_CSS) is None and
      all(token in BASE_COMPONENT_CSS for token in ['var(--color-canvas)', 'var(--color-surface)', 'var(--color-surface-raised)', 'var(--color-border)', 'var(--color-text)', 'var(--color-text-muted)', 'var(--color-text-body)', 'var(--color-inverse-surface)', 'var(--color-inverse-text)', 'var(--color-accent)', 'var(--color-accent-text)', 'var(--font-display)', 'var(--font-body)', 'var(--font-mono)']) and
      all(token in BASE_CSS[:BASE_CSS.index('*{box-sizing:border-box}')] for token in ['--bg:', '--panel:', '--soft:', '--line:', '--fg:', '--muted:', '--body:', '--inv-bg:', '--inv-fg:', '--gold:', '--gold-fg:', '--display:', '--sans:', '--mono:']))
check('dashboard status and surface tokens retain compatibility aliases',
      all(token in DASH_CSS for token in ['--surface-glass:', '--border-subtle:', '--color-success:', '--color-warning:', '--color-danger:', '--glass:var(--surface-glass)', '--ring:var(--border-subtle)']))
CARD_GLASS_SELECTORS = [
    '.weekstrip', '.evc', '.pc', '.prio-empty', '.rotc', '.opp', '.evd-card',
    '.tk', '.gencov', '.plc-row', '.srcrow', '.week-day-events>.week-card',
    '.today-empty', '.today-next-up', '.evd-hero', '.goinfo-section',
]
CARD_SOLID_SELECTORS = ['.day-brief', '.today-status']  # Batch 1: the focus tiles are flat raised tiles inside the one brief card
CARD_BORDER_SELECTORS = [
    '.weekstrip', '.evc', '.pc', '.prio-empty', '.rotc', '.opp', '.evd-card',
    '.tk', '.gencov', '.plc-row', '.srcrow', '.day-brief', '.today-status',
    '.today-empty', '.today-next-up', '.evd-hero', '.goinfo-section', '.pc.first', '.opp.missing',
]
def card_rule_text(selector):
    return ' '.join(re.findall(re.escape(selector) + r'\s*\{([^}]*)\}', DASH_CSS))
check('dashboard card anatomy roles preserve the existing glass, solid and border surfaces',
      all(token in DASH_CSS for token in [
          '--color-surface-card:var(--surface-glass)',
          '--color-surface-card-solid:var(--color-surface)',
          '--color-border-card:var(--border-subtle)',
      ]) and
      all('var(--color-surface-card)' in card_rule_text(selector) for selector in CARD_GLASS_SELECTORS) and
      all('var(--color-surface-card-solid)' in card_rule_text(selector) for selector in CARD_SOLID_SELECTORS) and
      all('var(--color-border-card)' in card_rule_text(selector) for selector in CARD_BORDER_SELECTORS))
check('warning banner and status foregrounds use semantic tokens with unchanged palette values',
      all(token in DASH_CSS for token in ['--color-warning-banner:#FBBF24', '--color-on-warning:#1A1200', '--color-warning-banner-border:#B45309', '--color-on-danger:#fff', '--color-on-success:#04230F', 'background:var(--color-warning-banner)', 'color:var(--color-on-warning)', 'border-bottom:3px solid var(--color-warning-banner-border)', 'color:var(--color-on-danger)', 'color:var(--color-on-success)']))
check('base live, raid, mega and shadow badges use semantic roles with their original colours',
      '--color-status-live:#D7373C; --color-on-status-live:#fff;' in BASE_CSS and all(token in BASE_CSS for token in [
          '.now{background:var(--color-status-live);color:var(--color-on-status-live)}',
          '.rb.r{background:var(--color-kind-raid);color:var(--color-on-kind-raid)}',
          '.rb.m{background:var(--color-kind-mega);color:var(--color-on-kind-mega)}',
          '.rb.s{background:var(--color-kind-shadow);color:var(--color-on-kind-shadow)}',
      ]))
check('dashboard token migration preserves existing 14px controls and 18px card corners',
      '--radius-control:14px' in BASE_CSS and '--radius-panel:18px' in BASE_CSS and
      re.search(r'\.evc\{[^}]*border-radius:var\(--radius-panel\)', DASH_CSS) and
      re.search(r'\.day-brief\{[^}]*border-radius:var\(--radius-lg\)', DASH_CSS) and re.search(r'\.today-focus-card\{[^}]*border-radius:var\(--radius-md\)', DASH_CSS) and
      'border-radius:var(--radius-control)' in DASH_CSS)
check('dashboard primitives consume semantic text, typography, accent, border and pill roles',
      all(token in DASH_CSS for token in ['var(--color-text-muted)', 'var(--color-text-body)', 'var(--font-body)', 'var(--font-display)', 'var(--font-mono)', 'var(--color-danger)', 'var(--color-success)', 'var(--color-accent)', 'var(--color-accent-text)', 'var(--radius-pill)', 'var(--border-subtle)', 'var(--surface-glass)', 'var(--color-surface-raised)']))
check('dashboard palette and typography usages no longer depend on legacy aliases',
      re.search(r'var\(--(?:bg|panel|soft|line|fg|muted|body|gold|gold-fg|display|sans|mono|glass|ring|ok|warn|bad)\b', DASH_CSS) is None)
check('inverse dashboard controls use explicit inverse semantic roles',
      'var(--color-inverse-surface)' in DASH_CSS and 'var(--color-inverse-text)' in DASH_CSS)
check('header badges use accent roles, a canvas outline and reduced-motion-aware controls',
      all(token in DASH_CSS for token in ['border:2px solid var(--color-canvas)', 'background:var(--color-accent)', 'color:var(--color-accent-text)', 'var(--motion-fast)', '@media(prefers-reduced-motion:reduce)']))
check('empty agenda and watchlist states use a quiet surface and decorative cue',
      all(token in DASH_CSS for token in ['.event-agenda > .empty', '#followed > .empty', '#savedev > .empty', '.today-empty', 'content:"◇"', 'border:1px dashed var(--color-border-card)']))
check('Today brief has three data-backed focus tiles (Next, Ending soon, Raids & Max) inside one card; the duplicate Now tile is gone',
      'id="today-focus-now"' not in INDEX_HTML and 'id="day-brief-note"' not in INDEX_HTML and
      INDEX_HTML.index('id="day-brief"') < INDEX_HTML.index('id="today-focus-strip"') < INDEX_HTML.index('</section>', INDEX_HTML.index('id="today-focus-strip"')) and
      all(token in INDEX_HTML for token in ['id="today-focus-strip"', 'id="today-focus-next"', 'id="today-focus-raids"', 'id="today-focus-raid-actions"', 'id="today-focus-ending"']) and
      all(token in DASH_JS for token in ['function renderTodayStrip', '6 * 60 * 60 * 1000', '48 * 60 * 60 * 1000', 'window.GOSEASON', 'GOSEASON.deadlines', 'gofn-season-ready', 'activity.inGame', 'activity.inPerson', 'D.rotation', 'D.maxBattles']) and
      all(token in DASH_CSS for token in ['.today-focus-strip', '.today-focus-card', 'grid-template-columns:repeat(2,minmax(0,1fr))']))
check('Today raid focus offers curated counter handoffs for the published five-star and Mega bosses',
      'function todayRotationFor(t)' in DASH_JS and 'function renderTodayRaidPrep(rotation)' in DASH_JS and
      all(token in DASH_JS for token in ['GOTYPES.facts(item.boss)', 'GOBEST.dataReady !== true', 'renderTodayRaidPrep(rotation)', 'data-best-types']) and
      all(token in INDEX_HTML for token in ['id="today-focus-raid-actions"', 'role="group"', 'aria-live="polite"', 'Loading published counter links…']) and
      all(token in DASH_CSS for token in ['.today-focus-raid-actions{display:flex;align-items:center;flex-wrap:wrap;gap:var(--space-1);margin-top:var(--space-1);min-width:0;min-height:44px}', '.today-focus-raid-note']))
check('Tonight owned-counter summary uses existing local marks and curated top-ten type lists',
      'ownedSummary:function(types,limit)' in APP_JS and 'dex.have[name]' in APP_JS and
      'gobest-ready' in APP_JS and 'gobest-ready' in DASH_JS and 'gofn-marks' in DASH_JS and
      'Marked top counters (' in DASH_JS)
check('Tonight does not interpret a loading or failed top-ten feed as zero owned counters',
      'window.GOBEST.dataReady === true' in DASH_JS and 'window.GOBEST.dataReady=true' in APP_JS and
      "document.addEventListener('gobest-ready'" in DASH_JS)
check('Today game plan is an optional accessible local-time disclosure with weakness links to the owned Best attackers view',
      all(token in INDEX_HTML for token in ['id="today-tonight"', 'id="today-tonight-summary"', 'id="today-tonight-list"', 'Today&#39;s game plan']) and "Today's game plan · " in DASH_JS and
      all(token in DASH_JS for token in ['D.spotlight', 'D.raidHour', 'D.maxBattles', '6–7 pm local', '6 am–9 pm local', 'Weak to:', 'data-best-types', 'gofn-dex-ready', 'function renderTonight', 'renderTonight(t, dateKey)', 'today-tonight-state', 'Live now · ends in ', 'Starts in ', 'upcomingCount']) and
      all(token in DASH_CSS for token in ['.today-tonight', '.today-tonight-list', 'min-height:44px', '.today-tonight-best']) and
      'gofn-dex-ready' in APP_JS and APP_URL in INDEX_HTML and APP_URL in SW_JS)
check('Dex/type readiness refreshes Today raid handoffs and the Tonight disclosure without touching event-detail focus targets',
      "document.addEventListener('gotypes', function () { try { todayTypesReady = true; todayTypesFailed = false; renderRot(); var t = now(); renderTodayRaidPrep(todayRotationFor(t)); renderTonight(t, dayKey(t)); } catch (e) {} });" in DASH_JS and
      "document.addEventListener('gofn-dex-ready', function () { try { renderRot(); var t = now(); renderTodayRaidPrep(todayRotationFor(t)); renderTonight(t, dayKey(t)); } catch (e) {} });" in DASH_JS)
check('Best-attacker date distinguishes ranking-content changes from successful refreshes',
      "Ranking content last changed '+j.generated" in APP_JS and "Updated '+j.generated" not in APP_JS)
check('Today multi-deadline tray is accessible, bounded and source-safe',
      all(token in INDEX_HTML for token in ['id="today-deadlines"', 'id="today-deadlines-summary"', 'id="today-deadlines-list"']) and
      all(token in DASH_JS for token in ['var trayLimit = t.getTime() + 7 * 24 * 60 * 60 * 1000', "safeUrl(d.url || '')", 'trayCandidates.slice(0, 8)', 'View all ', 'noopener noreferrer', "sourceUrl.indexOf('https://') === 0"]) and
      all(token in DASH_CSS for token in ['.today-deadlines>summary', 'min-height:44px', '.today-deadline-item', 'var(--color-link)']) and
      DASH_URL in APP_JS and DASH_URL in SW_JS and
      DASH_CSS_URL in INDEX_HTML and DASH_CSS_URL in SW_JS and
      SHELL_CACHE in SW_JS)
check('season pass and deadline data is structured, source-attributed and ordered',
      all(item_id in {item.get('id') for item in SEASON_DATA.get('items', [])}
          for item_id in ['season:pass-halloween', 'season:pass-november']) and
      len(SEASON_DATA.get('deadlines', [])) >= 5 and
      all(d.get('source') == 'Leek Duck' and d.get('url', '').startswith('https://leekduck.com/') and
          d.get('s') and d.get('e') and d['s'] < d['e'] for d in SEASON_DATA.get('deadlines', [])) and
      'deadlines: function () { return deadlines; }' in SEASON_JS)
check('official exclusive-move windows carry source provenance into Today deadlines',
      any(m.get('eventId') == 'novcd' and m.get('move') == 'Kowtow Cleave' and
          any(s.get('trust') == 'official' and s.get('url') == 'https://pokemongo.com/news/communityday-november-2026-pawniard/'
              for s in m.get('sources', []))
          for m in EVENT_MOVES.get('moves', [])) and
      "json('/event-moves.json')" in SEASON_JS and
      "s.trust === 'official'" in SEASON_JS and
      'Exclusive move window ends' in SEASON_JS and
      '/event-moves.json' in SW_JS)
check('150ms interaction transitions use a shared motion role with unchanged easing',
      '--motion-quick:150ms' in BASE_CSS and
      'transition:background-color var(--motion-quick) ease,color var(--motion-quick) ease' in BASE_CSS and
      'transition:transform var(--motion-quick)' in BASE_CSS and
      'transition:transform var(--motion-quick)' in DASH_CSS and
      BASE_CSS.count('var(--motion-quick)') == 3 and DASH_CSS.count('var(--motion-quick)') == 2)  # Batch 1 adds the what's-new chevron
check('base bonus and information availability controls use semantic status roles with unchanged colours',
      all(token in BASE_CSS for token in [
          '--color-status-bonus:#12A594; --color-on-status-bonus:#fff;',
          '--color-status-info-available:#176b45; --color-on-status-info-available:#fff; --color-border-info-available:#2ca66d;',
          '--color-status-info-unavailable:#343b46; --color-on-status-info-unavailable:#d1d5db; --color-border-info-unavailable:#596273;',
          'background:var(--color-status-bonus);color:var(--color-on-status-bonus);',
          'background: var(--color-status-info-available); color: var(--color-on-status-info-available); border: 1px solid var(--color-border-info-available);',
          'background: var(--color-status-info-unavailable); color: var(--color-on-status-info-unavailable); border: 1px solid var(--color-border-info-unavailable);',
      ]))
check('versioned stylesheets are referenced by the page and precached offline',
      all(url in INDEX_HTML and url in SW_JS for url in [STYLES_URL, DASH_CSS_URL]))
check('owner verification scripts are versioned and precached offline',
      ACCOUNT_URL in INDEX_HTML and ACCOUNT_URL in SW_JS and
      REVIEW_URL in DASH_JS and REVIEW_URL in SW_JS)
check('source freshness indicators use semantic roles with unchanged colours',
      all(token in DASH_CSS for token in [
          '--color-source-fresh:#6BD18A; --color-source-stale:#E8B84A; --color-source-failed:#FF9B8F;',
          '.fl-stale button,.fl-degraded button{color:var(--color-source-stale)}.fl-failed button{color:var(--color-source-failed)}',
          '.fr-fresh::before{background:var(--color-source-fresh)}',
          '.fr-stale::before{background:var(--color-source-stale)}',
          '.fr-degraded::before{background:var(--color-source-stale)}',
          '.fr-failed{border-color:var(--color-source-failed)}.fr-failed::before{background:var(--color-source-failed)}',
          '.fr-sum-stale,.fr-sum-degraded{color:var(--color-source-stale)}.fr-sum-failed{color:var(--color-source-failed)}',
      ]))
check('event signal chips and detail tags use semantic palette roles with unchanged colours',
      all(token in DASH_CSS for token in [
          '--color-signal-debut:#12A594; --color-signal-shiny:#F5C542; --color-signal-shadow:#8B5CF6; --color-signal-encounter:#3E63DD;',
          '.signal-debut,.signal-community-day{border-color:color-mix(in srgb,var(--color-signal-debut) 45%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-debut) 13%,var(--surface-glass))}',
          '.signal-shiny{border-color:color-mix(in srgb,var(--color-signal-shiny) 48%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-shiny) 12%,var(--surface-glass))}',
          '.signal-shadow{border-color:color-mix(in srgb,var(--color-signal-shadow) 48%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-shadow) 12%,var(--surface-glass))}',
          '.signal-background,.signal-costume{border-color:color-mix(in srgb,var(--color-signal-encounter) 45%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-encounter) 12%,var(--surface-glass))}',
          '.signal-highlight-debut{border-color:color-mix(in srgb,var(--color-signal-debut) 70%,var(--border-subtle));',
          '.signal-highlight-new-shiny{border-color:color-mix(in srgb,var(--color-signal-shiny) 75%,var(--border-subtle));',
          '.signal-highlight-incense-encounters{border-color:color-mix(in srgb,var(--color-signal-shadow) 65%,var(--border-subtle));',
          '.tg-debut{--tc:var(--color-signal-debut)}.tg-shinydebut{--tc:var(--color-signal-shiny)}',
          '.tg-incense{--tc:var(--color-signal-shadow)}.tg-costume{--tc:var(--color-signal-encounter)}',
      ]))
check('offline shell cache version advances with the dashboard stylesheet token release',
      SHELL_CACHE in SW_JS)
check('Travel mode searches only source-dated physical destinations and preserves Today visibility',
      all(token in INDEX_HTML for token in ['id="sub-travel"', 'id="travel-q"', 'id="travel-destinations"', 'id="travel-regions"', 'id="travel-results"']) and
      "['travel','Travel','sub-travel']" in APP_JS and
      all(token in DASH_JS for token in ['function renderTravel()', 'TRAVEL_REGIONS', 'data-travel-region', "LIB.isInPersonWorldEvent(x)", 'function inGameRegional(list)', "subHead('In-game (regional)'", "!/^dated:/.test(String(x.id || ''))", "indexOf('https://') === 0", 'sourceStart', 'sourceEnd', 'travelDateText', 'REG.filter(function (x)', 'var hide = it.travel ?', 'focusedRegion', 'focusTarget.focus()']) and
      all(token in DASH_CSS for token in ['#sub-travel .travel-search', '#travel-regions .fchip{min-height:44px}', '#travel-results .agw .ag-actions .agx{width:44px;height:44px;min-width:44px;min-height:44px}']) and
      APP_URL in INDEX_HTML and APP_URL in SW_JS and
      DASH_URL in APP_JS and DASH_URL in SW_JS and
      DASH_CSS_URL in INDEX_HTML and DASH_CSS_URL in SW_JS and
      SHELL_CACHE in SW_JS)
check('raid rotation cards use source-published local windows and Leek Duck attribution',
      'function raidSourceLink(r)' in DASH_JS and 'fmtT(new Date(second.s))' in DASH_JS and
      'Next raid rotation' in DASH_JS and 'sourceUrl' in DASH_JS and
      'Raid rotation windows follow their published local times' in DASH_JS and '.rw-source' in DASH_CSS)
check('raid share dialog and script are included in the exact offline shell',
      '/raid-share.js?v=20261102b' in INDEX_HTML and '/raid-share.js?v=20261102b' in SW_JS and
      all(token in INDEX_HTML for token in ['id="raid-share-dialog"', 'id="raid-share-title"', 'id="raid-share-send"', 'id="raid-share-copy"']))
check('raid share payload uses sourced weaknesses, local top-ten marks and safe DOM rendering',
      all(token in RAID_SHARE_JS for token in ['typeApi.facts(boss)', 'bestApi.dataReady === true',
          'bestApi.ownedSummary(weak, 3)', 'current top-ten type lists', 'your local marks',
          'navigator.share', 'navigator.clipboard', 'textContent = payload.boss']) and
      'innerHTML' not in RAID_SHARE_JS)
check('event detail focus restoration can find a re-rendered opener by event key and card role',
      all(token in DETAIL_JS for token in ['openerKey', 'openerClass', "getAttribute('data-open')", 'target.focus()']))
check('versioned dashboard scripts are referenced by the entry page and precached offline',
      APP_URL in INDEX_HTML and APP_URL in SW_JS and
      DASH_URL in APP_JS and DASH_URL in SW_JS and
      DETAIL_URL in DASH_JS and DETAIL_URL in SW_JS)
check('sync PIN and account controls have one home in Menu and are precached offline',
      INDEX_HTML.index('id="acct" class="acct"') > INDEX_HTML.index('id="sub-menu"') and
      'id="pinform"' not in INDEX_HTML and
      "document.querySelector('#pindd .pinform')" in PIN_JS and
      '/pin.js?v=20261101b' in INDEX_HTML and '/pin.js?v=20261101b' in SW_JS)
check('owner-only account and moderation UI requires server-verified PIN access',
      'ownerVerified ? \'owner\' : \'guest\'' in ACCOUNT_JS and
      "new CustomEvent('gofn-owner-state'" in ACCOUNT_JS and
      "getAttribute('data-role') === 'owner'" in REVIEW_JS and
      "gofn-owner-state" in REVIEW_JS and
      '[data-role="guest"] #hireview' in BASE_CSS and
      '[data-role="guest"] .igbanner' in BASE_CSS)
check('versioned season banner script is referenced by the page and precached offline',
      SEASON_URL in INDEX_HTML and SEASON_URL in SW_JS)
check('secondary dashboard views render only while their panels are active',
      all(token in DASH_JS for token in [
          'function panelIsVisible(id)',
          'function isTimelineVisible()',
          'function isCalendarVisible()',
          'function isTravelVisible()',
          'function isRaidsVisible()',
          'function isOppsVisible()',
          'function isSavedVisible()',
          "function isSavedVisible() { return panelIsVisible('tab-saved') && (panelIsVisible('sub-watch') || panelIsVisible('sub-menu')); }",
          'function drawTypes()',
          'function drawStrip()',
          'function drawTimeline()',
          'function drawCalendar()',
          'function drawTravel()',
          'function drawRot()',
          'function drawOpps()',
          'function drawSaved()',
          "document.addEventListener('gofn-view', renderActiveSecondaryView);"
      ]) and
      'function renderAll() { renderKinds(); renderPrio(); renderHomeAgenda(); renderActionCentre(); renderActiveSecondaryView(); }' in DASH_JS)
check('Watchlist badge derives its count from saved/followed state while secondary panels are deferred',
      'savedCount: savedCount' in DASH_JS and
      "typeof window.GODASH.savedCount==='function'" in APP_JS and
      "document.addEventListener('gofn-marks',upd)" in APP_JS and
      "document.addEventListener('gofn-state',upd)" in APP_JS and
      "document.addEventListener('gofn-saved-count',upd)" in APP_JS)
check('all HTML renderers use one shared apostrophe-safe escape helper',
      'function esc(value)' in LIB_JS and 'esc: esc' in LIB_JS and
      all('var esc = window.GOLIB.esc;' in source for source in ESC_RENDERERS) and
      all(not re.search(r'function\s+esc\s*\(', source) and
          not re.search(r'var\s+esc\s*=\s*function', source) for source in ESC_RENDERERS))
check('versioned infographic script is referenced by the dashboard and precached offline',
      '/infographic.js?v=20261103a' in DASH_JS and '/infographic.js?v=20261103a' in SW_JS)
check('infographic card previews prefer static WebP thumbnails and stay lazy until visible',
      'function cardThumbUrl(original)' in INFO_JS and '/infographic-thumbs/' in INFO_JS and
      'data-thumb-src' in INFO_JS and 'data-igfallback' in INFO_JS and
      'new IntersectionObserver' in INFO_JS and "rootMargin: '80px 0px'" in INFO_JS)
check('full-resolution infographic URLs remain in the accessible detail viewer',
      "esc(im.url)" in INFO_JS and 'data-thumb-full' in INFO_JS)
check('mobile chrome uses compact 48px navigation targets, safe-area padding and reduced header/body spacing',
      all(token in BASE_CSS for token in ['padding-block:0 calc(72px + env(safe-area-inset-bottom,0px))', '@media (max-width:1199px){header.top{padding-top:var(--space-4)}}', 'padding:4px 8px calc(4px + env(safe-area-inset-bottom,0px))', 'padding:var(--space-1) 2px;min-height:48px', 'width:1.2rem;height:1.2rem']) and
      'min-height:68px' in BASE_CSS and 'nav.tabs button{min-height:56px}' in DASH_CSS and '@media(max-width:1199px){nav.tabs button{min-height:48px}}' in DASH_CSS)
check('desktop navigation rail is breakpoint-scoped and mobile keeps the bottom bar',
      all(token in BASE_CSS for token in ['@media (min-width:1200px)', 'body{padding-left:max(132px,calc(4vw + 100px));padding-bottom:var(--space-6)}', 'left:16px;right:auto;top:50%;bottom:auto;transform:translateY(-50%)', 'nav.tabs .row{flex-direction:column', 'nav.tabs button{flex:none;width:100%;min-height:68px']) and
      'nav.tabs{position:fixed;left:0;right:0;bottom:0' in BASE_CSS)
check('calendar weekday labels expand to full names on wide screens',
      all(name in DASH_JS for name in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) and
      all(token in DASH_CSS for token in ['.ch-short{display:inline}', '.ch-long{display:none;white-space:nowrap}', '@media (min-width:720px){.ch-short{display:none}.ch-long{display:inline}}']))
check('Today has separate primary and supporting-panel layout wrappers',
      all(token in INDEX_HTML for token in ['class="today-layout"', 'class="today-main"', 'class="today-sidebar"', 'id="home-now"', 'id="action-centre"', 'id="foryou-sec"', 'id="weekly-sec"', 'id="buy-sec"']))
check('desktop Today uses two columns while mobile lists today\'s events before the supporting panels',
      all(token in DASH_CSS for token in ['#tab-now .today-layout{display:flex;flex-direction:column;gap:var(--space-5);min-width:0}', '#tab-now .today-sidebar{display:contents}', '#tab-now #action-centre,#tab-now #foryou-sec,#tab-now #weekly-sec,#tab-now #buy-sec{order:2}', '#tab-now .today-main{order:1;min-width:0}', '@media(min-width:960px)', 'grid-template-columns:minmax(0,1.55fr) minmax(18rem,.9fr)', '#tab-now .today-sidebar{grid-column:2;display:grid']))
with sync_playwright() as p:
    b=p.chromium.launch()
    def page(api=None,marks=None,clock='2026-10-09T22:45:00+11:00',sources=None,gens=None,us=None,extra=None,pin=False,slow_places=False,width=390,height=844,mobile=False,guard=None,pre=None,ready=True):
        ctx=b.new_context(viewport={'width':width,'height':height},device_scale_factor=2,timezone_id='Australia/Melbourne',locale='en-AU',service_workers='block',**({'is_mobile':True,'has_touch':True} if mobile else {}))
        # Bound default Playwright waits so a lazy asset or missing control cannot stall a whole shard.
        ctx.set_default_timeout(10000)
        ctx.set_default_navigation_timeout(15000)
        pg=ctx.new_page(); pg.errs=[]; pg.season_poster_requests=[]; pg.season_thumb_requests=[]; pg.infographic_requests=[]
        pg.on('pageerror',lambda e:pg.errs.append(str(e)))
        pg.on('request',lambda r:pg.season_poster_requests.append(r.url) if any(slug in r.url for slug in ('season-24-twilight-trails','go-pass-october-2026','halloween-2026-part-2','go-pass-november-2026')) else None)
        pg.on('request',lambda r:pg.season_thumb_requests.append(r.url) if '/season-thumbs/' in r.url else None)
        pg.on('request',lambda r:pg.infographic_requests.append(r.url) if '/img/ext/' in r.url or '/infographics/' in r.url or '/infographic-thumbs/' in r.url else None)
        if guard is not None:  # console guard: collect everything noisy so the caller can filter it against an explicit allow-list
            pg.on('console',lambda m:guard.append(('console.'+m.type,m.text,m.location.get('url',''))) if m.type in ('error',) else None)
            pg.on('pageerror',lambda e:guard.append(('pageerror',str(e),'')))
            pg.on('requestfailed',lambda r:guard.append(('requestfailed',(r.failure or ''),r.url)))
        pg.clock.install(time=clock)
        # Fonts come from Google over the network: serve empty stand-ins so runs are identical online, offline and behind a proxy.
        pg.route(re.compile(r'^https://fonts\.(googleapis|gstatic)\.com/'),lambda r:r.fulfill(status=200,body='',content_type='text/css' if 'googleapis' in r.request.url else 'font/woff2'))
        pg.route('**/api/sources',ful(sources or '{"environment":"production","database":true,"enabled":false,"sources":[]}'))
        pg.route('**/api/events',ful(api or '{"enabled":false,"events":[]}'))
        pg.route(re.compile(r'/(img/ext|infographics|infographic-thumbs|season-thumbs)/'),lambda r:r.fulfill(body=PNG1,content_type='image/png'))  # R2 pictures are not in the static folder
        pg.route('**/api/userstate*',lambda r:r.fulfill(status=404,body='{}',content_type='application/json'))
        pg.route('**/api/dex',lambda r:r.fulfill(status=401,body='{}',content_type='application/json'))
        pg.route('**/api/art*',lambda r:r.fulfill(status=404,body=''))
        for pat,(body,st) in (extra or {}).items(): pg.route(pat,(lambda body,st:(lambda r,req=None:r.fulfill(status=st,body=body,content_type='application/json')))(body,st))
        if slow_places:
            pg.add_init_script(r"""(() => {
                const append = Node.prototype.appendChild;
                Node.prototype.appendChild = function (node) {
                    if (node && node.tagName === 'SCRIPT' && /\/places\.js(?:\?|$)/.test(node.src)) {
                        window.__gofnPlacesDeferred = true;
                        setTimeout(() => append.call(this, node), 1500);
                        return node;
                    }
                    return append.call(this, node);
                };
            })();""")
        if pin: pg.add_init_script("localStorage.setItem('gofn-pin','x')")
        if marks: pg.add_init_script("localStorage.setItem('gofn-dex-v1',%s)"%json.dumps(json.dumps(marks)))
        if us: gens=gens or []
        if gens or us: pg.add_init_script("if(!localStorage.getItem('gofn-us-v1'))localStorage.setItem('gofn-us-v1',%s)"%json.dumps(json.dumps(dict({'pref:gen:%d'%g:{'v':True,'t':1} for g in (gens or [])} and {'pref:gen:%d'%g:{'v':True,'t':1} for g in (gens or [])},**{k:{'v':v,'t':1} for k,v in (us or {}).items()}))))
        if pre: pre(pg)  # extra routes (a stalled feed, a blocked script) are registered after the defaults, so they win
        if not ready:  # robustness tests: do not wait for the first render, that is what they measure
            pg.goto(BASE+'/', wait_until='domcontentloaded'); return pg
        pg.goto(BASE+'/', wait_until='domcontentloaded' if slow_places else 'load'); pg.wait_for_selector('.pc, .prio-empty',state='attached'); pg.wait_for_function("document.getElementById('home-now')?.hasAttribute('data-render-key')")
        # dash.js appends detail/extra/places/infographic scripts after the first render; tests call their globals straight away.
        settle(pg,"!!(window.GODETAIL&&window.GOEXTRA&&window.GOINFOGRAPHIC)&&(%s||!!window.GOPLACES)"%('true' if slow_places else 'false'))
        return pg
    if on('a'):
        # Primary navigation follows the ARIA tabs pattern: one tab stop, linked panels and predictable keyboard movement.
        tabs_page = page()
        tab_buttons = tabs_page.locator('#tabs [role="tab"]')
        tab_contract = tab_buttons.evaluate_all("""els => {
          const selected=els.filter(el=>el.getAttribute('aria-selected')==='true');
          const stops=els.filter(el=>el.tabIndex===0);
          return {
            count:els.length,
            roles:els.every(el=>el.tagName==='BUTTON'),
            controls:els.every(el=>!!el.id && !!document.getElementById(el.getAttribute('aria-controls')) &&
              document.getElementById(el.getAttribute('aria-controls')).getAttribute('aria-labelledby')===el.id),
            selected:selected.length,
            stops:stops.length,
            activeMatches:selected.length===1 && stops.length===1 && selected[0]===stops[0]
          };
        }""")
        check('Primary tabs expose linked tabpanels and exactly one keyboard tab stop',
              tab_contract['count']==4 and tab_contract['roles'] and tab_contract['controls'] and
              tab_contract['activeMatches'], tab_contract)
        now_tab = tabs_page.locator('#tabs [data-tab="now"]')
        schedule_tab = tabs_page.locator('#tabs [data-tab="events"]')
        collect_tab = tabs_page.locator('#tabs [data-tab="collect"]')
        now_tab.focus(); now_tab.press('ArrowRight')
        check('ArrowRight focuses and activates Schedule with roving tabindex',
              schedule_tab.evaluate("el=>document.activeElement===el && el.tabIndex===0 && el.getAttribute('aria-selected')==='true'") and
              tabs_page.locator('#tab-events').is_visible() and tabs_page.locator('#tab-now').is_hidden())
        schedule_tab.press('ArrowLeft')
        check('ArrowLeft returns to Today and its linked panel',
              now_tab.evaluate("el=>document.activeElement===el && el.tabIndex===0 && el.getAttribute('aria-selected')==='true'") and
              tabs_page.locator('#tab-now').is_visible())
        now_tab.press('End')
        check('End moves to the final primary tab',
              collect_tab.evaluate("el=>document.activeElement===el && el.tabIndex===0 && el.getAttribute('aria-selected')==='true'") and
              tabs_page.locator('#tab-collect').is_visible())
        collect_tab.press('Home')
        check('Home returns focus and selection to Today',
              now_tab.evaluate("el=>document.activeElement===el && el.tabIndex===0 && el.getAttribute('aria-selected')==='true'") and
              tabs_page.locator('#tab-now').is_visible())
        tabs_page.context.close()

        # Published GO Pass/season end times share the existing Ending soon signal; no free-text expiry is inferred.
        empty_data_obj = json.loads((ROOT / 'public' / 'data.json').read_text())
        empty_data_obj['events'] = []
        empty_data_obj['spotlight'] = []
        empty_data_obj['raidHour'] = []
        empty_data_obj['rotation'] = []
        empty_data_obj['maxBattles'] = []
        empty_data_obj['inPerson'] = []
        empty_data_obj['worldEvents'] = []
        empty_data_obj['regionals'] = []
        empty_data = json.dumps(empty_data_obj)
        empty_world = json.dumps({'events': []})
        pass_season = json.dumps({
            'items': [{
                'id': 'season:pass-fixture', 'label': 'GO Pass', 'name': 'GO Pass: Fixture',
                's': '2026-10-01T10:00', 'e': '2026-10-10T10:00',
                'url': 'https://leekduck.com/events/go-pass-fixture/'
            }],
            'deadlines': [
                {'id': 'pass-rewards', 'name': 'GO Pass: Fixture rewards', 'title': 'Rewards expire',
                 'action': 'claim by', 's': '2026-10-10T10:00', 'e': '2026-10-12T10:00',
                 'source': 'Leek Duck', 'url': 'https://leekduck.com/events/go-pass-fixture/'},
                {'id': 'future-research', 'name': 'Future research fixture', 'title': 'Research expires',
                 'action': 'claim by', 's': '2026-10-11T10:00', 'e': '2026-10-12T10:00',
                 'source': 'Leek Duck', 'url': 'https://leekduck.com/events/go-pass-fixture/'},
                {'id': 'expired-research', 'name': 'Expired research fixture', 'title': 'Research expires',
                 'action': 'claim by', 's': '2026-10-01T10:00', 'e': '2026-10-09T10:00',
                 'source': 'Leek Duck', 'url': 'https://leekduck.com/events/go-pass-fixture/'}
            ]
        })
        deadline_responses = {
            '**/data.json': (empty_data, 200),
            '**/world-events.json': (empty_world, 200),
            '**/regional-events.json': (empty_world, 200),
            '**/season.json': (pass_season, 200)
        }
        deadline_page = page(extra=deadline_responses)
        deadline_page.wait_for_function("document.getElementById('today-focus-ending')?.textContent.includes('GO Pass ends in')")
        deadline_label = deadline_page.locator('#today-focus-ending').inner_text()
        deadline_meta = deadline_page.locator('#today-focus-ending-meta').inner_text()
        check('Today Ending soon surfaces a published active GO Pass deadline',
              'GO Pass ends in' in deadline_label and 'GO Pass: Fixture' in deadline_meta,
              (deadline_label, deadline_meta))
        check('Today Ending soon shows the published pass end date and local time',
              '10 Oct' in deadline_meta and '10' in deadline_meta and 'am' in deadline_meta,
              deadline_meta)
        deadline_page.context.close()

        rewards_page = page(clock='2026-10-10T12:00:00+11:00', extra=deadline_responses)
        # season.json is fetched by season.js after first paint; wait for it explicitly (it re-renders Today via gofn-season-ready), then for the label.
        rewards_ready = settle(rewards_page, "!!window.GOSEASON", 30000) and settle(rewards_page, "document.getElementById('today-focus-ending')?.textContent.includes('Rewards expire in')")
        rewards_label = rewards_page.locator('#today-focus-ending').inner_text()
        rewards_meta = rewards_page.locator('#today-focus-ending-meta').inner_text()
        check('Today Ending soon surfaces a published reward-claim deadline after the pass ends',
              'Rewards expire in' in rewards_label and 'GO Pass: Fixture rewards' in rewards_meta and 'claim by' in rewards_meta,
              (rewards_ready, rewards_label, rewards_meta))
        check('future and expired structured deadlines are ignored',
              'Future research fixture' not in rewards_meta and 'Expired research fixture' not in rewards_meta,
              rewards_meta)
        rewards_page.context.close()

        live_pass_page = page(clock='2026-11-02T05:51:00+11:00', extra={
            '**/data.json': (empty_data, 200),
            '**/world-events.json': (empty_world, 200),
            '**/regional-events.json': (empty_world, 200)
        })
        live_pass_page.wait_for_selector('#seasonbar .ssn-card')
        live_pass_cards = live_pass_page.locator('#seasonbar .ssn-card')
        live_pass_text = live_pass_cards.all_inner_texts()
        check('Today shows the active Halloween GO Pass alongside the season and October pass',
              live_pass_cards.count() == 3 and any('GO Pass: Halloween 2026' in text for text in live_pass_text),
              live_pass_text)
        live_pass_page.wait_for_function("document.getElementById('today-focus-ending-meta')?.textContent.includes('GO Pass: October')")
        check('Today Ending soon prioritises the earliest active published pass deadline',
              'GO Pass ends in' in live_pass_page.locator('#today-focus-ending').inner_text() and
              'GO Pass: October' in live_pass_page.locator('#today-focus-ending-meta').inner_text())
        live_pass_page.context.close()

        multi_season = json.dumps({
            'items': [{
                'id': 'season:pass-fixture', 'label': 'GO Pass', 'name': 'GO Pass: Fixture',
                's': '2026-10-01T10:00', 'e': '2026-11-03T10:00',
                'url': 'https://leekduck.com/events/go-pass-fixture/', 'img_credit': 'Leek Duck'
            }, {
                'id': 'season:relative-source', 'label': 'Season', 'name': 'Season: Local image source',
                's': '2026-10-01T10:00', 'e': '2026-11-04T12:00',
                'url': '/img/ext/season-poster.webp', 'img_credit': 'Leek Duck'
            }],
            'deadlines': [
                {'id': 'research-first', 'name': 'Timed Research: First', 'title': 'Research expires',
                 'action': 'claim by', 's': '2026-11-01T10:00', 'e': '2026-11-03T12:00',
                 'source': 'Leek Duck', 'url': 'https://leekduck.com/events/research-first/'},
                {'id': 'rewards-second', 'name': 'GO Pass: Fixture rewards', 'title': 'Rewards expire',
                 'action': 'claim by', 's': '2026-11-01T10:00', 'e': '2026-11-04T10:00',
                 'source': 'Leek Duck', 'url': 'https://leekduck.com/events/go-pass-fixture/',
                 'qualifier': 'Claim the published rewards before expiry.'},
                {'id': 'future-research', 'name': 'Future research fixture', 'title': 'Research expires',
                 'action': 'claim by', 's': '2026-11-04T10:00', 'e': '2026-11-05T10:00',
                 'source': 'Leek Duck', 'url': 'https://leekduck.com/events/future-research/'},
                {'id': 'expired-research', 'name': 'Expired research fixture', 'title': 'Research expires',
                 'action': 'claim by', 's': '2026-10-31T10:00', 'e': '2026-11-01T10:00',
                 'source': 'Leek Duck', 'url': 'https://leekduck.com/events/expired-research/'}
            ]
        })
        multi_responses = {
            '**/data.json': (empty_data, 200),
            '**/world-events.json': (empty_world, 200),
            '**/regional-events.json': (empty_world, 200),
            '**/season.json': (multi_season, 200),
            '**/event-moves.json': (json.dumps({'moves': []}), 200)
        }
        multi_page = page(clock='2026-11-02T07:36:00+11:00', extra=multi_responses)
        multi_page.wait_for_function("document.getElementById('today-deadlines') && !document.getElementById('today-deadlines').hidden")
        multi_tray = multi_page.locator('#today-deadlines')
        multi_items = multi_page.locator('#today-deadlines-list li')
        check('Today deadline tray disclosure is collapsed initially and opens by keyboard-accessible summary',
              not multi_tray.evaluate("el => el.open"))
        multi_page.locator('#today-deadlines-summary').focus()
        multi_page.keyboard.press('Enter')
        multi_page.wait_for_function("!document.getElementById('today-deadlines-list').hidden")
        multi_text = multi_items.all_inner_texts()
        check('Today deadline tray lists active pass, research and reward deadlines in chronological order',
              multi_items.count() == 4 and
              'GO Pass: Fixture' in multi_text[0] and
              'Timed Research: First' in multi_text[1] and
              'GO Pass: Fixture rewards' in multi_text[2] and
              'Season: Local image source' in multi_text[3],
              multi_text)
        check('Today deadline tray excludes future and expired structured windows',
              'Future research fixture' not in ' '.join(multi_text) and
              'Expired research fixture' not in ' '.join(multi_text),
              multi_text)
        check('Today deadline tray links only the recorded HTTPS source URLs',
              multi_page.locator('#today-deadlines-list a').count() == 3 and
              multi_items.nth(3).locator('a').count() == 0 and
              multi_page.locator('#today-deadlines-list a').evaluate_all(
                  "els => els.every(a => a.href.startsWith('https://leekduck.com/') && a.target === '_blank' && a.rel.includes('noopener'))"))
        check('Today deadline tray reveals its ordered list when expanded',
              multi_tray.evaluate("el => el.open") and multi_items.count() == 4)
        check('expanded source links meet the 44px hit-target minimum',
              multi_page.locator('#today-deadlines-list a').evaluate_all("els => els.every(a => { const r=a.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })"))
        multi_page.context.close()

        # Official event-exclusive move windows enter Today only while their published window is active.
        move_deadline_page = page(clock='2026-11-21T14:00:00+11:00', extra={
            '**/data.json': (empty_data, 200),
            '**/world-events.json': (empty_world, 200),
            '**/regional-events.json': (empty_world, 200)
        })
        move_deadline_page.wait_for_function("document.getElementById('today-focus-ending')?.textContent.includes('Exclusive move window ends in')")
        move_deadline_label = move_deadline_page.locator('#today-focus-ending').inner_text()
        move_deadline_meta = move_deadline_page.locator('#today-focus-ending-meta').inner_text()
        check('Today Ending soon surfaces the official exclusive-move window while active',
              'Exclusive move window ends in' in move_deadline_label and
              'November Community Day' in move_deadline_meta and
              'Kowtow Cleave' in move_deadline_meta and
              'Pokémon GO (official)' in move_deadline_meta,
              (move_deadline_label, move_deadline_meta))
        move_deadline_page.context.close()

        community_move_fixture = json.dumps({'moves': [{
            'id': 'novcd:bisharp:kingambit:kowtow-cleave', 'eventId': 'novcd',
            'eventName': 'November Community Day', 'pokemon': 'Bisharp',
            'evolutionTarget': 'Kingambit', 'move': 'Kowtow Cleave', 'moveKind': 'charged',
            'acquisition': 'EVOLVE', 'windowStart': '2026-11-21T14:00',
            'windowEnd': '2026-11-21T21:00',
            'sources': [{'id': 'community', 'name': 'Community report', 'trust': 'community',
                         'url': 'https://example.com/community-report'}]
        }]})
        unverified_move_page = page(clock='2026-11-21T14:00:00+11:00', extra={
            '**/data.json': (empty_data, 200),
            '**/world-events.json': (empty_world, 200),
            '**/regional-events.json': (empty_world, 200),
            '**/event-moves.json': (community_move_fixture, 200)
        })
        unverified_move_page.wait_for_function("document.getElementById('today-focus-ending')?.textContent.includes('Nothing timed in the next 6h')")
        unverified_move_meta = unverified_move_page.locator('#today-focus-ending-meta').inner_text()
        check('Community-only move attribution is not promoted to an official Today deadline',
              'Kowtow Cleave' not in unverified_move_meta and 'Exclusive move window ends' not in unverified_move_page.locator('#today-focus-ending').inner_text(),
              unverified_move_meta)
        unverified_move_page.context.close()

        # A stalled initial data request must time out, expose a retry, and leave the primary navigation usable.
        boot_ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='Australia/Melbourne',locale='en-AU',service_workers='block')
        boot_ctx.set_default_timeout(10000)
        boot_ctx.set_default_navigation_timeout(15000)
        boot=boot_ctx.new_page(); boot.clock.install(time='2026-10-09T22:45:00+11:00')
        boot.route('**/data.json',lambda route: None)  # leave the request pending to exercise the timeout
        boot.route('**/art/index.json',ful('{}'))
        boot.goto(BASE+'/',wait_until='domcontentloaded')
        boot.clock.fast_forward(13000); boot.clock.run_for(10); boot.wait_for_timeout(100)
        check('stalled initial data request shows a retryable error',boot.locator('#load-error:not([hidden])').count()==1 and boot.locator('#load-retry').is_visible())
        check('fallback navigation remains visible when initial data is unavailable',boot.locator('nav.tabs button[data-boot-tab]').count()==4)
        boot.locator('nav.tabs button[data-boot-tab="now"]').focus()
        boot.locator('nav.tabs button[data-boot-tab="now"]').press('ArrowRight')
        check('fallback navigation supports ArrowRight while event data is unavailable',
              boot.locator('nav.tabs button[data-boot-tab="events"]').evaluate("el=>document.activeElement===el && el.tabIndex===0 && el.getAttribute('aria-selected')==='true'") and
              boot.locator('#tab-events').is_visible())
        boot.locator('nav.tabs button[data-boot-tab="events"]').press('ArrowLeft')
        check('fallback navigation supports ArrowLeft back to Today',
              boot.locator('nav.tabs button[data-boot-tab="now"]').evaluate("el=>document.activeElement===el && el.tabIndex===0 && el.getAttribute('aria-selected')==='true'") and
              boot.locator('#tab-now').is_visible())
        boot.click('nav.tabs button[data-boot-tab="raids"]')
        check('fallback navigation can reach Battle without loaded event data',boot.locator('#tab-raids').is_visible() and boot.locator('#tab-now').is_hidden())
        boot.click('nav.tabs button[data-boot-tab="events"]')
        check('fallback navigation can return to Schedule',boot.locator('#tab-events').is_visible() and boot.locator('#tab-raids').is_hidden())
        boot_ctx.close()

        # Overseas in-person events must stay in the visible Today agenda, with separate counts.
        world_fixture = json.dumps({'events':[{'id':'fixture-overseas-inperson','name':'Overseas In-Person Fixture','place':'Example City, Exampleland','area':'Asia','scope':'regional','start':'2026-10-09','end':'2026-10-10','sources':[{'url':'https://example.invalid/overseas-inperson-fixture'}]}]})
        overseas = page(extra={'**/world-events.json':(world_fixture,200)})
        overseas.wait_for_selector('#home-now .agr.reg')
        overseas_card = overseas.locator('#home-now .agr.reg').filter(has_text='Overseas In-Person Fixture')
        overseas_text = overseas_card.inner_text() if overseas_card.count() else ''
        check('Overseas in-person events remain visible on Today by default', overseas_card.count()==1 and overseas_card.is_visible() and 'Example City, Exampleland' in overseas_text, overseas_text)
        check('Overseas in-person cards stay in the visible unfolded Today agenda', overseas_card.count()==1 and overseas_card.evaluate("el => !!el.closest('.today-phase-group') && !el.closest('details')"))
        check('Unverified venue-local times are not invented for overseas event cards', 'Venue:' not in overseas_text)
        overseas_counts = overseas.evaluate("""() => {
          const t=new Date(), live=window.GODASH.events().filter(e=>!e.long&&!window.GODASH.kindHidden(e.kind)&&e.start<=t&&e.end>t);
          const regional=window.GODASH.regionalEvents().filter(e=>e.start<=t&&e.end>t);
          const worldwide=window.GODASH.worldEvents().filter(e=>e.start<=t&&e.end>t);
          return {actual:{inGame:Number(document.getElementById('day-live-count').textContent),inPerson:Number(document.getElementById('day-inperson-count').textContent)},expected:{inGame:live.filter(e=>e.kind!=='person').length+worldwide.length,inPerson:live.filter(e=>e.kind==='person').length+regional.length}};
        }""")
        check('Overseas in-person activity remains in its separate summary count', overseas_counts['actual']==overseas_counts['expected'] and overseas_counts['actual']['inPerson']>=1, overseas_counts)

        # The primary world feed can fail; the regional fallback must preserve each event's own official source.
        run30_fallback = page(clock='2026-11-14T12:00:00+11:00', extra={
            '**/world-events.json': (json.dumps({'events': []}), 200)
        })
        run30_fallback.wait_for_selector('#home-now .agr.reg')
        run30_card = run30_fallback.locator('#home-now .agr.reg').filter(has_text='Pokémon RUN 30: New Taipei')
        run30_text = run30_card.inner_text() if run30_card.count() else ''
        check('New Taipei RUN 30 remains visible on Today through the regional fallback',
              run30_card.count()==1 and run30_card.is_visible() and 'New Taipei Metropolitan Park' in run30_text,
              run30_text)
        check('Regional fallback preserves the official Pokémon GO source for RUN 30',
              run30_card.get_attribute('href') == 'https://pokemongo.com/news/pokemon-run-30-2026/')
        check('Regional fallback does not invent an event-local time',
              not re.search(r'\b\d{1,2}:\d{2}\b|\b(?:am|pm)\b', run30_text, re.I), run30_text)
        for run30_width in (320, 390, 1280):
            run30_fallback.set_viewport_size({'width':run30_width,'height':844 if run30_width < 600 else 900})
            run30_fallback.wait_for_timeout(100)
            run30_box = run30_card.bounding_box()
            check('New Taipei RUN 30 remains visible at %dpx in the regional fallback' % run30_width,
                  run30_card.count()==1 and run30_card.is_visible() and run30_box is not None and
                  run30_box['x'] >= -1 and run30_box['x'] + run30_box['width'] <= run30_width + 1,
                  {'viewport':run30_width,'box':run30_box,'documentWidth':run30_fallback.evaluate('document.documentElement.scrollWidth')})
        run30_fallback.context.close()

        # A similarly titled in-game card is not proof that an overseas in-person listing is redundant.
        collision_events = [ev('fixture-game-collision','Overseas In-Person Fixture','raid-battles','2026-10-09T22:00:00.000','2026-10-09T23:30:00.000','community_reported')] + [
            ev('fixture-collision-filler-'+str(i),'Collision filler '+str(i),'event',
               '2026-10-%02dT10:00:00.000'%(20+i),'2026-10-%02dT12:00:00.000'%(20+i),'community_reported')
            for i in range(9)
        ]
        collision_api = json.dumps({'enabled':True,'events':collision_events,'sources':[]})
        collision_page = page(api=collision_api,extra={'**/world-events.json':(world_fixture,200)})
        collision_page.wait_for_selector('#home-now .agr.reg')
        collision_reg = collision_page.locator('#home-now .agr.reg').filter(has_text='Overseas In-Person Fixture')
        collision_game = collision_page.locator('#home-now .evc').filter(has_text='Overseas In-Person Fixture')
        check('A same-title in-game event cannot suppress the overseas in-person Today card',
              collision_reg.count()==1 and collision_reg.is_visible() and collision_game.count()==1 and collision_game.is_visible(),
              (collision_reg.count(),collision_game.count()))
        collision_counts = collision_page.evaluate("""() => {
          const t=new Date(), live=window.GODASH.events().filter(e=>!e.long&&!window.GODASH.kindHidden(e.kind)&&e.start<=t&&e.end>t);
          const regional=window.GODASH.regionalEvents().filter(e=>e.start<=t&&e.end>t);
          const worldwide=window.GODASH.worldEvents().filter(e=>e.start<=t&&e.end>t);
          return {actual:{inGame:Number(document.getElementById('day-live-count').textContent),inPerson:Number(document.getElementById('day-inperson-count').textContent)},expected:{inGame:live.filter(e=>e.kind!=='person').length+worldwide.length,inPerson:live.filter(e=>e.kind==='person').length+regional.length}};
        }""")
        check('Same-title in-game and overseas in-person activity remain separately counted',
              collision_counts['actual']==collision_counts['expected'] and
              collision_counts['actual']['inGame']>=1 and collision_counts['actual']['inPerson']>=1,
              collision_counts)
        collision_page.context.close()
        # A later-starting overseas event is still part of today's unfolded agenda.
        future_world_fixture = json.dumps({'events':[{'id':'fixture-overseas-future','name':'Overseas Future Fixture','place':'Example City, Exampleland','area':'Asia','scope':'regional','start':'2026-10-09T22:46:00+11:00','end':'2026-10-10T22:46:00+11:00','sources':[{'url':'https://example.invalid/overseas-future-fixture'}]}]})
        future_overseas = page(extra={'**/world-events.json':(future_world_fixture,200)})
        future_overseas.wait_for_selector('#home-now .agr.reg')
        future_card = future_overseas.locator('#home-now .agr.reg').filter(has_text='Overseas Future Fixture')
        future_text = future_card.inner_text() if future_card.count() else ''
        check('Overseas in-person events starting later today remain visible in the unfolded Today agenda',
              future_card.count()==1 and future_card.is_visible() and
              future_card.evaluate("el => el.closest('.today-phase-group')?.querySelector('.today-phase-head span')?.textContent === 'Later today'") and
              'Example City, Exampleland' in future_text, future_text)
        next_name = future_overseas.locator('#today-focus-next').inner_text()
        next_meta = future_overseas.locator('#today-focus-next-meta').inner_text()
        check('Next summary shows overseas destination without inventing a venue-local time',
              'Overseas Future Fixture' in next_name and 'Example City, Exampleland' in next_meta and
              not re.search(r'\b\d{1,2}:\d{2}\b|\b(?:am|pm)\b', next_meta, re.I), (next_name,next_meta))
        check('Future overseas event does not inflate the current in-person activity count',
              future_overseas.locator('#day-inperson-count').inner_text()=='0' and
              '0 in person' in future_overseas.locator('.day-brief-stats').inner_text())
        rotation_text = future_overseas.locator('#today-focus-raids').inner_text()
        max_text = future_overseas.locator('#today-focus-raids-meta').inner_text()
        check('Raids and Max summary uses the published rotation active on the viewed date',
              'Yveltal' in rotation_text and 'Mega Blastoise' in rotation_text and 'Sizzlipede' in max_text,
              (rotation_text,max_text))
        future_overseas.set_viewport_size({'width':320,'height':844})
        strip_320 = future_overseas.locator('#today-focus-strip').bounding_box()
        check('Today focus strip fits the 320px mobile viewport without horizontal overflow',
              strip_320 is not None and strip_320['x'] >= 0 and strip_320['x'] + strip_320['width'] <= 321 and
              future_overseas.evaluate("() => { const el=document.getElementById('today-focus-strip'); const r=el.getBoundingClientRect(); return el.scrollWidth<=el.clientWidth && r.left>=0 && r.right<=window.innerWidth+1; }"))
        future_overseas.set_viewport_size({'width':390,'height':844})
        check('Today focus strip remains visible at 390px', future_overseas.locator('#today-focus-strip').is_visible())
        future_overseas.set_viewport_size({'width':1280,'height':900})
        desktop_cols = future_overseas.locator('#today-focus-strip').evaluate("el => getComputedStyle(el).gridTemplateColumns.split(' ').length")
        check('Today focus strip expands to three columns on desktop', desktop_cols==3, desktop_cols)
        settle(future_overseas, "document.querySelectorAll('#today-focus-raid-actions [data-best-types]').length === 2 && [...document.querySelectorAll('#today-focus-raid-actions [data-best-types]')].every(b => b.getClientRects().length && b.getBoundingClientRect().height >= 44)", 30000)
        raid_prep_buttons = future_overseas.locator('#today-focus-raid-actions [data-best-types]')
        five_button = future_overseas.locator('#today-focus-raid-actions [data-best-types]').filter(has_text='5★ attackers')
        mega_button = future_overseas.locator('#today-focus-raid-actions [data-best-types]').filter(has_text='Mega attackers')
        check('Today raid focus offers curated handoffs for the published five-star and Mega bosses',
              raid_prep_buttons.count() == 2 and 'Yveltal' in five_button.get_attribute('aria-label') and
              'Mega Blastoise' in mega_button.get_attribute('aria-label'), raid_prep_buttons.all_text_contents())
        raid_metrics = future_overseas.locator('#today-focus-raid-actions').evaluate("el => ({visible:!el.hidden, overflow:el.scrollWidth>el.clientWidth, heights:[...el.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height)})")
        check('Today raid handoffs remain visible, non-overflowing and 44px high at desktop',
              raid_metrics['visible'] and not raid_metrics['overflow'] and len(raid_metrics['heights']) == 2 and all(h >= 44 for h in raid_metrics['heights']), raid_metrics)
        for raid_theme in ('light', 'dark'):
            future_overseas.evaluate("(theme) => { if (theme === 'light') document.documentElement.setAttribute('data-theme','light'); else document.documentElement.removeAttribute('data-theme'); }", raid_theme)
            contrast = five_button.evaluate("""b => {
              const rgb = value => (value.match(/[\\d.]+/g) || []).slice(0,3).map(Number);
              const lum = value => { const c=rgb(value).map(x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)}); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
              const s=getComputedStyle(b), a=lum(s.color), z=lum(s.backgroundColor);
              return {height:b.getBoundingClientRect().height, ratio:(Math.max(a,z)+.05)/(Math.min(a,z)+.05)};
            }""")
            check('Today raid handoff button meets target size and AA text contrast in ' + raid_theme + ' theme',
                  contrast['height'] >= 44 and contrast['ratio'] >= 4.5, contrast)
        five_types = five_button.get_attribute('data-best-types').split('|')
        five_button.focus()
        five_button.press('Enter')
        future_overseas.wait_for_selector('#tab-best:not([hidden])')
        future_overseas.wait_for_function("document.querySelectorAll('#typechips button[aria-pressed=true]').length > 0")
        selected_types = future_overseas.locator('#typechips button[aria-pressed="true"]').all_inner_texts()
        check('Keyboard activation opens Best attackers with only the published five-star boss weaknesses selected',
              set(selected_types) == set(five_types), (selected_types, five_types))
        future_overseas.context.close()

        # Type facts may resolve before dash.js is appended; the readiness state must survive that race.
        def wait_for_types_before_dashboard(p):
            p.add_init_script(r"""(() => {
                const append = Node.prototype.appendChild;
                Node.prototype.appendChild = function (node) {
                    if (node && node.tagName === 'SCRIPT' && /\/dash\.js\?/.test(node.src)) {
                        const parent = this;
                        const release = () => {
                            window.__gofnTypesReadyBeforeDash = !!(window.GOTYPES && window.GOTYPES.ready === true);
                            append.call(parent, node);
                        };
                        if (window.GOTYPES && window.GOTYPES.ready === true) release();
                        else document.addEventListener('gotypes', release, { once: true });
                        return node;
                    }
                    return append.call(this, node);
                };
            })();""")
        early_types = page(pre=wait_for_types_before_dashboard)
        early_types_ready = settle(early_types, "window.__gofnTypesReadyBeforeDash === true && document.querySelectorAll('#today-focus-raid-actions [data-best-types]').length === 2", 30000)
        check('Today raid handoffs render when type data resolves before dashboard bootstrap', early_types_ready)
        early_types.context.close()

        # Raid windows can start after midnight; the Today summary must include an active or upcoming window on its start day.
        rotation_window_data = json.loads((ROOT / 'public' / 'data.json').read_text())
        for key in ('events', 'spotlight', 'raidHour', 'maxBattles', 'inPerson', 'worldEvents', 'regionals'):
            rotation_window_data[key] = []
        rotation_window_extra = {
            '**/data.json': (json.dumps(rotation_window_data), 200),
            '**/world-events.json': (json.dumps({'events': []}), 200),
            '**/regional-events.json': (json.dumps({'events': []}), 200)
        }
        rotation_cases = [
            ('2026-11-04T00:30:00+11:00', 'Giratina (Altered Forme)', 'before the published 6 am start'),
            ('2026-11-04T09:35:00+11:00', 'Giratina (Altered Forme)', 'after the published 6 am start'),
            ('2026-11-09T09:35:00+11:00', 'Crowned Sword Zacian and Crowned Shield Zamazenta', 'before the published 10 am start')
        ]
        for rotation_clock, expected_boss, label in rotation_cases:
            rotation_page = page(clock=rotation_clock, extra=rotation_window_extra)
            settle(rotation_page, "document.getElementById('today-focus-raids') && document.getElementById('today-focus-raids').textContent !== 'Checking published rotations…'", 30000)
            rotation_summary = rotation_page.locator('#today-focus-raids').text_content()
            check('Today raid summary includes the rotation ' + label,
                  expected_boss in rotation_summary, rotation_summary)
            rotation_page.context.close()

        # The Tonight planner uses only the published local-day Spotlight, Raid Hour and Max Monday records.
        tonight_data_obj = json.loads((ROOT / 'public' / 'data.json').read_text())
        tonight_data_obj['events'] = []
        tonight_data_obj['spotlight'] = [{'d': '2026-11-05', 'n': 'Teddiursa (witch hat)', 'b': '2x evolution XP'}]
        tonight_data_obj['raidHour'] = [{'d': '2026-11-04', 'n': 'Giratina (Altered Forme)'}]
        tonight_data_obj['maxBattles'] = [['2026-11-02', '2026-11-08', 'Machop']]
        tonight_data_obj['rotation'] = []
        tonight_data_obj['inPerson'] = []
        tonight_data_obj['worldEvents'] = []
        tonight_data_obj['regionals'] = []
        tonight_extra = {
            '**/data.json': (json.dumps(tonight_data_obj), 200),
            '**/world-events.json': (json.dumps({'events': []}), 200),
            '**/regional-events.json': (json.dumps({'events': []}), 200)
        }
        max_monday_page = page(clock='2026-11-02T09:35:00+11:00', marks={'have': {'Mega Rayquaza': 1, 'Mega Mewtwo Y': 1, 'Mega Gardevoir': 1}}, extra=tonight_extra)
        max_monday_page.wait_for_selector('#today-tonight:not([hidden])')
        max_types_ready = settle(max_monday_page, "!!(window.GOTYPES && window.GOTYPES.facts('Machop'))", 30000)
        settle(max_monday_page, "!!(window.GOBEST && window.GOBEST.ready)", 30000)
        settle(max_monday_page, "document.querySelector('#today-tonight-list')?.textContent.includes('Marked top counters (3): Mega Rayquaza, Mega Mewtwo Y, Mega Gardevoir')", 30000)
        settle(max_monday_page, "!!document.querySelector('#today-tonight-list [data-best-types]')", 30000)
        max_monday_page.locator('#today-tonight > summary').click()
        check('Today game plan label covers daytime Max Monday as well as evening activities',
               max_monday_page.locator('#today-tonight-summary').text_content() == "Today's game plan · 1 live",
               max_monday_page.locator('#today-tonight-summary').text_content())
        max_text = max_monday_page.locator('#today-tonight-list').text_content()  # text_content, not inner_text: inner_text applies the heading's text-transform once the list is un-hidden (the details toggle event fires async), which made these reads race
        check('Today Tonight planner surfaces Max Monday with its published local hours',
              'Max Monday' in max_text and 'Machop' in max_text and '6 am–9 pm local' in max_text, max_text)
        check('Tonight planner shows Max boss weaknesses from the type chart',
              max_types_ready and 'Weak to: Flying, Psychic, Fairy' in max_text, max_text)
        check('Tonight planner shows the player’s marked top-ten counters for those weaknesses',
              'Marked top counters (3): Mega Rayquaza, Mega Mewtwo Y, Mega Gardevoir' in max_text, max_text)
        max_best = max_monday_page.locator('#today-tonight-list [data-best-types]')
        check('Max Monday offers a Best attackers handoff for the boss weaknesses',
              max_best.count() == 1 and max_best.get_attribute('data-best-types') == 'Flying|Psychic|Fairy',
              max_best.get_attribute('data-best-types') if max_best.count() else 'missing')
        settle(max_monday_page, "document.querySelectorAll('#typechips button').length > 1", 30000)
        if max_best.count():
            max_best.click()
            max_monday_page.wait_for_selector('#tab-best:not([hidden])')
            max_monday_page.wait_for_function("document.querySelectorAll('#typechips button[aria-pressed=true]').length===3")
        max_selected = max_monday_page.locator('#typechips button[aria-pressed="true"]').all_inner_texts()
        check('Best attackers opens with the Max boss weakness types selected',
              all(name in max_selected for name in ['Flying', 'Psychic', 'Fairy']), max_selected)
        max_owned_row = max_monday_page.locator('#list .irow[data-key="Mega Rayquaza"]:visible')
        max_owned_button = max_owned_row.locator('.tg.o')
        check('Best attackers reflects the seeded local Have mark for Mega Rayquaza',
              max_owned_row.count() == 1 and max_owned_button.get_attribute('aria-pressed') == 'true')
        if max_owned_row.count():
            max_owned_button.click()
            settle(max_monday_page, "document.querySelector('#today-tonight-list')?.textContent.includes('Marked top counters (2): Mega Mewtwo Y, Mega Gardevoir')", 10000)
            check('Tonight owned-counter summary updates when a local Have mark is removed',
                  'Marked top counters (2): Mega Mewtwo Y, Mega Gardevoir' in max_monday_page.locator('#today-tonight-list').text_content())
            max_owned_button.click()
            settle(max_monday_page, "document.querySelector('#today-tonight-list')?.textContent.includes('Marked top counters (3): Mega Rayquaza, Mega Mewtwo Y, Mega Gardevoir')", 10000)
            check('Tonight owned-counter summary updates when a local Have mark is restored',
                  'Marked top counters (3): Mega Rayquaza, Mega Mewtwo Y, Mega Gardevoir' in max_monday_page.locator('#today-tonight-list').text_content())
        max_monday_page.context.close()

        # Live/upcoming states use the published local windows and refresh on the existing minute tick.
        status_data_obj = dict(tonight_data_obj)
        status_data_obj['raidHour'] = [{'d': '2026-11-02', 'n': 'Giratina (Altered Forme)'}]
        status_extra = dict(tonight_extra)
        status_extra['**/data.json'] = (json.dumps(status_data_obj), 200)
        status_page = page(clock='2026-11-02T17:30:00+11:00', extra=status_extra)
        status_page.wait_for_selector('#today-tonight:not([hidden])')
        status_page.locator('#today-tonight > summary').click()
        status_text = status_page.locator('#today-tonight-list').text_content()
        check('Today game plan separates a live Max Monday from an upcoming Raid Hour',
              status_page.locator('#today-tonight-summary').text_content() == "Today's game plan · 1 live · 1 upcoming" and
              'Live now · ends in 3h 30m' in status_text and 'Starts in 30m' in status_text,
              status_text)
        status_page.clock.fast_forward(60 * 60 * 1000)
        settle(status_page, "document.querySelector('#today-tonight-summary')?.textContent === \"Today's game plan · 2 live\"", 10000)
        live_text = status_page.locator('#today-tonight-list').text_content()
        check('Today game plan promotes Raid Hour to live and updates both end countdowns',
              status_page.locator('#today-tonight-summary').text_content() == "Today's game plan · 2 live" and
              'Live now · ends in 2h 30m' in live_text and 'Live now · ends in 30m' in live_text,
              live_text)
        status_page.clock.fast_forward(35 * 60 * 1000)
        settle(status_page, "document.querySelector('#today-tonight-summary')?.textContent === \"Today's game plan · 1 live\"", 10000)
        after_raid_text = status_page.locator('#today-tonight-list').text_content()
        check('Ended Raid Hour leaves the plan while the all-day Max window remains live',
              status_page.locator('#today-tonight-summary').text_content() == "Today's game plan · 1 live" and
              'Raid Hour' not in after_raid_text and 'Live now · ends in 1h 55m' in after_raid_text,
              after_raid_text)
        status_page.clock.fast_forward(115 * 60 * 1000)
        settle(status_page, "document.querySelector('#today-tonight')?.hidden === true", 10000)
        check('Today game plan hides after every published local activity has ended',
              status_page.locator('#today-tonight').is_hidden())
        status_page.context.close()

        # A pending or failed curated feed is not evidence that the player has zero owned counters.
        pending_best_page = page(
            clock='2026-11-02T09:35:00+11:00',
            marks={'have': {'Mega Rayquaza': 1}},
            extra=tonight_extra,
            pre=lambda pg: pg.route('**/best-by-type.json', lambda route: None)
        )
        pending_best_page.wait_for_selector('#today-tonight:not([hidden])')
        settle(pending_best_page, "!!(window.GOTYPES && window.GOTYPES.facts('Machop'))", 30000)
        pending_best_page.locator('#today-tonight > summary').click()
        pending_best_text = pending_best_page.locator('#today-tonight-list').text_content()
        check('Tonight with a pending curated feed withholds the owned-counter summary',
              'Marked top counters' not in pending_best_text and
              'none in current top-ten lists' not in pending_best_text and
              'Weak to: Flying, Psychic, Fairy' in pending_best_text,
              pending_best_text)
        pending_best_page.context.close()

        failed_best_page = page(
            clock='2026-11-02T09:35:00+11:00',
            marks={'have': {'Mega Rayquaza': 1}},
            extra=tonight_extra,
            pre=lambda pg: pg.route('**/best-by-type.json', lambda route: route.fulfill(
                status=503, body='{"error":"unavailable"}', content_type='application/json'))
        )
        failed_best_page.wait_for_selector('#today-tonight:not([hidden])')
        settle(failed_best_page, "!!(window.GOBEST && window.GOBEST.ready === true)", 30000)
        failed_best_page.locator('#today-tonight > summary').click()
        failed_best_text = failed_best_page.locator('#today-tonight-list').text_content()
        check('Tonight with a failed curated feed does not claim zero owned counters',
              'Marked top counters' not in failed_best_text and
              'none in current top-ten lists' not in failed_best_text and
              'Weak to: Flying, Psychic, Fairy' in failed_best_text,
              failed_best_text)
        failed_best_page.context.close()

        raid_hour_page = page(clock='2026-11-04T09:35:00+11:00', extra=tonight_extra)
        raid_hour_page.wait_for_selector('#today-tonight:not([hidden])')
        settle(raid_hour_page, "!!(window.GOBEST && window.GOBEST.ready)", 30000)
        raid_types_ready = settle(raid_hour_page, "!!(window.GOTYPES && window.GOTYPES.facts('Giratina (Altered Forme)'))", 30000)
        settle(raid_hour_page, "!!document.querySelector('#today-tonight-list [data-best-types]')", 30000)
        raid_hour_page.locator('#today-tonight > summary').click()
        raid_text = raid_hour_page.locator('#today-tonight-list').text_content()  # text_content, not inner_text: inner_text applies the heading's text-transform once the list is un-hidden (the details toggle event fires async), which made these reads race
        check('Tonight planner surfaces the published Raid Hour boss and local window',
              'Raid Hour' in raid_text and 'Giratina (Altered Forme)' in raid_text and '6–7 pm local' in raid_text,
              raid_text)
        check('Raid Hour exposes type-chart weaknesses and a Best attackers handoff',
              raid_types_ready and 'Weak to:' in raid_text and raid_hour_page.locator('#today-tonight-list [data-best-types]').count() == 1,
              raid_text)
        check('Tonight planner accurately reports no marked top-ten counters when none are saved',
              'Marked top counters (0): none in current top-ten lists' in raid_hour_page.locator('#today-tonight-list').text_content())
        raid_hour_page.context.close()

        spotlight_page = page(clock='2026-11-05T09:35:00+11:00', extra=tonight_extra)
        spotlight_page.wait_for_selector('#today-tonight:not([hidden])')
        spotlight_page.locator('#today-tonight > summary').click()
        spotlight_text = spotlight_page.locator('#today-tonight-list').text_content()  # text_content, not inner_text: inner_text applies the heading's text-transform once the list is un-hidden (the details toggle event fires async), which made these reads race
        check('Tonight planner surfaces the published Spotlight Hour, bonus and local window',
              'Spotlight Hour' in spotlight_text and 'Teddiursa (witch hat)' in spotlight_text and
              '6–7 pm local' in spotlight_text and '2x evolution XP' in spotlight_text,
              spotlight_text)
        check('Spotlight Hour does not invent raid-counter recommendations',
              spotlight_page.locator('#today-tonight-list [data-best-types]').count() == 0)
        spotlight_page.context.close()

        no_tonight_page = page(clock='2026-11-03T09:35:00+11:00', extra=tonight_extra)
        check('Tonight planner stays hidden when no local activity is published for the viewed day',
              no_tonight_page.locator('#today-tonight').is_hidden())
        no_tonight_page.context.close()


        overseas.evaluate("""() => {
          const pill=document.createElement('span');
          pill.className='mega-pill-red';
          pill.id='theme-mega-pill';
          document.body.appendChild(pill);
        }""")
        overseas.emulate_media(color_scheme='light')
        dark_theme = overseas.evaluate("""() => {
          const pill=getComputedStyle(document.getElementById('theme-mega-pill'));
          return {
            body:getComputedStyle(document.body).color,
            nav:getComputedStyle(document.querySelector('nav.tabs')).backgroundColor,
            megaBg:pill.backgroundColor, megaText:pill.color, megaBorder:pill.borderTopColor
          };
        }""")
        overseas.emulate_media(color_scheme='dark')
        overseas.evaluate("document.documentElement.setAttribute('data-theme','light')")
        light_theme = overseas.evaluate("""() => {
          const pill=getComputedStyle(document.getElementById('theme-mega-pill'));
          return {
            body:getComputedStyle(document.body).color,
            nav:getComputedStyle(document.querySelector('nav.tabs')).backgroundColor,
            megaBg:pill.backgroundColor, megaText:pill.color, megaBorder:pill.borderTopColor
          };
        }""")
        overseas.evaluate("document.documentElement.removeAttribute('data-theme')")
        overseas.emulate_media(color_scheme='light')
        check('Semantic base tokens preserve dark and light body text and navigation surfaces',
              dark_theme['body']=='rgb(243, 245, 249)' and dark_theme['nav']=='rgb(20, 25, 34)' and
              light_theme['body']=='rgb(12, 15, 20)' and light_theme['nav']=='rgb(255, 255, 255)', (dark_theme,light_theme))
        check('Mega status pill follows the selected app theme instead of OS preference',
              dark_theme['megaBg']=='rgb(74, 29, 29)' and dark_theme['megaText']=='rgb(255, 180, 171)' and dark_theme['megaBorder']=='rgb(122, 47, 47)' and
              light_theme['megaBg']=='rgb(253, 232, 232)' and light_theme['megaText']=='rgb(180, 35, 24)' and light_theme['megaBorder']=='rgb(244, 180, 176)', (dark_theme,light_theme))

        overseas.evaluate("""() => {
          for (const id of ['action-centre','foryou-sec','weekly-sec','buy-sec']) {
            const el=document.getElementById(id); if(el) el.hidden=false;
          }
        }""")
        overseas.set_viewport_size({'width':1280,'height':900})
        desktop_today = overseas.evaluate("""() => {
          const layout=document.querySelector('#tab-now .today-layout');
          const main=document.querySelector('#tab-now .today-main').getBoundingClientRect();
          const side=document.querySelector('#tab-now .today-sidebar').getBoundingClientRect();
          const card=document.querySelector('#home-now .agr.reg');
          const sidebar=document.querySelector('#tab-now .today-sidebar');
          return {
            display:getComputedStyle(layout).display,
            columns:getComputedStyle(layout).gridTemplateColumns.split(' ').length,
            mainRight:main.right,sideLeft:side.left,
            cardInMain:!!card && !!card.closest('.today-main'),
            cardVisible:!!card && card.getClientRects().length>0,
            sideIds:[...sidebar.children].map(el=>el.id),
            weekOutside:!document.getElementById('week').closest('.today-layout'),
            documentWidth:document.documentElement.scrollWidth,viewport:innerWidth
          };
        }""")
        check('Desktop Today uses a two-column primary agenda and supporting sidebar',
              desktop_today['display']=='grid' and desktop_today['columns']==2 and
              desktop_today['mainRight']<desktop_today['sideLeft'] and
              desktop_today['sideIds']==['action-centre','foryou-sec','weekly-sec','buy-sec'] and
              desktop_today['weekOutside'] and desktop_today['documentWidth']<=desktop_today['viewport'],
              desktop_today)
        check('Overseas in-person events remain visible in the primary desktop Today agenda',
              desktop_today['cardInMain'] and desktop_today['cardVisible'], desktop_today)
        desktop_nav = overseas.evaluate("""() => {
          const nav=document.querySelector('nav.tabs'), rect=nav.getBoundingClientRect(), content=document.querySelector('.wrap').getBoundingClientRect();
          return {position:getComputedStyle(nav).position,left:rect.left,right:rect.right,width:rect.width,
                  contentLeft:content.left,direction:getComputedStyle(nav.querySelector('.row')).flexDirection,
                  buttons:[...nav.querySelectorAll('button')].map(b=>({visible:b.getClientRects().length>0,height:b.getBoundingClientRect().height})),
                  documentWidth:document.documentElement.scrollWidth,viewport:innerWidth};
        }""")
        check('Desktop primary navigation becomes a vertical rail outside the content column',
              desktop_nav['position']=='fixed' and desktop_nav['direction']=='column' and
              desktop_nav['left']>=0 and desktop_nav['right']<desktop_nav['contentLeft'] and
              len(desktop_nav['buttons'])==4 and all(b['visible'] and b['height']>=56 for b in desktop_nav['buttons']) and
              desktop_nav['documentWidth']<=desktop_nav['viewport'], desktop_nav)
        overseas.set_viewport_size({'width':960,'height':900})
        desktop_min = overseas.evaluate("""() => {
          const layout=document.querySelector('#tab-now .today-layout');
          const main=document.querySelector('#tab-now .today-main').getBoundingClientRect();
          const side=document.querySelector('#tab-now .today-sidebar').getBoundingClientRect();
          return {display:getComputedStyle(layout).display,mainRight:main.right,sideLeft:side.left,
                  documentWidth:document.documentElement.scrollWidth,viewport:innerWidth};
        }""")
        check('Desktop two-column Today activates at 960px without horizontal overflow',
              desktop_min['display']=='grid' and desktop_min['mainRight']<desktop_min['sideLeft'] and
              desktop_min['documentWidth']<=desktop_min['viewport'], desktop_min)
        overseas.set_viewport_size({'width':900,'height':900})
        tablet_today = overseas.evaluate("getComputedStyle(document.querySelector('#tab-now .today-layout')).display")
        check('Below the desktop breakpoint, Today returns to a single-column stack', tablet_today=='flex', tablet_today)
        tablet_nav = overseas.evaluate("""() => {
          const nav=document.querySelector('nav.tabs'), rect=nav.getBoundingClientRect();
          return {position:getComputedStyle(nav).position,bottom:rect.bottom,left:rect.left,right:rect.right,
                  direction:getComputedStyle(nav.querySelector('.row')).flexDirection,viewport:innerWidth,height:innerHeight};
        }""")
        check('Tablet and mobile retain the full-width bottom navigation',
              tablet_nav['position']=='fixed' and tablet_nav['direction']=='row' and
              tablet_nav['bottom']>=tablet_nav['height']-1 and tablet_nav['left']<=0 and
              tablet_nav['right']>=tablet_nav['viewport'], tablet_nav)
        compact_chrome = overseas.evaluate("""() => {
          const nav=document.querySelector('nav.tabs'), rect=nav.getBoundingClientRect();
          return {navHeight:rect.height,buttonHeights:[...nav.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height),
                  headerTop:getComputedStyle(document.querySelector('header.top')).paddingTop,
                  bodyBottom:parseFloat(getComputedStyle(document.body).paddingBottom)};
        }""")
        check('Tablet chrome is shorter while retaining 44px navigation targets and content clearance',
              compact_chrome['navHeight']<=58 and all(h>=44 for h in compact_chrome['buttonHeights']) and
              compact_chrome['headerTop']=='16px' and compact_chrome['bodyBottom']>=compact_chrome['navHeight']+12,
              compact_chrome)
        overseas.set_viewport_size({'width':390,'height':844})
        mobile_chrome = overseas.evaluate("""() => {
          const nav=document.querySelector('nav.tabs'), rect=nav.getBoundingClientRect();
          return {navHeight:rect.height,buttonHeights:[...nav.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height),
                  headerTop:getComputedStyle(document.querySelector('header.top')).paddingTop,
                  bodyBottom:parseFloat(getComputedStyle(document.body).paddingBottom),
                  documentWidth:document.documentElement.scrollWidth,viewport:innerWidth};
        }""")
        check('390px mobile chrome is compact, safe-area-aware and overflow-free',
              mobile_chrome['navHeight']<=58 and all(h>=44 for h in mobile_chrome['buttonHeights']) and
              mobile_chrome['headerTop']=='16px' and mobile_chrome['bodyBottom']>=mobile_chrome['navHeight']+12 and
              mobile_chrome['documentWidth']<=mobile_chrome['viewport'], mobile_chrome)
        mobile_today = overseas.evaluate("""() => {
          const layout=document.querySelector('#tab-now .today-layout');
          const action=document.getElementById('action-centre').getBoundingClientRect();
          const main=document.querySelector('#tab-now .today-main').getBoundingClientRect();
          const foryou=document.getElementById('foryou-sec').getBoundingClientRect();
          const card=document.querySelector('#home-now .agr.reg').getBoundingClientRect();
          return {
            display:getComputedStyle(layout).display,
            sidebarDisplay:getComputedStyle(document.querySelector('#tab-now .today-sidebar')).display,
            actionTop:action.top,mainTop:main.top,foryouTop:foryou.top,
            cardLeft:card.left,cardRight:card.right,
            documentWidth:document.documentElement.scrollWidth,viewport:innerWidth
          };
        }""")
        check('Mobile Today lists Today\'s events before the Action Centre and For you panels',
              mobile_today['display']=='flex' and mobile_today['sidebarDisplay']=='contents' and
              mobile_today['mainTop']<mobile_today['actionTop']<mobile_today['foryouTop'],
              mobile_today)
        check('Overseas in-person events stay within the 390px mobile Today layout',
              mobile_today['cardLeft']>=-1 and mobile_today['cardRight']<=391 and
              mobile_today['documentWidth']<=mobile_today['viewport'], mobile_today)
        overseas.set_viewport_size({'width':320,'height':844})
        narrow_today = overseas.evaluate("""() => {
          const card=document.querySelector('#home-now .agr.reg').getBoundingClientRect();
          return {cardLeft:card.left,cardRight:card.right,documentWidth:document.documentElement.scrollWidth,viewport:innerWidth};
        }""")
        check('Overseas in-person events remain visible without horizontal overflow at 320px',
              overseas.locator('#home-now .agr.reg').is_visible() and narrow_today['cardLeft']>=-1 and
              narrow_today['cardRight']<=321 and narrow_today['documentWidth']<=narrow_today['viewport'],
              narrow_today)
        overseas.context.close()

        # A small but important mobile interaction: hiding an event should have a reliable tap target,
        # an accessible name, and immediately update the Today agenda and its group count.
        touch_event = ev('touch-target', 'Touch Target Test Event', 'pokemon-spotlight-hour',
                         '2026-10-09T23:00:00', '2026-10-09T23:30:00', 'official_confirmed')
        # The dashboard only switches to the live API when it contains at least ten valid events.
        touch_events = [touch_event] + [
            ev('touch-future-' + str(i), 'Touch Target Fixture Future ' + str(i), 'pokemon-spotlight-hour',
               ('2026-10-10' if i < 4 else '2026-10-11') + 'T10:00:00',
               ('2026-10-10' if i < 4 else '2026-10-11') + 'T10:30:00', 'official_confirmed')
            for i in range(9)
        ]
        touch_page = page(api=json.dumps({'enabled': True, 'events': touch_events}), mobile=True)
        touch_card = touch_page.locator('#home-now .evc[data-id="leekduck:touch-target"]')
        touch_card.wait_for(state='attached')
        hide_button = touch_card.locator('.hide-x')
        hide_button.wait_for(state='visible')
        touch_box_ready = settle(touch_page, "() => { const b=document.querySelector('#home-now .evc[data-id=\\\"leekduck:touch-target\\\"] .hide-x'); if(!b || !b.isConnected) return false; const r=b.getBoundingClientRect(); return r.width>=44 && r.height>=44; }", 4000)
        touch_box = touch_page.evaluate("() => { const b=document.querySelector('#home-now .evc[data-id=\\\"leekduck:touch-target\\\"] .hide-x'); if(!b || !b.isConnected) return null; const r=b.getBoundingClientRect(); return {width:r.width,height:r.height}; }")
        check('Today hide control is at least 44×44px',
              touch_box_ready and touch_box is not None and touch_box['width'] >= 44 and touch_box['height'] >= 44, touch_box)
        check('Today hide control has an accessible name',
              hide_button.get_attribute('aria-label') == 'Hide Touch Target Test Event')
        before_group = touch_card.evaluate("el => el.closest('.today-phase-group').querySelector('.today-phase-head span').textContent")
        before_count = int(touch_card.evaluate("el => el.closest('.today-phase-group').querySelector('.today-phase-count').textContent"))
        hide_button.click()
        check('Hiding a Today event removes it immediately',
              touch_page.locator('#home-now .evc[data-id="leekduck:touch-target"]').count() == 0)
        after_group = touch_page.locator('#home-now .today-phase-group').filter(has_text=before_group)
        after_count = int(after_group.locator('.today-phase-count').inner_text()) if after_group.count() else 0
        check('Today phase count updates after hiding an event',
              after_count == before_count - 1, {'before': before_count, 'after': after_count})
        tomorrow_group = touch_page.locator('#week .week-day-group[data-week-day="2026-10-10"]')
        sunday_group = touch_page.locator('#week .week-day-group[data-week-day="2026-10-11"]')
        check('This Week groups events by start date',
              tomorrow_group.count() == 1 and sunday_group.count() == 1 and
              'Touch Target Fixture Future 0' in tomorrow_group.locator('.week-day-events').inner_text() and
              'Touch Target Fixture Future 4' in sunday_group.locator('.week-day-events').inner_text())
        check('This Week labels tomorrow clearly and keeps each day count accurate',
              tomorrow_group.locator('.week-day-label').inner_text() == 'Tomorrow' and
              all(int(g.locator('.week-day-count').inner_text().split()[0]) == g.locator('.week-day-events .evc').count() and
                  g.locator('.week-day-events .evc').count() > 0 for g in [tomorrow_group, sunday_group]))
        week_card = tomorrow_group.locator('.week-day-events .week-card[data-id="leekduck:touch-future-0"]')
        check('This Week uses its dedicated card treatment without changing Today',
              week_card.count() == 1 and touch_page.locator('#home-now .week-card').count() == 0)
        week_actions = [
            week_card.locator('button[data-open]'),
            week_card.locator('button[data-save]'),
            week_card.locator('button[data-hide]')
        ]
        week_boxes = [x.bounding_box() for x in week_actions]
        check('This Week keeps details, save and hide actions thumb-sized',
              all(x.count() == 1 for x in week_actions) and
              all(b is not None and b['width'] >= 44 and b['height'] >= 44 for b in week_boxes),
              week_boxes)
        worldwide_card_time = touch_page.locator('#week .week-day-group[data-week-day="2026-10-10"] .evc[data-id="leekduck:touch-future-0"] .evc-when').inner_text()
        check('Worldwide-local event cards label the displayed clock as local to each region',
              'Your time:' in worldwide_card_time and 'Local time in each region' in worldwide_card_time,
              worldwide_card_time)
        touch_page.context.close()

        # Long Today cards must keep their action labels inside the card at common phone widths.
        overflow_event = ev(
            'mobile-overflow',
            'Community Day Fixture With A Deliberately Long Event Title For Narrow Screens',
            'pokemon-spotlight-hour',
            '2026-10-09T23:00:00', '2026-10-10T00:30:00', 'official_confirmed',
            [{'name': 'Pikachu', 'role': 'featured'}]
        )
        overflow_events = [overflow_event] + [
            ev('overflow-future-' + str(i), 'Overflow Fixture Future ' + str(i),
               'pokemon-spotlight-hour', '2026-10-10T10:00:00', '2026-10-10T10:30:00',
               'official_confirmed')
            for i in range(9)
        ]
        overflow_page = page(
            api=json.dumps({'enabled': True, 'events': overflow_events}),
            extra={'**/world-events.json': ('{"events":[]}', 200),
                   '**/regional-events.json': ('{"events":[]}', 200)}
        )
        overflow_card = overflow_page.locator('#home-now .evc[data-id="leekduck:mobile-overflow"]')
        overflow_card.wait_for(state='attached')
        for width in (390, 320):
            overflow_page.set_viewport_size({'width': width, 'height': 844})
            overflow_page.wait_for_timeout(50)
            metrics = overflow_page.evaluate("""() => {
                const card = document.querySelector('#home-now .evc[data-id="leekduck:mobile-overflow"]');
                const rect = card.getBoundingClientRect();
                const brief = document.querySelector('#day-brief'), briefRect = brief.getBoundingClientRect();
                const main = card.querySelector('.evc-main');
                const foot = card.querySelector('.evc-foot');
                const mainRect = main.getBoundingClientRect();
                const footRect = foot.getBoundingClientRect();
                const buttons = [...foot.querySelectorAll('button')].map(button => {
                    const r = button.getBoundingClientRect();
                    return {
                        label: button.textContent.trim(),
                        left: r.left,
                        right: r.right,
                        width: r.width,
                        height: r.height,
                        clientWidth: button.clientWidth,
                        scrollWidth: button.scrollWidth
                    };
                });
                return {
                    viewport: innerWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    brief: {left: briefRect.left, right: briefRect.right, width: briefRect.width, scrollWidth: brief.scrollWidth},
                    card: {
                        left: rect.left, right: rect.right, width: rect.width,
                        clientWidth: card.clientWidth, scrollWidth: card.scrollWidth,
                        grid: getComputedStyle(card).gridTemplateColumns
                    },
                    main: {
                        left: mainRect.left, right: mainRect.right, width: mainRect.width,
                        clientWidth: main.clientWidth, scrollWidth: main.scrollWidth,
                        minWidth: getComputedStyle(main).minWidth
                    },
                    foot: {
                        left: footRect.left, right: footRect.right, width: footRect.width,
                        clientWidth: foot.clientWidth, scrollWidth: foot.scrollWidth,
                        computedWidth: getComputedStyle(foot).width,
                        maxWidth: getComputedStyle(foot).maxWidth,
                        display: getComputedStyle(foot).display,
                        flexWrap: getComputedStyle(foot).flexWrap,
                        minWidth: getComputedStyle(foot).minWidth,
                        parentClass: foot.parentElement.className,
                        parentContains: main.contains(foot),
                        parentWidth: foot.parentElement.getBoundingClientRect().width,
                        parentGrid: getComputedStyle(foot.parentElement).gridTemplateColumns
                    },
                    children: [...main.children].map(el => {
                        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
                        return {
                            tag: el.tagName, className: el.className, text: (el.textContent || '').trim().slice(0, 100),
                            left: r.left, right: r.right, width: r.width, clientWidth: el.clientWidth,
                            scrollWidth: el.scrollWidth, minWidth: s.minWidth, maxWidth: s.maxWidth,
                            whiteSpace: s.whiteSpace, overflowWrap: s.overflowWrap, display: s.display
                        };
                    }),
                    buttons
                };
            }""")
            check(f'Today overview fits the {width}px viewport',
                  metrics['brief']['left'] >= -1 and metrics['brief']['right'] <= width + 1 and
                  metrics['brief']['scrollWidth'] <= metrics['brief']['width'] + 1, metrics['brief'])
            check(f'Today card stays inside the {width}px viewport',
                  metrics['documentWidth'] <= width and metrics['card']['left'] >= -1 and
                  metrics['card']['right'] <= width + 1, metrics)
            check(f'Today action labels do not overflow their controls at {width}px',
                  all(x['scrollWidth'] <= x['clientWidth'] + 1 and x['right'] <= metrics['card']['right'] + 1
                      for x in metrics['buttons']), metrics['buttons'])
            check(f'Today action targets stay at least 44px tall at {width}px',
                  all(x['width'] >= 44 and x['height'] >= 44 for x in metrics['buttons']),
                  metrics['buttons'])
        overflow_page.context.close()

        # Isolate the empty Today state from live regional schedules: the next-up card should remain actionable.
        next_events = [
            ev('touch-next-' + str(i), 'Next Up Fixture ' + str(i), 'pokemon-spotlight-hour',
               '2026-10-10T10:00:00', '2026-10-10T10:30:00', 'official_confirmed')
            for i in range(10)
        ]
        next_page = page(api=json.dumps({'enabled': True, 'events': next_events}),
                         us={'hide:cur:space': True},
                         extra={'**/world-events.json': ('{"events":[]}', 200),
                                '**/regional-events.json': ('{"events":[]}', 200)})
        next_button = next_page.locator('#home-now .today-next-up')
        next_button.wait_for(state='attached', timeout=5000)
        check('Empty Today offers a tappable next event', next_button.count() == 1 and
              next_button.get_attribute('aria-label') == 'Open details for Next Up Fixture 0')
        today_empty_style = next_page.evaluate("""() => {
          const el=document.querySelector('#home-now .today-empty');
          const s=getComputedStyle(el), cue=getComputedStyle(el.querySelector('.empty'),'::before');
          return {border:s.borderTopStyle,background:s.backgroundColor,cue:cue.content};
        }""")
        check('Empty Today uses a deliberate quiet-state surface and cue',
              today_empty_style['border']=='dashed' and today_empty_style['cue']=='"◇"' and today_empty_style['background']!='rgba(0, 0, 0, 0)',
              today_empty_style)
        next_button.click()
        next_page.locator('#evd').wait_for(state='visible')
        detail_time = next_page.locator('#evd .evd-hero .evc-when').inner_text()
        check('Worldwide-local event details keep local-time context visible',
              'Your time:' in detail_time and 'Local time in each region' in detail_time,
              detail_time)
        jump_links = next_page.locator('#evd .evd-jump a').evaluate_all(
            "els => els.map(a => ({label: a.textContent.trim(), target: !!document.getElementById(a.getAttribute('href').slice(1))}))")
        check('Event detail quick links all have rendered targets', all(x['target'] for x in jump_links), jump_links)
        check('Event detail hides Highlights and Locations when those sections are absent',
              all(x['label'] not in ['Highlights', 'Locations'] for x in jump_links), jump_links)
        # Highlights must land on the first real section even when there are no bonuses.
        highlight_page = page()
        highlight_page.wait_for_function("window.GODETAIL && window.GODASH", timeout=5000)
        highlight_page.evaluate("""() => {
            const events = GODASH.events();
            events.push(GODASH.mkEvent({
                id: 'zorua', name: 'Move Highlight Fixture', kind: 'event',
                s: '2026-10-10T10:00:00', e: '2026-10-10T10:30:00',
                featured: [], bonuses: [], status: 'official_confirmed', source: 'Fixture'
            }));
            events.push(GODASH.mkEvent({
                id: 'featured-highlight', name: 'Featured Highlight Fixture', kind: 'event',
                s: '2026-10-10T11:00:00', e: '2026-10-10T11:30:00',
                featured: [{name: 'Pikachu', role: 'featured'}], bonuses: [],
                status: 'official_confirmed', source: 'Fixture'
            }));
        }""")
        highlight_page.evaluate("GODETAIL.open('zorua')")
        highlight_page.locator('#evd').wait_for(state='visible')
        highlight_page.locator('#evd .evd-jump a[href="#evd-highlights"]').wait_for(state='attached')
        move_target = highlight_page.locator('#evd-highlights')
        check('Move-only Highlights shortcut lands on event-only moves',
              highlight_page.locator('#evd .evd-jump a[href="#evd-highlights"]').count() == 1 and
              move_target.count() == 1 and move_target.evaluate("(el) => el.textContent.trim()") == 'Event-only moves',
              {'target_count': move_target.count(), 'target_text': move_target.inner_text() if move_target.count() else '',
               'event_ids': highlight_page.evaluate("GODASH.events().map(e => e.id).filter(id => id === 'zorua')")})
        highlight_page.locator('#evd-x').click()
        highlight_page.locator('#evd').wait_for(state='hidden')
        highlight_page.evaluate("GODETAIL.open('featured-highlight')")
        highlight_page.locator('#evd').wait_for(state='visible')
        highlight_page.locator('#evd .evd-jump a[href="#evd-highlights"]').wait_for(state='attached')
        featured_target = highlight_page.locator('#evd-highlights')
        check('Featured-only Highlights shortcut lands on the featured Pokémon section',
              highlight_page.locator('#evd .evd-jump a[href="#evd-highlights"]').count() == 1 and
              featured_target.count() == 1 and featured_target.evaluate("(el) => el.textContent.trim()") == 'Featured Pokémon',
              {'target_count': featured_target.count(), 'target_text': featured_target.inner_text() if featured_target.count() else '',
               'featured': highlight_page.evaluate("GODASH.events().filter(e => e.id === 'featured-highlight').map(e => e.featured)")})
        highlight_page.context.close()

        # Opening event details immediately must wait for the places script before deciding whether Locations exists.
        place_fixture = {
            'updated': '2026-10-09',
            'places': [{
                'id': 'test-venue',
                'name': 'Sourced Test Venue',
                'city': 'Melbourne',
                'region': 'Victoria',
                'country': 'Australia',
                'lat': -37.8136,
                'lng': 144.9631,
                'type': 'Event venue',
                'verified': '2026-10-09',
                'sources': [{'label': 'Official event page', 'url': 'https://pokemongo.com/news/test-event', 'trust': 'official'}],
                'events': [{'name': 'Next Up Fixture 0', 'from': '2026-10-10', 'to': '2026-10-10'}]
            }]
        }
        places_page = page(api=json.dumps({'enabled': True, 'events': next_events}),
                           us={'hide:cur:space': True},
                           extra={'**/world-events.json': ('{"events":[]}', 200),
                                  '**/regional-events.json': ('{"events":[]}', 200),
                                  '**/places.json': (json.dumps(place_fixture), 200)},
                           slow_places=True)
        places_page.wait_for_function("window.GODETAIL && window.__gofnPlacesDeferred && !window.GOPLACES", timeout=5000)
        check('Event detail loader is ready while the places script is still delayed',
              places_page.evaluate('!!window.GOPLACES_READY && typeof window.GOPLACES_READY.then === "function"'))
        places_page.locator('#home-now .today-next-up').click()
        places_page.locator('#evd').wait_for(state='visible', timeout=5000)
        location_link = places_page.locator('#evd .evd-jump a[href="#evd-locations"]')
        check('Event details wait for sourced venues before showing Locations',
              location_link.count() == 1 and places_page.locator('#evd-locations').count() == 1)
        places_page.context.close()

        # Keyboard navigation is trapped in the dialog and Escape returns focus to its opener.
        next_page.keyboard.press('Shift+Tab')
        wrapped_last = next_page.evaluate("""() => {
            const d = document.getElementById('evd');
            const items = [...d.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(el => !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length > 0);
            return items.length > 1 && document.activeElement === items[items.length - 1];
        }""")
        check('Event detail Shift+Tab wraps from the first control to the last', wrapped_last)
        next_page.keyboard.press('Tab')
        check('Event detail Tab wraps from the last control to the close button',
              next_page.evaluate("document.activeElement.id === 'evd-x'"))
        # Replace the original opener while the dialog is open; focus must return to its new Today card node.
        next_page.evaluate("""() => { const old=document.querySelector('#home-now .today-next-up'); if(old) old.replaceWith(old.cloneNode(true)); }""")
        next_page.keyboard.press('Escape')
        check('Event detail Escape restores focus to a re-rendered Today next-event card',
              next_page.evaluate("document.getElementById('evd').hidden && document.activeElement.classList.contains('today-next-up')"))
        next_page.context.close()

        # 1. no marks: nothing is claimed missing
        pg=page()
        season_cards = pg.locator('#seasonbar .ssn-card')
        season_cards.first.wait_for(state='visible', timeout=5000)
        check('Today season and GO Pass cards remain visible and do not preload their large posters',
              season_cards.count() == 2 and not pg.season_poster_requests)
        pg.wait_for_function('!!window.GODETAIL', timeout=5000)
        season_cards.first.click()
        pg.locator('#evd').wait_for(state='visible', timeout=5000)
        pg.locator('#evd .evd-banner').wait_for(state='visible', timeout=5000)
        poster_loaded = pg.wait_for_function("() => { const img = document.querySelector('#evd .evd-banner'); return !!img && img.complete && img.naturalWidth > 0; }", timeout=5000)
        season_banner = pg.locator('#evd .evd-banner')
        season_banner_link = pg.locator('#evd .evd-banner-link')
        season_thumb_src = season_banner.get_attribute('src') or ''
        season_original = '/img/ext/season-24-twilight-trails-99c978ed.jpg'
        check('opening a season card loads a compact WebP poster only in event details',
              poster_loaded and '/season-thumbs/season-24-' in season_thumb_src and
              any('/season-thumbs/season-24-' in url for url in pg.season_thumb_requests) and
              not pg.season_poster_requests,
              {'src': season_thumb_src, 'thumbs': pg.season_thumb_requests, 'originals': pg.season_poster_requests})
        check('season detail keeps an accessible link to the full-resolution original',
              season_banner_link.get_attribute('href') == season_original and
              season_banner_link.get_attribute('target') == '_blank' and
              season_banner_link.get_attribute('aria-label') == 'Open full-size poster for Twilight Trails')
        pg.locator('#evd-x').click()

        fallback_page = page(clock='2026-10-09T22:45:00+11:00')
        fallback_page.route('**/season-thumbs/**', lambda route: route.fulfill(status=404, body='missing'))
        fallback_page.locator('#seasonbar .ssn-card').first.wait_for(state='visible', timeout=5000)
        fallback_page.locator('#seasonbar .ssn-card').first.click()
        fallback_page.locator('#evd').wait_for(state='visible', timeout=5000)
        fallback_page.wait_for_function("""() => {
            const img = document.querySelector('#evd .evd-banner');
            return !!img && img.complete && img.naturalWidth > 0 &&
                img.getAttribute('src').includes('season-24-twilight-trails-99c978ed.jpg');
        }""", timeout=5000)
        check('missing season WebP safely falls back to the full-resolution original',
              any('season-24-twilight-trails' in url for url in fallback_page.season_poster_requests) and
              fallback_page.locator('#evd .evd-banner-link').get_attribute('href') == season_original)
        fallback_page.locator('#evd-x').click()
        fallback_page.context.close()
        check('no marks: no "You need" reasons anywhere', pg.locator('text=/You need/').count()==0)
        check('no console/page errors on load', pg.errs==[], pg.errs)
        pg.locator('[data-infographic="cur:trek"].info-available').wait_for(state="attached")
        pg.evaluate("""() => {
            const holder = document.createElement('div');
            holder.id = 'thumbnail-defer-fixture';
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('data-igcard', 'cur:trek');
            holder.appendChild(button);
            document.getElementById('tab-events').appendChild(holder);
        }""")
        hidden_schedule_thumb = pg.locator('#thumbnail-defer-fixture img[data-thumb-src]').first
        hidden_schedule_thumb.wait_for(state='attached', timeout=5000)
        check('hidden Schedule infographic thumbnails point to a deferred static WebP, not the original poster',
              hidden_schedule_thumb.count() == 1 and hidden_schedule_thumb.get_attribute('data-thumb-src') == TREK_THUMB_URL and not hidden_schedule_thumb.get_attribute('src'))
        pg.evaluate("() => document.getElementById('thumbnail-defer-fixture')?.remove()")
        lazy_thumb = pg.locator('[data-infographic="cur:trek"].igthumb img[loading=lazy]').first
        lazy_thumb.scroll_into_view_if_needed(timeout=5000)
        lazy_loaded = pg.wait_for_function("selector => { const img = document.querySelector(selector); return !!img && img.complete && img.naturalWidth > 0; }", arg='[data-infographic="cur:trek"].igthumb img[loading=lazy]', timeout=5000)
        check('lazy infographic thumbnail decodes after entering the viewport', lazy_loaded)
        preview_src = lazy_thumb.get_attribute('src') or ''
        preview_state = {'src':preview_src,'thumbUrl':lazy_thumb.get_attribute('data-thumb-url'),'full':lazy_thumb.get_attribute('data-thumb-full'),'expected':TREK_THUMB_URL,'requests':pg.infographic_requests[-12:]}
        check('card preview fetches the compact WebP rather than the full-resolution original',
              lazy_thumb.get_attribute('data-thumb-url') == TREK_THUMB_URL and preview_src.endswith(TREK_THUMB_URL) and any(TREK_THUMB_URL in url for url in pg.infographic_requests), preview_state)
        check('card with an infographic shows a 44px thumbnail button', pg.locator('[data-infographic="cur:trek"].igthumb img[loading=lazy]').count()==1 and pg.locator('[data-infographic="cur:trek"].igthumb').bounding_box()['width']>=44 and not pg.locator('[data-infographic="cur:trek"]').is_disabled())
        check('card with no infographic shows an always-on Check infographic button (no thumbnail)', pg.locator('[data-igcheck="cur:zorua"]').first.inner_text()=='Check infographic' and not pg.locator('[data-igcheck="cur:zorua"]').first.is_disabled() and pg.locator('[data-igcard="cur:zorua"] img').count()==0)
        check('infographic buttons are accessible', 'Open infographic for' in pg.locator('[data-infographic="cur:trek"]').first.get_attribute('aria-label') and 'infographic' in pg.locator('[data-igcheck="cur:zorua"]').first.get_attribute('aria-label'))
        check('Check infographic button keeps its button role', pg.locator('[data-igcheck="cur:zorua"]').first.get_attribute('role') is None)
        pg.locator('[data-igcheck="cur:zorua"]').first.click(); settle(pg,"document.querySelector('[data-igcheck=\"cur:zorua\"]')?.textContent.trim()==='No infographic found yet'")
        check('Check infographic says so in place when nothing is found', pg.locator('[data-igcheck="cur:zorua"]').first.inner_text()=='No infographic found yet' and not pg.locator('#goinfo:not([hidden])').count())
        # The event infographic viewer should behave like the event-details dialog: trap keyboard focus and return it to the card.
        ig_opener = pg.locator('[data-infographic="cur:trek"]').first
        ig_opener.click()
        pg.locator('#goinfo:not([hidden])').wait_for(state='visible')
        check('event infographic viewer keeps the full-resolution original poster',
              pg.locator('#goinfo .goinfo-poster img').first.get_attribute('src') == TREK_INFOGRAPHIC_URL)
        check('event infographic viewer initially focuses its close control',
              pg.evaluate("document.activeElement === document.querySelector('#goinfo [data-infoclose]')"))
        pg.keyboard.press('Shift+Tab')
        ig_wrapped_last = pg.evaluate("""() => {
            const d = document.getElementById('goinfo');
            const items = [...d.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(el => !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length > 0);
            return items.length > 1 && document.activeElement === items[items.length - 1];
        }""")
        check('event infographic Shift+Tab wraps from the close control to the last link', ig_wrapped_last)
        pg.keyboard.press('Tab')
        check('event infographic Tab wraps from the last link to the close control',
              pg.evaluate("document.activeElement === document.querySelector('#goinfo [data-infoclose]')"))
        pg.keyboard.press('Escape')
        check('event infographic Escape restores focus to its opening card',
              pg.evaluate("""() => {
                  const opener = [...document.querySelectorAll('[data-infographic]')].find(el => el.getAttribute('data-infographic') === 'cur:trek');
                  return document.getElementById('goinfo').hidden && document.activeElement === opener;
              }"""))
        # A missing compact thumbnail falls back to the original; if both fail, Check infographic remains available.
        pf=page(pre=lambda p: p.route('**' + TREK_THUMB_URL, lambda route: route.fulfill(status=404,body='')) if TREK_THUMB_URL else None)
        # Today can re-render while secondary data arrives; wait for and scroll the current connected node
        # inside one browser task rather than retaining a locator across the render boundary.
        thumbnail_scrolled = pf.wait_for_function("""() => {
            const target = document.querySelector('[data-infographic="cur:trek"]');
            if (!target || !target.isConnected) return false;
            target.scrollIntoView({block:'center', inline:'nearest'});
            return true;
        }""", timeout=5000)
        check('missing-thumbnail fixture finds a connected infographic control before scrolling', thumbnail_scrolled)
        fallback_original = settle(pf, "(() => { const img=document.querySelector('[data-infographic=\\\"cur:trek\\\"] img'); return !!img && img.getAttribute('data-thumb-url')===img.getAttribute('data-thumb-full') && img.complete && img.naturalWidth>0; })()", 8000)
        check('missing WebP card thumbnail falls back to the full-resolution original',
              fallback_original and pf.locator('[data-infographic="cur:trek"] img').first.get_attribute('src') == TREK_INFOGRAPHIC_URL)
        pf.context.close()
        check('failed-thumbnail fixture resolves both the current full-size image and its WebP derivative', bool(TREK_INFOGRAPHIC_URL) and bool(TREK_THUMB_URL), (TREK_INFOGRAPHIC_URL, TREK_THUMB_URL))
        def fail_both_infographic_sizes(p):
            if TREK_THUMB_URL: p.route('**' + TREK_THUMB_URL, lambda route: route.fulfill(status=404,body=''))
            if TREK_INFOGRAPHIC_URL: p.route('**' + TREK_INFOGRAPHIC_URL, lambda route: route.fulfill(status=404,body=''))
        pb=page(pre=fail_both_infographic_sizes)
        # The page may rebuild Today while secondary data arrives; scroll the current connected node in one DOM task
        # instead of holding a Playwright element handle that can be detached between locator resolution and scrolling.
        thumbnail_scrolled = pb.evaluate("""() => {
            const target = document.querySelector('[data-infographic="cur:trek"]');
            if (!target || !target.isConnected) return false;
            target.scrollIntoView({block:'center', inline:'nearest'});
            return true;
        }""")
        check('failed-thumbnail fixture finds a connected infographic control before scrolling', thumbnail_scrolled)
        fallback_ready = settle(pb, """(() => {
            const b=[...document.querySelectorAll('[data-igcheck]')].find(el => el.getAttribute('data-igcheck')==='cur:trek');
            const card=[...document.querySelectorAll('[data-igcard]')].find(el => el.getAttribute('data-igcard')==='cur:trek');
            return !!b && b.textContent.trim()==='Check infographic' && !!card && card.hasAttribute('data-igbad') && !card.querySelector('img');
        })()""", 15000)
        fallback_state = pb.evaluate("""() => {
            const b=[...document.querySelectorAll('[data-igcheck]')].find(el => el.getAttribute('data-igcheck')==='cur:trek');
            const card=[...document.querySelectorAll('[data-igcard]')].find(el => el.getAttribute('data-igcard')==='cur:trek');
            return {hasCheck:!!b,text:b&&b.textContent.trim(),hasCard:!!card,hasBad:!!(card&&card.hasAttribute('data-igbad')),hasImage:!!(card&&card.querySelector('img'))};
        }""")
        fallback_state['requests'] = pb.infographic_requests[-12:]
        requested_both_sizes = any(url.endswith(TREK_THUMB_URL) for url in fallback_state['requests']) and any(url.endswith(TREK_INFOGRAPHIC_URL) for url in fallback_state['requests'])
        check('a thumbnail that fails to load becomes Check infographic', fallback_ready and fallback_state['hasCheck'] and fallback_state['text']=='Check infographic' and fallback_state['hasCard'] and fallback_state['hasBad'] and not fallback_state['hasImage'] and requested_both_sizes, fallback_state)
        pb.context.close()
        # Regional event infographics must resolve through the same viewer as standard event cards.
        mexico_id='w-pok-mon-go-dia-de-muertos-2026-mexico-exclusive-ev'
        pg.wait_for_function("id=>window.GODASH && window.GOINFOGRAPHIC && window.GODASH.regionalEvents().some(e=>e.id===id)",arg=mexico_id)
        pg.evaluate("id=>window.GOINFOGRAPHIC.open(id)",mexico_id)
        pg.locator('#goinfo .goinfo-poster img[src*="discord-1564171478423834735.jpg"]').wait_for(state='attached')
        check('Mexico regional event opens its approved G47IX infographic in the shared viewer', pg.locator('#goinfo .goinfo-poster img[src*="discord-1564171478423834735.jpg"]').count()==1)
        check('regional infographic preserves creator attribution', pg.locator('#goinfo .goinfo-poster-top').first.inner_text().find('G47IX')>=0)
        pg.evaluate("window.GOINFOGRAPHIC.close(true)")
        check('no event grades are shown', pg.locator('.event-grade, .grade-summary, #grade-settings').count()==0)
        check('no follow stars next to Pokémon names on event cards', pg.locator('.evc .fbtn, .evc [data-follow]').count()==0)
        trek_highlights = [x.lower() for x in pg.locator('[data-id="cur:trek"] .signal-highlight-debut, [data-id="cur:trek"] .signal-highlight-boosted-shiny').evaluate_all("els=>els.map(e=>e.title)")]
        check('Buddy Trek pills name the debut and each boosted-shiny target (full text in the title, short on the card)', 'debut · bramblin' in trek_highlights and 'boosted shiny · electrike' in trek_highlights and any('hisuian growlithe' in x and 'incense' in x for x in trek_highlights), trek_highlights)
        cp_checks = pg.evaluate("({mega:window.GODASH.cpSpecies('Mega Blastoise').name, megaX:window.GODASH.cpSpecies('Mega Charizard X').name, regional:window.GODASH.cpSpecies('Hisuian Growlithe').name, labels:window.GODASH.hundoLabels({kind:'raid'}, {name:'Mega Blastoise'})})")
        check('hundo CP lookup strips Mega prefixes and Mega X/Y suffixes', cp_checks['mega']=='Blastoise' and cp_checks['megaX']=='Charizard' and '100%' in cp_checks['labels'] and 'Boosted' in cp_checks['labels'], cp_checks)
        check('regional form hundo CP lookup resolves Hisuian Growlithe', cp_checks['regional']=='Growlithe (Hisuian)', cp_checks['regional'])
        # Bonus labels use specific icons, including the most common catch/raid bonuses.
        chips=pg.evaluate("['3x Catch Candy','Candy XL','2x Stardust','3x Catch XP','Mega Energy','Remote Raid damage increased','Half hatch distance','Additional Raid Passes'].map(x=>window.GO.bonusChip(x))")
        checks=['bonus-candy','bonus-candy','bonus-dust','bonus-xp','bonus-mega','bonus-damage','bonus-distance','bonus-pass']
        check('bonus icons: catch candy, XL candy, Stardust, XP, Mega Energy, raid damage, hatch distance and passes are classified correctly', all(checks[i] in chips[i] for i in range(len(chips))), [x[:160] for x in chips])
        # 1b. Event signals must distinguish new shiny claims from generic availability and retain time context.
        sig=pg.evaluate("window.GODASH.signalTags({name:'Zorua Community Day',kind:'cd',tags:['Shiny'],bonuses:['3x Catch XP'],featured:[{name:'Zorua',canBeShiny:true,costume:true}]})")
        check('event signals: generic shiny is labelled available, never new by inference', 'Shiny available' in sig and 'New shiny' not in sig and 'Shiny' not in sig, sig)
        kinds=pg.evaluate("['Zorua Community Day','Dynamax Uxie, Mesprit and Azelf','Stufful Spotlight Hour'].map(n=>{const e=window.GODASH.events().find(e=>e.name===n);return e&&e.kind})")
        check('curated event kind is inferred from title when tags are absent', kinds[0]=='cd' and kinds[1]=='max' and kinds[2]=='spot', kinds)
        sig_new=pg.evaluate("window.GODASH.signalTags({name:'A new shiny Pokémon debuts',kind:'event',bonuses:[],featured:[]})")
        check('event signals: explicit new shiny and debut are surfaced', 'New shiny' in sig_new and 'Debut' in sig_new, sig_new)
        sig_boost=pg.evaluate("window.GODASH.signalTags({name:'Sandile Hatch Day',kind:'event',notes:['Higher chance of Shiny Sandile. Exclusive Charged Attack available.'],bonuses:[],featured:[]})")
        check('event signals: boosted shiny odds and exclusive moves are distinct labels', 'Boosted shiny odds' in sig_boost and 'Exclusive move' in sig_boost and 'New shiny' not in sig_boost, sig_boost)
        times=pg.evaluate("window.GODASH.timeMeta({start:new Date('2026-10-10T00:00:00Z'),end:new Date('2026-10-10T01:00:00Z'),utc:true,region:'Global',long:false})")
        check('UTC events show device time and UTC reference', 'Your time:' in times and 'UTC:' in times, times)
        worldwide=pg.evaluate("(window.GODASH.events().find(e=>/Zorua Community Day/i.test(e.name))||{}).scope")
        check('worldwide local-time events are explicitly marked local to each region', worldwide=='worldwide_local', worldwide)
        wtime=pg.evaluate("window.GODASH.timeMeta(window.GODASH.events().find(e=>/Zorua Community Day/i.test(e.name)))")
        check('worldwide local-time events say the displayed time is local in each region', 'Your time:' in wtime and 'Local time in each region' in wtime, wtime)
        merge_checks=pg.evaluate("""(() => {
          const base={kind:'event',start:new Date('2026-10-10T10:00:00Z'),end:new Date('2026-10-10T12:00:00Z'),featured:[{name:'Zorua'}],bonuses:[],notes:[],tags:[]};
          const live=Object.assign({},base,{name:'Zorua Community Day',featured:[{name:'Zorua'}]});
          const curated=Object.assign({},base,{name:'Zorua Community Day',featured:[{name:'Zorua',costume:true},{name:'Pikachu'}],bonuses:['3x Catch XP'],notes:['Curated detail'],tags:['Community Day']});
          const merged=window.GODASH.mergeLiveAndCurated([live],[curated]);
          const collision=window.GODASH.mergeLiveAndCurated([Object.assign({},base,{name:'Zorua Raid Day'})],[Object.assign({},curated,{name:'Zorua Community Day'})]);
          const far=window.GODASH.mergeLiveAndCurated([Object.assign({},base,{name:'Zorua Community Day'})],[Object.assign({},curated,{name:'Zorua Community Day',start:new Date('2026-10-18T10:00:00Z')})]);
          return {mergedCount:merged.length,featured:merged[0].featured.length,costume:merged[0].featured[0].costume,bonus:merged[0].bonuses.includes('3x Catch XP'),collisionCount:collision.length,farCount:far.length};
        })()""")
        check('curated details merge only into an exact-title event at a matching time', merge_checks['mergedCount']==1 and merge_checks['featured']==2 and merge_checks['costume'] and merge_checks['bonus'], merge_checks)
        check('same Pokémon name does not merge unrelated event titles', merge_checks['collisionCount']==2, merge_checks)
        check('same recurring title on a different date remains a separate event', merge_checks['farCount']==2, merge_checks)
        floating=pg.evaluate("window.GODASH.timeMeta({start:new Date('2026-10-10T14:00:00'),end:new Date('2026-10-10T17:00:00'),sourceStart:'2026-10-10T14:00',utc:false,region:'Tokyo',long:false})")
        check('regional floating times disclose missing source timezone', 'Listed clock:' in floating and 'timezone not supplied' in floating, floating)
        shadow=pg.evaluate("window.GODASH.featArts({kind:'raid',tags:['Shadow'],featured:[{name:'Thundurus',role:'raid_boss'}]},1)")
        check('Shadow raid sprite requests Shadow art', 'shadow=1' in shadow and 'alt="Shadow Thundurus"' in shadow, shadow)
        maxart=pg.evaluate("window.GODASH.featArts({kind:'max',tags:['Max Battles'],featured:[{name:'Sizzlipede',role:'featured'}]},1)")
        check('Max encounter sprite requests special Dynamax art', 'dynamax=1' in maxart and 'alt="Dynamax Sizzlipede"' in maxart, maxart)
        gmaxart=pg.evaluate("window.GODASH.featArts({kind:'max',name:'Gigantamax Raid Day',featured:[{name:'Charizard',role:'raid_boss'}]},1)")
        check('Gigantamax event requests the actual Gigantamax sprite, not ordinary Charizard art', 'n=Gigantamax%20Charizard' in gmaxart and 'dynamax=1' in gmaxart, gmaxart)
        pg.click('nav.tabs button[data-tab="collect"]'); pg.wait_for_timeout(200); pg.evaluate("document.getElementById('sub-opps').hidden=false; document.dispatchEvent(new CustomEvent('gofn-view',{detail:{tab:'collect',sub:'opps'}}))")
        check('unknown ownership explained', pg.locator('#opps .notice').count()==1)
        check('no "Need" chips without marks', pg.locator('.opp.missing').count()==0)
        # 2. marks present: Zorua missing -> need + priority boost; Pikachu owned
        marks={'have':{},'hundo':{},'m':{'own':{'25':1,'9':1}}}
        # marks alone (no confirmed generation) must NOT make Zorua a Need
        pg=page(marks=marks)
        prio_txt=pg.inner_text('#prio')
        pg.click('nav.tabs button[data-tab="collect"]'); pg.wait_for_timeout(200); pg.evaluate("document.getElementById('sub-opps').hidden=false; document.dispatchEvent(new CustomEvent('gofn-view',{detail:{tab:'collect',sub:'opps'}}))")
        check('marks without a confirmed generation: Zorua is not a Need anywhere', 'You need' not in prio_txt and pg.locator('.opp.missing').count()==0 and pg.locator('#opps .opp').count()>=1)
        pg=page(marks=marks,gens=[5])
        txt=pg.inner_text('#prio')
        check('priority shows Zorua CD (you need Zorua)', 'ZORUA' in txt.upper() and 'You need Zorua' in txt, txt[:300])
        first=pg.inner_text('#prio .pc.first')
        check('the event with a needed Pokémon outranks the long-running one', 'ZORUA' in first.upper(), first[:120])
        pg.click('nav.tabs button[data-tab="collect"]'); pg.wait_for_timeout(200); pg.evaluate("document.getElementById('sub-opps').hidden=false; document.dispatchEvent(new CustomEvent('gofn-view',{detail:{tab:'collect',sub:'opps'}}))")
        check('opportunities: Zorua listed under You still need', 'Zorua'.upper() in pg.inner_text('#opps').upper() and pg.locator('.opp.missing').count()>=1)
        check('unmarked costume/forms are never claimed as have/need', pg.locator('.opp.unknown').count()>=1 and 'not tracked' in pg.inner_text('#opps').lower())
        # 3. follow + save persist; the header badge counts actual cards, never empty placeholders or wrappers.
        check('empty Watchlist does not count its empty-state rows',
              pg.locator('#wlcount').is_hidden() and pg.locator('#hwatch').get_attribute('aria-label')=='Watchlist',
              {'badge_hidden':pg.locator('#wlcount').is_hidden(),'aria_label':pg.locator('#hwatch').get_attribute('aria-label')})
        pg.click('nav.tabs button[data-tab="collect"]'); pg.wait_for_timeout(200); pg.evaluate("document.getElementById('sub-opps').hidden=false; document.dispatchEvent(new CustomEvent('gofn-view',{detail:{tab:'collect',sub:'opps'}}))")
        pg.locator('#opps .fbtn').first.click(); pg.wait_for_timeout(100)
        pg.click('nav.tabs button[data-tab="events"]'); pg.click('#subnav-events button[data-sub="timeline"]'); pg.wait_for_timeout(200)
        pg.locator('#evtimeline .star').first.click(); pg.wait_for_timeout(100)
        pg.wait_for_function("() => { const b=document.getElementById('wlcount'); return b && !b.hidden && b.textContent==='2'; }")
        check('Watchlist badge counts one followed Pokémon plus one saved event',
              pg.locator('#wlcount').inner_text()=='2' and pg.locator('#hwatch').get_attribute('aria-label')=='Watchlist, 2 items')
        badge_style = pg.evaluate("""() => {
          const b=document.getElementById('wlcount'), s=getComputedStyle(b);
          return {height:s.height,border:s.borderTopWidth,font:s.fontFamily,background:s.backgroundColor};
        }""")
        check('Watchlist badge uses a compact accent pill with a clear outline',
              badge_style['height']=='22px' and badge_style['border']=='2px' and 'DM Mono' in badge_style['font'] and badge_style['background']!='rgba(0, 0, 0, 0)',
              badge_style)
        pg.set_viewport_size({'width':320,'height':844})
        header_bounds = pg.evaluate("""() => {
          const h=document.getElementById('hwatch').getBoundingClientRect();
          const b=document.getElementById('wlcount').getBoundingClientRect();
          return {button:[h.left,h.right],badge:[b.left,b.right]};
        }""")
        check('Watchlist button and badge stay within a 320px viewport',
              header_bounds['button'][0]>=0 and header_bounds['button'][1]<=320 and header_bounds['badge'][0]>=0 and header_bounds['badge'][1]<=320,
              header_bounds)
        pg.set_viewport_size({'width':390,'height':844})
        ls=pg.evaluate("localStorage.getItem('gofn-us-v1')") or '{}'
        check('follow and save written to local state', 'follow:' in ls and 'saved:' in ls, ls)
        pg.reload(); pg.wait_for_selector('.pc, .prio-empty',state='attached'); pg.click('#hwatch'); pg.wait_for_timeout(300)
        check('saved + followed survive reload and badge counts both entries',
              pg.locator('#savedev .evc').count()>=1 and pg.locator('#followed .opp').count()>=1 and
              pg.locator('#wlcount').inner_text()=='2' and pg.locator('#hwatch').get_attribute('aria-label')=='Watchlist, 2 items')
        pg.screenshot(path=OUT+'saved.png')
        pg.locator('#followed .opp .fbtn').first.click()
        pg.wait_for_function("() => { const b=document.getElementById('wlcount'); return b && !b.hidden && b.textContent==='1'; }")
        check('unfollowing a Pokémon decrements the Watchlist badge',pg.locator('#wlcount').inner_text()=='1')
        pg.locator('#savedev .evc [data-save]').first.click()
        pg.wait_for_function("() => { const b=document.getElementById('wlcount'); return b && b.hidden; }")
        check('removing the last saved event hides the Watchlist badge',pg.locator('#wlcount').is_hidden())
        quiet_states = pg.evaluate("""() => {
          const f=document.querySelector('#followed > .empty'), s=document.querySelector('#savedev > .empty');
          const a=getComputedStyle(f), b=getComputedStyle(s);
          return {follow:{border:a.borderTopStyle,display:a.display,cue:getComputedStyle(f,'::before').content},
                  saved:{border:b.borderTopStyle,display:b.display,cue:getComputedStyle(s,'::before').content}};
        }""")
        check('empty Watchlist panels share the quiet-state card treatment',
              quiet_states['follow']['border']=='dashed' and quiet_states['saved']['border']=='dashed' and
              quiet_states['follow']['display']=='flex' and quiet_states['saved']['display']=='flex' and
              quiet_states['follow']['cue']=='"◇"' and quiet_states['saved']['cue']=='"◇"',
              quiet_states)
        # 4. week strip day filter + timeline filter
        pg.click('nav.tabs button[data-tab="events"]'); pg.click('#subnav-events button[data-sub="timeline"]'); pg.wait_for_timeout(200)
        pg.click('.wd[data-day="2026-10-10"]'); pg.wait_for_timeout(150)
        check('tapping a day filters the timeline to that day', 'SAT 10 OCT' in pg.inner_text('#evtimeline').upper() and pg.locator('#evtimeline .evc').count()>=1)
        pg.click('[data-clearday]'); pg.click('.fchip[data-type="cd"]'); pg.wait_for_timeout(150)
        check('type filter keeps only Community Days', all('COMMUNITY DAY' in t.upper() for t in pg.locator('#evtimeline .evc .kind').all_inner_texts()) and pg.locator('#evtimeline .evc').count()>=1)
        # 4b. "Next 24h" chip: lists only what is live or starts within a day; venue bonus times fill into cards
        VT=json.dumps({'items':[{'name':'Pokémon Night Out 2026 - Los Angeles','date':'2026-10-10','day':'Sat, 10 Oct','show':'1:30 pm','end':'','note':'expected, Pokémon GO hours not confirmed yet','ms':1791599400000,'endMs':0,'link':'https://leekduck.com/events/n/'}]})
        pg=page(extra={'**/api/venue-times*':(VT,200)}); pg.click('nav.tabs button[data-tab="events"]'); pg.click('#subnav-events button[data-sub="timeline"]'); pg.click('.fchip[data-type="soon"]'); pg.wait_for_timeout(200)
        check('Next 24h chip shows a list or says nothing starts', pg.locator('#evtimeline .evc').count()>=1 or 'Nothing starts in the next 24 hours' in pg.inner_text('#evtimeline'))
        check('Next 24h chip has no page errors', pg.errs==[], pg.errs)
        tl=pg.inner_text('#evtimeline').lower()
        check('Night Out is listed in Next 24h by its bonus time', 'night out 2026 - los angeles' in tl and 'bonuses start sat, 10 oct, 1:30 pm your time' in tl, tl[:300])
        pg.click('nav.tabs button[data-tab="now"]') if pg.locator('nav.tabs button[data-tab="now"]').count() else None
        pg.wait_for_timeout(200)
        check('Today screen has the one-line next-24h summary', pg.locator('.soon-sum').count()==1 and 'starting in the next 24h' in pg.inner_text('.soon-sum'), pg.locator('.soon-sum').count())
        check('longer-range Today sections start collapsed and show event counts', pg.locator('#agenda-next-fold').count()==1 and pg.locator('#agenda-later-fold').count()==1 and pg.locator('#agenda-next-fold').evaluate('(el)=>!el.open') and pg.locator('#agenda-later-fold').evaluate('(el)=>!el.open') and __import__('re').fullmatch(r'\d+ events?', pg.inner_text('#agenda-next-count')) is not None and __import__('re').fullmatch(r'\d+ events?', pg.inner_text('#agenda-later-count')) is not None)
        pg.locator('#agenda-next-fold > summary').click()
        check('Next week agenda opens from its summary', pg.locator('#agenda-next-fold').evaluate('(el)=>el.open'))
        pg.locator('#agenda-next-fold > summary').click()
        check('Next week agenda collapses again from its summary', pg.locator('#agenda-next-fold').evaluate('(el)=>!el.open'))
        # An event starting later today belongs in Today, not twice in This week.
        agenda=page(clock='2026-10-15T17:00:00+11:00')
        same_day='[data-id="cur:spot-2026-10-15"]'
        check('same-day upcoming event appears in Today', agenda.locator('#home-now .evc'+same_day).count()==1, agenda.evaluate("({now:new Date().toString(),matches:GODASH.events().filter(e=>e.id==='cur:spot-2026-10-15').map(e=>({id:e.id,start:e.start.toString(),end:e.end.toString(),long:e.long,kind:e.kind,hidden:GOSTATE.get('hidekind:'+e.kind)})),today:[...document.querySelectorAll('#home-now [data-id]')].map(e=>e.dataset.id)})"))
        check('same-day upcoming event is not duplicated in This week', agenda.locator('#week '+same_day).count()==0)
        agenda.context.close()
        # Hiding a card should also update the Today summary and shortcut count.
        hidden=page(clock='2026-10-15T17:00:00+11:00')
        hidden_id='cur:spot-2026-10-15'
        before_today=int(hidden.locator('#day-upcoming-count').inner_text())
        action_count=hidden.locator('#action-centre-items [data-quick-go="events"] .action-count')
        before_action=int(action_count.inner_text()) if action_count.count() else 0
        check('Today event is visible before using Hide', hidden.locator('#home-now .evc[data-id="'+hidden_id+'"]').count()==1)
        hidden.locator('#home-now .evc[data-id="'+hidden_id+'"] [data-hide]').click()
        hidden.wait_for_timeout(100)
        check('Hide removes an event from Today immediately', hidden.locator('#home-now .evc[data-id="'+hidden_id+'"]').count()==0)
        after_today=int(hidden.locator('#day-upcoming-count').inner_text())
        check('Today overview excludes hidden events', after_today==before_today-1, (before_today,after_today))
        after_action_count=hidden.locator('#action-centre-items [data-quick-go="events"] .action-count')
        after_action=int(after_action_count.inner_text()) if after_action_count.count() else 0
        check('Today action-centre count excludes hidden events', before_action>0 and after_action==before_action-1, (before_action,after_action))
        hidden.context.close()
        # Hide also removes a future event from its expanded next-week list.
        future=page(clock='2026-10-15T17:00:00+11:00')
        future_id='cur:spot-2026-10-22'
        future_card='#spot .evc[data-id="'+future_id+'"]'
        before_next=int(__import__('re').match(r'\d+',future.locator('#agenda-next-count').inner_text()).group())
        check('next-week event is visible before using Hide', future.locator(future_card).count()==1)
        future.locator('#agenda-next-fold > summary').click()
        future.locator(future_card+' [data-hide]').click()
        future.wait_for_timeout(100)
        check('Hide removes the event from next week immediately', future.locator(future_card).count()==0)
        after_next=int(__import__('re').match(r'\d+',future.locator('#agenda-next-count').inner_text()).group())
        check('next-week event count excludes hidden events', after_next==before_next-1, (before_next,after_next))
        future.context.close()
        # The Today action-centre count must match the Next 24h list it opens.
        quick=page()
        quick_btn=quick.locator('#action-centre-items [data-quick-go="events"]')
        check('Today action centre offers the live/starting-soon shortcut', quick_btn.count()==1)
        if quick_btn.count():
            quick_count=int(quick_btn.locator('.action-count').inner_text())
            quick_btn.click()
            quick.wait_for_selector('#evtimeline')
            quick.wait_for_timeout(200)
            shown_count=quick.locator('#evtimeline .evc[data-id]').count()
            check('Today action-centre count matches its Next 24h destination', quick_count==shown_count, (quick_count,shown_count))
            check('Today event shortcut selects the Next 24h filter', quick.locator('#evtypes [data-type="soon"][aria-pressed="true"]').count()==1)
        quick.context.close()
        # The daily overview should stay aligned with event phases as the clock advances.
        refresh=page(clock='2026-10-15T17:00:00+11:00')
        target_id='cur:spot-2026-10-15'
        target=refresh.evaluate("id => { const e=window.GODASH.events().find(x=>x.id===id); return e ? {start:e.start.getTime(),end:e.end.getTime()} : null; }",target_id)
        target_start=target['start'] if target else 0
        target_end=target['end'] if target else 0
        def summary_state():
            actual={'inGame':int(refresh.locator('#day-live-count').inner_text()),'inPerson':int(refresh.locator('#day-inperson-count').inner_text()),'upcoming':int(refresh.locator('#day-upcoming-count').inner_text())}
            expected=refresh.evaluate("""() => {
              const t=new Date(), endDay=new Date(t); endDay.setHours(0,0,0,0); endDay.setDate(endDay.getDate()+1);
              const events=window.GODASH.events(), visible=e=>!e.long&&!window.GODASH.kindHidden(e.kind);
              const live=events.filter(e=>visible(e)&&e.start<=t&&e.end>t);
              const regional=window.GODASH.regionalEvents().filter(e=>e.start<=t&&e.end>t);
              const worldwide=window.GODASH.worldEvents().filter(e=>e.start<=t&&e.end>t);
              const today=events.filter(e=>visible(e)&&((e.start<=t&&e.end>t)||(e.start>t&&e.start<endDay)));
              return {inGame:live.filter(e=>e.kind!=='person').length+worldwide.length,inPerson:live.filter(e=>e.kind==='person').length+regional.length,upcoming:today.filter(e=>e.start>t).length};
            }""")
            return actual,expected
        brief_before,expected_before=summary_state()
        check('Today overview matches live/upcoming event phases before Spotlight Hour', brief_before==expected_before, (brief_before,expected_before))
        refresh.click('nav.tabs button[data-tab="events"]'); refresh.click('#subnav-events button[data-sub="timeline"]'); refresh.click('.fchip[data-type="soon"]'); refresh.wait_for_timeout(200)
        before_dest=refresh.locator('#evtimeline .evc[data-id]').count()
        target_visible=refresh.locator('#evtimeline .evc[data-id="'+target_id+'"]').count()==1
        now_ms=refresh.evaluate('Date.now()')
        check('Spotlight Hour fixture is in Next 24h before its end', target_visible and target_start>now_ms and target_end>now_ms, (target_visible,target_start,target_end,before_dest,now_ms))
        if target_visible and target_start>now_ms and target_end>now_ms:
            refresh.click('nav.tabs button[data-tab="now"]'); refresh.wait_for_timeout(150)
            before_btn=refresh.locator('#action-centre-items [data-quick-go="events"]')
            before_action=int(before_btn.locator('.action-count').inner_text()) if before_btn.count() else 0
            check('Today action-centre count initially matches Next 24h', before_action==before_dest, (before_action,before_dest))
            today_card_before=refresh.locator('#home-now .evc[data-id="'+target_id+'"]')
            check('Today agenda shows the event as upcoming before it starts', today_card_before.count()==1 and 'soon' in today_card_before.get_attribute('class'), today_card_before.get_attribute('class') if today_card_before.count() else 'missing')
            later_group=refresh.locator('#home-now .today-phase-group').filter(has_text='Later today')
            check('Today agenda groups upcoming events under Later today', later_group.count()==1)
            check('Later today count matches its visible event cards', later_group.count()==1 and later_group.locator('.evc[data-id]').count()==int(later_group.locator('.today-phase-count').inner_text()) if later_group.count() else False)
            today_save=refresh.locator('#home-now .evc[data-id="'+target_id+'"] [data-save]')
            if today_save.count():
                today_save.click()
                check('Today event save state updates immediately', refresh.locator('#home-now .evc[data-id="'+target_id+'"] [data-save][aria-pressed="true"]').count()==1)
                refresh.locator('#home-now .evc[data-id="'+target_id+'"] [data-save][aria-pressed="true"]').click()
                check('Today event can be unsaved without reloading', refresh.locator('#home-now .evc[data-id="'+target_id+'"] [data-save][aria-pressed="false"]').count()==1)
            else:
                check('Today event card exposes its save control', False)
            # Advance past the event start; the minute tick must refresh the brief without rebuilding the agenda.
            refresh.clock.fast_forward(target_start-refresh.evaluate('Date.now()')+61000)
            refresh.clock.run_for(61000); refresh.wait_for_timeout(150)
            brief_during,expected_during=summary_state()
            phase_during=refresh.evaluate("id => { const e=window.GODASH.events().find(x=>x.id===id),t=Date.now(); return e ? {live:e.start.getTime()<=t&&e.end.getTime()>t,ended:e.end.getTime()<=t} : null; }",target_id)
            check('Today overview refreshes when an event starts', phase_during and phase_during['live'] and brief_during==expected_during and expected_during!=expected_before, (phase_during,brief_during,expected_during,expected_before))
            today_card_live=refresh.locator('#home-now .evc[data-id="'+target_id+'"]')
            check('Today agenda updates the card to live when the event starts', today_card_live.count()==1 and 'live' in today_card_live.get_attribute('class'), today_card_live.get_attribute('class') if today_card_live.count() else 'missing')
            # Advance past the event end and verify both the overview and shortcut count settle.
            refresh.clock.fast_forward(target_end-refresh.evaluate('Date.now()')+61000)
            refresh.clock.run_for(61000); refresh.wait_for_timeout(150)
            brief_after,expected_after=summary_state()
            phase_after=refresh.evaluate("id => { const e=window.GODASH.events().find(x=>x.id===id); return e ? e.end.getTime()<=Date.now() : false; }",target_id)
            check('Today overview refreshes when an event ends', phase_after and brief_after==expected_after and expected_after!=expected_during, (phase_after,brief_after,expected_after,expected_during))
            check('Today agenda removes the ended event without a page reload', refresh.locator('#home-now .evc[data-id="'+target_id+'"]').count()==0)
            after_btn=refresh.locator('#action-centre-items [data-quick-go="events"]')
            after_action=int(after_btn.locator('.action-count').inner_text()) if after_btn.count() else 0
            refresh.click('nav.tabs button[data-tab="events"]'); refresh.click('#subnav-events button[data-sub="timeline"]'); refresh.click('.fchip[data-type="soon"]'); refresh.wait_for_timeout(200)
            after_dest=refresh.locator('#evtimeline .evc[data-id]').count()
            check('Today action-centre count refreshes when an event ends', after_action==after_dest and after_action<before_action, (before_action,after_action,after_dest))
        refresh.context.close()
        pg.evaluate("""()=>{var p=document.createElement('p');p.className='evc-bonus';p.hidden=true;p.setAttribute('data-bn','Pokémon Night Out events in Pokémon GO');p.setAttribute('data-bs','2026-10-10');p.setAttribute('data-be','2026-10-10');p.id='bonus-probe';document.body.appendChild(p);}""")
        pg.wait_for_function("document.getElementById('bonus-probe') && !document.getElementById('bonus-probe').hidden", timeout=5000)
        bt=pg.inner_text('#bonus-probe')
        check('card bonus line says when bonuses start in your time', 'Bonuses start' in bt and 'Sat, 10 Oct, 1:30 pm your time' in bt, bt)
        # 5. countdown moves with time
        pg=page(); before=pg.locator('#prio .cdn').first.inner_text()
        pg.clock.fast_forward(3*3600*1000); pg.clock.run_for(61000); pg.wait_for_timeout(200)
        after=pg.locator('#prio .cdn').first.inner_text()
        check('countdown text updates as time passes', before!=after, (before,after))
        # 6. pipeline API path: datamined + conflicting never urgent; announced shows; banner on preview
        evs=[ev('f%d'%i,'Filler %d'%i,'event','2026-11-%02dT10:00:00.000'%(i+1),'2026-11-%02dT12:00:00.000'%(i+1),'community_reported') for i in range(12)]
        evs+= [ev('rumour','Rumoured Gigantamax Day','max-battles','2026-10-10T09:00:00.000','2026-10-10T12:00:00.000','datamined',[{'name':'Zorua','role':'title'}]),
               ev('dispute','Disputed Raid Hour','raid-hour','2026-10-10T18:00:00.000','2026-10-10T19:00:00.000','conflicting',[{'name':'Zorua','role':'raid_boss'}]),
               ev('real','Dialga Raid Hour','raid-hour','2026-10-10T20:00:00.000','2026-10-10T21:00:00.000','official_confirmed',[{'name':'Dialga','role':'raid_boss','dex':483}])]
        pg=page(api=json.dumps({'enabled':True,'events':evs,'sources':[]}),marks=marks,sources='{"environment":"preview","database":true,"enabled":true,"sources":[]}')
        pr=pg.inner_text('#prio')
        check('API data used (Dialga Raid Hour present)', 'DIALGA RAID HOUR' in pr.upper(), pr[:200])
        check('datamined and conflicting events are never in Priority Now', 'Rumoured' not in pr and 'Disputed' not in pr)
        check('datamined and conflicting events remain available in source data but stay out of Priority Now', 'Rumoured' not in pr and 'Disputed' not in pr and pg.evaluate("['Rumoured Gigantamax Day','Disputed Raid Hour'].every(n=>GODASH.events().some(e=>e.name===n))"))
        check('preview banner visible', pg.locator('#envbar:not([hidden])').count()==1 and 'STAGING DATABASE' in pg.inner_text('#envbar'))
        pg.click('nav.tabs button[data-tab="events"]'); pg.click('#subnav-events button[data-sub="timeline"]'); pg.wait_for_timeout(200)
        check('timeline still lists the unconfirmed items, labelled', 'datamined' in pg.inner_text('#evtimeline').lower() and 'conflicting' in pg.inner_text('#evtimeline').lower() and 'RUMOURED GIGANTAMAX DAY' in pg.inner_text('#evtimeline').upper())
        pg.screenshot(path=OUT+'api_timeline.png')
        pg.set_viewport_size({'width':1280,'height':900})
        pg.click('#subnav-events button[data-sub="calendar"]'); pg.wait_for_timeout(300)
        check('Events opens as a calendar with region filters and Day/Week/Month', pg.locator('#calreg [data-creg]').count()==6 and pg.locator('#calreg [data-cscope]').count()==3)
        calendar_wide = pg.evaluate("""() => {
          const heads=[...document.querySelectorAll('#calgrid .ch')];
          return {names:heads.map(h=>h.querySelector('.ch-long').textContent),
                  longVisible:heads.every(h=>getComputedStyle(h.querySelector('.ch-long')).display!=='none'),
                  shortHidden:heads.every(h=>getComputedStyle(h.querySelector('.ch-short')).display==='none'),
                  documentWidth:document.documentElement.scrollWidth,viewport:innerWidth};
        }""")
        check('Desktop calendar spells out Monday through Sunday',
              calendar_wide['names']==['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] and
              calendar_wide['longVisible'] and calendar_wide['shortHidden'] and
              calendar_wide['documentWidth']<=calendar_wide['viewport'], calendar_wide)
        pg.set_viewport_size({'width':390,'height':844})
        calendar_mobile = pg.evaluate("""() => {
          const heads=[...document.querySelectorAll('#calgrid .ch')];
          return {shortVisible:heads.every(h=>getComputedStyle(h.querySelector('.ch-short')).display!=='none'),
                  longHidden:heads.every(h=>getComputedStyle(h.querySelector('.ch-long')).display==='none'),
                  names:heads.map(h=>h.querySelector('.ch-short').textContent)};
        }""")
        check('Mobile calendar keeps compact Mon–Sun labels',
              calendar_mobile['shortVisible'] and calendar_mobile['longHidden'] and
              calendar_mobile['names']==['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], calendar_mobile)
        pg.click('#calreg [data-creg="Asia"]'); pg.wait_for_timeout(200)
        check('region filter shows only regional rows', pg.locator('#calday .agr').count()==pg.locator('#calday .agr.reg').count())
        # 7. old sections still work and are reachable
        pg=page()
        for tab,sub,mode,sel in [('collect','dex','species','#tab-dex'),('collect','dex','forms','#sub-forms'),('collect','dex','import','#sub-import'),('collect','guides','best','#tab-best'),('collect','guides','hundo','#tab-hundo')]:
            pg.click(f'nav.tabs button[data-tab="{tab}"]'); pg.click(f'#subnav-{tab} button[data-sub="{sub}"]')
            if mode: pg.click(f'#mode-{tab}-{sub} button[data-mode="{mode}"]')
            pg.wait_for_timeout(200)
            check(f'{tab}/{sub}/{mode} reachable and visible', pg.locator(sel).is_visible())
        check('Schedule shows Calendar, Timeline, In person, Travel and Research; Discoveries lives in the menu', pg.evaluate("(()=>{const buttons=Array.from(document.querySelectorAll('#subnav-events button'));return buttons.length===5 && buttons.some(b=>b.dataset.sub==='world' && b.textContent==='In person') && buttons.some(b=>b.dataset.sub==='travel' && b.textContent==='Travel') && buttons.some(b=>b.dataset.sub==='research' && b.textContent==='Research') && !buttons.some(b=>b.dataset.sub==='leaks') && !!document.getElementById('menu-leaks');})()"))
        pg.click('#hmenu'); pg.click('#menu-leaks'); pg.wait_for_timeout(200)
        check('Leaks opens from the menu', pg.locator('#sub-leaks').is_visible())
        pg.click('nav.tabs button[data-tab="events"]'); pg.click('#subnav-events button[data-sub="timeline"]'); pg.click('#hmenu'); pg.click('#menu-leaks'); pg.wait_for_timeout(200)
        check('Leaks says not announced and holds no announced list', 'Not announced' in pg.inner_text('#sub-leaks') and pg.locator('#sub-leaks #up-announced').count()==0)
        pg.evaluate("document.querySelectorAll('#up-dd details').forEach(d=>d.open=true)"); pg.wait_for_timeout(200)
        lk=pg.evaluate("""(()=>{const all=[...document.querySelectorAll('#up-dd .ut')];const L=all.filter(e=>e.classList.contains('lk')),N=all.filter(e=>!e.classList.contains('lk'));
          const st=e=>{const c=getComputedStyle(e);return c.borderTopStyle};
          return {lk:L.length,plain:N.length,lkDashed:L.every(e=>st(e)==='dashed'),plainSolid:N.every(e=>st(e)!=='dashed'),lkLabel:L.every(e=>/(datamined|not announced), not confirmed/i.test(e.textContent)),plainNoLabel:N.every(e=>!/not confirmed/i.test(e.textContent))}})()""")
        check('Leaks: datamined and not-announced tiles are amber dashed and labelled not confirmed', lk['lk']>0 and lk['lkDashed'] and lk['lkLabel'], lk)
        check('Leaks: announced and released tiles stay solid with no not-confirmed label', lk['plainSolid'] and lk['plainNoLabel'], lk)
        check('Leaks: legend explains amber hatched versus solid', 'amber hatched' in pg.inner_text('#sub-leaks').lower())
        check('dex list rendered', pg.evaluate("document.querySelectorAll('#dexlist > *').length")>10)
        pg.click('nav.tabs button[data-tab="raids"]'); pg.wait_for_timeout(200)
        check('raids: counters gone; rotation, Max and PvP kept', pg.locator('#ctr').count()==0 and pg.locator('#cboss').count()==0 and pg.locator('#thisweek').count()==0 and pg.locator('#pvpdd').count()==1 and pg.locator('#rotnow .rw-max').count()>=1)
        cur_next=pg.evaluate("[...document.querySelectorAll('#rotnow .rotc:not(.max) .rc b')].map(b=>b.textContent.trim())")
        later=pg.evaluate("[...document.querySelectorAll('#rottable tbody tr td:nth-child(2), #rottable tbody tr td:nth-child(3)')].map(t=>t.textContent.trim())")
        check('raids: this week and next shown once, full rotation lists only later weeks', len(cur_next)>=5 and len(cur_next)==len(set(cur_next)) and not (set(cur_next)&set(later)), (cur_next,later))
        check('raids: boss cards show types and weaknesses, no counter picks', pg.locator('#rotnow .rweak').count()>=1 and 'ounter' not in pg.inner_text('#tab-raids'))
        check('raids: historical rotations are not labelled Earlier this week', 'Earlier this week' not in pg.inner_text('#rotnow'), pg.inner_text('#rotnow')[:1200])
        pg.click('#rotnow [data-rotweek="following"]'); pg.wait_for_timeout(100)
        paired=pg.locator('#rotnow .rc-form b').all_text_contents()
        check('raids: Mega Charizard X and Y each have a separate image and label', 'MEGA CHARIZARD X' in [x.strip().upper() for x in paired] and 'MEGA CHARIZARD Y' in [x.strip().upper() for x in paired] and pg.locator('#rotnow .rc-form > img.art[alt*="Charizard"]').count()==2, paired)
        following_text=pg.inner_text('#rotnow')
        following_lower=following_text.lower()
        check('raids: future week does not repeat the globally current Yveltal rotation', 'current raid rotation' not in following_lower and 'at start of week' in following_lower and 'dialga' in following_lower and 'palkia' in following_lower and 'yveltal' not in following_lower, following_text[:1800])
        check('raids: rotation week buttons have mobile-friendly touch height', pg.evaluate("[...document.querySelectorAll('#rotnow .rw-tabs button')].every(b=>b.getBoundingClientRect().height>=44)"))
        pg.click('#rotnow [data-rotweek="future"]'); pg.wait_for_timeout(100)
        early_shadow = pg.locator('#rotnow .rc[data-boss="Shadow Landorus (Incarnate)"] [data-raid-share][data-raid-start=""]').first
        check('share card omits an unstructured early Shadow end instead of extending it to the rotation boundary',
              early_shadow.count() >= 1 and early_shadow.get_attribute('data-raid-end') == '')
        low_share = pg.locator('#rotnow .rw-low .rc[data-boss] [data-raid-share]').first
        check('observed low-tier raid bosses do not inherit an unverified full-rotation window',
              low_share.count() >= 1 and low_share.get_attribute('data-raid-start') == '' and low_share.get_attribute('data-raid-end') == '')
        # Leek Duck publishes the next regular rotation at 6 am local; keep it visible during the overnight gap.
        for width in (320, 390, 1280):
            rotation_time_page = page(clock='2026-11-16T05:30:00+11:00', width=width, height=900, mobile=width < 600)
            rotation_time_page.click('nav.tabs button[data-tab="raids"]'); rotation_time_page.wait_for_timeout(250)
            ready = settle(rotation_time_page, "document.querySelector('#rotnow')?.textContent.includes('Next raid rotation')", 10000)
            rotation_text = rotation_time_page.locator('#rotnow').text_content()
            cresselia_url = 'https://leekduck.com/events/cresselia-darkrai-in-5-star-raid-battles-november-2026/'
            cresselia_source = rotation_time_page.locator('#rotnow .rw-source[href="' + cresselia_url + '"]')
            check('raid rotation shows the next 6 am local window before it starts',
                  ready and 'Next raid rotation · Mon 16 Nov, 6 am' in rotation_text and
                  'Cresselia and Darkrai' in rotation_text and cresselia_source.count() == 1,
                  rotation_text[:1200])
            source_box = cresselia_source.bounding_box() if cresselia_source.count() else None
            check('raid source link has a 44px target and no horizontal overflow',
                  source_box is not None and source_box['height'] >= 43.5 and
                  rotation_time_page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
                  source_box)
            rotation_time_page.evaluate("document.documentElement.setAttribute('data-theme','light')")
            check('Leek Duck source remains visible in light theme', cresselia_source.count() == 1 and cresselia_source.is_visible())
            rotation_time_page.evaluate("document.documentElement.removeAttribute('data-theme')")
            if cresselia_source.count(): cresselia_source.focus()
            check('Leek Duck source link is keyboard focusable',
                  rotation_time_page.evaluate("document.activeElement?.getAttribute('href') === '" + cresselia_url + "'"))
            rotation_time_page.locator('#rotnow [data-rotweek="next"]').click()
            future_rotation_text = rotation_time_page.locator('#rotnow').text_content()
            deoxys_url = 'https://leekduck.com/events/deoxys-normal-defense-attack-speed-formes-in-5-star-raid-battles-november-2026/'
            deoxys_source = rotation_time_page.locator('#rotnow .rw-source[href="' + deoxys_url + '"]')
            check('future rotation uses the source-derived 6 am time rather than a hard-coded 10 am',
                  'From Wed 25 Nov, 6 am' in future_rotation_text and 'Deoxys' in future_rotation_text and
                  deoxys_source.count() == 1, future_rotation_text[:1200])
            rotation_time_page.context.close()
        pg.click('#rotnow [data-rotweek="this"]'); pg.wait_for_timeout(100)
        raid_share_selector = '#rotnow .rc[data-boss] [data-raid-share]'
        raid_share_count = pg.locator(raid_share_selector).count()
        raid_share_button = pg.locator(raid_share_selector).first
        raid_share_boss = raid_share_button.get_attribute('data-raid-boss') if raid_share_count else ''
        raid_share_kind = raid_share_button.get_attribute('data-raid-kind') if raid_share_count else ''
        check('raid rotation cards expose a share action with exact published boss and window metadata',
              raid_share_count >= 1 and bool(raid_share_boss) and bool(raid_share_kind) and
              bool(raid_share_button.get_attribute('data-raid-start')) and bool(raid_share_button.get_attribute('data-raid-end')))
        if raid_share_count:
            raid_share_button.click()
            pg.wait_for_selector('#raid-share-dialog[open]')
            share_card_text = pg.locator('#raid-share-card').text_content()
            check('raid share card displays the selected boss, category and local rotation boundary',
                  raid_share_boss in share_card_text and raid_share_kind in share_card_text and
                  'local' in share_card_text.lower() and bool(pg.locator('#raid-share-window').text_content()))
            check('raid share card uses the existing raid artwork when available',
                  pg.locator('#raid-share-art img.art').count() == 1)
            check('raid share card renders weakness chips only from the type chart',
                  pg.locator('#raid-share-weakness-section').is_visible() and pg.locator('#raid-share-weakness .raid-share-type').count() >= 1)
            check('raid share close, share and copy actions meet the 44px touch target',
                  pg.evaluate("[...document.querySelectorAll('#raid-share-dialog button')].every(b=>b.getBoundingClientRect().height>=44)"))
            pg.evaluate("""() => {
              Object.defineProperty(navigator,'share',{configurable:true,writable:true,value:async payload=>{window.__raidShared=payload}});
              Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__raidCopied=value}}});
            }""")
            pg.click('#raid-share-send')
            pg.wait_for_function('!!window.__raidShared')
            check('native raid share payload includes the boss and local schedule',
                  raid_share_boss in pg.evaluate('window.__raidShared.text') and 'Rotation:' in pg.evaluate('window.__raidShared.text'))
            pg.click('#raid-share-copy')
            pg.wait_for_function('!!window.__raidCopied')
            check('raid share copy action includes the selected boss and app link',
                  raid_share_boss in pg.evaluate('window.__raidCopied') and 'GO Field Notes:' in pg.evaluate('window.__raidCopied'))
            pg.evaluate("() => { Object.defineProperty(navigator,'share',{configurable:true,writable:true,value:undefined}); window.__raidCopied = ''; }")
            pg.click('#raid-share-send')
            pg.wait_for_function('!!window.__raidCopied')
            check('unsupported native sharing falls back to copying the same raid details',
                  raid_share_boss in pg.evaluate('window.__raidCopied') and 'Rotation:' in pg.evaluate('window.__raidCopied'))
            pg.click('[data-raid-share-close]')
            pg.wait_for_function("!document.querySelector('#raid-share-dialog').open")
            check('closing the raid share card restores focus to its opening raid row',
                  pg.evaluate("document.activeElement && document.activeElement.hasAttribute('data-raid-share')"))
            raid_share_button.click()
            pg.wait_for_selector('#raid-share-dialog[open]')
            pg.set_viewport_size({'width':320,'height':844})
            check('raid share dialog fits a 320px viewport without horizontal overflow',
                  pg.evaluate("() => { const d=document.querySelector('#raid-share-dialog').getBoundingClientRect(); return d.left>=0 && d.right<=innerWidth && d.width<=innerWidth; }"))
            pg.keyboard.press('Escape')
            pg.wait_for_function("!document.querySelector('#raid-share-dialog').open")
            check('Escape closes the raid share card and restores focus to its opener',
                  pg.evaluate("document.activeElement && document.activeElement.hasAttribute('data-raid-share')"))
            pg.set_viewport_size({'width':1280,'height':900})
        pg.click('nav.tabs button[data-tab="now"]'); pg.wait_for_timeout(200)
        check('now tab: checklist gone; shiny list and calendar subscribe kept', pg.locator('#daily').count()==0 and pg.locator('#dailyList').count()==0 and pg.locator('#shdd').count()==1 and pg.locator('#tab-now #calcard').count()==0 and pg.locator('#sub-menu #calcard').count()==1 and pg.input_value('#calurl').endswith('/api/calendar.ics') and pg.get_attribute('#calsub','href').startswith('webcal:'))
        labels=pg.locator('nav.tabs button').all_inner_texts()
        check('four primary destinations are visible in the expected order; Saved stays in the header', labels==['Today','Schedule','Battle','Collection'] and pg.locator('nav.tabs button:visible').count()==4 and pg.locator('#hwatch').is_visible() and pg.locator('#hmenu').is_visible(), labels)
        pg.click('#hwatch'); pg.click('nav.tabs button[data-tab="events"]'); pg.click('#subnav-events button[data-sub="timeline"]'); pg.click('#hwatch'); pg.wait_for_timeout(150)
        check('Saved header utility opens Watchlist sub-view', pg.locator('#tab-saved').is_visible() and pg.locator('#hwatch').get_attribute('aria-pressed')=='true' and pg.locator('#sub-watch').is_visible() and pg.locator('#subnav-saved button[data-sub="watch"]').get_attribute('aria-pressed')=='true')
        pg.click('#subnav-saved button[data-sub="menu"]'); pg.wait_for_timeout(150)
        check('Saved sub-navigation selects Menu', pg.locator('#sub-menu').is_visible() and pg.locator('#subnav-saved button[data-sub="menu"]').get_attribute('aria-pressed')=='true')
        pg.set_viewport_size({'width':320,'height':844})
        narrow_chrome = pg.evaluate("""() => {
          const nav=document.querySelector('nav.tabs'), rect=nav.getBoundingClientRect();
          return {navHeight:rect.height,buttonHeights:[...nav.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height),
                  headerTop:getComputedStyle(document.querySelector('header.top')).paddingTop,
                  bodyBottom:parseFloat(getComputedStyle(document.body).paddingBottom)};
        }""")
        check('320px mobile chrome retains 44px targets with no content overlap',
              narrow_chrome['navHeight']<=58 and all(h>=44 for h in narrow_chrome['buttonHeights']) and
              narrow_chrome['headerTop']=='16px' and narrow_chrome['bodyBottom']>=narrow_chrome['navHeight']+12,
              narrow_chrome)
        check('all four primary destinations remain visible on narrow mobile', pg.locator('nav.tabs button:visible').count()==4 and pg.evaluate("![...document.querySelectorAll('nav.tabs button')].some(b=>{const r=b.getBoundingClientRect();return r.left<0||r.right>innerWidth})") and not pg.evaluate('document.documentElement.scrollWidth>innerWidth'))
        pg.set_viewport_size({'width':390,'height':844})
        pg.click('#hmenu'); pg.wait_for_timeout(200)
        check('Menu holds alerts, sync, calendar and sources', pg.locator('#sub-menu #alertsdd').count()==1 and pg.locator('#sub-menu #usstat').count()==1 and pg.locator('#sub-menu #calcard').count()==1 and pg.locator('#sub-menu a[href="/sources.html"]').count()==1)
        check('sync and account controls are centralised in Menu', pg.locator('#sub-menu #acct').count()==1 and pg.locator('#tab-best #acct').count()==0 and pg.locator('#tab-best #pinform').count()==0 and pg.locator('#pindd .pinform').count()==1)
        pg.locator('#pindd').evaluate('(d)=>d.open=true')
        pg.fill('#pinnew','test-sync-pin')
        with pg.expect_navigation(wait_until='load'):
            pg.locator('#pindd .pinform button').click()
        check('Menu PIN form saves the device PIN', pg.evaluate("localStorage.getItem('gofn-pin')==='test-sync-pin'") and pg.locator('#pinstate').inner_text()=='saved on this device')
        pg.locator('#pindd').evaluate('(d)=>d.open=true')
        with pg.expect_navigation(wait_until='load'):
            pg.click('#pinrm')
        check('Remove PIN clears the saved device PIN', pg.evaluate("localStorage.getItem('gofn-pin')===null") and pg.locator('#pinstate').inner_text()=='not set')
        pg.click('nav.tabs button[data-tab="collect"]'); pg.wait_for_timeout(200)
        check('Dex sync status links to the central settings', pg.locator('#dsync button').inner_text()=='Sync & account settings')
        pg.locator('#dsync button').click(); pg.wait_for_timeout(200)
        check('Dex sync link opens Menu and the PIN settings', pg.locator('#sub-menu').is_visible() and pg.locator('#pindd').evaluate('(d)=>d.open'))
        queue_fixture=json.dumps({'items':[{'id':'discord:owner-ui-fixture','title':'Owner-only review fixture','image':'/infographics/owner-ui-fixture.png','source':'discord','publishedAt':'2026-11-01T00:00:00Z','guesses':[]}]})
        decisions_fixture=json.dumps({'decisions':[]})
        review_extra={'**/infographic-queue.json*':(queue_fixture,200),'**/api/ig-decisions':(decisions_fixture,200)}
        guest_review=page(extra=review_extra)
        guest_review.wait_for_timeout(500)
        check('guest does not see owner moderation UI', guest_review.locator('html').get_attribute('data-role')=='guest' and guest_review.locator('#hireview').is_hidden() and guest_review.locator('#igreview').count()==0 and guest_review.locator('#igbanner').count()==0)
        guest_review.context.close()
        invalid_review=page(pin=True,extra={**review_extra,'**/api/auth/users':(json.dumps({'error':'Wrong PIN'}),401)})
        invalid_review.wait_for_timeout(500)
        check('invalid PIN does not expose owner moderation or account controls', invalid_review.locator('html').get_attribute('data-role')=='guest' and invalid_review.locator('#hireview').is_hidden() and invalid_review.locator('#igreview').count()==0 and invalid_review.locator('#acct [data-acct-form="create"]').count()==0 and 'could not be verified' in invalid_review.inner_text('#acct').lower())
        invalid_review.context.close()
        owner_review=page(pin=True,extra={**review_extra,'**/api/auth/users':(json.dumps({'users':[]}),200)})
        owner_review.wait_for_function("document.documentElement.getAttribute('data-role')==='owner' && !document.getElementById('hireview').hidden",timeout=10000)
        check('verified owner sees moderation and account controls', owner_review.locator('#igreview:not([hidden])').count()==1 and owner_review.locator('#igdiscord-btn').count()==1 and owner_review.locator('#acct [data-acct-form="create"]').count()==1)
        owner_review.context.close()
        pg.click('nav.tabs button[data-tab="now"]'); pg.wait_for_timeout(200)
        check('old checklist state is cleared', pg.evaluate("localStorage.getItem('gofn-daily')")==None)
        pg.evaluate("localStorage.setItem('gofn-tab','dex')"); pg.reload(); pg.wait_for_selector('#tab-dex'); pg.wait_for_timeout(300)
        check('legacy gofn-tab=dex opens Collect > Dex', pg.locator('#tab-dex').is_visible())

        # ---- event detail: passes, prices, labelled gaps ----
        pg=page(); pg.click('nav.tabs button[data-tab="events"]'); pg.click('#subnav-events button[data-sub="timeline"]'); pg.wait_for_selector('#evtimeline .evc[data-id$="zorua"] .more'); pg.click('#evtimeline .evc[data-id$="zorua"] .more'); pg.wait_for_selector('#evd .tk'); pg.wait_for_timeout(300)
        t=pg.inner_text('#evd')
        check('detail: what is in this event shows published and not-published labels', 'Not published' in t and 'Published' in t and 'Raids' in t and 'Sucker Punch' in t)
        check('detail: passes and tickets list the Zorua ticket, Ultra Box, free GO Pass and Deluxe', pg.locator('#evd .tk').count()==4 and 'special research ticket' in t.lower() and 'go pass deluxe' in t.lower() and 'free' in t.lower())
        check('detail: deadlines and unpublished items are labelled', 'Not published yet' in t and '5 Nov, 10 am local' in t and 'not listed yet' in t)
        check('detail: a US-priced ticket shows its Australian tier price (marked approximate), never US dollars or an exchange-rate estimate', '≈ A$2.99' in t and 'Save A$' not in t and 'reference only' not in t and 'US$' not in t and 'equivalent pricing' not in t)
        pg.screenshot(path=OUT+'detail.png', full_page=False)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check('detail closes on Escape', pg.locator('#evd').is_hidden())
        # with an Indonesian price added to the data file the card converts it, without any code change
        # the prices are asked for once per load and shared, so the Indonesian price is served from the start
        pg2=page(pin=True,extra={'**/api/prices-private':(json.dumps({"fx":{"from":"IDR","to":"AUD","rate":0.0001,"source":"test","url":"https://x.test","observed":"2026-10-10"},"prices":[{"product":"zorua-cd-research","currency":"IDR","amount":50000,"region":"ID","source":"test store","url":"https://x.test","observed":"2026-10-10"}]}),200),'**/prices.json':(json.dumps({"prices":[{"product":"zorua-cd-research","currency":"AUD","amount":8,"region":"AU","verified":True,"source":"test au","url":"https://x.test","observed":"2026-10-10"}]}),200)})
        pg2.click('nav.tabs button[data-tab="events"]'); pg2.click('#subnav-events button[data-sub="timeline"]'); pg2.wait_for_selector('#evtimeline .evc[data-id$="zorua"] .more'); pg2.click('#evtimeline .evc[data-id$="zorua"] .more'); pg2.wait_for_selector('#evd .tk'); pg2.wait_for_timeout(300)
        t2=pg2.inner_text('#evd')
        check('detail: Rp price converts to A$, shows Originally A$ in Australia and a verified saving, and never the Rp amount', '≈ A$5.00' in t2 and 'Originally A$8.00 in Australia' in t2 and 'Save A$3.00 (38%)' in t2 and 'Rp 50' not in t2 and '50,000' not in t2, t2[:0])

        # ---- collection integrity: unknown is never Need ----
        pg=page(); pg.click('nav.tabs button[data-tab="collect"]'); pg.click('#subnav-collect button[data-sub="dex"]'); pg.wait_for_selector('#gencov .gc',state='attached'); pg.evaluate("document.querySelector('#gencov details').open=true"); pg.wait_for_timeout(300)
        pg.evaluate("localStorage.setItem('gofn-dex', JSON.stringify({m:{own:{25:1}}}))")
        base=pg.evaluate("[...document.querySelectorAll('#dexlist .drow')].slice(0,5).map(r=>(r.querySelector('.own')||{textContent:''}).textContent)")
        check('dex: with nothing confirmed no Pokémon shows Need', 'Need' not in base and all(b in ('Have','') for b in base), base)
        check('dex: coverage card says nothing is Need until a generation is confirmed', 'nothing is called need' in pg.inner_text('#gencov').lower() and 'none yet' in pg.inner_text('#gencov').lower())
        pg.click('#gencov [data-gen="1"]'); pg.wait_for_timeout(300)
        row=pg.evaluate("(()=>{const r=[...document.querySelectorAll('#dexlist .drow')].find(r=>/Bulbasaur/.test(r.innerText));return r&&(r.querySelector('.own')||{textContent:''}).textContent})()")
        gen2=pg.evaluate("(()=>{const g=document.getElementById('dgen');g.value='2';g.dispatchEvent(new Event('change'));return [...document.querySelectorAll('#dexlist .drow')].slice(0,3).map(r=>(r.querySelector('.own')||{textContent:''}).textContent)})()")
        check('dex: confirming Gen 1 turns its unowned Pokémon into Need and leaves Gen 2 not tracked', row=='Need' and all(g=='' for g in gen2), (row,gen2))
        check('dex: confirmation is stored as a synced preference', 'pref:gen:1' in pg.evaluate("localStorage.getItem('gofn-us-v1')"))
        pg.click('#gencov [data-gen="1"]'); pg.wait_for_timeout(200)
        check('dex: un-confirming returns it to not tracked', 'pref:gen:1' not in (pg.evaluate("localStorage.getItem('gofn-us-v1')") or '') or '"v":null' in pg.evaluate("localStorage.getItem('gofn-us-v1')"))
        check('no page errors across all views', pg.errs==[], pg.errs)
        check('no horizontal scroll', not pg.evaluate('document.documentElement.scrollWidth>innerWidth'))
        pg.click('nav.tabs button[data-tab="raids"]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT+'raids.png')

    if on('a'):
        # Audit real, visible controls across the major app views rather than only the Today card.
        target_page = page()

        def open_details_and_audit(label):
            target_page.locator('details').evaluate_all(
                "els => els.forEach(el => { el.open = true; })")
            target_page.wait_for_timeout(80)
            undersized = target_page.evaluate("""() => {
                const selector = 'button, summary, select, a.pill, a.more, [role="tab"], label:has(input[type="checkbox"]), label:has(input[type="radio"])';
                return [...document.querySelectorAll(selector)]
                    .filter(el => {
                        if (el.closest('[hidden],[aria-hidden="true"]')) return false;
                        const style = getComputedStyle(el), rect = el.getBoundingClientRect();
                        return style.display !== 'none' && style.visibility !== 'hidden' &&
                            rect.width > 0 && rect.height > 0;
                    })
                    .map(el => {
                        const r = el.getBoundingClientRect();
                        return {
                            tag: el.tagName.toLowerCase(),
                            id: el.id,
                            className: String(el.className || '').slice(0, 80),
                            text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 48),
                            width: Math.round(r.width),
                            height: Math.round(r.height)
                        };
                    })
                    .filter(x => x.width < 44 || x.height < 44)
                    .slice(0, 20);
            }""")
            check(label + ': visible controls meet the 44×44px target', not undersized, undersized)

        open_details_and_audit('Today')
        target_page.locator('nav.tabs button[data-tab="events"]').click()
        target_page.locator('#subnav-events button[data-sub="timeline"]').click()
        open_details_and_audit('Schedule timeline')
        target_page.locator('#subnav-events button[data-sub="calendar"]').click()
        open_details_and_audit('Schedule calendar')
        target_page.locator('nav.tabs button[data-tab="raids"]').click()
        open_details_and_audit('Battle')
        target_page.locator('nav.tabs button[data-tab="collect"]').click()
        target_page.locator('#subnav-collect button[data-sub="dex"]').click()
        target_page.locator('#mode-collect-dex button[data-mode="species"]').click()
        open_details_and_audit('Collection species')
        target_page.locator('#mode-collect-dex button[data-mode="forms"]').click()
        open_details_and_audit('Collection forms')
        target_page.locator('#mode-collect-dex button[data-mode="import"]').click()
        open_details_and_audit('Collection import')
        target_page.locator('#subnav-collect button[data-sub="megas"]').click()
        open_details_and_audit('Collection Megas')
        target_page.locator('#subnav-collect button[data-sub="guides"]').click()
        target_page.locator('#mode-collect-guides button[data-mode="best"]').click()
        open_details_and_audit('Best attackers')
        target_page.locator('#mode-collect-guides button[data-mode="hundo"]').click()
        open_details_and_audit('Hundo guide')
        target_page.locator('#hwatch').click()
        open_details_and_audit('Saved watchlist')
        target_page.locator('#hmenu').click()
        open_details_and_audit('Saved menu')
        check('touch-target audit adds no page errors', target_page.errs == [], target_page.errs)
        target_page.context.close()

    if on('a'):
        contrast_page = page()
        contrast = contrast_page.evaluate("""() => {
            function rgb(value) {
                if (value[0] === '#') {
                    const hex = value.slice(1);
                    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
                }
                const match = value.match(/rgba?\\(([^)]+)\\)/i);
                if (match) return match[1].split(',').slice(0, 3).map(Number);
                const values = (value.match(/[0-9.]+/g) || []).slice(0, 3).map(Number);
                return value.startsWith('color(srgb') ? values.map(v => v * 255) : values;
            }
            function luminance(value) {
                const c = rgb(value).map(v => {
                    v /= 255;
                    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
                });
                return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
            }
            function ratio(fg, bg) {
                const a = luminance(fg), b = luminance(bg);
                return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            }
            const kinds = ['cd', 'raid', 'max', 'spot', 'pvp', 'person', 'debut', 'twitch', 'event'];
            const kindRatios = kinds.map(kind => {
                const tuple = window.GODASH.kindOf({ kind });
                const el = document.createElement('span');
                el.className = 'kind';
                el.textContent = tuple[0];
                el.style.setProperty('--k', tuple[1]);
                el.style.setProperty('--kf', tuple[2]);
                document.body.appendChild(el);
                const style = getComputedStyle(el);
                const result = { kind, ratio: ratio(style.color, style.backgroundColor), fg: style.color, bg: style.backgroundColor };
                el.remove();
                return result;
            });
            const host = document.createElement('article');
            host.className = 'evc live';
            host.style.setProperty('--k', '#D7373C');
            const countdown = document.createElement('span');
            countdown.className = 'cdn';
            countdown.textContent = 'Live · 2h left';
            host.appendChild(countdown);
            document.body.appendChild(host);
            const style = getComputedStyle(countdown);
            const countdownRatio = { ratio: ratio(style.color, style.backgroundColor), fg: style.color, bg: style.backgroundColor };
            host.remove();
            return { kindRatios, countdownRatio };
        }""")
        check('all event-kind pills meet 4.5:1 text contrast', all(x['ratio'] >= 4.5 for x in contrast['kindRatios']), contrast['kindRatios'])
        check('live countdown text meets 4.5:1 contrast', contrast['countdownRatio']['ratio'] >= 4.5, contrast['countdownRatio'])
        check('contrast audit adds no page errors', contrast_page.errs == [], contrast_page.errs)
        contrast_page.context.close()

    if on('b'):
        # 8. Phase 3: forms are tracked only when you mark them
        pg=page()
        st=pg.evaluate("[GODASH.ownState('Alolan Vulpix').state, GODASH.ownState('Mega Charizard X').state, GODASH.ownState('Shadow Mewtwo').state, GODASH.ownState('Dynamax Charizard').state, GODASH.ownState('Mega Charizard X').tk]")
        check('unmarked forms are unknown (not missing)', st[:3]==['unknown','unknown','unknown'] and st[3]=='form' and st[4]=='form:6:mega-x', st)
        pg.click('nav.tabs button[data-tab="collect"]'); pg.click('#subnav-collect button[data-sub="dex"]'); pg.click('#mode-collect-dex button[data-mode="forms"]'); pg.wait_for_timeout(300)
        pg.fill('#formq','vulpix'); pg.wait_for_timeout(200)
        check('forms search finds Alolan Vulpix', 'Alolan Vulpix' in pg.inner_text('#formlist'), pg.inner_text('#formlist')[:200])
        pg.locator('#formlist [data-val="1"]').first.click(); pg.wait_for_timeout(150)
        check('Have is saved as form:37:alola', '"form:37:alola"' in pg.evaluate("localStorage.getItem('gofn-us-v1')"))
        check('and now reads as have', pg.evaluate("GODASH.ownState('Alolan Vulpix').state")=='have')
        pg.locator('#formlist [data-val="0"]').first.click(); pg.wait_for_timeout(150)
        check('Need flips it to missing, still explicit', pg.evaluate("GODASH.ownState('Alolan Vulpix').state")=='missing')
        pg.locator('#formlist [data-val="0"]').first.click(); pg.wait_for_timeout(150)
        check('tapping again clears it back to unknown', pg.evaluate("GODASH.ownState('Alolan Vulpix').state")=='unknown')
        pg.fill('#formq',''); pg.click('[data-fg="regional"]'); pg.wait_for_timeout(150)
        check('type chips list forms', pg.locator('#formlist .frow').count()>=20)
        pg.screenshot(path=OUT+'forms.png')
        # 9. Phase 4: sync merges per entry, newer local edit is not overwritten
        puts=[]
        def us(route,req):
            if req.method=='PUT': puts.append(json.loads(req.post_data))
            route.fulfill(content_type='application/json',body=json.dumps({'enabled':True,'now':1,'entries':{'follow:eevee':{'v':'Eevee','t':99},'form:37:alola':{'v':1,'t':5}},'applied':None}))
        ctx=b.new_context(viewport={'width':390,'height':844},timezone_id='Australia/Melbourne')
        ctx.set_default_timeout(10000)
        ctx.set_default_navigation_timeout(15000)
        pg=ctx.new_page(); pg.errs=[]; pg.on('pageerror',lambda e:pg.errs.append(str(e)))
        pg.route('**/api/sources',ful('{"environment":"production","database":true,"enabled":false,"sources":[]}')); pg.route('**/api/events',ful('{"enabled":false,"events":[]}'))
        pg.route('**/api/dex',lambda r:r.fulfill(status=401,body='{}',content_type='application/json')); pg.route('**/api/art*',lambda r:r.fulfill(status=404,body=''))
        pg.route('**/api/userstate*',us)
        pg.add_init_script("sessionStorage.setItem('gofn-prof-skip','1');localStorage.setItem('gofn-pin','1234');localStorage.setItem('gofn-us-v1',JSON.stringify({'form:37:alola':{v:0,t:%d}}))"%(9999999999999))
        pg.goto(BASE+'/'); pg.wait_for_selector('.pc, .prio-empty',state='attached')
        # The merge and the PUT of local-newer entries are async after first paint: wait for them, not a fixed 600 ms.
        settle(pg,"document.getElementById('home-now')?.hasAttribute('data-render-key')")
        for _ in range(200):
            if puts: break
            pg.wait_for_timeout(50)
        pg.click('#hmenu'); settle(pg,"document.getElementById('followed')?.textContent.toUpperCase().includes('EEVEE')")
        check('server follow arrives on this device', 'EEVEE' in pg.inner_text('#followed').upper(), pg.inner_text('#followed')[:100])
        check('newer local edit beats older server entry', pg.evaluate("GODASH.ownState('Alolan Vulpix').state")=='missing')
        check('local-newer entry is pushed up', any('form:37:alola' in p.get('entries',{}) for p in puts), puts)
        settle(pg,"document.getElementById('usstat')?.textContent.includes('Synced')")
        check('sync status says synced', 'Synced' in pg.inner_text('#usstat'), pg.inner_text('#usstat'))
        check('no page errors in sync', pg.errs==[], pg.errs)
        # 10. Phase 5 settings: off by default, never needs a secret in the page
        pg=page(); pg.click('#hmenu'); pg.click('#alertsdd summary'); pg.wait_for_timeout(300)
        check('alerts default to off', pg.locator('#alerts [data-pref="on"]').is_checked()==False and 'Off' in pg.inner_text('#alertsum'))
        check('without a PIN it says what to do', 'sync PIN' in pg.inner_text('#alerts'))
        pg.locator('#alerts [data-pref="on"]').check(); pg.wait_for_timeout(200)
        check('master switch is stored as a synced preference', '"pref:notify.on"' in pg.evaluate("localStorage.getItem('gofn-us-v1')"))
        check('datamine alerts are opt-in', pg.locator('#alerts [data-pref="datamine"]').is_checked()==False)
        # 11. Phase 6 import: review queue, nothing automatic, undoable, never "missing"
        pg=page(); pg.click('nav.tabs button[data-tab="collect"]'); pg.click('#subnav-collect button[data-sub="dex"]'); pg.click('#mode-collect-dex button[data-mode="import"]'); pg.wait_for_timeout(300)
        pg.fill('#imptext','CP 1200\nPikachu\nCharizar\nNidoran\nrandom words here'); pg.click('#impgo'); pg.wait_for_timeout(300)
        rows=pg.locator('#impq .improw')
        check('queue built', rows.count()>=3, rows.count())
        check('only the exact match is pre-ticked', pg.locator('#impq input[data-qc]:checked').count()==1 and 'Pikachu' in pg.inner_text('#impq .improw:has(input:checked)'))
        check('ambiguous Nidoran is unclear and not tickable', pg.locator('#impq .c-unclear input[disabled]').count()==1)
        before=pg.evaluate("localStorage.getItem('gofn-dex-v1')")
        check('nothing changed before approval', before is None or '"25"' not in before)
        pg.click('#impapply'); pg.wait_for_timeout(300)
        d=json.loads(pg.evaluate("localStorage.getItem('gofn-dex-v1')"))
        check('approved: only Pikachu added as owned, nothing marked missing', list(d['m']['own'].keys())==['25'], d['m'])
        check('undo is offered', pg.locator('[data-undo]').count()==1)
        pg.click('[data-undo]'); pg.wait_for_timeout(300)
        d=json.loads(pg.evaluate("localStorage.getItem('gofn-dex-v1')"))
        check('undo removes exactly what the import added', d['m']['own']=={}, d['m'])
        pg.screenshot(path=OUT+'import.png')

        # ---- regression: partially tracked generations, forms independent of base species, corrections ----
        pg=page(marks={'have':{},'hundo':{},'m':{'own':{'6':1,'1':1}}},gens=[1],us={'form:37:alola':0})
        S=lambda n: pg.evaluate("GODASH.ownState(%s).state"%json.dumps(n))
        check('partial: owned Charizard in a confirmed generation reads Have', S('Charizard')=='have')
        check('partial: unowned Venusaur in the confirmed generation reads Need', S('Venusaur')=='missing')
        check('partial: Gen 2 (not confirmed) is Not tracked, not Need', S('Togepi')=='unknown' and S('Zorua')=='unknown')
        check('forms: owning Charizard does not imply Mega Charizard X / Gigantamax / Shadow', S('Mega Charizard X')=='unknown' and S('Gigantamax Charizard')=='unknown' and S('Shadow Charizard')=='unknown')
        check('forms: a regional form of an unowned base stays independent', S('Alolan Raichu')=='unknown')
        check('forms: an explicit Need on a form is respected and Have on the base does not clear it', S('Alolan Vulpix')=='missing')
        check('forms: Dynamax is never collectible, so never Need', S('Dynamax Charizard')=='form')
        # Not tracked is never rendered as a Need chip
        pg.click('nav.tabs button[data-tab="collect"]'); pg.click('#subnav-collect button[data-sub="dex"]'); pg.wait_for_selector('#gencov .gc',state='attached'); pg.evaluate("document.querySelector('#gencov details').open=true"); pg.wait_for_timeout(300)
        pg.fill('#dq','togepi') if pg.locator('#dq').count() else None
        pg.wait_for_timeout(200)
        dx=pg.inner_text('#dexlist').lower()
        check('dex list: Gen 2 species show Not tracked, never Need', 'togepi' in dx and 'need' not in dx.split('togepi')[1][:60], dx[:200])
        # correcting a wrong mark (through the real Own toggle)
        pg=page(marks={'have':{},'hundo':{},'m':{'own':{'1':1}}},gens=[1])
        pg.click('nav.tabs button[data-tab="collect"]'); pg.click('#subnav-collect button[data-sub="dex"]'); pg.wait_for_selector('#dexlist .drow'); pg.wait_for_timeout(300)
        check('correct: Bulbasaur starts as Have', pg.evaluate("GODASH.ownState('Bulbasaur').state")=='have')
        pg.click('#dexlist .drow[data-id="1"] .tg[data-c="own"]'); pg.wait_for_timeout(200)
        check('correct: un-marking a wrong Have in a confirmed generation gives Need, not a stale Have', pg.evaluate("GODASH.ownState('Bulbasaur').state")=='missing' and 'need' in pg.inner_text('#dexlist .drow[data-id="1"]').lower())
        pg.click('#dexlist .drow[data-id="1"] .tg[data-c="own"]'); pg.wait_for_timeout(200)
        check('correct: marking it again restores Have', pg.evaluate("GODASH.ownState('Bulbasaur').state")=='have')
        pg.evaluate("GODASH.setGenConfirmed(1,false)"); pg.click('#dexlist .drow[data-id="1"] .tg[data-c="own"]'); pg.wait_for_timeout(200)
        check('correct: once the generation is un-confirmed an unowned Pokémon is Not tracked again', pg.evaluate("GODASH.ownState('Bulbasaur').state")=='unknown')
        # import never overwrites manual marks, and undo restores them exactly
        pg=page(marks={'have':{},'hundo':{},'m':{'own':{'4':1,'25':1}}},us={'form:37:alola':0})
        pg.click('nav.tabs button[data-tab="collect"]'); pg.click('#subnav-collect button[data-sub="dex"]'); pg.click('#mode-collect-dex button[data-mode="import"]'); pg.wait_for_timeout(300)
        pg.fill('#imptext','Pikachu\nBulbasaur'); pg.click('#impgo'); pg.wait_for_timeout(300)
        requests=[]; pg.on('request',lambda r: requests.append(r.url) if r.method!='GET' else None)
        pg.click('#impapply'); pg.wait_for_timeout(300)
        d=json.loads(pg.evaluate("localStorage.getItem('gofn-dex-v1')"))
        check('import: adds Have only and keeps manual marks', set(d['m']['own'].keys())=={'1','4','25'} and not d['m'].get('missing') , d['m'])
        check('import: an explicit Need form mark is untouched', pg.evaluate("GODASH.ownState('Alolan Vulpix').state")=='missing')
        pg.click('[data-undo]'); pg.wait_for_timeout(300)
        d=json.loads(pg.evaluate("localStorage.getItem('gofn-dex-v1')"))
        check('import undo: restores exactly the manual marks (an already-owned Pikachu stays)', set(d['m']['own'].keys())=={'4','25'}, d['m'])
        check('import is local: no OCR or upload request left the page', not [u for u in requests if 'api/' in u and 'dex' not in u and 'userstate' not in u], requests)
        # L. screenshot-import undo removes only ownership added by import, preserving other marks
        pg=page(marks={'have':{},'hundo':{},'m':{'shiny':{'25':1}}})
        pg.wait_for_function("!!window.GOEXTRA")
        pg.click('nav.tabs button[data-tab="collect"]'); pg.click('#subnav-collect button[data-sub="dex"]'); pg.click('#mode-collect-dex button[data-mode="import"]'); pg.wait_for_timeout(150)
        pg.evaluate("GOEXTRA.setQueue('Pikachu')")
        pg.wait_for_timeout(100)
        check('import: Pikachu exact match is available to add', pg.locator('#impq').inner_text().find('Pikachu')>=0 and pg.locator('#impapply').count()==1)
        pg.click('#impapply'); pg.wait_for_timeout(100)
        after_add=pg.evaluate("JSON.parse(localStorage.getItem('gofn-dex-v1'))")
        check('import: adding ownership keeps the existing shiny mark', after_add['m']['own'].get('25')==1 and after_add['m']['shiny'].get('25')==1, after_add['m'])
        pg.locator('#impbatches [data-undo]').first.click(); pg.wait_for_timeout(100)
        after_undo=pg.evaluate("JSON.parse(localStorage.getItem('gofn-dex-v1'))")
        check('import undo: removes only ownership introduced by import', '25' not in after_undo['m']['own'] and after_undo['m']['shiny'].get('25')==1, after_undo['m'])
        check('import undo: status confirms undo', 'Undone:' in pg.inner_text('#impstat'))
        pg.close()
        # Open source
        pg=page(); pg.wait_for_function("!!window.GODETAIL")
        pg.evaluate("GODETAIL.open('cur:zorua')"); pg.wait_for_selector('#evd .evd-btns'); pg.wait_for_timeout(200)
        check('event detail: Zorua gets Open source from the official post', pg.locator('#evd .evd-btns a:has-text("Open source")').count()==1 and 'pokemongo.com' in (pg.get_attribute('#evd .evd-btns a:has-text("Open source")','href') or ''))
        no_link=page(); no_link.wait_for_function("!!window.GODETAIL && !!window.GODASH")
        no_link.evaluate("""() => { GODASH.events().push({id:'test:no-source',name:'No Source Test',kind:'event',start:new Date('2026-11-20T10:00:00'),end:new Date('2026-11-20T11:00:00'),status:'community_reported',announced:true,missing:false,featured:[],bonuses:[],notes:[],reports:[]}); GODETAIL.open('test:no-source'); }"""); no_link.wait_for_selector('#evd [data-nolink]')
        check('event detail: with no URL anywhere it says so instead of inventing one', no_link.locator('#evd [data-nolink]').count()==1 and no_link.locator('#evd a:has-text("Open source")').count()==0)
        no_link.context.close()
        fill=','.join('{"id":"leekduck:f%d","name":"Filler %d","type":"event","start":"2026-11-%02dT10:00:00.000","end":"2026-11-%02dT12:00:00.000","tzMode":"local","status":"community_reported","announced":true,"missing":false,"featured":[],"bonuses":[],"reports":[]}'%(i,i,i+1,i+1) for i in range(11))
        api='{"enabled":true,"events":['+fill+',{"id":"leekduck:x1","name":"Test Raid Day","type":"raid-battles","start":"2026-10-20T10:00:00.000","end":"2026-10-20T11:00:00.000","tzMode":"local","status":"community_reported","announced":true,"missing":false,"featured":[],"bonuses":[],"link":"https://leekduck.com/events/x1/","reports":[{"source":"leekduck","status":"community_reported","link":""}]}],"sources":[]}'
        pg=page(api=api,sources='{"environment":"preview","database":true,"enabled":true,"sources":[]}'); pg.wait_for_function("!!window.GODETAIL")
        pg.evaluate("GODETAIL.open('leekduck:x1')"); pg.wait_for_selector('#evd .evd-btns')
        check('event detail: API event with only a top-level link still gets Open source', pg.locator('#evd a:has-text("Open source")').count()==1)

        # ---- Places ----
        pg=page(extra={'**/places.json':(PLACES_FIXTURE,200)}); pg.click('#hmenu'); pg.wait_for_timeout(300)
        check('places: Menu has a Places entry', pg.locator('#menu-places').count()==1)
        pg.click('#menu-places'); pg.wait_for_selector('#plc .plc-row'); pg.wait_for_timeout(200)
        pt=pg.inner_text('#plc')
        check('places: lists the two sourced Brisbane venues, grouped by city', pg.locator('#plc .plc-row').count()==2 and 'Queen Street Mall' in pt and 'King George Square' in pt and 'Brisbane, Queensland' in pt)
        check('places: each row shows coordinates, type, source and community report status', '−27.4696, 153.0252' in pt and 'City Safari hub' in pt and 'Pokémon GO Hub' in pt and 'Community-maintained coordinate reference' in pt and 'publication date unavailable' in pt and 'not independently verified' in pt, pt[:400])
        check('places: tags with no sourced places stay visible with 0', all(pg.locator('#plc [data-tag="%s"]'%t).count()==1 for t in ['Event venue','Community Day','Raids','Gyms','PokéStops']) and '0' in pg.inner_text('#plc [data-tag="Raids"]'))
        check('places: no raid hotspot is listed and the empty state says so', 'A tag with 0 stays visible' in pt and all('Raids' not in t for t in pg.locator('#plc .plc-row .plc-tg').all_inner_texts()))
        check('places: no GPX button when there is no verified route', pg.locator('#plc a[download]').count()==0 and 'No route file' in pt)
        pg.fill('#plc-q','king'); pg.wait_for_timeout(200)
        check('places: search narrows the list and keeps focus', pg.locator('#plc .plc-row').count()==1 and pg.evaluate("document.activeElement.id")=='plc-q')
        pg.fill('#plc-q','zzz'); pg.wait_for_timeout(200)
        check('places: no match says nothing is guessed', pg.locator('#plc-none').count()==1)
        pg.fill('#plc-q',''); pg.select_option('#plc-country','Australia'); pg.select_option('#plc-city','Brisbane'); pg.wait_for_timeout(200)
        check('places: country and city filters work', pg.locator('#plc .plc-row').count()==2)
        pg.click('#plc [data-tag="Raids"]'); pg.wait_for_timeout(200)
        check('places: filtering to a tag with 0 places shows none', pg.locator('#plc .plc-row').count()==0)
        pg.click('#plc [data-tag=""]'); pg.wait_for_timeout(200)
        pg.click('#plc .plc-open >> nth=0'); pg.wait_for_selector('#plc-back'); pg.wait_for_timeout(200)
        dt=pg.inner_text('#plc')
        check('places: detail shows coordinates, copy button and no verified route', '−27.4696, 153.0252' in dt and pg.locator('#plc [data-copy]').count()==1 and 'No verified GPX route' in dt and pg.locator('#plc a[download]').count()==0)
        hrefs=pg.evaluate("[...document.querySelectorAll('#plc .plc-lk')].map(a=>a.href)")
        check('places: no map-app links are rendered; coordinates remain copyable', len(hrefs)==0 and '−27.4696, 153.0252' in dt and pg.locator('#plc [data-copy]').count()==1, hrefs)
        check('places: raid activity is stated as unknown, never live', 'Unknown. Nothing here says raids happen now.' in dt and 'not independently verified' in dt)
        check('places: detail names the coordinate source and publication-date status', 'Wikipedia' in dt and 'publication date unavailable' in dt and 'Pokémon GO Hub' in dt)
        pg.evaluate("window.__clip=null;navigator.clipboard.writeText=function(t){window.__clip=t;return Promise.resolve()}")
        pg.click('#plc [data-copy]'); pg.wait_for_timeout(200)
        check('places: Copy coordinates copies plain decimal degrees and confirms', pg.evaluate("window.__clip")=='-27.4696, 153.0252' and 'Copied' in pg.inner_text('#plc-status'), pg.evaluate("window.__clip"))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check('places: Esc closes it', pg.locator('#plc').is_hidden())
        check('places: no horizontal scroll', not pg.evaluate('document.documentElement.scrollWidth>innerWidth'))
        # GPX only with a verified route; invalid entries are dropped
        fx=json.dumps({'updated':'2026-10-10','tags':['Event venue','Community Day','Raids','Gyms','PokéStops'],'places':[
          {'id':'r1','name':'Route Park','city':'Testville','region':'Vic','country':'Australia','lat':-37.8,'lng':144.9,'type':'Walking route','tags':['PokéStops'],'sources':[{'label':'Author A','url':'https://example.com/a','trust':'community'}],'verified':'2026-10-01','route':{'file':'/routes/r1.gpx','label':'Loop','author':'Author A','url':'https://example.com/a','verified':'2026-10-01'}},
          {'id':'bad1','name':'No Source Place','city':'X','country':'Australia','lat':-37,'lng':144,'type':'t','tags':[],'sources':[],'verified':'2026-10-01'},
          {'id':'bad2','name':'No Date Place','city':'X','country':'Australia','lat':-37,'lng':144,'type':'t','tags':[],'sources':[{'label':'S','url':'https://example.com'}]},
          {'id':'bad3','name':'Http Source Place','city':'X','country':'Australia','lat':-37,'lng':144,'type':'t','tags':[],'sources':[{'label':'S','url':'http://example.com'}],'verified':'2026-10-01'}]})
        pg=page(extra={'**/places.json':(fx,200)}); pg.wait_for_function("!!window.GOPLACES")
        pg.evaluate("GOPLACES.open('')"); pg.wait_for_selector('#plc .plc-row'); pg.wait_for_timeout(200)
        check('places: only places with a source, https link and verified date are listed', pg.locator('#plc .plc-row').count()==1 and 'Route Park' in pg.inner_text('#plc'))
        check('places: Download GPX appears only for the place with a verified route', pg.locator('#plc a[download]').count()==1 and pg.get_attribute('#plc a[download]','href')=='/routes/r1.gpx')
        # event detail links to its venues
        api=json.dumps({'enabled':True,'events':[{'id':'leekduck:f%d'%i,'name':'Filler %d'%i,'type':'event','start':'2026-11-%02dT10:00:00.000'%(i+1),'end':'2026-11-%02dT12:00:00.000'%(i+1),'tzMode':'local','status':'community_reported','announced':True,'missing':False,'featured':[],'bonuses':[],'reports':[]} for i in range(11)]+[{'id':'leekduck:safari','name':'City Safari: Brisbane','type':'event','start':'2026-09-26T10:00:00.000','end':'2026-09-27T18:00:00.000','tzMode':'local','status':'community_reported','announced':True,'missing':False,'featured':[],'bonuses':[],'link':'https://leekduck.com/events/safari/','reports':[]}],'sources':[]})
        pg=page(api=api,sources='{"environment":"preview","database":true,"enabled":true,"sources":[]}',extra={'**/places.json':(PLACES_FIXTURE,200)})
        pg.wait_for_function("!!window.GOPLACES && !!window.GODETAIL")  # places.js is appended after first render; wait for it
        pg.evaluate("GOPLACES.load()"); pg.evaluate("GODETAIL.open('leekduck:safari')"); pg.wait_for_selector('#evd [data-places]'); pg.wait_for_timeout(200)
        check('event detail: an in-person event links to its sourced venues', pg.locator('#evd [data-places]').count()==2)
        # event-to-place matching: exact name AND overlapping dates, nothing fuzzy
        m=lambda name,s,e: pg.evaluate("GOPLACES.forEvent({name:%s,start:new Date(%s),end:new Date(%s)}).map(p=>p.id)"%(json.dumps(name),json.dumps(s),json.dumps(e)))
        check('match: exact name and dates link both venues', len(m('City Safari: Brisbane','2026-09-26T10:00','2026-09-27T18:00'))==2)
        check('match: case and spacing are ignored', len(m('  city safari:  brisbane ','2026-09-26T10:00','2026-09-27T18:00'))==2)
        check('match: Sunday-only event links only the venue used on Sunday... and the hub that ran both days', sorted(m('City Safari: Brisbane','2026-09-27T10:00','2026-09-27T18:00'))==['king-george-square-brisbane','queen-street-mall-brisbane'])
        check('match: Saturday-only event links only the hub (King George Square is Sunday only)', m('City Safari: Brisbane','2026-09-26T10:00','2026-09-26T18:00')==['queen-street-mall-brisbane'])
        check('match: same name in another year does not link', m('City Safari: Brisbane','2027-09-26T10:00','2027-09-27T18:00')==[])
        check('match: similar names do not link', all(m(n,'2026-09-26T10:00','2026-09-27T18:00')==[] for n in ['City Safari: Brisbane Raid Hour','City Safari: Sydney','City Safari','Brisbane','City Safari: Brisbane 2','Pokémon GO Fest: Brisbane']))
        check('match: missing or invalid dates never link', pg.evaluate("GOPLACES.forEvent({name:'City Safari: Brisbane'}).length+GOPLACES.forEvent({name:'City Safari: Brisbane',start:new Date('x')}).length+GOPLACES.forEvent(null).length")==0)
        pg.click('#evd [data-places] >> nth=0'); pg.wait_for_selector('#plc-back'); pg.wait_for_timeout(200)
        check('event detail: venue link opens the place detail on top', 'Queen Street Mall' in pg.inner_text('#plc') and pg.locator('#plc').is_visible())
        pg.evaluate("GODETAIL.close(); GOPLACES.close(); GODETAIL.open('leekduck:f1')"); pg.wait_for_selector('#evd .evd-btns')
        check('event detail: online events show no Places section', pg.locator('#evd [data-places]').count()==0 and 'filler 1' in pg.inner_text('#evd').lower())

    if on('c'):
        # ---- move-type badges and Elite TM ----
        PVP=json.dumps({'updated':1791540663630,'leagues':{'great':[
          {'name':'Melmetal','score':94.4,'fast':'Thunder Shock','charged':['Double Iron Bash','Dynamic Punch']},
          {'name':'Altaria','score':93,'fast':'Dragon Breath','charged':['Moonblast','Flamethrower']},
          {'name':'Venusaur','score':80,'fast':'Vine Whip','charged':['Frenzy Plant','Sludge Bomb']},
          {'name':'Shadow Venusaur','score':79,'fast':'Vine Whip','charged':['Frenzy Plant','Sludge Bomb']},
          {'name':'Ivysaur','score':50,'fast':'Vine Whip','charged':['Frenzy Plant','Sludge Bomb']},
          {'name':'Charmeleon','score':40,'fast':'Scratch','charged':['Flamethrower']},
          {'name':'Mystery Mon','score':10,'fast':'Totally Made Up Move','charged':['Hidden Power','Weather Ball']}],'ultra':[],'master':[]}})
        def pvp_page(moves=None,pvp=PVP):
            pg=page()
            return pg
        def mk(moves='real'):
            ctx=b.new_context(viewport={'width':390,'height':844},timezone_id='Australia/Melbourne',locale='en-AU')
            ctx.set_default_timeout(10000)
            ctx.set_default_navigation_timeout(15000)
            pg=ctx.new_page(); pg.errs=[]
            pg.on('pageerror',lambda e:pg.errs.append(str(e)))
            pg.route('**/api/sources',ful('{"environment":"production","database":true,"enabled":false,"sources":[]}')); pg.route('**/api/events',ful('{"enabled":false,"events":[]}'))
            pg.route('**/api/userstate*',lambda r:r.fulfill(status=404,body='{}')); pg.route('**/api/dex',lambda r:r.fulfill(status=401,body='{}')); pg.route('**/api/art*',lambda r:r.fulfill(status=404,body=''))
            pg.route('**/api/pvp',lambda r:r.fulfill(status=404,body='')); pg.route('**/pvp.json',ful(PVP))
            if moves=='missing': pg.route('**/moves.json',lambda r:r.fulfill(status=404,body=''))
            elif moves!='real': pg.route('**/moves.json',ful(moves))
            pg.goto(BASE+'/'); pg.wait_for_selector('.pc, .prio-empty',state='attached'); pg.wait_for_timeout(900); return pg
        pg=mk()
        rows=lambda: pg.evaluate("[...document.querySelectorAll('#pvplist .drow')].map(r=>({t:r.innerText.split('\\n')[0],badges:[...r.querySelectorAll('.mvb')].map(m=>({n:m.querySelector('b').textContent,ty:(m.querySelector('.mty')||{getAttribute:()=>null}).getAttribute('aria-label'),elite:(m.querySelector('.etm')||{getAttribute:()=>null}).getAttribute('aria-label')}))}))")
        R=rows(); by={r['badges'][0]['n']+str(i):r for i,r in enumerate(R)}
        mel=R[0]['badges']; alt=R[1]['badges']
        check('moves: Melmetal (Steel) shows Thunder Shock as Electric and Double Iron Bash as Steel, from the move not the Pokémon', mel[0]['ty']=='Electric type' and mel[1]['ty']=='Steel type' and mel[2]['ty']=='Fighting type', mel)
        check('moves: Altaria (Dragon/Flying) shows Moonblast as Fairy', alt[1]['ty']=='Fairy type' and alt[0]['ty']=='Dragon type', alt)
        check('moves: Elite TM only where sourced (Melmetal Double Iron Bash, Venusaur Frenzy Plant)', mel[1]['elite']=='Needs an Elite Charged TM' and mel[0]['elite'] is None and R[2]['badges'][1]['elite']=='Needs an Elite Charged TM' and R[2]['badges'][2]['elite'] is None, (mel,R[2]))
        check('moves: Shadow form matches its own sourced entry', R[3]['badges'][1]['elite']=='Needs an Elite Charged TM')
        check('moves: a Pokémon with no sourced entry never gets an Elite TM tag (same move, Ivysaur)', all(x['elite'] is None for x in R[4]['badges']), R[4])
        check('moves: an elite fast move says Fast', R[5]['badges'][0]['elite']=='Needs an Elite Fast TM', R[5])
        myst=R[6]['badges']
        check('moves: an unlisted move gets the explicit Type unknown fallback, never a guessed type', myst[0]['ty']=='Type unknown' and all(x['elite'] is None for x in myst), myst)
        check('moves: Hidden Power and Weather Ball (type varies) are Type unknown, not one type', myst[1]['ty']=='Type unknown' and myst[2]['ty']=='Type unknown', myst)
        check('moves: every badge has a visible move name next to it and labels are not colour-only', pg.evaluate("[...document.querySelectorAll('#pvplist .mvb')].every(m=>m.querySelector('b').textContent.trim().length>1 && m.querySelector('.mty').getAttribute('role')==='img')"))
        # best attackers list gets badges too
        bi=pg.evaluate("[...document.querySelectorAll('#list .irow .mv')].slice(0,40).every(m=>m.querySelectorAll('.mty').length>=2)")
        check('moves: best attackers rows show a badge for both moves', bi)
        unk=pg.evaluate("[...document.querySelectorAll('#list .irow .mty.unk, #pvplist .mvb:not(:has(.mty.unk)) .x')].length")
        # every app move resolves in the browser except the ones that vary
        unres=pg.evaluate("(()=>{const out=new Set();document.querySelectorAll('#list .mvb').forEach(m=>{if(m.querySelector('.mty.unk'))out.add(m.querySelector('b').textContent)});return [...out]})()")
        nb=pg.evaluate("document.querySelectorAll('#list .mvb').length")
        check('moves: only moves whose type genuinely varies (Weather Ball) fall back to Type unknown in Best attackers', set(unres)<={'Weather Ball','Hidden Power','Aura Wheel'} and nb>=100, (nb,unres))
        check('moves: no page errors', pg.errs==[], pg.errs)
        # data failed to load: plain names only, no false Unknown, no Elite
        pg=mk('missing')
        check('moves: if moves.json cannot load, names stay plain (no guessed or Unknown badge, no Elite)', pg.evaluate("document.querySelectorAll('#pvplist .mty, #pvplist .etm, #list .mty, #list .etm').length")==0 and 'Thunder Shock' in pg.evaluate("document.getElementById('pvplist').textContent"))
        # a move the table lacks, with a hand-fed type from a named source, uses that type; without one it is unknown
        sparse=json.dumps({'source':{},'types':{'Counter':'Fighting'},'fast':['Counter'],'ambiguous':{},'aliases':{},'elite':{}})
        pg=mk(sparse); R2=pg.evaluate("[...document.querySelectorAll('#pvplist .mvb')].slice(0,3).map(m=>m.querySelector('.mty').getAttribute('aria-label'))")
        check('moves: with a sparse table every missing move is Type unknown', R2==['Type unknown']*3, R2)
        # event detail: explicit move type from the source is shown; no Elite claim without a Pokémon
        pg=page(); pg.evaluate("GODETAIL.open('cur:zorua')"); pg.wait_for_selector('#evd .mvb'); pg.wait_for_timeout(300)
        check('moves: event detail shows Sucker Punch as Dark with no Elite claim', pg.get_attribute('#evd .mvb .mty','aria-label')=='Dark type' and pg.locator('#evd .etm').count()==0)

        # ---- freshness ----
        import re as _re
        MS=lambda iso: int(__import__('datetime').datetime.fromisoformat(iso).timestamp()*1000)
        OKT=MS('2026-10-09T08:30:00+11:00'); CHK=MS('2026-10-09T22:15:00+11:00')
        def src(id='leekduck',kind='community',**o):
            d={'id':id,'name':'Leek Duck (via ScrapedDuck)' if id=='leekduck' else id.title(),'kind':kind,'url':'https://x','terms':'','state':'healthy','note':'Last check passed validation.','lastChecked':CHK,'lastOk':OKT,'lastChanged':OKT,'sourceUpdated':None,'count':55,'invalid':0,'undated':0,'failStreak':0,'lastError':None,'upcoming':50}; d.update(o); return d
        def api(sources,feed,enabled=True): return json.dumps({'environment':'production','database':True,'enabled':enabled,'now':CHK,'feed':feed,'sources':sources})
        FRESH_FEED={'state':'fresh','note':'Latest refresh passed validation.','lastSuccess':OKT,'lastAttempt':CHK,'failing':[]}
        def fpage(sources_json,**kw):
            pg=page(sources=sources_json,**kw); pg.wait_for_selector('#fresh-line:not([hidden])'); return pg
        def menu_card(pg):
            pg.click('#hmenu'); pg.wait_for_timeout(200); pg.evaluate("document.getElementById('srcdd').open=true"); pg.wait_for_timeout(200); return pg.inner_text('#srcbody')
        # A. fresh feed: last successful refresh is the recorded time, never the page-load time
        pg=fpage(api([src()],FRESH_FEED)); line=pg.inner_text('#fresh-line')
        check('fresh: header shows the recorded last successful refresh', 'Event feed refreshed 9 Oct, 8:30 am' in line, line)
        check('fresh: page load time (10:45 pm) is not shown as a refresh time', '10:45' not in line, line)
        card=menu_card(pg)
        check('fresh: last successful update and last checked are separate, labelled times', 'Last successful update' in card and '9 Oct, 8:30 am' in card and 'Last checked' in card and '9 Oct, 10:15 pm' in card, card[:500])
        check('fresh: overall feed row has its own last successful refresh and last attempt', card.count('Last successful refresh')==1 and card.count('Last attempt')==1)
        # B. stale
        stale_feed=dict(FRESH_FEED,state='stale',note='No good refresh for over 36 hours.',lastSuccess=OKT-3*86400000)
        pg=fpage(api([src(state='stale',lastOk=OKT-3*86400000,note='No good check for over 36 hours.')],stale_feed)); line=pg.inner_text('#fresh-line'); card=menu_card(pg)
        check('stale: header says Stale and gives the old refresh time', line.startswith('Stale') and '6 Oct, 8:30 am' in line, line)
        check('stale: the source is labelled Stale and still labelled Community', 'Stale' in card and 'Community' in card)
        # C. failed refresh
        failed_feed={'state':'failed','note':'The latest refresh failed.','lastSuccess':OKT,'lastAttempt':CHK,'failing':['leekduck']}
        pg=fpage(api([src(state='failing',failStreak=3,lastError='HTTP 503',note='HTTP 503')],failed_feed)); line=pg.inner_text('#fresh-line'); card=menu_card(pg)
        check('failed: header says the latest refresh failed and shows the last good data time', 'Latest refresh failed' in line and '9 Oct, 8:30 am' in line, line)
        check('failed: source shows Failing, the error and that last good data is shown', 'Failing' in card and 'HTTP 503' in card and 'last good data' in card and '3 in a row' in card, card[:600])
        check('failed: last attempt (10:15 pm) is not mistaken for a refresh', 'refreshed 9 Oct, 10:15' not in line and '10:15' not in line)
        # D. missing timestamps
        nf={'state':'never','note':'Not checked yet.','lastSuccess':None,'lastAttempt':None,'failing':[]}
        pg=fpage(api([src(state='never',lastOk=None,lastChecked=None,lastChanged=None)],nf)); line=pg.inner_text('#fresh-line'); card=menu_card(pg)
        check('missing times: header claims no refresh time', 'No successful feed refresh is recorded yet' in line and not _re.search(r'\d+:\d\d (am|pm)',line), line)
        check('missing times: card says Not recorded, never a made-up time', card.count('Not recorded')>=3 and 'Not checked yet' in card, card[:500])
        # E. future / invalid timestamps are never shown as refreshes
        fut=MS('2027-01-01T00:00:00+11:00')
        pg=fpage(api([src(state='unknown',lastOk=fut,lastChecked=fut)],{'state':'fresh','note':'','lastSuccess':fut,'lastAttempt':fut,'failing':[]})); line=pg.inner_text('#fresh-line'); card=menu_card(pg)
        check('future time: not shown as a refresh in header or card', 'Jan' not in line and '2027' not in line and 'Jan' not in card.split('Data files')[0], line)
        # F. server off / unreachable
        # The snapshot date comes from the real data.json, so this check does not go stale when asOf is bumped.
        # fresh.js calls a snapshot stale after 72 hours; set the clock 4 days past asOf.
        _dt=__import__('datetime'); ASOF=json.load(open('public/data.json',encoding='utf-8'))['asOf']
        old_clock=(_dt.datetime.strptime(ASOF,'%d %b %Y')+_dt.timedelta(days=4,hours=12)).strftime('%Y-%m-%dT%H:%M:%S+11:00')
        pg=fpage(api([],{},enabled=False),clock=old_clock); line=pg.inner_text('#fresh-line')
        check('live feed off: names the snapshot date and warns when the snapshot is old', 'Live feed not connected' in line and 'as of '+ASOF in line and 'snapshot may be stale' in line and not _re.search(r'\d+:\d\d (am|pm)',line), line)
        pg=page(extra={'**/api/sources':('{}',500)}); pg.wait_for_selector('#fresh-line:not([hidden])'); line=pg.inner_text('#fresh-line')
        check('server unreachable: says freshness cannot be checked, no refresh time', 'Could not reach the server' in line and not _re.search(r'\d+:\d\d (am|pm)',line), line)
        # G. trust is independent of freshness
        srcs=[src(),src(id='official',kind='official',state='failing',failStreak=2,lastError='HTTP 500'),src(id='datamine',kind='datamine',state='stale',lastOk=OKT-9*86400000)]
        pg=fpage(api(srcs,failed_feed)); card=menu_card(pg)
        rows=pg.evaluate("[...document.querySelectorAll('#srcbody .srcrow')].map(r=>({n:r.querySelector('b').textContent,t:[...r.querySelectorAll('.st')].map(x=>x.textContent),f:[...r.querySelectorAll('.fr')].map(x=>x.textContent)}))")
        byn={r['n']:r for r in rows}
        check('trust: a failing official source stays Official and a stale datamine stays Datamined', byn['Official']['t']==['Official'] and byn['Official']['f']==['Failing'] and byn['Datamine']['t']==['Datamined'] and byn['Datamine']['f']==['Stale'], rows)
        check('trust: community source stays Community while fresh', byn['Leek Duck (via ScrapedDuck)']['t']==['Community'] and byn['Leek Duck (via ScrapedDuck)']['f']==['Fresh'])
        check('trust: the card states freshness never changes trust', 'never changes whether an event is Official, Community or Datamined' in card)
        evs=[ev('t%d'%i,'Trust Event %d'%i,'event','2026-10-%02dT10:00:00.000'%(20+i),'2026-10-%02dT12:00:00.000'%(20+i),st) for i,st in enumerate(['official_confirmed','community_reported','datamined'])]+[ev('f%d'%i,'Filler %d'%i,'event','2026-11-%02dT10:00:00.000'%(i+1),'2026-11-%02dT12:00:00.000'%(i+1),'community_reported') for i in range(10)]
        def statuses(sj):
            p=page(api=json.dumps({'enabled':True,'events':evs,'sources':[]}),sources=sj); return p.evaluate("GODASH.events().filter(e=>/^Trust Event/.test(e.name)).map(e=>e.name+'='+e.status)")
        s_fresh=statuses(api([src()],FRESH_FEED)); s_fail=statuses(api([src(state='failing',failStreak=5,lastError='x')],failed_feed)); s_stale=statuses(api([src(state='stale',lastOk=OKT-9*86400000)],stale_feed))
        check('trust: event statuses are identical whether the feed is fresh, stale or failing', s_fresh==s_fail==s_stale and len(s_fresh)==3, (s_fresh,s_fail,s_stale))
        check('trust: official, community and datamined are all still distinct', len(set(x.split('=')[1] for x in s_fresh))==3, s_fresh)
        # H. move data freshness, separate from the feed
        pg=fpage(api([src()],FRESH_FEED)); card=menu_card(pg)
        check('moves: shows generation date, source and the refresh command', 'Move types and Elite TM' in card and 'Generated' in card and 'PvPoke game master' in card and 'tools/refresh-moves.sh' in card and 'cross-checked with PokeMiners' in card, card)
        check('moves: says a missing Elite TM tag is not proof a move is unobtainable', 'does not prove a move cannot be obtained' in card)
        MV=json.load(open('public/moves.json'))
        old=json.loads(json.dumps(MV)); old['source']['generated']='2026-05-01T00:00:00Z'
        pg=page(sources=api([src()],FRESH_FEED),extra={'**/moves.json':(json.dumps(old),200)}); pg.wait_for_selector('#fresh-line:not([hidden])'); card=menu_card(pg)
        mrow=pg.evaluate("(()=>{const r=[...document.querySelectorAll('#srcbody .srcrow')].find(r=>/Move types/.test(r.innerText));return r.innerText})()")
        check('moves: an old generation date is labelled Stale while the event feed stays Fresh', 'Stale' in mrow and 'Older than 45 days' in mrow and 'Event feed refreshed' in pg.inner_text('#fresh-line'), mrow)
        nog=json.loads(json.dumps(MV)); nog['source'].pop('generated',None)
        pg=page(sources=api([src()],FRESH_FEED),extra={'**/moves.json':(json.dumps(nog),200)}); pg.wait_for_selector('#fresh-line:not([hidden])'); card=menu_card(pg)
        mrow=pg.evaluate("[...document.querySelectorAll('#srcbody .srcrow')].find(r=>/Move types/.test(r.innerText)).innerText")
        check('moves: a missing generation date reads Not recorded, not fresh', 'Not recorded' in mrow and 'Time not recorded' in mrow and 'Fresh' not in mrow, mrow)
        pg=page(sources=api([src()],FRESH_FEED),extra={'**/moves.json':('',404)}); pg.wait_for_selector('#fresh-line:not([hidden])'); card=menu_card(pg)
        check('moves: if the data did not load the card says so', 'Move data did not load' in card)
        # I. exchange rate tracked separately
        PR=json.load(open('private/prices.json' if __import__('os').path.exists('private/prices.json') else 'test/fixtures/private-prices.json')); stale_fx=json.loads(json.dumps(PR)); stale_fx['fx']['observed']='2026-10-01'
        pg=page(sources=api([src()],FRESH_FEED),pin=True,extra={'**/api/prices-private':(json.dumps(stale_fx),200)}); pg.wait_for_selector('#fresh-line:not([hidden])'); card=menu_card(pg)
        fxrow=pg.evaluate("[...document.querySelectorAll('#srcbody .srcrow')].find(r=>/Exchange rate/.test(r.innerText)).innerText")
        check('fx: an old rate is Stale on its own while the event feed and moves stay current', 'Stale' in fxrow and 'Older than 3 days' in fxrow and 'Event feed refreshed' in pg.inner_text('#fresh-line'), fxrow)
        pg=page(sources=api([src()],FRESH_FEED),pin=True,extra={'**/api/prices-private':(json.dumps(PR),200)}); card=menu_card(pg)
        fxrow=pg.evaluate("[...document.querySelectorAll('#srcbody .srcrow')].find(r=>/Exchange rate/.test(r.innerText)).innerText")
        check('fx: shows the date the rate was read and its source', '10 Oct 2026' in fxrow and 'Wise' in fxrow, fxrow)
        pg=page(sources=api([src()],FRESH_FEED)); card=menu_card(pg)
        check('private: without the owner PIN no Exchange rate row and no Rp prices anywhere', 'Exchange rate' not in pg.inner_text('#srcbody') and pg.locator('#storep-host').count()==0)
        # J. datamine clock
        pg=page(sources=api([src()],FRESH_FEED),extra={'**/api/datamine':(json.dumps({'checked':MS('2026-10-09T07:30:00+11:00'),'since':MS('2026-09-01T07:30:00+10:00'),'items':[],'posts':[]}),200)}); pg.wait_for_selector('#fresh-line:not([hidden])'); card=menu_card(pg)
        drow=pg.evaluate("[...document.querySelectorAll('#srcbody .srcrow')].find(r=>/Game files/.test(r.innerText)).innerText")
        check('datamine: own last-checked time, labelled Datamined, never counted as announced', '9 Oct, 7:30 am' in drow and 'datamined' in drow.lower() and 'never counted as announced' in drow.lower(), drow)
        # K. mobile move rows stay compact and readable
        pg=mk()
        h=pg.evaluate("[...document.querySelectorAll('#pvplist .drow')].slice(0,3).map(r=>Math.round(r.getBoundingClientRect().height))")
        check('mobile: PvP rows with three badged moves (one with Elite TM) stay compact', all(x<=112 for x in h), h)
        check('mobile: move names never overflow the screen', not pg.evaluate('document.documentElement.scrollWidth>innerWidth') and pg.evaluate("[...document.querySelectorAll('#pvplist .mvb')].every(m=>m.getBoundingClientRect().right<=innerWidth)"))
        check('mobile: Elite TM tag stays on the same line as its move name', pg.evaluate("[...document.querySelectorAll('#pvplist .mvb:has(.etm)')].every(m=>{const b=m.querySelector('b').getBoundingClientRect(),e=m.querySelector('.etm').getBoundingClientRect();return Math.abs(b.top+b.height/2-(e.top+e.height/2))<10})"))
        check('mobile: no row calls an untagged move unobtainable or legacy', not pg.evaluate("/unobtainable|legacy|cannot be obtained/i.test(document.getElementById('pvplist').innerText)"))
        check('no page errors in new views', pg.errs==[], pg.errs)
        # Dedicated PWA context: test the real service worker without the mocked API contexts above.
        # back button stays inside the app: detail closes first, other tabs go back to Now
        pg=page(); pg.click('nav.tabs button[data-tab="events"]'); pg.click('#subnav-events button[data-sub="timeline"]'); pg.wait_for_timeout(200)
        pg.evaluate("GODETAIL.open('cur:zorua')"); pg.wait_for_selector('#evd:not([hidden])'); pg.wait_for_timeout(200)
        pg.go_back(); pg.wait_for_timeout(300)
        check('Back closes the detail view and stays in the app', pg.evaluate("document.getElementById('evd').hidden") and pg.url.startswith(BASE) and pg.locator('#tab-events').is_visible())
        pg.go_back(); pg.wait_for_timeout(300)
        check('Back from another tab returns to Now', pg.locator('#tab-now').is_visible() and pg.url.startswith(BASE))
        pctx=b.new_context(viewport={'width':390,'height':844},timezone_id='Australia/Melbourne',locale='en-AU')
        pctx.set_default_timeout(10000)
        pctx.set_default_navigation_timeout(15000)
        ppg=pctx.new_page(); ppg.goto(BASE+'/',wait_until='domcontentloaded')
        ppg.wait_for_function("!!(navigator.serviceWorker && navigator.serviceWorker.controller)",timeout=15000)
        cached=ppg.evaluate("""async()=>{const names=(await caches.keys()).filter(n=>n.startsWith('gofn-shell-'));for(const name of names){const c=await caches.open(name);if(await c.match('/index.html'))return true;}return false;}""")
        check('PWA: service worker controls the app and caches the shell', cached, ppg.evaluate("caches.keys()"))
        pctx.set_offline(True)
        ppg.reload(wait_until='domcontentloaded',timeout=15000)
        check('PWA: app shell opens after network is disconnected', ppg.locator('h1').inner_text().strip().lower()=='go field notes', ppg.evaluate("({title:document.title,h1:document.querySelector('h1')&&document.querySelector('h1').innerText,url:location.href,controller:!!navigator.serviceWorker.controller})"))
        check('PWA: versioned app and local-state scripts execute offline',
              ppg.evaluate("!!window.GO && !!window.GOLOCAL && !!window.GONET && !!window.GO.dex()"),
              ppg.evaluate("({app:!!window.GO,localState:!!window.GOLOCAL,network:!!window.GONET})"))
        offline_cached=ppg.evaluate("""async()=>{for(const name of (await caches.keys()).filter(n=>n.startsWith('gofn-shell-'))){const c=await caches.open(name);if(await c.match('/offline.html'))return true;}return false;}""")
        check('PWA: human-readable offline fallback is precached', offline_cached)
        ppg.goto(BASE+'/__offline_app_shell_probe__',wait_until='domcontentloaded',timeout=15000)
        check('PWA: uncached offline navigation falls back to the app shell',
              ppg.locator('h1').inner_text().strip().lower()=='go field notes',
              ppg.evaluate("({title:document.title,h1:document.querySelector('h1')&&document.querySelector('h1').innerText,url:location.href})"))
        ppg.evaluate("""async()=>{for(const name of (await caches.keys()).filter(n=>n.startsWith('gofn-shell-'))){const c=await caches.open(name);await c.delete('/');await c.delete('/index.html');}}""")
        ppg.goto(BASE+'/__offline_fallback_probe__',wait_until='domcontentloaded',timeout=15000)
        check('PWA: offline page appears when the app shell is unavailable',
              ppg.title()=="You're offline · GO Field Notes" and ppg.locator('h1').inner_text().strip()=="You're offline",
              ppg.evaluate("({title:document.title,h1:document.querySelector('h1')&&document.querySelector('h1').innerText,url:location.href})"))
        pctx.close()

    if on('b'):
        # Batch 1: Today first screen. Clock is 2 Nov 2026 09:30 Melbourne, when many in-game and overseas in-person events are live.
        BATCH1_CLOCK = '2026-11-02T09:30:00+11:00'
        TARGETS_JS = """() => {
          const small = [];
          const visible = e => { for (let p = e; p; p = p.parentElement) { if (p.hidden || getComputedStyle(p).display === 'none' || getComputedStyle(p).visibility === 'hidden') return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
          document.querySelectorAll('#tab-now a[href], #tab-now button, #tab-now summary, #tab-now input, #tab-now select, #tab-now [role=button], .whatsnew a[href], .whatsnew button').forEach(e => {
            if (e.closest('[aria-hidden="true"], [inert]') || !visible(e)) return;
            const r = (e.tagName === 'INPUT' && e.closest('label') ? e.closest('label') : e).getBoundingClientRect(); // a checkbox's hit area is its label row
            if (r.width < 43.5 || r.height < 43.5) small.push(e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
          });
          return small;
        }"""
        seed_new = lambda pg: (pg.evaluate("localStorage.setItem('gofn-seen-events', JSON.stringify({ids:['seed-old-event'], at:1}))"), pg.reload(), pg.wait_for_selector('.whatsnew:not([hidden])', timeout=15000))
        # Keep the dismissal/reload test independent of whichever datamine posts happen to be current.
        b1 = page(clock=BATCH1_CLOCK, extra={
            '**/api/unreleased': (json.dumps({'changes': []}), 200),
            '**/api/datamine': (json.dumps({'items': [], 'posts': []}), 200),
            '**/datamine-news.json': (json.dumps({'items': []}), 200)
        })
        seed_new(b1)
        b1.wait_for_selector('#home-now .evc, #home-now .agr', state='attached')
        overflow = {}
        for width in (320, 375, 390, 430):
            b1.set_viewport_size({'width': width, 'height': 844}); b1.wait_for_timeout(120)
            overflow[width] = b1.evaluate("() => [document.documentElement.scrollWidth, innerWidth]")
        check('Today has no horizontal overflow at 320, 375, 390 and 430px (what\'s-new collapsed)',
              all(sw <= iw for sw, iw in overflow.values()), overflow)
        b1.set_viewport_size({'width': 390, 'height': 844}); b1.wait_for_timeout(120)
        row = b1.locator('.whatsnew').bounding_box()
        check('what\'s-new is one collapsed row of about 48px on Today with the list closed',
              row is not None and 44 <= row['height'] <= 56 and b1.locator('.wn-toggle').get_attribute('aria-expanded') == 'false' and b1.locator('.wn-body').is_hidden(), row)
        check('what\'s-new sits inside Today, below the daily brief',
              b1.evaluate("() => { const w=document.querySelector('.whatsnew'), t=document.getElementById('tab-now'), d=document.getElementById('day-brief'); return t.contains(w) && (d.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; }"))
        first = b1.evaluate("() => { const el=document.querySelector('#home-now .evc, #home-now .agr'); const r=el.getBoundingClientRect(); return {top:Math.round(r.top+scrollY), vh:innerHeight}; }")
        check('first event card starts inside the first screenful at 390px (above the bottom bar)',
              first['top'] < first['vh'] - 80, first)
        b1.set_viewport_size({'width': 320, 'height': 844}); b1.wait_for_timeout(120)
        first320 = b1.evaluate("() => { const el=document.querySelector('#home-now .evc, #home-now .agr'); return Math.round(el.getBoundingClientRect().top+scrollY); }")
        check('first event card starts inside the first screenful at 320px', first320 < 844 - 80, first320)
        tiles = b1.evaluate("() => [...document.querySelectorAll('.day-brief-stats span, .today-focus-card')].map(e => { const r=e.getBoundingClientRect(); const b=document.getElementById('day-brief-title').getBoundingClientRect(); return r.top >= b.bottom - 1 && r.right <= innerWidth && r.left >= 0; })")
        check('brief counts and tiles stack below the title at 320px without overlap', all(tiles) and len(tiles) == 6, tiles)
        b1.set_viewport_size({'width': 390, 'height': 844}); b1.wait_for_timeout(120)
        check('no interactive control on Today is under a 44x44 hit area (collapsed)', b1.evaluate(TARGETS_JS) == [], b1.evaluate(TARGETS_JS))
        # keyboard: toggle then Got it, Enter expands, links are real rows of 44px
        b1.locator('.wn-toggle').focus(); b1.keyboard.press('Tab')
        check('keyboard order is the toggle, then Got it', b1.evaluate("document.activeElement.classList.contains('wn-ok')"))
        b1.locator('.wn-toggle').focus(); b1.keyboard.press('Enter')
        check('Enter expands what\'s-new and exposes its links',
              b1.locator('.wn-toggle').get_attribute('aria-expanded') == 'true' and b1.locator('.wn-body').is_visible() and b1.locator('.wn-body a').count() >= 1)
        check('no interactive control on Today is under 44x44 with what\'s-new expanded', b1.evaluate(TARGETS_JS) == [], b1.evaluate(TARGETS_JS))
        link_colour = b1.evaluate("() => { const a=document.querySelector('.wn-body a'); const s=getComputedStyle(a); return [s.color, s.textDecorationLine]; }")
        check('what\'s-new links use the semantic link colour with no default underline', link_colour[0] != 'rgb(0, 0, 238)' and link_colour[1] == 'none', link_colour)
        b1.emulate_media(reduced_motion='reduce')
        check('what\'s-new chevron does not animate with reduced motion',
              b1.evaluate("() => getComputedStyle(document.querySelector('.wn-view'), '::after').transitionDuration") in ('0s', '0ms'))
        b1.locator('.wn-toggle').press('Enter')
        check('Enter collapses what\'s-new again', b1.locator('.wn-toggle').get_attribute('aria-expanded') == 'false' and b1.locator('.wn-body').is_hidden())
        # never on the other tabs
        shown_elsewhere = []
        for tab_id in ('events', 'raids', 'collect', 'saved'):
            btn = b1.locator('#tabs [data-tab="%s"]' % tab_id)
            if btn.count():
                btn.click(); b1.wait_for_timeout(80)
                if b1.locator('.whatsnew').is_visible(): shown_elsewhere.append(tab_id)
        check('what\'s-new is absent from the Schedule, Battle, Collection and Saved tabs', shown_elsewhere == [], shown_elsewhere)
        b1.locator('#tabs [data-tab="now"]').click()
        # dismissal persists across a reload and the 'seen' list is updated
        b1.locator('.wn-ok').click()
        check('Got it hides what\'s-new, stores the seen list and moves focus to the brief',
              b1.locator('.whatsnew').is_hidden() and b1.evaluate("document.activeElement && document.activeElement.id") == 'day-brief' and
              b1.evaluate("JSON.parse(localStorage.getItem('gofn-seen-events')).ids.length") > 5)
        b1.reload(); b1.wait_for_selector('#home-now .evc, #home-now .agr', state='attached'); b1.wait_for_timeout(1500)
        check('a dismissed what\'s-new stays dismissed after reload', b1.locator('.whatsnew:not([hidden])').count() == 0)
        check('no console or page errors on the Today first screen', b1.errs == [], b1.errs)
        # season / GO Pass: one compact strip below the agenda, rows are real 48px+ buttons
        season_strip = b1.evaluate("""() => { const bar=document.getElementById('seasonbar'); const h=document.getElementById('home-now'); const cards=[...bar.querySelectorAll('.ssn-card')]; return {after:(h.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING)>0, n:cards.length, minH:Math.min(...cards.map(c=>c.getBoundingClientRect().height)), bg:getComputedStyle(cards[0]).backgroundImage}; }""")
        check('season and GO Pass sit in one compact strip after today\'s agenda, with 48px+ rows and no gradient',
              season_strip['after'] and season_strip['n'] >= 1 and season_strip['minH'] >= 47.5 and season_strip['bg'] == 'none', season_strip)
        check('Today agenda reserves its space until the first render (layout-shift guard)',
              '#home-now:not([data-render-key]){min-height:' in DASH_CSS and ':has(#home-now:not([data-render-key]))' in DASH_CSS and 'EV_READY' in DASH_JS)
        b1.context.close()
        check('Today holds the space of everything that fills in late: footer below the fold while pending, freshness line, deadlines row, date and tab bar',
              all(token in DASH_CSS for token in ['#tab-now:has(#home-now:not([data-render-key]):not([data-state="unavailable"])){min-height:100vh;min-height:100svh}',
                                                  '.fresh-line[hidden]{display:flex!important;visibility:hidden}', '.fresh-line{display:flex;margin:-6px 0 6px;min-height:44px}',
                                                  '.day-brief:not([data-ready]):not([data-state="unavailable"]) .today-deadlines[hidden]{display:block!important;visibility:hidden;min-height:44px}',
                                                  '.fresh-line[hidden][data-released]{display:none!important}',
                                                  'header.top .date:empty::before', 'nav.tabs .row:empty{min-height:48px}']))
        # Cumulative layout shift of a cold Today load, summed over every shift (user input is not excluded: there is none). Measured un-throttled on purpose: the big
        # shifts (the footer jumping a screen when the agenda arrives, the freshness line and deadlines row growing, the date and tab bar filling in) happen at any speed, so
        # this is deterministic in CI. Batch 4 measured 0.62 (390px) and 1.09 (1280px) before the fix; Google's "good" threshold is 0.1. Throttled 20-run numbers are in docs/ROADMAP.md.
        CLS_OBSERVER = "window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())window.__cls+=e.value}).observe({type:'layout-shift',buffered:true})"
        for cls_w in (390, 1280):
            cpg = page(width=cls_w, mobile=cls_w < 500, pre=lambda p: p.add_init_script(CLS_OBSERVER))
            settle(cpg, "!!(window.GOFRESH&&window.GOFRESH.state().done&&window.GOINFOGRAPHIC&&window.GOEXTRA)")  # the late scripts and the freshness line are part of the load
            cpg.wait_for_timeout(1500)
            cls_val = cpg.evaluate("window.__cls")
            check('Today cold load at %dpx has a cumulative layout shift under 0.1' % cls_w, cls_val < 0.1, 'measured %.4f' % cls_val)
            cpg.context.close()

    if on('b'):
        # ---- Batch 2 regression guards: layout width, console cleanliness, touch targets (deterministic: fixed clock, mocked API/images/fonts) ----
        MAIN_TABS=[('now','Today'),('events','Schedule'),('raids','Raids'),('collect','Collection')]
        def open_tab(pg,tab):
            # dispatch_event, not a pointer click: while Schedule overflows at 320px the displaced nav intercepts real taps (the layout bug is asserted below instead)
            pg.dispatch_event('nav.tabs button[data-tab="%s"]'%tab,'click'); pg.wait_for_selector('#tab-%s:not([hidden])'%tab)
            pg.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
        # 1. responsive width loop: no horizontal overflow and no zoomed-out layout viewport on any main tab
        guard=[]
        for width in (320,375,390,430,820,1280):
            wpg=page(width=width,height=844 if width<500 else 1000,mobile=width<500,guard=guard if width in (390,1280) else None)
            for tab,label in MAIN_TABS:
                open_tab(wpg,tab)
                m=wpg.evaluate("""() => {
                    const cw=window.visualViewport.width, wide=[];
                    const clipped=el=>{ for(let n=el.parentElement;n&&n!==document.body;n=n.parentElement){ const o=getComputedStyle(n).overflowX; if(o!=='visible') return true; } return false; };
                    document.querySelectorAll('main *').forEach(el=>{ const r=el.getBoundingClientRect(); if(r.width>0&&r.right>cw+1&&!clipped(el)) wide.push([Math.round(r.right),(el.closest('[data-id]')||{getAttribute:()=>''}).getAttribute('data-id')+' '+el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\\s+/).join('.'):'')]); });
                    wide.sort((x,y)=>y[0]-x[0]); wide.length=Math.min(wide.length,4);
                    return {sw:document.documentElement.scrollWidth,iw:window.innerWidth,vw:window.visualViewport.width,wide};
                }""")
                over=m['sw']>m['iw'] or abs(m['vw']-m['iw'])>0.5
                check('width %d, %s: no horizontal overflow and visual viewport equals window width'%(width,label),not over,m)
            wpg.context.close()
        # 1b. Schedule under fixed clocks with and without a live .evc.cmp card (data-dependent footer overflow vs the 7-day strip alone), plus the week strip itself
        for clock_name,clock,want_cmp in (('no live card (Sun 20 Dec)','2026-12-20T10:00:00+11:00',False),('live card (Fri 9 Oct)','2026-10-09T22:45:00+11:00',True)):
            for width in (320,375,390,430):
                spg=page(clock=clock,width=width,height=844,mobile=True)
                open_tab(spg,'events')
                m=spg.evaluate("""() => {
                    const cw=window.visualViewport.width, wide=[];
                    const clipped=el=>{ for(let n=el.parentElement;n&&n!==document.body;n=n.parentElement){ if(getComputedStyle(n).overflowX!=='visible') return true; } return false; };
                    document.querySelectorAll('main *').forEach(el=>{ const r=el.getBoundingClientRect(); if(r.width>0&&r.right>cw+1&&!clipped(el)) wide.push([Math.round(r.right),el.tagName.toLowerCase()+'.'+String(el.className).trim().split(/\\s+/).join('.')]); });
                    const days=[...document.querySelectorAll('#weekstrip .wd')].map(d=>d.getBoundingClientRect()), strip=document.querySelector('#weekstrip').getBoundingClientRect();
                    const feet=[...document.querySelectorAll('#tab-events .evc.cmp .evc-foot > *, #tab-events .evc.cmp .evc-top > .hide-x')].map(e=>e.getBoundingClientRect());
                    return {sw:document.documentElement.scrollWidth,iw:window.innerWidth,vw:cw,wide:wide.slice(0,3),days:days.length,dayMinW:Math.min(...days.map(r=>r.width)),dayMinH:Math.min(...days.map(r=>r.height)),
                            stripRight:strip.right,cmp:document.querySelectorAll('#tab-events .evc.cmp').length,
                            feetInside:feet.every(r=>r.right<=cw+0.5&&r.height>=43.5)};
                }""")
                tag='Schedule %s, %dpx'%(clock_name,width)
                check(tag+': no horizontal overflow, viewport equals window',m['sw']<=m['iw'] and abs(m['vw']-m['iw'])<=0.5 and not m['wide'],m)
                check(tag+': all 7 days exist, are 44px+ in both directions and the week strip stays inside the screen',m['days']==7 and m['dayMinH']>=43.5 and m['dayMinW']>=43.5 and m['stripRight']<=m['vw']+0.5,m)
                check(tag+': %s live card on this clock, and its Details, infographic, star and hide controls are inside the card and 44px high'%('a' if want_cmp else 'no'),(m['cmp']>0)==want_cmp and m['feetInside'],m)
                spg.context.close()
        # 2. console guard: Today/Schedule/Raids/Collection loads at 390 and 1280 must be free of console errors, page errors and failed requests.
        # Fonts and R2 pictures are mocked in page(), so they need no allow-list. The only known-benign noise is the browser's own
        # "Failed to load resource" line for /api/* calls that the static test server (or an explicit mock) answers with 404/401.
        BENIGN_API=r'^%s/api/(art|dex|datamine|guide|ig-decisions|places-private|pvp|shinies|unreleased|userstate|venue-times|world)(\?|$)'%re.escape(BASE)
        def benign(g):
            kind,text,url=g
            return kind=='console.error' and re.match(r'^Failed to load resource: the server responded with a status of (404|401)\b',text) is not None and re.match(BENIGN_API,url) is not None
        unexpected=[g for g in guard if not benign(g)]
        check('console guard: no console errors, page errors or failed requests on Today, Schedule, Raids and Collection (only the listed mocked /api 404s are tolerated)',not unexpected,unexpected[:5])
        probe_log=[]; probe=page(guard=probe_log)
        probe.evaluate("console.error('guard self-test'); queueMicrotask(()=>{throw new Error('guard self-test')})"); settle(probe,"true"); probe.wait_for_timeout(100)
        check('console guard self-test: an injected console.error and page error are caught and not tolerated',
              any(g[0]=='console.error' and not benign(g) for g in probe_log) and any(g[0]=='pageerror' and not benign(g) for g in probe_log),probe_log[:6])
        probe.context.close()

        # 3. touch targets at 390px: visible interactive elements under 44x44. Known offenders live in a committed baseline (the debt list for later
        # batches); they only produce NOTE lines. A NEW offender (selector not in the baseline) fails. Regenerate with UI_TOUCH_BASELINE=update.
        TT_FILE=ROOT/'test'/'fixtures'/'touch-targets-baseline.json'
        TT_JS=r"""() => {
          const sel = el => {
            const cls=[...el.classList].filter(c=>!/\d/.test(c)).slice(0,2).map(c=>'.'+c).join('');
            const attrs=[...el.attributes].map(a=>a.name).filter(n=>n.startsWith('data-')||n==='role').slice(0,2).map(n=>'['+n+']').join('');
            let scope=''; for(let n=el.parentElement;n&&n!==document.body;n=n.parentElement){ if(n.id){ scope='#'+n.id+' '; break; } }
            if(!scope){ const n=el.closest('footer,header,nav,[class]:not(body)'); if(n&&n!==el) scope=n.tagName.toLowerCase()+([...n.classList].filter(c=>!/\d/.test(c))[0]?'.'+[...n.classList].filter(c=>!/\d/.test(c))[0]:'')+' '; }
            return scope+el.tagName.toLowerCase()+cls+attrs;
          };
          const out={};
          document.querySelectorAll('a[href],button,[role=button],input:not([type=hidden]),summary,select,textarea,[tabindex]').forEach(el=>{
            if(el.tagName!=='A'&&el.tagName!=='BUTTON'&&el.tabIndex<0&&!el.matches('input,summary,select,textarea,[role=button]')) return;
            if(el.disabled) return;
            if(el.closest('[inert]')) return;  // inert subtrees (the legacy #prio test hook) cannot be focused or tapped, so they are not touch targets
            // A checkbox or radio inside (or for) a <label> is tapped through the label, so the label is its hit area.
            const lab=(el.matches('input[type=checkbox],input[type=radio]')&&el.labels&&el.labels[0])||null;
            const r=(lab||el).getBoundingClientRect(), cs=getComputedStyle(el);
            if(r.width<=0||r.height<=0||cs.visibility!=='visible') return;
            const w=Math.round(r.width), h=Math.round(r.height);
            if(w>=44&&h>=44) return;
            const k=sel(el), o=out[k]||(out[k]={selector:k,w,h,count:0,e:((el.getAttribute('aria-label')||el.textContent||el.getAttribute('name')||el.id||'').trim().replace(/\\s+/g,' ')).slice(0,40)});
            o.count++; o.w=Math.min(o.w,w); o.h=Math.min(o.h,h);
          });
          return Object.values(out);
        }"""
        tt_page=page(width=390,mobile=True)
        found={}
        for tab,label in MAIN_TABS:
            open_tab(tt_page,tab)
            for o in tt_page.evaluate(TT_JS):
                f=found.setdefault(o['selector'],{'selector':o['selector'],'size':'%dx%d'%(o['w'],o['h']),'e.g.':o['e'],'tabs':[],'count':0})
                f['tabs'].append(tab); f['count']=max(f['count'],o['count'])
        tt_page.context.close()
        if os.environ.get('UI_TOUCH_BASELINE')=='update':
            TT_FILE.parent.mkdir(exist_ok=True)
            TT_FILE.write_text(json.dumps({'about':'Visible interactive elements smaller than 44x44 CSS px at 390px wide on Today, Schedule, Raids and Collection. Debt list: shrink it, never grow it. Regenerate with UI_TOUCH_BASELINE=update python3 test/ui_checks.py (UI_SHARD=b).','viewport':390,'entries':sorted(found.values(),key=lambda e:e['selector'])},indent=1,ensure_ascii=False)+'\n')
        base=json.loads(TT_FILE.read_text())['entries'] if TT_FILE.exists() else []
        base_sel={e['selector'] for e in base}
        new=[f for k,f in found.items() if k not in base_sel]
        gone=[e['selector'] for e in base if e['selector'] not in found]
        print('NOTE touch targets: %d known undersized selectors (baseline %d)%s'%(len(found)-len(new),len(base),'; fixed since baseline (remove from file): '+', '.join(gone[:10]) if gone else ''))
        check('touch targets: no new undersized (<44x44) interactive elements at 390px beyond the committed baseline',not new,[(n['selector'],n['size'],n['tabs']) for n in new[:8]])

        # 4. contrast of every visible enabled action pill (and the what's-new "Got it") against its effective background (opacity included): >= 4.5:1.
        # Covers the four tabs, the Menu sync/settings panel and the owner infographic review screen (dark theme, the shipped design).
        PILL_JS=r"""() => {
  const parse = c => {
    let m = c.match(/^rgba?\(([^)]+)\)$/);
    if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = c.match(/^color\(srgb ([^)]+)\)$/);
    if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    return [0, 0, 0, 0];
  };
  const over = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); if (a <= 0) return [0, 0, 0, 0]; return [0, 1, 2].map(i => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a); };
  const mix = (c, back, o) => [0, 1, 2].map(i => c[i] * o + back[i] * (1 - o)).concat(1);
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const backdrop = el => { const chain = []; for (let n = el.parentElement; n; n = n.parentElement) chain.push(parse(getComputedStyle(n).backgroundColor)); let c = [0, 0, 0, 1]; for (let i = chain.length - 1; i >= 0; i--) c = over(chain[i], c); return c; };
  const out = [];
  document.querySelectorAll('button.pill, a.pill, .wn-ok').forEach(el => {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width <= 0 || r.height <= 0 || cs.visibility !== 'visible' || (el.checkVisibility && !el.checkVisibility())) return;
    let o = 1; for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    const back = backdrop(el);
    const ownBg = over(parse(cs.backgroundColor), back);
    const fg = over(parse(cs.color), ownBg);
    const bgF = mix(ownBg, back, o), fgF = mix(fg, back, o);
    const ratioV = ratio(fgF, bgF);
    out.push({ text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40), cls: el.className, ratio: Math.round(ratioV * 100) / 100, opacity: o, fg: cs.color, bg: cs.backgroundColor });
  });
  return out;
}"""
        queue_fx=json.dumps({'items':[{'id':'discord:contrast-fixture','title':'Contrast review fixture','image':'/infographics/contrast-fixture.png','source':'discord','publishedAt':'2026-11-01T00:00:00Z','guesses':[]}]})
        cpg=page(pin=True,mobile=True,extra={'**/infographic-queue.json*':(queue_fx,200),'**/api/ig-decisions':(json.dumps({'decisions':[]}),200),'**/api/auth/users':(json.dumps({'users':[]}),200)})
        cpg.wait_for_function("document.documentElement.getAttribute('data-role')==='owner' && !document.getElementById('hireview').hidden",timeout=10000)
        pill_rows=[]
        def grab_pills(where):
            for r in cpg.evaluate(PILL_JS): r['where']=where; pill_rows.append(r)
        grab_pills('Today')
        for tab_id,tab_label in MAIN_TABS[1:]:
            open_tab(cpg,tab_id); grab_pills(tab_label)
        cpg.click('#hmenu'); cpg.wait_for_selector('#sub-menu:not([hidden])')
        cpg.evaluate("document.querySelectorAll('#sub-menu details').forEach(d=>d.open=true)"); cpg.wait_for_timeout(300)
        grab_pills('Menu sync and settings')
        if cpg.locator('#hireview').is_visible():
            cpg.click('#hireview'); cpg.wait_for_selector('#igreview:not([hidden])'); cpg.wait_for_timeout(300)
        grab_pills('Infographic review')
        names={r['text'] for r in pill_rows}
        check('contrast: pills were found on all four tabs, the sync panel and the review screen (Approve, Discard, This week, Month, Sync & account settings, Got it)',
              len({r['where'] for r in pill_rows})>=5 and all(any(n in t for t in names) for n in ('Approve','Discard','This week','Month overview','Sync & account settings','Got it')),sorted(names)[:30])
        low=[(r['where'],r['text'],r['ratio']) for r in pill_rows if r['ratio']<4.5]
        check('contrast: every visible enabled button.pill (and Got it) is at least 4.5:1 against its effective background, opacity included',not low,low[:8])
        check('no pill carries a blanket opacity while enabled',all(r['opacity']>=0.999 for r in pill_rows),[(r['text'],r['opacity']) for r in pill_rows if r['opacity']<0.999][:5])
        cpg.context.close()
    if on('c'):
        # ---- Batch 1b: Today stays usable when the live event feed or dash.js is slow, stalled or failing (real browser, not a string grep) ----
        RB_CLOCK = '2026-11-02T09:30:00+11:00'
        LIVE_FEED = json.dumps({'enabled': True, 'events': [ev('rb%d' % i, 'Robust event %d' % i, 'event', '2026-11-01T10:00:00', '2026-11-08T20:00:00', 'confirmed') for i in range(12)]})
        TODAY_STATE_JS = """() => {
          const shown = e => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
          const h = document.getElementById('home-now'), stats = document.getElementById('day-brief-stats'), brief = document.getElementById('day-brief');
          return { keyed: h.hasAttribute('data-render-key'), height: Math.round(h.getBoundingClientRect().height), text: h.innerText.trim(), cards: h.querySelectorAll('.evc, .agr, .today-empty').length,
            briefShown: shown(brief), statsShown: shown(stats) && getComputedStyle(stats).visibility !== 'hidden', statsText: stats.innerText.replace(/\\s+/g, ' '), title: document.getElementById('day-brief-title').innerText,
            seasonShown: shown(document.getElementById('seasonbar')), weekShown: shown(document.getElementById('week')), netbar: (document.getElementById('netbar') || {}).innerText || '' };
        }"""
        held = []
        def hang(route, request=None): held.append(route)  # never answers until the test fulfils it
        def hang_feed(pg): pg.route('**/api/events', hang)
        def block_script(pg): pg.route(re.compile(r'/dash\.js'), lambda route, request=None: route.abort())
        # 1. the feed never answers
        rb = page(clock=RB_CLOCK, pre=hang_feed, ready=False)
        rb.wait_for_function("document.getElementById('home-now') && document.getElementById('home-now').offsetHeight > 0")
        early = rb.evaluate(TODAY_STATE_JS)
        check('stalled feed: before the timeout Today shows a reserved skeleton and no 0 / 0 / 0 counts as data', not early['keyed'] and early['height'] >= 300 and not early['statsShown'], early)
        ok = settle(rb, "document.getElementById('home-now').hasAttribute('data-render-key')", 12000)
        stalled = rb.evaluate(TODAY_STATE_JS)
        check('stalled feed: within 12 s Today renders the curated list (cards, not a blank box)', ok and stalled['cards'] >= 1 and stalled['height'] > 150, stalled)
        check('stalled feed: the sections the blank-state rule hides are visible again', stalled['seasonShown'] and stalled['weekShown'], stalled)
        check('stalled feed: the brief shows real counts and the stale-copy notice appears', stalled['statsShown'] and 'in game' in stalled['statsText'] and stalled['title'] != 'Getting your day ready' and 'saved copy' in stalled['netbar'], stalled)
        shot_dir = os.environ.get('UI_SHOTS')
        if shot_dir: rb.screenshot(path=shot_dir + '/stalled-after-timeout.png')
        # ... and a late answer is not thrown away
        held[0].fulfill(body=LIVE_FEED, content_type='application/json') if held else None
        late = settle(rb, "/source pipeline/.test(document.getElementById('evsource').textContent) && document.getElementById('netbar').hidden", 8000)
        check('stalled feed: a live answer that arrives after the timeout replaces the fallback and clears the notice', late, rb.evaluate("[document.getElementById('evsource').textContent, document.getElementById('netbar').hidden]"))
        rb.context.close()
        # 2. a 500 and a dropped connection still fall back to the curated list.
        # The season banner is an independent async feed: assert Today is usable first,
        # then wait for that feed before checking its banner (fast failures must not
        # make this test sample the banner before season.js has finished).
        for label, handler in (('500', lambda route, request=None: route.fulfill(status=500, body='{}', content_type='application/json')), ('network error', lambda route, request=None: route.abort())):
            fb = page(clock=RB_CLOCK, pre=lambda pg, h=handler: pg.route('**/api/events', h), ready=False)
            ok = settle(fb, "document.getElementById('home-now').hasAttribute('data-render-key')", 6000)
            st = fb.evaluate(TODAY_STATE_JS)
            check('feed %s: Today falls back to the curated list with the saved-copy notice before the season feed is ready' % label, ok and st['cards'] >= 1 and st['statsShown'] and 'saved copy' in st['netbar'], st)
            season_ready = settle(fb, "!!document.querySelector('#seasonbar .ssn-card')", 8000)
            st = fb.evaluate(TODAY_STATE_JS)
            check('feed %s: the independent active season banner appears when its data is ready' % label, season_ready and st['seasonShown'], st)
            fb.context.close()
        # 3. dash.js blocked, then stalled: a neutral status row with a 44px Retry, never a blank box
        for label, handler in (('fails to load', lambda route, request=None: route.abort()), ('never loads', hang)):
            held.clear()
            dp = page(clock=RB_CLOCK, pre=lambda pg, h=handler: pg.route(re.compile(r'/dash\.js'), h), ready=False)
            ok = settle(dp, "!!document.getElementById('today-retry')", 12000)
            st = dp.evaluate(TODAY_STATE_JS)
            retry_box = dp.locator('#today-retry').bounding_box() if ok else None
            check('dash.js %s: within 12 s Today shows a status row with a 44px Retry instead of a blank box' % label, ok and retry_box and retry_box['height'] >= 43.5 and 0 < st['height'] < 200 and 'did not load' in st['text'] and not st['briefShown'], [st, retry_box])
            if shot_dir and label == 'fails to load': dp.screenshot(path=shot_dir + '/dash-failed.png')
            dp.unroute(re.compile(r'/dash\.js'))  # the network comes back
            dp.locator('#today-retry').click()
            back = settle(dp, "document.getElementById('home-now').hasAttribute('data-render-key') && !document.getElementById('today-retry')", 12000)
            check('dash.js %s: Retry brings Today back once the script can load' % label, back and dp.evaluate(TODAY_STATE_JS)['cards'] >= 1)
            dp.context.close()
        # 4. what's-new: a stalled session must not wipe the seen list (the next visit would call every event new)
        wn = page(clock=RB_CLOCK, us=None)
        seen_before = wn.evaluate("JSON.parse(localStorage.getItem('gofn-seen-events')).ids")
        check('what\'s-new: a normal first visit records the event list', len(seen_before) >= 10, len(seen_before))
        wn.route('**/api/events', hang); wn.reload(wait_until='domcontentloaded')
        wn.clock.run_for(25000)  # past the feed timeout and past whatsnew's 20 s wait
        wn.wait_for_function("document.getElementById('home-now').hasAttribute('data-render-key')")
        wn.wait_for_timeout(300)
        seen_after = wn.evaluate("JSON.parse(localStorage.getItem('gofn-seen-events')).ids")
        check('what\'s-new: the seen list survives a session whose feed stalled', seen_after == seen_before, [len(seen_before), len(seen_after)])
        wn.unroute('**/api/events', hang); wn.reload(wait_until='load')
        wn.wait_for_function("document.getElementById('home-now').hasAttribute('data-render-key')"); wn.wait_for_timeout(500)
        headings = wn.evaluate("[...document.querySelectorAll('.whatsnew .wn-h')].map(e => e.textContent)")
        check('what\'s-new: after the next normal load no event is falsely listed as new', 'New events' not in headings, headings)
        wn.context.close()
        # 5. empty day: one calm line instead of 0 / 0 / 0; no decorative aria-label on the counts; "Got it" keeps its visible name
        ed = page(clock='2027-09-15T03:00:00+10:00')
        st = ed.evaluate(TODAY_STATE_JS)
        check('empty day: the brief says so in one calm line instead of three zeros', ed.locator('#day-brief-empty').is_visible() and not st['statsShown'] and 'Nothing' in ed.locator('#day-brief-empty').inner_text(), st)
        ed.context.close()
        ar = page(clock=RB_CLOCK)
        ar.evaluate("localStorage.setItem('gofn-seen-events', JSON.stringify({ids:['seed-old-event'], at:1}))"); ar.reload(); ar.wait_for_selector('.whatsnew:not([hidden])', timeout=15000)
        check('the brief counts carry no decorative aria-label and "Got it" has no label that replaces its visible text',
              ar.get_attribute('#day-brief-stats', 'aria-label') is None and ar.get_attribute('.wn-ok', 'aria-label') is None and ar.locator('.wn-ok').inner_text().strip() == 'Got it')
        ar.context.close()
        # ---- Batch 5: follow-ups to #258 / #261 (late answers, focus, live regions, reserved space) ----
        b5_held = {}
        def hold(*pats):
            def pre(pg):
                for pat in pats: pg.route(pat, lambda route, request=None, k=pat: b5_held.setdefault(k, []).append(route))
            return pre
        def b5_release(pat, body=None, status=200):
            for r in b5_held.pop(pat, []):
                if body is None: r.continue_()
                else: r.fulfill(status=status, body=body, content_type='application/json')
        def b5_wait_held(n, ms=8000):
            t = 0
            while sum(len(v) for v in b5_held.values()) < n and t < ms: la_pg.wait_for_timeout(100); t += 100
        DEX_FILE, CPP_FILE, CPM_FILE = (ROOT / 'public' / 'dex.json').read_text(), (ROOT / 'public' / 'data' / 'cp' / 'pokemon.json').read_text(), (ROOT / 'public' / 'data' / 'cp' / 'cp-multipliers.json').read_text()
        # A. dex and CP data that arrive after the 8 s wait are applied (no reload), and nothing else is lost
        b5_held.clear()
        la_pg = page(clock=RB_CLOCK, pre=hold('**/dex.json', '**/data/cp/pokemon.json', '**/data/cp/cp-multipliers.json'), ready=False)
        b5_wait_held(3); la_pg.clock.run_for(9000)
        la_ok = settle(la_pg, "document.getElementById('home-now').hasAttribute('data-render-key')", 12000)
        la_pg.evaluate("document.getElementById('evq').value = 'abc'")
        la_before = la_pg.evaluate("({opts: document.querySelectorAll('#followdl option').length, dex: Object.keys(GODASH.DEXBY).length, cp: GODASH.hundoPair({kind:'raid'},{name:'Bulbasaur'})})")
        check('late dex/CP: Today renders without them after the timeout (nothing yet in the follow list or CP)', la_ok and la_before['opts'] == 0 and la_before['dex'] == 0 and la_before['cp'] is None, la_before)
        b5_release('**/dex.json', DEX_FILE); b5_release('**/data/cp/pokemon.json', CPP_FILE); b5_release('**/data/cp/cp-multipliers.json', CPM_FILE)
        la_done = settle(la_pg, "document.querySelectorAll('#followdl option').length > 500 && !!GODASH.hundoPair({kind:'raid'},{name:'Bulbasaur'})", 10000)
        la_after = la_pg.evaluate("({opts: document.querySelectorAll('#followdl option').length, dex: Object.keys(GODASH.DEXBY).length, cp: GODASH.hundoPair({kind:'raid'},{name:'Bulbasaur'}), q: document.getElementById('evq').value, keyed: document.getElementById('home-now').hasAttribute('data-render-key')})")
        check('late dex/CP: when they arrive the follow list, Pokémon names and CP are filled in without a reload, and typed state is kept', la_done and la_after['dex'] > 500 and la_after['q'] == 'abc' and la_after['keyed'], la_after)
        la_pg.context.close()
        # D. the final state follows the final answer; B. a late render does not detach the open sheet's opener; C. "Got it" stays dismissed
        LEAKS = json.dumps({'changes': [{'n': 'Testmon', 'to': 'Released', 'at': 1793500000000}]})  # 2 Nov 2026, inside the 7-day window
        for label, late_body, late_status, want in (('feed switched off', '{"enabled":false,"events":[]}', 200, 'curated'), ('fewer than 10 events', json.dumps({'enabled': True, 'events': [ev('few%d' % i, 'Few %d' % i, 'event', '2026-11-01T10:00:00', '2026-11-08T20:00:00', 'confirmed') for i in range(3)]}), 200, 'curated'), ('still failing', '{}', 500, 'degraded'), ('usable list', LIVE_FEED, 200, 'live')):
            b5_held.clear()
            fs = page(clock=RB_CLOCK, pre=hold('**/api/events'), ready=False)
            la_pg = fs; b5_wait_held(1); fs.clock.run_for(9000)
            settle(fs, "document.getElementById('home-now').hasAttribute('data-render-key')", 12000)
            was = fs.evaluate("GODASH.eventsState()")
            b5_release('**/api/events', late_body, late_status); fs.wait_for_timeout(800)
            now_state = fs.evaluate("GODASH.eventsState()")
            check('late feed (%s): state starts degraded and ends %s' % (label, want), was == 'degraded' and now_state == want, [was, now_state])
            fs.context.close()
        # B + C on one stalled page that has a "N new" note
        b5_held.clear()
        bc = page(clock=RB_CLOCK, pre=hold('**/api/events'), extra={'**/api/unreleased': (LEAKS, 200)}, ready=False)
        la_pg = bc; b5_wait_held(1); bc.wait_for_timeout(1500); bc.clock.run_for(9000)
        settle(bc, "document.getElementById('home-now').hasAttribute('data-render-key')", 12000)
        bc.clock.run_for(20000)
        wn_shown = settle(bc, "!!document.querySelector('.whatsnew:not([hidden]) .wn-ok')", 8000)
        check('degraded Today still shows the leaks note (precondition for "Got it")', wn_shown)
        bc.click('.wn-ok'); bc.wait_for_timeout(200)
        # B: open a card, let the late feed arrive while the sheet is open
        opener = bc.locator('#home-now [data-open]').first
        opener_id = opener.get_attribute('data-open'); opener_handle = opener.element_handle()
        opener.click()
        sheet_up = settle(bc, "!!document.querySelector('#evd:not([hidden])')", 8000)
        b5_release('**/api/events', LIVE_FEED)
        settle(bc, "GODASH.eventsState()==='live'", 8000); bc.wait_for_timeout(500)
        still_there = opener_handle.evaluate("e => e.isConnected")
        check('B: a late live answer does not replace the card behind an open event sheet', sheet_up and still_there)
        bc.click('#evd-x'); bc.wait_for_timeout(400)
        foc = bc.evaluate("({tag: document.activeElement.tagName, inHome: !!document.activeElement.closest('#home-now'), id: document.activeElement.id})")
        check('B: closing the sheet after a late render leaves focus inside Today, not on the page body', foc['inHome'] and foc['tag'] != 'BODY', foc)
        if shot_dir: bc.screenshot(path=shot_dir + '/b-after-close.png')
        # B fallback: the opener has vanished for good -> focus goes to the Today list itself
        bc.locator('#home-now [data-open]').first.click(); settle(bc, "!!document.querySelector('#evd:not([hidden])')", 8000)
        bc.evaluate("document.querySelectorAll('#home-now [data-open]').forEach(e => e.remove())")
        bc.click('#evd-x'); bc.wait_for_timeout(300)
        foc2 = bc.evaluate("({tag: document.activeElement.tagName, id: document.activeElement.id})")
        check('B: if the opener card is gone for good, focus falls back to the Today list, not the body', foc2['id'] == 'home-now', foc2)
        # C: the late live list arrived after "Got it": the note must not come back
        gone = bc.evaluate("(() => { const b = document.querySelector('.whatsnew'); return !b || b.hidden || !b.querySelector('.wn-toggle'); })()")
        check('C: after "Got it" a late live list does not re-mount the "N new" note this session', gone, bc.evaluate("(document.querySelector('.whatsnew')||{}).outerHTML"))
        bc.context.close()
        # E. the unavailable row is announced (live region empty first), and Retry focus survives a late dash.js
        def hold_dash(pg):
            pg.route(re.compile(r'/dash\.js'), lambda route, request=None: b5_held.setdefault('dash', []).append(route))
        b5_held.clear()
        ep = page(clock=RB_CLOCK, pre=hold_dash, ready=False)
        la_pg = ep; b5_wait_held(1)
        dash_held = bool(b5_held.get('dash'))
        check('E: dash.js request is held before the retry row is focused', dash_held)
        ep.clock.run_for(11000)
        row = settle(ep, "!!document.getElementById('today-retry')", 8000)
        txt = settle(ep, "/did not load/.test(document.querySelector('.today-status p').textContent)", 5000)
        check('E: the unavailable row is an error announced on insertion (role=alert), not a status region inserted with its text', row and txt and ep.get_attribute('.today-status', 'role') == 'alert', ep.get_attribute('.today-status', 'role'))
        # F (error state): no 44px hole for the freshness line when Today could not load
        hole = ep.evaluate("({fresh: Math.round(document.getElementById('fresh-line').getBoundingClientRect().height), brief: Math.round(document.getElementById('day-brief').getBoundingClientRect().height)})")
        check('F: when Today failed to load, no invisible 44px hole is left for the freshness line or the brief', hole['fresh'] == 0 and hole['brief'] == 0, hole)
        if shot_dir: ep.screenshot(path=shot_dir + '/e-unavailable.png')
        ep.focus('#today-retry')
        retry_focused = ep.evaluate("document.activeElement && document.activeElement.id === 'today-retry'")
        check('E: Retry receives keyboard focus before the late dashboard script is released', retry_focused)
        b5_release('dash')
        back = settle(ep, "document.getElementById('home-now').hasAttribute('data-render-key') && !document.getElementById('today-retry')", 12000)
        foc3 = ep.evaluate("({tag: document.activeElement.tagName, inHome: !!document.activeElement.closest('#home-now')})")
        check('E: when dash.js arrives late and replaces the row, focus moves to the replacement instead of the body', back and foc3['inHome'] and foc3['tag'] != 'BODY', foc3)
        # Later asynchronous data and state refreshes can force Today to rebuild again.
        ep.evaluate("window.GODASH.renderAll()")
        foc4 = ep.evaluate("({tag: document.activeElement.tagName, inHome: !!document.activeElement.closest('#home-now'), id: document.activeElement.id})")
        check('E: a subsequent Today refresh preserves focus inside the rebuilt agenda', foc4['inHome'] and foc4['tag'] != 'BODY', foc4)
        ep.context.close()
        # F. a stalled /api/sources releases the reserved freshness space after 8 s and still fills in later
        b5_held.clear()
        fr = page(clock=RB_CLOCK, pre=hold('**/api/sources'), ready=False)
        la_pg = fr; settle(fr, "document.getElementById('home-now').hasAttribute('data-render-key')", 12000); fr.wait_for_timeout(1000)
        fr.clock.run_for(3000)
        h_early = fr.evaluate("Math.round(document.getElementById('fresh-line').getBoundingClientRect().height)")
        fr.clock.run_for(9000)
        h_late = fr.evaluate("Math.round(document.getElementById('fresh-line').getBoundingClientRect().height)")
        check('F: the freshness line keeps its 44px while waiting, then gives the space back after 8 s of silence', h_early >= 43 and h_late == 0, [h_early, h_late])
        b5_release('**/api/sources', '{"environment":"production","database":true,"enabled":false,"sources":[]}')
        filled = settle(fr, "(() => { const e = document.getElementById('fresh-line'); return !e.hidden && !e.hasAttribute('data-released') && e.getBoundingClientRect().height >= 32; })()", 8000)
        check('F: a late /api/sources answer still fills the freshness line', filled)
        fr.context.close()
        # ---- Batch 6: follow-ups to #263 (deferred Today render keeps its force flag, freshness release counted from page start, close focus needs a visible host) ----
        B6_FEED = json.dumps({'enabled': True, 'events': [ev('b6mon', 'Bulbasaur Day', 'event', '2026-11-02T08:00:00', '2026-11-02T20:00:00', 'confirmed', [{'name': 'Bulbasaur', 'role': 'featured'}])] + [ev('b6x%d' % i, 'Filler event %d' % i, 'event', '2026-11-01T10:00:00', '2026-11-08T20:00:00', 'confirmed') for i in range(11)]})
        b5_held.clear()
        d6 = page(clock=RB_CLOCK, marks={'have': {}, 'hundo': {}, 'm': {'own': {'25': 1}}}, gens=[1], extra={'**/api/events': (B6_FEED, 200)}, pre=hold('**/dex.json'), ready=False)
        la_pg = d6; b5_wait_held(1); d6.clock.run_for(9000)
        settle(d6, "document.getElementById('home-now').hasAttribute('data-render-key')", 12000)
        B6_CARD = "(() => { const c = document.querySelector('#home-now [data-id=\"leekduck:b6mon\"]'); return !c ? 'gone' : c.__b6 ? 'old' : 'new'; })()"
        B6_OLD = "(() => { const c = document.querySelector('#home-now [data-id=\"leekduck:b6mon\"]'); if (!c) return 'gone'; c.__b6 = 1; return 'tagged'; })()"
        d6_before = d6.evaluate(B6_OLD)  # tag the rendered card node: a re-render of #home-now replaces it, so the tag survives only if nothing re-rendered
        d6.locator('#home-now [data-id="leekduck:b6mon"] [data-open]').first.click()
        d6_sheet = settle(d6, "!!document.querySelector('#evd:not([hidden])')", 8000)
        # the dex arrives while the sheet is open: same event ids, but the Need reason appears (the render waits for the sheet to close)
        b5_release('**/dex.json', DEX_FILE)
        d6_dex = settle(d6, "Object.keys(GODASH.DEXBY).length > 500", 10000); d6.wait_for_timeout(500)
        d6_open = d6.evaluate(B6_CARD)
        d6.click('#evd-x'); d6.wait_for_timeout(500)
        d6_after = d6.evaluate(B6_CARD)
        check('B6-1 precondition: Bulbasaur Day is on Today before the dex arrives, and the sheet opened', d6_sheet and d6_dex and d6_before == 'tagged', d6_before)
        check('B6-1: a late dex answer on the same event ids is rendered into Today once the event sheet closes (the deferred render keeps its force flag), not while it is open', d6_open == 'old' and d6_after == 'new', [d6_open, d6_after])
        if shot_dir: d6.screenshot(path=shot_dir + '/b6-after-close.png')
        # B6-3: the opener's host section is hidden and the opener is gone: focus falls back to Today, not the body
        d6.evaluate("document.querySelector('#foryou [data-open]') && document.querySelector('#foryou [data-open]').click()")
        d6_fy = settle(d6, "!!document.querySelector('#evd:not([hidden])')", 8000)
        d6.evaluate("document.querySelectorAll('[data-open]').forEach(e => { if (!e.closest('#evd')) e.remove(); }); document.getElementById('foryou-sec').hidden = true")
        d6.click('#evd-x'); d6.wait_for_timeout(300)
        d6_foc = d6.evaluate("({id: document.activeElement.id, tag: document.activeElement.tagName})")
        check('B6-3: when the opener and its (hidden) section are gone, closing the sheet puts focus on Today instead of the page body', d6_fy and d6_foc['id'] == 'home-now', [d6_fy, d6_foc])
        d6.context.close()
        # B6-2: a stalled feed AND a stalled /api/sources: fresh.js only loads after the 8 s feed wait, so the reserved 44px must be released then, not 8 s later
        b5_held.clear()
        f6 = page(clock=RB_CLOCK, pre=hold('**/api/events', '**/api/sources'), ready=False)
        la_pg = f6; b5_wait_held(1); f6.clock.run_for(9000)
        settle(f6, "document.getElementById('home-now').hasAttribute('data-render-key')", 12000)
        f6_loaded = settle(f6, "!!window.GOFRESH", 8000); b5_wait_held(2); f6.clock.run_for(1000); f6.wait_for_timeout(300)
        f6_h = f6.evaluate("Math.round(document.getElementById('fresh-line').getBoundingClientRect().height)")
        check('B6-2: with the feed stalled the freshness space is released about 8 s after page start (not 8 s after fresh.js loads)', f6_loaded and f6_h == 0, [f6_loaded, f6_h])
        b5_release('**/api/sources', '{"environment":"production","database":true,"enabled":false,"sources":[]}'); b5_release('**/api/events', LIVE_FEED)
        f6_fill = settle(f6, "(() => { const e = document.getElementById('fresh-line'); return !e.hidden && !e.hasAttribute('data-released') && e.getBoundingClientRect().height >= 32; })()", 8000)
        check('B6-2: a late /api/sources answer still fills the line after an early release', f6_fill)
        f6.context.close()

    if on('b'):
        # ---- Batch 7: every filter pill / chip / segmented filter shares one unmistakable selected state (real browser, dark and light) ----
        FP_JS = """(sel) => {
          const cv = document.createElement('canvas').getContext('2d');
          const rgb = c => { cv.clearRect(0,0,1,1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0,0,1,1); const d = cv.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]]; };
          return Array.from(document.querySelectorAll(sel)).map(el => {
            const cs = getComputedStyle(el), bf = getComputedStyle(el, '::before'), r = el.getBoundingClientRect();
            const state = el.hasAttribute('aria-pressed') ? el.getAttribute('aria-pressed') : el.getAttribute('aria-selected');
            return {text: el.textContent.trim().replace(/\\s+/g,' '), state, w: r.width, h: r.height, bg: rgb(cs.backgroundColor), fg: rgb(cs.color),
                    shadow: cs.boxShadow, check: bf.content, typed: el.classList.contains('ftype'), pl: cs.paddingLeft, pr: cs.paddingRight};
          });
        }"""
        def fp_lum(c):
            def ch(v):
                v = v/255.0
                return v/12.92 if v <= 0.03928 else ((v+0.055)/1.055)**2.4
            return 0.2126*ch(c[0])+0.7152*ch(c[1])+0.0722*ch(c[2])
        def fp_ratio(a, b):
            la, lb = fp_lum(a), fp_lum(b)
            return (max(la, lb)+0.05)/(min(la, lb)+0.05)
        def fp_nav(pg, tab, sub=None, mode=None):
            if tab == 'menu':  # views that live in the header menu
                pg.click('#hmenu')
                if sub: pg.click('#menu-' + sub)
                pg.wait_for_timeout(250); return
            pg.evaluate("a => { const q = s => document.querySelector(s); const t = q('#tabs [data-tab=\"'+a[0]+'\"]'); if (t) t.click(); if (a[1]) { const b = q('#subnav-'+a[0]+' [data-sub=\"'+a[1]+'\"]'); if (b) b.click(); } if (a[2]) { const m = q('#mode-'+a[0]+'-'+a[1]+' [data-mode=\"'+a[2]+'\"]'); if (m) m.click(); } }", [tab, sub, mode])
            pg.wait_for_timeout(250)
        fp_pg = page()
        FP_GROUPS = [
            # name, nav, pill selector, index of the "All" pill (None if the group has none), index to pick, multi-select
            ('Schedule type filters', ('events', 'timeline'), '#evtypes .fchip', 0, 2, False),
            ('Schedule region chips', ('events', 'calendar'), '#calreg .rgrow .fchip', 0, 2, False),
            ('Schedule range segments', ('events', 'calendar'), '#calreg .seg .fchip', None, 1, False),
            ('Discoveries source chips', ('menu', 'leaks'), '#sub-leaks [data-dmsrc]', 0, 1, False),
            ('Events sub-navigation', ('events', 'timeline'), '#subnav-events button', None, 0, False),
            ('My Dex mode bar', ('collect', 'dex'), '#mode-collect-dex button', None, 1, False),
            ('Dex generation chips', ('collect', 'dex'), '#genchips .fchip', 0, 2, False),
            ('Dex form-group pills', ('collect', 'dex', 'forms'), '#formgrp .pill', None, 2, False),
            ('Best-by-type pills', ('collect', 'guides', 'best'), '#typechips .pill', 0, 4, False),
        ]
        def fp_group(pg, name, sel, all_idx, pick, multi):
            for theme in ('dark', 'light'):
                pg.evaluate("t => { if (t === 'light') document.documentElement.setAttribute('data-theme','light'); else document.documentElement.removeAttribute('data-theme'); }", theme)
                s0 = pg.evaluate(FP_JS, sel)
                if not s0: check('%s [%s]: pills render' % (name, theme), False); continue
                was = [i for i, x in enumerate(s0) if x['state'] == 'true']
                pg.locator(sel).nth(pick).scroll_into_view_if_needed(); pg.locator(sel).nth(pick).click(force=True); pg.wait_for_timeout(200)
                s1 = pg.evaluate(FP_JS, sel)
                on1 = [i for i, x in enumerate(s1) if x['state'] == 'true']
                tag = '%s [%s]' % (name, theme)
                if multi: check(tag + ': toggling flips only the chosen pill', all((x['state'] != y['state']) == (i == pick) for i, (x, y) in enumerate(zip(s0, s1))), (was, on1))
                else:
                    check(tag + ': exactly one pill is aria-pressed/selected, and it is the chosen one', on1 == [pick], on1)
                    if all_idx is not None:
                        check(tag + ': "All" is selected by default and unselected once another pill is chosen', all_idx in was and s1[all_idx]['state'] == 'false', (was, s1[all_idx]['state']))
                # The event-kind toggles append " (hidden)" to the label itself, so only their height is compared; every other group must keep its width.
                check(tag + ': pill widths do not change when toggled (no layout shift)', multi and all(abs(x['h']-y['h']) < 0.6 for x, y in zip(s0, s1)) or len(s0) == len(s1) and all(abs(x['w']-y['w']) < 0.6 and abs(x['h']-y['h']) < 0.6 for x, y in zip(s0, s1)), [(x['w'], y['w']) for x, y in zip(s0, s1) if abs(x['w']-y['w']) >= 0.6])
                check(tag + ': pills keep a 44px touch height', all(x['h'] >= 43.9 for x in s0+s1), [x['h'] for x in s0+s1 if x['h'] < 43.9])
                pairs = [x for x in s0 + s1 if not x['typed']]
                sel_px = [x for x in pairs if x['state'] == 'true']; off_px = [x for x in pairs if x['state'] == 'false']
                if sel_px and off_px:
                    check(tag + ': selected fill vs unselected fill is at least 3:1', min(fp_ratio(a['bg'], b['bg']) for a in sel_px for b in off_px) >= 3.0, min(fp_ratio(a['bg'], b['bg']) for a in sel_px for b in off_px))
                    check(tag + ': text is at least 4.5:1 in both states', min(fp_ratio(x['fg'], x['bg']) for x in sel_px + off_px) >= 4.5, min(fp_ratio(x['fg'], x['bg']) for x in sel_px + off_px))
                    check(tag + ': pill fills are opaque, so contrast is measured on real colours', all(x['bg'][3] == 255 for x in sel_px + off_px))
                check(tag + ': selected pill is not colour-only (check mark drawn), unselected pills have none', all((x['check'] != 'none') == (x['state'] == 'true') for x in s0 + s1), [(x['text'], x['state'], x['check']) for x in s1 if (x['check'] != 'none') != (x['state'] == 'true')])
                check(tag + ': padding is symmetric, so the check never moves the label', all(x['pl'] == x['pr'] for x in s0 + s1 if not x['typed']), [(x['pl'], x['pr']) for x in s1[:2]])
                if any(x['typed'] for x in s1):
                    check(tag + ': typed pills show selection as a ring, only on the chosen pill', all((x['shadow'] != 'none') == (x['state'] == 'true') for x in s1 if x['typed']), [(x['text'], x['shadow']) for x in s1 if x['typed']][:3])
                # put the group back the way it was
                pg.locator(sel).nth(was[0] if (was and not multi) else pick).click(force=True); pg.wait_for_timeout(150)
        for name, nav, sel, all_idx, pick, multi in FP_GROUPS:
            fp_nav(fp_pg, *nav)
            fp_pg.evaluate("s => { const e = document.querySelector(s); const d = e && e.closest('details'); if (d) d.open = true; }", sel); fp_pg.wait_for_timeout(120)  # chips inside a collapsed disclosure
            fp_group(fp_pg, name, sel, all_idx, pick, multi)
        # Kind toggles in Settings are multi-select: each chip flips on its own.
        fp_nav(fp_pg, 'menu')
        fp_pg.evaluate("() => { const d = document.querySelector('#kindsbox').closest('details'); if (d) d.open = true; }"); fp_pg.wait_for_timeout(150)
        fp_group(fp_pg, 'Settings event-kind toggles', '#kindsbox .fchip', None, 1, True)
        fp_pg.close()
        # Places tag chips (opened with a fixture so the group is stable).
        fp_pl = page(extra={'**/places.json': (PLACES_FIXTURE, 200)}); fp_pl.wait_for_function("!!window.GOPLACES")
        fp_pl.evaluate("GOPLACES.open('')"); fp_pl.wait_for_selector('#plc .plc-tags .chip')
        fp_group(fp_pl, 'Places tag chips', '#plc .plc-tags .chip', 0, 2, False)
        fp_pl.close()
        check('filter pills share one token-based treatment in the stylesheet (no hard-coded colours)',
              all(t in DASH_CSS for t in ['--color-filter-bg:', '--color-filter-selected-bg:', '--color-on-filter-selected:', '.fchip[aria-pressed="true"],.pill.fpill[aria-pressed="true"],.subnav button[aria-pressed="true"],.plc-tags .chip[aria-pressed="true"]{background:var(--color-filter-selected-bg)']) and
              "class=\"chip\" data-tag=\"\" aria-pressed=" in (ROOT / 'public' / 'places.js').read_text() and
              "class=\"pill' + (grp" not in (ROOT / 'public' / 'extra.js').read_text())


    if on('b'):
        # ---- Batch 8: first-load work (shared JSON loader, deferred details, offline shell). Real browser, local files, fixed clock. ----
        fl_log = []
        def fl_pre(p):
            p.on('request', lambda r: fl_log.append((r.resource_type, r.url.split('#')[0])))
            for u in ('datamine', 'unreleased', 'pvp', 'ig-decisions'):  # these answer 200 in production; the default 404 would (rightly) be retried by each caller
                p.route('**/api/' + u, lambda r: r.fulfill(body='{}', content_type='application/json'))
        fl_pg = page(pre=fl_pre)
        settle(fl_pg, "!!(window.GOFRESH&&window.GOFRESH.state().done&&window.GOINFOGRAPHIC&&window.GOEXTRA&&window.GODETAIL)")
        fl_pg.wait_for_timeout(1500)
        # A. no data or code URL is requested twice on a cold Today load (pictures are excluded: the browser cache answers repeats; /api/art and per-id calls differ by query)
        fl_counts = {}
        for kind, url in fl_log:
            if kind in ('fetch', 'xhr', 'script', 'stylesheet', 'document'):
                path = url.replace(BASE, '')
                fl_counts[path] = fl_counts.get(path, 0) + 1
        fl_dups = sorted((u, n) for u, n in fl_counts.items() if n > 1 and not u.startswith('https://fonts.'))
        check('cold Today load requests no JSON, API or script URL more than once', not fl_dups, fl_dups)
        check('dash.js is found by the preload before app.js injects it (one request, started from the head)',
              fl_counts.get('/dash.js?v=' + re.search(r"ds\.src='/dash\.js\?v=(\w+)'", APP_JS).group(1)) == 1 and '<link rel="preload" href="/dash.js?v=' in INDEX_HTML)
        # B. an event sheet opened straight after load has its details (event-details.json is no longer fetched at startup, only on idle or when a sheet needs it)
        fl_pg.evaluate("GODETAIL.open('cur:trek')")
        fl_ok = settle(fl_pg, "!!document.querySelector('.evd-groups')", 8000)
        fl_txt = fl_pg.evaluate("(document.querySelector('.evd-groups')||{}).textContent||''")
        check('event sheet opened right after load shows the sourced details from event-details.json', fl_ok and len(fl_txt) > 100, fl_txt[:80])
        fl_pg.context.close()
        # C. the 310 KB details file does not compete with the first render: it is not requested before Today has drawn
        fl_order = []
        def fl_order_pre(p): p.on('request', lambda r: fl_order.append(r.url.replace(BASE, '')))
        fl_d = page(pre=fl_order_pre)
        fl_d.wait_for_timeout(300)
        # the home-now render has happened by now (page() waits for it); the details file may only be asked for after dash.js has started
        fl_dash_idx = next((i for i, u in enumerate(fl_order) if u.startswith('/dash.js')), -1)
        fl_det_idx = next((i for i, u in enumerate(fl_order) if u.startswith('/event-details.json')), 10**6)
        fl_nudge_idx = next((i for i, u in enumerate(fl_order) if u.startswith('/nudge.js')), -1)
        check('event-details.json is not requested until the page scripts after the first render have loaded', fl_dash_idx >= 0 and fl_nudge_idx >= 0 and fl_det_idx > fl_nudge_idx, (fl_dash_idx, fl_nudge_idx, fl_det_idx))
        fl_d.context.close()
        # D. service worker: after one visit, an offline reload still shows Today, and the versioned fresh.js (as dash.js requests it) comes from the cache
        fl_ctx = b.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Australia/Melbourne', locale='en-AU', service_workers='allow')
        fl_ctx.set_default_timeout(15000)
        fl_sw = fl_ctx.new_page(); fl_sw.errs = []
        fl_sw.on('pageerror', lambda e: fl_sw.errs.append(str(e)))
        fl_ctx.route(re.compile(r'^https://fonts\.(googleapis|gstatic)\.com/'), lambda r: r.fulfill(status=200, body='', content_type='text/css' if 'googleapis' in r.request.url else 'font/woff2'))
        fl_ctx.route('**/api/**', lambda r: r.fulfill(status=404, body='{}', content_type='application/json'))
        fl_ctx.route(re.compile(r'/(img/ext|infographics|infographic-thumbs)/'), lambda r: r.fulfill(body=PNG1, content_type='image/png'))
        fl_sw.goto(BASE + '/', wait_until='load')
        fl_sw.wait_for_function("document.getElementById('home-now')?.hasAttribute('data-render-key')")
        fl_fresh = re.search(r"w\.src = '(/fresh\.js\?v=\w+)'", DASH_JS).group(1)
        fl_ready = settle(fl_sw, "navigator.serviceWorker.controller&&window.GOFRESH", 30000)
        fl_cached = fl_sw.evaluate("""async (u) => { const n = (await caches.keys()).find(k => k.startsWith('gofn-shell-')); if (!n) return {name: null}; const c = await caches.open(n);
            return {name: n, keys: (await c.keys()).length, fresh: !!(await c.match(u)), dashjs: !!(await c.match('/dash.js?v=' + %s))}; }""" % json.dumps(re.search(r"ds\.src='/dash\.js\?v=(\w+)'", APP_JS).group(1)), fl_fresh)
        check('service worker installs on the first visit and its cache holds the versioned fresh.js and dash.js', fl_ready and fl_cached.get('fresh') and fl_cached.get('dashjs') and fl_cached.get('keys', 0) >= 50, fl_cached)
        fl_ctx.set_offline(True)
        fl_sw.reload(wait_until='domcontentloaded')
        fl_off = settle(fl_sw, "document.getElementById('home-now')?.hasAttribute('data-render-key')", 20000)
        fl_off_fresh = settle(fl_sw, "!!window.GOFRESH&&!!window.GODETAIL", 15000)
        fl_off_state = fl_sw.evaluate("({err: !document.getElementById('load-error').hidden, cards: document.querySelectorAll('#home-now .evc, #home-now .pc, #home-now .event-card').length, keyed: document.getElementById('home-now').hasAttribute('data-render-key'), title: document.title})")
        check('offline reload after one visit still shows Today, with the versioned fresh.js and detail.js served from the cache', fl_off and fl_off_fresh and not fl_off_state['err'] and not fl_sw.errs, (fl_off, fl_off_fresh, fl_off_state, fl_sw.errs[:2]))
        fl_ctx.close()


    if on('c'):
        # ---- Batch 9: private Discord links, review Undo + dedupe, accessible names (real browser, fixed clock, 390px) ----
        B9_EV = ev('b9cd', 'Community Day: Bulbasaur', 'community-day', '2026-10-09T10:00:00', '2026-10-20T20:00:00', 'official_confirmed')
        B9_API = json.dumps({'enabled': True, 'events': [B9_EV, ev('b9rh', 'Dialga Raid Hour', 'raid-hour', '2026-10-10T20:00:00.000', '2026-10-10T21:00:00.000', 'official_confirmed', [{'name': 'Dialga', 'role': 'raid_boss', 'dex': 483}])] + [ev('b9f%d' % i, 'Batch nine filler %d' % i, 'event', '2026-10-09T10:00:00', '2026-10-20T20:00:00', 'confirmed') for i in range(10)]})  # the live feed needs 10+ events to be trusted
        DISCORD = 'https://discord.com/channels/@me/1558793395198099618/1558796039035682828'
        B9_QUEUE = json.dumps({'items': [
            {'id': 'discord:b9-dup-a', 'title': 'Dup picture', 'image': '/infographics/g47ix/b9-dup.png', 'post': DISCORD, 'creator': 'G47IX', 'source': 'discord', 'publishedAt': '2026-10-09T01:00:00Z',
             'guesses': [{'eventId': 'leekduck:b9cd', 'eventTitle': 'Community Day: Bulbasaur'}, {'eventId': 'b9cd', 'eventTitle': 'Community Day: Bulbasaur'}]},
            {'id': 'telegram:b9-dup-b', 'title': 'Dup picture', 'image': '/infographics/g47ix/b9-dup.png', 'post': DISCORD, 'creator': 'G47IX', 'source': 'telegram', 'publishedAt': '2026-10-09T01:00:00Z', 'guesses': []},
            {'id': 'discord:b9-solo', 'title': 'Solo picture', 'image': '/infographics/g47ix/b9-solo.png', 'post': DISCORD[:-3] + '999', 'creator': 'G47IX', 'source': 'discord', 'publishedAt': '2026-10-08T01:00:00Z', 'guesses': []}]})
        def b9_owner(decisions):
            posts = []; gets = []; stored = {d['id']: dict(d) for d in decisions}  # the mocked site keeps what was posted, as the real one does
            pg = page(api=B9_API, pin=True, mobile=True, extra={'**/infographic-queue.json*': (B9_QUEUE, 200), '**/api/ig-decisions': (json.dumps({'decisions': decisions}), 200), '**/api/auth/users': (json.dumps({'users': []}), 200)})
            def handler(route):
                req = route.request
                if req.method == 'POST':
                    body = json.loads(req.post_data); posts.append(body)
                    if body['status'] == 'reset': stored.pop(body['id'], None)
                    else: stored[body['id']] = dict(body)
                    route.fulfill(status=200, body='{"ok":true}', content_type='application/json')
                else: gets.append(req.url); route.fulfill(status=200, body=json.dumps({'decisions': list(stored.values())}), content_type='application/json')
            pg.route('**/api/ig-decisions', handler)
            pg.wait_for_function("document.documentElement.getAttribute('data-role')==='owner' && !document.getElementById('hireview').hidden", timeout=10000)
            pg.click('#hmenu'); pg.wait_for_selector('#igreview:not([hidden]) .igr'); pg.wait_for_timeout(300)
            return pg, posts, gets
        # Item 2: the same picture listed twice is shown once; suggestions for one event are shown once; Discard can be undone.
        opg, posts, gets = b9_owner([])
        cards = opg.eval_on_selector_all('#igreview .igr', 'els=>els.map(e=>e.getAttribute("data-id"))')
        check('review: the same picture queued twice (same image and Discord post) appears once, and the second id is not listed', cards == ['discord:b9-dup-a', 'discord:b9-solo'], cards)
        check('review: two suggestions for the same event (leekduck:id and bare id) give one Approve button', opg.locator('#igreview .igr[data-id="discord:b9-dup-a"] [data-ig-ok]').count() == 1)
        link_txt = opg.locator('#igreview .igr[data-id="discord:b9-solo"] a[href*="discord.com/channels"]').inner_text()
        check('review (owner only): the Discord post link stays, clearly labelled', link_txt == 'Open in Discord (owner only)', link_txt)
        check('review: Discard and Approve buttons say which picture they are for', opg.locator('#igreview .igr[data-id="discord:b9-solo"] [data-ig-no]').get_attribute('aria-label') == 'Discard: Solo picture')
        n_gets = len(gets)
        opg.locator('#igreview .igr[data-id="discord:b9-solo"] [data-ig-no]').click(); opg.wait_for_selector('#igundo')
        check('Discard posts one rejected decision and the card leaves the list', posts == [{'id': 'discord:b9-solo', 'status': 'rejected', 'eventId': '', 'eventTitle': ''}] and opg.locator('#igreview .igr[data-id="discord:b9-solo"]').count() == 0, posts)
        check('Discard shows a "Discarded - Undo" notice that is announced politely and has a 44px Undo button', opg.get_attribute('#igundo', 'role') == 'status' and 'Discarded' in opg.inner_text('#igundo') and opg.locator('#igundo button').bounding_box()['height'] >= 44)
        opg.wait_for_timeout(300); opg.screenshot(path=OUT+'b9_review_undo.png')
        check('after a decision the decision list is fetched again, not taken from the shared 30 s copy', len(gets) > n_gets, (n_gets, len(gets)))
        opg.click('#igundo button'); opg.wait_for_timeout(50)
        check('Undo puts the card back at once and removes the notice', opg.locator('#igreview .igr[data-id="discord:b9-solo"]').count() == 1 and opg.locator('#igundo').count() == 0)
        opg.wait_for_timeout(300)
        check('Undo of a first-time Discard clears the stored decision (reset), exactly once', posts[-1] == {'id': 'discord:b9-solo', 'status': 'reset', 'eventId': '', 'eventTitle': ''} and len(posts) == 2, posts)
        opg.locator('#igreview .igr[data-id="discord:b9-solo"] [data-ig-no]').click(); opg.wait_for_selector('#igundo')
        opg.clock.fast_forward(9000); opg.wait_for_timeout(100)
        check('the Undo notice goes away by itself after about 8 seconds and the discard stays', opg.locator('#igundo').count() == 0 and opg.locator('#igreview .igr[data-id="discord:b9-solo"]').count() == 0)
        opg.locator('#igreview .igr[data-id="discord:b9-dup-a"] [data-ig-no]').click(); opg.wait_for_selector('#igundo')
        check('discarding one copy hides the whole duplicate group', opg.locator('#igreview .igr').count() == 0)
        opg.context.close()
        # Undo after Discard of an already linked picture re-sends the earlier approval (same events, same order).
        prior = {'id': 'discord:b9-solo', 'status': 'approved', 'eventId': 'leekduck:b9cd,leekduck:b9rh', 'eventTitle': 'Community Day: Bulbasaur | Dialga Raid Hour'}
        lpg, lposts, lgets = b9_owner([prior])
        lpg.wait_for_selector('#iglinked'); lpg.evaluate("document.getElementById('iglinked').open=true")
        lpg.locator('#iglinked .igr[data-id="discord:b9-solo"] [data-ig-no]').click(); lpg.wait_for_selector('#igundo')
        check('discarding a linked picture sends rejected', lposts[-1]['status'] == 'rejected' and lpg.locator('#iglinked .igr[data-id="discord:b9-solo"]').count() == 0, lposts)
        lpg.click('#igundo button'); lpg.wait_for_selector('#iglinked .igr[data-id="discord:b9-solo"]', state='attached'); lpg.wait_for_timeout(300)
        check('Undo of a linked picture re-posts the previous approval unchanged', lposts[-1] == {'id': prior['id'], 'status': 'approved', 'eventId': prior['eventId'], 'eventTitle': prior['eventTitle']} and len(lposts) == 2, lposts)
        lpg.context.close()
        # ---- Batch 11: decisions are never overwritten or deleted on a guess (mocked /api/ig-decisions with a mutable server) ----
        def b11_owner(decisions, get_ok=True, hold_posts=False, queue=None):
            srv = {'rows': {d['id']: dict(d) for d in decisions}, 'get_ok': get_ok, 'posts': [], 'gets': 0, 'hold': hold_posts, 'held': []}
            pg = page(api=B9_API, pin=True, mobile=True, extra={'**/infographic-queue.json*': (queue or B9_QUEUE, 200), '**/api/ig-decisions': ((json.dumps({'decisions': list(decisions)}), 200) if get_ok else ('{"error":"x"}', 500)), '**/api/auth/users': (json.dumps({'users': []}), 200)})
            def handler(route):
                req = route.request
                if req.method == 'POST':
                    body = json.loads(req.post_data)
                    def finish():
                        srv['posts'].append(body)
                        if body['status'] == 'reset': srv['rows'].pop(body['id'], None)
                        else: srv['rows'][body['id']] = dict(body)
                        route.fulfill(status=200, body='{"ok":true}', content_type='application/json')
                    if srv['hold']: srv['held'].append(finish)
                    else: finish()
                else:
                    srv['gets'] += 1
                    if srv['get_ok']: route.fulfill(status=200, body=json.dumps({'decisions': list(srv['rows'].values())}), content_type='application/json')
                    else: route.fulfill(status=500, body='{"error":"x"}', content_type='application/json')
            pg.route('**/api/ig-decisions', handler)
            pg.wait_for_function("document.documentElement.getAttribute('data-role')==='owner'", timeout=10000)
            pg.click('#hmenu'); pg.wait_for_selector('#igreview:not([hidden])'); pg.wait_for_timeout(300)
            return pg, srv
        APPROVED_ELSEWHERE = {'id': 'discord:b9-solo', 'status': 'approved', 'eventId': 'leekduck:b9cd,leekduck:b9rh', 'eventTitle': 'Community Day: Bulbasaur | Dialga Raid Hour'}
        # (1) Approved somewhere else after this page loaded: Discard reads the site first, Undo puts that exact approval back and never deletes it.
        gpg, gsrv = b11_owner([])
        check('B11: with nothing stored the picture is listed for review', gpg.locator('#igreview .igr[data-id="discord:b9-solo"]').count() == 1)
        gsrv['rows'][APPROVED_ELSEWHERE['id']] = dict(APPROVED_ELSEWHERE)  # approved from Telegram / another device after the page loaded
        g0 = gsrv['gets']
        gpg.locator('#igreview .igr[data-id="discord:b9-solo"] [data-ig-no]').click(); gpg.wait_for_selector('#igundo')
        check('B11: Discard reads the picture\'s current decision from the site first (a fresh request)', gsrv['gets'] > g0, (g0, gsrv['gets']))
        check('B11: Discard then sends exactly one rejected decision', [p['status'] for p in gsrv['posts']] == ['rejected'], gsrv['posts'])
        gpg.click('#igundo button'); gpg.wait_for_selector('#iglinked .igr[data-id="discord:b9-solo"]', state='attached', timeout=5000); gpg.wait_for_timeout(200)
        check('B11: Undo restores the approval that was on the site (same events, same order) and never deletes it', [p['status'] for p in gsrv['posts']] == ['rejected', 'approved'] and gsrv['posts'][-1] == {'id': APPROVED_ELSEWHERE['id'], 'status': 'approved', 'eventId': APPROVED_ELSEWHERE['eventId'], 'eventTitle': APPROVED_ELSEWHERE['eventTitle']} and gsrv['rows'][APPROVED_ELSEWHERE['id']]['status'] == 'approved', gsrv['posts'])
        gpg.context.close()
        # (1b) Changed elsewhere between Discard and Undo: Undo does nothing instead of overwriting.
        gpg, gsrv = b11_owner([])
        gpg.locator('#igreview .igr[data-id="discord:b9-solo"] [data-ig-no]').click(); gpg.wait_for_selector('#igundo')
        gsrv['rows'][APPROVED_ELSEWHERE['id']] = dict(APPROVED_ELSEWHERE)
        gpg.click('#igundo button'); gpg.wait_for_selector('#igreview .igr-msg', timeout=5000); gpg.wait_for_timeout(200)
        check('B11: Undo refuses when the picture was changed elsewhere in the meantime (nothing written, nothing deleted)', [p['status'] for p in gsrv['posts']] == ['rejected'] and gsrv['rows'][APPROVED_ELSEWHERE['id']]['status'] == 'approved' and 'changed somewhere else' in gpg.inner_text('#igreview .igr-msg'), gsrv['posts'])
        gpg.context.close()
        # (1c) The re-read fails: the Discard is refused, the card stays, nothing is written.
        gpg, gsrv = b11_owner([])
        gsrv['get_ok'] = False
        gpg.locator('#igreview .igr[data-id="discord:b9-solo"] [data-ig-no]').click(); gpg.wait_for_function("document.querySelector('#igreview .igr-msg')", timeout=5000)
        check('B11: if the site\'s decision cannot be re-read, Discard is refused calmly, the card stays and nothing is written', gsrv['posts'] == [] and gpg.locator('#igreview .igr[data-id="discord:b9-solo"]').count() == 1 and gpg.locator('#igundo').count() == 0 and 'not discarded' in gpg.inner_text('#igreview .igr-msg'), gsrv['posts'])
        gpg.context.close()
        # (2) The first read of the decisions fails: a visible error, no approve/discard buttons, no writes; Retry brings the cards back.
        gpg, gsrv = b11_owner([], get_ok=False)
        check('B11: a failed first read of the decisions shows an error instead of an empty list', gpg.locator('#igreview [role="alert"]').count() == 1 and 'Could not read' in gpg.inner_text('#igreview [role="alert"]'))
        check('B11: and no Approve / Discard / override buttons are offered while the saved state is unknown', gpg.locator('#igreview .igr, #igreview [data-ig-no], #igreview [data-ig-ok], #igreview [data-ig-pick], #igreview [data-ig-ov]').count() == 0 and gsrv['posts'] == [])
        gsrv['get_ok'] = True
        gpg.locator('#igreview [data-ig-retry]').click(); gpg.wait_for_selector('#igreview .igr', timeout=5000)
        check('B11: Retry loads the decisions and the cards appear', gpg.locator('#igreview .igr[data-id="discord:b9-solo"]').count() == 1 and gpg.locator('#igreview [role="alert"]').count() == 0)
        gpg.context.close()
        # (3) Writes on one card are queued: Approve tapped while a Discard is still in flight is only sent after it, and the screen ends on the last write.
        gpg, gsrv = b11_owner([])
        gsrv['hold'] = True
        card_sel = '#igreview .igr[data-id="discord:b9-solo"]'
        gpg.locator(card_sel + ' [data-ig-no]').click(); gpg.wait_for_timeout(300)
        check('B11: a Discard still in flight is held at the server', len(gsrv['held']) == 1 and gsrv['posts'] == [])
        sel_ev = gpg.locator(card_sel + ' select'); sel_ev.select_option(index=1)
        gpg.locator(card_sel + ' [data-ig-pick]').click(); gpg.wait_for_timeout(400)
        check('B11: an Approve tapped on the same card meanwhile is NOT sent while the Discard is unfinished', len(gsrv['held']) == 1 and gsrv['posts'] == [], (len(gsrv['held']), gsrv['posts']))
        gsrv['hold'] = False; gsrv['held'].pop(0)(); gpg.wait_for_timeout(500)
        check('B11: after the Discard finishes, the Approve is sent: writes reach the site in tap order', [p['status'] for p in gsrv['posts']] == ['rejected', 'approved'], gsrv['posts'])
        gpg.wait_for_selector('#iglinked .igr[data-id="discord:b9-solo"]', state='attached', timeout=5000)
        check('B11: the screen shows the last write that reached the site (linked) and no stale Undo is offered for that card', gpg.locator('#igundo').count() == 0 and gsrv['rows']['discord:b9-solo']['status'] == 'approved')
        gpg.context.close()
        # (4) Two discards in a row: both can be undone (newest first).
        gpg, gsrv = b11_owner([])
        gpg.locator('#igreview .igr[data-id="discord:b9-solo"] [data-ig-no]').click(); gpg.wait_for_selector('#igundo'); gpg.wait_for_timeout(200)
        gpg.locator('#igreview .igr[data-id="discord:b9-dup-a"] [data-ig-no]').click(); gpg.wait_for_timeout(500)
        check('B11: both pictures are discarded', gpg.locator('#igreview .igr').count() == 0 and [p['id'] for p in gsrv['posts']] == ['discord:b9-solo', 'discord:b9-dup-a'], gsrv['posts'])
        gpg.click('#igundo button'); gpg.wait_for_selector('#igreview .igr[data-id="discord:b9-dup-a"]', timeout=5000); gpg.wait_for_timeout(300)
        check('B11: the second discard\'s Undo works, and the first discard\'s Undo is still on offer afterwards', gpg.locator('#igundo').count() == 1 and gpg.locator('#igreview .igr[data-id="discord:b9-solo"]').count() == 0)
        gpg.click('#igundo button'); gpg.wait_for_selector('#igreview .igr[data-id="discord:b9-solo"]', timeout=5000); gpg.wait_for_timeout(300)
        check('B11: both are restored, in order, to exactly their earlier state (nothing stored)', [p['status'] for p in gsrv['posts']] == ['rejected', 'rejected', 'reset', 'reset'] and gsrv['rows'] == {} and gpg.locator('#igundo').count() == 0, gsrv['posts'])
        gpg.context.close()
        # (5) A picture matching two cards already listed (one by image file, one by post link) joins them into ONE card.
        Q3 = json.dumps({'items': [
            {'id': 'discord:q3-a', 'title': 'A', 'image': '/infographics/g47ix/q3-x.png', 'post': DISCORD[:-3] + '111', 'source': 'discord', 'publishedAt': '2026-10-09T01:00:00Z', 'guesses': []},
            {'id': 'discord:q3-b', 'title': 'B', 'image': '/infographics/g47ix/q3-y.png', 'post': DISCORD[:-3] + '222', 'source': 'discord', 'publishedAt': '2026-10-09T02:00:00Z', 'guesses': []},
            {'id': 'telegram:q3-c', 'title': 'C', 'image': '/infographics/g47ix/q3-x.png', 'post': DISCORD[:-3] + '222', 'source': 'telegram', 'publishedAt': '2026-10-09T03:00:00Z', 'guesses': []}]})
        gpg, gsrv = b11_owner([], queue=Q3)
        check('B11: a picture matching two listed cards merges all three into one card', gpg.locator('#igreview .igr').count() == 1, gpg.locator('#igreview .igr').count())
        gpg.locator('#igreview .igr [data-ig-no]').click(); gpg.wait_for_selector('#igundo'); gpg.wait_for_timeout(200)
        check('B11: and one decision hides the whole merged group', gpg.locator('#igreview .igr').count() == 0)
        gpg.context.close()
        # ---- Batch 13: the 500-row cap, hung writes and double-tapped Discard (mocked /api/ig-decisions as in B11) ----
        SOLO = '#igreview .igr[data-id="discord:b9-solo"]'
        def b13_fill(n): return [{'id': 'fill:%d' % i, 'status': 'approved', 'eventId': 'x%d' % i, 'eventTitle': 'Filler %d' % i} for i in range(n)]
        # (a) Exactly 500 rows and the picture is not among them: it may hold an older decision, so Discard is refused and nothing is written.
        gpg, gsrv = b11_owner(b13_fill(500))
        check('B13: a full 500-row decision list shows a visible notice that older decisions may be hidden', 'Showing the 500 most recent decisions; older ones may be hidden' in gpg.inner_text('#igreview'))
        g0 = gsrv['gets']
        gpg.locator(SOLO + ' [data-ig-no]').click(); gpg.wait_for_function("document.querySelector('#igreview .igr-msg:not(.igr-cap)')", timeout=5000)
        check('B13: with 500 rows and the picture missing, Discard is refused calmly (it was re-read, nothing written, card stays, no Undo)', gsrv['gets'] > g0 and gsrv['posts'] == [] and gpg.locator(SOLO).count() == 1 and gpg.locator('#igundo').count() == 0 and 'Not discarded' in gpg.inner_text('#igreview .igr-msg:not(.igr-cap)'), (gsrv['gets'], gsrv['posts']))
        dlg = []
        gpg.once('dialog', lambda d: (dlg.append(d.message), d.dismiss()))
        gpg.locator(SOLO + ' select').select_option(index=1); gpg.locator(SOLO + ' [data-ig-pick]').click(); gpg.wait_for_timeout(300)
        check('B13: at the cap, Approve of a picture with no visible decision asks first, and a "no" writes nothing', len(dlg) == 1 and gsrv['posts'] == [] and gpg.locator(SOLO).count() == 1, (dlg, gsrv['posts']))
        gpg.once('dialog', lambda d: d.accept())
        gpg.locator(SOLO + ' [data-ig-pick]').click(); gpg.wait_for_selector('#iglinked .igr[data-id="discord:b9-solo"]', state='attached', timeout=5000)
        check('B13: ...and a "yes" saves the approval', [p['status'] for p in gsrv['posts']] == ['approved'], gsrv['posts'])
        gpg.context.close()
        # (b) 499 rows (below the cap): the picture really has no decision, so everything behaves as before, with no notice and no question.
        gpg, gsrv = b11_owner(b13_fill(499))
        dlg = []; gpg.on('dialog', lambda d: (dlg.append(d.message), d.dismiss()))
        check('B13: below the cap there is no notice', 'most recent decisions' not in gpg.inner_text('#igreview'))
        gpg.locator(SOLO + ' [data-ig-no]').click(); gpg.wait_for_selector('#igundo', timeout=5000)
        check('B13: below the cap Discard works as before (one rejected decision) and no question is asked', [p['status'] for p in gsrv['posts']] == ['rejected'] and dlg == [], (gsrv['posts'], dlg))
        gpg.click('#igundo button'); gpg.wait_for_selector(SOLO, timeout=5000); gpg.wait_for_timeout(300)
        check('B13: below the cap Undo of a first-time Discard still clears it (reset)', [p['status'] for p in gsrv['posts']] == ['rejected', 'reset'] and 'discord:b9-solo' not in gsrv['rows'], gsrv['posts'])
        gpg.context.close()
        # (c) The list grows to 500 rows without the picture between Discard and Undo: Undo cannot prove the picture is unchanged, so it never sends reset.
        gpg, gsrv = b11_owner(b13_fill(499))
        gpg.locator(SOLO + ' [data-ig-no]').click(); gpg.wait_for_selector('#igundo', timeout=5000)
        gsrv['rows'].pop('discord:b9-solo', None); gsrv['rows'].update({r['id']: r for r in b13_fill(500)})  # newer rows pushed the discard out of the newest 500
        gpg.click('#igundo button'); gpg.wait_for_selector('#igreview .igr-msg:not(.igr-cap)', timeout=5000); gpg.wait_for_timeout(200)
        check('B13: Undo never sends reset when the list is cut off and the picture is missing', [p['status'] for p in gsrv['posts']] == ['rejected'] and 'full' in gpg.inner_text('#igreview .igr-msg:not(.igr-cap)'), gsrv['posts'])
        gpg.context.close()
        # (d) A POST that never answers: after about 15 s the calm error shows, the card stays, the queue is free, and the next action re-reads before writing.
        gpg, gsrv = b11_owner([])
        gsrv['hold'] = True
        gpg.locator(SOLO + ' select').select_option(index=1); gpg.locator(SOLO + ' [data-ig-pick]').click(); gpg.wait_for_timeout(300)
        check('B13: the hung write is waiting at the server', len(gsrv['held']) == 1 and gsrv['posts'] == [])
        gpg.clock.fast_forward(16000); gpg.wait_for_function("((document.querySelector('#igreview .igr-msg:not(.igr-cap)')||{}).textContent||'').includes('too long')", timeout=5000)
        check('B13: a write that times out shows the calm error and keeps the card (nothing is assumed saved)', gpg.locator(SOLO).count() == 1 and gpg.locator('#iglinked').count() == 0, gpg.inner_text('#igreview'))
        gsrv['rows']['discord:b9-solo'] = dict(APPROVED_ELSEWHERE)  # the "lost" write actually landed (or another device approved it)
        gsrv['hold'] = False; g0 = gsrv['gets']
        gpg.locator(SOLO + ' [data-ig-no]').click(); gpg.wait_for_selector('#iglinked .igr[data-id="discord:b9-solo"]', state='attached', timeout=5000); gpg.wait_for_timeout(200)
        check('B13: the next action after a timeout re-reads first, writes nothing, and shows what the site holds', gsrv['gets'] > g0 and gsrv['posts'] == [] and gpg.locator('#igundo').count() == 0 and 'checked again' in gpg.inner_text('#igreview'), (gsrv['gets'], gsrv['posts']))
        gpg.locator('#iglinked').evaluate("e=>e.open=true")
        gpg.locator('#iglinked .igr [data-ig-no]').click(); gpg.wait_for_selector('#igundo', timeout=5000)
        check('B13: after the re-read the next tap goes through normally', [p['status'] for p in gsrv['posts']] == ['rejected'], gsrv['posts'])
        gpg.context.close()
        # (e) Double-tapping Discard (before the card hides) sends one write, and Undo restores the ORIGINAL decision.
        gpg, gsrv = b11_owner([])
        gsrv['rows']['discord:b9-solo'] = dict(APPROVED_ELSEWHERE); gsrv['hold'] = True
        gpg.evaluate("()=>{const b=document.querySelector('#igreview .igr[data-id=\"discord:b9-solo\"] [data-ig-no]'); b.click(); b.click();}")
        gpg.wait_for_timeout(500); gsrv['hold'] = False; gsrv['held'].pop(0)(); gpg.wait_for_selector('#igundo', timeout=5000); gpg.wait_for_timeout(300)
        check('B13: a double-tapped Discard writes exactly one rejected decision', [p['status'] for p in gsrv['posts']] == ['rejected'] and gsrv['held'] == [] , gsrv['posts'])
        gpg.click('#igundo button'); gpg.wait_for_selector('#iglinked .igr[data-id="discord:b9-solo"]', state='attached', timeout=5000); gpg.wait_for_timeout(300)
        check('B13: Undo after a double-tapped Discard restores the original approval, not "rejected"', gsrv['posts'][-1] == {'id': APPROVED_ELSEWHERE['id'], 'status': 'approved', 'eventId': APPROVED_ELSEWHERE['eventId'], 'eventTitle': APPROVED_ELSEWHERE['eventTitle']} and gsrv['rows'][APPROVED_ELSEWHERE['id']]['status'] == 'approved', gsrv['posts'])
        gpg.context.close()
        # ---- Batch 14: initial review reads are bounded; Retry re-fetches both queue and decisions ----
        for stalled in ('queue', 'decisions'):
            calls = {'queue': 0, 'decisions': 0}
            held_initial = {'queue': 0, 'decisions': 0}
            allow_retry = {'value': False}
            def initial_routes(pg, stalled=stalled, calls=calls, held_initial=held_initial, allow_retry=allow_retry):
                def queue_route(route):
                    calls['queue'] += 1
                    if stalled == 'queue' and not allow_retry['value']:
                        held_initial['queue'] += 1
                        return
                    route.fulfill(status=200, body=B9_QUEUE, content_type='application/json')
                def decisions_route(route):
                    calls['decisions'] += 1
                    if stalled == 'decisions' and not allow_retry['value']:
                        held_initial['decisions'] += 1
                        return
                    route.fulfill(status=200, body='{"decisions":[]}', content_type='application/json')
                pg.route('**/infographic-queue.json*', queue_route)
                pg.route('**/api/ig-decisions', decisions_route)
            rpg = page(api=B9_API, pin=True, mobile=True,
                       extra={'**/api/auth/users': (json.dumps({'users': []}), 200)},
                       pre=initial_routes, ready=True)
            rpg.wait_for_function("document.documentElement.getAttribute('data-role')==='owner'", timeout=10000)
            rpg.click('#hmenu')  # opening the owner menu triggers the review module's first load
            # Owner verification can produce more than one initial load. Hold every initial
            # request for the selected resource so a later load cannot accidentally mask the timeout.
            last = None
            stable = 0
            for _ in range(100):
                rpg.wait_for_timeout(25)
                current = (calls['queue'], calls['decisions'])
                if current == last and current[0] >= 1 and current[1] >= 1:
                    stable += 1
                else:
                    stable = 0
                last = current
                if stable >= 8: break
            check('B14: both initial reads reach the fixture before timeout simulation',
                  calls['queue'] >= 1 and calls['decisions'] >= 1,
                  {'stalled': stalled, 'calls': calls})
            rpg.clock.fast_forward(16000)
            rpg.wait_for_timeout(50)
            rpg.wait_for_function("!!document.getElementById('igreview') && !document.getElementById('igreview').hidden", timeout=5000)
            retry_count = rpg.locator('#igreview [data-ig-retry="1"]').count()
            held_count = held_initial[stalled]
            check('B14: initial queue and decision requests were intercepted and timeout UI became visible',
                  calls['queue'] >= 1 and calls['decisions'] >= 1 and held_count >= 1 and retry_count == 1,
                  {'stalled': stalled, 'calls': calls, 'held': held_initial, 'retry_count': retry_count, 'text': rpg.inner_text('#igreview')})
            if not retry_count:
                rpg.context.close()
                continue
            if stalled == 'queue':
                check('B14: a hung initial infographic queue read times out and shows a clear Retry instead of an empty review list',
                      held_initial['queue'] >= 1 and
                      'Could not load the infographic queue' in rpg.inner_text('#igreview') and
                      rpg.locator('#igreview .igr').count() == 0)
            else:
                check('B14: a hung initial saved-decisions read times out and pauses review with Retry',
                      held_initial['decisions'] >= 1 and
                      'Could not read your saved decisions' in rpg.inner_text('#igreview') and
                      rpg.locator('#igreview .igr').count() == 0)
            before_retry = dict(calls)
            allow_retry['value'] = True
            rpg.locator('#igreview [data-ig-retry="1"]').click()
            rpg.wait_for_selector('#igreview .igr[data-id="discord:b9-solo"]', timeout=5000)
            check('B14: Retry re-fetches both initial resources and review resumes after the hung request',
                  calls['queue'] > before_retry['queue'] and calls['decisions'] > before_retry['decisions'] and
                  rpg.locator('#igreview [data-ig-retry="1"]').count() == 0 and
                  rpg.locator('#igreview .igr[data-id="discord:b9-solo"]').count() == 1,
                  {'before_retry': before_retry, 'after_retry': calls})
            rpg.context.close()
        # Item 1: visitors never get a dead Discord link; the event's own page is used.
        W = json.dumps({'items': [{'id': 'w1', 'kind': 'week', 'title': 'Week', 'image': '/infographics/g47ix/w1.png', 'publishedAt': '2026-10-05T00:00:00Z', 'post': DISCORD}]})
        wpg = page(api=B9_API, extra={'**/weekly.json*': (W, 200)})
        wpg.wait_for_selector('#weekly .weekly-card'); wpg.click('#weekly .weekly-card'); wpg.wait_for_selector('#weekly-box')
        check('weekly picture: a Discord post is not offered as "Original post"', wpg.locator('#weekly-box a').count() == 0)
        wpg.context.close()
        W2 = W.replace(DISCORD.replace('/', '\\/'), 'https://x.com/g47ix/status/1').replace(DISCORD, 'https://x.com/g47ix/status/1')
        wpg = page(api=B9_API, extra={'**/weekly.json*': (W2, 200)})
        wpg.wait_for_selector('#weekly .weekly-card'); wpg.click('#weekly .weekly-card'); wpg.wait_for_selector('#weekly-box')
        check('weekly picture: a public original post is still linked', wpg.locator('#weekly-box a[href="https://x.com/g47ix/status/1"]').count() == 1)
        wpg.context.close()
        INFO = json.dumps({'events': {'b9cd': {'source': {'label': 'G47IX', 'trust': 'community', 'url': DISCORD, 'observed': '2026-10-09'}, 'infographics': [{'label': 'Infographic - G47IX', 'url': '/infographics/g47ix/b9.png', 'source': 'G47IX', 'sourceUrl': DISCORD, 'alt': 'x'}], 'names': ['Community Day: Bulbasaur'], 'tickets': [], 'info': []}}})
        ipg = page(api=B9_API, extra={'**/event-info.json*': (INFO, 200)})
        # Infographic buttons in the hidden Schedule timeline are now intentionally deferred.
        ipg.click('nav.tabs button[data-tab="events"]')
        ipg.wait_for_function("document.querySelector('#evtimeline [data-igcard=\"leekduck:b9cd\"]')")
        ipg.evaluate("GOINFOGRAPHIC.open('leekduck:b9cd')"); ipg.wait_for_selector('.goinfo-poster'); ipg.wait_for_timeout(200)
        check('event picture viewer: no Discord link, and the poster still names its creator', ipg.evaluate("document.querySelectorAll('a[href*=\"discord.com\"]').length") == 0 and 'G47IX' in ipg.inner_text('.goinfo-poster-top'))
        ipg.evaluate("GOINFOGRAPHIC.close()"); ipg.wait_for_timeout(200)
        ipg.evaluate("GODETAIL.open('leekduck:b9cd')"); ipg.wait_for_selector('#evd:not([hidden]) .evd-btns'); ipg.wait_for_timeout(300)
        check('event sheet: the source button goes to the event\'s own official link, never a Discord post', ipg.evaluate("document.querySelectorAll('a[href*=\"discord.com\"]').length") == 0 and ipg.locator('#evd .evd-btns a[href^="https://leekduck.com/"]').count() == 1)
        ipg.context.close()
        # Item 3: names. Every button on the five main screens has one, and toggles say WHICH event / Pokémon.
        NAME_JS = """() => { const out = [];
          document.querySelectorAll('button,[role=button]').forEach(el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]') || (r.width === 0 && r.height === 0)) return;
            let n = (el.getAttribute('aria-label') || '').trim();
            const lb = el.getAttribute('aria-labelledby'); if (!n && lb) n = lb.split(/\\s+/).map(i => (document.getElementById(i) || {}).textContent || '').join(' ').trim();
            if (!n) n = (el.innerText || el.textContent || '').trim().replace(/[\\u2605\\u2606\\u2715\\u2022\\u203a\\u2039]/g, '').trim();
            if (!n) { const im = el.querySelector('img[alt]'); n = im ? (im.getAttribute('alt') || '').trim() : ''; }
            if (!n) n = (el.getAttribute('title') || '').trim();
            out.push({ n: n, h: el.outerHTML.slice(0, 120), p: el.getAttribute('aria-pressed'), cls: el.className }); });
          return out; }"""
        npg = page(api=B9_API, mobile=True, us={'pref:gen:1': True}, marks={})
        unnamed = []; seen_pressed = []
        def audit(where):
            for r in npg.evaluate(NAME_JS):
                if not r['n']: unnamed.append((where, r['h']))
                seen_pressed.append(r)
        audit('Today')
        for tab in ('events', 'raids', 'collect'):
            npg.dispatch_event('nav.tabs button[data-tab="%s"]' % tab, 'click'); npg.wait_for_selector('#tab-%s:not([hidden])' % tab)
            npg.wait_for_timeout(400); audit(tab)
            for sub in npg.eval_on_selector_all('#subnav-%s button[data-sub]' % tab, 'e=>e.map(x=>x.dataset.sub)'):
                npg.dispatch_event('#subnav-%s [data-sub="%s"]' % (tab, sub), 'click'); npg.wait_for_timeout(350); audit(tab + '/' + sub)
                for mode in npg.eval_on_selector_all('#mode-%s-%s [data-mode]' % (tab, sub), 'e=>e.map(x=>x.dataset.mode)'):
                    npg.dispatch_event('#mode-%s-%s [data-mode="%s"]' % (tab, sub, mode), 'click'); npg.wait_for_timeout(350); audit('%s/%s/%s' % (tab, sub, mode))
        npg.dispatch_event('#hmenu', 'click'); npg.wait_for_timeout(400); audit('Saved')
        for sub in npg.eval_on_selector_all('#subnav-saved button[data-sub]', 'e=>e.map(x=>x.dataset.sub)'):
            npg.dispatch_event('#subnav-saved [data-sub="%s"]' % sub, 'click'); npg.wait_for_timeout(350); audit('Saved/' + sub)
        check('every visible button on Today, Schedule, Raids, Collection and Saved has an accessible name', len(seen_pressed) > 100 and not unnamed, unnamed[:6])
        stars = [r for r in seen_pressed if 'star' in (r['cls'] or '')]
        check('save stars say which event they save and expose their state with aria-pressed', stars and all(r['p'] in ('true', 'false') and r['n'].startswith('Save ') and len(r['n']) > 8 and 'Save event' not in r['n'] for r in stars), [r['n'] for r in stars][:3])
        npg.evaluate("GODETAIL.open('leekduck:b9cd')"); npg.wait_for_selector('#evd:not([hidden]) .star'); npg.wait_for_timeout(300)
        star = npg.locator('#evd .star[data-save="leekduck:b9cd"]')
        before = star.get_attribute('aria-label')
        star.click(); npg.wait_for_timeout(300)
        star = npg.locator('#evd .star[data-save="leekduck:b9cd"]')
        check('tapping the star flips aria-pressed and the name keeps the event', star.get_attribute('aria-pressed') == 'true' and star.get_attribute('aria-label') == before == 'Save Community Day: Bulbasaur', (before, star.get_attribute('aria-label')))
        npg.screenshot(path=OUT+'b9_star_sheet.png'); npg.evaluate("GODETAIL.close()")
        npg.dispatch_event('nav.tabs button[data-tab="collect"]', 'click'); npg.wait_for_timeout(300)
        npg.dispatch_event('#subnav-collect [data-sub="dex"]', 'click'); npg.dispatch_event('#mode-collect-dex [data-mode="species"]', 'click'); npg.wait_for_selector('#dexlist .drow')
        row = npg.locator('#dexlist .drow').first
        rname = row.locator('.nm').evaluate("e=>[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('')")
        labs = row.locator('.dtog button').evaluate_all('els=>els.map(e=>[e.getAttribute("aria-label"),e.textContent,e.getAttribute("aria-pressed")])')
        check('Pokedex row toggles name the Pokemon and the mark, and keep aria-pressed', len(labs) == 6 and all(l[0] == l[1] + ': ' + rname and l[2] in ('true', 'false') for l in labs), (rname, labs[:2]))
        shiny = row.locator('.dtog button.s'); shiny.click(); npg.wait_for_timeout(200)
        check('tapping Shiny sets aria-pressed on that Pokemon only', npg.locator('#dexlist .drow').first.locator('.dtog button.s').get_attribute('aria-pressed') == 'true' and npg.locator('#dexlist .drow').nth(1).locator('.dtog button.s').get_attribute('aria-pressed') == 'false')
        npg.dispatch_event('#mode-collect-dex [data-mode="forms"]', 'click'); npg.fill('#formq', 'vulpix'); npg.wait_for_selector('#formlist .frow'); npg.wait_for_timeout(200)
        fl = npg.locator('#formlist .frow').first
        fname = fl.locator('.fname b').inner_text()
        check('Have / Need buttons on the forms list name the form', fl.locator('[data-val="1"]').get_attribute('aria-label') == 'Have: ' + fname and fl.locator('[data-val="0"]').get_attribute('aria-label') == 'Need: ' + fname)
        npg.context.close()


    if on('b'):
        # Batch 9: hidden secondary views stay unrendered on Today and mount when their view is opened.
        secondary_page = page()
        secondary_state = secondary_page.evaluate("""() => ({
          today: document.querySelector('#home-now')?.children.length || 0,
          todayKey: document.querySelector('#home-now')?.getAttribute('data-render-key') || '',
          thisWeek: document.querySelector('#week')?.children.length || 0,
          weekText: document.querySelector('#week')?.textContent || '',
          timeline: document.querySelector('#evtimeline')?.children.length || 0,
          weekstrip: document.querySelector('#weekstrip')?.children.length || 0,
          calendar: document.querySelector('#calgrid')?.children.length || 0,
          travel: document.querySelector('#travel-results')?.children.length || 0,
          raids: document.querySelector('#rotnow')?.children.length || 0,
          opps: document.querySelector('#opps')?.children.length || 0,
          saved: document.querySelector('#savedev')?.children.length || 0,
          followed: document.querySelector('#followed')?.children.length || 0
        })""")
        check('Today and its This Week section render eagerly while hidden secondary views remain unrendered',
              secondary_state['today'] > 0 and secondary_state['todayKey'] and secondary_state['thisWeek'] > 0 and
              all(secondary_state[k] == 0 for k in ['timeline','weekstrip','calendar','travel','raids','opps','saved','followed']), secondary_state)
        def secondary_click(selector): secondary_page.locator(selector).dispatch_event('click')
        secondary_click('nav.tabs button[data-tab="events"]')
        timeline_ok = settle(secondary_page, "document.querySelector('#evtimeline')?.children.length > 0 && document.querySelector('#weekstrip')?.children.length > 0")
        secondary_click('#subnav-events button[data-sub="calendar"]')
        calendar_ok = settle(secondary_page, "document.querySelectorAll('#calgrid button.cc').length > 0")
        secondary_click('#subnav-events button[data-sub="travel"]')
        travel_ok = settle(secondary_page, "document.querySelectorAll('#travel-regions button[data-travel-region]').length === 5 && document.querySelector('#travel-results')?.children.length > 0")
        secondary_click('nav.tabs button[data-tab="raids"]')
        raids_ok = settle(secondary_page, "document.querySelector('#rotnow')?.children.length > 0")
        secondary_click('nav.tabs button[data-tab="collect"]')
        secondary_page.evaluate("document.getElementById('sub-opps').hidden=false; document.dispatchEvent(new CustomEvent('gofn-view',{detail:{tab:'collect',sub:'opps'}}))")
        opps_ok = settle(secondary_page, "document.querySelector('#opps')?.children.length > 0")
        secondary_click('#hmenu')
        menu_ok = settle(secondary_page, "document.querySelector('#followed')?.children.length > 0")
        secondary_click('#hwatch')
        saved_ok = settle(secondary_page, "document.querySelector('#savedev')?.children.length > 0")
        secondary_click('nav.tabs button[data-tab="now"]')
        returned = secondary_page.evaluate("""() => ({
          todayKey: document.querySelector('#home-now')?.getAttribute('data-render-key') || '',
          thisWeek: document.querySelector('#week')?.textContent || '',
          todayVisible: !document.querySelector('#tab-now')?.hidden
        })""")
        check('Timeline, Calendar, Travel, Battle, Opportunities and Watchlist render on activation; Today and This Week remain unchanged on return',
              timeline_ok and calendar_ok and travel_ok and raids_ok and opps_ok and menu_ok and saved_ok and returned['todayVisible'] and
              returned['todayKey'] == secondary_state['todayKey'] and returned['thisWeek'] == secondary_state['weekText'],
              {'timeline':timeline_ok,'calendar':calendar_ok,'travel':travel_ok,'raids':raids_ok,'opps':opps_ok,'menu':menu_ok,'saved':saved_ok,'returned':returned})
        secondary_page.context.close()
    if on('c'):
        # ---- Batch 10: Today header, status notice, hero card footer, in-person grouping, week strip (real browser, 320 to 430 px) ----
        B10_CLOCK = '2026-11-02T09:30:00+11:00'
        def b10_500(pg): pg.route('**/api/events', lambda route, request=None: route.fulfill(status=500, body='{}', content_type='application/json'))
        B10_COLOR_JS = """
          const rgba = c => { const x = document.createElement('canvas').getContext('2d', { willReadFrequently: true }); x.clearRect(0,0,1,1); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0,0,1,1); return [...x.getImageData(0,0,1,1).data]; };
          const lum = ([r,g,b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126*f(r) + .7152*f(g) + .0722*f(b); };
          const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1,l2) + .05) / (Math.min(l1,l2) + .05); };
          const solid = (el) => { for (let n = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] === 255) return c; } return rgba(getComputedStyle(document.documentElement).getPropertyValue('--color-canvas') || '#000'); };
        """
        for width in (320, 375, 390, 430):
            tp = page(clock=B10_CLOCK, width=width, height=844, mobile=True)
            tp.wait_for_selector('#fresh-line:not([hidden]) button')
            m = tp.evaluate("""() => {
                const vw = window.visualViewport.width, h = document.querySelector('header.top'), kids = [document.querySelector('header.top h1'), document.querySelector('header.top .date'), document.querySelector('.hbtns')];
                const boxes = kids.map(k => k.getBoundingClientRect()), btns = [...document.querySelectorAll('.hbtns .hbtn:not([hidden])')].map(b => b.getBoundingClientRect());
                // the buttons must not intersect the title or the date (a shared row is fine as long as the boxes do not touch)
                const titleBlock = boxes[0], hb = boxes[2], hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
                const overlap = [...document.querySelectorAll('.hbtns .hbtn:not([hidden])')].some(bt => hit(bt.getBoundingClientRect(), titleBlock) || hit(bt.getBoundingClientRect(), boxes[1]));
                const fl = document.getElementById('fresh-line'), flb = fl.querySelector('button'), rg = document.createRange(), tn = [...flb.childNodes].find(n => n.nodeType === 3); rg.selectNodeContents(tn);
                const flTops = new Set([...rg.getClientRects()].filter(r => r.width > 0 && r.height > 0 && r.height < 30).map(r => Math.round(r.top / 4)));
                return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, vw, headerH: Math.round(h.getBoundingClientRect().height), btnRight: Math.max(...btns.map(b => b.right)), btnLeft: Math.min(...btns.map(b => b.left)), btnMinH: Math.min(...btns.map(b => b.height)), btnMinW: Math.min(...btns.map(b => b.width)),
                         overlap, titleRight: titleBlock.right, titleLeft: titleBlock.left, dateBottom: boxes[1].bottom, hbTop: hb.top, flLines: flTops.size, flText: flb.innerText };
            }""")
            check('Batch 10, %dpx: Today has no horizontal overflow and the header stays inside the screen with 44px buttons' % width,
                  m['sw'] <= m['iw'] and abs(m['vw'] - m['iw']) <= 0.5 and m['btnRight'] <= m['vw'] + 0.5 and m['btnLeft'] >= 0 and m['btnMinH'] >= 43.5 and m['btnMinW'] >= 43.5 and m['titleLeft'] >= 0, m)
            check('Batch 10, %dpx: the header is one or two tidy rows (buttons never overlap the title or date, header under 105px)' % width,
                  not m['overlap'] and m['headerH'] <= 105, m)
            check('Batch 10, %dpx: the feed freshness line fits in two lines' % width, 0 < m['flLines'] <= 2, m)
            f = tp.evaluate("""() => {
                const card = document.querySelector('#home-now .evc.cmp'); if (!card) return null;
                const cr = card.getBoundingClientRect(), kids = [...card.querySelectorAll('.evc-foot > *')].map(e => e.getBoundingClientRect());
                const star = card.querySelector('.evc-foot .star').getBoundingClientRect(), det = card.querySelector('.evc-foot [data-open]').getBoundingClientRect();
                const cdn = getComputedStyle(card.querySelector('.cdn'));
                return { n: kids.length, tops: kids.map(k => Math.round(k.top)), centres: kids.map(k => Math.round(k.top + k.height / 2)), starW: star.width, starH: star.height, starAlone: kids.length > 1 && !kids.some(k => k !== star && Math.abs((k.top + k.height / 2) - (star.top + star.height / 2)) < 12),
                         inside: kids.every(k => k.left >= cr.left && k.right <= cr.right + 0.5), detailsW: det.width, detailsH: det.height, cdnBorder: cdn.borderTopWidth };
            }""")
            check('Batch 10, %dpx: the Today hero card footer keeps Details, infographic and the save star on one row, inside the card' % width,
                  f is not None and f['n'] >= 2 and not f['starAlone'] and max(f['centres']) - min(f['centres']) <= 12 and f['inside'] and f['starW'] >= 43.5 and f['starH'] >= 43.5 and f['detailsH'] >= 43.5 and f['detailsW'] >= 80, f)
            check('Batch 10, %dpx: the countdown on the hero card is plain status text, not a bordered pill' % width, f is not None and f['cdnBorder'] == '0px', f)
            g = tp.evaluate("""() => [...document.querySelectorAll('#home-now .today-phase-cards')].map(c => {
                const kids = [...c.children], i = kids.findIndex(k => k.classList.contains('today-sub') && /^in person/i.test(k.innerText.trim())), onl = kids.findIndex(k => k.classList.contains('today-sub') && /^online/i.test(k.innerText.trim())), rows = kids.filter(k => k.classList.contains('agw') && (onl < 0 || kids.indexOf(k) < onl));
                const cnt = i >= 0 ? kids[i].querySelector('.today-phase-count').textContent : '';
                return { rows: rows.length, subs: kids.filter(k => k.classList.contains('today-sub') && /^in person/i.test(k.innerText.trim())).length, rowsAllAfterSub: i >= 0 && rows.every(r => kids.indexOf(r) > i), label: i >= 0 ? kids[i].innerText.replace(/\\s+/g, ' ') : '', cnt };
            })""")
            with_rows = [x for x in g if x['rows']]
            check('Batch 10, %dpx: every in-person row sits under one "In person" label with the right count in each group (overseas rows included)' % width,
                  with_rows and all(x['subs'] == 1 and x['rowsAllAfterSub'] and x['label'].lower().startswith('in person') and x['cnt'] == str(x['rows']) for x in with_rows), g)
            tp.context.close()
        # the saved-copy notice: calm, short, 44px Retry, in both themes and at every phone width
        for width in (320, 375, 390, 430):
            for theme in ('dark', 'light'):
                nb = page(clock=B10_CLOCK, width=width, height=844, mobile=True, pre=b10_500, ready=False)
                settle(nb, "!!document.getElementById('netbar') && !document.getElementById('netbar').hidden", 12000)
                if theme == 'light': nb.evaluate("document.documentElement.setAttribute('data-theme','light')")
                m = nb.evaluate("() => {" + B10_COLOR_JS + """
                    const bar = document.getElementById('netbar'), b = bar.querySelector('b'), btn = bar.querySelector('[data-netretry]'), cs = getComputedStyle(bar), bg = solid(bar), banner = rgba(getComputedStyle(document.documentElement).getPropertyValue('--color-warning-banner') || '#000');
                    const lh = parseFloat(getComputedStyle(b).lineHeight), br = btn.getBoundingClientRect(), r = bar.getBoundingClientRect();
                    return { text: bar.innerText.replace(/\\s+/g, ' '), h: Math.round(r.height), lines: Math.round(b.getBoundingClientRect().height / lh), pos: cs.position, btnH: br.height, btnW: br.width, btnInside: br.right <= r.right + 0.5 && br.left >= r.left, barInside: r.left >= 0 && r.right <= window.innerWidth + 0.5,
                             sameAsBanner: bg.slice(0,3).join() === banner.slice(0,3).join(), textRatio: ratio(rgba(getComputedStyle(b).color), bg), linkRatio: ratio(rgba(getComputedStyle(btn).color), bg), sw: document.documentElement.scrollWidth, iw: window.innerWidth };
                }""")
                tag = 'Batch 10, %dpx %s' % (width, theme)
                check(tag + ': saved-copy notice keeps its meaning and its Try again button', 'saved copy' in m['text'] and 'Try again' in m['text'], m)
                check(tag + ': saved-copy notice is compact (two lines of text, under 75px tall), inline (not sticky) and not the loud warning-banner colour', m['lines'] <= 2 and m['h'] <= 75 and m['pos'] != 'sticky' and not m['sameAsBanner'], m)
                check(tag + ': Try again is a 44px target inside the notice, with no horizontal overflow', m['btnH'] >= 43.5 and m['btnW'] >= 43.5 and m['btnInside'] and m['barInside'] and m['sw'] <= m['iw'], m)
                check(tag + ': notice text and Try again meet AA contrast (4.5:1) on the notice surface', m['textRatio'] >= 4.5 and m['linkRatio'] >= 4.5, m)
                nb.context.close()

        # ---- Batch 12: "In person" means in person; no-venue world items are labelled honestly; one stale message; row action labels; hero art; week strip observer ----
        B12_WORLD = json.dumps({'updated': '2026-11-02T00:00:00Z', 'events': [
            {'id': 'w-b12-tokyo', 'name': 'Zorblax Expo Tokyo', 'place': 'Tokyo, Japan', 'area': 'Asia', 'scope': 'regional', 'start': '2026-11-01', 'end': '2026-11-09', 'sources': [{'url': 'https://example.com/a'}]},
            {'id': 'w-b12-chicago', 'name': 'Quillfeather Meetup Chicago', 'place': 'Chicago, USA', 'area': 'Americas', 'scope': 'regional', 'start': '2026-11-02', 'end': '2026-11-02', 'sources': [{'url': 'https://example.com/b'}]},
            {'id': 'w-b12-later', 'name': 'Brimstone Night Lisbon', 'place': 'Lisbon, Portugal', 'area': 'Europe', 'scope': 'regional', 'start': '2026-11-02T18:00:00+11:00', 'end': '2026-11-02T22:00:00+11:00', 'sources': [{'url': 'https://example.com/c'}]},
            {'id': 'w-b12-g1', 'name': 'Snorfwhistle Worldwide Showcase', 'place': '', 'area': 'Worldwide', 'scope': 'global', 'start': '2026-11-01', 'end': '2026-11-05', 'sources': [{'url': 'https://example.com/d'}]},
            {'id': 'w-b12-g2', 'name': 'Plinkerton Play from anywhere', 'place': 'Play from anywhere', 'area': 'Worldwide', 'scope': 'global', 'start': '2026-11-02T20:00:00+11:00', 'end': '2026-11-02T23:00:00+11:00', 'sources': [{'url': 'https://example.com/e'}]},
        ]})
        for width in (320, 390):
            wp = page(clock=B10_CLOCK, width=width, height=844, mobile=True, extra={'**/world-events.json': (B12_WORLD, 200)})
            r = wp.evaluate("""() => {
                const norm = t => t.replace(/\\s+/g, ' ').trim();
                const out = { subs: [], inPersonRows: 0, inPersonNames: [], onlineNames: [], labelTotal: 0 };
                document.querySelectorAll('#home-now .today-phase-cards').forEach(c => {
                    let cur = '';
                    [...c.children].forEach(k => {
                        if (k.classList.contains('today-sub')) { cur = norm(k.querySelector('span').textContent).toLowerCase(); out.subs.push([cur, +k.querySelector('.today-phase-count').textContent]); }
                        else if (k.classList.contains('agw')) { const n = k.querySelector('.agt b').textContent; if (cur === 'in person') { out.inPersonRows++; out.inPersonNames.push(n); } else out.onlineNames.push([cur, n]); }
                    });
                });
                out.labelTotal = out.subs.filter(s => s[0] === 'in person').reduce((a, s) => a + s[1], 0);
                out.brief = +document.getElementById('day-inperson-count').textContent; out.briefGame = +document.getElementById('day-live-count').textContent;
                out.liveGroup = (document.querySelector('#home-now .today-phase-group .today-phase-count') || {}).textContent;
                return out;
            }""")
            check('Batch 12, %dpx: the "In person" label count equals the in-person rows and the brief in-person number (here the live ones; one more is later today)' % width,
                  r['labelTotal'] == r['inPersonRows'] == 3 and r['brief'] == 2, r)
            check('Batch 12, %dpx: overseas in-person events (Tokyo, Chicago, Lisbon) are all still listed under "In person"' % width,
                  sorted(r['inPersonNames']) == ['Brimstone Night Lisbon', 'Quillfeather Meetup Chicago', 'Zorblax Expo Tokyo'], r)
            check('Batch 12, %dpx: global / play-from-anywhere items are never under "In person"; they sit under "Online / worldwide" and still count as in game' % width,
                  all(n[0] == 'online / worldwide' for n in r['onlineNames']) and sorted(n[1] for n in r['onlineNames']) == ['Plinkerton Play from anywhere', 'Snorfwhistle Worldwide Showcase'] and r['briefGame'] >= 1, r)
            wp.context.close()
        # regional-events.json is a fallback, not a second feed: exercise its scope-less source schema
        # separately with an empty world-events.json, matching dash.js's actual loader sequence.
        B12_REGIONAL = json.dumps({'updated': '2026-11-02', 'note': 'test fixture', 'source': {
            'label': 'Test fixture', 'url': 'https://example.com/regional', 'observed': '2026-11-02'
        }, 'events': [
            {'id': 'rg-b12-wellington', 'name': 'Synthetic Regional Meetup Wellington', 'place': 'Wellington, New Zealand', 'area': 'Oceania', 'start': '2026-11-02', 'end': '2026-11-02'}
        ]})
        B12_EMPTY_WORLD = json.dumps({'updated': '2026-11-02', 'events': []})
        for width in (320, 390):
            rp = page(clock=B10_CLOCK, width=width, height=844, mobile=True, extra={
                '**/world-events.json': (B12_EMPTY_WORLD, 200),
                '**/regional-events.json': (B12_REGIONAL, 200)
            })
            shown = settle(rp, "Array.from(document.querySelectorAll('#home-now .agw .agt b')).some(e => e.textContent.includes('Synthetic Regional Meetup Wellington'))", 10000)
            r = rp.evaluate("""() => {
                const norm = t => t.replace(/\\s+/g, ' ').trim();
                const out = { subs: [], inPersonRows: 0, inPersonNames: [], onlineNames: [], labelTotal: 0 };
                document.querySelectorAll('#home-now .today-phase-cards').forEach(c => {
                    let cur = '';
                    [...c.children].forEach(k => {
                        if (k.classList.contains('today-sub')) { cur = norm(k.querySelector('span').textContent).toLowerCase(); out.subs.push([cur, +k.querySelector('.today-phase-count').textContent]); }
                        else if (k.classList.contains('agw')) { const n = k.querySelector('.agt b').textContent; if (cur === 'in person') { out.inPersonRows++; out.inPersonNames.push(n); } else out.onlineNames.push([cur, n]); }
                    });
                });
                out.labelTotal = out.subs.filter(s => s[0] === 'in person').reduce((a, s) => a + s[1], 0);
                out.brief = +document.getElementById('day-inperson-count').textContent;
                out.briefGame = +document.getElementById('day-live-count').textContent;
                return out;
            }""")
            check('Batch 12 fallback, %dpx: empty world list loads the scope-less regional source record' % width,
                  shown and r['inPersonNames'] == ['Synthetic Regional Meetup Wellington'], r)
            check('Batch 12 fallback, %dpx: regional record remains in the unfolded In person group and counts agree' % width,
                  r['labelTotal'] == r['inPersonRows'] == r['brief'] == 1, r)
            rp.context.close()
        # one problem, one message: with the saved-copy notice showing, the freshness line steps aside
        for width in (320, 390):
            sp2 = page(clock=B10_CLOCK, width=width, height=844, mobile=True, pre=b10_500, ready=False)
            settle(sp2, "!!document.getElementById('netbar') && !document.getElementById('netbar').hidden", 12000)
            sp2.wait_for_timeout(1500)
            m = sp2.evaluate("""() => { const nb = document.getElementById('netbar'), fl = document.getElementById('fresh-line'), vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
                return { net: nb.innerText.replace(/\\s+/g, ' '), netRole: nb.getAttribute('role'), freshVisible: vis(fl), freshText: fl.innerText, retry: !!nb.querySelector('[data-netretry]') }; }""")
            check('Batch 12, %dpx: with the saved-copy notice showing there is one message (no second "Live feed not connected" line), with the date, Try again and status role' % width,
                  not m['freshVisible'] and 'saved copy' in m['net'] and ' from ' in m['net'] and m['retry'] and m['netRole'] == 'status', m)
            sp2.context.close()
        # row actions say what they do
        ap = page(clock=B10_CLOCK, width=320, height=844, mobile=True)
        a = ap.evaluate("""() => [...document.querySelectorAll('#home-now .agw')].slice(0, 4).map(w => {
            const ig = w.querySelector('.agig'), hd = w.querySelector('[data-hide]'), cap = (e, pseudo) => getComputedStyle(e, pseudo).content;
            const rect = e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; };
            return { igCap: ig.classList.contains('igthumb') ? 'thumb' : cap(ig, '::after'), igLabel: ig.getAttribute('aria-label'), hideText: hd.innerText.replace(/\\s+/g, ' ').trim(), hideLabel: hd.getAttribute('aria-label'), hideTitle: hd.title, igSize: rect(ig), hideSize: rect(hd), name: w.querySelector('.agt b').textContent };
        })""")
        check('Batch 12: in-person row buttons are captioned ("Poster"/thumbnail and "Hide"), keep names with the event, are 44px, and Hide says it only hides',
              a and all(x['hideText'].lower().endswith('hide') and x['hideLabel'] == 'Hide ' + x['name'] and 'again' in x['hideTitle'].lower() and x['hideSize'][0] >= 43.5 and x['hideSize'][1] >= 43.5 and x['igSize'][0] >= 43.5 and x['igSize'][1] >= 43.5
                        and x['igLabel'].endswith(x['name']) and (x['igCap'] in ('thumb', '"Poster"')) for x in a), a)
        ap.context.close()
        # a card whose pictures all fail to load does not reserve an empty art column
        hp = page(clock=B10_CLOCK, width=320, height=844, mobile=True)
        h = hp.evaluate("""() => { const c = document.querySelector('#home-now .evc.cmp'), art = c.querySelector('.evc-art'); return { imgs: c.querySelectorAll('.evc-art img').length, artDisplay: getComputedStyle(art).display, mainW: Math.round(c.querySelector('.evc-main').getBoundingClientRect().width), cardW: Math.round(c.getBoundingClientRect().width), firstChildTop: Math.round(c.querySelector('.evc-main').getBoundingClientRect().top - c.getBoundingClientRect().top) }; }""")
        check('Batch 12: the hero card has no empty art block when its pictures are gone (art column collapsed, content starts at the card padding)',
              (h['imgs'] > 0 or (h['artDisplay'] == 'none' and h['mainW'] >= h['cardW'] - 36 and h['firstChildTop'] <= 20)), h)
        hp.context.close()
        # week strip: re-rendering must not pile up observers on detached strips
        wk = page(clock='2026-12-20T10:00:00+11:00', width=320, height=844, mobile=True)
        wk.evaluate("""() => { window.__ro = { made: 0, obs: 0, disc: 0 }; const R = window.ResizeObserver; window.ResizeObserver = class extends R { constructor(cb) { super(cb); window.__ro.made++; } observe(t) { window.__ro.obs++; return super.observe(t); } disconnect() { window.__ro.disc++; return super.disconnect(); } }; }""")
        wk.dispatch_event('nav.tabs button[data-tab="events"]', 'click'); wk.wait_for_selector('#tab-events:not([hidden]) #weekstrip .wd')
        for _ in range(5): wk.dispatch_event('#weekstrip [data-wk="1"]', 'click'); wk.wait_for_timeout(150)
        ro = wk.evaluate("window.__ro")
        check('Batch 12: re-rendering the week strip reuses one ResizeObserver (at most one created, previous strip released with disconnect)', ro['made'] <= 1 and ro['obs'] >= 5 and ro['disc'] >= ro['obs'] - 1, ro)
        wk.context.close()
        # status dots in the light theme reach 3:1 against the card surface
        lp = page(clock=B10_CLOCK, width=390, height=844, mobile=True)
        lp.evaluate("document.documentElement.setAttribute('data-theme','light')")
        lc = lp.evaluate("() => {" + B10_COLOR_JS + """
            const cs = getComputedStyle(document.documentElement), bg = rgba(cs.getPropertyValue('--color-surface-card').trim() || '#fff'), canvas = rgba(cs.getPropertyValue('--color-canvas').trim() || '#fff');
            return { stale: ratio(rgba(cs.getPropertyValue('--color-source-stale').trim()), bg), failed: ratio(rgba(cs.getPropertyValue('--color-source-failed').trim()), bg), staleC: ratio(rgba(cs.getPropertyValue('--color-source-stale').trim()), canvas), failedC: ratio(rgba(cs.getPropertyValue('--color-source-failed').trim()), canvas) }; }""")
        check('Batch 12: amber and failed status dots are at least 3:1 on the light surfaces', min(lc.values()) >= 3.0, lc)
        lp.context.close()
        # week strip: seven 44px days; at 320px it scrolls and snaps with an edge cue, and a chosen Sunday stays in view
        for width in (320, 375, 390, 430):
            sp = page(clock='2026-12-20T10:00:00+11:00', width=width, height=844, mobile=True)
            sp.dispatch_event('nav.tabs button[data-tab="events"]', 'click'); sp.wait_for_selector('#tab-events:not([hidden]) #weekstrip .wd'); sp.wait_for_timeout(400)
            m = sp.evaluate("""() => {
                const s = document.querySelector('#weekstrip .wk-days'), r = s.getBoundingClientRect(), days = [...s.querySelectorAll('.wd')].map(d => d.getBoundingClientRect());
                return { n: days.length, minW: Math.min(...days.map(d => d.width)), scrolls: s.scrollWidth > s.clientWidth + 1, more: s.getAttribute('data-more'), snap: getComputedStyle(s).scrollSnapType, allVisible: days.every(d => d.left >= r.left - 0.5 && d.right <= r.right + 0.5), sw: document.documentElement.scrollWidth, iw: window.innerWidth };
            }""")
            check('Batch 10, week strip %dpx: seven 44px+ days, no page overflow, and either every day is visible or the strip snaps and shows an edge cue' % width,
                  m['n'] == 7 and m['minW'] >= 43.5 and m['sw'] <= m['iw'] and (m['allVisible'] or (m['scrolls'] and 'x' in m['snap'] and m['more'] and 'r' in m['more'])), m)
            if m['scrolls']:
                sp.evaluate("document.querySelector('#weekstrip .wk-days').scrollLeft = 9999"); sp.wait_for_timeout(200)
                e = sp.evaluate("""() => { const s = document.querySelector('#weekstrip .wk-days'), r = s.getBoundingClientRect(), days = [...s.querySelectorAll('.wd')], last = days[6].getBoundingClientRect(); return { lastVisible: last.right <= r.right + 0.5 && last.left >= r.left - 0.5, more: s.getAttribute('data-more') }; }""")
                check('Batch 10, week strip %dpx: scrolled to the end, Sunday is fully visible and the right-edge cue is gone' % width, e['lastVisible'] and 'r' not in (e['more'] or ''), e)
                sp.evaluate("document.querySelector('#weekstrip .wk-days').scrollLeft = 0"); sp.wait_for_timeout(100)
                sp.dispatch_event('#weekstrip .wd:nth-child(7)', 'click'); sp.wait_for_timeout(400)
                v = sp.evaluate("""() => { const s = document.querySelector('#weekstrip .wk-days'), r = s.getBoundingClientRect(), sel = s.querySelector('.wd.sel'); const b = sel && sel.getBoundingClientRect(); return { sel: !!sel, visible: !!b && b.right <= r.right + 0.5 && b.left >= r.left - 0.5 }; }""")
                check('Batch 10, week strip %dpx: choosing the clipped Sunday keeps it in view after the strip re-renders' % width, v['sel'] and v['visible'], v)
            sp.context.close()


    if on('a'):
        # Today shiny rail: only active, source-backed boosts/debuts/availability are shown.
        shiny_data = json.loads((ROOT / 'public' / 'data.json').read_text())
        shiny_data['events'] = [e for e in shiny_data.get('events', []) if e.get('id') not in {
            'shiny-boost-fixture', 'shiny-window-fixture', 'shiny-conflict-fixture', 'shiny-future-fixture', 'shiny-expired-fixture'
        }]
        shiny_data['events'].extend([
            {
                'id':'shiny-boost-fixture','t':'Shiny boost fixture','s':'2026-11-04T09:00','e':'2026-11-04T21:00',
                'status':'community_reported','source':'Leek Duck','sourceUrl':'https://leekduck.com/events/shiny-boost-fixture/',
                'tags':['Shiny'],'highlights':[{'type':'boosted-shiny','label':'BOOSTED SHINY · Electrike'}],
                'art':[{'n':'Electrike','shiny':1,'label':'Boosted odds'}]
            },
            {
                'id':'shiny-window-fixture','t':'Windowed shiny fixture','s':'2026-11-04T09:00','e':'2026-11-08T21:00',
                'status':'community_reported','source':'Leek Duck','sourceUrl':'https://leekduck.com/events/shiny-window-fixture/',
                'tags':['Shiny'],'highlights':[{'type':'boosted-shiny','label':'BOOSTED SHINY · Hisuian Growlithe (Incense, Nov 6–8)'}],
                'art':[{'n':'Hisuian Growlithe','shiny':1,'label':'Boosted from Nov 6'}]
            },
            {
                'id':'shiny-conflict-fixture','t':'Conflicting shiny fixture','s':'2026-11-04T09:00','e':'2026-11-04T21:00',
                'status':'conflicting','source':'Official Pokémon GO','sourceUrl':'https://pokemongo.com/news/shiny-conflict-fixture',
                'tags':['Shiny'],'art':[{'n':'Mewtwo','shiny':1,'label':'Boosted odds'}]
            },
            {
                'id':'shiny-future-fixture','t':'Future shiny fixture','s':'2026-11-05T10:00','e':'2026-11-05T20:00',
                'status':'community_reported','source':'Leek Duck','sourceUrl':'https://leekduck.com/events/shiny-future-fixture/',
                'tags':['Shiny'],'art':[{'n':'Elekid','shiny':1,'label':'Shiny debut'}]
            },
            {
                'id':'shiny-expired-fixture','t':'Expired shiny fixture','s':'2026-11-01T10:00','e':'2026-11-03T20:00',
                'status':'community_reported','source':'Leek Duck','sourceUrl':'https://leekduck.com/events/shiny-expired-fixture/',
                'tags':['Shiny'],'art':[{'n':'Murkrow','shiny':1,'label':'Shiny available'}]
            }
        ])
        shiny_page = page(clock='2026-11-04T10:31:00+11:00', extra={'**/data.json*':(json.dumps(shiny_data),200)})
        shiny_page.wait_for_function("document.getElementById('today-shiny')?.getAttribute('aria-busy') === 'false'", timeout=15000)
        shiny_cards = shiny_page.locator('#today-shiny-list .today-shiny-card')
        shiny_text = shiny_page.locator('#today-shiny').inner_text()
        check('Today shiny rail shows only active source-backed boosts and shiny debuts',
              shiny_cards.count()==2 and 'Electrike' in shiny_text and 'Greavard' in shiny_text and
              'Hisuian Growlithe' not in shiny_text and 'Mewtwo' not in shiny_text and
              'Elekid' not in shiny_text and 'Murkrow' not in shiny_text, shiny_text)
        check('boosted odds and a shiny debut are explicitly distinguished without invented rates',
              shiny_page.locator('[data-shiny-kind="boosted"]').count()==1 and
              shiny_page.locator('[data-shiny-kind="debut"]').count()==1 and
              not re.search(r'\b\d+(?:\.\d+)?\s*%', shiny_text), shiny_text)
        sources = shiny_page.locator('#today-shiny-list .today-shiny-source')
        check('shiny cards preserve official versus community source attribution and disclose missing check dates',
              sources.count()==2 and
              'Community · Leek Duck · Check date not recorded' in shiny_text and
              'Official · Official Pokémon GO · Check date not recorded' in shiny_text and
              all('noopener' in (sources.nth(i).get_attribute('rel') or '') for i in range(sources.count())), shiny_text)
        check('shiny cards show the source-published event date window, without converting venue-local times',
              '1–5 Nov 2026' in shiny_text and '4 Nov 2026' in shiny_text, shiny_text)
        check('Today shiny rail does not claim a source check from the older dataset as-of date',
              '30 Oct 2026' not in shiny_text)
        open_shiny_event = shiny_page.locator('#today-shiny-list .today-shiny-open').first
        open_shiny_event.focus()
        shiny_page.clock.fast_forward(60000)
        check('minute refresh preserves keyboard focus on an unchanged shiny card',
              shiny_page.evaluate("document.activeElement?.classList.contains('today-shiny-open')"))
        check('shiny rail has an explicit keyboard focus-visible treatment',
              '.today-shiny-open:focus-visible' in DASH_CSS and '.today-shiny-source:focus-visible' in DASH_CSS)
        theme_contrast = shiny_page.evaluate("""() => {
          function rgb(value) {
            if (value[0] === '#') { const h=value.slice(1); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); }
            const m=value.match(/rgba?\\(([^)]+)\\)/i);
            if(m) return m[1].split(',').slice(0,3).map(Number);
            const v=(value.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);
            return value.startsWith('color(srgb')?v.map(x=>x*255):v;
          }
          function lum(value) { return rgb(value).map(x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0); }
          function ratio(a,b) { const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
          const out={};
          for(const theme of ['light','dark']) {
            document.documentElement.setAttribute('data-theme',theme);
            const el=document.querySelector('[data-shiny-kind="boosted"] .today-shiny-badge');
            const s=getComputedStyle(el); out[theme]={ratio:ratio(s.color,s.backgroundColor),fg:s.color,bg:s.backgroundColor};
          }
          return out;
        }""")
        check('shiny badges retain readable contrast in light and dark themes',
              theme_contrast['light']['ratio']>=4.5 and theme_contrast['dark']['ratio']>=4.5, theme_contrast)
        open_shiny_event.press('Enter')
        shiny_opened = settle(shiny_page, "!!document.querySelector('#evd:not([hidden])') && /Shiny boost fixture/.test(document.getElementById('evd-t')?.textContent || '')", 10000)
        check('keyboard activation opens the matching event detail from the shiny rail', shiny_opened)
        shiny_page.locator('#evd-x').click()
        shiny_returned = settle(shiny_page, "document.querySelector('#evd')?.hidden === true && document.activeElement?.classList.contains('today-shiny-open')", 5000)
        check('closing a shiny-linked event detail restores focus to its Today card', shiny_returned)
        responsive = {}
        for width in (320,390,1280):
            shiny_page.set_viewport_size({'width':width,'height':844}); shiny_page.wait_for_timeout(80)
            responsive[width] = shiny_page.evaluate("""() => {
              const panel=document.getElementById('today-shiny'), rail=document.getElementById('today-shiny-list');
              return {page:[document.documentElement.scrollWidth,innerWidth],panel:Math.round(panel.getBoundingClientRect().width),
                rail:Math.round(rail.getBoundingClientRect().width)};
            }""")
        check('Today shiny rail has no page overflow at 320px, 390px or desktop',
              all(v['page'][0] <= v['page'][1] and v['panel'] <= v['page'][1] for v in responsive.values()), responsive)
        shiny_page.emulate_media(reduced_motion='reduce')
        check('shiny rail respects reduced-motion preferences',
              shiny_page.evaluate("getComputedStyle(document.getElementById('today-shiny-list')).scrollBehavior") in ('auto','initial'))
        shiny_page.context.close()
        check('Today shiny rail assets are versioned in the offline shell',
              DASH_URL.endswith('dash.js?v=20261104g') and DASH_CSS_URL.endswith('dash.css?v=20261104g') and
              APP_URL.endswith('app.js?v=20261104f') and SHELL_CACHE=='gofn-shell-v240' and
              '/research.js?v=20261104b' in SW_JS and '/data.json' in SW_JS)

    if on('c'):
        # Purchase Planner: ticket availability is sourced, registration is not called a sale, and official links remain touch-sized.
        ticket_data = json.loads((ROOT / 'public' / 'tickets-external.json').read_text())
        ticket_log = json.dumps({'updated':'2026-11-03T00:00:00Z','watchStart':'2026-10-01T00:00:00Z','items':[]})
        ticket_api = json.dumps({'enabled':True,'events':[ev('ticket-fixture-%d'%i,'Ticket fixture %d'%i,'event','2026-11-01T10:00:00','2026-11-08T20:00:00','confirmed') for i in range(10)]})
        ticket_extra = {'**/tickets-external.json':(json.dumps(ticket_data),200),'**/store-log.json':(ticket_log,200)}
        for width in (320,390,1280):
            tp = page(api=ticket_api,clock='2026-11-03T12:00:00+11:00',width=width,height=900,mobile=width<500,extra=ticket_extra)
            loaded = settle(tp,"document.querySelectorAll('#buy-body .by-ext').length===2",15000)
            if loaded:
                if width==1280:
                    tp.locator('#buy-sec summary').focus()
                    tp.keyboard.press('Enter')
                else:
                    tp.locator('#buy-sec summary').click()
            opened = settle(tp,"document.querySelector('#buy-sec details.buyplan').open",3000)
            tp.evaluate("document.documentElement.setAttribute('data-theme',%s)" % json.dumps('light' if width==390 else 'dark'))
            state = tp.evaluate("""() => {
                const cards=[...document.querySelectorAll('#buy-body .by-ext')];
                return {cards:cards.map(card=>({text:card.innerText.replace(/\\s+/g,' ').trim(),links:[...card.querySelectorAll('a')].map(a=>{const r=a.getBoundingClientRect();return {text:a.textContent.trim(),href:a.href,height:r.height};})})),width:document.documentElement.scrollWidth,viewport:innerWidth};
            }""")
            sendai = next((x for x in state['cards'] if 'Sendai' in x['text']),None)
            mexico = next((x for x in state['cards'] if 'Mexico City' in x['text']),None)
            check('Purchase Planner %dpx: Sendai registration is not mislabeled as a closed sale; Mexico City shows verified availability and both show 3 Nov source checks' % width,
                  loaded and opened and sendai is not None and mexico is not None and
                  'Registration ended 15 Sep JST · ticket availability unconfirmed' in sendai['text'] and
                  'Tickets available' in mexico['text'] and
                  sendai['text'].count('Official source checked 3 Nov 2026')==1 and
                  mexico['text'].count('Official source checked 3 Nov 2026')==1,state)
            source_links = [a for card in state['cards'] for a in card['links'] if a['text']!='Open ticket site']
            check('Purchase Planner %dpx: official source links are allowlisted, named and at least 44px high' % width,
                  len(source_links)>=4 and all(a['href'].startswith('https://pokemongo.com/') and a['text'] and a['height']>=43.5 for a in source_links),source_links)
            check('Purchase Planner %dpx: no horizontal overflow or browser errors' % width,
                  state['width']<=state['viewport'] and not tp.errs,state)
            tp.context.close()
    b.close()
# Dashboard radius adoption: shared scale values are expressed through semantic roles.
check('dashboard shared radius declarations consume semantic radius tokens',
      all(f'border-radius:var(--radius-{role})' in DASH_CSS for role in ['sm','md','control','card','panel','lg','xl','pill']) and
      re.search(r'border-radius:\s*(?:8|12|14|16|18|20|22|999)px\b', DASH_CSS) is None)

# Base stylesheet radius adoption: shared scale values are expressed through semantic roles.
check('base stylesheet shared radius declarations consume semantic radius tokens',
      all(f'border-radius:var(--radius-{role})' in BASE_CSS for role in ['md','control','card','panel','lg','xl','pill']) and
      re.search(r'border-radius:\s*[^;}]*\b(?:8|12|14|16|18|20|22|999)px\b[^;}]*[;}]', BASE_CSS) is None)

check('base stylesheet spacing declarations consume semantic 4px-scale tokens',
      all(f'var(--space-{step})' in BASE_COMPONENT_CSS for step in [1, 2, 3, 4, 5, 6, 10]) and
      re.search(r'(?<![-\w])(?:column-gap|row-gap|gap)\s*:\s*(?![^;{}]*[()])[^;{}]*(?<![-\w])(?:4|8|12|16|20|24|28|32|36|40)px\b[^;{}]*(?=;|})', BASE_COMPONENT_CSS) is None and
      re.search(r'(?<![-\w])(?:padding|margin)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?\s*:\s*(?![^;{}]*[()])[^;{}]*(?<![-\w])(?:4|8|12|16|20|24|28|32|36|40)px\b[^;{}]*(?=;|})', BASE_COMPONENT_CSS) is None)

check('dashboard shared gap declarations consume semantic spacing tokens',
      all(f'var(--space-{step})' in DASH_CSS for step in [1, 2, 3, 4, 5, 6, 7]) and
      re.search(r'(?<![-\w])(?:column-gap|row-gap|gap)\s*:\s*(?![^;{}]*[()])[^;{}]*(?<![-\w])(?:4|8|12|16|20|24|28|32|36|40)px\b[^;{}]*(?=;|})', DASH_CSS) is None)
check('dashboard padding and margin declarations consume semantic spacing tokens',
      all(f'var(--space-{step})' in DASH_CSS for step in [1, 2, 3, 4, 5, 7]) and
      re.search(r'(?<![-\w])(?:padding|margin)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?\s*:\s*(?![^;{}]*[()])[^;{}]*(?<![-\w])(?:4|8|12|16|20|24|28|32|36|40)px\b[^;{}]*(?=;|})', DASH_CSS) is None)

# Dynamax, Max Particles and Power Spot accents use named semantic feature roles.
check('Dynamax, Max Particles and Power Spot accents use semantic signal tokens',
      all(token in DASH_CSS for token in [
          '--color-signal-dynamax:#E5484D',
          '--color-signal-max-particles:#C77DFF',
          '--color-signal-power-spot:#2B8A9E',
          '--color-signal-max-particle-tag:#8E4EC6'
      ]) and
      all(selector in DASH_CSS for selector in [
          '.signal-dynamax,.signal-max-battles{border-color:color-mix(in srgb,var(--color-signal-dynamax) 55%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-dynamax) 16%,var(--surface-glass))}',
          '.signal-max-particles{border-color:color-mix(in srgb,var(--color-signal-max-particles) 55%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-max-particles) 16%,var(--surface-glass))}',
          '.signal-power-spots{border-color:color-mix(in srgb,var(--color-signal-power-spot) 60%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-power-spot) 18%,var(--surface-glass))}',
          '.tg-maxdebut{--tc:var(--color-signal-dynamax)}',
          '.signal-highlight-dynamax-debut{border-color:color-mix(in srgb,var(--color-signal-dynamax) 75%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-dynamax) 24%,var(--surface-glass));color:var(--text,#f2f4f8)}',
          '.sp-particle .max-tag{background:var(--color-signal-max-particle-tag)}',
          '.sp-powerspot .max-tag{background:var(--color-signal-power-spot)}'
      ]))

# Feature-specific encounter, ticket and boosted-odds signals use named roles.
check('boosted shiny, ticket, raid/power, egg, wild and transfer signals use semantic roles with unchanged hues',
      all(token in DASH_CSS for token in [
          '--color-signal-boosted-shiny:#FF9F1C',
          '--color-signal-boosted-shiny-tag:#F59E0B',
          '--color-signal-shiny-debut:#D65BD0',
          '--color-signal-ticket:#E93D82',
          '--color-signal-power:#E5484D',
          '--color-signal-raid:#E5484D',
          '--color-signal-egg:#E8A33D',
          '--color-signal-wild:#30A46C',
          '--color-signal-transfer-candy:#35B8C9'
      ]) and
      all(selector in DASH_CSS for selector in [
          '.signal-highlight-boosted-shiny,.signal-highlight-boosted-shiny-odds,.signal-boosted-shiny-odds{border-color:color-mix(in srgb,var(--color-signal-boosted-shiny) 70%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-boosted-shiny) 22%,var(--surface-glass))}',
          '.signal-highlight-shiny-debut{border-color:color-mix(in srgb,var(--color-signal-shiny-debut) 65%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-shiny-debut) 20%,var(--surface-glass))}',
          '.signal-ticket{border-color:color-mix(in srgb,var(--color-signal-ticket) 70%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-ticket) 20%,var(--surface-glass));color:var(--text,#f2f4f8)}',
          '.tg-boostedshiny{--tc:var(--color-signal-boosted-shiny-tag)}',
          '.tg-power{--tc:var(--color-signal-power)}',
          '.tg-raid{--tc:var(--color-signal-raid)}',
          '.tg-egg{--tc:var(--color-signal-egg)}',
          '.tg-wild{--tc:var(--color-signal-wild)}',
          '.signal-transfer-candy{border-color:color-mix(in srgb,var(--color-signal-transfer-candy) 65%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-transfer-candy) 20%,var(--surface-glass))}'
      ]))


# Reuse established semantic roles for remaining shiny, transfer and Max Battle accents.
check('shiny, transfer bonus and Max Battle accents reuse semantic roles without changing hues',
      all(selector in DASH_CSS for selector in [
          '.signal-shiny,.signal-highlight-new-shiny{border-color:color-mix(in srgb,var(--color-signal-shiny) 60%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-shiny) 18%,var(--surface-glass))}',
          '.sb-transfer{border-color:color-mix(in srgb,var(--color-signal-transfer-candy) 70%,var(--border-subtle));background:color-mix(in srgb,var(--color-signal-transfer-candy) 22%,var(--surface-glass))}',
          '.rotc.max{border-color:var(--color-kind-max-battle,#6E56CF)}'
      ]) and '--color-kind-max-battle:#6E56CF' in BASE_CSS)

# Max, Gigantamax and Shadow artwork-tag gradients use semantic roles with unchanged hues.
check('Max, Gigantamax and Shadow artwork-tag gradients use semantic roles with unchanged hues',
      all(token in DASH_CSS for token in [
          '--color-signal-max-tag-start:#c1124d',
          '--color-signal-max-tag-end:#ff4d6d',
          '--color-signal-gmax-tag-start:#b7310f',
          '--color-signal-gmax-tag-end:#ff7a1a',
          '--color-signal-shadow-tag-start:#5b2bb0',
          '--color-signal-shadow-tag-end:#8a3fe0',
          '--color-on-signal-tag:#fff'
      ]) and
      all(selector in DASH_CSS for selector in [
          'color:var(--color-on-signal-tag)',
          '.shadow-tag{background:#5B2BB0}',
          '.shadow-tag{background:linear-gradient(90deg,var(--color-signal-shadow-tag-start),var(--color-signal-shadow-tag-end))}',
          '.max-tag{background:linear-gradient(90deg,var(--color-signal-max-tag-start),var(--color-signal-max-tag-end))}',
          '.max-art.is-gmax .max-tag{background:linear-gradient(90deg,var(--color-signal-gmax-tag-start),var(--color-signal-gmax-tag-end))}'
      ]) and
      all(literal not in DASH_CSS for literal in [
          'linear-gradient(90deg,#5b2bb0,#8a3fe0)',
          'linear-gradient(90deg,#c1124d,#ff4d6d)',
          'linear-gradient(90deg,#b7310f,#ff7a1a)'
      ]))



# Mega red status pills follow the app's explicit theme, independent of OS preference.
check('Mega status pill uses semantic theme roles with light and dark palette values',
      all(token in DASH_CSS for token in [
          '--color-status-mega-pill-bg:#4a1d1d',
          '--color-status-mega-pill-fg:#ffb4ab',
          '--color-status-mega-pill-border:#7a2f2f',
          ':root[data-theme="light"]{',
          '--color-status-mega-pill-bg:#fde8e8',
          '--color-status-mega-pill-fg:#b42318',
          '--color-status-mega-pill-border:#f4b4b0'
      ]) and
      '.mega-pill-red{display:inline-block;align-self:flex-start;margin-top:.35rem;padding:.15rem .6rem;border-radius:var(--radius-pill);background:var(--color-status-mega-pill-bg);color:var(--color-status-mega-pill-fg);border:1px solid var(--color-status-mega-pill-border);font-size:var(--type-label);font-weight:600}' in DASH_CSS and
      '@media (prefers-color-scheme:dark){.mega-pill-red' not in DASH_CSS)



print('\nFAILED:',fails if fails else 'none')
if fails:
    sys.exit(1)
