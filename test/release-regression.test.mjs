import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const lib = createRequire(import.meta.url)('../public/lib.js');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const code = app.slice(app.indexOf('  function costumeUnavailable('), app.indexOf('  /* Tap any Pokémon picture'));
function renderer(pictures = {}) {
  const context = { window: { GOLIB: lib }, esc: lib.esc, MAN: {}, COSTPIC: pictures, COSTSH: {}, GMX: {}, GMSH: {} };
  vm.createContext(context); vm.runInContext(code, context);
  return (value) => context.art(value, 'ea');
}
test('unverified costume sprites show a labelled fallback, never ordinary artwork', () => {
  const html = renderer()({ n: 'Pikachu (sun crown)', label: 'sun crown', costume: true });
  assert.match(html, /Costume art unavailable/);
  assert.match(html, /Pikachu \(sun crown\)/);
  assert.doesNotMatch(html, /<img|\/api\/art|\/art\//i);
});
test('a verified exact costume uses its mirror, with no ordinary-art fallback', () => {
  const render = renderer({ 'pikachu|sun crown': '/img/ext/verified-sun-crown.png' });
  const html = render({ n: 'Pikachu (sun crown)', label: 'sun crown', costume: true });
  assert.match(html, /src="\/img\/ext\/verified-sun-crown.png"/);
  assert.match(html, /data-costume-name=/);
  assert.doesNotMatch(html, /data-still=|data-sn=/);
  assert.match(render({ n: 'Pikachu', label: 'moon crown', costume: true }), /Costume art unavailable/);
});
test('normal and shiny artwork retain their existing paths', () => {
  assert.match(renderer()({ n: 'Pikachu', shiny: true }), /\/api\/art\?n=Pikachu&shiny=1/);
});
test('Twilight Wishes costume records have distinct identities and never imply base-species raids', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
  const ev = data.events.find(x => x.id === 'twilightwishes');
  const costumes = ev.art.filter(x => typeof x === 'object' && x.costume);
  assert.equal(costumes.length, 4);
  assert.equal(new Set(costumes.map(x => lib.norm(x.n))).size, 4);
  assert.ok(costumes.every(x => x.label && x.n.includes(x.label)));
  assert.ok(!ev.art.some(x => typeof x === 'string' && ['Pikachu', 'Espeon', 'Umbreon'].includes(x)));
});
test('unreleased opportunities remain visible without inventing collection ownership', () => {
  const source = fs.readFileSync(new URL('../public/dash.js', import.meta.url), 'utf8');
  const helpers = source.slice(source.indexOf('  function opportunityEventRow('), source.indexOf("  if ($('opp-search'))"));
  const nodes = { opps: { innerHTML: '', contains: () => false }, 'opp-status': {}, 'opp-search': { value: '' }, 'opp-filter': { value: 'all' } };
  const row = { name: 'Source-published future Pokémon', costume: false, o: { state: 'unreleased', base: 'Future Pokémon', why: 'Not released in Pokémon GO yet' }, evs: [{ name: 'Announced debut event', id: 'cur:debut', kind: 'debut' }] };
  const context = { $: id => nodes[id], LIB: lib, opportunities: () => [row], document: { activeElement: null }, DEXGEN: {}, genConfirmed: () => false, usKeys: () => [], isFollowed: () => false, esc: lib.esc, art: () => '', timeMeta: () => 'Source-published date', countdown: () => 'Upcoming' };
  vm.createContext(context); vm.runInContext(helpers, context); context.drawOpps();
  assert.match(nodes.opps.innerHTML, /Upcoming Pokémon debuts/);
  assert.match(nodes.opps.innerHTML, /Not released yet/);
  assert.doesNotMatch(nodes.opps.innerHTML, /data-mark=|class="opp missing"/);
  assert.match(nodes['opp-status'].textContent, /1 of 1/);
});
