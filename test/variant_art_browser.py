"""Variant artwork across Today, Event Details, Raids and Max Battles: exact costume art, Shiny, Shadow, Dynamax, Gigantamax,
labelled fallbacks, no broken images. /api/art is served from deterministic synthetic pictures (set GO_FIELD_NOTES_LIVE_ART=1
to fetch the real pictures from production for screenshots instead). Screenshots go to GO_FIELD_NOTES_SCREENSHOTS."""
import json
import os
import re
import struct
import urllib.parse
import urllib.request
import zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
BASE='http://127.0.0.1:8791'
SHOTS=Path(os.environ.get('GO_FIELD_NOTES_SCREENSHOTS','/tmp/gofn-screenshots'))
SHOTS.mkdir(parents=True,exist_ok=True)
LIVE=os.environ.get('GO_FIELD_NOTES_LIVE_ART')=='1'
DEX=json.loads((ROOT/'public/dex.json').read_text())
MANIFEST=json.loads((ROOT/'public/artwork-manifest.json').read_text())
REQUESTS=[]
_cache={}

def fetch(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0 go-field-notes-test'}),timeout=20).read()

def png(seed):
    """A small deterministic RGBA picture whose colour depends on the request (so different variants are visibly different)."""
    h=zlib.crc32(seed.encode());r,g,b=(h>>16)&255,(h>>8)&255,h&255;w=96
    rows=b''.join(b'\x00'+b''.join(bytes((r,g,b,255)) if 12<x<w-12 and 8<y<w-8 else bytes((0,0,0,0)) for x in range(w)) for y in range(w))
    def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,w,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')

def art(route):
    url=route.request.url;REQUESTS.append(url);q=urllib.parse.parse_qs(urllib.parse.urlparse(url).query);name=(q.get('n') or [''])[0]
    # Pictures the game files do not have: a Gigantamax form that was never published, and any unlisted costume code.
    if name in ('Gigantamax Slowbro',) or (q.get('c') and q['c'][0] not in {'GOFEST_2024_STIARA','GOFEST_2024_MTIARA','GOFEST_2024_SSCARF','GOFEST_2024_MSCARF'}):
        route.fulfill(status=404,body='Not found');return
    if LIVE:
        try:
            if url not in _cache:_cache[url]=fetch('https://pogo.michaelpuff.com'+urllib.parse.urlparse(url).path+'?'+urllib.parse.urlparse(url).query)
            route.fulfill(body=_cache[url],content_type='image/png');return
        except Exception:
            route.fulfill(status=404,body='Not found');return
    route.fulfill(body=png(urllib.parse.urlparse(url).query),content_type='image/png',headers={'cache-control':'public,max-age=60'})

def ext(route):
    path=urllib.parse.urlparse(route.request.url).path
    if LIVE:
        try:
            if path not in _cache:_cache[path]=fetch('https://pogo.michaelpuff.com'+path)
            route.fulfill(body=_cache[path],content_type='image/png');return
        except Exception:
            route.fulfill(status=404,body='Not found');return
    route.fulfill(body=png(path),content_type='image/png')

def other_api(route):
    if route.request.url.split('?',1)[0].endswith(('/api/events','/api/sources')):
        route.fulfill(body='{"enabled":false,"events":[],"sources":[]}',content_type='application/json')
    else:route.fulfill(status=404,body='{}',content_type='application/json')

FUTURE={'schemaVersion':1,'eventId':'synthetic-variant-showcase','title':'Synthetic Variant Showcase','family':'go-fest',
 'schedule':{'timeBasis':'instant','start':'2026-11-07T00:00Z','end':'2026-11-30T00:00Z'},
 'pokemon':[{'speciesId':'25','name':'Pikachu','shiny':'yes'},
            {'speciesId':'25','name':'Pikachu','costumeId':'suncrown','label':'sun crown'},
            {'speciesId':'196','name':'Espeon','costumeId':'sunscarf','label':'sun scarf'},
            {'speciesId':'854','name':'Sinistea','costumeId':'bow','label':'Bow'},
            {'speciesId':'133','name':'Eevee','costumeId':'partyhat','label':'party hat'},
            {'speciesId':'68','name':'Shadow Machamp','formId':'shadow'},
            {'speciesId':'483','name':'Dialga'},
            {'speciesId':'483','name':'Dynamax Dialga','formId':'dynamax'},
            {'speciesId':'6','name':'Gigantamax Charizard','formId':'gmax'},
            {'speciesId':'80','name':'Gigantamax Slowbro','formId':'gmax'},
            {'speciesId':'26','name':'Raichu','formId':'alola'}],
 'encounters':[{'identityKey':k,'method':'raid'} for k in ['25:base:none','25:base:suncrown','196:base:sunscarf','854:base:bow','133:base:partyhat','68:shadow:none','483:base:none','483:dynamax:none','6:gmax:none','80:gmax:none','26:alola:none']],
 'internalValidation':{'native':True},'sources':[{'name':'Synthetic fixture only','url':'https://example.invalid/fixture'}]}

def data_fixture():
    """The real data.json plus one live event, this week's raid rotation and Max Battle, all naming variants."""
    from datetime import datetime,timedelta
    from zoneinfo import ZoneInfo
    now=datetime.now(ZoneInfo('Australia/Melbourne'));fmt=lambda d:d.strftime('%Y-%m-%dT%H:%M');day=lambda d:d.strftime('%Y-%m-%d')
    monday=(now-timedelta(days=now.weekday())).replace(hour=10,minute=0,second=0,microsecond=0)
    data=json.loads((ROOT/'public/data.json').read_text())
    data['events']=[{'id':'syn-live-variants','t':'Variant Showcase','s':fmt(now-timedelta(hours=1)),'e':fmt(now+timedelta(days=1)),'tags':['Event'],
      'p':['Synthetic fixture: every artwork variant on one live card.'],
      'art':[{'n':'Pikachu (sun crown)','costume':1,'label':'sun crown','shiny':1},{'n':'Espeon (sun scarf)','costume':1,'label':'sun scarf'},{'n':'Umbreon (moon scarf)','costume':1,'label':'moon scarf'},{'n':'Pikachu','shiny':1},
             'Gigantamax Charizard','Gigantamax Slowbro','Dynamax Dialga',{'n':'Sinistea (Bow)','costume':1,'label':'Bow'}]}]+data['events']
    data['rotation']=[{'s':fmt(monday),'e':fmt(monday+timedelta(days=7)),'five':'Dialga','mega':'Mega Sableye','shadow':'Shadow Machamp','rh':'Dialga'},
                      {'s':fmt(monday+timedelta(days=7)),'e':fmt(monday+timedelta(days=14)),'five':'Palkia','mega':'Mega Manectric','shadow':'Shadow Thundurus (Incarnate)','rh':'Palkia'}]
    data['maxBattles']=[[day(monday),day(monday+timedelta(days=6)),'Gigantamax Charizard'],[day(monday+timedelta(days=7)),day(monday+timedelta(days=13)),'Gigantamax Slowbro']]+[m for m in data['maxBattles'] if m[0]>day(monday+timedelta(days=14))]
    return data

COLLECT='''()=>{const out=[];document.querySelectorAll('#evd .ue-mon').forEach(m=>{const a=m.querySelector('.ue-mon-art');const img=a&&a.querySelector('img.art');const ph=a&&a.querySelector('.costume-unavailable');const fb=a&&a.querySelector('.art-fb');
  const label=(img&&img.alt)||(ph&&ph.getAttribute('aria-label'))||(fb&&fb.getAttribute('aria-label'))||((m.querySelector('b')||{}).textContent)||'';
  out.push({text:label,src:img?img.getAttribute('src'):'',placeholder:!!ph,badge:ph?(ph.querySelector('.va-badge')||{}).textContent||'':'',
   baseSrc:ph&&ph.querySelector('.va-base')?ph.querySelector('.va-base').getAttribute('src'):fb&&fb.querySelector('img')?fb.querySelector('img').getAttribute('src'):'',chip:fb&&fb.querySelector('.form-chip')?fb.querySelector('.form-chip').textContent:'',
   lazy:img?img.loading==='lazy'&&img.decoding==='async'&&img.hasAttribute('width')&&img.hasAttribute('height'):true})});return out}'''
BROKEN='''()=>[...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0&&i.currentSrc).map(i=>i.currentSrc)'''
# A local http.server fixture cannot serve published R2-only /infographics/* images.
# Preserve checks for every other broken image, including all Pokemon/form artwork.
# The real G47IX R2 image bytes are verified independently on production (audit PR #806).
BROKEN_BATTLE_STATIC='''()=>[...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0&&i.currentSrc&&!new URL(i.currentSrc).pathname.startsWith('/infographics/')).map(i=>i.currentSrc)'''

def shot(page,name):
    page.screenshot(path=str(SHOTS/name),full_page=False)

with sync_playwright() as p:
    engine=os.environ.get('GO_FIELD_NOTES_TEST_BROWSER','chromium')
    browser=getattr(p,engine).launch()
    for width in [320,375,390,430]:
        context=browser.new_context(viewport={'width':width,'height':900},timezone_id='Australia/Melbourne',service_workers='block')
        context.set_default_timeout(90000 if LIVE else 15000)
        context.route('**/img/ext/**',ext)
        context.route('**/api/art**',art)
        context.route('**/api/**',lambda r:art(r) if '/api/art' in r.request.url else other_api(r))
        context.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
        cat=json.loads((ROOT/'public/events-v1.json').read_text())
        context.route('**/events-v1.json',lambda r:r.fulfill(body=json.dumps({**cat,'events':cat['events']+[FUTURE]}),content_type='application/json'))
        context.route('**/data.json',lambda r:r.fulfill(body=json.dumps(data_fixture()),content_type='application/json'))
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/');page.wait_for_function('!!window.GODETAIL&&!!window.GOEventRegistry&&!!window.GODASH')
        page.evaluate('GOEventRegistry.ready')
        page.wait_for_function('document.querySelectorAll("#today-v1 img.art").length>0')
        page.wait_for_timeout(600)
        assert page.evaluate(BROKEN)==[], ('broken images on Today',page.evaluate(BROKEN))
        assert page.evaluate("[...document.querySelectorAll('#today-v1 img.art')].every(i=>i.loading==='lazy'&&i.decoding==='async'&&i.width>0&&i.height>0)"),'Today pictures must be lazy, async and size-reserved'
        assert page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),'Today overflows horizontally at %dpx'%width
        shot(page,f'today-{width}.png')
        # Featured Gigantamax picture on Today (real data has Gigantamax Duraludon): exact route or the labelled fallback, never plain species art.
        today_gmax=page.evaluate("[...document.querySelectorAll('#today-v1 img.art[alt*=\"Gigantamax\"]')].map(i=>i.getAttribute('src'))")
        assert all('Gigantamax' in s or '/img/ext/' in s or 'dynamax' in s for s in today_gmax),today_gmax

        # Event Details: the four approved costumes use their own exact files; unapproved ones are badged species pictures.
        page.evaluate("GODETAIL.open('synthetic-variant-showcase')")
        page.locator('#evd .evd-nav-link[data-sec="encounters"]').click()
        page.wait_for_function('document.querySelectorAll("#evd .ue-mon").length>=9')
        page.wait_for_timeout(500)
        tiles={t['text']:t for t in page.evaluate(COLLECT)}
        def tile(sub):
            for k,v in tiles.items():
                if sub.lower() in k.lower():return v
            raise AssertionError((sub,list(tiles)))
        sun=tile('sun crown');assert 'c=GOFEST_2024_STIARA' in sun['src'] and not sun['placeholder'],sun
        scarf=tile('sun scarf');assert 'c=GOFEST_2024_SSCARF' in scarf['src'],scarf
        for sub,label in [('bow','Sinistea'),('party hat','Eevee')]:
            t=tile(sub);assert t['placeholder'] and t['badge']=='Costume art unavailable',t
            assert t['baseSrc'].endswith('n='+label) or ('/art/' in t['baseSrc']),('species picture only, never another costume',t)
            assert 'c=' not in t['baseSrc'],t
        page.wait_for_function("document.querySelectorAll('#evd .art-fb').length>=1")
        tiles={t['text']:t for t in page.evaluate(COLLECT)}
        gm=tile('Slowbro');assert gm['chip']=='Form art unavailable' and 'n=Slowbro' in gm['baseSrc'],gm
        gch=tile('Charizard');assert gch['src'] and 'n=Charizard' not in gch['src'] or 'Gigantamax' in gch['src'],gch
        assert not gch['chip'],('an exact Gigantamax picture needs no fallback chip',gch)
        shadow=tile('Shadow Machamp');assert shadow['src'] and 'c=' not in shadow['src'],shadow
        dyn=tile('Dynamax Dialga');assert dyn['src'] and 'Dynamax' not in dyn['badge'],dyn
        # Normal and Dynamax share the species model, but cannot be visually identical.
        # The universal gallery bypasses monArt(), so verify its explicit Max CSS cue.
        appearance=page.evaluate("""() => {
            const cards=[...document.querySelectorAll('#evd .ue-mon')];
            const find=name=>cards.find(c=>[...c.querySelectorAll('b')].some(b=>b.textContent.trim()===name));
            const normal=find('Dialga'),max=find('Dynamax Dialga');
            if(!normal||!max)return {};
            const a=normal.querySelector('.ue-mon-art'),b=max.querySelector('.ue-mon-art');
            return {ordinaryFlag:a.querySelector('img.art')?.getAttribute('data-sd')||'',
                    dynamaxFlag:b.querySelector('img.art')?.getAttribute('data-sd')||'',
                    ordinaryChip:getComputedStyle(a,'::after').content,
                    dynamaxChip:getComputedStyle(b,'::after').content,
                    ordinaryRing:getComputedStyle(a,'::before').borderTopWidth,
                    dynamaxRing:getComputedStyle(b,'::before').borderTopWidth};
        }""")
        assert appearance.get('ordinaryFlag')=='' and appearance.get('dynamaxFlag')=='1',appearance
        assert 'DYNAMAX' in appearance['dynamaxChip'] and 'DYNAMAX' not in appearance['ordinaryChip'],appearance
        assert appearance['dynamaxRing']!='0px' and appearance['ordinaryRing']!='2px',appearance
        page.emulate_media(reduced_motion='reduce')
        assert page.evaluate("""() => {
            const node=[...document.querySelectorAll('#evd .ue-mon')].find(c=>c.querySelector('b')?.textContent.trim()==='Dynamax Dialga');
            return !!node && getComputedStyle(node.querySelector('.ue-mon-art'),'::after').content.includes('DYNAMAX');
        }"""),'Max identity badge must remain visible in reduced-motion mode'
        assert all(t['lazy'] for t in tiles.values()),'gallery pictures must be lazy, async and size-reserved'
        assert page.evaluate(BROKEN)==[],('broken images in Event Details',page.evaluate(BROKEN))
        assert page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),'Event Details overflows at %dpx'%width
        page.evaluate("document.querySelector('#evd .evd-in').scrollIntoView()")
        shot(page,f'event-details-variants-{width}.png')
        # Scroll the gallery into view for a second picture of the tiles themselves.
        page.evaluate("(document.querySelector('#evd .ue-gallery')||document.querySelector('#evd .ue-mon')).scrollIntoView({block:'start'})")
        page.wait_for_timeout(300);shot(page,f'event-details-gallery-{width}.png')
        page.keyboard.press('Escape')
        page.wait_for_function('!GONAV.internal&&GONAV.pending.length===0')

        # Real Twilight Wishes and Halloween events from the catalogue.
        for ev_id,slug in [('twilightwishes','twilight-wishes'),('halloween1','halloween-1')]:
            page.evaluate("(id)=>GODETAIL.open(id)",ev_id)
            page.locator('#evd .evd-nav-link[data-sec="encounters"]').click()
            page.wait_for_function('document.querySelectorAll("#evd .ue-mon").length>=1');page.wait_for_timeout(500)
            real=page.evaluate(COLLECT)
            if slug=='twilight-wishes':
                for sub,code in [('sun crown','GOFEST_2024_STIARA'),('moon crown','GOFEST_2024_MTIARA'),('sun scarf','GOFEST_2024_SSCARF'),('moon scarf','GOFEST_2024_MSCARF')]:
                    hit=[t for t in real if sub in t['text'].lower()];assert hit and any('c='+code in t['src'] for t in hit),(sub,hit)
            else:
                bow=[t for t in real if 'bow' in t['text'].lower()];assert bow and all(t['placeholder'] and t['badge']=='Costume art unavailable' for t in bow),bow
            assert page.evaluate(BROKEN)==[]
            page.evaluate("(document.querySelector('#evd .ue-gallery')||document.querySelector('#evd .ue-mon')).scrollIntoView({block:'start'})");page.wait_for_timeout(250)
            shot(page,f'{slug}-gallery-{width}.png')
            page.keyboard.press('Escape');page.wait_for_function('!GONAV.internal&&GONAV.pending.length===0')

        # Battle tab: current and upcoming Raid bosses, then Max Battles (Dynamax and Gigantamax).
        page.locator('#tab-button-raids').click();page.wait_for_selector('#tab-raids:not([hidden])');page.wait_for_timeout(900)
        assert page.evaluate(BROKEN_BATTLE_STATIC)==[],('broken non-R2 images in Battle',page.evaluate(BROKEN_BATTLE_STATIC))
        shot(page,f'battle-raids-{width}.png')
        shadow_img=page.locator('#tab-raids img.art[alt*="Shadow"]').first
        assert shadow_img.count()==1,'Shadow raid boss picture missing'
        shadow_img.scroll_into_view_if_needed();page.evaluate("window.scrollBy(0,-160)");page.wait_for_timeout(400)
        shot(page,f'battle-shadow-{width}.png')
        assert page.evaluate("[...document.querySelectorAll('#tab-raids img.art')].every(i=>i.loading==='lazy'&&i.decoding==='async'&&i.width>0&&i.height>0)"),'Battle pictures must be lazy, async and size-reserved'
        max_art=page.locator('#tab-raids .max-art').first
        assert max_art.count()==1,'Max Battle picture missing'
        max_art.scroll_into_view_if_needed();page.evaluate("window.scrollBy(0,-160)");page.wait_for_timeout(400)
        info=page.evaluate("({gmax:document.querySelectorAll('.max-art.is-gmax').length,dyn:document.querySelectorAll('.max-art.is-dyn').length})")
        assert info['gmax']>=1,info
        shot(page,f'battle-max-{width}.png')
        assert page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),'Battle tab overflows at %dpx'%width
        assert errors==[],errors
        context.close()
        print(f'PASS variant artwork {engine} {width}px: exact costumes, shiny, shadow, dynamax, gigantamax, labelled fallbacks, no broken images, no overflow (max tiles {info})')
    # Missing exact art must degrade without a layout jump or broken image even when every picture request fails.
    context=browser.new_context(viewport={'width':375,'height':900},timezone_id='Australia/Melbourne',service_workers='block')
    context.set_default_timeout(90000 if LIVE else 15000)
    context.route('**/api/**',lambda r:r.fulfill(status=404,body='Not found') if '/api/art' in r.request.url else other_api(r))
    context.route(re.compile(r'^https://fonts\.'),lambda r:r.fulfill(body='',content_type='text/css'))
    context.route('**/events-v1.json',lambda r:r.fulfill(body=json.dumps({**cat,'events':cat['events']+[FUTURE]}),content_type='application/json'))
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/');page.wait_for_function('!!window.GODETAIL&&!!window.GOEventRegistry');page.evaluate('GOEventRegistry.ready')
    page.evaluate("GODETAIL.open('synthetic-variant-showcase')")
    page.locator('#evd .evd-nav-link[data-sec="encounters"]').click()
    page.wait_for_function('document.querySelectorAll("#evd .ue-mon").length>=9');page.wait_for_timeout(800)
    assert page.evaluate(BROKEN)==[],'no broken image may remain when every picture request fails'
    assert errors==[],errors
    print('PASS variant artwork: every picture request failing leaves no broken image and no page error')
