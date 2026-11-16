// Tolerant GO Hub research parsing: the live page produced researchParse "none" under the markup we had assumed.
// Each fixture is a plausible variant of the real markup; all but the negatives must give the same eight tasks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractFields } from "../scripts/importer/extract.mjs";
import { htmlToLines } from "../scripts/importer/text.mjs";

const load = name => readFileSync(new URL("./fixtures/hub-research/" + name + ".html", import.meta.url), "utf8");
const shape = f => f.researchTasks.map(t => [t.category, t.task, t.rewards.map(r => r.quantity + " " + r.name).join("+"), t.occurrence].join("|"));
// "Bonus Timed Research" matches the Bonuses heading rule first, so that track is category "research" (as in published data).
// This is the first pass's existing behaviour; the tolerant pass reproduces it so a markup change does not churn categories.
const EXPECT = [
  "timed|Claim Reward!|1 Star Piece|1",
  ...[1, 2, 3, 4, 5].map(n => "timed|Use a Star Piece|7740 Stardust|" + n),
  "research|Claim Reward!|1 Star Piece|1",
  "research|Use a Star Piece|774 Stardust|1"
];

// Variants the first pass cannot read at all (no tr table): only the tolerant pass yields tasks, with the expected tracks.
for (const name of ["wp-block-table-thead", "div-grid-strong-heading", "ul-li-strong-heading"]) {
  test("tolerant research parse: " + name + " yields eight tasks across both tracks", () => {
    const f = extractFields(load(name));
    assert.equal(f.researchTasks.length, 8, JSON.stringify(f.researchParse));
    assert.deepEqual(shape(f), EXPECT);
    assert.equal(f.researchParse.status, "ok");
    assert.equal(f.researchParse.parsedTasks, 8);
    assert.equal(f.researchParse.sample, undefined, "no sample when parsing succeeded");
    assert.equal(f.researchParse.via, name === "wp-block-table-thead" ? undefined : "tolerant");
    assert.ok(!f.researchTasks.some(t => /^rewards?$/i.test(t.task)), "totals are not tasks");
    assert.ok(f.researchTasks.every(t => t.rewards.every(r => r.type === "item")));
  });
}

for (const name of ["negative-bonus-list-only", "negative-unrelated-table"]) {
  test("no false positives: " + name, () => {
    const f = extractFields(load(name));
    assert.equal(f.researchTasks.length, 0);
    assert.notEqual(f.researchParse.status, "ok");
    assert.equal(f.researchParse.via, undefined);
  });
}

test("bonus-list page without research keeps status none and records no sample", () => {
  const f = extractFields("<main><h2>Event Bonuses</h2><ul><li>2× Catch XP during the event</li><li>Use a Lure Module for 3× Stardust</li></ul></main>");
  assert.equal(f.researchParse.status, "none");
  assert.equal(f.researchParse.sample, undefined);
});

test("the first pass is unchanged for markup it already understands", () => {
  const f = extractFields("<main><h2>Timed Research</h2><table><tr><td>Task</td><td>Rewards</td></tr><tr><td>Claim Reward!</td><td>1 × Star Piece</td></tr></table></main>");
  assert.equal(f.researchParse.status, "ok");
  assert.equal(f.researchParse.via, undefined);
  assert.equal(f.researchTasks.length, 1);
});

test("div rows without a Task/Rewards header or table stay unparsed (retention contract)", () => {
  const f = extractFields('<main><h2>Field Research</h2><div class="r"><div>Claim Reward!</div><div>1 × Star Piece</div></div></main>');
  assert.equal(f.researchTasks.length, 0);
  assert.equal(f.researchParse.status, "incomplete");
});

test("diagnostic sample: bounded, structure-only, present for none/incomplete pages that mention the keywords", () => {
  const html = '<html><body><script>var secret="Timed Research token=abc123";</script><main><div class="post-content" data-token="SECRET" id="c1" onclick="x()"><section class="rs-block"><span class="rs-title">Minior Shower Timed Research (1/1)</span>' +
    '<div class="rs-row"><img src="https://x.test/a.png?sig=SECRET" alt="Star Piece"><b>Claim Reward!</b></div>'.repeat(40) + "</section></div></main></body></html>";
  const f = extractFields(html);
  assert.equal(f.researchParse.status, "none", "an unrecognised layout is exactly the live-page symptom");
  const s = f.researchParse.sample;
  assert.equal(typeof s, "string");
  assert.ok(s.length <= 600);
  assert.match(s, /Timed Research/);
  assert.match(s, /<div class="post-content" id="c1">|<section class="rs-block">/);
  assert.match(s, /alt="Star Piece"/);
  assert.doesNotMatch(s, /SECRET|abc123|onclick|data-token|src=|https?:/);
});

test("diagnostic sample: a 'Task' mention alone is enough, and a keyword-free page has none", () => {
  const withTask = extractFields("<main><h2>Raids</h2><div class='grid'><div class='cell'>Task</div><div class='cell'>Rewards</div></div></main>");
  assert.equal(withTask.researchParse.status, "none");
  assert.match(withTask.researchParse.sample, /<div class="cell">Task/);
  assert.equal(extractFields("<main><h2>Raids</h2><p>Mewtwo returns.</p></main>").researchParse.sample, undefined);
});

