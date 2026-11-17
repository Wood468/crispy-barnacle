import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLeekDuck, sane, matchRotation, planLeekDuck, leekDuckStage, LEEKDUCK_URL } from "../scripts/low-raids-leekduck.mjs";

const REAL = readFileSync(new URL("./fixtures/leekduck-raid-bosses-2026-11-15.md", import.meta.url), "utf8");
const rec = (n, types = ["Fighting"]) => `<li><img alt="${n}"><h3>${n}</h3>${types.map(t => `<img alt="${t}">`).join("")}<p>CP 100 - 200</p><p>CP 300 - 400</p><img alt="Sunny"></li>`;
const sec = (h, names) => `<h2>${h}</h2><ul>${names.map(n => rec(n)).join("")}</ul>`;
// A normal-week page in HTML form (synthetic, same order as the live page: regular tiers, then Shadow Raids).
const week = ({ five = ["Cresselia", "Darkrai"], one = ["Axew", "Goomy"], three = ["Cofagrigus", "Trevenant"], sOne = ["Shadow Larvitar"], sThree = ["Shadow Poliwhirl"] } = {}) =>
  `<h1>Current Raid Bosses</h1>${sec("1-Star Raids", one)}${sec("3-Star Raids", three)}${sec("5-Star Raids", five)}<h2>Mega Raids</h2>${sec("Mega Raids", []).slice(0, 0)}`
  + `<h2>Shadow Raids</h2>${sec("1-Star Raids", sOne)}${sec("3-Star Raids", sThree)}${sec("5-Star Raids", ["Shadow Tornadus (Incarnate)"])}`;
const ROT = [
  { s: "2026-11-09T10:00", e: "2026-11-13T20:00", five: "Crowned Sword Zacian and Crowned Shield Zamazenta", low: { three: ["Druddigon"], source: "Official Into the Wild announcement" } },
  { s: "2026-11-16T06:00", e: "2026-11-24T22:00", five: "Cresselia and Darkrai", mega: "Mega Banette", shadow: "Shadow Tornadus (Incarnate)" },
  { s: "2026-11-25T06:00", e: "2026-12-01T22:00", five: "Deoxys (all four Formes)" },
];
const NOW = Date.parse("2026-11-16T08:00:00Z");
const dataFor = rot => { const f = join(mkdtempSync(join(tmpdir(), "ld-")), "data.json"); writeFileSync(f, '{\n  "rotation": [\n' + rot.map(r => "    " + JSON.stringify(r, null, 2).replace(/\n/g, "\n    ")).join(",\n") + "\n  ]\n}\n"); return f; };
const page = html => { const f = join(mkdtempSync(join(tmpdir(), "ldp-")), "p.html"); writeFileSync(f, html); return f; };

test("parse: the saved real page (markdown rendering) gives its tiers, with Shadow lists kept apart from regular ones", () => {
  const t = parseLeekDuck(REAL);
  assert.deepEqual(t.five, ["Zekrom", "Kyurem (White)", "Reshiram", "Kyurem (Black)"]);
  assert.deepEqual(t.three, ["Modern Jacket Machamp"]);
  assert.deepEqual(t.one, [], "that event page lists no regular 1-star bosses");
  assert.deepEqual(t.shadowOne, ["Shadow Larvitar", "Shadow Mudkip", "Shadow Makuhita", "Shadow Cranidos"]);
  assert.deepEqual(t.shadowThree, ["Shadow Poliwhirl", "Shadow Piloswine", "Shadow Prinplup"]);
  assert.equal(sane(t), false, "no regular 1-star list: not complete enough to write");
});

test("parse: HTML page with the same record shape", () => {
  const t = parseLeekDuck(week());
  assert.deepEqual(t, { one: ["Axew", "Goomy"], three: ["Cofagrigus", "Trevenant"], five: ["Cresselia", "Darkrai"], shadowOne: ["Shadow Larvitar"], shadowThree: ["Shadow Poliwhirl"] });
  assert.ok(sane(t));
});

