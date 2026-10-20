import test from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "../scripts/data-report.mjs";
test("data report names failing sources, mismatches and the missing events that matter", () => {
  const now = new Date("2026-10-18T21:00:00Z");
  const t = buildReport({ now, importer: { runAt: "2026-10-18T18:00:00Z", sources: { leekduck: { error: "HTTP 503" }, hub: { error: "" } } },
    audit: { checked: "2026-10-18T18:10:00Z", compared: 52, problems: [{}], missing: [{ slug: "soon-event", start: "2026-10-25T10:00:00" }, { slug: "far", start: "2027-05-01T00:00:00" }] },
    commits: ["Event details: refresh from sources"] });
  assert.match(t, /PROBLEM with leekduck/); assert.match(t, /1 date mismatches/); assert.match(t, /: 1 - soon-event/); assert.doesNotMatch(t, /far/);
});
