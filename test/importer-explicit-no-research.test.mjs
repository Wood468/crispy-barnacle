// A fully read, event-owned page that explicitly says there is no research confirms removal at once (reason source-denies).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractFields } from "../scripts/importer/extract.mjs";
import { preserveUnfetchedResearchTasks } from "../scripts/importer/run.mjs";

const load = name => readFileSync(new URL("./fixtures/explicit-no-research/" + name + ".html", import.meta.url), "utf8");
const page = (heading, body, cls = "event-section-header research") => "<html><body><main><h1>Event</h1><h2 class=\"" + cls + "\">" + heading + "</h2>" + body + "</main></body></html>";

test("the Leek Duck Leonids denial is recorded as explicitNone with its own status", () => {
  const f = extractFields(load("leekduck-leonids-no-research"));
  assert.equal(f.researchParse.status, "explicit-none");
  assert.equal(f.researchParse.explicitNone, true);
  assert.equal(f.researchTasks.length, 0);
  assert.equal(f.researchParse.sample, undefined);
});

for (const text of [
  "<strong>No Timed Research: </strong>There is no Timed Research during the Leonids.",
  "No research during this event.",
  "No special research with this event.",
  "No field research tasks.",
  "No Timed Research during the Leonids Minior Showers event",
  "There are no Field Research tasks for this event.",
  "There will be no timed research tasks.",
  "Timed Research: none"
]) {
  test("denial wording variant: " + text.slice(0, 40), () => {
    for (const heading of ["Research", "Timed Research", "Special Research"]) {
      const f = extractFields(page(heading, "<p>" + text + "</p>"));
      assert.equal(f.researchParse.explicitNone, true, heading);
      assert.equal(f.researchParse.status, "explicit-none");
    }
    assert.equal(extractFields(page("Research", "<ul><li>" + text + "</li></ul>")).researchParse.explicitNone, true);
  });
}

test("negatives: denial text outside a research section, as mid-sentence prose, or about requirements is not a denial", () => {
  assert.equal(extractFields(page("Bonuses", "<p>No Timed Research: not part of this section.</p>")).researchParse.explicitNone, undefined);
  assert.equal(extractFields(page("Research", "<p>Trainers should know there is no research required to join. Rewards follow.</p>")).researchParse.explicitNone, undefined);
  assert.equal(extractFields(page("Research", "<p>No special research is required to catch Minior.</p>")).researchParse.explicitNone, undefined);
  assert.equal(extractFields(page("Research", "<p>Details: there is no timed research this time.</p>")).researchParse.explicitNone, undefined);
});

test("P1-A: qualified or partial denials are not denials", () => {
  for (const text of [
    "No Timed Research during the first week.", "No Timed Research for ticket holders.", "No Timed Research until Saturday.",
    "No research tickets are required.", "No special research tasks yet.", "No Timed Research: There is no Timed Research during the first week of the event.",
    "No Timed Research, but Special Research is available.", "There is no Timed Research during the event and a bonus track follows.",
    "No Timed Research during the event. Special Research is on sale."
  ]) assert.equal(extractFields(page("Research", "<p>" + text + "</p>")).researchParse.explicitNone, undefined, text);
});

test("P1-A: a denial beside unparsed task cells or a task table keeps main's status", () => {
  const cells = "<div class=\"row\"><div>Claim Reward!</div><div>1 × Star Piece</div></div>";
  const mixed = extractFields(page("Timed Research", "<p>No Timed Research during the event.</p>" + cells));
  assert.equal(mixed.researchParse.status, "explicit-none", "bare cells with no Task header are not evidence by themselves");
  const withTable = extractFields("<main><h2>Timed Research</h2><p>No Timed Research.</p><table><tr><th>Task</th><th>Rewards</th></tr><tr><td>Catch 5</td><td>Mystery</td></tr></table></main>");
  assert.equal(withTable.researchParse.explicitNone, undefined);
  assert.equal(withTable.researchParse.status, "incomplete");
  const divHeader = extractFields("<main><h2>Timed Research</h2><p>No Timed Research.</p><div class=\"g\"><div>Task</div><div>Rewards</div></div><table><tr><td>Task</td><td>Rewards</td></tr></table></main>");
  assert.equal(divHeader.researchParse.explicitNone, undefined);
  assert.notEqual(divHeader.researchParse.status, "explicit-none");
});