test("match: only when the 5-star set is exactly the rotation's, and the rotation has not ended", () => {
  assert.equal(matchRotation(ROT, ["Darkrai", "Cresselia"], NOW).s, "2026-11-16T06:00");
  assert.equal(matchRotation(ROT, ["Deoxys (Speed Forme)", "Deoxys (Attack Forme)"], NOW), null, "future source window not active");
  assert.equal(matchRotation(ROT, ["Cresselia"], NOW), null, "a subset is not a match");
  assert.equal(matchRotation(ROT, ["Cresselia", "Darkrai", "Mewtwo"], NOW), null, "a superset is not a match");
  assert.equal(matchRotation(ROT, ["Crowned Sword Zacian", "Crowned Shield Zamazenta"], NOW), null, "ended rotation");
  assert.equal(matchRotation([ROT[1], { ...ROT[1], s: "2026-11-17T06:00" }], ["Cresselia", "Darkrai"], NOW), null, "ambiguous");
});

test("write: a matching page fills the empty block, with provenance, touching nothing else", async () => {
  const f = dataFor(ROT), before = readFileSync(f, "utf8");
  const r = await leekDuckStage({ dataFile: f, html: page(week()), now: NOW });
  assert.equal(r.wrote, true);
  const after = JSON.parse(readFileSync(f, "utf8")), was = JSON.parse(before), low = after.rotation[1].low;
  assert.deepEqual(low, { one: ["Axew", "Goomy"], three: ["Cofagrigus", "Trevenant"], shadowOne: ["Shadow Larvitar"], shadowThree: ["Shadow Poliwhirl"], observed: "2026-11-16", source: "leekduck", sourceUrl: LEEKDUCK_URL, fetchedAt: "2026-11-16T08:00:00.000Z" });
  delete after.rotation[1].low; assert.deepEqual(after, was);
});

test("idempotent: a second run with the same page changes nothing", async () => {
  const f = dataFor(ROT), p = page(week());
  await leekDuckStage({ dataFile: f, html: p, now: NOW });
  const once = readFileSync(f, "utf8");
  const r = await leekDuckStage({ dataFile: f, html: p, now: NOW + 3600e3 });
  assert.equal(r.wrote, false); assert.equal(r.status, "skip"); assert.equal(readFileSync(f, "utf8"), once);
});

test("no match: a stale page (last week's 5-star boss) writes nothing", async () => {
  const f = dataFor(ROT), before = readFileSync(f, "utf8");
  const r = await leekDuckStage({ dataFile: f, html: page(week({ five: ["Giratina (Altered Forme)"] })), now: NOW });
  assert.equal(r.status, "skip"); assert.equal(readFileSync(f, "utf8"), before);
});

test("the real saved page (event weekend, no 1-star list, 5-star set of another event) writes nothing", async () => {
  const rot = [{ ...ROT[1], five: "Zekrom, Reshiram and Kyurem" }];
  const f = dataFor(rot), before = readFileSync(f, "utf8");
  const r = await leekDuckStage({ dataFile: f, html: page(REAL), now: Date.parse("2026-11-15T00:00:00Z") });
  assert.equal(r.status, "untrusted"); assert.equal(readFileSync(f, "utf8"), before);
});

test("conflict: an importer-written block that differs is kept and the conflict is reported; agreement is a quiet skip", () => {
  const hub = { one: ["Axew", "Goomy"], three: ["Cofagrigus", "Trevenant"], shadowOne: ["Shadow Larvitar"], shadowThree: ["Shadow Poliwhirl"], observed: "2026-11-16", source: "Pokémon GO Hub current raids" };
  const rot = (low) => [ROT[0], { ...ROT[1], low }, ROT[2]];
  const agree = planLeekDuck(week(), rot(hub), NOW);
  assert.equal(agree.action, "skip"); assert.match(agree.reason, /agrees/);
  const differ = planLeekDuck(week({ three: ["Cofagrigus", "Dhelmise"] }), rot(hub), NOW);
  assert.equal(differ.action, "conflict"); assert.match(differ.reason, /Dhelmise/); assert.match(differ.reason, /Trevenant/);
  const own = planLeekDuck(week({ three: ["Cofagrigus", "Dhelmise"] }), rot({ ...hub, source: "leekduck" }), NOW);
  assert.equal(own.action, "conflict", "an earlier Leek Duck write is also kept");
});

