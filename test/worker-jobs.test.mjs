import test from "node:test";
import assert from "node:assert/strict";
import { runSoon, runWeekly, runHourly } from "../src/jobs.js";

// A tiny stand-in for D1 (just the statements jobs.js uses) and for the static assets binding.
function fakeEnv(data, extra = {}) {
  const rows = new Map();
  const db = { prepare: sql => ({ _a: [], bind(...a) { this._a = a; return this; },
    async run() { if (/^INSERT/.test(sql)) rows.set(this._a[0], this._a[1]); return {}; },
    async first() { return /^SELECT/.test(sql) && rows.has(this._a[0]) ? { value: rows.get(this._a[0]) } : null; } }) };
  return { DB: db, TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "c", ASSETS: { fetch: async () => new Response(JSON.stringify(data), { status: 200 }) }, rows, ...extra };
}
const calls = [];
const fakeFetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }); };
const DATA = { events: [], spotlight: [{ d: "2026-10-14", n: "Stufful", b: "2x Candy" }], raidHour: [{ d: "2026-10-14", n: "Dialga" }], rotation: [] };

test("starting soon: sends once, remembers it, and stays quiet at night", async () => {
  calls.length = 0;
  const env = fakeEnv(DATA);
  // 17:05 Melbourne (AEDT, UTC+11) = 06:05 UTC; Raid Hour and Spotlight are at 18:00 local.
  const at = new Date("2026-10-14T06:05:00Z");
  const a = await runSoon(env, { now: at, fetch: fakeFetch });
  assert.equal(a.sent.length, 2);
  assert.ok(calls.some(c => /Dialga Raid Hour/.test(c.body.caption || c.body.text)));
  const b = await runSoon(env, { now: at, fetch: fakeFetch });
  assert.deepEqual(b.sent, []);
  assert.equal(calls.length, 2, "nothing repeated");
  const night = fakeEnv({ spotlight: [{ d: "2026-10-14", n: "Stufful" }] });
  assert.equal((await runSoon(night, { now: new Date("2026-10-13T20:05:00Z"), fetch: fakeFetch })).note, "nothing starting soon");
});

test("starting soon: dry run sends nothing and a failed send is retried", async () => {
  calls.length = 0;
  const env = fakeEnv(DATA);
  const at = new Date("2026-10-14T06:05:00Z");
  const dry = await runSoon(env, { now: at, dry: true, fetch: fakeFetch });
  assert.equal(dry.would.length, 2); assert.equal(calls.length, 0);
  const bad = await runSoon(env, { now: at, fetch: async () => new Response("no", { status: 500 }) });
  assert.deepEqual(bad.sent, []);
  assert.equal((await runSoon(env, { now: at, fetch: fakeFetch })).sent.length, 2, "tries again next hour");
});

test("Monday summary: sent once a day, only on Sunday 20:xx UTC from the hourly run", async () => {
  calls.length = 0;
  const env = fakeEnv({ events: [{ id: "x", t: "Zorua Community Day", s: "2026-10-19T14:00", e: "2026-10-19T17:00", art: ["Zorua"] }], spotlight: [], raidHour: [] });
  const mon = new Date("2026-10-18T20:30:00Z"); // Sunday UTC = Monday 7:30 am Melbourne
  assert.equal(mon.getUTCDay(), 0);
  const w = await runWeekly(env, { now: mon, fetch: fakeFetch });
  assert.equal(w.sent, true);
  assert.ok(calls.some(c => /Week ahead/.test(c.body.text || "")));
  assert.equal((await runWeekly(env, { now: mon, fetch: fakeFetch })).note, "already sent today");
  const e2 = fakeEnv(DATA, { TELEGRAM_BOT_TOKEN: undefined }); const r = await runHourly(e2, new Date("2026-10-14T06:30:00Z"));
  assert.ok(r.soon && !r.weekly);
});

