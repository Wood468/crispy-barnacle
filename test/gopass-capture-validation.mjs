import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractLeekDuckGoPassRewards } from "../scripts/importer/gopass.mjs";

const file = process.env.GO_PASS_CAPTURE_HTML;
if (!file) throw new Error("GO_PASS_CAPTURE_HTML must point to the downloaded raw HTML artifact");
const html = readFileSync(file, "utf8");
const parsed = extractLeekDuckGoPassRewards(html);
assert.ok(parsed, "the captured page contains a Leek Duck battle-pass container");

const expectedRanks = Array.from({ length: 101 }, (_, i) => i + 1).concat(200);
assert.deepEqual(parsed.ranks.map(x => x.rank), expectedRanks, "only explicitly rendered ranks 1–101 and 200 are extracted");
assert.deepEqual(parsed.gaps, [{ beforeRank: 101, afterRank: 200 }], "the ellipsis records the published gap without inventing ranks 102–199");
assert.equal(parsed.ranks.length, 102);
assert.equal(parsed.bonusItems.filter(x => x.rank === 1).length, 2, "both Rank 1 milestone bonus rows are retained");
assert.equal(parsed.tickets.length, parsed.ranks.filter(x => x.basic.length || x.deluxe.length).length, "only ranks with ordinary rewards become ticket rows");
assert.ok(parsed.bonusItems.every(x => parsed.ranks.some(r => r.rank === x.rank) && ["basic", "deluxe"].includes(x.track)), "bonus rows retain their explicit rank and track");
assert.deepEqual(parsed.ranks.filter(x => x.deluxeEmpty).map(x => x.rank), [1, 50, 75]);
assert.ok(parsed.ranks.every(x => !x.basicEmpty && x.basicItemCount > 0), "Basic is populated at every listed rank");
assert.equal(parsed.ranks.reduce((n, x) => n + x.basicItemCount, 0), 105);
assert.equal(parsed.ranks.reduce((n, x) => n + x.deluxeItemCount, 0), 101);
assert.equal(parsed.ranks.reduce((n, x) => n + x.basicItemCount + x.deluxeItemCount, 0), 206);
assert.ok(!parsed.ranks.some(x => x.rank >= 102 && x.rank <= 199), "unrendered ranks are never inferred");

console.log("Captured November GO Pass page validated: 102 numbered ranks, 1 ellipsis, 206 reward items, " + parsed.bonusItems.length + " bonus rows (" + parsed.bonusItems.filter(x => x.rank === 1).length + " at Rank 1), and 3 explicit empty Deluxe slots.");
console.log("Captured bonus rows: " + JSON.stringify(parsed.bonusItems));
