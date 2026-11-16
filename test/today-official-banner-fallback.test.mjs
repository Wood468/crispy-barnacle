import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.GOEVENTART = require('../public/event-art.js');
const TODAY = require('../public/today.js');
const cat = JSON.parse(fs.readFileSync(new URL('../public/events-v1.json', import.meta.url), 'utf8')).events;
const rec = id => cat.find(e => e.eventId === id);
const now = Date.UTC(2026, 10, 16, 0);
const SPECIAL = '<span class="sp-art sp-particle"></span><span class="sp-art sp-powerspot"></span>';
const ctx = ev => ({ now, live: [ev], soon: [], week: [], regLive: [], regSoon: [], regWeek: [], boosts: { live: [], upcoming: [] }, seasons: [], done: [], hidden: [], ending: [],
  kindOf: () => ['Max Battle', '#7c5cff'], overseas: () => false, dayLabel: () => 'Mon', fallbackArt: () => '', specialArt: () => SPECIAL, monArt: () => '' });
const base = { id: 'leekduck:dynamax-trails-2026', name: 'Dynamax Trails', kind: 'event', region: '', featured: [], tags: ['Max Battles'], start: new Date(Date.UTC(2026, 10, 16, 10)), end: new Date(Date.UTC(2026, 10, 23, 20)) };
const card = ev => { const h = TODAY.render(ctx(ev)); const i = h.indexOf('t1-minor'); return h.slice(i, h.indexOf('</article>', i)); };
const OFFICIAL = rec('dyntrails').image, OFFICIAL_PAGE = rec('dyntrails').sources[0].url;
const LD = rec('leekduck:dynamax-trails-2026').image;

test('verifiedBanner accepts the catalogue official image with its official page, and the Leek Duck article image', () => {
  assert.equal(TODAY.verifiedBanner(base, OFFICIAL, OFFICIAL_PAGE).src, OFFICIAL);
  assert.equal(TODAY.verifiedBanner(base, LD, '').src, LD);
});

test('verifiedBanner rejects the Google-hosted image without a page that names this event', () => {
  assert.equal(TODAY.verifiedBanner(base, OFFICIAL, ''), null);
  assert.equal(TODAY.verifiedBanner(base, OFFICIAL, 'https://pokemongo.com/news/some-other-event-2026'), null);
  assert.equal(TODAY.verifiedBanner(base, 'https://evil.example/x.jpg', OFFICIAL_PAGE), null);
});

test('verified banner wins over the special-art fallback on the compact card', () => {
  const html = card({ ...base, img: OFFICIAL, artPageUrl: OFFICIAL_PAGE });
  assert.match(html, /<img class="t1-minor-banner"/);
  assert.doesNotMatch(html, /sp-particle|sp-powerspot/);
});

test('unverified image (no page proof) falls back to the special art, never the unverified image', () => {
  const html = card({ ...base, img: OFFICIAL, artPageUrl: '' });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /sp-particle/);
  assert.doesNotMatch(html, /sp-powerspot/);
});

test('neither a verified banner nor special art: no-art layout', () => {
  const c = ctx({ ...base, img: '' }); c.specialArt = () => '';
  const h = TODAY.render(c), i = h.indexOf('t1-minor');
  const html = h.slice(i, h.indexOf('</article>', i));
  assert.match(html, /t1-minor--noart/);
  assert.doesNotMatch(html, /t1-minor-art|<img/);
});

test('dash.js offers the catalogue image through the same acceptance rule when the feed image does not verify', () => {
  const src = fs.readFileSync(new URL('../public/dash.js', import.meta.url), 'utf8');
  assert.match(src, /GOTODAY\.verifiedBanner\(imgHost,imgHost\.img,curPage\)&&GOTODAY\.verifiedBanner\(imgHost,model\.image,modelPage\)/);
  assert.match(src, /indexOf\('cur:'\+model\.eventId\)/);
});
