import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function harness(network) {
  const handlers = new Map();
  const entries = new Map();
  const cache = {
    match: async (req) => entries.get(req.url),
    put: async (req, res) => { entries.set(req.url, res); },
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
    delete: async (req) => entries.delete(req.url)
  };
  const context = {
    self: { location: { origin: 'https://pogo.michaelpuff.com' },
      addEventListener: (name, fn) => handlers.set(name, fn) },
    caches: { open: async () => cache },
    fetch: network,
    URL, Request, Response, Promise, Date, Set
  };
  vm.runInNewContext(source, context);
  async function request(url, destination = 'image') {
    let pending;
    const event = {
      request: { url, method: 'GET', destination, mode: 'no-cors' },
      respondWith: (value) => { pending = value; },
      waitUntil: (value) => { event.tasks.push(value); },
      tasks: []
    };
    handlers.get('fetch')(event);
    if (!pending) return { intercepted: false };
    const response = await pending;
    await Promise.all(event.tasks);
    return { intercepted: true, response };
  }
  return { request, entries };
}

test('cached Leek Duck event banners survive a network outage', async () => {
  let offline = false;
  let calls = 0;
  const sw = harness(async () => {
    calls++;
    if (offline) throw new Error('offline');
    return new Response('banner-bytes', { status: 200, headers: { 'content-type': 'image/jpeg' } });
  });
  const url = 'https://cdn.leekduck.com/assets/img/events/article-images/2026/event.jpg';
  const first = await sw.request(url);
  assert.equal(first.intercepted, true);
  assert.equal(await first.response.text(), 'banner-bytes');
  offline = true;
  const second = await sw.request(url);
  assert.equal(second.intercepted, true);
  assert.equal(await second.response.text(), 'banner-bytes');
  assert.equal(calls, 1, 'offline reuse must not make another network request');
});

test('unapproved hosts and non-event paths bypass the banner cache', async () => {
  const sw = harness(async () => new Response('image'));
  for (const url of [
    'https://example.com/assets/img/events/banner.jpg',
    'https://cdn.leekduck.com/assets/img/other/banner.jpg',
    'https://cdn.leekduck.com/api/private'
  ]) {
    assert.equal((await sw.request(url)).intercepted, false, url);
  }
});

test('offline uncached event banners fail without poisoning the cache', async () => {
  const sw = harness(async () => { throw new Error('offline'); });
  const url = 'https://cdn.leekduck.com/assets/img/events/never-seen.jpg';
  const result = await sw.request(url);
  assert.equal(result.response.status, 503);
  assert.equal(sw.entries.size, 0);
});

test('event banner cache evicts oldest image after forty saved banners', async () => {
  const sw = harness(async () => new Response('banner-bytes', { status: 200, headers: { 'content-type': 'image/jpeg' } }));
  const urls = [];
  for (let i = 0; i <= 40; i++) {
    const url = `https://cdn.leekduck.com/assets/img/events/worker-cache-${i}.jpg`;
    urls.push(url);
    const result = await sw.request(url);
    assert.equal(result.intercepted, true);
  }
  assert.equal(sw.entries.size, 40);
  assert.equal(sw.entries.has(urls[0]), false);
  assert.equal(sw.entries.has(urls[40]), true);
});
