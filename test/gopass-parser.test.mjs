import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractLeekDuckGoPassRewards } from "../scripts/importer/gopass.mjs";
import { extractFields } from "../scripts/importer/extract.mjs";

const fixture = readFileSync(new URL("./fixtures/leekduck-gopass-november-2026-excerpts.html", import.meta.url), "utf8");
const wrap = body => '<div class="battle-pass-container -has-toggle"><div class="battle-pass-rewards">' + body + "</div></div>";
const reward = (name, alt = "") => '<div class="reward-item">' + (alt ? '<div class="reward-image"><img alt="' + alt + '" /></div>' : "") + '<div class="reward-info"><span class="reward-name">' + name + "</span></div></div>";
const rankBlock = (rank, basic = reward("Stardust ×50"), deluxe = reward("XP ×100")) =>
  '<div class="rank-item"><div class="rank-label"><div class="rank-number">' + rank + '</div></div><div class="rank-paths"><div class="rank-rewards basic">' + basic + '</div><div class="rank-rewards deluxe">' + deluxe + "</div></div></div>";

test("captured Leek Duck excerpts parse rank rewards, bonuses, the ellipsis and rank 200", () => {
  const parsed = extractLeekDuckGoPassRewards(fixture, { allowPartial: true });
  assert.deepEqual(parsed.ranks.map(x => x.rank), [1, 2, 3, 100, 200]);
  assert.deepEqual(parsed.gaps, [{ beforeRank: 100, afterRank: 200 }]);
  assert.deepEqual(parsed.bonusItems.map(x => x.name), [
    "Tier 1 GO Pass Bonus: One additional Candy for trading Pokémon",
    "Tier 1 GO Pass Bonus: Trainers level 31 and above will receive one guaranteed Candy XL when trading Pokémon"
  ]);
  assert.deepEqual(parsed.tickets, [
    "Rank 2: Free: XP ×10000 | Deluxe: Stardust ×10000",
    "Rank 3: Free: Dynamax Rookidee | Deluxe: Rookidee Candy ×5",
    "Rank 100: Free: Groudon (Level 20) | Deluxe: PokéCoin ×200",
    "Rank 200: Free: Stardust ×50 | Deluxe: Stardust ×100"
  ]);
  assert.equal(parsed.ranks[0].deluxeEmpty, true, "rank 1's empty Deluxe cell is explicit");
  assert.ok(!parsed.tickets.some(x => /Rank (4|101|102|150|199):/.test(x)), "omitted ranks are not inferred");
});

test("extractFields integrates captured rank rows and Rank 1 bonuses into existing fields", () => {
  const fields = extractFields(fixture);
  assert.ok(fields.bonuses.includes("Rank 1: Tier 1 GO Pass Bonus: One additional Candy for trading Pokémon"));
  assert.ok(fields.tickets.includes("Rank 3: Free: Dynamax Rookidee | Deluxe: Rookidee Candy ×5"));
  assert.ok(!fields.goPassParseError);
});

test("explicit no-rewards cells preserve empty Deluxe ranks 50 and 75 without inventing rewards", () => {
  const noRewards = '<div class="no-rewards">-</div>';
  const ellipsis = '<div class="rank-item rank-ellipsis"><div class="rank-ellipsis-mark">…</div></div>';
  const html = wrap(rankBlock(50, reward("Stardust ×50"), noRewards) + ellipsis + rankBlock(75, reward("XP ×1000"), noRewards));
  const parsed = extractLeekDuckGoPassRewards(html);
  assert.deepEqual(parsed.tickets, [
    "Rank 50: Free: Stardust ×50 | Deluxe: —",
    "Rank 75: Free: XP ×1000 | Deluxe: —"
  ]);
  assert.deepEqual(parsed.ranks.filter(x => x.deluxeEmpty).map(x => x.rank), [50, 75]);
  assert.throws(() => extractLeekDuckGoPassRewards(wrap(rankBlock(50, reward("Stardust ×50"), ""))), /explicit no-rewards marker/);
});

test("data-bonus rows at later ranks and on either track remain milestone bonuses", () => {
  const bonus = name => '<div class="reward-item" data-bonus="true"><div class="reward-info"><span class="reward-name">' + name + '</span></div></div>';
  const html = wrap(rankBlock(
    25,
    bonus("Tier 2 GO Pass Bonus: Open up to 40 Gifts per day") + reward("Stardust ×50"),
    bonus("Tier 2 GO Pass Bonus: Open up to 50 Gifts per day") + reward("XP ×100")
  ));
  const parsed = extractLeekDuckGoPassRewards(html);
  assert.deepEqual(parsed.bonusItems.map(x => [x.rank, x.track, x.name]), [
    [25, "basic", "Tier 2 GO Pass Bonus: Open up to 40 Gifts per day"],
    [25, "deluxe", "Tier 2 GO Pass Bonus: Open up to 50 Gifts per day"]
  ]);
  assert.deepEqual(parsed.tickets, ["Rank 25: Free: Stardust ×50 | Deluxe: XP ×100"]);
  const fields = extractFields(html);
  assert.ok(fields.bonuses.includes("Rank 25: Tier 2 GO Pass Bonus: Open up to 40 Gifts per day"));
  assert.ok(fields.bonuses.includes("Rank 25 Deluxe: Tier 2 GO Pass Bonus: Open up to 50 Gifts per day"));
});

