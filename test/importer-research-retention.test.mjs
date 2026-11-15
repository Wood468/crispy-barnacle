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

test("(g) tasks cited only by the incomplete source survive; bonus-track categories, occurrences, provenance kept and no duplicates", () => {
  const duckTask = T("Spin 5 PokéStops", 500, "Stardust", { sources: ["leekduck"], sourceRefs: [{ id: "leekduck", name: "Leek Duck", trust: "community", url: DUCK.url }] });
  const healthyDuck = res(DUCK, page("<h2>Bonuses</h2><ul><li>2× Catch XP all event</li></ul>"));
  // Contract change: a "none" source is unknown on first sight, so its task is retained too...
  assert.equal(run(blank(), before([...published(), duckTask]), group([healthyDuck, res(HUB, gridHtml)])).researchTasks.length, 4);
  // ...and only once that absence has persisted 7+ days is the Duck-only task dropped.
  const old = before([...published(), duckTask], { researchRetainedAt: ago(8) });
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

test("(i) a partially parsed research table is incomplete, not ok", () => {
  const mixed = extractFields(table([["Claim Reward!", "1 × Star Piece"], ["Use a Star Piece", "Mystery reward"]]));
  assert.equal(mixed.researchParse.parsedTasks, 1);
  assert.equal(mixed.researchParse.status, "incomplete");
  assert.deepEqual(run(blank(), before(), group([{ source: HUB, fields: mixed }])).researchTasks.length, 3, "unparsed published tasks survive only via retention when merged is empty");
});

test("(i2) legitimately repeated identical task rows still count as ok", () => {
  const five = extractFields(table(Array.from({ length: 5 }, () => ["Use a Star Piece", "7740 × Stardust"])));
  assert.equal(five.researchParse.status, "ok");
  assert.equal(five.researchTasks.length, 5);
});

test("(j) task-like prose outside a research section does not make a page incomplete", () => {
  const f = extractFields([line("Park visit", "h"), line("Walk 2 km to earn a reward at the park.")]);
  assert.equal(f.researchParse.status, "none");
  assert.equal(f.researchParse.candidateRows, 0);
  const inside = extractFields([line("Field Research", "h"), line("Walk 2 km to earn a reward at the park.")]);
  assert.equal(inside.researchParse.status, "incomplete");
});

test("(k) the page cap mirrored in extract.mjs still matches discover.mjs", () => {
  assert.match(readFileSync(new URL("../scripts/importer/discover.mjs", import.meta.url), "utf8"), /slice\(0,\s*900000\)/);
});

test("(l) truncation heuristic: </html> proves completeness, a mid-table cut does not", () => {
  const noBodyClose = "<html><body><main><h2>Bonuses</h2><ul><li>2× Catch XP all event</li></ul></main></html>";
  const f = extractFields(noBodyClose);
  assert.equal(f.researchParse.truncated, false);
  assert.equal(f.researchParse.status, "none");
  const cut = "<html><body><main><h2>Field Research</h2><table><tr><td>Task</td><td>Rewards</td></tr><tr><td>Claim Rew";
  assert.equal(extractFields(cut).researchParse.truncated, true);
  assert.equal(extractFields(cut).researchParse.status, "incomplete");
});

test("(m) an unfetched source plus another source with only bonuses retains without a parse warning", () => {
  const got = run(blank(), before(), group([res(DUCK, page("<h2>Bonuses</h2><ul><li>2× Catch XP all event</li></ul>"))]));
  assert.equal(got.researchTasks.length, 3);
  assert.equal(got.researchParseWarning, undefined);
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

test("(p) id-stamped-for-another-event is name-mismatch; one task cited by two sources is carried once", () => {
  const report = [];
  assert.deepEqual(run(blank(), before(published().map(t => ({ ...t, eventId: "ev2" }))), group([res(HUB, gridHtml)]), { report }).researchTasks, []);
  assert.equal(report[0].reason, "name-mismatch");
  const both = published().map(t => ({ ...t, sourceRefs: [...t.sourceRefs, { id: "leekduck", name: "Leek Duck", trust: "community", url: DUCK.url }] }));
  const got = run(blank(), before([...both, ...both]), group([res(HUB, gridHtml), res(DUCK, gridHtml)]));
  assert.equal(got.researchTasks.length, 3);
});

test("(q) malformed old task entries are ignored, never thrown on", () => {
  const messy = [null, undefined, 7, "x", [], ...published()];
  const got = run(blank(), before(messy), group([res(HUB, gridHtml)]));
  assert.deepEqual(got.researchTasks, published());
  assert.equal(run(blank(), before([null, "x"]), group([res(HUB, gridHtml)])).researchTasks.length, 0);
});

test("(r) a fully parsed source that no longer lists the task reports source-ok-removed, not removal-confirmed", () => {
  const report = [];
  const ok = { source: HUB, fields: { researchParse: { status: "ok", truncated: false } } };
  assert.deepEqual(run(blank(), before(), group([ok]), { report }).researchTasks, []);
  assert.equal(report[0].reason, "source-ok-removed");
});

test("(s) the public warning is neutral and accurate for both incomplete and fully-read none pages", () => {
  for (const r of [res(HUB, gridHtml), noResearch()]) {
    const w = run(blank(), before(), group([r])).researchParseWarning;
    assert.match(w, /could not be confirmed/i);
    assert.doesNotMatch(w, /parsing was incomplete/i);
  }
});

test("(t) known risk: an ongoing event with end \"\" never trips event-ended, so incomplete research is retained with no time ceiling", () => {
  const open = { start: "2026-11-14T17:00", end: "" };
  const stale = before(published().map(({ eventWindow, ...t }) => t), { researchRetainedAt: ago(400) });
  assert.equal(run(blank(), stale, group([res(HUB, gridHtml)], open), { now: "2027-06-01T00:00:00.000Z" }).researchTasks.length, 3, "retained, no time expiry (documented behaviour, not an approved policy)");
});
