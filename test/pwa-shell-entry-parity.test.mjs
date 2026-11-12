import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
const index = read('index.html');
const sw = read('sw.js');

function hasCacheVersion(url) {
  // Match cache_contract.py REF_VERSION, including its bounded worker issue suffix.
  return /^\/[-\w./]+\.(?:js|css)\?v=[0-9]{8}[a-z](?:-(?!w[0-9]+(?:-|$))[A-Za-z0-9]+)?(?:-w[1-9][0-9]{0,9})?$/.test(url) && !/\s/.test(url);
}

function versionedEntryAssets(html) {
  const urls = [];
  const tags = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attr = tag.match(/\b(?:src|href)=["'](\/[^"'\s]+)["']/i);
    if (!attr) continue;
    const url = attr[1];
    if (hasCacheVersion(url)) urls.push(url);
  }
  return urls;
}

function versionedLazyModules(source) {
  // Read complete quoted URLs so malformed versions cannot become valid prefixes.
  return [...source.matchAll(/(['"`])(\/[-\w]+\.js\?v=[^'"`]+)\1/g)]
    .map(match => match[2]).filter(hasCacheVersion);
}

test('entry asset discovery accepts cache-contract worker versions without accepting malformed URLs', () => {
  const versions = ['20300101a', '20300101a-w1', '20300101a-w9999999999',
    '20300101a-release2', '20300101a-release2-w635'];
  for (const version of versions) {
    const js = '/feature.js?v=' + version;
    const css = '/feature.css?v=' + version;
    const html = '<script src="' + js + '"></script><link rel="stylesheet" href=\'' + css + '\'>';
    assert.deepEqual(versionedEntryAssets(html), [js, css], version);
  }
  const malformed = ['', '20300101', '20300101A', '20300101a-', '20300101a--w635',
    '20300101a-w0', '20300101a-w01', '20300101a-w12345678901',
    '20300101a-w635-w636', '20300101a-release2-other', '20300101a-release2-w0',
    '20300101a_worker', '20300101a%2Dw635', '20300101a-w635&debug=1',
    '20300101a-w635?v=other', '20300101a-w635#old', '20300101a-w635\n'];
  for (const version of malformed) {
    for (const extension of ['js', 'css']) {
      const url = '/feature.' + extension + '?v=' + version;
      assert.deepEqual(versionedEntryAssets('<script src="' + url + '"></script>'), [], url);
    }
  }
  assert.deepEqual(versionedEntryAssets('<script src="/feature.js"></script>' +
    '<script src="/feature.js?debug=1&v=20300101a"></script>' +
    '<script src="/feature.js?debug=/other.js?v=20300101a"></script>' +
    '<script src="/feature.js#other.js?v=20300101a"></script>' +
    '<script src="https://example.com/feature.js?v=20300101a"></script>'), []);
});

test('lazy module discovery matches the full worker-versioned URL in precache', () => {
  const detail = '/detail.js?v=20300101a-release2-w635';
  const cached = [detail];
  for (const quote of ["'", '"', '`']) {
    const modules = versionedLazyModules('detail.src = ' + quote + detail + quote + ';');
    assert.deepEqual(modules, [detail]);
    assert.equal(cached.filter(url => url === modules[0]).length, 1);
    assert.equal(['/detail.js?v=20300101a'].filter(url => url === modules[0]).length, 0);
  }
  for (const version of ['', '20300101a-w0', '20300101a-w635-w636',
    '20300101a-w12345678901', '20300101a-w635&other=1', '20300101a-w635?v=other',
    '20300101a-w635#old', '20300101a-w635 extra', '20300101a-w635\n']) {
    const source = 'detail.src = "/detail.js?v=' + version + '";';
    assert.deepEqual(versionedLazyModules(source), [], source);
  }
  assert.deepEqual(versionedLazyModules('detail.src = "/detail.js?v=20300101a-w635;'), []);
});

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
  const modules = versionedLazyModules(dash);
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
