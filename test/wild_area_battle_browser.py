"""Verify the published GO Wild Area weekend bosses are discoverable from Battle."""
import json, os, re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
BASE=os.environ.get('GO_FIELD_NOTES_BATTLE_URL','http://127.0.0.1:8791')
DATA=json.loads((ROOT/'public/data.json').read_text())
with sync_playwright() as p:
 browser=getattr(p,os.environ.get('GO_FIELD_NOTES_TEST_BROWSER','chromium')).launch()
 for when,expected in [('2026-11-14T12:00:00+11:00',['Zekrom','White Kyurem','Gigantamax Duraludon','Dynamax Dialga']),('2026-11-15T12:00:00+11:00',['Reshiram','Black Kyurem','Gigantamax Duraludon','Dynamax Palkia'])]:
  context=browser.new_context(viewport={'width':390,'height':844},timezone_id='Australia/Melbourne',service_workers='block')
  context.route('**/api/**',lambda route:route.fulfill(body='{"enabled":false,"events":[],"sources":[]}',content_type='application/json'))
  context.route(re.compile(r'^https://fonts\\.'),lambda route:route.fulfill(body='',content_type='text/css'))
  context.route('**/data.json',lambda route:route.fulfill(body=json.dumps(DATA),content_type='application/json'))
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.clock.install(time=when)
  page.goto(BASE+'/');page.wait_for_function('!!window.GODASH&&GOEventRegistry.settled()')
  page.locator('#tabs [data-tab="raids"]').click()
  battle=page.locator('#rotnow').inner_text()
  for name in expected:
   assert name.casefold() in battle.casefold(),(when,name,battle[:1200])
  assert not errors,errors
  print('PASS Wild Area Battle',when)
  context.close()
 browser.close()
