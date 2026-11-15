import test from "node:test";
import { readFileSync } from "node:fs";
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
// A fixed clock keeps every case independent of the real date (the sample event ends 2026-11-19).
const NOW = "2026-11-15T03:00:00.000Z";
const run = (out, old, g, opts = {}) => preserveUnfetchedResearchTasks(out, old, g, { now: NOW, ...opts }).ev1;
const DAY = 864e5;
const ago = days => new Date(Date.parse(NOW) - days * DAY).toISOString();
const noResearch = () => res(HUB, page("<h2>Bonuses</h2><ul><li>2× Catch XP all event</li></ul>"));

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
  // Contract change: the stamp is when retention BEGAN (this run), not the last publish time.
  assert.equal(got.researchRetainedAt, NOW);
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

test("(e) a fully read page with no research is UNKNOWN on first sight: retained, warned, retention start stamped now", () => {
  const healthy = noResearch();
  assert.equal(healthy.fields.researchParse.status, "none");
  const report = [];
  const got = run(blank(), before(), group([healthy]), { report });
  assert.deepEqual(got.researchTasks, published(), "absence of recognised research is not proof of removal");
  assert.match(got.researchParseWarning, /research/i);
  assert.equal(got.researchRetainedAt, NOW, "first-retained time, never the last publish time");
  assert.equal(report[0].reason, "none-unconfirmed");
  const repl = blank(); repl.ev1.researchTasks = [{ task: "Other task" }];
  assert.deepEqual(run(repl, before(), group([res(HUB, "<p>x</p>")])).researchTasks, [{ task: "Other task" }]);
});

test("(e2) absence that persists 7+ days after retention began is confirmed removal", () => {
  const report = [];
  const got = run(blank(), before(published(), { researchRetainedAt: ago(8) }), group([noResearch()]), { report });
  assert.deepEqual(got.researchTasks, []);
  assert.equal(got.researchParseWarning, undefined);
  assert.equal(report[0].reason, "removal-confirmed");
  assert.equal(report[0].retained, false);
  const exactly = run(blank(), before(published(), { researchRetainedAt: ago(7) }), group([noResearch()]));
  assert.deepEqual(exactly.researchTasks, [], "exactly 7 days counts");
});

test("(e3) under 7 days keeps the ORIGINAL retention start; a retained stamp is never reset to publish time", () => {
  const first = ago(3);
  const got = run(blank(), before(published(), { researchRetainedAt: first }), group([noResearch()]));
  assert.deepEqual(got.researchTasks, published());
  assert.equal(got.researchRetainedAt, first);
  // a stale prior stamp does not expire a source that is incomplete (unknown) or unfetched
  const old = before(published(), { researchRetainedAt: ago(30) });
  assert.deepEqual(run(blank(), old, group([res(HUB, gridHtml)])).researchTasks, published(), "incomplete never expires by time");
  const unfetched = run(blank(), old, group([res(DUCK, page("<p>x</p>"))]));
  assert.deepEqual(unfetched.researchTasks, published(), "unfetched never expires by time");
  assert.equal(unfetched.researchRetainedAt, ago(30), "an existing stamp survives an unfetched run");
  assert.equal(unfetched.researchParseWarning, undefined);
  // a truncated page is not a fully read page, even when it shows no research
  const cut = res(HUB, page("<h1>x</h1>").replace("</main></body></html>", "") + "<p>Details</p>");
  assert.deepEqual(run(blank(), old, group([cut])).researchTasks, published());
});

test("(e4) once the event has ended stale research is not carried, whatever the diagnostic", () => {
  const later = "2026-11-21T00:00:00.000Z";
  for (const r of [res(HUB, gridHtml), noResearch(), res(DUCK, page("<p>x</p>"))]) {
    const report = [];
    const got = run(blank(), before(), group([r]), { now: later, report });
    assert.deepEqual(got.researchTasks, []);
    assert.equal(report[0].reason, "event-ended");
    assert.equal(report[0].retained, false);
  }
  // the current event end alone is enough when tasks are unstamped
  const unstamped = published().map(({ eventWindow, ...t }) => t);
  assert.deepEqual(run(blank(), before(unstamped), group([res(HUB, gridHtml)]), { now: later }).researchTasks, []);
  // the last day itself is still the event
  assert.equal(run(blank(), before(), group([res(HUB, gridHtml)]), { now: "2026-11-19T22:00:00.000Z" }).researchTasks.length, 3);
});

