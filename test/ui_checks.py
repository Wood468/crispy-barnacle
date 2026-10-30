"""Browser checks for the Phase 2 dashboard (needs: pip install playwright; a static server: cd public && python3 -m http.server 8791).
Run: python3 test/ui_checks.py. Mocks every /api/* call, fixes the clock to Fri 10 Oct 2026 22:45 Melbourne time."""
import json,sys,re,base64,time
PNG1=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')

# Stable fixture: two sourced Brisbane City Safari locations, with no raid hotspots.
PLACES_FIXTURE = r'''{"updated":"2026-10-10","tags":["Event venue","Community Day","Raids","Gyms","PokéStops"],"places":[{"id":"queen-street-mall-brisbane","name":"Queen Street Mall","city":"Brisbane","region":"Queensland","country":"Australia","lat":-27.4696,"lng":153.0252,"type":"City Safari hub","role":"City Safari Hub, 26 and 27 Sep 2026, 9 am to 6 pm; also the rain backup for the Saturday community photo","tags":["Event venue"],"sources":[{"label":"Pokémon GO Hub","url":"https://pokemongohub.net/post/event/pokemon-go-city-safari-2026-brisbane-australia/","vouches":"Role as the hub, its hours and dates","trust":"community"}],"coords":{"label":"Wikipedia, article “Queen Street Mall”","url":"https://en.wikipedia.org/wiki/Queen_Street_Mall","note":"Marks the mall (Wikipedia gives -27.4696, 153.0252). Not an official event pin"},"verified":"2026-10-10","route":null,"events":[{"name":"City Safari: Brisbane","from":"2026-09-26","to":"2026-09-27"}]},{"id":"king-george-square-brisbane","name":"King George Square","city":"Brisbane","region":"Queensland","country":"Australia","lat":-27.4683,"lng":153.0243,"type":"Community photo and trade hour","role":"Community photo 12 pm and trade hour 4 pm, Sunday 27 Sep 2026","tags":["Event venue"],"sources":[{"label":"Pokémon GO Hub","url":"https://pokemongohub.net/post/event/pokemon-go-city-safari-2026-brisbane-australia/","vouches":"Role, times and date","trust":"community"}],"coords":{"label":"Wikipedia, article “King George Square”","url":"https://en.wikipedia.org/wiki/King_George_Square","note":"Taken from the article's map link (-27.468333, 153.024313), rounded to 4 places. Marks the square, not an official event pin"},"verified":"2026-10-10","route":null,"events":[{"name":"City Safari: Brisbane","from":"2026-09-27","to":"2026-09-27"}]}]}'''
from playwright.sync_api import sync_playwright
OUT='/tmp/go_ui_'
def ful(body,ct='application/json'): return lambda route,req: route.fulfill(body=body,content_type=ct)
fails=[]
import os
SHARD=os.environ.get('UI_SHARD','')  # a, b or c runs one third in CI; empty runs everything
def on(k): return SHARD in ('',k)
def ev(i,name,type,start,end,status,feat=None): return {'id':'leekduck:'+i,'name':name,'type':type,'start':start,'end':end,'tzMode':'local','scope':'worldwide_local','region':None,'featured':feat or [],'bonuses':[],'status':status,'reports':[{'source':'leekduck','link':'https://leekduck.com/events/'+i+'/'}]}
def check(name,cond,extra=''):
    print(('PASS ' if cond else 'FAIL ')+name+(' '+str(extra) if extra and not cond else ''))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b=p.chromium.launch()
    def page(api=None,marks=None,clock='2026-10-09T22:45:00+11:00',sources=None,gens=None,us=None,extra=None,pin=False,slow_places=False):
        ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='Australia/Melbourne',locale='en-AU',service_workers='block')
        pg=ctx.new_page(); pg.errs=[]
        pg.on('pageerror',lambda e:pg.errs.append(str(e)))
        pg.clock.install(time=clock)
        pg.route('**/api/sources',ful(sources or '{"environment":"production","database":true,"enabled":false,"sources":[]}'))
        pg.route('**/api/events',ful(api or '{"enabled":false,"events":[]}'))
        pg.route(re.compile(r'/(img/ext|infographics)/'),lambda r:r.fulfill(body=PNG1,content_type='image/png'))  # R2 pictures are not in the static folder
        pg.route('**/api/userstate*',lambda r:r.fulfill(status=404,body='{}',content_type='application/json'))
        pg.route('**/api/dex',lambda r:r.fulfill(status=401,body='{}',content_type='application/json'))
        pg.route('**/api/art*',lambda r:r.fulfill(status=404,body=''))
        for pat,(body,st) in (extra or {}).items(): pg.route(pat,(lambda body,st:(lambda r,req=None:r.fulfill(status=st,body=body,content_type='application/json')))(body,st))
        if slow_places:
            def delay_places(route):
                time.sleep(1.5)
                route.continue_()
            pg.route('**/places.js*', delay_places)
        if pin: pg.add_init_script("localStorage.setItem('gofn-pin','x')")
        if marks: pg.add_init_script("localStorage.setItem('gofn-dex-v1',%s)"%json.dumps(json.dumps(marks)))
        if us: gens=gens or []
        if gens or us: pg.add_init_script("if(!localStorage.getItem('gofn-us-v1'))localStorage.setItem('gofn-us-v1',%s)"%json.dumps(json.dumps(dict({'pref:gen:%d'%g:{'v':True,'t':1} for g in (gens or [])} and {'pref:gen:%d'%g:{'v':True,'t':1} for g in (gens or [])},**{k:{'v':v,'t':1} for k,v in (us or {}).items()}))))
        pg.goto('http://localhost:8791/'); pg.wait_for_selector('.pc, .prio-empty',state='attached'); pg.wait_for_timeout(300)
        return pg
    if on('a'):
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
        touch_page.context.close()

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
        next_button.click()
        next_page.locator('#evd').wait_for(state='visible')
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
        places_page.wait_for_function("window.GODETAIL && !window.GOPLACES", timeout=1200)
        check('Event detail loader is ready while the places script is still delayed', bool(places_page.evaluate('window.GOPLACES_READY')))
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
        check('no marks: no "You need" reasons anywhere', pg.locator('text=/You need/').count()==0)
        check('no console/page errors on load', pg.errs==[], pg.errs)
        pg.locator('[data-infographic="cur:trek"].info-available').wait_for(state="attached")
        check('card with an infographic shows a 44px thumbnail button', pg.locator('[data-infographic="cur:trek"].igthumb img[loading=lazy]').count()==1 and pg.locator('[data-infographic="cur:trek"].igthumb').bounding_box()['width']>=44 and not pg.locator('[data-infographic="cur:trek"]').is_disabled())
        check('card with no infographic shows an always-on Check infographic button (no thumbnail)', pg.locator('[data-igcheck="cur:zorua"]').first.inner_text()=='Check infographic' and not pg.locator('[data-igcheck="cur:zorua"]').first.is_disabled() and pg.locator('[data-igcard="cur:zorua"] img').count()==0)
        check('infographic buttons are accessible', 'Open infographic for' in pg.locator('[data-infographic="cur:trek"]').first.get_attribute('aria-label') and 'infographic' in pg.locator('[data-igcheck="cur:zorua"]').first.get_attribute('aria-label'))
        check('Check infographic button keeps its button role', pg.locator('[data-igcheck="cur:zorua"]').first.get_attribute('role') is None)
        pg.locator('[data-igcheck="cur:zorua"]').first.click(); pg.wait_for_timeout(600)
        check('Check infographic says so in place when nothing is found', pg.locator('[data-igcheck="cur:zorua"]').first.inner_text()=='No infographic found yet' and not pg.locator('#goinfo:not([hidden])').count())
        # A thumbnail address that cannot be fetched falls back to the Check infographic button (the rest of this run serves a valid PNG for every picture).
        pb=page(extra={'**/img/ext/4aa21432-0cfc-4c93-b3eb-0c15f322389d-0119b088.webp':('',404)}); pb.wait_for_timeout(800)
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
        # 3. follow + save persist
        pg.click('nav.tabs button[data-tab="collect"]'); pg.wait_for_timeout(200); pg.evaluate("document.getElementById('sub-opps').hidden=false")
        pg.locator('#opps .fbtn').first.click(); pg.wait_for_timeout(100)
        pg.click('nav.tabs button[data-tab="events"]'); pg.click('#subnav-events button[data-sub="timeline"]'); pg.wait_for_timeout(200)
        pg.locator('#evtimeline .star').first.click(); pg.wait_for_timeout(100)
        ls=pg.evaluate("localStorage.getItem('gofn-us-v1')") or '{}'
        check('follow and save written to local state', 'follow:' in ls and 'saved:' in ls, ls)
        pg.reload(); pg.wait_for_selector('.pc, .prio-empty',state='attached'); pg.click('#hwatch'); pg.wait_for_timeout(300)
        check('saved + followed survive reload', pg.locator('#savedev .evc').count()>=1 and pg.locator('#followed .opp').count()>=1)
        pg.screenshot(path=OUT+'saved.png')
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
            actual={'live':int(refresh.locator('#day-live-count').inner_text()),'upcoming':int(refresh.locator('#day-upcoming-count').inner_text())}
            expected=refresh.evaluate("""() => {
              const t=new Date(), endDay=new Date(t); endDay.setHours(0,0,0,0); endDay.setDate(endDay.getDate()+1);
              const events=window.GODASH.events(), visible=e=>!e.long&&!window.GODASH.kindHidden(e.kind);
              const live=events.filter(e=>visible(e)&&e.start<=t&&e.end>t).length+window.GODASH.regionalEvents().filter(e=>e.start<=t&&e.end>t).length;
              const today=events.filter(e=>visible(e)&&((e.start<=t&&e.end>t)||(e.start>t&&e.start<endDay)));
              return {live:live,upcoming:today.filter(e=>e.start>t).length};
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
        pg.click('#subnav-events button[data-sub="calendar"]'); pg.wait_for_timeout(300)
        check('Events opens as a calendar with region filters and Day/Week/Month', pg.locator('#calreg [data-creg]').count()==6 and pg.locator('#calreg [data-cscope]').count()==3)
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
        check('all four primary destinations remain visible on narrow mobile', pg.locator('nav.tabs button:visible').count()==4 and pg.evaluate("![...document.querySelectorAll('nav.tabs button')].some(b=>{const r=b.getBoundingClientRect();return r.left<0||r.right>innerWidth})") and not pg.evaluate('document.documentElement.scrollWidth>innerWidth'))
        pg.set_viewport_size({'width':390,'height':844})
        pg.click('#hmenu'); pg.wait_for_timeout(200)
        check('Menu holds alerts, sync, calendar and sources', pg.locator('#sub-menu #alertsdd').count()==1 and pg.locator('#sub-menu #usstat').count()==1 and pg.locator('#sub-menu #calcard').count()==1 and pg.locator('#sub-menu a[href="/sources.html"]').count()==1)
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
        check('places: each row shows coordinates, type, source and last-verified date', '−27.4696, 153.0252' in pt and 'City Safari hub' in pt and 'Pokémon GO Hub' in pt and 'Last verified 10 Oct 2026' in pt, pt[:400])
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
        check('places: raid activity is stated as unknown, never live', 'Unknown. Nothing here says raids happen now.' in dt and 'No live raid evidence' in dt)
        check('places: detail names the source and verified date', 'Wikipedia' in dt and '10 Oct 2026' in dt and 'Pokémon GO Hub' in dt)
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
            ctx=b.new_context(viewport={'width':390,'height':844},timezone_id='Australia/Melbourne',locale='en-AU'); pg=ctx.new_page(); pg.errs=[]
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
        pg=fpage(api([],{},enabled=False),clock='2026-10-29T22:45:00+11:00'); line=pg.inner_text('#fresh-line')
        check('live feed off: names the snapshot date and warns when the snapshot is old', 'Live feed not connected' in line and 'as of 13 Oct 2026' in line and 'snapshot may be stale' in line and not _re.search(r'\d+:\d\d (am|pm)',line), line)
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
        ppg=pctx.new_page(); ppg.goto('http://localhost:8791/',wait_until='domcontentloaded')
        ppg.wait_for_function("!!(navigator.serviceWorker && navigator.serviceWorker.controller)",timeout=15000)
        cached=ppg.evaluate("""async()=>{const names=(await caches.keys()).filter(n=>n.startsWith('gofn-shell-'));for(const name of names){const c=await caches.open(name);if(await c.match('/index.html'))return true;}return false;}""")
        check('PWA: service worker controls the app and caches the shell', cached, ppg.evaluate("caches.keys()"))
        pctx.set_offline(True)
        ppg.reload(wait_until='domcontentloaded',timeout=15000)
        check('PWA: app shell opens after network is disconnected', ppg.locator('h1').inner_text().strip().lower()=='go field notes', ppg.evaluate("({title:document.title,h1:document.querySelector('h1')&&document.querySelector('h1').innerText,url:location.href,controller:!!navigator.serviceWorker.controller})"))
        pctx.close()
    b.close()
print('\nFAILED:',fails if fails else 'none')
if fails:
    sys.exit(1)
