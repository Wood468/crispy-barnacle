import test from "node:test";
import assert from "node:assert/strict";
import { decide, raidSuggest, raidSlots, buildQueue } from "../scripts/g47ix-publish.mjs";
import { keyboard } from "../src/telegram.js";

const now = Date.parse("2026-11-22T00:00:00Z");
const rot = [{ s: "2026-11-18T10:00", e: "2026-11-25T10:00", five: "Dialga" }, { s: "2026-11-25T10:00", e: "2026-12-02T10:00", five: "Dialga" }];
const slots = raidSlots(rot, now);

test("raid guide naming a current boss suggests that raid slot, dated one first", () => {
  const s = raidSuggest("DIALGA RAID GUIDE counters 26 Nov", slots, now);
  assert.equal(s[0].eventId, "raid:dialga:2026-11-25");
  assert.ok(s.length <= 2 && s[0].why.includes("raid guide"));
  const d = decide({ title: "Weekend" }, "DIALGA counters", slots, now);
  assert.equal(d.confident, false); assert.ok(d.guess.eventId.startsWith("raid:dialga:"));
});
test("unknown boss or non-raid graphic gets no raid suggestion", () => {
  assert.deepEqual(raidSuggest("ZZZZ raid guide counters", slots, now), []);
  const d = decide({ title: "Weekend" }, "hello world", slots, now);
  assert.equal(d.guess, undefined);
  assert.deepEqual(raidSuggest("Dialga", [{ id: "x", t: "Dialga Day", art: [{ n: "Dialga" }] }], now), []);
});
test("a raid-looking picture is never auto-linked by the boost alone", () => {
  assert.equal(decide({ title: "" }, "5-star raid counters Dialga", slots, now).confident, false);
});
test("a clear event match still links as before", () => {
  const evs = [{ id: "kyogre-oct", t: "Kyogre in 5-star Raid Battles" }, { id: "zorua-cd", t: "Zorua Community Day" }];
  const a = decide({ title: "Kyogre in 5-star Raid Battles" }, "KYOGRE RAID GUIDE counters weakness", evs, now);
  assert.equal(a.confident, true); assert.equal(a.event.id, "kyogre-oct");
});
test("queue suggestions carry no private URLs and use the existing a|id|n button", () => {
  const g = decide({ title: "Weekend" }, "DIALGA counters", slots, now).guess;
  const q = buildQueue({ candidates: [{ id: "c1", stagedPath: "/i/c1.webp", reviewStatus: "needs_review", url: "https://discord.com/channels/1/2/3", eventMatch: { ...g } }] });
  assert.ok(!JSON.stringify(q.items[0].guesses).includes("discord"));
  const kb = keyboard(q.items[0]);
  const btn = kb.inline_keyboard.flat().find(b => /Link to Dialga/.test(b.text));
  assert.equal(btn.callback_data, "a|c1|0");
});
