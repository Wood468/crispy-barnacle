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

test('no two cache entries represent different versions of the same JS or CSS module', () => {
  const shellBlock = sw.match(/const SHELL_URLS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(shellBlock);
  const cached = [...shellBlock[1].matchAll(/['"](\/[^'"]+)['"]/g)].map(m => m[1]);
  const versions = new Map();
  for (const url of cached) {
    if (!/\.(?:js|css)\?v=/i.test(url)) continue;
    const path = url.split('?')[0];
    assert.ok(!versions.has(path), path + ' has multiple offline versions: ' + versions.get(path) + ' and ' + url);
    versions.set(path, url);
  }
});

test('lazy-loaded dashboard modules match the offline precache exactly', () => {
  const dash = read('dash.js');
  const shellBlock = sw.match(/const SHELL_URLS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(shellBlock);
  const cached = [...shellBlock[1].matchAll(/['"](\/[^'"]+)['"]/g)].map(m => m[1]);
  const modules = [...dash.matchAll(/\/[-\w]+\.js\?v=[0-9a-z]+/gi)].map(m => m[0]);
  assert.ok(modules.length >= 5, 'expected multiple lazy-loaded dashboard modules');
  for (const moduleUrl of new Set(modules)) {
    assert.equal(cached.filter(url => url === moduleUrl).length, 1,
      moduleUrl + ' lazy-loaded module must be precached exactly once');
  }
});

test('Store and GO Pass feature assets are present and precached with matching versions', () => {
  const assets = versionedEntryAssets(index);
  const shellBlock = sw.match(/const SHELL_URLS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(shellBlock);
  const cached = [...shellBlock[1].matchAll(/['"](\/[^'"]+)['"]/g)].map(m => m[1]);
  const featurePaths = [
    '/store.js',
    '/regional-prices.js',
    '/go-pass-navigation.js',
    '/go-pass-navigation.css',
    '/go-pass-reward-art.js',
    '/event-components.js'
  ];
  for (const featurePath of featurePaths) {
    const matching = assets.filter(url => url.split('?')[0] === featurePath);
    assert.equal(matching.length, 1, 'expected exactly one versioned entry asset for ' + featurePath);
    const assetUrl = matching[0];
    assert.equal(cached.filter(url => url === assetUrl).length, 1,
      assetUrl + ' must be precached once with its exact version');
  }
});
