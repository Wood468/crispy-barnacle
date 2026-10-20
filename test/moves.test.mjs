import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const rd = (f) => JSON.parse(readFileSync(new URL("../public/" + f, import.meta.url), "utf8"));
const M = rd("moves.json");
const TYPES = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"];
const nk = (s) => String(s).toLowerCase().replace(/é/g, "e").replace(/[^a-z0-9]+/g, "");
const IDX = Object.fromEntries(Object.entries(M.types).map(([n, t]) => [nk(n), t]));
for (const [a, b] of Object.entries(M.aliases)) IDX[nk(a)] = M.types[b];

test("moves.json: names its sources and every type is one of the 18 real types", () => {
  assert.ok(M.source.types.url.startsWith("https://") && M.source.elite.url.startsWith("https://") && /^\d{4}-\d\d-\d\d$/.test(M.source.observed));
  assert.match(M.source.types.crosscheck, /PokeMiners/);
  assert.ok(Object.keys(M.types).length > 300);
  for (const [n, t] of Object.entries(M.types)) assert.ok(TYPES.includes(t), n + " -> " + t);
});

test("moves.json: a move's own type, not its user's (Melmetal is Steel, Altaria is Dragon/Flying)", () => {
  assert.equal(IDX[nk("Thunder Shock")], "Electric");      // used by Melmetal (Steel)
  assert.equal(IDX[nk("Double Iron Bash")], "Steel");
  assert.equal(IDX[nk("Moonblast")], "Fairy");             // used by Altaria (Dragon/Flying)
  assert.equal(IDX[nk("Dragon Breath")], "Dragon");
  assert.equal(IDX[nk("Counter")], "Fighting"); assert.equal(IDX[nk("Sucker Punch")], "Dark"); assert.equal(IDX[nk("Frenzy Plant")], "Grass"); assert.equal(IDX[nk("Hyper Beam")], "Normal");
});

test("moves.json: moves whose type depends on the user are never given a single type", () => {
  for (const n of ["Aura Wheel", "Hidden Power", "Weather Ball"]) { assert.ok(M.ambiguous[n], n + " listed as ambiguous"); assert.equal(IDX[nk(n)], undefined, n + " has no fixed type"); }
});

test("every move the app lists resolves to a type, except moves that genuinely vary", () => {
  const names = new Set(), pv = rd("pvp.json"), best = rd("data.json").best;
  for (const l of Object.values(pv.leagues)) for (const x of l) { names.add(x.fast); x.charged.forEach((c) => names.add(c)); }
  for (const v of Object.values(best)) for (const s of v) { const p = s.split("|"); names.add(p[1]); names.add(p[2]); }
  const unresolved = [...names].filter((n) => !IDX[nk(n)] && !M.ambiguous[n]);
  assert.deepEqual(unresolved, [], "unresolved: " + unresolved.join(", "));
});

test("elite data: keyed by Pokémon, only moves PvPoke lists, legacy moves excluded", () => {
  assert.deepEqual(M.elite["venusaur"], ["Frenzy Plant"]);
  assert.deepEqual(M.elite["shadow venusaur"], ["Frenzy Plant"]);
  assert.deepEqual(M.elite["charmeleon"], ["Scratch"]);
  assert.equal(M.elite["ivysaur"], undefined, "no entry means nothing is claimed");
  for (const [k, l] of Object.entries(M.elite)) { assert.ok(l.length && l.every((n) => M.types[n]), k + " elite moves are known moves"); }
});

test("build-moves.py refuses a type the two sources disagree on", () => {
  const dir = mkdtempSync(join(tmpdir(), "mv-"));
  const w = (n, o) => { writeFileSync(join(dir, n), JSON.stringify(o)); return join(dir, n); };
  const moves = w("m.json", [{ moveId: "COUNTER", name: "Counter", type: "fighting", energy: 0, energyGain: 7 }]);
  const pokemon = w("p.json", [{ speciesName: "Machamp", eliteMoves: [] }]);
  const ok = w("ok.json", [{ templateId: "COMBAT_V0013_MOVE_COUNTER_FAST", data: { combatMove: { uniqueId: 13, type: "POKEMON_TYPE_FIGHTING" } } }]);
  const bad = w("bad.json", [{ templateId: "COMBAT_V0013_MOVE_COUNTER_FAST", data: { combatMove: { uniqueId: 13, type: "POKEMON_TYPE_NORMAL" } } }]);
  const run = (pm) => spawnSync("python3", [new URL("../tools/build-moves.py", import.meta.url).pathname, moves, pokemon, pm, "x"], { encoding: "utf8" });
  assert.equal(run(ok).status, 0);
  const r = run(bad); assert.notEqual(r.status, 0); assert.match(r.stderr + r.stdout, /disagree/);
});

test("moves.json records when it was generated, from the run itself, and carries the Elite TM caution", () => {
  assert.match(M.source.generated, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.match(M.source.gamemaster, /^\d{4}-\d\d-\d\d/);
  assert.match(M.source.elite_note, /does not prove the move cannot be obtained/);
  assert.match(M.source.how_to_update, /tools\/refresh-moves\.sh/);
  const dir = mkdtempSync(join(tmpdir(), "mv-")); const w = (n, o) => { writeFileSync(join(dir, n), JSON.stringify(o)); return join(dir, n); };
  const args = [new URL("../tools/build-moves.py", import.meta.url).pathname,
    w("m.json", [{ moveId: "COUNTER", name: "Counter", type: "fighting", energy: 0, energyGain: 7 }]), w("p.json", [{ speciesName: "Machamp", eliteMoves: [] }]),
    w("pm.json", [{ templateId: "COMBAT_V0013_MOVE_COUNTER_FAST", data: { combatMove: { uniqueId: 13, type: "POKEMON_TYPE_FIGHTING" } } }]), "2026-01-01 00:00:00"];
  const out = JSON.parse(spawnSync("python3", args, { encoding: "utf8" }).stdout);
  assert.equal(out.source.observed, new Date().toISOString().slice(0, 10), "observed date comes from the run, not a typed-in constant");
  assert.ok(Math.abs(Date.parse(out.source.generated) - Date.now()) < 60000);
  assert.equal(out.source.gamemaster, "2026-01-01 00:00:00");
});

test("refresh script exists, is executable, and refuses to write unless sources agree and the result is sane", async () => {
  const { statSync, readFileSync: rf } = await import("node:fs");
  const p = new URL("../tools/refresh-moves.sh", import.meta.url).pathname;
  assert.ok(statSync(p).mode & 0o111, "executable");
  const s = rf(p, "utf8"); assert.match(s, /set -euo pipefail/); assert.match(s, /build-moves\.py/); assert.match(s, /looks too small/);
  assert.ok(s.indexOf("build-moves.py") < s.indexOf("mv \"$tmp/out.json\""), "builds and validates before it replaces the file");
});
