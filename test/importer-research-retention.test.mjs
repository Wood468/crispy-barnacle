import test from "node:test";
import assert from "node:assert/strict";
import { extractFields } from "../scripts/importer/extract.mjs";
import { mergeSources } from "../scripts/importer/compare.mjs";
import { preserveUnfetchedResearchTasks } from "../scripts/importer/run.mjs";

const HUB = { id: "hub", name: "Hub", trust: "community", url: "https://hub.test/post/event/sample-showers/" };
const DUCK = { id: "leekduck", name: "Leek Duck", trust: "community", url: "https://duck.test/events/sample-showers/" };
const WINDOW = { start: "2026-11-14T17:00", end: "2026-11-19T23:59" };
const line = (text, t = "p") => ({ text, t });
const table = (rows, heading = "Field Research") => [line(heading, "h"), line("Task | Rewards"), ...rows.map(([a, b]) => line(a + " | " + b))];
const page = body => "<html><body><main><h1>Sample</h1>" + body + "</main></body></html>";
const gridHtml = page('<h2>Field Research</h2><div class="r"><div>Claim Reward!</div><div>1 × Star Piece</div></div>');

const stamp = (t, over = {}) => ({ ...t, eventId: "ev1", eventName: "Sample Showers", eventWindow: WINDOW, checkedAt: "2026-11-14", ...over });
const T = (task, qty, name, over = {}) => stamp({
  task, category: "research", rewards: [{ type: "item", name, quantity: qty }], occurrence: 1,
  sources: ["hub"], sourceRefs: [{ id: "hub", name: "Hub", trust: "community", url: HUB.url }], status: "single"
}, over);
const published = () => [T("Claim Reward!", 1, "Star Piece"), T("Use a Star Piece", 7740, "Stardust"), T("Claim Reward!", 3, "Star Piece", { category: "timed" })];
const before = (tasks = published(), extra = {}) => ({ ev1: { name: "Sample Showers", updated: "2026-11-14T00:00:00Z", researchTasks: tasks, ...extra } });
const blank = (name = "Sample Showers") => ({ ev1: { name, researchTasks: [] } });
const group = (results, win = WINDOW) => new Map([["ev1", { event: { id: "ev1", t: "Sample Showers", start: win.start, end: win.end }, results }]]);
const res = (source, html) => ({ source, fields: extractFields(html) });
const run = (out, old, g) => preserveUnfetchedResearchTasks(out, old, g).ev1;

test("(a) healthy extraction reports ok and the new tasks win", () => {
  const f = extractFields(table([["Claim Reward!", "1 × Star Piece"]]));
  assert.equal(f.researchParse.status, "ok");
  assert.equal(f.researchParse.parsedTasks, 1);
  const out = blank(); out.ev1.researchTasks = [{ task: "Changed task" }];
  assert.deepEqual(run(out, before(), group([{ source: HUB, fields: f }])).researchTasks, [{ task: "Changed task" }]);
});

test("(b) research heading but zero parsed rows keeps published tasks and warns", () => {
  const r = res(HUB, gridHtml);
  assert.equal(r.fields.researchParse.status, "incomplete");
  const got = run(blank(), before(), group([r]));
  assert.deepEqual(got.researchTasks, published());
  assert.match(got.researchParseWarning, /research/i);
  assert.equal(got.researchRetainedAt, "2026-11-14T00:00:00Z");
});

test("(c) truncated or malformed HTML is never proof that research was removed", () => {
  const cut = page("<h1>x</h1>").replace("</main></body></html>", "") + "<p>Details follow</p>";
  const r = res(HUB, cut);
  assert.equal(r.fields.researchParse.truncated, true);
  assert.equal(r.fields.researchParse.status, "incomplete");
  assert.deepEqual(run(blank(), before(), group([r])).researchTasks, published());
  const big = res(HUB, "<p>" + "x".repeat(900000));
  assert.equal(big.fields.researchParse.status, "incomplete");
});

test("(c2) a result with no diagnostic at all is treated as unknown and retained", () => {
  assert.deepEqual(run(blank(), before(), group([{ source: HUB }])).researchTasks, published());
  assert.deepEqual(run(blank(), before(), group([{ source: HUB, fields: {} }])).researchTasks, published());
});

test("(d) failed fetch or unfetched source keeps today's carry-forward", () => {
  const got = run(blank(), before(), group([res(DUCK, page("<h2>Bonuses</h2><ul><li>2× Catch XP all event</li></ul>"))]));
  assert.deepEqual(got.researchTasks, published());
  assert.equal(got.researchParseWarning, undefined, "no parse warning when the source simply was not fetched");
});

