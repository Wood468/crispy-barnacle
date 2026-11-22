"""Raids and Max Battles polish: tier/CP/countdown/relationship chips, tiered Max roster, labelled Dynamax/Gigantamax/Shadow, honest empty state. Both engines."""
import json, os, re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
BASE=os.environ.get('GO_FIELD_NOTES_BATTLE_URL','http://127.0.0.1:8791')
OUT=os.environ.get('GO_FIELD_NOTES_SCREENSHOTS')
REAL=json.loads((ROOT/'public/data.json').read_text())
SYN=json.loads(json.dumps(REAL))
SYN['rotation']=[{'s':'2026-11-09T10:00','e':'2026-11-13T20:00','five':'Dialga','mega':'Mega Sableye','shadow':'Shadow Tornadus (Incarnate)','rh':'Dialga, Wed Nov 11','cp':{'Dialga':[2000,2500]},'shiny':['Dialga']}]
SYN['maxRosters']=[]
SYN['maxBattles']=[['2026-11-09','2026-11-15','Gigantamax Charizard'],['2026-11-16','2026-11-22','Dynamax Espurr']]
# Fixed rotations for the lower-tier checks, so they never depend on what the live importer has filled in for a given week.
LOW_ON=[{'s':'2026-11-04T06:00','e':'2026-11-08T22:00','five':'Giratina (Altered Forme)','mega':'Mega Sableye','shadow':'Shadow Tornadus (Incarnate)','low':{'one':['Pikachu','Antique Sinistea'],'three':['Cofagrigus','Trevenant','Dhelmise'],'shadowOne':['Shadow Larvitar','Shadow Mudkip','Shadow Makuhita','Shadow Cranidos'],'shadowThree':['Shadow Prinplup','Shadow Piloswine','Shadow Poliwhirl'],'observed':'2026-11-05','source':'Pokémon GO Hub current raids','sourceUrl':'https://pokemongohub.net/post/guide/current-go-raids/'},'rh':'Giratina, Wed Nov 4'}]
LOW_OFF=[{'s':'2026-11-16T06:00','e':'2026-11-24T22:00','five':'Cresselia and Darkrai','mega':'Mega Banette','shadow':'Shadow Tornadus (Incarnate)','rh':'Cresselia and Darkrai, Wed Nov 18'}]
def fixture(rotation,**extra):
  d=json.loads(json.dumps(REAL));d['rotation']=rotation;d.update(extra);return d
def shoot(page,name,width):
  if OUT:
    Path(OUT).mkdir(parents=True,exist_ok=True);page.screenshot(path=str(Path(OUT)/f'{name}-{width}.png'),full_page=True)
def make(browser,width,data,when):
  c=browser.new_context(viewport={'width':width,'height':900},timezone_id='Australia/Melbourne',service_workers='block',color_scheme='dark')
  c.route('**/api/**',lambda r:r.fulfill(body='{"enabled":false,"events":[],"sources":[]}' if not '/api/art' in r.request.url else '',status=200 if not '/api/art' in r.request.url else 404,content_type='application/json'))
  c.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
  c.route('**/data.json',lambda r:r.fulfill(body=json.dumps(data),content_type='application/json'))
  page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.clock.install(time=when)
  page.goto(BASE+'/');page.wait_for_function("!!window.GODASH&&GOEventRegistry.settled()")
  return c,page,errors