test("a hand-entered block is never touched or reported as a conflict", () => {
  const p = planLeekDuck(week(), [{ ...ROT[1], low: { one: ["Pikachu"], three: ["Muk"], source: "Official announcement" } }], NOW);
  assert.equal(p.action, "skip"); assert.match(p.reason, /hand-entered/);
});

test("malformed or partial pages write nothing", async () => {
  const bad = {
    "no CP lines": week().replace(/<p>CP[^<]*<\/p>/g, ""),
    "boss record without a name": week().replace("<h3>Axew</h3>", "<h3>Wearing a hat</h3>").replace('<img alt="Axew">', ""),
    "3-star section missing": week().replace(/<h2>3-Star Raids<\/h2>.*?(?=<h2>5-Star)/s, ""),
    "login wall": "<html><body>Please enable JavaScript</body></html>",
    "empty": "",
  };
  for (const [why, html] of Object.entries(bad)) {
    const f = dataFor(ROT), before = readFileSync(f, "utf8");
    const r = await leekDuckStage({ dataFile: f, html: page(html), now: NOW });
    assert.equal(r.wrote, false, why); assert.equal(readFileSync(f, "utf8"), before, why);
  }
});

test("an unreachable page is a quiet no-op: nothing is parsed or written", async () => {
  const f = dataFor(ROT), before = readFileSync(f, "utf8");
  for (const fetchPage of [async () => { throw new Error("HTTP 403"); }, async () => { throw new Error("The operation was aborted due to timeout"); }]) {
    const r = await leekDuckStage({ dataFile: f, fetchPage, now: NOW, html: undefined });
    assert.deepEqual(r, { wrote: false, status: "unreachable" });
  }
  assert.equal(readFileSync(f, "utf8"), before);
});

test("DRY_RUN-style dry mode writes nothing", async () => {
  const f = dataFor(ROT), before = readFileSync(f, "utf8");
  const r = await leekDuckStage({ dry: true, dataFile: f, html: page(week()), now: NOW });
  assert.equal(r.status, "dry"); assert.equal(readFileSync(f, "utf8"), before);
});

test("the Hub step runs first and Leek Duck is only a second step in the job", () => {
  const src = readFileSync(new URL("../scripts/low-raids.mjs", import.meta.url), "utf8");
  assert.ok(src.indexOf("await hubStage()") > 0 && src.indexOf("await hubStage()") < src.indexOf("leekDuckStage("));
});

test("real public/data.json: the 16-24 Nov rotation can be filled by an exact-set page, changing only its low block", async () => {
  const raw = readFileSync(new URL("../public/data.json", import.meta.url), "utf8"), was = JSON.parse(raw);
  const f = join(mkdtempSync(join(tmpdir(), "ld-")), "data.json"); writeFileSync(f, raw);
  const target = was.rotation.find(r => r.s === "2026-11-16T06:00");
  if (!target || target.low) return; // already filled (by Hub or a person): nothing to prove
  const r = await leekDuckStage({ dataFile: f, html: page(week()), now: NOW });
  assert.equal(r.wrote, true);
  const now = JSON.parse(readFileSync(f, "utf8")); delete now.rotation.find(x => x.s === target.s).low;
  assert.deepEqual(now, was);
});

test("current Leek Duck page never writes low-tier raids to a future same-boss rotation", async () => {
  const future = { s: "2026-11-25T06:00", e: "2026-12-01T22:00", five: "Cresselia and Darkrai" };
  assert.equal(matchRotation([future], ["Cresselia", "Darkrai"], NOW), null);
  assert.equal(matchRotation([ROT[1], future], ["Cresselia", "Darkrai"], NOW), ROT[1],
    "future duplicate does not make the active matching source ambiguous");
  const f = dataFor([future]), before = readFileSync(f, "utf8");
  const result = await leekDuckStage({ dataFile: f, html: page(week()), now: NOW });
  assert.equal(result.wrote, false);
  assert.equal(result.status, "skip");
  assert.equal(readFileSync(f, "utf8"), before, "current source must not contaminate future roster");
});
