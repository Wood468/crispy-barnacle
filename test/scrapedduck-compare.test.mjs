import test from "node:test";
import assert from "node:assert/strict";
import { compare, same } from "../scripts/scrapedduck-compare.mjs";

const now = Date.parse("2026-10-17T12:00:00Z");
test("matches by start day and a shared word, ignores filler words", () => {
  assert.ok(same({ name: "Sandile Hatch Day", start: "2026-10-17T11:00" }, { name: "Sandile Hatch Day", start: "2026-10-17T11:00" }));
  assert.ok(!same({ name: "Hatch Day", start: "2026-10-17T11:00" }, { name: "Super Mega Raid Day", start: "2026-10-17T11:00" }));
  assert.ok(!same({ name: "Sandile", start: "2026-10-20" }, { name: "Sandile", start: "2026-10-17" }));
});
test("reports gaps both ways, skips GBL, and flags missing shiny", () => {
  const sd = [
    { name: "Nov Community Day", eventType: "community-day", start: "2026-11-21T14:00", end: "2026-11-21T17:00", extraData: { communityday: { shinies: [{ name: "Zorua" }] } } },
    { name: "Max Battle Day", eventType: "max-battles", start: "2026-10-24T14:00", end: "2026-10-24T17:00" },
    { name: "GBL Twilight Trails", eventType: "go-battle-league", start: "2026-10-20T20:00Z", end: "2026-10-27T20:00Z" }
  ];
  const ours = [
    { id: "novcd", name: "November Community Day", start: "2026-11-21T14:00", end: "2026-11-21T17:00", p: ["Featured not announced."] },
    { id: "x", name: "Mystery Fest", start: "2026-10-25T10:00", end: "2026-10-25T12:00" }
  ];
  const r = compare({ sd, ours, now });
  assert.deepEqual(r.missingHere.map(e => e.name), ["Max Battle Day"]);
  assert.deepEqual(r.missingThere.map(e => e.id), ["x"]);
  assert.equal(r.shinyDisagree[0].event, "novcd");
});
