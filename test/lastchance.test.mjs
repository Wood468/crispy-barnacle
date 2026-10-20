import test from "node:test";
import assert from "node:assert/strict";
import { lastChance, runLastChance } from "../src/jobs.js";

const NOW = new Date("2026-10-20T06:00:00Z");
const at = h => new Date(NOW.getTime() + h * 36e5).toISOString();
const LOG = { items: [
  { name: "GO Pass Deluxe: October", slug: "web-pass-oct", href: "/purchase/item/web-pass-oct", endsAt: at(4), goneAt: null },
  { name: "Wild Area Global Ultra Ticket Box", slug: "web-gowa", href: "/purchase/item/web-gowa", endsAt: at(5 * 24), goneAt: null },
  { name: "Already gone", slug: "web-gone", href: "/purchase/item/web-gone", endsAt: at(2), goneAt: at(-1) },
  { name: "Bought already", slug: "web-bought", href: "/purchase/item/web-bought", endsAt: at(1), goneAt: null },
  { name: "Never planned", slug: "web-none", href: "/purchase/item/web-none", endsAt: at(3), goneAt: null },
  { name: "No end time", slug: "web-noend", href: "/purchase/item/web-noend", endsAt: null, goneAt: null },
] };
const MARKS = { "pref:buy:web-pass-oct": "plan", "pref:buy:web-gowa": "plan", "pref:buy:web-gone": "plan", "pref:buy:web-bought": "bought", "pref:buy:web-noaend": "plan" };

test("last chance: only planned, still-listed items ending within 6 hours", () => {
  const r = lastChance(LOG, MARKS, NOW.getTime());
  assert.equal(r.length, 1);
  assert.match(r[0].text, /Last chance: GO Pass Deluxe: October ends in about 4 hours/);
  assert.match(r[0].text, /store\.pokemongo\.com\/purchase\/item\/web-pass-oct/);
  assert.equal(lastChance(LOG, MARKS, NOW.getTime(), 24 * 6).length, 2, "a wider window also catches the 5-day item");
  assert.match(lastChance({ items: [{ ...LOG.items[0], endsAt: at(0.5) }] }, MARKS, NOW.getTime())[0].text, /in under an hour/);
  assert.deepEqual(lastChance(null, MARKS, NOW.getTime()), []);
});

function fakeEnv(marks, extra = {}) {
  const rows = new Map();
  const userRows = Object.entries(marks).map(([k, v]) => ({ k, v: JSON.stringify(v), t: 1 }));
  const db = { prepare: sql => ({ _a: [], bind(...a) { this._a = a; return this; },
    async run() { if (/^INSERT/.test(sql)) rows.set(this._a[0], this._a[1]); return {}; },
    async first() { return /^SELECT value/.test(sql) && rows.has(this._a[0]) ? { value: rows.get(this._a[0]) } : null; },
    async all() { return { results: userRows }; } }) };
  return { DB: db, TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "c", ASSETS: { fetch: async () => new Response(JSON.stringify(LOG), { status: 200 }) }, ...extra };
}
const sent = [];
const fakeFetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); };

test("last chance job: sends once per item, dry run sends nothing, a failed send is retried", async () => {
  sent.length = 0;
  const env = fakeEnv(MARKS);
  const dry = await runLastChance(env, { now: NOW, dry: true, fetch: fakeFetch });
  assert.equal(dry.would.length, 1); assert.equal(sent.length, 0);
  const bad = await runLastChance(env, { now: NOW, fetch: async () => new Response("no", { status: 500 }) });
  assert.deepEqual(bad.sent, []);
  assert.equal((await runLastChance(env, { now: NOW, fetch: fakeFetch })).sent.length, 1);
  assert.equal(sent.length, 1);
  assert.deepEqual((await runLastChance(env, { now: NOW, fetch: fakeFetch })).sent, [], "not repeated");
  assert.equal(sent.length, 1);
});

test("last chance job: nothing planned means nothing sent", async () => {
  sent.length = 0;
  const r = await runLastChance(fakeEnv({}), { now: NOW, fetch: fakeFetch });
  assert.deepEqual(r.sent, []); assert.equal(sent.length, 0);
});
