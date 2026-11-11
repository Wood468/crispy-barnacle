"""Real-content visual acceptance for Today, Schedule and event details.

Set GO_FIELD_NOTES_SCREENSHOTS to retain the three screens at every viewport.
API responses are disabled; published local event data and real UI actions are used.
"""
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8791'
OUT = os.environ.get('GO_FIELD_NOTES_SCREENSHOTS')
if OUT:
    Path(OUT).mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    engine = os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')
    browser = getattr(p, engine).launch()
    for width, theme in [(320, 'light'), (375, 'dark'), (390, 'dark'), (430, 'light'), (768, 'light'), (1440, 'dark')]:
        context = browser.new_context(viewport={'width': width, 'height': 900},
                                      timezone_id='Australia/Sydney', service_workers='block')
        context.route('**/api/**', lambda r: r.fulfill(
            body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
        context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.clock.install(time='2026-11-06T12:00:00+11:00')
        page.goto(BASE + '/')
        page.wait_for_function('!!window.GODASH && !!window.GODETAIL')
        page.evaluate('(theme)=>document.documentElement.dataset.theme=theme', theme)
        page.wait_for_function('document.querySelector("#today-v1 .t1-card [data-open]")')

        def capture(name):
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (name, width)
            if OUT:
                page.screenshot(path=str(Path(OUT) / f'{name}-{width}.png'))

        # A live overseas event remains unfolded and starts above the bottom navigation.
        first = page.locator('#today-v1 .t1-card').first
        assert 'sendai' in first.inner_text().lower()
        title = first.locator('.t1-title')
        title.wait_for(state='visible')
        # Read the current connected title and its geometry in one browser task: a genuine late
        # source update can replace a card between locator resolution and an element evaluation.
        title_box=page.wait_for_function("""()=>{
            const el=document.querySelector('#today-v1 .t1-card .t1-title');
            if(!el)return false;
            const r=el.getBoundingClientRect();
            return r.height>0&&r.width>0?{y:r.y,height:r.height,width:r.width}:false;
        }""").json_value()
        assert title_box['height']>0 and title_box['width']>0 and title_box['y']+title_box['height']<820, (width,title_box)
        assert page.locator('#today-v1 .t1-tiles').is_visible()
        if width <= 430:
            header = page.locator('header.top').evaluate('''el => {
                const title = el.querySelector('h1').getBoundingClientRect();
                const actions = el.querySelector('.hbtns').getBoundingClientRect();
                return {titleBottom:title.bottom, actionsTop:actions.top, actionsBottom:actions.bottom};
            }''')
            assert header['actionsTop'] < header['titleBottom'] and header['actionsBottom'] < 85, (width, header)
        page.evaluate('scrollTo(0,0)')
        capture('today')
        page.locator('#tabs [data-tab="raids"]').click()
        page.wait_for_function('document.querySelectorAll("#rotnow .rw-raid .rc").length >= 2')
        if width <= 430:
            boss_cards = page.locator('#rotnow .rw-raid .rc').evaluate_all('''els => els.slice(0,2).map(el => {
                const r = el.getBoundingClientRect(); return {height:r.height,bottom:r.bottom};
            })''')
            assert all(c['height'] <= 165 for c in boss_cards), (width, boss_cards)
            assert boss_cards[1]['bottom'] < 900, (width, boss_cards)
        capture('raids')
        page.locator('#tabs [data-tab="events"]').click()
        page.wait_for_function('document.querySelector("#evtimeline [data-open]")')
        titles = page.locator('#evtimeline .evc-title-row h3')
        assert titles.first.is_visible()
        assert titles.evaluate_all('(els)=>els.every(e=>e.scrollHeight<=e.clientHeight+1)'), 'event title clipped'
        capture('schedule')
        page.locator('#subnav-events [data-sub="research"]').click()
        page.wait_for_selector('#research-list .research-event')
        assert page.locator('#research-list .research-reward-item img').count() >= 1, 'known item reward icon missing'
        assert page.locator('#research-list .research-reward-item .research-reward-qty').evaluate_all(
            '(els)=>els.every(e=>e.querySelector("img,.research-reward-neutral"))'), 'blank item reward art'
        capture('research')
        page.locator('#subnav-events [data-sub="timeline"]').click()
        # Select a date with the actual control, retaining keyboard focus and all seven targets.
        next_week = page.locator('#weekstrip [data-wk="1"]')
        next_week.focus()
        page.keyboard.press('Enter')
        assert next_week.evaluate('(el)=>el===document.activeElement')
        page.locator('#weekstrip [data-wk="-1"]').click()
        days = page.locator('.wk-days .wd')
        assert days.count() == 7
        assert days.evaluate_all('(els)=>els.every(e=>e.getBoundingClientRect().width>=44 && e.getBoundingClientRect().height>=44)')
        days.first.focus()
        page.keyboard.press('Enter')
        assert days.first.get_attribute('aria-pressed') == 'true'
        assert days.first.evaluate('(el)=>el===document.activeElement')
        # Clear the date selection so a sourced live event is available again.
        days.first.click()
        event = page.locator('#evtimeline [data-open]').first
        event.focus()
        page.keyboard.press('Enter')
        page.locator('#evd').wait_for(state='visible')
        assert page.locator('#evd-t').is_visible()
        assert page.locator('.evd-nav-link').evaluate_all('(els)=>els.every(e=>e.getBoundingClientRect().height>=44)')
        hero = page.locator('.evd-hero')
        assert hero.evaluate('(el)=>el.scrollWidth<=el.clientWidth'), 'detail hero overflow'
        capture('detail')
        before_hash = page.evaluate('location.hash')
        page.locator('.evd-nav-link[data-sec="details"]').click()
        assert page.locator('#evd-sources').is_visible()
        assert page.evaluate('location.hash') == before_hash
        page.keyboard.press('Escape')
        assert page.locator('#evd').is_hidden()
        assert event.evaluate('(el)=>el===document.activeElement'), 'detail close lost trigger focus'
        page.evaluate("GODETAIL.open('cur:gopassnov')")
        page.wait_for_function("document.getElementById('evd-t')?.textContent.includes('GO Pass')")
        assert page.locator('#evd .ue-pass-range').count()>=4
        assert page.locator('#evd .ue-pass-stages > li').count()>=90
        page.locator('#evd .evd-nav-link[data-sec="passes"]').click()
        assert page.locator('#evd .evd-sec:not([hidden])').count() == 1
        page.locator('#evd .ue-pass-range').filter(has_text='Rank 100').locator('summary').click()
        assert 'Rank 100' in page.locator('#evd').inner_text()
        assert page.locator('#evd').evaluate('(el)=>el.scrollWidth<=el.clientWidth'), ('GO Pass',width)
        capture('gopass')
        page.keyboard.press('Escape')
        page.evaluate("GODETAIL.open('leekduck:pokemon-go-wild-area-2026-mexico-city')")
        page.wait_for_function("document.getElementById('evd-t')?.textContent.includes('Mexico')")
        assert page.locator('#evd .research-task').count()==12
        raid_task=page.locator('#evd .research-task').filter(has_text='Win 2 raids')
        assert raid_task.locator('.research-reward').count()==3
        assert 'Conkeldurr' in raid_task.inner_text()
        costume_reward=raid_task.locator('.research-reward').filter(has_text='Machamp (Modern Jacket)')
        assert costume_reward.count()==1 and 'CP ' not in costume_reward.inner_text()
        page.locator('#evd .evd-nav-link[data-sec="research"]').click()
        assert page.locator('#evd .evd-sec:not([hidden])').count() == 1
        raid_task.scroll_into_view_if_needed()
        assert page.locator('#evd').evaluate('(el)=>el.scrollWidth<=el.clientWidth'), ('Research rewards',width)
        capture('research-rewards')
        page.keyboard.press('Escape')
        assert errors == [], errors
        print(f'PASS premium surfaces {engine} {width}px {theme}: live overseas visibility, full titles, calendar keyboard focus, detail links and close focus')
        context.close()
    browser.close()
