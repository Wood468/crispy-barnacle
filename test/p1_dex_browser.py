"""Collection v1: real UI, additive legacy projection, exact variants and private inventory."""
import os,re
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8791'
OUT=Path(os.environ.get('GO_FIELD_NOTES_SCREENSHOTS','/workspace/p1-review'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 engine=os.environ.get('GO_FIELD_NOTES_TEST_BROWSER','chromium');browser=getattr(p,engine).launch()
 for width in [320,390,1440]:
  context=browser.new_context(viewport={'width':width,'height':900},timezone_id='Asia/Tokyo',service_workers='block')
  context.route('**/api/**',lambda r:r.fulfill(body='{"enabled":false,"events":[],"sources":[]}',content_type='application/json'))
  context.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
  context.add_init_script("if(!localStorage.getItem('gofn-dex-v1'))localStorage.setItem('gofn-dex-v1',JSON.stringify({have:{Mewtwo:1},m:{own:{25:1},shiny:{25:1}}}));if(!localStorage.getItem('gofn-us-v1'))localStorage.setItem('gofn-us-v1',JSON.stringify({'form:26:alola':{v:1,t:1},'saved:cur:wag':{v:1,t:1}}));")
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE+'/');page.wait_for_function('!!window.GODASH&&!!window.GOCollectionUI&&GOCollectionUI.catalogue()?.forSpecies(26).some(v=>v.formId==="alola")&&GOInventory.ready()')
  page.locator('#tabs [data-tab="collect"]').click();page.locator('#subnav-collect [data-sub="dex"]').click()
  assert page.locator('#dTotal').inner_text()=='1025'
  assert page.locator('#dOwn').inner_text()=='3'
  assert page.locator('#dexlist .dex-tile').count()==60
  before=page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})")
  assert page.locator('#dexlist [data-id="1"]').get_attribute('class').find('dex-silhouette')>=0
  page.locator('#dq').fill('raichu');assert page.locator('#dexlist .dex-tile').count()==1
  page.locator('#dstat').select_option('own');assert page.locator('#dexlist .dex-tile').count()==1
  assert page.evaluate("GODASH.ownState('Raichu').state")=='unknown','regional ownership leaked to base form'
  page.locator('#dstat').select_option('all');page.locator('#dq').fill('');page.screenshot(path=str(OUT/f'dex-{engine}-{width}.png'))
  page.locator('#dexlist [data-species="26"]').click();assert page.locator('#dex-species-name').inner_text()=='Raichu'
  assert page.locator('#dex-species [data-mark="form:26:alola"][data-val="1"]').get_attribute('aria-pressed')=='true'
  page.locator('#dex-add-record').click();page.locator('#dex-record-form [name="formId"]').select_option('alola');page.locator('#dex-record-form [name="cp"]').fill('1234')
  page.locator('#dex-record-form [type="submit"]').click();page.wait_for_function('GOInventory.records().length===1')
  record=page.evaluate('GOInventory.records()[0]');assert record['identity']['formId']=='alola';assert record['attributes']['cp']==1234;assert record['attributes']['ivs']==None;assert record['identity']['shiny']==None
  assert page.evaluate("GODASH.ownState('Raichu').state")=='unknown'
  assert page.evaluate("GODASH.ownState('Alolan Raichu').state")=='have'
  page.locator('#dex-back').click();page.locator('#dex-categories').select_option('regional');assert page.locator('#dexlist [data-mark="form:26:alola"]').get_attribute('aria-pressed')=='true'
  page.locator('#dex-categories').select_option('all');page.locator('#dq').fill('Pikachu');page.locator('#dexlist [data-species="25"]').click();page.locator('#dex-add-record').click()
  page.locator('#dex-record-form [name="cp"]').fill('250');page.locator('#dex-record-form details').filter(has_text='Mega & Max capability').locator('summary').click();page.locator('#dex-record-form [name="dynamax"]').select_option('true')
  page.locator('#dex-record-form [type="submit"]').click();page.wait_for_function('GOInventory.records().length===2')
  assert page.evaluate("GODASH.ownState('Dynamax Pikachu').state")=='have'
  page.locator('#dex-back').click();page.locator('#dex-categories').select_option('dynamax');assert page.locator('#dexlist .dex-tile').count()==1
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  # Persistence and account partitioning do not modify legacy marks.
  page.reload();page.wait_for_function('!!window.GOInventory&&GOInventory.ready()&&!!window.GODASH')
  assert page.evaluate('GOInventory.records().length')==2
  original=page.evaluate("localStorage.getItem('gofn-active-identity-v1')")
  page.evaluate("localStorage.setItem('gofn-active-identity-v1','account:other@example.invalid')");page.evaluate('GOInventory.refresh()');assert page.evaluate('GOInventory.records().length')==0
  page.evaluate('(key)=>localStorage.setItem("gofn-active-identity-v1",key)',original);page.evaluate('GOInventory.refresh()');assert page.evaluate('GOInventory.records().length')==2
  after=page.evaluate("({dex:localStorage.getItem('gofn-dex-v1'),us:localStorage.getItem('gofn-us-v1')})");assert after==before,(before,after)
  assert errors==[],errors
  context.close();print(f'PASS {engine} {width}px: National counts, silhouettes, search/filter, exact forms, manual records, Dynamax eligibility, persisted account isolation and unchanged legacy data',flush=True)
 browser.close()