test("P1-A: every research section must deny; a denial in a different sub-section does not speak for the event", () => {
  const two = extractFields("<main><h2>Special Research</h2><p>No Special Research.</p><h2>Timed Research</h2><p>Details to follow.</p></main>");
  assert.equal(two.researchParse.explicitNone, undefined);
  assert.equal(two.researchParse.status, "incomplete");
  const both = extractFields("<main><h2>Special Research</h2><p>No Special Research.</p><h2>Timed Research</h2><p>No Timed Research.</p></main>");
  assert.equal(both.researchParse.explicitNone, true);
  const later = extractFields("<main><h2>Research</h2><p>No Timed Research.</p><h2>Field Research</h2><table><tr><td>Task</td><td>Rewards</td></tr><tr><td>Claim Reward!</td><td>1 × Star Piece</td></tr></table></main>");
  assert.equal(later.researchParse.explicitNone, undefined);
  assert.equal(later.researchTasks.length, 1);
});

test("negative: tasks on the same page win; a denial beside a task table is not explicit", () => {
  const f = extractFields(page("Timed Research", "<p>No Timed Research: stale banner.</p><table><tr><td>Task</td><td>Rewards</td></tr><tr><td>Claim Reward!</td><td>1 × Star Piece</td></tr></table>"));
  assert.equal(f.researchTasks.length, 1);
  assert.equal(f.researchParse.status, "ok");
  assert.equal(f.researchParse.explicitNone, undefined);
  const g = extractFields(page("Timed Research", "<p>There is no Timed Research.</p><p>Task | Rewards</p>"));
  assert.equal(g.researchParse.explicitNone, undefined, "a task header means research is present");
});

test("negative: a truncated page never denies", () => {
  const cut = load("leekduck-leonids-no-research").replace("</article></main><footer>x</footer></body></html>", "");
  const f = extractFields(cut);
  assert.equal(f.researchParse.truncated, true);
  assert.equal(f.researchParse.status, "incomplete");
  assert.equal(f.researchParse.explicitNone, undefined);
});

// ---- retention ----
const LD = "https://leekduck.com/events/minior-showers-leonids-2026/", HUB = "https://pokemongohub.net/post/event/minior-showers-leonid-november-2026/";
const hubRef = { id: "hub", name: "Pokémon GO Hub", trust: "community", url: HUB }, duckRef = { id: "leekduck", name: "Leek Duck", trust: "community", url: LD };
const WINDOW = { start: "2026-11-14T17:00", end: "2026-11-19T23:59" };
const event = { id: "minior2", t: "Minior Showers: Leonids", start: WINDOW.start, end: WINDOW.end, detailIds: ["leekduck:minior-showers-leonids-2026", "hub:minior-showers-leonid-november-2026"], sourceUrl: LD };
const tasks = () => [
  { task: "Claim Reward!", category: "timed", rewards: [{ type: "item", name: "Star Piece", quantity: 1 }], occurrence: 1 },
  ...[1, 2, 3, 4, 5].map(n => ({ task: "Use a Star Piece", category: "timed", rewards: [{ type: "item", name: "Stardust", quantity: 7740 }], occurrence: n })),
  { task: "Claim Reward!", category: "research", rewards: [{ type: "item", name: "Star Piece", quantity: 1 }], occurrence: 1 },
  { task: "Use a Star Piece", category: "research", rewards: [{ type: "item", name: "Stardust", quantity: 774 }], occurrence: 1 }
].map(t => ({ ...t, eventId: "minior2", eventName: event.t, eventWindow: WINDOW, status: "single", sourceRefs: [hubRef], checkedAt: "2026-11-14" }));
const before = (extra = {}) => ({ minior2: { name: event.t, researchTasks: tasks(), ...extra } });
const blank = () => ({ minior2: { name: event.t, researchTasks: [] } });
const NOW = "2026-11-15T10:00:00.000Z";
const run = (results, { ev = event, old = before(), out = blank() } = {}) => {
  const report = [];
  const got = preserveUnfetchedResearchTasks(out, old, new Map([["minior2", { event: ev, results }]]), { now: NOW, report });
  return { got: got.minior2, report };
};
const res = (ref, html) => ({ source: ref, fields: extractFields(html) });
const duckDenies = () => res(duckRef, load("leekduck-leonids-no-research"));
const hubNone = () => res(hubRef, load("hub-leonids-no-tasks"));

