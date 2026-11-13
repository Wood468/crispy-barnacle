import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Today = require('../public/today-logic.js');

// These tests cover the *page's* missing-art decision, not just /api/art's
// form-specific asset selection. Exact forms must never disappear silently
// or masquerade as ordinary Kyurem/Zacian/Zamazenta when an image fails.
test('fusion Kyurem art is exact and has a labelled missing-image fallback', () => {
  for (const [name, base] of [
    ['White Kyurem', 'Kyurem'],
    ['Black Kyurem', 'Kyurem'],
  ]) {
    const classified = Today.classifyArt(name);
    assert.equal(classified.kind, 'form', name);
    assert.equal(classified.base, base, name);
    assert.equal(classified.exact, true, name);
    assert.deepEqual(Today.artFallback(classified), {
      show: 'base-with-label',
      chip: 'Form art unavailable',
    }, name);
  }
});

test('Crowned bosses keep exact missing-image fallback in both published name styles', () => {
  for (const [name, base] of [
    ['Crowned Sword Zacian', 'Zacian'],
    ['Zacian (Crowned Sword)', 'Zacian'],
    ['Crowned Shield Zamazenta', 'Zamazenta'],
    ['Zamazenta (Crowned Shield)', 'Zamazenta'],
  ]) {
    const classified = Today.classifyArt(name);
    assert.equal(classified.base, base, name);
    assert.equal(classified.exact, true, name);
    assert.equal(Today.artFallback(classified).chip, 'Form art unavailable', name);
  }
});

test('plain species stay plain; a missing exact form is never treated as a plain-species success', () => {
  for (const name of ['Kyurem', 'Zacian', 'Zamazenta']) {
    const plain = Today.classifyArt(name);
    assert.equal(plain.exact, false, name);
    assert.equal(Today.artFallback(plain).chip, '', name);
  }
});
