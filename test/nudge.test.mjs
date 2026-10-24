import test from "node:test";
import assert from "node:assert/strict";
import { buildDigest, upcoming } from "../scripts/nudge.mjs";

const now = new Date("2026-10-14T20:30:00Z"); // 7:30 am Thursday 15 Oct in Melbourne
const base = { data: { events: [{ id: "z", t: "Zorua CD", s: "2026-10-14T10:00", e: "2026-10-20T17:00" }], spotlight: [{ d: "2026-10-15", n: "Stufful" }], raidHour: [] }, world: { events: [] }, queue: { items: [{ id: "discord:1" }] }, details: { events: { zorua: { name: "Zorua CD", conflicts: [{ field: "bonuses" }] } } } };

test("tells you what is new, once", () => {
  const first = buildDigest({ ...base, now });
  assert.match(first.text, /1 infographic waiting/); assert.match(first.text, /Sources disagree: Zorua CD/); assert.match(first.text, /Stufful Spotlight Hour/);
  assert.equal(buildDigest({ ...base, state: first.state, now }), null);
});
test("a new picture is mentioned again, an old one is not", () => {
  const first = buildDigest({ ...base, now });
  const again = buildDigest({ ...base, queue: { items: [{ id: "discord:1" }, { id: "discord:2" }] }, state: first.state, now });
  assert.match(again.text, /1 infographic waiting/); assert.doesNotMatch(again.text, /Spotlight/);
});
test("only events starting soon are listed", () => {
  const far = upcoming({ events: [{ id: "x", t: "Far", s: "2026-11-30T10:00" }] }, { events: [] }, now);
  assert.equal(far.length, 0);
});

test('NUDGE_ONLY=queue mentions only new infographics and the daily note does not repeat them', () => {
  const now = new Date('2026-10-13T00:00:00Z');
  const q = { items: [{ id: 'a' }, { id: 'b' }] };
  const data = { events: [{ id: 'x', t: 'Some Event', s: '2026-10-13T10:00', e: '2026-10-14T10:00' }] };
  const quick = buildDigest({ queue: q, data, now, only: 'queue' });
  assert.match(quick.text, /2 infographics/); assert.ok(!/Some Event/.test(quick.text));
  assert.equal(buildDigest({ queue: q, data: {}, state: quick.state, now, only: 'queue' }), null);
  const daily = buildDigest({ queue: q, data, state: quick.state, now });
  assert.ok(!/infographic/.test(daily.text));
});

