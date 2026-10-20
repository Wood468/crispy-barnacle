import test from "node:test";
import assert from "node:assert/strict";
import { buildWeek, formatWeek, pictureUrls } from "../scripts/weekly.mjs";
import { diffStore, buildMessages, slugOf, kindOf, isTicketOrPass } from "../scripts/store-watch.mjs";
import { photoOf } from "../src/telegram.js";

const data = {
  events: [
    { id: "a", t: "Great League: Mega Edition | Twilight Trails", s: "2026-10-14T00:00", e: "2026-10-15T00:00", art: ["Mewtwo"] },
    { id: "b", t: "Fall Marathon", s: "2026-10-13T10:00", e: "2026-10-19T20:00", art: ["Bramblin", { n: "Electrike", shiny: 1 }] },
    { id: "c", t: "Old event", s: "2026-10-01T00:00", e: "2026-10-05T00:00" },
  ],
  spotlight: [{ d: "2026-10-15", n: "Stufful", b: "2x transfer Candy" }],
  raidHour: [{ d: "2026-10-14", n: "Dialga" }],
};
test("week summary leaves out Battle League and finished events", () => {
  const rows = buildWeek(data, "2026-10-13");
  const text = formatWeek(rows);
  assert.ok(!/League/.test(text) && !/Old event/.test(text));
  assert.match(text, /Dialga Raid Hour 6pm/);
  assert.match(text, /Stufful Spotlight Hour/);
  assert.ok(text.indexOf("Tue 13 Oct") < text.indexOf("Wed 14 Oct"));
});
test("pictures are unique, capped, shiny kept", () => {
  const p = pictureUrls(buildWeek(data, "2026-10-13"));
  assert.ok(p.length >= 3 && p.length <= 6);
  assert.ok(p.some(x => /shiny=1/.test(x.url)));
  assert.equal(new Set(p.map(x => x.url)).size, p.length);
});
const item = (name, price, href, extra = {}) => ({ name, price, href, section: "LIMITED_TIME", tag: "LIMITED-TIME ONLY", limit: "Can only be purchased 1 time.", imgs: ["/box.png", "/badge.png"], ...extra });
test("store messages: emoji, picture, one per item, quiet when unchanged", () => {
  const a = item("GO Pass Deluxe: October", "A$12.99", "/purchase/item/web-pass-oct"), b = item("Sandile Hatch Day Ultra Ticket Box", "A$2.99", "/purchase/item/web-sandile"), c = item("Egg", "A$3.00", "/purchase/item/web-egg", { section: "ITEMS", tag: "" });
  const d1 = diffStore(null, { items: [a, b, c] }, "t1");
  const first = buildMessages(d1);
  assert.equal(first.length, 2); // first run: only limited-time items
  assert.equal(first[0].text, "🎫 ON SALE NOW · GO Pass\n\n✨ GO Pass Deluxe: October\n💰 A$12.99\n⏳ Limited time only\n🔒 Limit: 1 time");
  assert.equal(first[0].photo, "/badge.png");
  assert.equal(buildMessages(diffStore(d1.state, { items: [a, b, c] }, "t2")).length, 0);
  const d3 = diffStore(d1.state, { items: [a, b, { ...c, price: "A$3.50" }, item("GO Pass Deluxe: Fall", "A$7.99", "/purchase/item/web-fall")] }, "t3");
  const m = buildMessages(d3);
  assert.deepEqual(m.map(x => x.text.split("\n")[0]), ["🎫 NEW IN STORE · GO Pass", "🥚 PRICE CHANGE · Eggs & incubators"]);
  assert.match(m[1].text, /A\$3.50  \(was A\$3.00\)/);
  assert.equal(d3.state.items["/purchase/item/web-pass-oct"].firstSeen, "t1");
  assert.ok(isTicketOrPass("GO Pass Deluxe: October")); assert.equal(kindOf("Super Incubator").emoji, "🥚");
});
import { telegramCandidate, extOf } from "../scripts/tg-inbox.mjs";
import { handleHook, hookSecret } from "../src/telegram.js";
test("a picture sent to the bot: parsed, only from your chat, saved to the inbox, collected as a review candidate", async () => {
  const msg = { message_id: 7, caption: "Zorua CD <b>", chat: { id: 5 }, from: { id: 5 }, photo: [{ file_id: "s", file_unique_id: "u1" }, { file_id: "big", file_unique_id: "u2" }] };
  assert.deepEqual(photoOf(msg), { fileId: "big", uniq: "u2", caption: "Zorua CD b", msgId: 7 });
  assert.equal(photoOf({ document: { file_id: "d", file_unique_id: "u3", mime_type: "application/pdf" } }), null);
  assert.equal(photoOf({ document: { file_id: "d", file_unique_id: "u3", mime_type: "image/png" } }).uniq, "u3");
  const env = { TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHAT_ID: "5" }, saved = [], sent = [];
  const run = async m => handleHook({ headers: { get: () => hookSecretValue }, json: async () => ({ message: m }) }, { env, fetchFn: async (u, o) => { sent.push(u); return { json: async () => ({}) }; }, saveInbox: async p => saved.push(p) });
  const hookSecretValue = await hookSecret("tok");
  await run(msg); assert.equal(saved.length, 1); assert.ok(sent.some(u => /sendMessage/.test(u)));
  await run({ ...msg, from: { id: 99 }, chat: { id: 99 } }); assert.equal(saved.length, 1); // a stranger is ignored
  const c = telegramCandidate({ id: "u2", caption: "Zorua CD", at: 1760000000000 }, extOf("photos/file_1.jpg"), "now");
  assert.equal(c.id, "tg:u2"); assert.equal(c.imageUrl, "local:data/tg-inbox/tg-u2.jpg"); assert.equal(c.reviewStatus, "needs_review");
  assert.equal(telegramCandidate({ id: "../x" }, "jpg", "n"), null);
});
import { collect, diffSeen, messageFor } from "../scripts/event-news.mjs";
test("new events: first run only records, later runs tell about each new one once", () => {
  const details = { events: { "leekduck:a": { name: "Alpha Day", sources: [{ name: "Leek Duck", url: "https://leekduck.com/events/a/" }, { name: "Pokémon GO (official)", url: "https://pokemongo.com/news/a/" }] }, "leekduck:b": { name: "Beta Hour", sources: [{ name: "Leek Duck", url: "https://leekduck.com/events/b/" }] } } };
  const world = { events: [{ id: "w-1", name: "Taipei Safari", place: "Taipei, Taiwan", start: "2026-11-20", end: "2026-11-22", sources: [{ name: "Serebii", url: "https://www.serebii.net/x" }] }] };
  const live = [{ id: "leekduck:a", name: "Alpha Day", start: "2026-10-20", end: "2026-10-26" }];
  const items = collect(details, world, live);
  const first = diffSeen(null, items); assert.ok(first.baseline); assert.equal(first.fresh.length, 0); assert.equal(first.state.ids.length, 3);
  const again = diffSeen(first.state, items); assert.equal(again.fresh.length, 0);
  const more = diffSeen(first.state, collect({ events: { ...details.events, "leekduck:c": { name: "Gamma Fest", sources: [] } } }, world, live));
  assert.deepEqual(more.fresh.map(i => i.id), ["leekduck:c"]);
  assert.equal(messageFor(items[0]), "🆕 New event spotted\n\n📌 Alpha Day\n🗓 Tue 20 Oct → Mon 26 Oct\n🔎 Found on: Leek Duck, Pokémon GO (official)\n\nhttps://pokemongo.com/news/a/");
  assert.match(messageFor(items[2]), /^🌏 New real-life event spotted[\s\S]*📍 Taipei, Taiwan/);
});

