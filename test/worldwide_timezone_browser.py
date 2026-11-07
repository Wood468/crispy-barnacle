"""Worldwide P0 journeys: device/override time, publication recovery, activity identity and saved data."""
import copy,json,os,re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
BASE='http://127.0.0.1:8791'
DEX=json.loads((ROOT/'public/dex.json').read_text())
INSTANT={'schemaVersion':1,'eventId':'synthetic-worldwide-instant','title':'Synthetic worldwide instant','family':'go-fest','schedule':{'timeBasis':'instant','start':'2026-11-07T00:00Z','end':'2026-11-09T00:00Z'},'pokemon':[{'speciesId':'25','name':'Pikachu'}],
 'activities':[{'id':'first-window','title':'Raid rotation','presentation':'rotation','location':'Tokyo','schedule':{'timeBasis':'instant','start':'2026-11-07T00:00Z','end':'2026-11-07T01:00Z'}},{'id':'second-window','title':'Raid rotation','presentation':'rotation','location':'Sendai','schedule':{'timeBasis':'instant','start':'2026-11-08T00:00Z','end':'2026-11-08T01:00Z'}}],
 'encounters':[{'identityKey':'25:base:none','method':'raid','activityId':'first-window'},{'identityKey':'25:base:none','method':'raid','activityId':'second-window'}],
 'internalValidation':{'native':True,'conflicts':[{'field':'cosmetic'}]},'sources':[{'name':'Synthetic only','url':'https://example.invalid/synthetic'}]}