test("HTML entities and non-breaking spaces are normalised in reward names", () => {
  const html = wrap(rankBlock(1, reward("Stardust&nbsp;×50"), reward("XP&#215;100")));
  const parsed = extractLeekDuckGoPassRewards(html);
  assert.deepEqual(parsed.tickets, ["Rank 1: Free: Stardust ×50 | Deluxe: XP×100"]);
});


test("duplicate ranks, missing rank numbers and missing tracks fail closed", () => {
  assert.throws(() => extractLeekDuckGoPassRewards(wrap(rankBlock(1) + rankBlock(2) + rankBlock(2))), /duplicate GO Pass rank/);
  const missingNumber = rankBlock(1).replace('<div class="rank-number">1</div>', "");
  assert.throws(() => extractLeekDuckGoPassRewards(wrap(missingNumber)), /one rank-number/);
  const missingTrack = '<div class="rank-item"><div class="rank-label"><div class="rank-number">1</div></div><div class="rank-paths"><div class="rank-rewards basic">' + reward("Stardust ×50") + '</div></div></div>';
  assert.throws(() => extractLeekDuckGoPassRewards(wrap(missingTrack)), /Basic and Deluxe tracks/);
});

test("empty reward names, inconsistent image alts and malformed divs fail closed", () => {
  assert.throws(() => extractLeekDuckGoPassRewards(wrap(rankBlock(1, reward(""), reward("XP ×100")))), /non-empty reward-name/);
  assert.throws(() => extractLeekDuckGoPassRewards(wrap(rankBlock(1, reward("Groudon", "Pikachu"), reward("XP ×100")))), /does not match reward-name/);
  const truncated = wrap(rankBlock(1)).slice(0, -6);
  assert.throws(() => extractLeekDuckGoPassRewards(truncated), /Unbalanced battle-pass-container div/);
  assert.throws(() => extractLeekDuckGoPassRewards(wrap('<div class="rank-row">not the expected markup</div>')), /no rank-item blocks/);
});

test("rank-ellipsis must be a real placeholder between explicit ranks", () => {
  const ellipsis = '<div class="rank-item rank-ellipsis"><div class="rank-ellipsis-mark">&ctdot;</div></div>';
  assert.deepEqual(extractLeekDuckGoPassRewards(wrap(rankBlock(100) + ellipsis + rankBlock(200))).gaps, [{ beforeRank: 100, afterRank: 200 }]);
  assert.throws(() => extractLeekDuckGoPassRewards(wrap(ellipsis + rankBlock(200))), /must appear between/);
});

test("the 110 rank-row cap is enforced rather than silently truncating rewards", () => {
  const html = wrap(Array.from({ length: 111 }, (_, i) => rankBlock(i + 1)).join(""));
  assert.throws(() => extractLeekDuckGoPassRewards(html), /110-row cap/);
});

test("extractFields fails closed on malformed pass markup but keeps unrelated article details", () => {
  const malformedRank = rankBlock(1).replace('<div class="rank-number">1</div>', "");
  const html = wrap(malformedRank) + "<h2>Bonuses</h2><p>2× Catch XP for catching Pokémon.</p>";
  const fields = extractFields(html);
  assert.match(fields.goPassParseError, /rank-number/);
  assert.ok(!fields.tickets.some(x => /^Rank \d+:/i.test(x)), "no partial or guessed rank rows are published");
  assert.ok(fields.bonuses.includes("2× Catch XP for catching Pokémon."), "unrelated article details remain available");
});

test("the existing importer ignores pages without a Leek Duck battle-pass container", () => {
  const fields = extractFields("<main><h2>Tickets</h2><p>Special Research ticket: US$2.00</p></main>");
  assert.ok(fields.tickets.some(x => /US\$2/.test(x)));
  assert.equal(fields.goPassParseError, undefined);
});

test("rank gaps without an explicit ellipsis fail closed", () => {
  assert.throws(
    () => extractLeekDuckGoPassRewards(wrap(rankBlock(1) + rankBlock(2) + rankBlock(4) + rankBlock(7))),
    /without an explicit ellipsis/
  );
  assert.deepEqual(
    extractLeekDuckGoPassRewards(wrap(rankBlock(1) + rankBlock(2) + '<div class="rank-item rank-ellipsis">…</div>' + rankBlock(200))).gaps,
    [{ beforeRank: 2, afterRank: 200 }]
  );
});

test("oversized and pathological unterminated tags are rejected before tokenisation", () => {
  assert.throws(() => extractLeekDuckGoPassRewards("x".repeat(512 * 1024 + 1)), /512 KiB safety limit/);
  assert.throws(
    () => extractLeekDuckGoPassRewards('<div class="battle-pass-container -has-toggle">' + '<div '.repeat(900)),
    /overlong or unterminated tag/
  );
});

test("milestone bonuses already extracted by the generic heading scan are not duplicated", () => {
  const bonusPage = '<h3>Tier 1 – Rank 1</h3><ul><li>One additional Candy for trading Pokémon</li></ul>' +
    '<h2>Rewards</h2>' + wrap(rankBlock(1,
      '<div class="reward-item" data-bonus="true"><span class="reward-name">Tier 1 GO Pass Bonus: One additional Candy for trading Pokémon</span></div>' + reward("Stardust ×50"),
      '<div class="no-rewards">-</div>'
    ));
  const fields = extractFields(bonusPage);
  assert.equal(fields.bonuses.filter(x => /One additional Candy for trading Pokémon/.test(x)).length, 1);
});
