import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const lib = createRequire(import.meta.url)('../public/lib.js');
const variant = createRequire(import.meta.url)('../public/variant-art.js');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const code = app.slice(app.indexOf('  function costumeUnavailable('), app.indexOf('  /* Tap any Pokémon picture'));
function renderer(pictures = {}, manifest = null) {
  const context = { window: { GOLIB: lib, GOVARIANTART: variant }, esc: lib.esc, MAN: {}, AMAN: manifest, DEXNO: { pikachu: 25, espeon: 196 }, COSTPIC: pictures, COSTSH: {}, GMX: {}, GMSH: {} };
  vm.createContext(context); vm.runInContext(code, context);
  return (value) => context.art(value, 'ea');
}
test('unverified costume sprites show a labelled fallback, never ordinary artwork', () => {
  const html = renderer()({ n: 'Pikachu (sun crown)', label: 'sun crown', costume: true });
  assert.match(html, /Costume art unavailable/);
  assert.match(html, /Pikachu \(sun crown\)/);
  /* The ordinary species picture may appear only as a small decorative image inside the badged tile: never tappable, never claiming the costume. */
  assert.match(html, /class="va-base" alt=""/);
  assert.match(html, /class="va-badge">Costume art unavailable/);
  assert.doesNotMatch(html, /data-sn=|data-costume-name=|data-still=/);
  assert.equal((html.match(/<img/g) || []).length, 1);
});
test('an approved manifest costume resolves to its exact route; shiny asks for the shiny file', () => {
  const manifest = { entries: { [variant.variantKey({ dex: 25, kind: 'costume', costume: 'sun-crown' })]: { status: 'approved', url: '/api/art?n=Pikachu&c=GOFEST_2024_STIARA' },
    [variant.variantKey({ dex: 25, kind: 'costume', costume: 'sun-crown', shiny: true })]: { status: 'approved', url: '/api/art?n=Pikachu&c=GOFEST_2024_STIARA&shiny=1' } } };
  const render = renderer({}, manifest);
  assert.match(render({ n: 'Pikachu (sun crown)', label: 'sun crown', costume: true }), /src="\/api\/art\?n=Pikachu&c=GOFEST_2024_STIARA"/);
  assert.match(render({ n: 'Pikachu (sun crown)', label: 'sun crown', costume: true, shiny: true }), /GOFEST_2024_STIARA&shiny=1/);
  assert.match(render({ n: 'Pikachu (moon crown)', label: 'moon crown', costume: true }), /Costume art unavailable/, 'another costume never borrows this picture');
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
  const nodes = { opps: { innerHTML: '', contains: () => false, querySelectorAll: () => [] }, 'opp-status': {}, 'opp-search': { value: '' }, 'opp-filter': { value: 'all' } };
  const row = { name: 'Source-published future Pokémon', costume: false, o: { state: 'unreleased', base: 'Future Pokémon', why: 'Not released in Pokémon GO yet' }, evs: [{ name: 'Announced debut event', id: 'cur:debut', kind: 'debut' }] };
  const context = { $: id => nodes[id], LIB: lib, opportunities: () => [row], document: { activeElement: null }, DEXGEN: {}, genConfirmed: () => false, usKeys: () => [], isFollowed: () => false, esc: lib.esc, art: () => '', timeMeta: () => 'Source-published date', countdown: () => 'Upcoming' };
  vm.createContext(context); vm.runInContext(helpers, context); context.drawOpps();
  assert.match(nodes.opps.innerHTML, /Upcoming Pokémon debuts/);
  assert.match(nodes.opps.innerHTML, /Not released yet/);
  assert.doesNotMatch(nodes.opps.innerHTML, /data-mark=|class="opp missing"/);
  assert.match(nodes['opp-status'].textContent, /1 of 1/);
});

test('the image error handler only accepts image elements and same-origin artwork fallbacks', () => {
  const code = app.slice(app.indexOf('  window.GOARTERR='), app.indexOf('  /* Animated sprites:'));
  const context = { window: { location: { origin: 'https://app.test' }, GOLIB: lib }, URL };
  vm.createContext(context); vm.runInContext(code, context);
  let removed = false;
  const img = { tagName: 'IMG', hasAttribute: () => false, getAttribute: key => key === 'data-still' ? '/art/25.webp' : '/missing.png', classList: { remove() {} }, remove() { removed = true; } };
  context.window.GOARTERR(img);
  assert.equal(img.src, 'https://app.test/art/25.webp');
  assert.equal(removed, false);
  img.getAttribute = key => key === 'data-still' ? 'javascript:alert(1)' : '/missing.png';
  context.window.GOARTERR(img);
  assert.equal(removed, true);
  context.window.GOARTERR({ tagName: 'IFRAME', remove() { throw new Error('non-image was modified'); } });
});

test('live/curated integration keeps exact official costume variants instead of bare species sprites', () => {
  const dash = fs.readFileSync(new URL('../public/dash.js', import.meta.url), 'utf8');
  const code = dash.slice(dash.indexOf('  function mergeLiveAndCurated('), dash.indexOf('  function announced('));
  const context = { window: { GOLIB: lib }, LIB: lib, mergeHighlights: (a,b) => (a||[]).concat(b||[]) };
  vm.createContext(context); vm.runInContext(code, context);
  const dates = { start: new Date('2026-11-24T10:00:00Z'), end: new Date('2026-11-30T20:00:00Z') };
  const live = { ...dates, id: 'leekduck:twilight-wishes-2026', name: 'Twilight Wishes', featured: [{name:'Pikachu'}, {name:'Espeon'}, {name:'Staryu'}], notes: [], bonuses: [] };
  const curated = { ...dates, id:'cur:twilightwishes', name:'Twilight Wishes', status:'official_confirmed', link:'https://pokemongo.com/news/twilight-wishes-2026', featured: [
    {name:'Pikachu (sun crown)', costume:true, label:'sun crown'},
    {name:'Pikachu (moon crown)', costume:true, label:'moon crown'},
    {name:'Espeon (sun scarf)', costume:true, label:'sun scarf'},
    {name:'Staryu'}
  ] };
  const [result] = context.mergeLiveAndCurated([live], [curated]);
  assert.equal(result.featured.filter(f=>f.costume).length,3);
  assert.ok(!result.featured.some(f=>['Pikachu','Espeon'].includes(f.name)));
  assert.ok(result.featured.some(f=>f.name==='Staryu' && !f.costume));
  assert.equal(result.status,'official_confirmed');
  assert.ok(result.aliasIds.includes('cur:twilightwishes'));
});
