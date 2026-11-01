"""Browser checks for the Phase 2 dashboard (needs: pip install playwright; a static server: cd public && python3 -m http.server 8791).
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
SHARD=os.environ.get('UI_SHARD','')  # a, b or c runs one third in CI; empty runs everything
def on(k): return SHARD in ('',k)
def ev(i,name,type,start,end,status,feat=None): return {'id':'leekduck:'+i,'name':name,'type':type,'start':start,'end':end,'tzMode':'local','scope':'worldwide_local','region':None,'featured':feat or [],'bonuses':[],'status':status,'reports':[{'source':'leekduck','link':'https://leekduck.com/events/'+i+'/'}]}
def check(name,cond,extra=''):
    print(('PASS ' if cond else 'FAIL ')+name+(' '+str(extra) if extra and not cond else ''))
    if not cond: fails.append(name)

# Design-token contract: semantic roles are shared by the base and dashboard layers,
# and versioned stylesheets are included in the offline shell.
ROOT = Path(__file__).resolve().parent.parent
BASE_CSS = (ROOT / 'public' / 'styles.css').read_text()
BASE_COMPONENT_CSS = BASE_CSS[BASE_CSS.index('*{box-sizing:border-box}'):]
DASH_CSS = (ROOT / 'public' / 'dash.css').read_text()
DASH_JS = (ROOT / 'public' / 'dash.js').read_text()
INDEX_HTML = (ROOT / 'public' / 'index.html').read_text()
SW_JS = (ROOT / 'public' / 'sw.js').read_text()
APP_JS = (ROOT / 'public' / 'app.js').read_text()
SEASON_JS = (ROOT / 'public' / 'season.js').read_text()
SEASON_DATA = json.loads((ROOT / 'public' / 'season.json').read_text())
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
    '--type-meta-compact': 11,
    '--type-body-compact': 9,
    '--type-label': 7,
    '--type-body-sm': 7,
    '--type-overline': 7,
    '--type-button': 6,
    '--type-caption': 6,
    '--type-intro': 4,
    '--type-body-emphasis': 4,
    '--type-stat': 3,
    '--type-heading': 1,
    '--type-caption-compact': 1,
    '--type-body-lg': 1,
}
DASH_TYPE_VALUES = ['.78rem', '.8rem', '.84rem', '.75rem', '.82rem', '.72rem', '.85rem', '.68rem', '1.05rem', '.9rem', '2rem', '1.5rem', '.62rem', '1.1rem']
check('dashboard uses the shared semantic type scale for 79 exact font-size declarations',
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
    '--type-body-sm': 3,
    '--type-caption': 5,
    '--type-meta': 7,
    '--type-heading': 2,
    '--type-meta-compact': 7,
    '--type-body-emphasis': 4,
    '--type-button': 2,
    '--type-label': 9,
    '--type-overline': 9,
    '--type-body-lg': 1,
    '--type-intro': 1,
    '--type-caption-compact': 5,
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
CARD_SOLID_SELECTORS = ['.day-brief', '.today-focus-card']
CARD_BORDER_SELECTORS = [
    '.weekstrip', '.evc', '.pc', '.prio-empty', '.rotc', '.opp', '.evd-card',
    '.tk', '.gencov', '.plc-row', '.srcrow', '.day-brief', '.today-focus-card',
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
      re.search(r'\.today-focus-card\{[^}]*border-radius:var\(--radius-panel\)', DASH_CSS) and
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
check('Today focus strip has four data-backed signals and a responsive semantic surface',
      all(token in INDEX_HTML for token in ['id="today-focus-strip"', 'id="today-focus-now"', 'id="today-focus-next"', 'id="today-focus-raids"', 'id="today-focus-ending"']) and
      all(token in DASH_JS for token in ['function renderTodayStrip', '6 * 60 * 60 * 1000', '48 * 60 * 60 * 1000', 'window.GOSEASON', 'GOSEASON.deadlines', 'gofn-season-ready', 'activity.inGame', 'activity.inPerson', 'D.rotation', 'D.maxBattles']) and
      all(token in DASH_CSS for token in ['.today-focus-strip', '.today-focus-card', 'grid-template-columns:repeat(2,minmax(0,1fr))']))
check('season pass and deadline data is structured, source-attributed and ordered',
      all(item_id in {item.get('id') for item in SEASON_DATA.get('items', [])}
          for item_id in ['season:pass-halloween', 'season:pass-november']) and
      len(SEASON_DATA.get('deadlines', [])) >= 5 and
      all(d.get('source') == 'Leek Duck' and d.get('url', '').startswith('https://leekduck.com/') and
          d.get('s') and d.get('e') and d['s'] < d['e'] for d in SEASON_DATA.get('deadlines', [])) and
      'deadlines: function () { return deadlines; }' in SEASON_JS)
check('150ms interaction transitions use a shared motion role with unchanged easing',
      '--motion-quick:150ms' in BASE_CSS and
      'transition:background-color var(--motion-quick) ease,color var(--motion-quick) ease' in BASE_CSS and
      'transition:transform var(--motion-quick)' in BASE_CSS and
      'transition:transform var(--motion-quick)' in DASH_CSS and
      BASE_CSS.count('var(--motion-quick)') == 3 and DASH_CSS.count('var(--motion-quick)') == 1)
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
      all(url in INDEX_HTML and url in SW_JS for url in ['/styles.css?v=20261101k', '/dash.css?v=20261102c']))
check('owner verification scripts are versioned and precached offline',
      '/account.js?v=20261101b' in INDEX_HTML and '/account.js?v=20261101b' in SW_JS and
      '/review.js?v=20261101b' in DASH_JS and '/review.js?v=20261101b' in SW_JS)
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
      "gofn-shell-v188" in SW_JS)
check('versioned dashboard scripts are referenced by the entry page and precached offline',
      '/app.js?v=20261102a' in INDEX_HTML and '/app.js?v=20261102a' in SW_JS and
      '/dash.js?v=20261102e' in APP_JS and '/dash.js?v=20261102e' in SW_JS and
      '/detail.js?v=20261031a' in DASH_JS and '/detail.js?v=20261031a' in SW_JS)
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
      '/season.js?v=20261102c' in INDEX_HTML and '/season.js?v=20261102c' in SW_JS)
check('all HTML renderers use one shared apostrophe-safe escape helper',
      'function esc(value)' in LIB_JS and 'esc: esc' in LIB_JS and
      all('var esc = window.GOLIB.esc;' in source for source in ESC_RENDERERS) and
      all(not re.search(r'function\s+esc\s*\(', source) and
          not re.search(r'var\s+esc\s*=\s*function', source) for source in ESC_RENDERERS))
check('versioned infographic script is referenced by the dashboard and precached offline',
      '/infographic.js?v=20261101e' in DASH_JS and '/infographic.js?v=20261101e' in SW_JS)
check('infographic card thumbnails assign original URLs only near the viewport',
      'data-thumb-src' in INFO_JS and 'new IntersectionObserver' in INFO_JS and
      "rootMargin: '80px 0px'" in INFO_JS)
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
check('desktop Today uses two columns while mobile preserves action-first order',
      all(token in DASH_CSS for token in ['#tab-now .today-layout{display:flex;flex-direction:column;gap:var(--space-5);min-width:0}', '#tab-now .today-sidebar{display:contents}', '#tab-now #action-centre{order:0}', '#tab-now .today-main{order:1;min-width:0}', '@media(min-width:960px)', 'grid-template-columns:minmax(0,1.55fr) minmax(18rem,.9fr)', '#tab-now .today-sidebar{grid-column:2;display:grid']))
with sync_playwright() as p:
    b=p.chromium.launch()
    def page(api=None,marks=None,clock='2026-10-09T22:45:00+11:00',sources=None,gens=None,us=None,extra=None,pin=False,slow_places=False):
        ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='Australia/Melbourne',locale='en-AU',service_workers='block')
        # Bound default Playwright waits so a lazy asset or missing control cannot stall a whole shard.
        ctx.set_default_timeout(10000)
        ctx.set_default_navigation_timeout(15000)
        pg=ctx.new_page(); pg.errs=[]; pg.season_poster_requests=[]
        pg.on('pageerror',lambda e:pg.errs.append(str(e)))
        pg.on('request',lambda r:pg.season_poster_requests.append(r.url) if any(slug in r.url for slug in ('season-24-twilight-trails','go-pass-october-2026','halloween-2026-part-2','go-pass-november-2026')) else None)
        pg.clock.install(time=clock)
        pg.route('**/api/sources',ful(sources or '{"environment":"production","database":true,"enabled":false,"sources":[]}'))
        pg.route('**/api/events',ful(api or '{"enabled":false,"events":[]}'))
        pg.route(re.compile(r'/(img/ext|infographics)/'),lambda r:r.fulfill(body=PNG1,content_type='image/png'))  # R2 pictures are not in the static folder
        pg.route('**/api/userstate*',lambda r:r.fulfill(status=404,body='{}',content_type='application/json'))
        pg.route('**/api/dex',lambda r:r.fulfill(status=401,body='{}',content_type='application/json'))
        pg.route('**/api/art*',lambda r:r.fulfill(status=404,body=''))
        for pat,(body,st) in (extra or {}).items(): pg.route(pat,(lambda body,st:(lambda r,req=None:r.fulfill(status=st,body=body,content_type='application/json')))(body,st))
        if slow_places:
            pg.add_init_script("""(() => {
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
        pg.goto('http://localhost:8791/', wait_until='domcontentloaded' if slow_places else 'load'); pg.wait_for_selector('.pc, .prio-empty',state='attached'); pg.wait_for_timeout(300)
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
        rewards_page.wait_for_function("document.getElementById('today-focus-ending')?.textContent.includes('Rewards expire in')")
        rewards_label = rewards_page.locator('#today-focus-ending').inner_text()
        rewards_meta = rewards_page.locator('#today-focus-ending-meta').inner_text()
        check('Today Ending soon surfaces a published reward-claim deadline after the pass ends',
              'Rewards expire in' in rewards_label and 'GO Pass: Fixture rewards' in rewards_meta and 'claim by' in rewards_meta,
              (rewards_label, rewards_meta))
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

        # A stalled initial data request must time out, expose a retry, and leave the primary navigation usable.
        boot_ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='Australia/Melbourne',locale='en-AU',service_workers='block')
        boot_ctx.set_default_timeout(10000)
        boot_ctx.set_default_navigation_timeout(15000)
        boot=boot_ctx.new_page(); boot.clock.install(time='2026-10-09T22:45:00+11:00')
        boot.route('**/data.json',lambda route: None)  # leave the request pending to exercise the timeout
        boot.route('**/art/index.json',ful('{}'))
        boot.goto('http://localhost:8791/',wait_until='domcontentloaded')
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
              '0 in person' in future_overseas.locator('#today-focus-now-meta').inner_text())
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
        check('Today focus strip expands to four columns on desktop', desktop_cols==4, desktop_cols)
        future_overseas.context.close()

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
        check('Mobile Today preserves Action Centre → Today → For you order',
              mobile_today['display']=='flex' and mobile_today['sidebarDisplay']=='contents' and
              mobile_today['actionTop']<mobile_today['mainTop']<mobile_today['foryouTop'],
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
        touch_page = page(api=json.dumps({'enabled': True, 'events': touch_events}))
        touch_card = touch_page.locator('#home-now .evc[data-id="leekduck:touch-target"]')
        touch_card.wait_for(state='attached')
        hide_button = touch_card.locator('.hide-x')
        touch_box = hide_button.bounding_box()
        check('Today hide control is at least 44×44px',
              touch_box is not None and touch_box['width'] >= 44 and touch_box['height'] >= 44, touch_box)
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
        next_page.keyboard.press('Escape')
        check('Event detail Escape restores focus to the Today next-event card',
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
        check('opening a season card loads its full poster only in event details',
              poster_loaded and any('season-24-twilight-trails' in url or 'go-pass-october-2026' in url for url in pg.season_poster_requests))
        pg.locator('#evd-x').click()
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
        check('hidden Schedule infographic thumbnails do not request original poster bytes',
              hidden_schedule_thumb.count() == 1 and not hidden_schedule_thumb.get_attribute('src'))
        pg.evaluate("() => document.getElementById('thumbnail-defer-fixture')?.remove()")
        lazy_thumb = pg.locator('[data-infographic="cur:trek"].igthumb img[loading=lazy]').first
        lazy_thumb.scroll_into_view_if_needed(timeout=5000)
        lazy_loaded = pg.wait_for_function("selector => { const img = document.querySelector(selector); return !!img && img.complete && img.naturalWidth > 0; }", arg='[data-infographic="cur:trek"].igthumb img[loading=lazy]', timeout=5000)
        check('lazy infographic thumbnail decodes after entering the viewport', lazy_loaded)
        check('card with an infographic shows a 44px thumbnail button', pg.locator('[data-infographic="cur:trek"].igthumb img[loading=lazy]').count()==1 and pg.locator('[data-infographic="cur:trek"].igthumb').bounding_box()['width']>=44 and not pg.locator('[data-infographic="cur:trek"]').is_disabled())
        check('card with no infographic shows an always-on Check infographic button (no thumbnail)', pg.locator('[data-igcheck="cur:zorua"]').first.inner_text()=='Check infographic' and not pg.locator('[data-igcheck="cur:zorua"]').first.is_disabled() and pg.locator('[data-igcard="cur:zorua"] img').count()==0)
        check('infographic buttons are accessible', 'Open infographic for' in pg.locator('[data-infographic="cur:trek"]').first.get_attribute('aria-label') and 'infographic' in pg.locator('[data-igcheck="cur:zorua"]').first.get_attribute('aria-label'))
        check('Check infographic button keeps its button role', pg.locator('[data-igcheck="cur:zorua"]').first.get_attribute('role') is None)
        pg.locator('[data-igcheck="cur:zorua"]').first.click(); pg.wait_for_timeout(600)
        check('Check infographic says so in place when nothing is found', pg.locator('[data-igcheck="cur:zorua"]').first.inner_text()=='No infographic found yet' and not pg.locator('#goinfo:not([hidden])').count())
        # The event infographic viewer should behave like the event-details dialog: trap keyboard focus and return it to the card.
        ig_opener = pg.locator('[data-infographic="cur:trek"]').first
        ig_opener.click()
        pg.locator('#goinfo:not([hidden])').wait_for(state='visible')
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
        # A thumbnail address that cannot be fetched falls back to the Check infographic button (the rest of this run serves a valid PNG for every picture).
        pb=page(extra={'**/img/ext/4aa21432-0cfc-4c93-b3eb-0c15f322389d-0119b088.webp':('',404)})
        pb.locator('[data-infographic="cur:trek"]').first.scroll_into_view_if_needed(timeout=5000); pb.wait_for_timeout(800)
        check('a thumbnail that fails to load becomes Check infographic', pb.locator('[data-igcheck="cur:trek"]').first.inner_text()=='Check infographic' and pb.locator('[data-igcard="cur:trek"] img').count()==0 and pb.locator('[data-igcard="cur:trek"]').first.get_attribute('data-igbad') is not None)
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
        pg.click('nav.tabs button[data-tab="collect"]'); pg.wait_for_timeout(200); pg.evaluate("document.getElementById('sub-opps').hidden=false")
        check('unknown ownership explained', pg.locator('#opps .notice').count()==1)
        check('no "Need" chips without marks', pg.locator('.opp.missing').count()==0)
        # 2. marks present: Zorua missing -> need + priority boost; Pikachu owned
        marks={'have':{},'hundo':{},'m':{'own':{'25':1,'9':1}}}
        # marks alone (no confirmed generation) must NOT make Zorua a Need
        pg=page(marks=marks)
        prio_txt=pg.inner_text('#prio')
        pg.click('nav.tabs button[data-tab="collect"]'); pg.wait_for_timeout(200); pg.evaluate("document.getElementById('sub-opps').hidden=false")
        check('marks without a confirmed generation: Zorua is not a Need anywhere', 'You need' not in prio_txt and pg.locator('.opp.missing').count()==0 and pg.locator('#opps .opp').count()>=1)
        pg=page(marks=marks,gens=[5])
        txt=pg.inner_text('#prio')
        check('priority shows Zorua CD (you need Zorua)', 'ZORUA' in txt.upper() and 'You need Zorua' in txt, txt[:300])
        first=pg.inner_text('#prio .pc.first')
        check('the event with a needed Pokémon outranks the long-running one', 'ZORUA' in first.upper(), first[:120])
        pg.click('nav.tabs button[data-tab="collect"]'); pg.wait_for_timeout(200); pg.evaluate("document.getElementById('sub-opps').hidden=false")
        check('opportunities: Zorua listed under You still need', 'Zorua'.upper() in pg.inner_text('#opps').upper() and pg.locator('.opp.missing').count()>=1)
        check('unmarked costume/forms are never claimed as have/need', pg.locator('.opp.unknown').count()>=1 and 'not tracked' in pg.inner_text('#opps').lower())
        # 3. follow + save persist; the header badge counts actual cards, never empty placeholders or wrappers.
        check('empty Watchlist does not count its empty-state rows',
              pg.locator('#wlcount').is_hidden() and pg.locator('#hwatch').get_attribute('aria-label')=='Watchlist',
              {'badge_hidden':pg.locator('#wlcount').is_hidden(),'aria_label':pg.locator('#hwatch').get_attribute('aria-label')})
        pg.click('nav.tabs button[data-tab="collect"]'); pg.wait_for_timeout(200); pg.evaluate("document.getElementById('sub-opps').hidden=false")
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
        check('Events shows two views; Leaks lives in the menu', pg.evaluate("document.querySelectorAll('#subnav-events button').length===2"))
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
        pg.click('#rotnow [data-rotweek="this"]'); pg.wait_for_timeout(100)
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
        pg2=page(pin=True)
        pg2.route('**/api/prices-private', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({"fx":{"from":"IDR","to":"AUD","rate":0.0001,"source":"test","url":"https://x.test","observed":"2026-10-10"},"prices":[{"product":"zorua-cd-research","currency":"IDR","amount":50000,"region":"ID","source":"test store","url":"https://x.test","observed":"2026-10-10"}]})))
        pg2.route('**/prices.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({"prices":[{"product":"zorua-cd-research","currency":"AUD","amount":8,"region":"AU","verified":True,"source":"test au","url":"https://x.test","observed":"2026-10-10"}]})))
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
        pg.goto('http://localhost:8791/'); pg.wait_for_selector('.pc, .prio-empty',state='attached'); pg.wait_for_timeout(600)
        pg.click('#hmenu'); pg.wait_for_timeout(300)
        check('server follow arrives on this device', 'EEVEE' in pg.inner_text('#followed').upper(), pg.inner_text('#followed')[:100])
        check('newer local edit beats older server entry', pg.evaluate("GODASH.ownState('Alolan Vulpix').state")=='missing')
        check('local-newer entry is pushed up', any('form:37:alola' in p.get('entries',{}) for p in puts), puts)
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
        pg.evaluate("GODETAIL.open('leekduck:x1')"); pg.wait_for_timeout(300)
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
        pg=page(extra={'**/places.json':(fx,200)})
        pg.evaluate("GOPLACES.open('')"); pg.wait_for_selector('#plc .plc-row'); pg.wait_for_timeout(200)
        check('places: only places with a source, https link and verified date are listed', pg.locator('#plc .plc-row').count()==1 and 'Route Park' in pg.inner_text('#plc'))
        check('places: Download GPX appears only for the place with a verified route', pg.locator('#plc a[download]').count()==1 and pg.get_attribute('#plc a[download]','href')=='/routes/r1.gpx')
        # event detail links to its venues
        api=json.dumps({'enabled':True,'events':[{'id':'leekduck:f%d'%i,'name':'Filler %d'%i,'type':'event','start':'2026-11-%02dT10:00:00.000'%(i+1),'end':'2026-11-%02dT12:00:00.000'%(i+1),'tzMode':'local','status':'community_reported','announced':True,'missing':False,'featured':[],'bonuses':[],'reports':[]} for i in range(11)]+[{'id':'leekduck:safari','name':'City Safari: Brisbane','type':'event','start':'2026-09-26T10:00:00.000','end':'2026-09-27T18:00:00.000','tzMode':'local','status':'community_reported','announced':True,'missing':False,'featured':[],'bonuses':[],'link':'https://leekduck.com/events/safari/','reports':[]}],'sources':[]})
        pg=page(api=api,sources='{"environment":"preview","database":true,"enabled":true,"sources":[]}',extra={'**/places.json':(PLACES_FIXTURE,200)})
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
        pg.evaluate("GODETAIL.close(); GOPLACES.close(); GODETAIL.open('leekduck:f1')"); pg.wait_for_timeout(300)
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
            pg.goto('http://localhost:8791/'); pg.wait_for_selector('.pc, .prio-empty',state='attached'); pg.wait_for_timeout(900); return pg
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
        check('Back closes the detail view and stays in the app', pg.evaluate("document.getElementById('evd').hidden") and pg.url.startswith('http://localhost:8791') and pg.locator('#tab-events').is_visible())
        pg.go_back(); pg.wait_for_timeout(300)
        check('Back from another tab returns to Now', pg.locator('#tab-now').is_visible() and pg.url.startswith('http://localhost:8791'))
        pctx=b.new_context(viewport={'width':390,'height':844},timezone_id='Australia/Melbourne',locale='en-AU')
        pctx.set_default_timeout(10000)
        pctx.set_default_navigation_timeout(15000)
        ppg=pctx.new_page(); ppg.goto('http://localhost:8791/',wait_until='domcontentloaded')
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
        ppg.goto('http://localhost:8791/__offline_app_shell_probe__',wait_until='domcontentloaded',timeout=15000)
        check('PWA: uncached offline navigation falls back to the app shell',
              ppg.locator('h1').inner_text().strip().lower()=='go field notes',
              ppg.evaluate("({title:document.title,h1:document.querySelector('h1')&&document.querySelector('h1').innerText,url:location.href})"))
        ppg.evaluate("""async()=>{for(const name of (await caches.keys()).filter(n=>n.startsWith('gofn-shell-'))){const c=await caches.open(name);await c.delete('/');await c.delete('/index.html');}}""")
        ppg.goto('http://localhost:8791/__offline_fallback_probe__',wait_until='domcontentloaded',timeout=15000)
        check('PWA: offline page appears when the app shell is unavailable',
              ppg.title()=="You're offline · GO Field Notes" and ppg.locator('h1').inner_text().strip()=="You're offline",
              ppg.evaluate("({title:document.title,h1:document.querySelector('h1')&&document.querySelector('h1').innerText,url:location.href})"))
        pctx.close()
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
