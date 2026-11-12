import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
const index = read('index.html');
const sw = read('sw.js');

function versionedEntryAssets(html) {
  const urls = [];
  const tags = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attr = tag.match(/\b(?:src|href)=["'](\/[^"']+)["']/i);
    if (!attr) continue;
    const url = attr[1];
    if (/\.(?:js|css)\?v=[a-z0-9]+$/i.test(url)) urls.push(url);
  }
  return urls;
}

test('all versioned entry-page JS and CSS assets appear exactly in the offline shell', () => {
  const assets = versionedEntryAssets(index);
  assert.ok(assets.length >= 10, 'expected substantial versioned app assets');
  const shellBlock = sw.match(/const SHELL_URLS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(shellBlock, 'service worker must declare the shell URL list');
  const cached = [...shellBlock[1].matchAll(/['"](\/[^'"]+)['"]/g)].map(m => m[1]);
  for (const asset of assets) {
    assert.equal(cached.filter(url => url === asset).length, 1,
      asset + ' must be precached once with its exact version');
  }
});

test('offline shell version remains explicit and private API URLs are not precached', () => {
  assert.match(sw, /const SHELL_CACHE\s*=\s*['"]gofn-shell-v\d+['"]/);
  const shellBlock = sw.match(/const SHELL_URLS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(shellBlock);
  const cached = [...shellBlock[1].matchAll(/['"](\/[^'"]+)['"]/g)].map(m => m[1]);
  assert.equal(cached.filter(url => url.startsWith('/api/')).length, 0,
    'private API responses must never enter the offline shell');
});
