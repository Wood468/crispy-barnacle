"""Accuracy fixes: Global vs In person, offline banner wording, research task counts, GO Pass N of M.

Fixed Sydney clock. 320/360/390/430 dark. Set GO_FIELD_NOTES_SCREENSHOTS to keep screenshots.
"""
import os
import re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('GO_FIELD_NOTES_BATTLE_URL', 'http://127.0.0.1:8791')
SHOTS = os.environ.get('GO_FIELD_NOTES_SCREENSHOTS')
if SHOTS:
    os.makedirs(SHOTS, exist_ok=True)
MACHAMP = 'w-go-wild-area-gigantamax-machamp-power-up-timed-res'


def shot(page, name):
    if SHOTS:
        page.screenshot(path=f'{SHOTS}/{name}.png')


def context_for(browser, width):
    context = browser.new_context(viewport={'width': width, 'height': 860}, timezone_id='Australia/Sydney', service_workers='block', color_scheme='dark')
    context.route('**/api/**', lambda r: r.fulfill(body='{"enabled":false,"events":[],"sources":[]}', content_type='application/json'))
    context.route(re.compile(r'^https://fonts\.'), lambda r: r.fulfill(body='', content_type='text/css'))
    context.route(re.compile(r'^https://(lh3\.googleusercontent\.com|cdn\.leekduck\.com)/'), lambda r: r.abort())
    return context


def boot(page, when):
    page.clock.install(time=when)
    page.goto(BASE + '/')
    page.wait_for_function('!!window.GODASH && GOEventRegistry.settled()')


