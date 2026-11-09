import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('event banner cache is restricted to approved Leek Duck image requests', () => {
  assert.match(source, /url\.hostname === 'cdn\.leekduck\.com'/);
  assert.match(source, /url\.pathname\.startsWith\('\/assets\/img\/events\/'\)/);
  assert.match(source, /request\.destination === 'image'/);
  assert.match(source, /url\.pathname\.startsWith\('\/api\/'\)/);
});

test('event banner cache is bounded and does not replace the offline shell cache', () => {
  assert.match(source, /const EVENT_BANNER_CACHE = 'gofn-event-banners-v1'/);
  assert.match(source, /const MAX_EVENT_BANNERS = 40/);
  assert.match(source, /keys\.length > MAX_EVENT_BANNERS/);
  assert.match(source, /caches\.open\(SHELL_CACHE\)/);
});

test('service worker source remains valid JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(source));
});
