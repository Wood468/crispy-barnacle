import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { similar, mergeSources } from "../scripts/importer/compare.mjs";
import { extractFields } from "../scripts/importer/extract.mjs";

const require = createRequire(import.meta.url);
const C = require("../public/event-contract.js");
const V = require("../public/event-view.js");
const UI = require("../public/event-components.js");
const ev = (extra = {}) => C.normalize({ schemaVersion: 1, eventId: "fixture", title: "Synthetic announcement", ...extra });
const text = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const tasks = n => Array.from({ length: n }, (_, i) => ({ task: "Catch " + (i + 1) + " Pokémon", category: "field", rewards: [{ type: "item", name: "Stardust", quantity: 100 }] }));
const lines = k => Array.from({ length: k }, (_, i) => ({ text: "Source prose line number " + (i + 1) + " about research", sources: ["leekduck"], status: "single" }));

test("research count is parsed tasks, not source lines, and agrees on chip, header, nav and DOM", () => {
  const m = ev({ research: [...tasks(12), ...lines(7)] });
  assert.equal(V.researchTaskCount(m.research), 12);
  assert.equal(V.project(m).researchTasks, 12);
  const html = UI.render(m, {});
  assert.equal((html.match(/<article class="research-task"/g) || []).length, 12, "only parsed tasks render as task rows");
  assert.match(text(html), /Research 12 .*Research 12 tasks/, "nav count then section header agree");
  assert.doesNotMatch(text(html), /19|Research 26/);
});

test("zero parsed tasks gives an honest empty state instead of a count of source lines", () => {
  const m = ev({ research: lines(3) });
  assert.equal(V.researchTaskCount(m.research), 0);
  const html = UI.render(m, {});
  assert.match(html, /no tasks listed yet/);
  assert.match(html, /No individual research tasks have been published yet/);
  assert.equal((html.match(/<article class="research-task"/g) || []).length, 0);
});

test("GO Pass header separates published entries from the highest rank without inventing rewards", () => {
  const stages = [...Array.from({ length: 99 }, (_, i) => i + 1), 100, 101, 600].map(r => ({ rank: r, free: ["Stardust ×" + r], deluxe: ["Stardust ×" + r * 2] }));
  const html = UI.render(ev({ family: "go-pass", passes: [{ title: "GO Pass rewards", stages }] }), {});
  assert.match(text(html), /102 ranks with published entries · through Rank 600/);
  assert.doesNotMatch(text(html), /102 of 600 ranks listed/);
  assert.equal((html.match(/<li class="ue-pass-rank" data-rank="/g) || []).length, 102, "all 102 source rank entries remain available");
  assert.doesNotMatch(html, /<details class="ue-pass-range" open/, "rank groups start collapsed");
});

test("importer: a structured Rank 100 row is never merged into a prose sentence that shares its words", () => {
  const prose = "Encounter Dynamax Meltan and earn a Silver Bottle Cap!";
  const row = "Rank 100: Free: Dynamax Meltan | Deluxe: 1× Silver Bottle Cap";
  assert.equal(similar(prose, row), false);
  assert.equal(similar(row, prose), false);
  const out = mergeSources([{ source: { id: "official", trust: "official" }, fields: { tickets: [prose] } }, { source: { id: "leekduck", trust: "community" }, fields: { tickets: [row, "Rank 99: Free: 5 × Meltan Candy | Deluxe: Dynamax Meltan"] } }]);
  const texts = out.fields.tickets.map(x => x.text);
  assert.ok(texts.includes(row), "Rank 100 survives the merge");
  assert.ok(texts.includes(prose));
});

test("importer extract keeps every table row 99, 100, 101 and 600 of the GO Pass table", () => {
  const rows = [{ t: "h", text: "GO Pass rank rewards" }, ...[99, 100, 101, 600].map(n => ({ t: "p", text: n + " | Reward A" + n + " item | Reward B" + n + " item" }))];
  const f = extractFields(rows);
  for (const n of [99, 100, 101, 600]) assert.ok(f.tickets.some(x => x.startsWith("Rank " + n + ":")), "rank " + n);
});