test("(f2) window comparison uses calendar dates, not raw strings", () => {
  const g = group([res(HUB, gridHtml)]);
  const formats = [
    { start: "2026-11-14", end: "2026-11-19" },
    { start: "2026-11-14T17:00:00Z", end: "2026-11-19T23:59:59.000Z" },
    { start: "2026-11-14T00:00", end: undefined }
  ];
  for (const eventWindow of formats) assert.equal(run(blank(), before(published().map(t => ({ ...t, eventWindow }))), g).researchTasks.length, 3, JSON.stringify(eventWindow));
  const report = [];
  const other = { start: "2026-11-15", end: "2026-11-19" };
  assert.deepEqual(run(blank(), before(published().map(t => ({ ...t, eventWindow: other }))), g, { report }).researchTasks, []);
  assert.equal(report[0].reason, "window-mismatch");
  assert.equal(run(blank(), before(published().map(t => ({ ...t, eventWindow: { start: "2026-11-14T17:00", end: "2026-11-20" } }))), g).researchTasks.length, 0);
});

test("(n) report entries carry the reason and per-source diagnostics", () => {
  const report = [];
  run(blank(), before(), group([res(HUB, gridHtml), noResearch(), res(DUCK, page("<p>x</p>"))].map((r, i) => i === 1 ? { ...r, source: { ...HUB, url: "https://hub.test/other/" } } : r)), { report });
  assert.equal(report.length, 1);
  const [e] = report;
  assert.deepEqual([e.id, e.name, e.oldTasks, e.retained, e.reason], ["ev1", "Sample Showers", 3, true, "incomplete"]);
  assert.deepEqual(e.sources.map(s => s.status), ["incomplete", "none", "none"]);
  assert.deepEqual(Object.keys(e.sources[0]).sort(), ["candidateRows", "headings", "status", "table", "truncated", "url"]);
  assert.equal(e.sources[0].url, HUB.url);
  assert.equal(e.sources[0].headings, 1);
  const un = []; run(blank(), before(), group([{ source: HUB }]), { report: un });
  assert.equal(un[0].reason, "incomplete"); assert.equal(un[0].sources[0].status, null);
  const gone = []; run(blank(), before(), group([res(DUCK, page("<p>x</p>"))]), { report: gone });
  assert.equal(gone[0].reason, "unfetched");
  const nm = []; run(blank("Different Event"), before(), group([res(HUB, gridHtml)]), { report: nm });
  assert.deepEqual([nm[0].reason, nm[0].retained], ["name-mismatch", false]);
  // no entry when new research exists or there was nothing to carry
  const none = []; const fresh = blank(); fresh.ev1.researchTasks = [{ task: "x" }];
  run(fresh, before(), group([res(HUB, gridHtml)]), { report: none }); run(blank(), before([]), group([res(HUB, gridHtml)]), { report: none });
  assert.equal(none.length, 0);
});

test("(o) research in an unrecognised Hub structure is retained end-to-end, then removed only after it persists", () => {
  // Headings renamed and rows rendered as divs: nothing the parser recognises.
  const odd = page('<section class="quests"><div class="qh">Quest board</div><div class="q"><span>Claim Reward!</span><span>1 × Star Piece</span></div></section>');
  const r = res(HUB, odd);
  assert.equal(r.fields.researchTasks.length, 0);
  assert.equal(r.fields.researchParse.status, "none", "the parser genuinely cannot tell this from a page without research");
  const LONG = { start: "2026-11-14T17:00", end: "2026-12-31T23:59" };
  const old = before(published().map(t => ({ ...t, eventWindow: LONG })));
  const first = run(blank(), old, group([r], LONG));
  assert.equal(first.researchTasks.length, 3);
  assert.equal(first.researchRetainedAt, NOW);
  // the next daily runs feed the stamped record back in as `old`
  const stamped = { ev1: { ...old.ev1, researchRetainedAt: first.researchRetainedAt } };
  const at = days => new Date(Date.parse(NOW) + days * DAY).toISOString();
  assert.equal(run(blank(), stamped, group([res(HUB, odd)], LONG), { now: at(6) }).researchTasks.length, 3);
  const report = [];
  assert.deepEqual(run(blank(), stamped, group([res(HUB, odd)], LONG), { now: at(7), report }).researchTasks, []);
  assert.equal(report[0].reason, "removal-confirmed");
});