import { runDiscord, discordSent } from "../src/jobs.js";
import { decideTap } from "../src/telegram.js";
test("Discord pictures are forwarded once; first run only notes the starting point", async () => {
  const rows = new Map(); const calls = [];
  const db = { prepare: sql => ({ run: async () => ({}), bind: (...a) => ({ first: async () => (rows.has(a[0]) ? { value: rows.get(a[0]) } : null), run: async () => { if (/INSERT/.test(sql)) rows.set(a[0], a[1]); return {}; } }) }) };
  const env = { DB: db, DISCORD_TOKEN: "d", CHANNEL_ID: "1", TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "9" };
  let msgs = [{ id: "1000000", content: "old" }];
  const f = async (u, o) => { calls.push(u); return u.includes("discord.com") ? { ok: true, json: async () => msgs } : { ok: true, json: async () => ({ result: { message_id: 555 } }) }; };
  assert.equal((await runDiscord(env, { fetch: f })).note, "starting point noted");
  msgs = [{ id: "1020000", content: "Into the Wild", attachments: [{ url: "https://cdn.discordapp.com/a.png", content_type: "image/png" }] }, { id: "1010000", content: "chat" }];
  assert.deepEqual((await runDiscord(env, { fetch: f })).sent, ["discord:1020000"]);
  assert.equal(calls.filter(u => u.includes("sendPhoto")).length, 1);
  assert.equal((await discordSent(env))["discord:1020000"], 555, "the Telegram message id is kept so suggestions can edit it");
  assert.equal(decideTap({ act: "week", id: "discord:1020000" }, { items: [] }, null).decision.status, "week");
  assert.ok(decideTap({ act: "approve", id: "discord:1020000", n: 0 }, { items: [] }, null).error);
});

test("Discord forwarding: refused pictures fall back to a link, retry, then move on; forwarded snapshots and busy channels are not dropped", async () => {
  const rows = new Map(); const sentTo = [];
  const db = { prepare: sql => ({ run: async () => ({}), bind: (...a) => ({ first: async () => (rows.has(a[0]) ? { value: rows.get(a[0]) } : null), run: async () => { if (/INSERT/.test(sql)) rows.set(a[0], a[1]); return {}; } }) }) };
  const env = { DB: db, DISCORD_TOKEN: "d", CHANNEL_ID: "1", TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "9" };
  let msgs = [{ id: "1000" }], tgMode = "ok";
  const f = async (u, o) => {
    if (new URL(u).hostname === "discord.com") return { ok: true, json: async () => msgs };
    const method = /\/(\w+)$/.exec(u)[1]; sentTo.push(method);
    if (tgMode === "down") return { ok: false, json: async () => ({}) };
    if (tgMode === "photo-refused" && method === "sendPhoto") return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ result: { message_id: 7 } }) };
  };
  await runDiscord(env, { fetch: f });
  // a forwarded post keeps its picture under message_snapshots
  msgs = [{ id: "1010", content: "", message_snapshots: [{ message: { content: "Raid day", attachments: [{ url: "https://cdn.discordapp.com/f.png", content_type: "image/png" }] } }] }];
  assert.deepEqual((await runDiscord(env, { fetch: f })).sent, ["discord:1010"]);
  // Telegram refuses the picture: the link goes instead
  tgMode = "photo-refused"; sentTo.length = 0; msgs = [{ id: "1020", attachments: [{ url: "https://cdn.discordapp.com/big.png", content_type: "image/png" }] }];
  assert.deepEqual((await runDiscord(env, { fetch: f })).sent, ["discord:1020"]); assert.deepEqual(sentTo, ["sendPhoto", "sendMessage"]);
  // Telegram down: the cursor stays put and it retries; after 3 tries it moves on
  tgMode = "down"; msgs = [{ id: "1030", attachments: [{ url: "https://cdn.discordapp.com/x.png", content_type: "image/png" }] }, { id: "1040", attachments: [{ url: "https://cdn.discordapp.com/y.png", content_type: "image/png" }] }];
  assert.match((await runDiscord(env, { fetch: f })).note, /try 1 of 3/);
  assert.match((await runDiscord(env, { fetch: f })).note, /try 2 of 3/);
  tgMode = "ok"; assert.deepEqual((await runDiscord(env, { fetch: f })).sent, ["discord:1030", "discord:1040"]);
  // a busy channel: 12 new pictures are worked through 10 then 2, none dropped
  msgs = Array.from({ length: 12 }, (_, i) => ({ id: String(1100 + i), attachments: [{ url: "https://cdn.discordapp.com/p" + i + ".png", content_type: "image/png" }] }));
  const first = await runDiscord(env, { fetch: f }); assert.equal(first.sent.length, 10);
  msgs = msgs.slice(10); assert.deepEqual((await runDiscord(env, { fetch: f })).sent, ["discord:1110", "discord:1111"]);
});

