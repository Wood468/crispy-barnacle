import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const A = createRequire(import.meta.url)('../public/event-art.js');
const sendai = { name: 'Pokémon GO Wild Area 2026: Sendai • Tohoku', kind: 'person', region: 'Sendai, Japan', start: '2026-11-06T10:00', end: '2026-11-08T18:00' };
const KEY = 'https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-06-pokemon-go-wild-area-2026-sendai-japan/key-art.jpg';

test('official art: real Leek Duck article image for the exact event, year and place', () => {
  const r = A.resolve(sendai, [KEY]);
  assert.equal(r.kind, 'official'); assert.equal(r.src, KEY);
  assert.equal(r.provenance.source, 'Leek Duck'); assert.match(r.provenance.verifiedFor, /Sendai.*2026/);
});
test('generic, default and category images are never official', () => {
  for (const u of ['https://cdn.leekduck.com/assets/img/events/events-default-img.jpg', 'https://cdn.leekduck.com/assets/img/events/mega-default.jpg', 'https://cdn.leekduck.com/assets/img/events/pokemonspotlighthour.jpg'])
    assert.equal(A.resolve({ name: 'Spotlight Hour', kind: 'spot', start: '2026-11-18' }, [u]).kind, 'themed', u);
});
test('another year or another event folder is rejected', () => {
  assert.equal(A.resolve(sendai, ['https://cdn.leekduck.com/assets/img/events/article-images/2025/2025-11-06-pokemon-go-wild-area-2025-sendai/key-art.jpg']).kind, 'themed');
  assert.equal(A.resolve(sendai, ['https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-06-community-day-pawniard/key-art.jpg']).kind, 'themed');
});
test('Mexico City art does not decorate Sendai', () => {
  const mx = 'https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-06-pokemon-go-wild-area-2026-mexico-city/key-art.jpg';
  assert.equal(A.resolve(sendai, [mx]).kind, 'themed');
  assert.equal(A.resolve({ name: 'Pokémon GO Wild Area 2026: Mexico City', region: 'Mexico City, Mexico', start: '2026-11-06' }, [mx]).kind, 'official');
});
test('future imported events resolve the same way with no code change', () => {
  const ev = { name: 'GO Fest 2027: Osaka', kind: 'person', region: 'Osaka, Japan', start: '2027-06-12T10:00', end: '2027-06-14T18:00' };
  assert.equal(A.resolve(ev, ['https://cdn.leekduck.com/assets/img/events/article-images/2027/2027-06-12-go-fest-2027-osaka/hero.jpg']).kind, 'official');
  assert.equal(A.resolve(ev, []).kind, 'themed');
  assert.equal(A.resolve(ev, [{ url: 'https://pokemongo.com/static/news/gofest-osaka.jpg', pageUrl: 'https://pokemongo.com/news/gofest' }]).provenance.source, 'Pokémon GO (official)');
  assert.equal(A.resolve({ name: 'Unknown thing', start: '2027-01-01' }, ['http://insecure.example/x.jpg']).kind, 'themed');
});
test('themes are category based and banner markup reserves space and can fail to themed', () => {
  assert.equal(A.theme({ kind: 'raid', name: 'X' }).key, 'raid');
  assert.equal(A.theme({ name: 'GO Pass: November' }).key, 'pass');
  assert.equal(A.theme({ name: 'Pawniard Community Day', kind: 'cd' }).key, 'cd');
  assert.equal(A.theme(sendai).key, 'person');
  const html = A.banner(A.resolve(sendai, [KEY]), { ev: sendai });
  assert.match(html, /data-art-kind="official"/); assert.match(html, /--ar:16 \/ 9/); assert.match(html, /data-art-source="Leek Duck"/);
  assert.match(html, /ev-art-theme/); assert.doesNotMatch(A.banner(A.resolve({ name: 'x', start: '2026-01-01' }, []), {}), /<img class="ev-art-img"/);
});

test('events with missing or invalid dates never throw', () => {
  assert.equal(A.resolve({ name: 'Festival of Lights', start: new Date(NaN), end: undefined }, []).kind, 'themed');
  assert.equal(A.resolve({ name: 'x' }, [KEY]).kind, 'themed');
});
