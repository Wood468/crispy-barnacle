import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const data = JSON.parse(await readFile(new URL("../public/data.json", import.meta.url), "utf8"));
const rotations = data.rotation;
const find = boss => rotations.find(row => row.five === boss);

test("current and upcoming raid windows match Leek Duck's published local times", () => {
  const cases = [
    ["Origin Forme Giratina", "2026-10-28T06:00", "2026-11-03T22:00", "https://leekduck.com/events/giratina-origin-forme-in-5-star-raid-battles-october-2026/"],
    ["Giratina (Altered Forme)", "2026-11-04T06:00", "2026-11-08T22:00", "https://leekduck.com/events/giratina-altered-forme-in-5-star-raid-battles-november-2026/"],
    ["Cresselia and Darkrai", "2026-11-16T06:00", "2026-11-24T22:00", "https://leekduck.com/events/cresselia-darkrai-in-5-star-raid-battles-november-2026/"],
    ["Deoxys (all four Formes)", "2026-11-25T06:00", "2026-12-01T22:00", "https://leekduck.com/events/deoxys-normal-defense-attack-speed-formes-in-5-star-raid-battles-november-2026/"]
  ];
  for (const [boss, start, end, sourceUrl] of cases) {
    const row = find(boss);
    assert.ok(row, boss + " rotation exists");
    assert.equal(row.s, start, boss + " start");
    assert.equal(row.e, end, boss + " end");
    assert.equal(row.sourceUrl, sourceUrl, boss + " source");
  }
});

test("Into the Wild keeps its separately published 10 am–8 pm event window", () => {
  const row = find("Crowned Sword Zacian and Crowned Shield Zamazenta");
  assert.ok(row);
  assert.equal(row.s, "2026-11-09T10:00");
  assert.equal(row.e, "2026-11-13T20:00");
  assert.equal(row.sourceUrl, "https://leekduck.com/events/into-the-wild-2026/");
});

test("current transition windows are ordered and do not overlap", () => {
  const dates = new Set(["2026-10-28", "2026-11-04", "2026-11-09", "2026-11-16", "2026-11-25"]);
  const rows = rotations.filter(row => dates.has(String(row.s).slice(0, 10))).sort((a, b) => Date.parse(a.s) - Date.parse(b.s));
  assert.equal(rows.length, 5);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(Date.parse(rows[i - 1].e) <= Date.parse(rows[i].s), rows[i - 1].five + " overlaps " + rows[i].five);
  }
});

test("a historical Palkia start is not bulk-shifted", () => {
  const row = find("Palkia");
  assert.ok(row);
  assert.equal(row.s, "2026-10-21T10:00");
  assert.equal(row.e, "2026-10-27T22:00");
});
