import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const adapter = require('../public/event-adapter.js');
const dex = JSON.parse(readFileSync(new URL('../public/dex.json', import.meta.url), 'utf8'));
const css = readFileSync(new URL('../public/dash.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../public/detail.js', import.meta.url), 'utf8');
const components = readFileSync(new URL('../public/event-components.js', import.meta.url), 'utf8');
adapter.configureSpecies(dex);

test('normal and Dynamax are separate event identities for existing and future species', () => {
  for (const name of ['Registeel', 'Regidrago', 'Latias', 'Latios', 'Meltan', 'Machop']) {
    const regular = adapter.pokemon({ name });
    const max = adapter.pokemon({ name: 'Dynamax ' + name });
    assert.equal(regular.speciesId, max.speciesId, name);
    assert.equal(max.formId, 'dynamax', name);
    assert.notEqual(regular.key, max.key, name);
  }
});

test('direct artwork in all universal Event Details slots has a visibly different Max cue', () => {
  // Unlike monArt() cards, the gallery, research and GO Pass reward lanes
  // inject exactArt() images directly, without the .max-art wrapper.
  for (const host of ['ue-mon-art', 'ue-reward-art', 'ue-pass-art']) {
    assert.ok(css.includes(host), host);
  }
  assert.match(css, /:is\(\.ue-mon-art,\.ue-reward-art,\.ue-pass-art\):has\(> img\.art\[data-sd="1"\]\)/);
  assert.match(css, /content:"DYNAMAX"/);
  assert.match(css, /content:"MAX"/);
  assert.match(css, /background:radial-gradient\(/);
  // Selector matches only the explicit Dynamax flag; it cannot affect
  // ordinary, Shadow, costume or Gigantamax Pokémon images.
  assert.doesNotMatch(css.slice(css.indexOf('/* #521 — Dynamax')), /\[data-ss="1"\]/);
  assert.match(app, /data-sd="1"/);
  assert.match(detail, /dynamax:p\.formId==='dynamax'/);
  assert.match(components, /class="ue-pass-art"/);
});
