// Builds public/best-by-type.json: the ten strongest raid attackers for each attack type, with the moves that
// make them strong. Inputs are the PvPoke game master (Pokémon, base stats, move pools, Elite TM / legacy
// moves) and the PokeMiners game master (the real PvE damage, energy and timing of every move).
//
// The ranking is our own estimate, not Pokebattler's simulation: a neutral-target damage rate for the best
// fast + charged cycle, weighted by how much punishment the attacker can take. It is good for ordering
// attackers against each other, and it says so in the app.
import { readFile, writeFile } from "node:fs/promises";

const PVPOKE = process.env.PVPOKE_FILE || "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/pokemon.json";
const MINERS = process.env.MINERS_FILE || "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json";
const OUT = process.env.OUT_FILE || "public/best-by-type.json";
const TOP = 10;
const CPM = 0.8403, IV = 15, BOSS_DEF = 200, SHADOW_ATK = 1.2, SHADOW_DEF = 5 / 6;

async function load(src) {
  if (/^https?:/.test(src)) { const r = await fetch(src); if (!r.ok) throw new Error(src + " " + r.status); return r.json(); }
  return JSON.parse(await readFile(src, "utf8"));
}
const title = id => id.toLowerCase().split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")
  .replace(/^X Scissor$/, "X-Scissor").replace(/^Power Up Punch$/, "Power-Up Punch").replace(/^Freeze Dry$/, "Freeze-Dry")
  .replace(/^Lands Wrath$/, "Land's Wrath").replace(/^Vise Grip$/, "Vice Grip").replace(/^Trailblaze$/, "Trailblaze").replace(/^Super Power$/, "Superpower")
  .replace(/^Solar Blade$/, "Solar Blade").replace(/^Futuresight$/, "Future Sight").replace(/^Roar Of Time$/, "Roar of Time").replace(/^Natures Madness$/, "Nature's Madness").replace(/^Weather Ball (.+)$/, "Weather Ball ($1)");
const TYPE = t => t.replace("POKEMON_TYPE_", "").toLowerCase();
const cap = s => s[0].toUpperCase() + s.slice(1);

// "Charizard (Mega X)" -> "Mega Charizard X"; null when the form is not a raid attacker we list.
export function displayName(speciesName) {
  const m = speciesName.match(/^(.+?) \((.+)\)$/);
  if (!m) return speciesName;
  const base = m[1], form = m[2];
  if (/^Mega( [XY])?$/.test(form)) return "Mega " + base + form.slice(4);
  if (form === "Primal") return "Primal " + base;
  if (/^(Alolan|Galarian|Hisuian|Paldean)$/.test(form)) return form + " " + base;
  if (/^(Origin|Therian|Unbound|Crowned Sword|Crowned Shield|Dusk Mane|Dawn Wings|Dusk)$/.test(form)) return base + " (" + form + ")";
  return null;
}

export function buildMoveTables(miners) {
  const fast = {}, charged = {};
  for (const x of miners) {
    const ms = x.data && x.data.moveSettings; if (!ms || !/_MOVE_/.test(x.templateId)) continue;
    const id = ms.movementId;
    const row = { type: TYPE(ms.pokemonType), power: ms.power || 0, ms: ms.durationMs, energy: ms.energyDelta || 0 };
    if (/_FAST$/.test(id)) fast[id.replace(/_FAST$/, "")] = row; else charged[id] = row;
  }
  return { fast, charged };
}

const dmg = (power, atk, stab) => Math.floor(0.5 * power * atk / BOSS_DEF * (stab ? 1.2 : 1)) + 1;

export function cycle(mon, f, c) {
  const stabF = mon.types.includes(f.type), stabC = mon.types.includes(c.type);
  const df = dmg(f.power, mon.atk, stabF), dc = dmg(c.power, mon.atk, stabC);
  const cost = -c.energy; if (cost <= 0 || f.energy <= 0) return null;
  const k = cost / f.energy; // fast moves needed per charged move
  const secs = (k * f.ms + c.ms) / 1000;
  const dps = (k * df + dc) / secs;
  const bulk = mon.def * mon.hp;
  return { dps, score: dps * Math.pow(bulk, 0.25) };
}

