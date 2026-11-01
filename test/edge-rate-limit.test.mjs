import test from "node:test";
import assert from "node:assert/strict";
import worker, { allowEdgeMiss, singleFlight, EDGE_MISS_LIMITS } from "../src/worker.js";

const request = (ip) => new Request("https://pogo.test/", {
  headers: ip ? { "cf-connecting-ip": ip } : {},
});

test("art and guide miss limits are independent per endpoint and client", () => {
  const artIp = "198.51.100.201";
  for (let i = 0; i < EDGE_MISS_LIMITS.art.requests; i++) {
    assert.equal(allowEdgeMiss(request(artIp), "art", 1000).allowed, true);
  }
  const artBlocked = allowEdgeMiss(request(artIp), "art", 1000);
  assert.equal(artBlocked.allowed, false);
  assert.equal(artBlocked.retryAfter, 60);

  assert.equal(allowEdgeMiss(request(artIp), "guide", 1000).allowed, true, "guide has its own quota");
  assert.equal(allowEdgeMiss(request("198.51.100.202"), "art", 1000).allowed, true, "another client has its own quota");
});

test("guide uses its lower miss limit and rolling timestamps expire", () => {
  const ip = "198.51.100.203";
  for (let i = 0; i < EDGE_MISS_LIMITS.guide.requests; i++) {
    assert.equal(allowEdgeMiss(request(ip), "guide", 5000).allowed, true);
  }
  assert.equal(allowEdgeMiss(request(ip), "guide", 5000).allowed, false);
  assert.equal(allowEdgeMiss(request(ip), "guide", 65_001).allowed, true, "old misses expire after one minute");
});

test("requests without a trusted Cloudflare client IP fail open", () => {
  const result = allowEdgeMiss(request(null), "art", 10_000);
  assert.deepEqual(result, { allowed: true, skipped: true, retryAfter: 0 });
});

test("single-flight coalesces concurrent uncached work and returns independent responses", async () => {
  let calls = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const work = async () => { calls++; await gate; return new Response("shared result"); };
  const a = singleFlight("test:coalesce:one", work);
  const b = singleFlight("test:coalesce:one", work);
  await Promise.resolve();
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.equal(await ra.text(), "shared result");
  assert.equal(await rb.text(), "shared result");
});

test("cached guide responses bypass the uncached-miss limit", async (t) => {
  const previousCaches = globalThis.caches;
  const previousFetch = globalThis.fetch;
  const entries = new Map();
  globalThis.caches = {
    default: {
      async match(key) {
        const response = entries.get(key.url);
        return response ? response.clone() : null;
      },
      async put(key, response) {
        entries.set(key.url, response.clone());
      },
    },
  };
  globalThis.fetch = async () => new Response("<html></html>", { status: 200 });
  t.after(() => {
    if (previousCaches === undefined) delete globalThis.caches;
    else globalThis.caches = previousCaches;
    globalThis.fetch = previousFetch;
  });

  const ip = "198.51.100.244";
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  async function lookup(boss) {
    const response = await worker.fetch(new Request(
      "https://pogo.test/api/guide?boss=" + encodeURIComponent(boss),
      { headers: { "cf-connecting-ip": ip } },
    ), {}, ctx);
    await Promise.all(pending.splice(0));
    return response;
  }

  for (let i = 0; i < EDGE_MISS_LIMITS.guide.requests; i++) {
    const response = await lookup("Pokemon Boss " + String(i).padStart(2, "0"));
    assert.equal(response.status, 200, "uncached guide lookup " + i);
  }
  const blocked = await lookup("Pokemon Boss 30");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(blocked.headers.get("cache-control"), "no-store");

  const cached = await lookup("Pokemon Boss 00");
  assert.equal(cached.status, 200, "a previously cached guide is still served over quota");
});

test("art cache hits bypass the uncached-artwork miss limit", async (t) => {
  const previousCaches = globalThis.caches;
  const previousFetch = globalThis.fetch;
  const entries = new Map();
  globalThis.caches = {
    default: {
      async match(key) {
        const response = entries.get(key.url);
        return response ? response.clone() : null;
      },
      async put(key, response) {
        entries.set(key.url, response.clone());
      },
    },
  };
  globalThis.fetch = async (url) => {
    if (String(url).includes("pokeapi.co")) return new Response(JSON.stringify({ id: 25 }), { status: 200 });
    return new Response("image bytes", { status: 200 });
  };
  t.after(() => {
    if (previousCaches === undefined) delete globalThis.caches;
    else globalThis.caches = previousCaches;
    globalThis.fetch = previousFetch;
  });

  const ip = "198.51.100.245";
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  async function artwork(name) {
    const response = await worker.fetch(new Request(
      "https://pogo.test/api/art?n=" + encodeURIComponent(name),
      { headers: { "cf-connecting-ip": ip } },
    ), {}, ctx);
    await Promise.all(pending.splice(0));
    return response;
  }

  for (let i = 0; i < EDGE_MISS_LIMITS.art.requests; i++) {
    const response = await artwork("Pokemon " + String(i).padStart(3, "0"));
    assert.equal(response.status, 200, "uncached artwork lookup " + i);
  }
  const blocked = await artwork("Pokemon 120");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(blocked.headers.get("cache-control"), "no-store");

  const cached = await artwork("Pokemon 000");
  assert.equal(cached.status, 200, "previously cached artwork is still served over quota");
});
