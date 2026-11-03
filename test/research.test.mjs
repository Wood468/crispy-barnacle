import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extractFields } from "../scripts/importer/extract.mjs";
import { mergeSources } from "../scripts/importer/compare.mjs";

const sample = `<main>
<h2>Field Research</h2>
<table>
<tr><td>Catch 13 Ghost-type Pokémon</td><td>POSSIBLE REWARDS Halloween Costume Rowlet Max CP 453 Min CP 418 Greavard Max CP 435 Min CP 402</td></tr>
<tr><td>Catch 13 Pokémon</td><td>REWARD ×13 Sableye Mega Energy ×13</td></tr>
<tr><td>Task</td><td>Possible reward</td></tr>
</table>
<h2>Timed Research</h2>
<p>There will be a free Timed Research opportunity available.</p>
<p>Claim all rewards before Thursday, November 5, 2026, at 8:00 p.m. local time.</p>
<p>Complete 3 Field Research tasks REWARD before the claim deadline.</p>
</main>`;

test("research parser extracts explicit encounter CP bounds and item quantities only", () => {
  const fields = extractFields(sample);
  assert.equal(fields.researchTasks.length, 2);
  assert.equal(fields.researchTasks[0].category, "field");
  assert.equal(fields.researchTasks[0].task, "Catch 13 Ghost-type Pokémon");
  assert.deepEqual(fields.researchTasks[0].rewards, [
    { type: "encounter", name: "Halloween Costume Rowlet", quantity: 1, cpMin: 418, cpMax: 453 },
    { type: "encounter", name: "Greavard", quantity: 1, cpMin: 402, cpMax: 435 }
  ]);
  assert.equal(fields.researchTasks[1].task, "Catch 13 Pokémon");
  assert.deepEqual(fields.researchTasks[1].rewards, [
    { type: "item", name: "Sableye Mega Energy", quantity: 13 }
  ]);
  assert.ok(fields.research.some(line => /free Timed Research opportunity/.test(line)), "unparsed research prose remains available");
});

test("structured research merges exact tasks while retaining official/community provenance", () => {
  const fields = extractFields(sample);
  const merged = mergeSources([
    { source: { id: "leekduck", trust: "community" }, fields },
    { source: { id: "hub", trust: "community" }, fields }
  ]);
  assert.equal(merged.researchTasks.length, 2);
  assert.deepEqual(merged.researchTasks[0].sources, ["leekduck", "hub"]);
  assert.equal(merged.researchTasks[0].status, "corroborated");
});

test("event and pass source associations are explicit and the central Research view is in Schedule", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../public/data.json", import.meta.url), "utf8"));
  const season = JSON.parse(fs.readFileSync(new URL("../public/season.json", import.meta.url), "utf8"));
  const details = JSON.parse(fs.readFileSync(new URL("../public/event-details.json", import.meta.url), "utf8"));
  const halloween = data.events.find(event => event.id === "halloween2");
  const pass = season.items.find(item => item.id === "season:pass-halloween");
  const novemberPass = season.items.find(item => item.id === "season:pass-november");
  const tasks = details.events["leekduck:halloween-2026-part-2"].researchTasks;
  assert.ok(halloween.detailIds.includes("halloween2"));
  assert.ok(halloween.detailIds.includes("leekduck:halloween-2026-part-2"));
  assert.equal(pass.detailId, "leekduck:halloween-2026-part-2");
  assert.equal(novemberPass.detailId, "leekduck:go-pass-november-2026");
  assert.equal(tasks.length, 5);
  assert.ok(tasks.every(task => task.category === "field" && task.eventId === "halloween2"));
  assert.equal(tasks[0].eventWindow.end, "2026-11-05T20:00");
  assert.ok(tasks.every(task => task.sources.includes("leekduck") && task.sources.includes("hub")));
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const detail = fs.readFileSync(new URL("../public/detail.js", import.meta.url), "utf8");
  const research = fs.readFileSync(new URL("../public/research.js", import.meta.url), "utf8");
  const dash = fs.readFileSync(new URL("../public/dash.js", import.meta.url), "utf8");
  const sw = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(app, /\['research','Research','sub-research'\]/);
  assert.match(app, /openResearch/);
  assert.match(html, /id="sub-research"/);
  assert.match(html, /research\.js\?v=/);
  assert.match(detail, /researchTasksHtml/);
  assert.match(detail, /data-open-research/);
  assert.match(detail, /GOAPP\.openResearch/);
  assert.match(dash, /detailIds: x\.detailIds \|\| \[\]/);
  assert.match(research, /researchTasks/);
  assert.match(research, /eventWindow/);
  assert.match(sw, /research\.js\?v=/);
});
