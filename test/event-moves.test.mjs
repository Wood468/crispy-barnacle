import test from "node:test";
import assert from "node:assert/strict";
import { movesInSentence, buildEventMoves } from "../scripts/event-moves.mjs";

test("evolve text gives the form to evolve, the target and the move", () => {
  const r = movesInSentence("Evolve Zorua during the event or up to 4 hours after to get Zoroark with the exclusive Fast Attack Sucker Punch.");
  assert.deepEqual(r, [{ acquisition: "EVOLVE", pokemon: "Zorua", target: "Zoroark", kind: "fast", move: "Sucker Punch" }]);
});
test("catch text gives the move for Pokémon caught in the event", () => {
  const r = movesInSentence("Machamp caught during the event will know Cross Chop.");
  assert.equal(r.length, 1);
  assert.equal(r[0].acquisition, "CATCH");
  assert.equal(r[0].pokemon, "Machamp");
  assert.equal(r[0].move, "Cross Chop");
});
test("ordinary event text gives nothing", () => {
  assert.deepEqual(movesInSentence("Shiny Greavard debuts (wild, GO Pass and Field Research), and Houndstone evolves from it with 50 Candy."), []);
  assert.deepEqual(movesInSentence("Mega Sableye can reach Super Max Level and gains Night Shade+ while Mega Evolved."), []);
  assert.deepEqual(movesInSentence("Brambleghast can also be had by evolving Bramblin."), []);
});
test("window runs to the event end, plus the hours the text allows, and is never in the base moveset", () => {
  const ev = { id: "z", t: "Zorua Day", s: "2026-11-01T10:00", e: "2026-11-01T17:00", p: ["Evolve Zorua during the event or up to 4 hours after to get Zoroark with the exclusive Fast Attack Sucker Punch."] };
  const m = buildEventMoves([ev]);
  assert.equal(m.length, 1);
  assert.equal(m[0].windowEnd, "2026-11-01T21:00");
  assert.equal(m[0].evolveProject, true);
  assert.equal(m[0].eventId, "z");
});
test("a clock time in the text sets the end on the last day", () => {
  const ev = { id: "w", t: "Worlds", s: "2026-08-28T10:00", e: "2026-08-30T23:59", p: ["Pokémon caught during the event until 8:00 p.m. will know Draco Meteor."] };
  const m = buildEventMoves([ev]);
  assert.equal(m.length, 1);
  assert.equal(m[0].windowEnd, "2026-08-30T20:00");
});
