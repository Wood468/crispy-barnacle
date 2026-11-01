import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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


test("duplicate schedule and detail move text retains its official source attribution", () => {
  const source = {
    id: "official", name: "Pokémon GO (official)", trust: "official",
    url: "https://pokemongo.com/news/communityday-november-2026-pawniard/"
  };
  const details = {
    sources: [source, { id: "unused", name: "Unused", trust: "community", url: "https://example.com/" }],
    fields: {
      moves: [{
        text: "Evolve Bisharp during the event or up to four hours afterwards to get a Kingambit that knows the Charged Attack Kowtow Cleave.",
        sources: ["official"], status: "official"
      }]
    }
  };
  const event = {
    id: "novcd", t: "November Community Day", s: "2026-11-21T14:00", e: "2026-11-21T17:00",
    p: ["Evolve Bisharp into Kingambit during the event or up to 4 hours after to learn the Charged Attack Kowtow Cleave."]
  };
  const moves = buildEventMoves([event], { novcd: details });
  assert.equal(moves.length, 1);
  assert.equal(moves[0].windowEnd, "2026-11-21T21:00");
  assert.deepEqual(moves[0].sources, [source]);
});

test("unrelated structured move sources are not attributed to a move", () => {
  const details = {
    sources: [{ id: "official", name: "Pokémon GO (official)", trust: "official", url: "https://pokemongo.com/" }],
    fields: { moves: [{ text: "Evolve Bisharp into Kingambit to learn Kowtow Cleave.", sources: [] }] }
  };
  const event = {
    id: "novcd", t: "November Community Day", s: "2026-11-21T14:00", e: "2026-11-21T17:00",
    p: ["Evolve Bisharp into Kingambit during the event or up to 4 hours after to learn the Charged Attack Kowtow Cleave."]
  };
  assert.deepEqual(buildEventMoves([event], { novcd: details })[0].sources, []);
});

test("event-only move detail rows render recorded source links", () => {
  const detail = fs.readFileSync(new URL("../public/detail.js", import.meta.url), "utf8");
  assert.match(detail, /m\.sources/);
  assert.match(detail, /class="evd-src">Source:/);
  assert.match(detail, /target="_blank" rel="noopener noreferrer"/);
});