import { savedReminders } from "../src/jobs.js";
test("saved events: reminders only for the ones the starting-soon ping does not cover, once per day", () => {
  const data = { events: [
    { id: "a", t: "Timed short", s: "2026-10-20T14:00", e: "2026-10-20T17:00" },
    { id: "b", t: "All day", s: "2026-10-20T00:00", e: "2026-10-20T23:59" },
    { id: "c", t: "Week long", s: "2026-10-14T10:00", e: "2026-10-20T20:00" },
    { id: "d", t: "Later", s: "2026-10-25T00:00", e: "2026-10-26T00:00" }] };
  const out = savedReminders(data, ["cur:a", "cur:b", "cur:c", "cur:d", "cur:zzz"], Date.parse("2026-10-20T07:30:00Z"));
  assert.deepEqual(out.map(r => r.key).sort(), ["end:c:2026-10-20", "start:b:2026-10-20"]);
});

test("saved world events (Tour, Wild Area) also get a start-day and last-day reminder", () => {
  const world = [{ id: "w-into-the-wild", name: "Into the Wild", start: "2026-11-09", end: "2026-11-13" }];
  assert.equal(savedReminders({ events: [] }, ["w-into-the-wild"], Date.parse("2026-11-09T07:30:00Z"), world)[0].link, "w-into-the-wild");
  assert.match(savedReminders({ events: [] }, ["w-into-the-wild"], Date.parse("2026-11-13T07:30:00Z"), world)[0].text, /Last day/);
});

import { leadReminders } from "../src/jobs.js";
test("a lead time you chose fires once the moment has passed and the event has not started", () => {
  const data = { events: [{ id: "z", t: "Zorua Community Day", s: "2026-10-20T14:00", e: "2026-10-20T17:00" }] };
  const saved = ["cur:z"], leads = { "cur:z": "180" };
  assert.equal(leadReminders(data, [], saved, leads, Date.parse("2026-10-20T10:00:00Z")).length, 0, "too early");
  assert.equal(leadReminders(data, [], saved, leads, Date.parse("2026-10-20T11:30:00Z")).length, 1, "due");
  assert.equal(leadReminders(data, [], saved, leads, Date.parse("2026-10-20T14:05:00Z")).length, 0, "already started");
  assert.equal(leadReminders(data, [], saved, {}, Date.parse("2026-10-20T11:30:00Z")).length, 0, "no lead chosen");
});

import { judgeWorker } from "../scripts/health.mjs";
test("the Worker heartbeat is judged fresh, failing or stale", () => {
  const now = Date.parse("2026-10-15T10:00:00Z");
  assert.equal(judgeWorker({ at: "2026-10-15T09:35:00Z", failed: [] }, now).state, "fresh");
  assert.equal(judgeWorker({ at: "2026-10-15T09:35:00Z", failed: ["discord"] }, now).state, "failing");
  assert.equal(judgeWorker({ at: "2026-10-15T05:00:00Z", failed: [] }, now).state, "stale");
  assert.equal(judgeWorker(null, now).state, "never");
});

import { savedThisWeek } from "../src/jobs.js";
test("the week-ahead message lists starred events that touch the week", () => {
  const data = { events: [{ id: "z", t: "Zorua Community Day", s: "2026-10-20T14:00", e: "2026-10-20T17:00" }, { id: "q", t: "Later", s: "2026-11-20T00:00", e: "2026-11-21T00:00" }] };
  const world = [{ id: "w-x", name: "Into the Wild", start: "2026-10-18", end: "2026-10-22" }];
  assert.deepEqual(savedThisWeek(data, world, ["cur:z", "cur:q", "w-x"], "2026-10-19"), ["⭐ Into the Wild (10-18 to 10-22)", "⭐ Zorua Community Day (10-20)"]);
});
