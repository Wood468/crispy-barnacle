import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extractFields } from "../scripts/importer/extract.mjs";
import { htmlToLines } from "../scripts/importer/text.mjs";
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
  assert.deepEqual([...merged.researchTasks[0].sources].sort(), ["hub", "leekduck"]);
  assert.equal(merged.researchTasks[0].status, "corroborated");
});

test("Leek Duck-style nested reward blocks are parsed without guessing", () => {
  const html = `<main><h2>Field Research</h2><ul>
    <li>Catch 13 Ghost-type Pokémon <div>POSSIBLE REWARDS</div><div>Halloween Piplup Max CP 460 Min CP 426</div><div>Headband Noibat Max CP 285 Min CP 258</div></li>
    <li>Make 6 Nice Throws <div>POSSIBLE REWARDS</div><div>Pumpkaboo (Small) Max CP 515 Min CP 478</div></li>
  </ul></main>`;
  const fields = extractFields(htmlToLines(html));
  assert.equal(fields.researchTasks.length, 2);
  assert.deepEqual(fields.researchTasks[0].rewards, [
    { type: "encounter", name: "Halloween Piplup", quantity: 1, cpMin: 426, cpMax: 460 },
    { type: "encounter", name: "Headband Noibat", quantity: 1, cpMin: 258, cpMax: 285 }
  ]);
  assert.equal(fields.researchTasks[1].rewards[0].name, "Pumpkaboo (Small)");
});

test("page-level source references do not inflate independent-source corroboration", () => {
  const task = { category: "field", task: "Catch 13 Pokémon", rewards: [{ type: "item", name: "Potion", quantity: 1 }] };
  const fields = { researchTasks: [task] };
  const merged = mergeSources([
    { source: { id: "leekduck", name: "Leek Duck", trust: "community", url: "https://leekduck.com/events/part-one/" }, fields },
    { source: { id: "leekduck", name: "Leek Duck", trust: "community", url: "https://leekduck.com/events/part-two/" }, fields }
  ]);
  assert.equal(merged.researchTasks[0].status, "single");
  assert.deepEqual(merged.researchTasks[0].sources, ["leekduck"]);
  assert.deepEqual(merged.researchTasks[0].sourceRefs.map(source => source.url).sort(), [
    "https://leekduck.com/events/part-one/", "https://leekduck.com/events/part-two/"
  ]);
});

test("event and pass source associations are explicit and the central Research view is in Schedule", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../public/data.json", import.meta.url), "utf8"));
  const season = JSON.parse(fs.readFileSync(new URL("../public/season.json", import.meta.url), "utf8"));
  const details = JSON.parse(fs.readFileSync(new URL("../public/event-details.json", import.meta.url), "utf8"));
  const halloween = data.events.find(event => event.id === "halloween2");
  const pass = season.items.find(item => item.id === "season:pass-halloween");
  const novemberPass = season.items.find(item => item.id === "season:pass-november");
  const tasks = details.events["leekduck:halloween-2026-part-2"].researchTasks;
  const partOneTasks = details.events["leekduck:halloween-2026-part-1"].researchTasks;
  assert.ok(halloween.detailIds.includes("halloween2"));
  assert.ok(halloween.detailIds.includes("leekduck:halloween-2026-part-2"));
  assert.equal(pass.detailId, "leekduck:halloween-2026-part-2");
  assert.equal(novemberPass.detailId, "leekduck:go-pass-november-2026");
  assert.equal(tasks.length, 5);
  assert.ok(tasks.every(task => task.sourceRefs.some(source => source.url === "https://leekduck.com/events/halloween-2026-part-2/") &&
    task.sourceRefs.some(source => source.url === "https://pokemongohub.net/post/event/pokemon-go-halloween-2026-part-two/")));
  assert.deepEqual(partOneTasks.map(task => task.task).sort(), [
    "Catch 13 Ghost‑type Pokémon", "Make 6 Nice Throws", "Win 3 raids", "Win a raid"
  ].sort());
  assert.ok(partOneTasks.every(task => task.eventId === "halloween1" && task.status === "single" &&
    task.sourceRefs.length === 1 && task.sourceRefs[0].url === "https://leekduck.com/events/halloween-2026-part-1/"));
  assert.ok(!partOneTasks.some(task => task.task === "Catch 13 Pokémon"), "Part II's Sableye Energy task must not leak into Part I");
  assert.ok(partOneTasks.find(task => task.task === "Make 6 Nice Throws").rewards.some(reward => reward.name === "Pumpkaboo (Super)" && reward.cpMin === 498 && reward.cpMax === 536));
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
  assert.match(app, /window\.GOAPP = window\.GOAPP \|\| \{\}/);
  assert.match(app, /window\.GOAPP\.openResearch/);
  assert.match(html, /id="sub-research"/);
  assert.match(html, /research\.js\?v=/);
  assert.match(detail, /researchTasksHtml/);
  assert.match(detail, /sourceRefs/);
  assert.match(research, /sourceRefs/);
  assert.match(detail, /data-open-research/);
  assert.match(detail, /GOAPP\.openResearch/);
  assert.match(dash, /detailIds: x\.detailIds \|\| \[\]/);
  assert.match(research, /researchTasks/);
  assert.match(research, /eventWindow/);
  assert.match(research, /CURRENT DATE/);
  assert.match(research, /GODASH\.monArt/);
  assert.match(sw, /research\.js\?v=/);
});
