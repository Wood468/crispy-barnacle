import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
const sw = source('sw.js');
const shellMatch = sw.match(/const SHELL_URLS\s*=\s*\[([\s\S]*?)\];/);
assert.ok(shellMatch, 'service worker must expose the offline shell asset list');
const shell = [...shellMatch[1].matchAll(/['"](\/[^'"]+)['"]/g)].map(match => match[1]);

function versionedModules(code) {
  return [...code.matchAll(/\/[-\w]+\.js\?v=[0-9a-z]+/gi)].map(match => match[0]);
}

test('app bootstrap and dashboard lazy imports use precisely cached versions', () => {
  const appModules = versionedModules(source('app.js'));
  const dashModules = versionedModules(source('dash.js'));
  assert.ok(appModules.includes('/dash.js?v=20261118b') || appModules.some(url => url.startsWith('/dash.js?v=')),
    'app bootstrap must expose the versioned dashboard entry');
  assert.ok(dashModules.length >= 5, 'dashboard should declare multiple lazy modules');
  for (const url of new Set([...appModules, ...dashModules])) {
    assert.equal(shell.filter(entry => entry === url).length, 1,
      url + ' must be present exactly once in the service worker shell');
  }
});

test('app and dashboard must not request conflicting versions of one module', () => {
  const urls = [...versionedModules(source('app.js')), ...versionedModules(source('dash.js'))];
  const versions = new Map();
  for (const url of urls) {
    const path = url.split('?')[0];
    const previous = versions.get(path);
    assert.ok(!previous || previous === url, path + ' has conflicting module versions: ' + previous + ' and ' + url);
    versions.set(path, url);
  }
});
