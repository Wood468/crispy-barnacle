import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real Worker resolver without importing the Cloudflare runtime.
// Keep the extraction bounded by the next top-level section so changes to the
// resolver signature or removal of its implementation fail loudly.
const source = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const start = source.indexOf('function artCandidates(raw) {');
const end = source.indexOf('// The main picture on an event', start);
assert.ok(start >= 0 && end > start, 'Worker artwork resolver must exist');
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const resolve = vm.runInNewContext('(function(slug) { ' + source.slice(start, end) + '; return artCandidates; })')(slug);

test('Crowned forms stay exact and cannot fall back to ordinary species', () => {
  for (const [name, species] of [
    ['Crowned Sword Zacian', 'zacian'],
    ['Crowned Shield Zamazenta', 'zamazenta']
  ]) {
    const result = resolve(name);
    assert.equal(result.base, species);
    assert.equal(result.exact, true);
    assert.deepEqual(Array.from(result.list), [species + '-crowned']);
    assert.ok(!result.list.includes(species), 'ordinary species artwork must not be a candidate');
  }
});

test('Gigantamax uses a form-specific candidate and no species fallback', () => {
  const result = resolve('Gigantamax Duraludon');
  assert.equal(result.base, 'duraludon');
  assert.equal(result.exact, true);
  assert.deepEqual(Array.from(result.list), ['duraludon-gmax']);
});

test('Dynamax without a special form uses ordinary species art', () => {
  const result = resolve('Dynamax Registeel');
  assert.equal(result.base, 'registeel');
  assert.equal(result.exact, false);
  assert.deepEqual(Array.from(result.list), ['registeel']);
});

test('Ordinary species retains the boolean exact contract', () => {
  const result = resolve('Pikachu');
  assert.equal(result.base, 'pikachu');
  assert.equal(result.exact, false);
  assert.deepEqual(Array.from(result.list), ['pikachu']);
});