export function build(pokemon, tables, today = new Date().toISOString().slice(0, 10)) {
  const mons = [];
  for (const p of pokemon) {
    if (!p.released || (p.tags || []).includes("teambuilderexclude")) continue;
    if (/\(Shadow\)/.test(p.speciesName)) continue; // shadows are derived below from the normal form
    const name = displayName(p.speciesName); if (!name) continue;
    const base = { name, types: p.types, atk: (p.baseStats.atk + IV) * CPM, def: (p.baseStats.def + IV) * CPM, hp: Math.floor((p.baseStats.hp + IV) * CPM), p };
    mons.push(base);
    if ((p.tags || []).includes("shadoweligible") && !(p.tags || []).includes("mega")) mons.push({ ...base, name: name.replace(/^((?:Alolan|Galarian|Hisuian|Paldean) )?/, "Shadow $1").replace("Shadow  ", "Shadow "), atk: base.atk * SHADOW_ATK, def: base.def * SHADOW_DEF, shadow: true });
  }
  const types = {};
  for (const mon of mons) {
    const p = mon.p, elite = new Set(p.eliteMoves || []), legacy = new Set(p.legacyMoves || []);
    const best = {}; // per charged-move type: best overall and best without any Elite TM / legacy move
    for (const fid of p.fastMoves) for (const cid of p.chargedMoves) {
      const f = tables.fast[fid], c = tables.charged[cid]; if (!f || !c || /^(FRUSTRATION|RETURN)$/.test(cid)) continue;
      const r = cycle(mon, f, c); if (!r) continue;
      const need = []; if (elite.has(fid) || legacy.has(fid)) need.push(fid); if (elite.has(cid) || legacy.has(cid)) need.push(cid);
      // A Pokémon carries two charged moves: the second is the strongest other one with the same fast move.
      let second = null, secondScore = -1;
      for (const c2id of p.chargedMoves) {
        if (c2id === cid || /^(FRUSTRATION|RETURN)$/.test(c2id)) continue;
        const c2 = tables.charged[c2id]; if (!c2) continue;
        const r2 = cycle(mon, f, c2); if (r2 && r2.score > secondScore) { second = c2id; secondScore = r2.score; }
      }
      const e = { fast: fid, charged: cid, charged2: second, dps: r.dps, score: r.score, need };
      const slot = (best[c.type] = best[c.type] || {});
      if (!slot.top || e.score > slot.top.score) slot.top = e;
      if (!need.length && (!slot.free || e.score > slot.free.score)) slot.free = e;
    }
    for (const [t, slot] of Object.entries(best)) {
      (types[cap(t)] = types[cap(t)] || []).push({ mon, stab: mon.types.includes(t), ...slot });
    }
  }
  const out = {};
  for (const t of Object.keys(types).sort()) {
    // Attackers using a same-type charged move come first; others only fill the list if there are too few.
    const all = types[t].sort((a, b) => b.top.score - a.top.score);
    const rows = all.filter(r => r.stab).slice(0, TOP);
    for (const r of all) if (rows.length < TOP && !r.stab) rows.push(r);
    if (rows.length < 5) continue;
    out[t] = rows.map(r => {
      const second = r.top.charged2, secondNeeds = second && ((r.mon.p.eliteMoves || []).includes(second) || (r.mon.p.legacyMoves || []).includes(second));
      const needs = r.top.need.concat(secondNeeds ? [second] : []).map(m => ({ move: title(m), kind: (r.mon.p.legacyMoves || []).includes(m) ? "legacy" : "elite" }));
      const row = { name: r.mon.name, dex: r.mon.p.dex, fast: title(r.top.fast), charged: title(r.top.charged), ...(second ? { charged2: title(second) } : {}), dps: +r.top.dps.toFixed(1), score: +r.top.score.toFixed(1) };
      if (needs.length) row.needs = needs;
      if (needs.length && r.free) row.without = { fast: title(r.free.fast), charged: title(r.free.charged), dps: +r.free.dps.toFixed(1) };
      return row;
    });
  }
  return { generated: today, method: "Estimated damage per second of the best fast + charged cycle against a neutral target at level 50 with 15 IVs, weighted by the attacker's bulk. Our own estimate from game-master data, not a battle simulation.", sources: ["PvPoke game master (Pokémon, move pools, Elite TM moves)", "PokeMiners game master (PvE move power, energy, timing)"], types: out };
}

if (process.argv[1] && process.argv[1].endsWith("best-by-type.mjs")) {
  const [pokemon, miners] = await Promise.all([load(PVPOKE), load(MINERS)]);
  const j = build(pokemon, buildMoveTables(miners));
  await writeFile(OUT, JSON.stringify(j, null, 1) + "\n");
  console.log(Object.entries(j.types).map(([t, r]) => t + ": " + r.map(x => x.name).slice(0, 3).join(", ")).join("\n"));
}
