import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.GOEVENTART = require('../public/event-art.js');
const TODAY = require('../public/today.js');

/* ---- footer "Events as of": derived from the feed's recorded refresh, never a hard-coded or curated date ---- */
function loadFresh(sources) {
  const els = { asof: { textContent: '' }, 'asof-wrap': { hidden: true } };
  const win = { GO: { esc: s => String(s), MON: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], D: { asOf: '9 Nov 2026' }, showTab() {} },
    GOLIB: { jsonOrNull: async u => (u === '/api/sources' ? sources : null), loadPrices: async () => null }, performance: { now: () => 0 } };
  win.window = win; win.document = { getElementById: id => els[id] || null, addEventListener() {} }; win.setTimeout = () => 0;
  vm.runInNewContext(fs.readFileSync(new URL('../public/fresh.js', import.meta.url), 'utf8'), win);
  return { win, els, ready: () => new Promise(r => setImmediate(r)) };
}

test('footer date is the day of the feed refresh, formatted like 16 Nov 2026', async () => {
  const when = new Date(2026, 10, 16, 7, 30).getTime();
  const { win, els, ready } = loadFresh({ enabled: true, feed: { state: 'fresh', lastSuccess: when } });
  await ready();
  assert.equal(win.GOFRESH.asOfText(), '16 Nov 2026');
  assert.equal(els.asof.textContent, '16 Nov 2026');
  assert.equal(els['asof-wrap'].hidden, false);
});

test('footer date is omitted (not stale) when the feed has no recorded refresh', async () => {
  for (const src of [null, { enabled: false }, { enabled: true, feed: { state: 'never', lastSuccess: null } }, { enabled: true, feed: { state: 'unknown', lastSuccess: 'garbage' } }]) {
    const { els, ready } = loadFresh(src);
    await ready();
    assert.equal(els.asof.textContent, '', JSON.stringify(src));
    assert.equal(els['asof-wrap'].hidden, true, JSON.stringify(src));
  }
});

test('app.js no longer fills the footer from the curated snapshot date', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /\$\('asof'\)\.textContent\s*=\s*D\.asOf/);
});

/* ---- Today compact card reuses the Schedule card's special art ---- */
const now = Date.UTC(2026, 10, 16, 0);
const SPECIAL = '<span class="sp-art sp-powerspot"><img class="art" alt="Power Spot" src="/img/ext/powerspots-overworld-5a586254.webp"></span>';
const ctx = (ev, extra = {}) => ({ now, live: [ev], soon: [], week: [], regLive: [], regSoon: [], regWeek: [], boosts: { live: [], upcoming: [] }, seasons: [], done: [], hidden: [], ending: [],
  kindOf: () => ['Event', '#7c5cff'], overseas: () => false, dayLabel: () => 'Mon', fallbackArt: () => '', monArt: () => '', ...extra });
const base = { id: 'x:dynamax-trails-2026', name: 'Dynamax Trails', kind: 'event', region: '', featured: [], tags: ['Max Battles', 'Power Spots'], start: new Date(Date.UTC(2026, 10, 16, 10)), end: new Date(Date.UTC(2026, 10, 23, 20)) };
const card = html => html.slice(html.indexOf('t1-minor'), html.indexOf('</article>', html.indexOf('t1-minor')));

test('compact card with no Pokemon or banner shows the Schedule special art when the event has it', () => {
  const html = card(TODAY.render(ctx(base, { specialArt: ev => (ev.tags.includes('Power Spots') ? SPECIAL : '') })));
  assert.match(html, /class="t1-minor-art"[^>]*>\s*<span class="sp-art sp-powerspot"/);
  assert.doesNotMatch(html, /t1-minor--noart/);
});

const PARTICLE = '<span class="sp-art sp-particle"><img class="art" alt="Max Particles" src="/img/ext/Max-Particle-Sprite-9818b5dc.png"><span class="max-tag">Max Particles</span></span>';
const BOTH = SPECIAL + PARTICLE;

test('compact card prefers the Max Particles image over the Power Spot map when the event has both', () => {
  const html = card(TODAY.render(ctx(base, { specialArt: () => BOTH })));
  assert.match(html, /sp-particle/);
  assert.match(html, /Max-Particle-Sprite-9818b5dc\.png/);
  assert.doesNotMatch(html, /sp-powerspot|powerspots-overworld/);
  assert.equal((html.match(/<img/g) || []).length, 1);
});

test('compact card falls back to the Power Spot image only when there is no Max Particles art', () => {
  const html = card(TODAY.render(ctx(base, { specialArt: () => SPECIAL })));
  assert.match(html, /sp-powerspot/);
  assert.doesNotMatch(html, /sp-particle/);
  const only = card(TODAY.render(ctx(base, { specialArt: () => PARTICLE })));
  assert.match(only, /sp-particle/);
});

test('compact card keeps the no-art layout when specialArt returns nothing usable', () => {
  const html = card(TODAY.render(ctx(base, { specialArt: () => '<span class="other">x</span>' })));
  assert.match(html, /t1-minor--noart/);
  assert.doesNotMatch(html, /t1-minor-art|<img/);
});

test('compact card keeps the no-art layout when the event has no special art or no helper is supplied', () => {
  const none = { ...base, tags: ['Max Battles'] };
  for (const c of [ctx(none, { specialArt: () => '' }), ctx(base)]) {
    const html = card(TODAY.render(c));
    assert.match(html, /t1-minor--noart/);
    assert.doesNotMatch(html, /t1-minor-art|<img/);
  }
});
