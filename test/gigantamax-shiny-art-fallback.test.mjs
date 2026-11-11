import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const art = createRequire(import.meta.url)('../public/variant-art.js');
const form = 'gigantamax corviknight';
const normalUrl = '/img/ext/corviknight-gmax-regular.webp';
const shinyUrl = '/img/ext/corviknight-gmax-shiny.webp';
const manifest = { entries: {}, pokeminers: { gigantamax: [] } };
const speciesSrc = (name) => '/api/art?n=' + encodeURIComponent(name);
function resolve(shiny, legacy, m = manifest) {
  return art.resolve({ n: 'Gigantamax Corviknight', shiny }, m, {
    dexOf: (name) => name === 'corviknight' ? 823 : 0,
    speciesSrc,
    legacy,
  });
}

test('normal Gigantamax keeps its approved legacy image when shiny art is absent', () => {
  const result = resolve(false, { gmax: { [form]: normalUrl }, gmaxShiny: {} });
  assert.equal(result.status, 'exact');
  assert.equal(result.basis, 'legacy');
  assert.equal(result.src, normalUrl);
});

test('missing shiny Gigantamax never silently displays the normal Gigantamax sprite', () => {
  const result = resolve(true, { gmax: { [form]: normalUrl }, gmaxShiny: {} });
  assert.equal(result.kind, 'gigantamax');
  assert.equal(result.status, 'fallback');
  assert.equal(result.badge, 'Form art unavailable');
  assert.notEqual(result.src, normalUrl);
  assert.equal(result.src, '/api/art?n=Corviknight');
});

test('a verified legacy shiny Gigantamax image stays distinct from normal', () => {
  const legacy = { gmax: { [form]: normalUrl }, gmaxShiny: { [form]: shinyUrl } };
  const normal = resolve(false, legacy), shiny = resolve(true, legacy);
  assert.equal(shiny.status, 'exact');
  assert.equal(shiny.basis, 'legacy');
  assert.equal(shiny.src, shinyUrl);
  assert.notEqual(shiny.src, normal.src);
});

test('PokeMiners Gigantamax rule requests a shiny-specific URL, never the normal legacy URL', () => {
  const result = resolve(true, { gmax: { [form]: normalUrl }, gmaxShiny: {} },
    { entries: {}, pokeminers: { gigantamax: [823] } });
  assert.equal(result.status, 'exact');
  assert.equal(result.basis, 'rule');
  assert.equal(result.src, '/api/art?n=Gigantamax%20Corviknight&dynamax=1&shiny=1');
  assert.notEqual(result.src, normalUrl);
});