test("explicit denial by the event's own page removes Hub-only research immediately, with report entry", () => {
  assert.equal(hubNone().fields.researchParse.status, "none");
  const { got, report } = run([hubNone(), duckDenies()]);
  assert.deepEqual(got.researchTasks, []);
  assert.equal(got.researchParseWarning, undefined);
  assert.equal(got.researchRetainedAt, undefined);
  assert.equal(report.length, 1);
  assert.deepEqual([report[0].id, report[0].oldTasks, report[0].retained, report[0].reason], ["minior2", 8, false, "source-denies"]);
  const duck = report[0].sources.find(s => s.url === LD);
  assert.deepEqual([duck.status, duck.explicitNone], ["explicit-none", true]);
});

test("a denial does not override a task source that was not read this run (outage is unknown, not removal)", () => {
  const { got, report } = run([duckDenies()]);
  assert.equal(got.researchTasks.length, 8);
  assert.equal(report[0].reason, "unfetched");
});

test("an Orionids-like event is unaffected: no denial means the usual 7-day wait", () => {
  const orionids = { id: "minior2", t: event.t, start: WINDOW.start, end: WINDOW.end, detailIds: ["leekduck:minior-showers-orionids-2026"] };
  const orionidsPage = res({ id: "leekduck", name: "Leek Duck", trust: "community", url: "https://leekduck.com/events/minior-showers-orionids-2026/" },
    page("Timed Research", "<p>Details to follow soon.</p>"));
  const { got, report } = run([hubNone(), orionidsPage], { ev: orionids });
  assert.equal(got.researchTasks.length, 8);
  assert.equal(report[0].retained, true);
  assert.notEqual(report[0].reason, "source-denies");
  const onlyHub = run([hubNone()]);
  assert.equal(onlyHub.got.researchTasks.length, 8);
  assert.equal(onlyHub.report[0].reason, "none-unconfirmed");
});

test("negative: a denial on a page that is not this event's own (multi-event page) does not remove", () => {
  const roundup = res({ id: "leekduck", name: "Leek Duck", trust: "community", url: "https://leekduck.com/events/meteor-showers-roundup-2026/" }, load("leekduck-leonids-no-research"));
  const { got, report } = run([hubNone(), roundup]);
  assert.equal(got.researchTasks.length, 8);
  assert.equal(report[0].reason, "none-unconfirmed");
  assert.equal(report[0].sources.find(s => /roundup/.test(s.url)).explicitNone, true);
});

test("negative: a truncated denying page does not remove", () => {
  const cut = res(duckRef, load("leekduck-leonids-no-research").replace("</article></main><footer>x</footer></body></html>", ""));
  const { got, report } = run([hubNone(), cut]);
  assert.equal(got.researchTasks.length, 8);
  assert.equal(report[0].reason, "none-unconfirmed", "the truncated page is not evidence either way");
  assert.equal(report[0].sources.find(s => s.url === LD).truncated, true);
});

