// Dynamax Trails (Nov 2026): the same task showed twice (Leek Duck's clean reward row plus Pokémon GO Hub's mangled one), a "+3" chip
// was glued onto "Grookey", GO Pass prose was filed as a research task, and "Unlock a Max Move" was never parsed.
import test from "node:test";
import assert from "node:assert/strict";
import { extractFields } from "../scripts/importer/extract.mjs";
import { mergeSources } from "../scripts/importer/compare.mjs";

const LEEK = { id: "leekduck", name: "Leek Duck", trust: "community", url: "https://leekduck.com/events/dynamax-trails-2026/" };
const HUB = { id: "hub", name: "Pokémon GO Hub", trust: "community", url: "https://pokemongohub.net/post/event/dynamax-trails-eternatus-returns/" };
const item = (name, quantity) => ({ type: "item", name, quantity });
const field = (task, rewards, occurrence = 1) => ({ task, category: "field", rewards, occurrence });
const merge = (leek, hub) => mergeSources([{ source: LEEK, fields: { researchTasks: leek } }, { source: HUB, fields: { researchTasks: hub } }]);

test("a mangled Hub reward for a task Leek Duck already lists is a conflict on that task, not a second task", () => {
  const out = merge(
    [field("Make an Excellent Throw", [item("Eternatus Candy", 25), item("Golden Razz Berry", 1), item("Silver Pinap Berry", 1)]),
     field("Win a Max Battle", [{ type: "encounter", name: "Drampa", quantity: 1, cpMin: 1191, cpMax: 1249 }, item("Eternatus Candy", 10), item("Stardust", 2000)])],
    [field("Make an Excellent Throw", [item("Eternatus Candy 1 × Silver Pinap Berry", 10)]),
     field("Win a Max Battle", [item("Eternatus Candy 2000 × Stardust Duraludon Drampa", 10)])]);
  assert.deepEqual(out.researchTasks.map(t => t.task), ["Make an Excellent Throw", "Win a Max Battle"]);
  const throwTask = out.researchTasks[0];
  assert.deepEqual(throwTask.rewards.map(r => r.quantity + " " + r.name), ["25 Eternatus Candy", "1 Golden Razz Berry", "1 Silver Pinap Berry"], "the higher-ranked row's rewards are kept");
  assert.deepEqual(throwTask.sources, ["leekduck"], "a disagreeing source is not counted as corroboration");
  assert.equal(throwTask.status, "single");
  assert.equal(throwTask.rewardConflicts.length, 1);
  assert.equal(throwTask.rewardConflicts[0].source.id, "hub");
  assert.equal(throwTask.rewardConflicts[0].rewards[0].quantity, 10);
});

test("a clean disagreement on quantity (Unlock a Max Move: 25 vs 10 candy) is flagged on one task", () => {
  const out = merge([field("Unlock a Max Move", [item("Eternatus Candy", 25), item("Stardust", 5000)])], [field("Unlock a Max Move", [item("Eternatus Candy", 10), item("Stardust", 5000)])]);
  assert.equal(out.researchTasks.length, 1);
  assert.equal(out.researchTasks[0].rewards[0].quantity, 25);
  assert.equal(out.researchTasks[0].rewardConflicts[0].rewards[0].quantity, 10);
});

test("identical rewards from two sources still corroborate, and a second source's extra task still appears", () => {
  const same = [field("Explore 1 km", [item("Stardust", 2000)])];
  const out = merge(same, [...same, field("Spin 5 PokéStops", [item("Stardust", 500)])]);
  const explore = out.researchTasks.find(t => t.task === "Explore 1 km");
  assert.equal(explore.status, "corroborated");
  assert.equal(explore.rewardConflicts, undefined);
  assert.equal(out.researchTasks.length, 2);
});

test("ambiguous repeats stay separate: one source listing the same task twice with different rewards is never collapsed", () => {
  const out = merge([field("Catch 5 Pokémon", [item("Stardust", 100)]), field("Catch 5 Pokémon", [item("Stardust", 200)])], [field("Catch 5 Pokémon", [item("Stardust", 300)])]);
  assert.equal(out.researchTasks.length, 3);
});

const page = `<html><body><h2>Field Research</h2>
<p>Catch 8 Pokémon POSSIBLE REWARDS Bulbasaur Max CP 477 Min CP 442 Squirtle Max CP 405 Min CP 372 +3 Grookey Max CP 465 Min CP 430 Scorbunny Max CP 470 Min CP 434</p>
<p>Unlock a Max Move POSSIBLE REWARDS ×25 Eternatus Candy ×25 ×5000 Stardust ×5000</p>
<p>Complete Pass Tasks to rank up and earn the following rewards. Ranks 101 through 300 award Eternatus Candy, Eternatus Candy XL, and Stardust.</p>
</body></html>`;

test("a leading +N chip is not part of a reward name", () => {
  const f = extractFields(page);
  const names = f.researchTasks[0].rewards.map(r => r.name);
  assert.deepEqual(names, ["Bulbasaur", "Squirtle", "Grookey", "Scorbunny"]);
  assert.ok(!JSON.stringify(f.researchTasks).includes("+3"));
});

test("legitimate reward names containing a plus sign or digits are untouched", () => {
  const f = extractFields(`<html><body><h2>Field Research</h2><p>Catch 5 Pokémon POSSIBLE REWARDS ×3 Rare Candy ×3 Mr. Mime Max CP 700 Min CP 650 Porygon+Z Max CP 900 Min CP 850</p></body></html>`);
  const names = f.researchTasks.flatMap(t => t.rewards.map(r => r.name));
  assert.ok(names.includes("Porygon+Z") || names.some(n => /Porygon/.test(n)), JSON.stringify(names));
  assert.ok(!names.some(n => /^\+/.test(n)));
});

test("GO Pass prose never becomes a research task, and does not make research parsing look incomplete", () => {
  const f = extractFields(page);
  assert.ok(!f.researchTasks.some(t => /pass tasks/i.test(t.task) || r(t)), JSON.stringify(f.researchTasks));
  assert.equal(f.researchParse.status, "ok");
  function r(t) { return t.rewards.some(x => /ranks 101/i.test(x.name)); }
});

test("Unlock a Max Move is parsed as a task", () => {
  const f = extractFields(page);
  const t = f.researchTasks.find(x => x.task === "Unlock a Max Move");
  assert.ok(t);
  assert.deepEqual(t.rewards.map(x => x.quantity + " " + x.name), ["25 Eternatus Candy", "5000 Stardust"]);
});