with sync_playwright() as p:
    browser = getattr(p, os.environ.get('GO_FIELD_NOTES_TEST_BROWSER', 'chromium')).launch()
    for width in (320, 360, 390, 430):
        # 1. Today (7 Nov): Mexico City is in person, global timed research is Global.
        context = context_for(browser, width)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        boot(page, '2026-11-07T12:00:00+11:00')
        model = page.evaluate("(id) => { const m = GOEventRegistry.find(id); return m && { attendance: m.attendance, kind: GOEventRegistry.display ? GOEventRegistry.display(m).kind : '' }; }", MACHAMP)
        assert model and model['attendance'] == '' and model['kind'] != 'person', model
        sendai = page.locator('.t1-card', has_text='Wild Area: Sendai').first
        assert sendai.count() == 1 and 'IN PERSON' in sendai.inner_text().upper() and 'OVERSEAS' in sendai.inner_text().upper(), 'overseas in-person stays visible and labelled'
        for card in page.locator('.t1-card, .t1-week').all():
            t = card.inner_text()
            if 'Machamp' in t:
                assert 'In person' not in t and 'IN PERSON' not in t, t
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
        sendai.scroll_into_view_if_needed()
        shot(page, f'accuracy-today-inperson-global-{width}')

        # 2. Event Details for the global timed research: not an In person card.
        page.evaluate(f"GODETAIL.open('{MACHAMP}')")
        page.wait_for_selector('#evd .ue-hero')
        hero = page.locator('#evd .ue-hero').inner_text()
        assert 'In person' not in hero and 'No official banner' not in hero, hero
        assert page.locator('#evd .ev-art-theme b', has_text='In person').count() == 0
        shot(page, f'accuracy-machamp-details-{width}')

        # 3. Offline: the banner exists but cannot be fetched. The label says so.
        page.evaluate("GODETAIL.close && GODETAIL.close()")
        context.set_offline(True)
        page.evaluate("window.dispatchEvent(new Event('offline'))")
        page.evaluate("GODETAIL.open('sendai')")
        page.wait_for_selector('#evd .ue-hero')
        page.wait_for_function("document.querySelector('#evd .ev-art') && document.querySelector('#evd .ev-art').classList.contains('is-failed')", timeout=8000)
        tag = page.locator('#evd .ev-art .ev-art-tag').first.text_content()
        assert tag == 'Banner unavailable offline', tag
        assert 'no official banner' not in page.locator('#evd .ue-hero').inner_text().lower()
        shot(page, f'accuracy-offline-banner-{width}')
        context.set_offline(False)

        # 4. Research count and GO Pass total for Into the Wild.
        page.evaluate("GODETAIL.open('into')")
        page.wait_for_selector('#evd .ue-hero')
        chip = page.locator('#evd .ue-factchips li', has_text='Research').first.inner_text()
        m = re.search(r'(\d+) tasks?', chip)
        assert m, chip
        n = int(m.group(1))
        in_dom = page.locator('#evd #evd-s-research .research-task').count()
        assert n == in_dom and n > 0, (chip, in_dom)
        header = page.locator('#evd #evd-h-research').inner_text()
        assert f'{n} tasks' in header, header
        assert page.locator('#evd .evd-nav-link[data-sec="research"] .evd-nav-count').inner_text() == str(n)
        pc = page.locator('#evd .ue-pass-count').first.inner_text()
        assert re.search(r'\d+ ranks with published entries · through Rank 600', pc), pc
        listed = int(re.match(r'(\d+) ranks with published entries', pc).group(1))
        assert 'of 600 ranks listed' not in pc, pc  # Do not imply every rank has published rewards.
        assert listed >= 100, listed
        # Continuous Event Details still offers an optional Research jump chip.
        page.locator('#evd .evd-nav-link[data-sec="research"]').click()
        # Assert the actual DOM, not just the research count badge: all seven
        # source-backed task boundaries and each reward/CP value must render.
        # This also exercises compact reward geometry at four phone widths.
        tasks = page.evaluate("""async () => {
            const response = await fetch('/event-details.json', {cache: 'no-store'});
            if (!response.ok) throw new Error('source research catalogue unavailable');
            const data = await response.json();
            return data.events.into.researchTasks.map(task => ({
                task: task.task, category: task.category, rewards: task.rewards
            }));
        }""")
        assert len(tasks) == 7 and n == 7, (width, n, [task['task'] for task in tasks])
        all_rows = page.locator('#evd-s-research li.research-task')
        assert all_rows.count() == 7, (width, all_rows.count())
        for task in tasks:
            row = all_rows.filter(has=page.locator('.rs-text', has_text=task['task']))
            assert row.count() == 1, (width, 'missing or duplicated task', task['task'])
            rewards = row.locator('.research-reward')
            assert rewards.count() == len(task['rewards']), (width, task['task'], rewards.count())
            assert row.locator('.rs-rewards').get_attribute('aria-label') == f"One of {len(task['rewards'])} possible rewards", (width, task['task'])
            for reward in task['rewards']:
                tile = rewards.filter(has_text=reward['name'])
                assert tile.count() == 1 and tile.first.is_visible(), (width, task['task'], reward)
                text = tile.first.inner_text()
                if reward['type'] == 'encounter':
                    assert f"CP {reward['cpMin']}–{reward['cpMax']}" in text, (width, task['task'], text)
                elif reward['quantity'] > 1:
                    assert f"{reward['quantity']}× {reward['name']}" in text, (width, task['task'], text)
        assert page.locator('#evd-s-research').is_visible(), (width, 'Research section hidden')
        overflow = page.evaluate("""() => {
            const root = document.querySelector('#evd');
            return {dialog: root.scrollWidth - root.clientWidth,
                document: document.documentElement.scrollWidth - document.documentElement.clientWidth};
        }""")
        assert overflow['dialog'] <= 2 and overflow['document'] <= 2, (width, overflow)
        print(f'PASS Into the Wild 7/7 Field Research DOM/rewards/CP at {width}px, overflow={overflow}')
        # Verify the entire seven-task source-backed catalogue in a REAL phone browser.
        # The event is historical after 13 Nov; keep it testable via its stable ID.
        expected_research = {
            'Catch 10 Pokémon': ['Horsea', 'Aron', 'Skrelp', 'Magnemite'],
            'Catch a Dynamax Machop': ['25× Machop Candy', '5000× Stardust'],
            'Catch a Dynamax Ralts': ['25× Ralts Candy', '5000× Stardust'],
            'Power up Dragon-type Pokémon 5 times': ['Bagon', 'Skrelp', 'Dratini', 'Horsea'],
            'Power up Steel-type Pokémon 5 times': ['Aron', 'Magnemite', 'Togedemaru', 'Galarian Meowth'],
            'Win a Max Battle': ['Bagon', 'Mawile'],
            'Win a raid': ['Dratini', '2× Rare Candy', 'Scyther'],
        }
        rows = page.locator('#evd-s-research .rs-list li.research-task')
        assert rows.count() == 7, (width, rows.count())
        for task_name, rewards in expected_research.items():
            row = rows.filter(has=page.locator('.rs-text', has_text=task_name))
            assert row.count() == 1, (width, task_name, row.count())
            assert row.locator('.research-reward').count() == len(rewards), (width, task_name)
            for reward in rewards:
                assert reward in row.inner_text(), (width, task_name, reward)
            alternatives = row.locator('.rs-rewards').get_attribute('aria-label')
            assert alternatives == f'One of {len(rewards)} possible rewards', (width, task_name, alternatives)
        for task_name in ('Power up Dragon-type Pokémon 5 times', 'Power up Steel-type Pokémon 5 times', 'Win a Max Battle', 'Win a raid', 'Catch 10 Pokémon'):
            row = rows.filter(has=page.locator('.rs-text', has_text=task_name))
            for reward in row.locator('.research-reward-encounter').all():
                label = reward.inner_text()
                assert re.search(r'CP \\d+–\\d+', label), (width, task_name, label)
        assert 'Galarian Meowth' in page.locator('#evd-s-research').inner_text()
        # No task or reward may escape the Event Details scroll surface.
        metrics = page.evaluate("""() => {
            const root=document.querySelector('#evd');
            const rows=[...root.querySelectorAll('#evd-s-research .rs-list li.research-task')];
            const box=root.getBoundingClientRect();
            return {width:innerWidth,scroll:root.scrollWidth,client:root.clientWidth,
                    document:document.documentElement.scrollWidth,
                    outside:rows.filter(x=>{const r=x.getBoundingClientRect();return r.left<box.left-2||r.right>box.right+2;}).length};
        }""")
        assert metrics['scroll'] <= metrics['client'] + 2 and metrics['document'] <= width + 2 and metrics['outside'] == 0, metrics
        print('Into the Wild 7/7 mobile research rendered', metrics)
        # Source-backed Into the Wild task "Win a raid" lists 2× Rare Candy.
        # The approved asset list has no exact Rare Candy item picture, so the
        # readable RC glyph must appear, not a fake regular-Candy image/dot.
        rare = page.locator('#evd-s-research .research-reward-item', has_text='Rare Candy').first
        assert rare.count() == 1 and rare.is_visible(), (width, 'Rare Candy research reward hidden')
        assert '2× Rare Candy' in rare.inner_text(), (width, rare.inner_text())
        symbol = rare.locator('.ue-reward-category[data-item-glyph="rare-candy"]')
        assert symbol.count() == 1 and symbol.inner_text() == 'RC', (width, rare.inner_html())
        box = symbol.bounding_box()
        assert box and box['width'] >= 34 and box['height'] >= 34, (width, box)
        assert rare.locator('.ue-reward-item-icon img, .ue-reward-dot').count() == 0, (width, 'ambiguous item art/dot')
        page.locator('#evd #evd-h-research').scroll_into_view_if_needed()
        page.evaluate('window.scrollBy(0, -110)')
        shot(page, f'accuracy-research-count-{width}')
        page.locator('#evd .evd-nav-link[data-sec="passes"]').click()
        page.locator('#evd .ue-pass-count').first.scroll_into_view_if_needed()
        page.evaluate('window.scrollBy(0, -110)')
        shot(page, f'accuracy-gopass-total-{width}')
        assert not errors, errors
        context.close()
    browser.close()
print('accuracy fixes browser checks passed')