import { pending as weeklyPending, captionFor as weeklyCaption } from "../scripts/weekly-pic.mjs";
test("the weekly picture is sent once, oldest first, and not when it is old", () => {
  const now = Date.parse("2026-10-14T00:00:00Z");
  const w = { items: [
    { id: "b", title: "GO Weekly TT", image: "/i/b.webp", publishedAt: "2026-10-12T05:00:00Z" },
    { id: "a", title: "GO Weekly Update", image: "/i/a.webp", publishedAt: "2026-10-11T22:00:00Z" },
    { id: "old", title: "Last month", image: "/i/o.webp", publishedAt: "2026-09-20T00:00:00Z" },
  ] };
  assert.deepEqual(weeklyPending(w, { sent: [] }, now).map(i => i.id), ["a", "b"]);
  assert.deepEqual(weeklyPending(w, { sent: ["a"] }, now).map(i => i.id), ["b"]);
  assert.match(weeklyCaption(w.items[0]), /This week at a glance/);
});

import { judge, alerts, warnText } from "../scripts/health.mjs";
test("job health: fresh, stale, failing, and one warning per episode", () => {
  const now = Date.parse("2026-10-14T12:00:00Z"), job = { id: "x.yml", name: "Store watcher", everyH: 6 };
  assert.equal(judge(job, { lastSuccess: "2026-10-14T08:00:00Z" }, now).state, "fresh");
  assert.equal(judge(job, { lastSuccess: "2026-10-13T12:00:00Z" }, now).state, "stale");
  assert.equal(judge(job, { lastSuccess: null }, now).state, "never");
  assert.equal(judge(job, { lastSuccess: "2026-10-14T01:00:00Z", lastConclusion: "failure" }, now).state, "failing");
  const rows = [{ id: "a", name: "A", state: "stale", lastSuccess: "2026-10-13T00:00:00Z" }, { id: "b", name: "B", state: "fresh" }];
  assert.deepEqual(alerts(rows, { alerted: [] }).warn.map(r => r.id), ["a"]);
  assert.deepEqual(alerts(rows, { alerted: ["a"] }).warn, []);
  assert.deepEqual(alerts([{ id: "a", name: "A", state: "fresh" }], { alerted: ["a"] }).recovered.map(r => r.id), ["a"]);
  assert.match(warnText(rows[0]), /gone quiet/);
});