test("negative: an unfetched, incomplete or non-denying-unreadable task source keeps the tasks", () => {
  assert.equal(run([duckDenies(), { source: hubRef, fields: { researchParse: { status: "incomplete" } } }]).got.researchTasks.length, 8, "Hub incomplete");
  assert.equal(run([duckDenies(), { source: hubRef }]).got.researchTasks.length, 8, "Hub fetched without diagnostic");
  const otherSource = before(); otherSource.minior2.researchTasks.forEach(t => { t.sourceRefs = [{ id: "serebii", url: "https://example.org/x/" }]; });
  assert.equal(run([duckDenies()], { old: otherSource }).got.researchTasks.length, 8, "task source not read this run");
});

test("negative: a different event name or window never removes by denial", () => {
  const renamed = blank(); renamed.minior2.name = "Another Event";
  const r = run([duckDenies()], { out: renamed });
  assert.equal(r.report[0].reason, "name-mismatch");
  const other = { ...event, start: "2026-12-11T17:00", end: "2026-12-16T23:59" };
  assert.equal(run([duckDenies()], { ev: other }).report[0].reason, "window-mismatch");
});

test("later run: a source that supplies tasks again republishes them, denial or not", () => {
  const out = blank(); out.minior2.researchTasks = tasks().slice(0, 2);
  const { got, report } = run([duckDenies()], { old: { minior2: { name: event.t, researchTasks: [] } }, out });
  assert.equal(got.researchTasks.length, 2);
  assert.equal(report.length, 0);
  // and the extractor reads the re-published Hub table again
  const f = extractFields(page("Minior Shower Timed Research (1/1)", "<table><tr><td>Task</td><td>Rewards</td></tr><tr><td>Claim Reward!</td><td>1 × Star Piece</td></tr></table>"));
  assert.equal(f.researchParse.status, "ok");
  assert.equal(f.researchParse.explicitNone, undefined);
});

test("P1-B: researchKeywords is computed on the fully read body", () => {
  assert.equal(hubNone().fields.researchParse.researchKeywords, false);
  assert.equal(extractFields("<main><div>Timed Research is described here</div></main>").researchParse.researchKeywords, true);
  assert.equal(extractFields("<main><div>Claim Task</div></main>").researchParse.researchKeywords, true);
  assert.equal(extractFields("<main><script>var a='Timed Research Task'</script><p>Bonuses</p></main>").researchParse.researchKeywords, false);
});

test("P1-B: a Hub 'none' that still shows research wording is a possible parser miss, so a denial cannot remove", () => {
  const miss = res(hubRef, '<html><body><main><h1>Minior Showers</h1><div class="x"><div>Minior Shower Timed Research (1/1)</div><div>Claim Reward!</div></div></main></body></html>');
  assert.equal(miss.fields.researchParse.researchKeywords, true);
  const { got, report } = run([miss, duckDenies()]);
  assert.equal(got.researchTasks.length, 8);
  assert.equal(report[0].reason, report[0].sources.find(s => s.url === HUB).status === "none" ? "none-unconfirmed" : "incomplete");
  assert.equal(report[0].sources.find(s => s.url === HUB).researchKeywords, undefined);
});

test("P1-B: a clean Hub 'none' plus the denial removes, and the report records the evidence", () => {
  const { got, report } = run([hubNone(), duckDenies()]);
  assert.equal(got.researchTasks.length, 0);
  assert.equal(report[0].reason, "source-denies");
  assert.equal(report[0].sources.find(s => s.url === HUB).researchKeywords, false);
  // and the persisted-7-day rule still works without any denial for a clean none
  const old = before({ researchRetainedAt: "2026-11-01T00:00:00Z" });
  assert.equal(run([hubNone()], { old }).report[0].reason, "removal-confirmed");
});

test("P1-B: a source that is ok but lists no tasks does not block a denial", () => {
  const okEmpty = { source: hubRef, fields: { researchParse: { status: "ok", parsedTasks: 0 } } };
  assert.equal(run([okEmpty, duckDenies()]).report[0].reason, "source-denies");
});
