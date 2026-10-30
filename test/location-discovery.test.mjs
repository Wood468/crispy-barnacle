import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { coords, fetchWithRateLimit, redditSearchUrl, retryAfterMs, xmlItems } from "../scripts/location-discovery-parse.mjs";

const discoveryScript = fileURLToPath(new URL("../scripts/location-discovery.mjs", import.meta.url));

test("community location discovery script passes Node syntax checking", () => {
  const result = spawnSync(process.execPath, ["--check", discoveryScript], { encoding: "utf8" });
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
});

test("RSS item parsing preserves title, permalink and CDATA description", () => {
  const xml = '<rss><channel><item><title>Community meetup</title><link>https://www.reddit.com/r/pokemongo/comments/abc/meetup</link><description><![CDATA[Coordinates: 37.7749, -122.4194 &amp; details]]></description></item></channel></rss>';
  assert.deepEqual(xmlItems(xml), [{
    title: "Community meetup",
    link: "https://www.reddit.com/r/pokemongo/comments/abc/meetup",
    desc: "Coordinates: 37.7749, -122.4194 & details"
  }]);
});

test("Atom entry parsing accepts link href and summary content", () => {
  const xml = '<feed><entry><title>Sydney community play</title><link href="https://www.reddit.com/r/pokemongo/comments/def/play" rel="alternate"/><summary>Coordinates: -33.8688, 151.2093</summary></entry></feed>';
  assert.deepEqual(xmlItems(xml), [{
    title: "Sydney community play",
    link: "https://www.reddit.com/r/pokemongo/comments/def/play",
    desc: "Coordinates: -33.8688, 151.2093"
  }]);
});

test("entity decoding is single-pass and does not turn nested entities into markup", () => {
  const xml = '<rss><channel><item><title>Nested entity</title><link>https://www.reddit.com/r/pokemongo/comments/ghi/nested</link><description>&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;</description></item></channel></rss>';
  assert.equal(xmlItems(xml)[0].desc, "&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("coordinate extraction rejects out-of-range, zero and partial-number matches", () => {
  assert.deepEqual(coords("Valid 37.7749, -122.4194; invalid 91.0000, 181.0000; zero 0.0000, 0.0000"), [
    { lat: 37.7749, lng: -122.4194 }
  ]);
});

test("Retry-After accepts seconds and HTTP dates", () => {
  const now = Date.parse("Fri, 30 Oct 2026 02:30:00 GMT");
  assert.equal(retryAfterMs("2", now), 2000);
  assert.equal(retryAfterMs("Fri, 30 Oct 2026 02:31:00 GMT", now), 60000);
});

test("Retry-After uses a safe fallback and defers long cooldowns", () => {
  assert.equal(retryAfterMs(null, 0), 15000);
  assert.equal(retryAfterMs("not a date", 0), 15000);
  assert.equal(retryAfterMs("360", 0), null, "do not retry before a server-requested cooldown longer than five minutes");
});

test("rate-limited community searches wait and retry the same query once", async () => {
  const calls = [], waits = [];
  const replies = [
    { status: 429, headers: { get: () => "2" } },
    { status: 200, ok: true, headers: { get: () => null } }
  ];
  const result = await fetchWithRateLimit("https://www.reddit.com/search.rss?q=event", {}, async url => {
    calls.push(url);
    return replies.shift();
  }, async ms => waits.push(ms));
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1], "the same event query is retried after its cooldown");
  assert.deepEqual(waits, [2000]);
  assert.equal(result.response.status, 200);
  assert.equal(result.rateLimits, 1);
  assert.equal(result.deferred, false);
});

test("repeated 429 responses stop retrying and defer remaining events", async () => {
  const waits = [];
  let calls = 0;
  const result = await fetchWithRateLimit("https://www.reddit.com/search.rss?q=event", {}, async () => {
    calls++;
    return { status: 429, headers: { get: () => "1" } };
  }, async ms => waits.push(ms));
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1000]);
  assert.equal(result.rateLimits, 2);
  assert.equal(result.deferred, true);
  assert.equal(result.reason, "repeated-429");
});

test("long Retry-After cooldowns defer without sending another request", async () => {
  let calls = 0;
  const result = await fetchWithRateLimit("https://www.reddit.com/search.rss?q=event", {}, async () => {
    calls++;
    return { status: 429, headers: { get: () => "360" } };
  }, async () => {});
  assert.equal(calls, 1);
  assert.equal(result.deferred, true);
  assert.equal(result.reason, "long-cooldown");
});

test("community search URLs keep the Reddit host fixed and encode event names as a query", () => {
  const url = redditSearchUrl('https://evil.example/?q=bad "event"');
  assert.equal(url.origin, "https://www.reddit.com");
  assert.equal(url.pathname, "/search.rss");
  assert.equal(url.searchParams.get("sort"), "new");
  assert.equal(url.searchParams.get("t"), "month");
  assert.match(url.searchParams.get("q"), /https:\/\/evil\.example/);
  assert.match(url.searchParams.get("q"), /coordinates OR coords OR hotspot/);
});
