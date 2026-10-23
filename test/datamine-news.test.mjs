import test from "node:test";
import assert from "node:assert/strict";
import { parseMessage, merge, clean, telegramText } from "../scripts/datamine-news.mjs";

const msg = (o) => ({ id: "100", timestamp: "2026-10-22T03:00:00.000000+00:00", content: "", embeds: [], attachments: [], ...o });

test("a followed announcement keeps its embed title, link and text", () => {
  const i = parseMessage(msg({ webhook_id: "9", embeds: [{ title: "APK 0.400.0 teardown", url: "https://example.com/report", description: "**New** feature: [Buddy](https://x.y) <:emoji:123> <@&55>" }] }), "reports");
  assert.equal(i.title, "APK 0.400.0 teardown");
  assert.equal(i.link, "https://example.com/report");
  assert.equal(i.text, "New feature: Buddy");
  assert.equal(i.src, "reports");
  assert.equal(i.date, "2026-10-22T03:00:00.000Z");
});
test("plain text posts use the first line as the title and the first link", () => {
  const i = parseMessage(msg({ content: "Game master changed\nsee https://github.com/PokeMiners/game_masters/commit/abc" }), "gamedata");
  assert.equal(i.title, "Game master changed");
  assert.match(i.link, /^https:\/\/github\.com\/PokeMiners/);
});
test("forwarded messages are read from their snapshot", () => {
  const i = parseMessage(msg({ message_snapshots: [{ message: { content: "Forwarded datamine", embeds: [], attachments: [] } }] }), "reports");
  assert.equal(i.title, "Forwarded datamine");
});
test("expiring Discord picture links are not kept, an image-only post still shows", () => {
  const i = parseMessage(msg({ attachments: [{ filename: "a.png" }], embeds: [{ image: { url: "https://cdn.discordapp.com/attachments/1/2/a.png?ex=1" } }] }), "images");
  assert.equal(i.image, "");
  assert.equal(i.title, "New image");
  assert.equal(parseMessage(msg({}), "images"), null);
});
test("merge keeps known posts, adds new ones in front, drops posts over 60 days old", () => {
  const now = Date.parse("2026-10-23T00:00:00Z");
  const old = [{ id: "1", date: "2026-10-20T00:00:00.000Z" }, { id: "2", date: "2026-07-01T00:00:00.000Z" }];
  const { items, added } = merge(old, [{ id: "1", date: "2026-10-20T00:00:00.000Z", title: "changed?" }, { id: "3", date: "2026-10-22T00:00:00.000Z" }], now);
  assert.deepEqual(added.map((x) => x.id), ["3"]);
  assert.deepEqual(items.map((x) => x.id), ["3", "1"]);
  assert.equal(items[1].title, undefined);
});
test("Telegram text is short, links the report and says it is not announced", () => {
  const t = telegramText({ title: "APK teardown", text: "x".repeat(900), link: "https://e.com/r" });
  assert.ok(t.length < 520);
  assert.match(t, /https:\/\/e\.com\/r/);
  assert.match(t, /not announced/i);
  assert.equal(clean("<#123> **bold** ~~gone~~"), "bold gone");
});
