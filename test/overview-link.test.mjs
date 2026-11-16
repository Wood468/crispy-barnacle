import test from "node:test";
import assert from "node:assert/strict";
import { parseTap, tapData, decideTap, keyboard } from "../src/telegram.js";
import { buildWeekly } from "../scripts/g47ix-publish.mjs";
import { applyDecisions } from "../scripts/g47ix-apply.mjs";
import { cleanDecision } from "../src/worker.js";

const queue = { items: [{ id: "pic1", guesses: [] }] };

test("Telegram: week and month buttons round-trip and make a decision with no event", () => {
  assert.deepEqual(parseTap(tapData("w", "pic1")), { act: "week", id: "pic1" });
  assert.deepEqual(parseTap(tapData("m", "pic1")), { act: "month", id: "pic1" });
  const r = decideTap({ act: "month", id: "pic1" }, queue, null);
  assert.equal(r.decision.status, "month"); assert.equal(r.decision.eventId, "");
  const kb = keyboard(queue.items[0]).inline_keyboard.flat().map(b => b.callback_data || "");
  assert.ok(kb.includes("w|pic1") && kb.includes("m|pic1"));
});

test("the worker accepts week and month decisions", () => {
  assert.equal(cleanDecision({ id: "pic1", status: "week" }).status, "week");
  assert.equal(cleanDecision({ id: "pic1", status: "month" }).status, "month");
});

test("a picture marked as week or month leaves the review list and shows under At a glance, first", () => {
  const reg = { candidates: [
    { id: "a", title: "Some graphic", stagedPath: "/infographics/a.webp", publishedAt: "2020-01-01T00:00:00Z", reviewStatus: "needs_review" },
    { id: "b", title: "OCT_CONTENT_G47IX", imageUrl: "https://x/OCT_CONTENT.png", stagedPath: "/infographics/b.webp", publishedAt: "2026-10-01T00:00:00Z", reviewStatus: "weekly" },
  ] };
  const res = applyDecisions(reg, {}, [{ id: "a", status: "month", eventId: "", eventTitle: "" }]);
  assert.equal(res.changed.length, 1); assert.equal(reg.candidates[0].reviewStatus, "weekly");
  const w = buildWeekly(reg, Date.parse("2026-10-14T00:00:00Z")).items.filter(i => i.kind === "month");
  assert.equal(w[0].id, "b", "a newer picture of the same kind replaces the older one you chose");
  assert.equal(w.length, 1, "one picture per button");
  const only = buildWeekly({ candidates: [reg.candidates[0]] }, Date.parse("2026-10-14T00:00:00Z")).items.filter(i => i.kind === "month");
  assert.equal(only[0].id, "a", "the picture you chose is still shown when nothing newer exists");
  assert.equal(applyDecisions(reg, {}, [{ id: "a", status: "month" }]).skipped.length, 1, "applying twice changes nothing");
});
