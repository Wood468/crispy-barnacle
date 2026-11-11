import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/dash.js', import.meta.url), 'utf8');
const start = source.indexOf('  function maxArtKind(ev, f) {');
const end = source.indexOf('  /* Events with no Pokémon', start);
assert.ok(start >= 0 && end > start, 'Today artwork identity helper and renderer exist');

const { maxArtKind, monArt } = vm.runInNewContext(
  '(function(){' + source.slice(start, end) + ';return {maxArtKind,monArt};})()',
  {
    hasTag: () => false,
    incenseNames: () => ({}),
    art: (args) => JSON.stringify(args),
    IMG_DYNAMAX: '/img/ext/max-emblem.png',
  },
);
const form = (event, name) => maxArtKind(event, { name });

test('a generic Gigantamax research event does not turn its entire roster Gigantamax', () => {
  const ev = { name: 'Gigantamax Machamp Power Up Timed Research', kind: 'research' };
  assert.equal(form(ev, 'Machamp'), 'gigantamax');
  assert.equal(form(ev, 'Dialga'), '');
  assert.equal(form(ev, 'Gimmighoul'), '');
  const unrelated = monArt(ev, { name: 'Dialga' }, 'ea');
  assert.doesNotMatch(unrelated, /Gigantamax Dialga|max-art/);
  assert.match(unrelated, /"n":"Dialga"/);
  const featured = monArt(ev, { name: 'Machamp' }, 'ea');
  assert.match(featured, /max-art is-gmax/);
  assert.match(featured, /Gigantamax Machamp/);
});

test('individual form prefixes are authoritative even in mixed future events', () => {
  const ev = { name: 'Global Festival', kind: 'event' };
  assert.equal(form(ev, 'Gigantamax Duraludon'), 'gigantamax');
  assert.equal(form(ev, 'Dynamax Dialga'), 'dynamax');
  assert.equal(form(ev, 'Duraludon'), '');
  assert.equal(form(ev, 'Dialga'), '');
  assert.match(monArt(ev, { name: 'Dynamax Dialga' }, 'ea'), /max-art is-dyn/);
  assert.match(monArt(ev, { name: 'Gigantamax Duraludon' }, 'ea'), /max-art is-gmax/);
});

test('named Max title identifies its own form, not another featured Pokémon', () => {
  const ev = { name: 'Gigantamax Duraludon and Dynamax Dialga Weekend', kind: 'event' };
  assert.equal(form(ev, 'Duraludon'), 'gigantamax');
  assert.equal(form(ev, 'Dialga'), 'dynamax');
  assert.equal(form(ev, 'Palkia'), '');
});

test('the Max Monday and collective Dynamax rosters retain existing Max cues', () => {
  const trio = { name: 'Dynamax Uxie, Mesprit and Azelf', kind: 'max' };
  for (const name of ['Uxie', 'Mesprit', 'Azelf']) assert.equal(form(trio, name), 'dynamax');
  const monday = { name: 'Max Monday', kind: 'max' };
  assert.equal(form(monday, 'Machop'), 'dynamax');
  const mixed = { name: 'Gigantamax Machamp Max Battles', kind: 'max' };
  assert.equal(form(mixed, 'Machamp'), 'gigantamax');
  assert.equal(form(mixed, 'Pikachu'), '', 'Max event type alone never invents another form in a G-Max event');
});

test('normal event form names and costume art remain untouched', () => {
  for (const name of ['Zacian', 'Gimmighoul (Roaming Form)', 'Pikachu (Sun Crown)']) {
    assert.equal(form({ name: 'GO Wild Area', kind: 'event' }, name), '');
  }
});