with sync_playwright() as p:
 browser=getattr(p,os.environ.get('GO_FIELD_NOTES_TEST_BROWSER','chromium')).launch()
 for width in [320,360,390,430]:
  # 1. Real data during Into the Wild: event-tied raids and the tiered Max roster.
  c,page,errors=make(browser,width,REAL,'2026-11-09T12:00:00+11:00')
  page.locator('#tabs [data-tab="raids"]').click();root=page.locator('#rotnow')
  z=root.locator('.rc[data-boss="Crowned Sword Zacian"]')
  assert z.count()==1 and all(x in z.locator('.rc-perfect').inner_text() for x in ('100% IV','2,188')) and all(x in z.locator('.rc-weather').inner_text() for x in ('Weather','2,735')),(width,z.inner_text())
  assert z.locator('.rc-tier-corner').inner_text()=='5★'
  assert z.locator('.rc-tier-corner img[src="/ico/g/raid.webp"]').count()==1
  assert z.locator('.rc-iv-catch[aria-label*="100% IV raid catch CP"]').count()==1
  assert 'Raid Hour: Crowned Sword Zacian, Mon Nov 9' in root.inner_text()
  assert root.locator('.rw-raid:not(.rw-event-day) .rw-rel .rc-event[data-open]').count()==1
  assert root.locator('.rw-count-live').first.inner_text().startswith('Ends in ')
  assert not root.locator('.rc-shiny').count(),'no shiny chip without confirmed data'
  bosses=root.locator('.rw-max-pokemon[data-max-boss]:not(.rw-event-day *)')
  assert [bosses.nth(i).get_attribute('data-max-boss') for i in range(bosses.count())]==['Ralts','Machop','Registeel','Regidrago','Latias','Latios'],width
  assert all('dynamax' in bosses.nth(i).locator('.max-tag').inner_text().lower() for i in range(bosses.count()))
  assert 'CP 1,699' in root.locator('[data-max-boss="Regidrago"]').inner_text() and 'Dynamax debut' in root.locator('[data-max-boss="Regidrago"]').inner_text()
  assert 'Thu 12 Nov' in root.inner_text()
  assert 'No featured Pokémon published' not in root.inner_text()
  # logo and art stay inside their cards
  assert page.evaluate("[...document.querySelectorAll('.rw-max-pokemon .dyn-logo')].every(i=>i.getBoundingClientRect().width<=20)")
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  shoot(page,'raids-event-roster',width)
  page.locator('#rotnow .rc-event').first.click();page.wait_for_selector('#evd',state='visible')
  assert 'Into the Wild' in page.locator('#evd').inner_text()
  # Event Details previously omitted the Battle screen's verified tier/100% IV
  # markers. Check both its dated roster and universal raid encounter cards.
  page.keyboard.press('Escape')
  page.evaluate("GODETAIL.open('cur:wag')")
  sat=page.locator('#evd .ue-raid-day[data-raid-date="2026-11-14"]')
  sat.wait_for(state='visible',timeout=30000)
  assert sat.locator('[data-roster="five"] .ue-raid-tier-corner[aria-label="5 star raid tier"]').count()>=1,(width,'missing tier on event overview')
  zekrom=sat.locator('[data-roster="five"] li',has_text='Zekrom')
  assert zekrom.count()==1 and zekrom.locator('.ue-raid-cp-normal',has_text='100%').count()==1,(width,'missing perfect CP on event overview')
  assert zekrom.locator('.ue-raid-cp-weather',has_text='WB').count()==1,(width,'missing conditional boosted CP')
  assert sat.locator('[data-roster="max"] .ue-raid-tier-corner,[data-roster="max"] .ue-raid-cp').count()==0,(width,'Max is not a raid tier')
  encounter_tab=page.locator('#evd .evd-nav-link[data-sec="encounters"]')
  if encounter_tab.count():encounter_tab.click()
  raid_gallery=page.locator('#evd .ue-method[data-method="raid"]')
  raid_gallery.wait_for(state='visible',timeout=30000)
  assert raid_gallery.locator('.ue-raid-tier-corner').count()>=1,(width,'missing raid artwork tier icon')
  assert raid_gallery.locator('.ue-raid-cp-normal',has_text='100%').count()>=1,(width,'missing perfect CP on encounter art')
  assert not errors,errors;c.close()
  # 2. Synthetic week: Shadow raid, confirmed shiny chip, Gigantamax + Dynamax Max Battles with labelled fallbacks (art blocked).
  c,page,errors=make(browser,width,SYN,'2026-11-09T12:00:00+11:00')
  page.locator('#tabs [data-tab="raids"]').click();root=page.locator('#rotnow')
  assert root.locator('.rc[data-boss="Shadow Tornadus (Incarnate)"]').count()==1
  assert root.locator('.rc[data-boss="Dialga"] .rc-shiny').count()==1
  mx=root.locator('.rw-max-pokemon:not(.rw-event-day *)').first.inner_text();assert 'Gigantamax Charizard' in mx or 'Charizard' in mx
  assert root.locator('.rw-max-pokemon:not(.rw-event-day *) .max-tag').first.inner_text().strip().lower() in ('g-max','dynamax')
  shoot(page,'raids-shadow-gmax',width)
  page.locator('[data-rotweek="next"]').click()
  assert 'Espurr' in root.inner_text();shoot(page,'raids-next-week',width)
  assert not errors,errors;c.close()
  # 3. A week with a raid rotation but no Max Battle information says so plainly.
  c,page,errors=make(browser,width,fixture(LOW_OFF,maxBattles=[],maxRosters=[]),'2026-11-16T12:00:00+11:00')
  page.locator('#tabs [data-tab="raids"]').click()
  assert 'Max Battles not announced for this week yet.' in page.locator('#rotnow').inner_text()
  shoot(page,'raids-empty-max',width)
  assert not errors,errors;c.close()
  # 4. Lower tiers: a rotation with no low block (fixture, not live data), so the Battle tab names every missing tier plainly (no silent blank).
  c,page,errors=make(browser,width,fixture(LOW_OFF),'2026-11-16T12:00:00+11:00')
  page.locator('#tabs [data-tab="raids"]').click();root=page.locator('#rotnow')
  empty=root.locator('.rw-low-empty')
  assert empty.count()>=1 and all(x in empty.first.inner_text() for x in ('1★','3★','Shadow 1–3★','not published')),(width,empty.first.inner_text())
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors;c.close()
  # 5. A rotation that has them lists every tier in order (1★, 3★, Shadow 1★, Shadow 3★) behind a 44px summary, inside the viewport.
  c,page,errors=make(browser,width,fixture(LOW_ON),'2026-11-05T12:00:00+11:00')
  page.locator('#tabs [data-tab="raids"]').click();root=page.locator('#rotnow')
  low=root.locator('details.rw-low').first;sm=low.locator('summary')
  assert sm.bounding_box()['height']>=44,(width,sm.bounding_box())
  sm.click()
  tiers=low.locator('.rc .rc-tier-corner').all_inner_texts()
  assert [t.strip() for t in tiers][0].startswith('1') and any('Shadow' in t or 'S' in t for t in tiers),(width,tiers)
  names=low.locator('.rc[data-boss]').evaluate_all('e=>e.map(x=>x.dataset.boss)')
  assert names==['Pikachu','Antique Sinistea','Cofagrigus','Trevenant','Dhelmise','Shadow Larvitar','Shadow Mudkip','Shadow Makuhita','Shadow Cranidos','Shadow Prinplup','Shadow Piloswine','Shadow Poliwhirl'],(width,names)
  assert page.evaluate("[...document.querySelectorAll('#rotnow .rw-low .rc')].every(e=>e.getBoundingClientRect().right<=innerWidth+1)")
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors;c.close()
  print(f'PASS raids and max polish at {width}px')
