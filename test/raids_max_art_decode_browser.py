"""Raids Max roster: real artwork decodes and long Gigantamax names lay out cleanly on phones.
Unlike the polish fixtures (which answer /api/art with JSON or 404), /api/art here returns real PNG bytes, so the
test proves the exact-form request is made, answered 200 image/*, decoded, and fits at 320/360/390/430px. Both engines."""
import json, os, re, struct, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
BASE=os.environ.get('GO_FIELD_NOTES_BATTLE_URL','http://127.0.0.1:8791')
OUT=os.environ.get('GO_FIELD_NOTES_SCREENSHOTS')
def png(w=64,h=64):
  raw=b''.join(b'\x00'+b''.join(bytes((x*4%256,y*4%256,160,255)) for x in range(w)) for y in range(h))
  chunk=lambda t,d:struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
  return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
PNG=png()
NAMES=['Gigantamax Duraludon','Gigantamax Urshifu Single Strike Style','Dynamax Machop','Bulbasaur']
DATA=json.loads((ROOT/'public/data.json').read_text())
DATA['events']=[{'id':'zz-art','t':'Max art decode','s':'2026-11-10T10:00','e':'2026-11-10T20:00','tags':['Raids'],'p':['Fixture'],'art':[],'raidDays':[{'date':'2026-11-10','five':[],'max':NAMES}]}]
DATA['rotation']=[];DATA['maxBattles']=[];DATA['maxRosters']=[]
# word split across lines => its Range has client rects on more than one line
SPLIT_JS="""el=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let bad=[],n;
 while(n=w.nextNode()){const re=/\\S+/g;let m;while(m=re.exec(n.data)){const r=document.createRange();r.setStart(n,m.index);r.setEnd(n,m.index+m[0].length);
  const tops=new Set([...r.getClientRects()].map(x=>Math.round(x.top)));if(tops.size>1)bad.push(m[0]);}}
 const lh=parseFloat(getComputedStyle(el).lineHeight)||parseFloat(getComputedStyle(el).fontSize)*1.3;
 return {bad,lines:Math.round(el.getBoundingClientRect().height/lh),overflow:el.scrollWidth>el.clientWidth+1}}"""
def run(browser,width):
  c=browser.new_context(viewport={'width':width,'height':900},timezone_id='Australia/Melbourne',service_workers='block',color_scheme='dark')
  art_urls=[]
  def api(r):
    if '/api/art' in r.request.url:art_urls.append(r.request.url);r.fulfill(body=PNG,status=200,content_type='image/png')
    else:r.fulfill(body='{"enabled":false,"events":[],"sources":[]}',content_type='application/json')
  c.route('**/api/**',api)
  # /img/ext/<dex>-gi-<hash>.png is the manifest-validated exact Gigantamax asset (served by the Worker, absent from the static server)
  c.route('**/img/ext/**',lambda r:(art_urls.append(r.request.url),r.fulfill(body=PNG,status=200,content_type='image/png')))
  c.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
  c.route('**/data.json',lambda r:r.fulfill(body=json.dumps(DATA),content_type='application/json'))
  page=c.new_page();errors=[];resp={}
  page.on('pageerror',lambda e:errors.append('pageerror '+str(e)))
  page.on('console',lambda m:errors.append('console '+m.text) if m.type=='error' else None)
  page.on('response',lambda r:resp.__setitem__(r.url,(r.status,r.headers.get('content-type',''))))
  page.clock.install(time='2026-11-09T12:00:00+11:00')
  page.goto(BASE+'/');page.wait_for_function("!!window.GODASH&&GOEventRegistry.settled()")
  page.locator('#tabs [data-tab="raids"]').click()
  rows=page.locator('.rw-event-day .rw-max-pokemon[data-max-boss]')
  assert [rows.nth(i).get_attribute('data-max-boss') for i in range(rows.count())]==NAMES,(width,'roster')
  for i,name in enumerate(NAMES):
    row=rows.nth(i);row.scroll_into_view_if_needed()
    img=row.locator('img.art').first
    assert img.count()==1,(width,name,'no artwork img (fallback shown instead of decoded art)')
    page.wait_for_function("e=>e.complete&&e.naturalWidth>0",arg=img.element_handle(),timeout=15000)
    info=img.evaluate("e=>({src:e.currentSrc,done:e.complete,w:e.naturalWidth,alt:e.alt})")
    assert info['done'] and info['w']>0,(width,name,info)
    status,ctype=resp[info['src']]
    assert status==200 and ctype.startswith('image/'),(width,name,info['src'],status,ctype)
    if name.startswith('Gigantamax'):
      # exact form: the validated Gigantamax asset or the exact-form route, never the base species
      assert re.search(r'Gigantamax|-gi-',info['src']),(width,name,info['src'])
    if name=='Gigantamax Urshifu Single Strike Style':
      assert 'n=Gigantamax%20Urshifu%20Single%20Strike%20Style' in info['src'] and 'dynamax=1' in info['src'],info['src']
    if name=='Dynamax Machop':assert 'n=Dynamax%20Machop' in info['src'],info['src']
    if name=='Bulbasaur':assert 'n=Bulbasaur' in info['src'] and 'Gigantamax' not in info['src'],info['src']
    # long names: not clipped, not split mid-word, not a tall sliver
    res=row.locator('.rw-max-txt b').evaluate(SPLIT_JS)
    assert not res['bad'] and not res['overflow'] and res['lines']<=3,(width,name,res)
    box=row.bounding_box()
    assert box['x']>=0 and box['x']+box['width']<=width+0.5,(width,name,box)
    guide=row.locator('.boss-guide-inline')
    if guide.count():
      g=guide.bounding_box();t=row.locator('.rw-max-txt').bounding_box()
      assert g['x']+g['width']<=box['x']+box['width']+0.5,(width,name,'guide button outside row')
      assert g['x']>=t['x']+t['width']-0.5 or g['y']>=t['y']+t['height']-0.5,(width,name,'guide button overlaps name')
  # Gigantamax and Dynamax stay visibly different
  tag=lambda i:rows.nth(i).locator('.max-tag').inner_text().strip()
  cls=lambda i:rows.nth(i).locator('.max-art').get_attribute('class')
  assert tag(0).lower()==tag(1).lower()=='g-max' and 'is-gmax' in cls(0) and 'is-gmax' in cls(1),(width,tag(0),tag(1))
  assert tag(2).lower()=='dynamax' and 'is-dyn' in cls(2) and 'is-gmax' not in cls(2),(width,tag(2))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,'horizontal overflow')
  assert art_urls,'/api/art was never requested'
  if OUT:
    Path(OUT).mkdir(parents=True,exist_ok=True);page.locator('.rw-event-day').first.screenshot(path=str(Path(OUT)/f'raids-max-art-decode-{width}.png'))
  assert not errors,(width,errors);c.close()
with sync_playwright() as p:
  browser=getattr(p,os.environ.get('GO_FIELD_NOTES_TEST_BROWSER','chromium')).launch()
  for w in (320,360,390,430):
    run(browser,w);print(f'PASS Max artwork decode and long-name layout at {w}px')
