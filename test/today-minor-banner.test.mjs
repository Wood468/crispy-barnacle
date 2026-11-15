import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.GOEVENTART = require('../public/event-art.js');
const TODAY = require('../public/today.js');
const catalogue = JSON.parse(fs.readFileSync(new URL('../public/events-v1.json', import.meta.url), 'utf8')).events;
const data = JSON.parse(fs.readFileSync(new URL('../public/data.json', import.meta.url), 'utf8')).events;

const now = Date.UTC(2026, 10, 16, 0);
const ctx = ev => ({ now, live: [], soon: [ev], week: [], regLive: [], regSoon: [], regWeek: [], boosts: { live: [], upcoming: [] }, seasons: [], done: [], hidden: [], ending: [],
  kindOf: () => ['Max Battle', '#7c5cff'], overseas: () => false, dayLabel: () => 'Mon', fallbackArt: () => '', monArt: (e, f) => '<span class="art" data-mon="' + f.name + '"></span>' });
/* A live record typed as a plain event with no featured roster takes the compact layout. */
const base = { id: 'leekduck:dynamax-trails-2026', name: 'Dynamax Trails', kind: 'event', region: '', featured: [], tags: ['Max Battles'], start: new Date(Date.UTC(2026, 10, 16, 10)), end: new Date(Date.UTC(2026, 10, 23, 20)) }; /* Dates, as the app builds them */
const PAGE = 'https://pokemongo.com/news/dynamax-trails-eternamax-eternatus-2026';
const render = ev => TODAY.render(ctx(ev));
const card = html => html.slice(html.indexOf('t1-minor'), html.indexOf('</article>', html.indexOf('t1-minor')));

test('Dynamax Trails (no featured Pokemon) shows its exact official banner in the compact slot', () => {
  const catImg = catalogue.find(e => e.eventId === 'dyntrails').image;
  assert.ok(catImg, 'catalogue holds the official image');
  const html = card(render({ ...base, img: catImg, artPageUrl: data.find(e => e.id === 'dyntrails').sourceUrl }));
  assert.match(html, /class="t1-minor-art"/);
  assert.match(html, /<img class="t1-minor-banner"[^>]* src="https:\/\/lh3\.googleusercontent\.com\/1ZxNwH9/);
  assert.match(html, /data-art-source="Pokémon GO \(official\)"/);
  assert.doesNotMatch(html, /t1-minor--noart/);
});

test('the Leek Duck article image for the same 2026 event is accepted; a mirrored same-origin copy is accepted', () => {
  const ld = 'https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-16-dynamax-trails-2026/dynamax-trails-2026.jpg';
  assert.match(card(render({ ...base, img: ld })), /t1-minor-banner/);
  assert.match(card(render({ ...base, img: '/img/ext/dynamax-trails-2026.jpg' })), /t1-minor-banner/);
});

test('no exact artwork: the slot is removed (no blank gap, no placeholder)', () => {
  const html = card(render({ ...base, img: '' }));
  assert.doesNotMatch(html, /t1-minor-art/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /t1-minor t1-minor--noart|t1-minor--noart/);
  assert.match(html, /Dynamax Trails/);
});

test('images that are not exact artwork for this event are never used', () => {
  for (const img of [
    'https://cdn.leekduck.com/assets/img/events/article-images/2025/2025-11-17-dynamax-trails-2025/dynamax-trails-2025.jpg', /* wrong year */
    'https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-21-november-communityday2026/pawniard-november-cd-2026.jpg', /* another event */
    'https://evil.example/dynamax-trails-2026.jpg', /* not an allowed host */
    'http://cdn.leekduck.com/assets/img/events/article-images/2026/dynamax-trails-2026/a.jpg', /* not https */
    '/art/25.webp', /* species sprite path, not event art */
    'https://pokemongo.com/static/default-placeholder.jpg', /* generic */
    'javascript:alert(1)'
  ]) {
    const html = card(render({ ...base, img }));
    assert.doesNotMatch(html, /t1-minor-banner|<img/, img);
    assert.match(html, /t1-minor--noart/, img);
  }
});

test('a featured Pokemon still takes the slot; the banner is only a fallback', () => {
  const html = card(render({ ...base, featured: [{ name: 'Grookey' }], img: catalogue.find(e => e.eventId === 'dyntrails').image }));
  assert.match(html, /data-mon="Grookey"/);
  assert.doesNotMatch(html, /t1-minor-banner|t1-minor--noart/);
});

test('the banner image removes itself on load failure, and CSS collapses the empty slot', () => {
  const html = card(render({ ...base, img: catalogue.find(e => e.eventId === 'dyntrails').image, artPageUrl: PAGE }));
  assert.match(html, /data-err="rm"/);
  const css = fs.readFileSync(new URL('../public/today.css', import.meta.url), 'utf8');
  assert.match(css, /\.t1-minor--noart,\.t1-minor:has\(> \.t1-minor-art:empty\)\{grid-template-columns:minmax\(0,1fr\) auto 44px\}/);
  assert.match(css, /\.t1-minor-art:empty\{display:none\}/);
});

test('Google/Pokemon GO hosted images are not trusted by host alone: they need a source page naming this event', () => {
  const lh3 = catalogue.find(e => e.eventId === 'dyntrails').image;
  const reject = (extra, why) => { const h = card(render({ ...base, img: lh3, ...extra })); assert.doesNotMatch(h, /<img|t1-minor-banner/, why); assert.match(h, /t1-minor--noart/, why); };
  reject({}, 'no source page at all');
  reject({ artPageUrl: 'https://pokemongo.com/news/communityday-november-2026-pawniard' }, 'page of another event');
  reject({ artPageUrl: 'https://evil.example/news/dynamax-trails-2026' }, 'page on a foreign host');
  reject({ artPageUrl: 'https://pokemongo.com/news/dynamax-trails-2025' }, 'page of another year');
  reject({ artPageUrl: '', link: 'http://pokemongo.com/news/dynamax-trails' }, 'not https');
  assert.match(card(render({ ...base, img: lh3, artPageUrl: PAGE })), /t1-minor-banner/);
  assert.match(card(render({ ...base, img: lh3, artPageUrl: '', link: PAGE })), /t1-minor-banner/, 'event link is the source page');
  const real = data.find(e => e.id === 'dyntrails');
  assert.match(card(render({ ...base, img: lh3, artPageUrl: real.artSourceUrl || '', link: real.sourceUrl })), /t1-minor-banner/, 'real curated record');
});

test('a GOEVENTART without resolve() (partial load) draws nothing instead of throwing', () => {
  const keep = globalThis.GOEVENTART;
  try { globalThis.GOEVENTART = {}; const h = card(render({ ...base, img: catalogue.find(e => e.eventId === 'dyntrails').image, artPageUrl: PAGE })); assert.match(h, /t1-minor--noart/); }
  finally { globalThis.GOEVENTART = keep; }
});
