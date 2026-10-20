// Scores how well-backed the shiny and costume claims in the next 30 days of events are, and cross-checks them against
// costumes.json and dex.json. Read-only on public/*; writes data/shiny-scorecard.json and prints what changed since last run.
// Run: node scripts/shiny-scorecard.mjs
import { readFile, writeFile } from "node:fs/promises";

const DAY = 864e5, WINDOW = 30;
// Official posts count double; the community sites are a second opinion; no link at all counts for nothing.
const WEIGHT = { "pokemongo.com": 2, "pokemongolive.com": 2, "leekduck.com": 1, "pokemongohub.net": 1, "serebii.net": 1 };
export const weightOf = url => { try { return WEIGHT[new URL(url).hostname.replace(/^www\./, "")] || 0; } catch { return 0; } };
const key = (n, label) => String(n).toLowerCase() + "|" + String(label).toLowerCase();
const base = n => String(n).toLowerCase().replace(/^(gigantamax|dynamax|mega|alolan|galarian|hisuian|paldean|crowned (sword|shield)|shadow)\s+/, "").replace(/ (x|y)$/, "");

export function score({ events, costumes, dex, now }) {
  const names = new Set((dex || []).map(r => String(r[1]).toLowerCase()));
  const pics = costumes.pictures || {}, shinyPics = costumes.shiny || {};
  const missing = new Set((costumes.missing || []).map(m => String(m).toLowerCase()));
  const claims = [], issues = [];
  for (const e of events || []) {
    const s = Date.parse(e.s), end = Date.parse(e.e);
    if (!(s <= now + WINDOW * DAY && end >= now)) continue;
    const w = weightOf(e.sourceUrl);
    const text = (e.p || []).join(" ").toLowerCase();
    for (const a of e.art || []) {
      if (typeof a === "string") continue;
      const kind = a.costume ? "costume" : a.shiny ? "shiny" : null;
      if (!kind) continue;
      claims.push({ event: e.id, pokemon: a.n, kind, label: a.label || null, weight: w, start: e.s });
      if (!names.has(base(a.n))) issues.push({ event: e.id, issue: `${a.n} is not in dex.json`, level: "warn" });
      if (kind === "costume") {
        const k = key(a.n, a.label);
        if (!pics[k] && !missing.has(k)) issues.push({ event: e.id, issue: `costume ${k} has no picture and is not tracked as missing`, level: "warn" });
        if (!pics[k] && missing.has(k)) issues.push({ event: e.id, issue: `costume ${k} still has no picture; event starts ${e.s.slice(0, 10)}`, level: s - now < 7 * DAY ? "warn" : "info" });
        if (pics[k] && /shiny/.test(text) && !shinyPics[k]) issues.push({ event: e.id, issue: `costume ${k} is described as shiny-capable but has no shiny picture`, level: "info" });
      }
    }
    for (const h of e.highlights || []) if (/shiny/i.test(h.type + " " + h.label)) claims.push({ event: e.id, pokemon: String(h.label).replace(/^[A-Z \-·]+·\s*/, ""), kind: "shiny", label: h.type, weight: w, start: e.s });
    if (w === 0 && claims.some(c => c.event === e.id)) issues.push({ event: e.id, issue: "shiny/costume claims with no source link", level: "warn" });
  }
  const total = claims.length, backed = claims.filter(c => c.weight >= 2).length, single = claims.filter(c => c.weight === 1).length;
  // 100 = every claim has an official post; community-only counts half; unsourced counts zero.
  const pct = total ? Math.round(((backed + single * 0.5) / total) * 100) : 100;
  return { claims: total, official: backed, communityOnly: single, unsourced: total - backed - single, score: pct, issues };
}

async function main() {
  const rd = async f => JSON.parse(await readFile(f, "utf8"));
  const [data, costumes, dex] = await Promise.all([rd("public/data.json"), rd("public/costumes.json"), rd("public/dex.json")]);
  const res = score({ events: data.events, costumes, dex, now: Date.now() });
  let prev = null; try { prev = await rd("data/shiny-scorecard.json"); } catch {}
  const seen = new Set((prev?.issues || []).map(i => i.event + i.issue));
  const fresh = res.issues.filter(i => !seen.has(i.event + i.issue));
  const out = { updated: new Date().toISOString(), ...res };
  await writeFile("data/shiny-scorecard.json", JSON.stringify(out, null, 1) + "\n");
  console.log(`score ${res.score}/100 (${res.official} official, ${res.communityOnly} community-only, ${res.unsourced} unsourced of ${res.claims} claims); ${res.issues.length} issues, ${fresh.length} new since last run`);
  for (const i of fresh) console.log(`  [${i.level}] ${i.event}: ${i.issue}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
