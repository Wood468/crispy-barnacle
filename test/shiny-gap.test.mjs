import test from "node:test";
import assert from "node:assert/strict";
import { findGaps, message } from "../scripts/shiny-gap.mjs";
const ev = (text, extra = {}) => ({ name: "X", fields: { shiny: [{ text }], dates: [{ text: "The event runs until December 5, 2026." }] }, ...extra });
const today = "2026-11-24";
const run = (events, alerted = [], data = { events: [] }) => findGaps({ data, details: { events }, today, alerted });
test("flags a live event with boost wording and no chip", () => {
  const g = run({ a: ev("Pawniard has a 5% chance of being Shiny.") });
  assert.equal(g.length, 1);
  assert.match(message(g), /5% chance/);
});
test("ignores plain availability wording", () => {
  assert.equal(run({ a: ev("If you're lucky, you might encounter a Shiny one."), b: ev("Both can be Shiny."), c: ev("Shiny is not available.") }).length, 0);
});
test("ignores events that already have a boosted-shiny chip", () => {
  assert.equal(run({ a: ev("Increased chance to be Shiny.", { highlights: [{ type: "boosted-shiny", label: "BOOSTED SHINY · Pawniard" }] }) }).length, 0);
});
test("ignores events already alerted", () => {
  assert.equal(run({ a: ev("Boosted Shiny odds.") }, ["a"]).length, 0);
});
test("ignores ended events", () => {
  const ended = { name: "Old", fields: { shiny: [{ text: "Boosted Shiny odds." }], dates: [{ text: "On November 1, 2026." }] } };
  assert.equal(run({ a: ended }).length, 0);
});
test("uses curated end date and ignores curated ended events", () => {
  const e = { name: "C", fields: { shiny: [{ text: "Increased Shiny odds." }] } };
  assert.equal(run({ a: e }, [], { events: [{ id: "a", t: "C", s: "2026-11-20T00:00", e: "2026-11-30T00:00" }] }).length, 1);
  assert.equal(run({ a: e }, [], { events: [{ id: "a", t: "C", s: "2026-11-01T00:00", e: "2026-11-10T00:00" }] }).length, 0);
});
