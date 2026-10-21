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

import { buttonsFor, captionFor } from "../scripts/nudge.mjs";
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