test("(e) verified healthy removal and replacement are allowed", () => {
  const healthy = res(HUB, page("<h2>Bonuses</h2><ul><li>2× Catch XP all event</li></ul>"));
  assert.equal(healthy.fields.researchParse.status, "none");
  const got = run(blank(), before(), group([healthy]));
  assert.deepEqual(got.researchTasks, []);
  assert.equal(got.researchParseWarning, undefined);
  const repl = blank(); repl.ev1.researchTasks = [{ task: "Other task" }];
  assert.deepEqual(run(repl, before(), group([res(HUB, "<p>x</p>")])).researchTasks, [{ task: "Other task" }]);
});

test("(f) other id, name or window never receives these tasks", () => {
  const g = group([res(HUB, gridHtml)]);
  assert.deepEqual(run(blank("Different Event"), before(), g).researchTasks, []);
  assert.deepEqual(run(blank(), before(), group([res(HUB, gridHtml)], { start: "2026-12-01T17:00", end: "2026-12-05T23:59" })).researchTasks, [], "changed window");
  assert.deepEqual(run(blank(), before(published().map(t => ({ ...t, eventId: "ev2" }))), g).researchTasks, [], "stamped for another id");
  assert.deepEqual(run(blank(), before(published().map(t => ({ ...t, eventName: "Sample Showers 2" }))), g).researchTasks, [], "stamped for another name");
  const mixed = [...published(), T("Foreign", 1, "Star Piece", { eventId: "ev2" })];
  assert.equal(run(blank(), before(mixed), g).researchTasks.length, 3);
  const none = { other: { name: "Sample Showers", researchTasks: published() } };
  assert.deepEqual(run(blank(), none, g).researchTasks, []);
});

test("(g) one healthy and one incomplete source: only the unproven source's tasks survive, bonus tracks and provenance intact", () => {
  const duckTask = T("Spin 5 PokéStops", 500, "Stardust", { sources: ["leekduck"], sourceRefs: [{ id: "leekduck", name: "Leek Duck", trust: "community", url: DUCK.url }] });
  const old = before([...published(), duckTask]);
  const healthyDuck = res(DUCK, page("<h2>Bonuses</h2><ul><li>2× Catch XP all event</li></ul>"));
  const got = run(blank(), old, group([healthyDuck, res(HUB, gridHtml)]));
  assert.deepEqual(got.researchTasks, published());
  assert.deepEqual(got.researchTasks.map(t => t.category), ["research", "research", "timed"]);
  assert.ok(got.researchTasks.every(t => t.sourceRefs.length === 1 && t.sourceRefs[0].id === "hub"));
  // duplicates in the stored snapshot are not multiplied
  const dup = run(blank(), before([...published(), ...published()]), group([res(HUB, gridHtml)]));
  assert.equal(dup.researchTasks.length, 3);
  // identical tasks corroborated by two sources stay single entries
  const both = published().map(t => ({ ...t, sources: ["hub", "leekduck"], sourceRefs: [...t.sourceRefs, { id: "leekduck", name: "Leek Duck", trust: "community", url: DUCK.url }] }));
  const b = run(blank(), before(both), group([healthyDuck, res(HUB, gridHtml)]));
  assert.equal(b.researchTasks.length, 3);
  assert.ok(b.researchTasks.every(t => t.sourceRefs.length === 2));
  // the merge step itself never sees the diagnostic
  const merged = mergeSources([res(HUB, gridHtml)]);
  assert.equal("researchParse" in merged.fields, false);
});

test("(h) extractFields health diagnostic cases", () => {
  const ok = extractFields(table([["Claim Reward!", "1 × Star Piece"], ["Use a Star Piece", "7740 × Stardust"]]));
  assert.deepEqual([ok.researchParse.status, ok.researchParse.parsedTasks, ok.researchParse.table], ["ok", 2, true]);
  const noRows = extractFields([line("Field Research", "h"), line("Task | Rewards")]);
  assert.equal(noRows.researchParse.status, "incomplete");
  assert.equal(noRows.researchParse.headings, 1);
  const unparsable = extractFields([line("Field Research", "h"), line("Task | Rewards"), line("Catch 5 Pokémon | Mystery reward")]);
  assert.equal(unparsable.researchParse.status, "incomplete");
  const headingOnly = extractFields([line("Timed Research", "h"), line("Details are coming soon for this event.")]);
  assert.equal(headingOnly.researchParse.status, "incomplete");
  const none = extractFields([line("Bonuses", "h"), line("2× Catch XP during the event")]);
  assert.deepEqual([none.researchParse.status, none.researchParse.headings, none.researchParse.candidateRows], ["none", 0, 0]);
  const rowsOutsideHeading = extractFields([line("Event details", "h"), line("Claim Reward! | 1 × Star Piece")]);
  assert.equal(rowsOutsideHeading.researchParse.status, "ok");
  assert.equal(extractFields([]).researchParse.status, "none");
  // the array fields are unchanged and the diagnostic is not an array field
  assert.deepEqual(extractFields([line("Bonuses", "h")]).researchTasks, []);
});
