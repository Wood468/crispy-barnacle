import test from "node:test";
import assert from "node:assert/strict";
import { hbTime, pickHeartbeat, JOBS, judge } from "../scripts/health.mjs";
test("AI heartbeat markers carry their time in the name", () => {
  assert.equal(hbTime("refs/tags/ai-hb-pipeline-202610151530"), Date.UTC(2026, 9, 15, 15, 30));
  assert.equal(hbTime("refs/heads/ai-hb-pipeline-202610151530"), Date.UTC(2026, 9, 15, 15, 30));
  assert.equal(hbTime("refs/tags/ai-hb-pipeline-junk"), null);
});
test("a heartbeat can be a branch or a tag; the newest counts and old ones are tidied", () => {
  const now = Date.UTC(2026, 9, 17, 12, 0);
  const p = pickHeartbeat("event-check", [
    "refs/heads/ai-hb-event-check-202610170700",
    "refs/tags/ai-hb-event-check-202610151300",
    "refs/heads/ai-hb-event-check-202610140700",
    "refs/heads/ai-hb-pipeline-202610170900",
  ], now);
  assert.equal(p.newest, Date.UTC(2026, 9, 17, 7, 0));
  assert.deepEqual(p.stale, ["refs/heads/ai-hb-event-check-202610140700"]);
  assert.deepEqual(pickHeartbeat("shiny", [], now), { newest: null, stale: [] });
});

import { newUnmatched } from "../scripts/health.mjs";
test("pictures that match no event are reported once, after the AI has had time to match them", () => {
  const now = Date.UTC(2026, 9, 17, 12, 0);
  const c = (id, extra = {}) => ({ id, reviewStatus: "unmatched", decision: "pending", stagedPath: "/x.jpg", publishedAt: "2026-10-17T01:00:00Z", ...extra });
  const r = newUnmatched([c("a"), c("b", { aiMatch: [{ eventId: "e" }] }), c("c", { decision: "rejected" }), c("d", { publishedAt: "2026-10-17T10:00:00Z" }), c("e", { eventMatch: { eventId: "x" } })], ["z"], now);
  assert.deepEqual(r.fresh.map(x => x.id), ["a"]);
  assert.deepEqual(r.all, ["a"]);
  assert.deepEqual(newUnmatched([c("a")], ["a"], now).fresh, []);
});

test("health covers source freshness jobs and gives the twice-weekly raid job a realistic grace window", () => {
  const byId = Object.fromEntries(JOBS.map(j => [j.id, j]));
  assert.equal(byId["source-watch.yml"].everyH, 3);
  assert.equal(byId["location-discovery.yml"].everyH, 6);
  assert.equal(byId["low-raids.yml"].everyH, 84);
  const now = Date.UTC(2026, 9, 31, 12, 0);
  const last = hours => new Date(now - hours * 36e5).toISOString();
  assert.equal(judge(byId["low-raids.yml"], { lastSuccess: last(155), lastConclusion: "success" }, now).state, "fresh");
  assert.equal(judge(byId["low-raids.yml"], { lastSuccess: last(157), lastConclusion: "success" }, now).state, "stale");
});
