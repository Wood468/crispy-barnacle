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
 for width in [360,390,430]:
  # 1. Real data during Into the Wild: event-tied raids and the tiered Max roster.
  c,page,errors=make(browser,width,REAL,'2026-11-09T12:00:00+11:00')
  page.locator('#tabs [data-tab="raids"]').click();root=page.locator('#rotnow')
  z=root.locator('.rc[data-boss="Crowned Sword Zacian"]')
  assert z.count()==1 and 'CP 2,188–2,735' in z.inner_text(),(width,z.inner_text())
  assert z.locator('.rc-tier').inner_text()=='5★'
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
  c,page,errors=make(browser,width,REAL,'2026-11-16T12:00:00+11:00')
  page.locator('#tabs [data-tab="raids"]').click()
  assert 'Max Battles not announced for this week yet.' in page.locator('#rotnow').inner_text()
  shoot(page,'raids-empty-max',width)
  assert not errors,errors;c.close()
  print(f'PASS raids and max polish at {width}px')
