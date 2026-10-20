import test from "node:test";
import assert from "node:assert/strict";
import { score, weightOf } from "../scripts/shiny-scorecard.mjs";

const now = Date.parse("2026-10-17T12:00:00Z");
const dex = [[1, "Bulbasaur", 1], [41, "Zubat", 1], [25, "Pikachu", 1]];
test("official sources outweigh community sources", () => {
  assert.equal(weightOf("https://pokemongo.com/news/x"), 2);
  assert.equal(weightOf("https://leekduck.com/events/x/"), 1);
  assert.equal(weightOf(""), 0);
});
test("scores claims and flags a costume with no tracked picture", () => {
  const events = [
    { id: "a", s: "2026-10-27T10:00", e: "2026-11-01T10:00", sourceUrl: "https://pokemongo.com/news/a", p: ["All can be shiny."], art: [{ n: "Zubat", costume: 1, label: "Top hat" }, { n: "Pikachu", shiny: 1 }] },
    { id: "b", s: "2026-10-20T10:00", e: "2026-10-21T10:00", art: [{ n: "Bulbasaur", shiny: 1 }] },
    { id: "far", s: "2027-03-01T10:00", e: "2027-03-02T10:00", art: [{ n: "Bulbasaur", shiny: 1 }] }
  ];
  const r = score({ events, costumes: { pictures: {}, shiny: {}, missing: [] }, dex, now });
  assert.equal(r.claims, 3);
  assert.equal(r.official, 2);
  assert.equal(r.unsourced, 1);
  assert.equal(r.score, 67);
  assert.ok(r.issues.some(i => /zubat\|top hat/.test(i.issue)));
  assert.ok(r.issues.some(i => i.event === "b" && /no source/.test(i.issue)));
});
test("tracked missing picture is info early, warn within a week", () => {
  const ev = d => [{ id: "c", s: d, e: d, sourceUrl: "https://pokemongo.com/x", art: [{ n: "Zubat", costume: 1, label: "Bow" }] }];
  const c = { pictures: {}, shiny: {}, missing: ["zubat|bow"] };
  assert.equal(score({ events: ev("2026-11-10T10:00"), costumes: c, dex, now }).issues[0].level, "info");
  assert.equal(score({ events: ev("2026-10-20T10:00"), costumes: c, dex, now }).issues[0].level, "warn");
});