import { buttonsFor, captionFor, niceTitle } from "../scripts/nudge.mjs";
import { parseTap, decideTap, hookSecret, handleHook, tapData } from "../src/telegram.js";
test('buttons: one per guess, discard, and an app link; callback data fits 64 bytes', () => {
  const it = { id: 'discord:1558972794673307799', title: 'Zorua CD', guesses: [{ eventId: 'e1', eventTitle: 'Zorua Community Day' }, { eventId: 'e2', eventTitle: 'Other' }] };
  const b = buttonsFor(it).inline_keyboard;
  assert.equal(b.length, 4); assert.match(b[0][0].text, /Zorua Community Day/);
  for (const row of b) for (const x of row) if (x.callback_data) assert.ok(Buffer.byteLength(x.callback_data) <= 64);
  assert.match(captionFor(it), /Best guess: Zorua Community Day/);
  assert.equal(buttonsFor({ ...it, id: 'x'.repeat(60) }).inline_keyboard.length, 1);
});
test('taps parse and resolve against the queue', () => {
  const q = { items: [{ id: 'discord:1', guesses: [{ eventId: 'e1', eventTitle: 'T1' }] }] };
  assert.deepEqual(parseTap(tapData('a', 'discord:1', 0)), { act: 'approve', id: 'discord:1', n: 0 });
  assert.equal(parseTap('a|bad id|0'), null); assert.equal(parseTap('zzz'), null); assert.equal(parseTap('a|discord:1'), null);
  assert.deepEqual(decideTap(parseTap('a|discord:1|0'), q).decision, { id: 'discord:1', status: 'approved', eventId: 'e1', eventTitle: 'T1' });
  assert.equal(decideTap(parseTap('r|discord:1'), q).decision.status, 'rejected');
  assert.ok(decideTap(parseTap('a|discord:1|2'), q).error); assert.ok(decideTap(parseTap('r|gone'), q).error);
});
test('webhook: only genuine requests from your own chat are stored', async () => {
  const env = { TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' };
  const secret = await hookSecret('tok'), saved = [], calls = [];
  const queue = { items: [{ id: 'discord:1', guesses: [{ eventId: 'e1', eventTitle: 'T1' }] }] };
  const mk = (hdr, chat, data, from = chat) => new Request('https://x/api/telegram/hook', { method: 'POST', headers: hdr ? { 'x-telegram-bot-api-secret-token': hdr } : {}, body: JSON.stringify({ callback_query: { id: 'c', from: { id: from }, data, message: { message_id: 1, chat: { id: chat }, photo: [{}], caption: 'Cap' } } }) });
  const deps = { env, queue, fetchFn: async (u, o) => { calls.push(u); return { json: async () => ({ ok: true }) }; }, save: async d => saved.push(d) };
  assert.equal((await handleHook(mk('wrong', 42, 'r|discord:1'), deps)).status, 401);
  assert.equal((await handleHook(mk(null, 42, 'r|discord:1'), deps)).status, 401);
  assert.equal((await handleHook(mk(secret, 99, 'r|discord:1'), deps)).status, 200); assert.equal(saved.length, 0);   // someone else's chat
  assert.equal((await handleHook(mk(secret, 42, 'r|discord:1', 7), deps)).status, 200); assert.equal(saved.length, 0); // wrong sender
  assert.equal((await handleHook(mk(secret, 42, 'a|discord:1|0'), deps)).status, 200);
  assert.deepEqual(saved, [{ id: 'discord:1', status: 'approved', eventId: 'e1', eventTitle: 'T1' }]);
  assert.ok(calls.some(u => /editMessageCaption/.test(u)));
  assert.equal((await handleHook(mk(secret, 42, 'r|discord:1'), { ...deps, env: {} })).status, 404);
});

import { linkedOf, keyboard } from "../src/telegram.js";
test('telegram: link several events, unlink one, discard; buttons follow what is linked', () => {
  const q = { items: [{ id: 'd:1', guesses: [{ eventId: 'e1', eventTitle: 'T1' }, { eventId: 'e2', eventTitle: 'T2' }] }] };
  const one = decideTap(parseTap('a|d:1|0'), q, null);
  assert.equal(one.decision.eventId, 'e1');
  const two = decideTap(parseTap('a|d:1|1'), q, one.decision);
  assert.deepEqual(two.decision, { id: 'd:1', status: 'approved', eventId: 'e1,e2', eventTitle: 'T1 | T2' });
  assert.deepEqual(linkedOf(two.decision).map(l => l.id), ['e1', 'e2']);
  const un = decideTap(parseTap('x|d:1|0'), q, two.decision);
  assert.equal(un.decision.eventId, 'e2');
  assert.equal(decideTap(parseTap('x|d:1|0'), q, un.decision).decision.status, 'unlinked');
  const kb = keyboard(q.items[0], linkedOf(two.decision)).inline_keyboard.flat().map(b => b.text).join('|');
  assert.match(kb, /Unlink T1/); assert.match(kb, /Discard/); assert.doesNotMatch(kb, /Reject/);
});

test("pictures the app linked by itself are announced too, but only recent ones", () => {
  const now = new Date("2026-10-22T00:00:00Z");
  const queue = { items: [
    { id: "d:new", linked: true, title: "Pawniard CD", publishedAt: "2026-10-21T10:00:00Z", guesses: [{ eventTitle: "Pawniard Community Day" }] },
    { id: "d:old", linked: true, title: "Old", publishedAt: "2026-09-01T10:00:00Z" },
    { id: "d:wait", linked: false, title: "Hatch", publishedAt: "2026-10-21T10:00:00Z" }] };
  const d = buildDigest({ queue, now, only: "queue" });
  assert.deepEqual(d.items.map(i => i.id), ["d:new", "d:wait"]);
  assert.match(d.text, /1 infographic waiting for your approval/); assert.match(d.text, /1 infographic added automatically/);
  assert.match(captionFor(queue.items[0]), /Added automatically: Pawniard CD\nLinked to: Pawniard Community Day/);
});

test("Telegram captions never show a raw link or the role ping as the title", () => {
  assert.equal(niceTitle("@Infographics Notify"), "New infographic");
  assert.equal(niceTitle("https://cdn.discordapp.com/attachments/1/2/Twitch_2.png?ex=1"), "New infographic");
  assert.equal(niceTitle("Lake Trio"), "Lake Trio");
  assert.equal(niceTitle("Lake Trio https://x.y/z"), "Lake Trio");
  assert.match(captionFor({ linked: true, title: "@Infographics Notify", publishedAt: "2026-10-22T01:00:00Z", guesses: [{ eventTitle: "Super Mega Raid Day" }] }), /^✅ Added automatically: New infographic\nLinked to: Super Mega Raid Day\nPosted 2026-10-22$/);
});
test("the Telegram picture job restores the pictures from R2 before sending", async () => {
  const { readFileSync } = await import("node:fs");
  const y = readFileSync(".github/workflows/g47ix-infographics.yml", "utf8"), notify = y.slice(y.indexOf("  notify:"));
  assert.ok(notify.indexOf("r2-sync.sh restore") > -1 && notify.indexOf("r2-sync.sh restore") < notify.indexOf("scripts/nudge.mjs"));
  assert.match(readFileSync("scripts/r2-sync.sh", "utf8"), /R2_ONLY/);
});

import { whenText } from "../scripts/nudge.mjs";
test("today's events show your local time", () => {
  const n = new Date("2026-10-23T22:00:00Z"); // Sat 24 Oct, 9:00 am Melbourne
  const data = { events: [{ id: "d", t: "Dynamax Uxie, Mesprit and Azelf", s: "2026-10-24T14:00", e: "2026-10-24T17:00" }], spotlight: [{ d: "2026-10-24", n: "Stufful" }], raidHour: [] };
  const t = buildDigest({ data, world: { events: [] }, now: n }).text;
  assert.match(t, /Today: Dynamax Uxie, Mesprit and Azelf · 2:00 pm–5:00 pm/);
  assert.match(t, /Stufful Spotlight Hour · 6:00 pm–7:00 pm/);
});
test("time wording for all-day, multi-day and date-only events", () => {
  assert.equal(whenText({ start: "2026-10-24T00:00", end: "2026-10-24T23:59" }), "all day");
  assert.equal(whenText({ start: "2026-10-24T00:00", end: "2026-10-30T23:59" }), "until 30 Oct");
  assert.equal(whenText({ start: "2026-10-24T10:00", end: "2026-10-26T20:00" }), "from 10:00 am until 26 Oct");
  assert.equal(whenText({ start: "2026-10-24" }), "time not listed");
});

import { parseVenueTimes, venueItems } from "../scripts/nudge.mjs";
const LA = "Date: October 24, 2026 Location: Intuit Dome, Los Angeles, USA Night Out show starts: 7:30 p.m. PDT (unconfirmed for Pokémon GO) Doors open: 6:00 p.m. PDT End time: To be announced";
test("a venue time in PDT is converted to the right instant", () => {
  const v = parseVenueTimes(LA);
  assert.equal(new Date(v.start).toISOString(), "2026-10-25T02:30:00.000Z"); // 7:30 pm PDT = 1:30 pm Sun in Melbourne
  assert.equal(new Date(v.doors).toISOString(), "2026-10-25T01:00:00.000Z"); assert.equal(v.end, null);
  const l = parseVenueTimes("Date: November 10, 2026 Event time: 6:00 p.m. to 10:30 p.m. GMT");
  assert.equal(new Date(l.start).toISOString(), "2026-11-10T18:00:00.000Z"); assert.equal(new Date(l.end).toISOString(), "2026-11-10T22:30:00.000Z");
  assert.equal(parseVenueTimes("Date: October 24, 2026 Doors open: 6 p.m. PDT"), null); // no start time
  assert.equal(parseVenueTimes("Date: October 24, 2026 Start time: 7:30 p.m. Mars time"), null); // unknown zone
});
test("Night Out shows your time and replaces the date-only entry for that city", () => {
  const details = { events: { "x:la": { name: "Pokémon Night Out 2026 - Los Angeles", fields: { dates: [{ text: LA }] } } } };
  const world = { events: [{ id: "w", name: "Pokémon Night Out events", place: "Los Angeles, USA", start: "2026-10-24", end: "2026-11-10" }] };
  const t = buildDigest({ data: { events: [] }, world, details, now: new Date("2026-10-23T23:15:00Z") }).text; // Sat 24 Oct 10:15 am Melbourne
  assert.match(t, /Tomorrow \(Sun, 25 Oct\): Pokémon Night Out 2026 - Los Angeles · bonuses start 1:30 pm your time \(expected, Pokémon GO hours not confirmed yet\)/); assert.doesNotMatch(t, /doors/i);
  assert.equal((t.match(/Night Out/g) || []).length, 1);
  assert.equal(venueItems(details).length, 1);
});

import { extractFields } from "../scripts/importer/extract.mjs";
import { leadReminders } from "../src/jobs.js";
import { describeVenue, venueFor } from "../src/venue-times.js";
import { topicFor } from "../src/notify.js";
test("importer keeps in-person event time lines", () => {
  const f = extractFields([{ t: "p", text: "Event time: 6:00 p.m. GMT" }, { t: "p", text: "Doors open: 6:00 p.m. PDT" }]);
  assert.equal(f.dates.length, 2);
});
test("saved Night Out: reminder names the event and says when rewards start in your time, per city", () => {
  const details = { events: { "x:la": { name: "Pokémon Night Out 2026 - Los Angeles", fields: { dates: [{ text: LA }] } }, "x:ln": { name: "Pokémon Night Out 2026 - London", fields: { dates: [{ text: "Date: November 10, 2026 Event time: 6:00 p.m. to 10:30 p.m. GMT" }] } } } };
  const venue = venueItems(details);
  const world = [{ id: "w-no", name: "Pokémon Night Out events in Pokémon GO", place: "Los Angeles, USA", start: "2026-10-24", end: "2026-11-10" }];
  assert.equal(venueFor(world[0].name, "2026-10-24", "2026-11-10", venue).length, 2);
  const at = Date.parse("2026-10-25T01:35:00Z"); // 12:35 pm Sun in Melbourne, 55 min before 1:30 pm
  const out = leadReminders({ events: [] }, world, ["w-no"], { "w-no": "60" }, 0, venue, at);
  assert.equal(out.length, 1);
  assert.match(out[0].text, /^🔔 Pokémon Night Out 2026 - Los Angeles\nRewards and bonuses start in about 55 min · 1:30 pm your time \(expected, Pokémon GO hours not confirmed yet\)$/);
  assert.equal(leadReminders({ events: [] }, world, ["w-no"], { "w-no": "60" }, 0, venue, at - 3 * 36e5).length, 0, "too early");
  assert.equal(leadReminders({ events: [] }, world, ["w-no"], {}, 0, venue, at).length, 0, "no reminder chosen");
});
test("starting-soon alerts go to the Events topic, new and changed ones to Changes", () => {
  assert.equal(topicFor("starting"), "events"); assert.equal(topicFor("missing"), "events");
  for (const k of ["announced", "changed", "datamine"]) assert.equal(topicFor(k), "changes");
});

import { eventImage } from "../src/jobs.js";
import { ogImage } from "../src/worker.js";
test("reminder picture comes from the event page, and only from the two event sites", async () => {
  const f = async u => ({ ok: true, text: async () => '<meta property="og:image" content="https://cdn.leekduck.com/x.jpg">' });
  assert.equal(await eventImage("https://leekduck.com/events/a/", f), "https://cdn.leekduck.com/x.jpg");
  assert.equal(await eventImage("https://evil.example/a", f), ""); assert.equal(await eventImage("", f), ""); assert.equal(await eventImage("https://leekduck.com/a", async () => { throw new Error("x"); }), "");
  assert.equal(ogImage('<meta property="og:image" content="https://a/b.png">'), "https://a/b.png");
});
test("a venue item carries its event page link", () => {
  const v = venueItems({ events: { "x:la": { name: "Pokémon Night Out 2026 - Los Angeles", sources: [{ url: "https://leekduck.com/events/pokemon-night-out-los-angeles-2026/" }], fields: { dates: [{ text: LA }] } } } });
  assert.equal(v[0].link, "https://leekduck.com/events/pokemon-night-out-los-angeles-2026/"); assert.equal(v[0].unconfirmed, true);
});

test("digest cards carry each event's page so its picture can be sent", () => {
  const data = { events: [{ id: "d", t: "Dynamax Uxie", s: "2026-10-24T14:00", e: "2026-10-24T17:00", sourceUrl: "https://leekduck.com/events/dynamax-uxie/" }], spotlight: [], raidHour: [] };
  const d = buildDigest({ data, world: { events: [] }, now: new Date("2026-10-23T22:00:00Z") });
  assert.equal(d.cards.length, 1); assert.equal(d.cards[0].page, "https://leekduck.com/events/dynamax-uxie/"); assert.match(d.cards[0].line, /^📅 Today: Dynamax Uxie/);
});
test("Pokémon GO's own hours replace the show-time guide once the page lists them", () => {
  const guide = "Date: October 24, 2026 Night Out show starts: 7:30 p.m. PDT (unconfirmed for Pokémon GO)";
  assert.equal(parseVenueTimes(guide).official, false);
  const off = parseVenueTimes(guide + " Pokémon GO gameplay hours: 8:00 p.m. to 10:00 p.m. PDT");
  assert.equal(off.official, true); assert.equal(new Date(off.start).toISOString(), "2026-10-25T03:00:00.000Z"); assert.equal(new Date(off.end).toISOString(), "2026-10-25T05:00:00.000Z");
  const it = venueItems({ events: { x: { name: "N", fields: { dates: [{ text: guide + " Pokémon GO gameplay hours: 8:00 p.m. to 10:00 p.m. PDT" }] } } } })[0];
  assert.equal(it.unconfirmed, false);
});
test("an alert is sent as a photo with the alert as caption, and falls back to text", async () => {
  const calls = [], env = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" };
  const ok = async (u, o) => { calls.push(u.split("/").pop()); return { ok: true }; };
  const { sendTelegram } = await import("../src/notify.js");
  assert.equal((await sendTelegram(env, "hi", ok, "events", "https://cdn/x.jpg")).status, "sent"); assert.deepEqual(calls, ["sendPhoto"]);
  calls.length = 0; const noPhoto = async (u) => { calls.push(u.split("/").pop()); return { ok: !/Photo/.test(u) }; };
  assert.equal((await sendTelegram(env, "hi", noPhoto, "events", "https://cdn/x.jpg")).status, "sent"); assert.deepEqual(calls, ["sendPhoto", "sendMessage"]);
  calls.length = 0; await sendTelegram(env, "hi", ok, "events"); assert.deepEqual(calls, ["sendMessage"]);
});

test("after a venue event, one note says whether Pokémon GO's own hours were ever listed", () => {
  const details = { events: { x: { name: "Pokémon Night Out 2026 - Los Angeles", fields: { dates: [{ text: LA }] } } } };
  const after = new Date("2026-10-25T08:00:00Z"); // show was 02:30Z, so over by 06:30Z
  const first = buildDigest({ data: { events: [] }, world: { events: [] }, details, now: after });
  assert.match(first.text, /📝 Pokémon Night Out 2026 - Los Angeles is over\. The page never listed Pokémon GO's own hours, so the reminder used the show time \(1:30 pm your time\)\./);
  assert.equal(buildDigest({ data: { events: [] }, world: { events: [] }, details, state: first.state, now: after }), null, "only once");
  assert.equal(buildDigest({ data: { events: [] }, world: { events: [] }, details, now: new Date("2026-10-22T00:00:00Z") }), null, "nothing before it is on");
});
test("Starts today / Last day reminders carry the event page, so they get a picture too", async () => {
  const { savedReminders } = await import("../src/jobs.js");
  const data = { events: [{ id: "a", t: "Week Long", s: "2026-10-24T00:00", e: "2026-10-30T23:59", sourceUrl: "https://leekduck.com/events/week-long/" }] };
  const out = savedReminders(data, ["cur:a"], Date.parse("2026-10-24T07:30:00Z"));
  assert.equal(out[0].page, "https://leekduck.com/events/week-long/");
});

test("test reminder: real-format message with the event picture to the Events topic, text if no picture", async () => {
  const { runTestReminder } = await import("../src/jobs.js");
  const details = { events: { x: { name: "Pokémon Night Out 2026 - Los Angeles", sources: [{ url: "https://leekduck.com/events/n/" }], fields: { dates: [{ text: LA }] } } } };
  const env = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1", TELEGRAM_GROUP_ID: "-100", TELEGRAM_TOPIC_EVENTS: "7", ASSETS: { fetch: async () => ({ ok: true, json: async () => details }) } };
  const sent = []; const f = async (u, o) => { sent.push({ m: u.split("/").pop(), b: JSON.parse(o.body) }); return { ok: true }; };
  const page = async () => ({ ok: true, text: async () => '<meta property="og:image" content="https://cdn.leekduck.com/n.jpg">' });
  const now = new Date("2026-10-24T01:00:00Z");
  const r = await runTestReminder(env, { fetch: f, pageFetch: page, now });
  assert.equal(r.sent, true); assert.equal(r.picture, true);
  assert.equal(sent[0].m, "sendPhoto"); assert.equal(sent[0].b.message_thread_id, 7); assert.equal(sent[0].b.photo, "https://cdn.leekduck.com/n.jpg");
  assert.match(sent[0].b.caption, /^🧪 Test reminder \(nothing is wrong\)\n🔔 Pokémon Night Out 2026 - Los Angeles\nRewards and bonuses start in about 60 min · 1:30 pm your time/);
  sent.length = 0; const r2 = await runTestReminder(env, { fetch: f, pageFetch: async () => ({ ok: false }), now });
  assert.equal(r2.picture, false); assert.equal(sent[0].m, "sendMessage");
});

test("event page lookup: a series returns each city, a city page returns only itself", async () => {
  const worker = (await import("../src/worker.js")).default;
  const details = { events: { la: { name: "Pokémon Night Out 2026 - Los Angeles", fields: { dates: [{ text: LA }] } }, ln: { name: "Pokémon Night Out 2026 - London", fields: { dates: [{ text: "Date: November 10, 2026 Event time: 6:00 p.m. to 10:30 p.m. GMT (unconfirmed for Pokémon GO)" }] } } } };
  const env = { ASSETS: { fetch: async () => ({ json: async () => details }) } };
  const get = async q => (await (await worker.fetch(new Request("https://x/api/venue-times?" + q), env, { waitUntil() {} })).json()).items;
  const series = await get("name=" + encodeURIComponent("Pokémon Night Out events in Pokémon GO") + "&start=2026-10-24&end=2026-11-10");
  assert.equal(series.length, 2); assert.equal(series[0].day, "Sun, 25 Oct"); assert.equal(series[0].show, "1:30 pm");
  const one = await get("name=" + encodeURIComponent("Pokémon Night Out 2026 - London") + "&start=2026-11-10&end=2026-11-10");
  assert.equal(one.length, 1); assert.equal(one[0].show, "5:00 am");
  assert.deepEqual(await get("name=Dynamax%20Uxie%20Mesprit"), []);
});

test("list lookup: all=1 returns every upcoming venue event with its Melbourne date", async () => {
  const worker = (await import("../src/worker.js")).default;
  const details = { events: { la: { name: "Pokémon Night Out 2026 - Los Angeles", fields: { dates: [{ text: LA }] } } } };
  const env = { ASSETS: { fetch: async () => ({ json: async () => details }) } };
  const RealNow = Date.now; Date.now = () => Date.parse("2026-10-24T01:00:00Z");
  try {
    const items = (await (await worker.fetch(new Request("https://x/api/venue-times?all=1"), env, { waitUntil() {} })).json()).items;
    assert.equal(items.length, 1); assert.equal(items[0].date, "2026-10-25"); assert.equal(items[0].day, "Sun, 25 Oct"); assert.equal(items[0].show, "1:30 pm");
    Date.now = () => Date.parse("2026-11-20T01:00:00Z");
    assert.equal((await (await worker.fetch(new Request("https://x/api/venue-times?all=1"), env, { waitUntil() {} })).json()).items.length, 0, "old ones drop out");
  } finally { Date.now = RealNow; }
});
