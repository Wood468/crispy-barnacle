import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const A = require('../public/event-art.js');
const ev = { name: 'Into the Wild', start: '2026-11-09T00:00:00Z', end: '2026-11-13T23:00:00Z' };

test('malformed event artwork URL fails closed rather than crashing Today or Event Details', () => {
  assert.doesNotThrow(() => A.resolve(ev, ['https://cdn.leekduck.com/assets/img/events/article-images/2026/%ZZ-into-the-wild.png']));
  assert.equal(A.resolve(ev, ['https://cdn.leekduck.com/assets/img/events/article-images/2026/%ZZ-into-the-wild.png']).kind, 'themed');
});

test('linked poster fallback retains the figure before removing its anchor', () => {
  const src = readFileSync(new URL('../public/event-art.js', import.meta.url), 'utf8');
  const start = src.indexOf('function fail(img)');
  const end = src.indexOf('var OFFLINE_LABEL', start);
  assert.ok(start >= 0 && end > start);
  const code = src.slice(start, end);
  assert.ok(code.indexOf("var f = img && img.closest && img.closest('.ev-art')") <
    code.indexOf("if (a && a.parentNode) a.remove()"),
    'figure must be found while the image is still attached');
});

test('event artwork still renders a themed fallback behind the official banner', () => {
  const art = A.resolve(ev, ['https://cdn.leekduck.com/assets/img/events/article-images/2026/into-the-wild-2026.jpg']);
  const html = A.banner(art, { ev });
  assert.match(html, /ev-art-theme/);
  assert.match(html, /ev-art-img/);
});
