import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, auditRaidUpcoming } from "../scripts/data-report.mjs";
test("data report names failing sources, mismatches and the missing events that matter", () => {
  const now = new Date("2026-10-18T21:00:00Z");
  const t = buildReport({ now, importer: { runAt: "2026-10-18T18:00:00Z", sources: { leekduck: { error: "HTTP 503" }, hub: { error: "" } } },
    audit: { checked: "2026-10-18T18:10:00Z", compared: 52, problems: [{}], missing: [{ slug: "soon-event", start: "2026-10-25T10:00:00" }, { slug: "far", start: "2027-05-01T00:00:00" }] },
    commits: ["Event details: refresh from sources"] });
  assert.match(t, /PROBLEM with leekduck/); assert.match(t, /1 date mismatches/); assert.match(t, /: 1 - soon-event/); assert.doesNotMatch(t, /far/);
});

test("raidNow, Mega raid and weekly Max Battle dates agree with their rotation tables", () => {
  const data = {
    asOf: "30 Oct 2026",
    raidNow: { "Mega Banette": "Mega raid Nov 16 to 24", "Mega Metagross": "Mega raid Nov 25 to Dec 1" },
    rotation: [
      { s: "2026-10-14T10:00", e: "2026-10-21T10:00", mega: "Mega Dragonite" },
      { s: "2026-10-21T10:00", e: "2026-10-28T10:00", mega: "Mega Charizard X and Y" },
      { s: "2026-10-28T10:00", e: "2026-11-04T10:00", mega: "Mega Sableye" },
      { s: "2026-11-04T10:00", e: "2026-11-09T10:00", mega: "Mega Sableye" },
      { s: "2026-11-16T10:00", e: "2026-11-25T10:00", mega: "Mega Banette" },
      { s: "2026-11-25T10:00", e: "2026-12-02T10:00", mega: "Mega Metagross" }
    ],
    maxBattles: [["2026-10-19", "2026-10-25", "Sneasel"], ["2026-10-26", "2026-11-01", "Sableye"]],
    upcoming: { announced: [
      { kind: "Mega", name: "Mega Dragonite", when: "Oct 14 to 20", note: "Mega raid.", art: ["Mega Dragonite"] },
      { kind: "Mega", name: "Mega Charizard X and Y", when: "Oct 21 to 27", note: "Mega raid.", art: ["Mega Charizard X", "Mega Charizard Y"] },
      { kind: "Mega", name: "Mega Sableye", when: "Oct 28 to Nov 8", note: "Mega raid.", art: ["Mega Sableye"] },
      { kind: "Dynamax", name: "Dynamax Sneasel, then Sableye", when: "Oct 19 to 25 · Oct 26 to Nov 1", note: "Weekly Max Battle rotation.", art: ["Sneasel", { n: "Sneasel", shiny: 1 }, "Sableye", { n: "Sableye", shiny: 1 }] }
    ] }
  };
  assert.deepEqual(auditRaidUpcoming(data), { checked: 7, issues: [] });
  const bad = structuredClone(data);
  bad.raidNow["Mega Banette"] = "Mega raid Nov 17 to 24";
  bad.upcoming.announced.find(x => x.name === "Mega Sableye").when = "Oct 28 to Nov 7";
  bad.maxBattles[1][1] = "2026-10-31";
  const issues = auditRaidUpcoming(bad).issues;
  assert.equal(issues.length, 3);
  assert.ok(issues.some(x => /raidNow Mega Banette/.test(x)));
  assert.ok(issues.some(x => /Upcoming Mega Sableye/.test(x)));
  assert.ok(issues.some(x => /Max Battle Sableye/.test(x)));
});