PLAYER={'schemaVersion':1,'eventId':'synthetic-player-local','title':'Synthetic player-local event','family':'community-day','schedule':{'timeBasis':'player-local','start':'2026-11-07T14:00','end':'2026-11-07T17:00'},'internalValidation':{'native':True}}
WINDOWS={'schemaVersion':1,'eventId':'synthetic-windows','title':'Synthetic availability windows','activities':[{'id':'research','kind':'research','title':'Synthetic research window','schedule':INSTANT['schedule']},{'id':'ticket','kind':'ticket','title':'Synthetic purchase window','schedule':INSTANT['schedule']}],'internalValidation':{'native':True}}
VENUE={'schemaVersion':1,'eventId':'synthetic-tokyo-venue','title':'Synthetic Tokyo venue','attendance':'in-person','location':'Tokyo','schedule':{'timeBasis':'local','timeZone':'Asia/Tokyo','start':'2026-11-07T14:00','end':'2026-11-07T17:00'},'internalValidation':{'native':True}}
VALID={'schemaVersion':1,'species':DEX,'events':[INSTANT,PLAYER,WINDOWS,VENUE]}
ENGINE=os.environ.get('GO_FIELD_NOTES_TEST_BROWSER','chromium')
def stub_api(route):route.fulfill(body='{"enabled":false,"events":[],"sources":[]}',content_type='application/json')
with sync_playwright() as p:
 browser=getattr(p,ENGINE).launch()
 for width in [320,390,1440]:
  context=browser.new_context(viewport={'width':width,'height':900},timezone_id='Asia/Tokyo',service_workers='block')
  context.set_default_timeout(20000)
  context.route('**/api/**',stub_api)
  context.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
  payload=[copy.deepcopy(VALID)]
  context.route('**/events-v1.json',lambda r:r.fulfill(body=json.dumps(payload[0]),content_type='application/json'))
  context.add_init_script("if(!localStorage.getItem('gofn-dex-v1'))localStorage.setItem('gofn-dex-v1',JSON.stringify({m:{own:{25:1}}}));if(!localStorage.getItem('gofn-us-v1'))localStorage.setItem('gofn-us-v1',JSON.stringify({'saved:cur:zorua':{v:1,t:1},'follow:pikachu':{v:'Pikachu',t:1}}));")
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.clock.install(time='2026-11-07T03:00:00Z')
  def ready():
   page.wait_for_function("!!window.GODASH&&!!window.GODETAIL&&GOEventRegistry.settled()")
   page.evaluate('GOEventRegistry.ready')
  def open_event(id):
   page.evaluate('(id)=>GODETAIL.open(id)',id)
   page.locator('#evd:not([hidden]) .ue-hero').wait_for()
  def close_event():
   page.keyboard.press('Escape')
   page.wait_for_function('!GONAV.internal&&GONAV.pending.length===0')
  def change_zone(zone):
   page.locator('#hmenu').click();page.locator('#timezonedd > summary').click();page.locator('#timezone-choice').select_option(zone)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.locator('#timezone-choice').evaluate('(el)=>getComputedStyle(el).fontSize')=='16px'
   assert page.locator('#timezone-form button').evaluate('(el)=>el.getBoundingClientRect().height>=44')
   out=os.environ.get('GO_FIELD_NOTES_SCREENSHOTS')
   if out:
    Path(out).mkdir(parents=True,exist_ok=True);page.screenshot(path=str(Path(out)/f'timezone-{width}.png'))
   page.locator('#timezone-form button').click();ready()
  page.goto(BASE+'/');ready()
  assert page.evaluate('GOEventClock.viewerZone()')=='Asia/Tokyo'
  assert 'SAT 7 NOV' in page.locator('#today').inner_text()
  assert page.evaluate("GOEventRegistry.display(GOEventRegistry.find('synthetic-player-local')).start.toISOString()")=='2026-11-07T05:00:00.000Z'
  before=page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})")
  open_event(INSTANT['eventId'])
  assert page.locator('#evd .ue-mon[data-identity="25:base:none"]').count()==2
  assert page.locator('#evd .ue-mon .own').all_inner_texts()==['Have','Have']
  assert page.locator('#evd .srcdis').count()==0,'minor conflict produced a hero warning'
  assert '7 Nov' in page.locator('#evd .evc-when').inner_text()
  close_event();change_zone('America/New_York')
  assert page.evaluate('GOEventClock.viewerZone()')=='America/New_York'
  assert 'FRI 6 NOV' in page.locator('#today').inner_text()
  assert page.evaluate("GOEventRegistry.display(GOEventRegistry.find('synthetic-player-local')).start.toISOString()")=='2026-11-07T19:00:00.000Z'
  page.locator('#tabs [data-tab="events"]').click();page.locator('#subnav-events [data-sub="calendar"]').click()
  assert page.locator('#calgrid .cc.today').get_attribute('data-cday')=='2026-11-06'
  open_event(INSTANT['eventId'])
  assert '6 Nov' in page.locator('#evd .evc-when').inner_text()
  assert '6 Nov' in page.locator('#evd-rotations').inner_text()
  assert 'Tokyo' in page.locator('#evd').inner_text() and 'Sendai' in page.locator('#evd').inner_text()
  close_event();open_event(VENUE['eventId'])
  assert 'Venue:' in page.locator('#evd .evc-when').inner_text()
  assert page.evaluate("GOEventRegistry.display(GOEventRegistry.find('synthetic-tokyo-venue')).start.toISOString()")=='2026-11-07T05:00:00.000Z'
  close_event();open_event(PLAYER['eventId'])
  ics=page.locator('#evd a[download]').get_attribute('href')
  from urllib.parse import unquote
  assert 'DTSTART:20261107T190000Z' in unquote(ics), 'calendar export used device zone instead of selected zone'
  close_event();open_event(WINDOWS['eventId'])
  assert page.locator('#evd-research-title').is_visible() and page.locator('#evd-tickets').is_visible()
  assert page.locator('#evd-rotations').count()==0
  close_event()
  bad=copy.deepcopy(VALID);bad['events'].append({'schemaVersion':1,'eventId':'synthetic-invalid-new','title':'Synthetic invalid','pokemon':[{'speciesId':'25'}],'encounters':[{'identityKey':'25:base:none','method':'wiild'}]});payload[0]=bad
  page.reload();ready()
  diagnostics=page.evaluate('GOEventRegistry.diagnostics()')
  assert diagnostics['retained'] and diagnostics['rejectedCount']==1,diagnostics
  assert page.evaluate('GOEventRegistry.events().length')==len(VALID['events'])
  open_event(INSTANT['eventId']);page.locator('#evd-sources > summary').click()
  assert 'latest event update was held' in page.locator('#evd-sources').inner_text()
  close_event()
  bad=copy.deepcopy(VALID);bad['events'][0]['aliases']=['shared'];bad['events'][1]['aliases']=['shared'];payload[0]=bad
  page.reload();ready()
  assert page.evaluate('GOEventRegistry.diagnostics().conflicts.length')>0
  assert page.evaluate("GOEventRegistry.find('shared')")==None
  assert page.evaluate('GOEventRegistry.events().length')==len(VALID['events'])
  payload[0]=copy.deepcopy(VALID);page.reload();ready()
  assert page.evaluate('GOEventRegistry.diagnostics().rejectedCount')==0
  assert page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})")==before
  change_zone('');assert page.evaluate('GOEventClock.viewerZone()')=='Asia/Tokyo'
  page.evaluate("localStorage.setItem('gofn-timezone','Invalid/Zone')");page.reload();ready()
  assert page.evaluate('GOEventClock.viewerZone()')=='Asia/Tokyo'
  assert page.locator('#timezone-choice').input_value()==''
  assert errors==[],errors
  print(f'PASS worldwide {ENGINE} {width}px: device default, override/reset, DST-safe projection/ICS, preserved collection, held invalid/colliding catalogue, activity identity')
  context.close()
 browser.close()
