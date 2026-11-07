"""Full interval coverage, individual forms and mobile Battle controls in both engines."""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
BASE=os.environ.get('GO_FIELD_NOTES_BATTLE_URL','http://127.0.0.1:8791')
OUT=os.environ.get('GO_FIELD_NOTES_SCREENSHOTS')
DATA=json.loads((ROOT/'public/data.json').read_text())
DATA['rotation']=[
 {'s':'2026-11-02T06:00','e':'2026-11-04T22:00','five':'Giratina (Altered Forme)','mega':'Mega Sableye'},
 {'s':'2026-11-06T10:00','e':'2026-11-07T20:00','five':'Cresselia and Darkrai','mega':'Mega Charizard X and Y'},
 {'s':'2026-11-08T06:00','e':'2026-11-08T22:00','five':'Deoxys (all four Formes)'},
 {'s':'2026-11-15T06:00','e':'2026-11-15T22:00','five':'Crowned Sword Zacian and Crowned Shield Zamazenta'}]
DATA['maxBattles']=[['2026-11-02','2026-11-04','Machop'],['2026-11-05','2026-11-08','Espurr']]
with sync_playwright() as p:
 browser=getattr(p,os.environ.get('GO_FIELD_NOTES_TEST_BROWSER','chromium')).launch()
 for width in [320,375,390,430]:
  context=browser.new_context(viewport={'width':width,'height':900},timezone_id='Australia/Melbourne',service_workers='block')
  context.route('**/api/**',lambda r:r.fulfill(body='{"enabled":false,"events":[],"sources":[]}',content_type='application/json'))
  context.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
  context.route('**/data.json',lambda r:r.fulfill(body=json.dumps(DATA),content_type='application/json'))
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.clock.install(time='2026-11-03T12:00:00+11:00')
  page.goto(BASE+'/');page.wait_for_function('!!window.GODASH')
  page.locator('#tabs [data-tab="raids"]').click()
  root=page.locator('#rotnow')
  for name in ['Giratina (Altered Forme)','Cresselia','Darkrai','Mega Charizard X','Mega Charizard Y','Deoxys (Normal Forme)','Deoxys (Attack Forme)','Deoxys (Defense Forme)','Deoxys (Speed Forme)']:
   assert root.locator(f'.rc[data-boss="{name}"]').count()==1,(width,name)
  assert root.locator('.rw-raid').count()==3
  assert root.locator('.rw-max-pokemon').count()==2
  assert '6 am–9 pm' in root.inner_text()
  assert root.locator('.rw-window').count()==5
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  assert root.evaluate('(el)=>el.scrollWidth<=el.clientWidth'),width
  for control in root.locator('button').all():
   assert control.bounding_box()['height']>=43,(width,control.inner_text())
  if OUT:
   Path(OUT).mkdir(parents=True,exist_ok=True);page.screenshot(path=str(Path(OUT)/f'battle-{width}.png'),full_page=True)
  root.locator('[data-rotweek="next"]').click()
  assert root.locator('.rc[data-boss="Crowned Sword Zacian"]').count()==1
  assert root.locator('.rc[data-boss="Crowned Shield Zamazenta"]').count()==1
  assert root.locator('.rc[data-boss="Giratina (Altered Forme)"]').count()==0
  assert not errors,errors
  print(f'PASS Battle interval coverage and mobile layout at {width}px')
  context.close()
 browser.close()
