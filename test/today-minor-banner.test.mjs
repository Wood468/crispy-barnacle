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
  const html = card(render({ ...base, img: catalogue.find(e => e.eventId === 'dyntrails').image }));
  assert.match(html, /data-err="rm"/);
  const css = fs.readFileSync(new URL('../public/today.css', import.meta.url), 'utf8');
  assert.match(css, /\.t1-minor--noart,\.t1-minor:has\(> \.t1-minor-art:empty\)\{grid-template-columns:minmax\(0,1fr\) auto 44px\}/);
  assert.match(css, /\.t1-minor-art:empty\{display:none\}/);
});
