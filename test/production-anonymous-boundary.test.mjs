// One-time, read-only production assurance. No credentials, no mutation, no response-body logging.
// This is intentionally isolated on an unmerged audit branch: network availability must not
// become an unconditional dependency of the main repository's required unit-test suite.
import test from "node:test";
import assert from "node:assert/strict";

const ORIGIN = "https://pogo.michaelpuff.com";
async function anonymousGet(path) {
  return fetch(ORIGIN + path, {
    method: "GET",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
}

test("live public/private boundary: anonymous restricted GETs fail closed, uncacheable", async (t) => {
  const routes = [
    "/api/prices-private",
    "/api/places-private",
    "/api/dex",
    "/api/userstate",
    "/api/notify/status",
    "/api/notify/push-key",
    "/api/tg-inbox",
    "/api/discord-sent",
  ];
  for (const path of routes) await t.test(path, async () => {
    const res = await anonymousGet(path);
    assert.ok([401, 403, 404].includes(res.status),
      "anonymous GET " + path + " returned unexpected status " + res.status);
    assert.match(res.headers.get("cache-control") || "", /\bno-store\b/i,
      "anonymous " + path + " must not be cached");
    // Intentionally never echo or persist the body, even on failure.
    const body = await res.text();
    assert.ok(body.length < 4096, "anonymous " + path + " returned unexpectedly large payload");
  });
});

test("live auth/me reports no signed-in identity to anonymous clients", async () => {
  const res = await anonymousGet("/api/auth/me");
  assert.equal(res.status, 200, "anonymous /api/auth/me status");
  assert.match(res.headers.get("cache-control") || "", /\bno-store\b/i);
  const body = await res.json();
  assert.equal(body.signedIn, false, "anonymous auth/me must not be signed in");
  assert.equal(body.owner, undefined, "anonymous auth/me must not disclose owner state");
  assert.equal(body.email, undefined, "anonymous auth/me must not disclose account email");
});

test("live public JSON has no private Discord deep links or owner credentials", async (t) => {
  for (const path of ["/event-info.json", "/infographic-queue.json", "/weekly.json", "/prices.json"]) {
    await t.test(path, async () => {
      const res = await anonymousGet(path);
      assert.equal(res.status, 200, "public metadata fetch " + path);
      const content = await res.text();
      JSON.parse(content);
      assert.doesNotMatch(content, /discord(?:app)?\.com\/channels\//i,
        "private Discord channel references in public " + path);
      assert.doesNotMatch(content, /"(?:sync_pin|syncPin|ownerEmail|refreshToken|sessionToken|apiKey|password)"\s*:/i,
        "owner credential field in public " + path);
    });
  }
});

test("live service worker bypasses all /api/ requests", async () => {
  const res = await anonymousGet("/sw.js");
  assert.equal(res.status, 200, "service-worker fetch");
  const sw = await res.text();
  assert.match(sw, /url\.pathname\.startsWith\(['"]\/api\/['"]\)\)\s*return\s*;/,
    "service worker must bypass all /api/ routes before cache handling");
});
