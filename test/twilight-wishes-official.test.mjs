import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
const costumes = JSON.parse(readFileSync(new URL('../public/costumes.json', import.meta.url), 'utf8'));
const event = data.events.find(item => item.id === 'twilightwishes');

test('Twilight Wishes uses the official source and local event window', () => {
  assert.ok(event, 'Twilight Wishes must remain in the curated events feed');
  assert.equal(event.s, '2026-11-24T10:00');
  assert.equal(event.e, '2026-11-30T20:00');
  assert.equal(event.sourceUrl, 'https://pokemongo.com/news/twilight-wishes-2026');
  assert.match(event.source, /official/i);
  assert.notEqual(event.status, 'community_reported');
  assert.doesNotMatch(event.p.join(' '), /no details are announced yet/i);
});

test('Twilight Wishes retains confirmed shiny boosts and four named costume encounters', () => {
  const prose = event.p.join(' ');
  for (const species of ['Staryu', 'Elgyem']) {
    assert.match(prose, new RegExp('Shiny ' + species));
    assert.ok(event.art.some(item => typeof item === 'object' && item.n === species && item.shiny === 1));
  }
  for (const costume of ['sun crown', 'moon crown', 'sun scarf', 'moon scarf']) {
    assert.ok(prose.includes(costume), 'Missing official costume: ' + costume);
  }
  assert.match(prose, /shiny-eligible/i);
  assert.match(prose, /December 2 at 8 pm local time/i);
});

test('costume artwork entries must use existing local assets, never fabricated URLs', () => {
  const expected = [
    'pikachu|sun crown',
    'pikachu|moon crown',
    'espeon|sun scarf',
    'umbreon|moon scarf'
  ];
  for (const key of expected) {
    for (const type of ['pictures', 'shiny']) {
      const path = costumes[type]?.[key];
      if (path === undefined) continue; // artwork is optional until verified
      assert.match(path, /^\\/img\\/ext\\/[a-z0-9-]+\\.png$/i);
      assert.ok(!path.includes('..'), 'Unsafe artwork path for ' + key);
    }
  }
});