test("importer-report retention entry carries the bounded sample for a source that read as none", async () => {
  const { preserveUnfetchedResearchTasks } = await import("../scripts/importer/run.mjs");
  const hub = { id: "hub", url: "https://pokemongohub.net/post/event/minior-showers-leonid-november-2026/" };
  const fields = extractFields("<main><div class='x'><div>Minior Timed Research (1/1)</div><div class='cell'>Task</div></div></main>");
  const task = { task: "Use a Star Piece", category: "timed", rewards: [{ name: "Stardust", quantity: 7740 }], sourceRefs: [hub], checkedAt: "2026-11-11" };
  const report = [];
  preserveUnfetchedResearchTasks({ m: { name: "M", researchTasks: [] } }, { m: { name: "M", researchTasks: [task] } },
    new Map([["m", { results: [{ source: hub, fields }] }]]), { now: "2026-11-15T00:00:00Z", report });
  const s = report[0].sources[0];
  assert.ok(["none", "incomplete"].includes(s.status));
  assert.equal(typeof s.sample, "string");
  assert.ok(s.sample.length <= 600);
});

// Variants whose tr tables the first pass already reads "ok": the tolerant pass must not run, so output is exactly the first pass's.
for (const name of ["table-no-thead-h5", "bare-div-heading-rows-in-one-cell"]) {
  test("first-pass ok is final, never re-keyed: " + name, () => {
    const f = extractFields(load(name));
    assert.equal(f.researchParse.status, "ok");
    assert.equal(f.researchParse.via, undefined);
    assert.equal(f.researchTasks.length, 8);
    // byte-identical to the first-pass reading of the same page
    const lines = htmlToLines(load(name));
    assert.equal(JSON.stringify(f.researchTasks), JSON.stringify(extractFields(lines).researchTasks));
  });
}

test("minior/minior2 shape: 6 timed + 2 research, occurrences kept (first-pass ok page)", () => {
  const f = extractFields(load("wp-block-table-thead"));
  assert.deepEqual(f.researchTasks.map(t => t.category), [...Array(6).fill("timed"), "research", "research"]);
  assert.deepEqual(f.researchTasks.map(t => t.occurrence), [1, 1, 2, 3, 4, 5, 1, 1]);
});

test("a tolerant result that would drop or re-key a first-pass task is not adopted", () => {
  // First pass reads one tr row; the research heading is an h5 only the tolerant pass sees, which would re-categorise it.
  const html = "<main><h5>Minior Timed Research (1/1)</h5><table><tr><td>Task</td><td>Rewards</td></tr><tr><td>Claim Reward!</td><td>1 × Star Piece</td></tr><tr><td>Catch 3 Pokémon</td><td>Mystery reward</td></tr></table></main>";
  const first = extractFields(htmlToLines(html));
  const f = extractFields(html);
  assert.equal(f.researchParse.status, "incomplete");
  assert.equal(f.researchParse.via, undefined);
  assert.equal(JSON.stringify(f.researchTasks), JSON.stringify(first.researchTasks));
});

test("phantom tasks: sentences and bonus bullets under a research-labelled heading yield nothing", () => {
  const html = '<main><h3>Minior Shower Timed Research (1/1)</h3><ul><li>Catch 3× more Pokémon during the event</li><li>Use a Lure Module for 3× Stardust</li>' +
    '<li>Complete all tasks to earn 1× Star Piece</li><li><span>Complete all tasks</span> <span>1× Star Piece</span></li><li>Rewards 77,400× Stardust</li><li>Rewards: 1000000× Stardust</li></ul>' +
    '<p>Complete all tasks to earn 1× Star Piece</p><h4>Quest ideas and task tips</h4><ul><li>Spin 5 PokéStops <span>2× Stardust</span></li></ul></main>';
  const f = extractFields(html);
  assert.equal(f.researchTasks.length, 0, JSON.stringify(f.researchTasks));
  assert.notEqual(f.researchParse.status, "ok");
});

test("headings that merely contain task/quest do not open a research section", () => {
  const f = extractFields('<main><h3>Quest ideas</h3><div class="g"><div>Task</div><div>Rewards</div></div><div class="g"><div>Use a Star Piece</div><div>7740× Stardust</div></div></main>');
  assert.equal(f.researchTasks.length, 0);
});

test("robustness: huge or very deep pages never throw and keep the first-pass result", () => {
  const rows = "<tr><td>Claim Reward!</td><td>1 × Star Piece</td></tr>";
  const deep = "<div>".repeat(5000) + "Timed Research Task" + "</div>".repeat(5000);
  const f1 = extractFields("<main><h2>Timed Research</h2><table><tr><td>Task</td><td>Rewards</td></tr>" + rows + "</table></main>" + deep);
  assert.equal(f1.researchTasks.length, 1);
  assert.equal(f1.researchParse.status, "ok", "first-pass ok is not touched by the tolerant pass");
  const huge = "<main><h5>Minior Timed Research (1/1)</h5>" + "<span>x</span>".repeat(70000) + "</main>";
  const f2 = extractFields(huge);
  assert.equal(f2.researchTasks.length, 0);
  assert.equal(f2.researchParse.tolerantError, true);
  const f3 = extractFields("<main><h2>Timed Research</h2><p>Details soon</p></main>" + deep);
  assert.equal(f3.researchParse.status, "incomplete");
  assert.equal(f3.researchParse.tolerantError, true);
  assert.ok(f3.researchParse.sample.length <= 600);
});

test("sample drops raw text after an unclosed script or style", () => {
  const f = extractFields('<main><p>Timed Research</p><style>.x{color:red} SECRETSTYLE <p>Task');
  assert.doesNotMatch(f.researchParse.sample || "", /SECRETSTYLE|color/);
  const g = extractFields('<main><div class="a">Timed Research</div><script>var token="SECRETJS"; Task');
  assert.doesNotMatch(g.researchParse.sample || "", /SECRETJS/);
  assert.match(g.researchParse.sample, /Timed Research/);
});
