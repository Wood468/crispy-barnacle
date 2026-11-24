#!/usr/bin/env node
// Derives typed event highlight chips (boosted-shiny, debut) for curated events in public/data.json from the
// structured bonus rows in public/event-details.json, so a new event does not need hand-seeded chips.
// Rules: hand-written chips always win (never edited, never duplicated); only rows the importer already trusts
// are used (status "official", or two or more distinct sources); only an explicit "increased chance ... Shiny X"
// statement counts. Asterisk "shiny possible" text never produces a chip. Run with --check to fail when stale.
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rowText = r => String(typeof r === "string" ? r : r?.text || "");
export const trustedRow = r => !!r && typeof r === "object" && (r.status === "official" || new Set(r.sources || []).size >= 2);
const NAME = "[A-Z][\\p{L}'.:\\-]*(?: [A-Z][\\p{L}'.:\\-]*)*";
const SHINY_RE = new RegExp(`[Ii]ncreased chance (?:of|to) (?:[Ee]ncounter(?:ing)?|find(?:ing)?|get(?:ting)?|hatch(?:ing)?) Shiny (${NAME}(?:(?:,| and|, and) (?:Shiny )?${NAME})*)`, "gu");
const SHINY_AFTER_RE = new RegExp(`^(${NAME}(?:(?:,| and|, and) ${NAME})*)(?: (?:attracted|hatched)\\b[^.]*?)? (?:will (?:still )?)?(?:has|have) an increased chance (?:of being|to be) Shiny`, "u");
const splitNames = s => s.split(/,\s*(?:and\s+)?|\s+and\s+/).map(n => n.replace(/^Shiny /, "").trim()).filter(Boolean);
export const species = label => String(label).replace(/^[^·:]*[·:]\s*/, "").replace(/\(.*$/, "").replace(/^Mega /i, "").trim().toLowerCase();

// Only real Pokémon names become chips ("Shiny Pokémon" is not a species).
const DEX = new Set(JSON.parse(readFileSync(new URL("../public/dex.json", import.meta.url), "utf8")).map(r => String(r[1]).toLowerCase()));
const isSpecies = n => DEX.has(species(n)) || DEX.has(species(n).replace(/^(?:alolan|galarian|hisuian|paldean) /, ""));

// Imported-only (leekduck:*) events: a single-source row counts only when it states "increased chance" outright.
const explicitBoost = r => /increased chance/i.test(rowText(r));
export function deriveHighlights(details, { explicitSingle = false } = {}) {
  const out = [], rows = [];
  for (const list of Object.values(details?.fields || {})) if (Array.isArray(list)) rows.push(...list);
  const chip = (type, prefix, n) => { if (isSpecies(n) && !out.some(o => o.type === type && species(o.label) === species(n))) out.push({ type, label: `${prefix} · ${n}` }); };
  const trusted = rows.filter(r => trustedRow(r) || (explicitSingle && r && typeof r === "object" && explicitBoost(r)));
  for (const r of trusted) {
    const t = rowText(r).replace(/\*/g, "");
    for (const m of t.matchAll(SHINY_RE)) for (const n of splitNames(m[1])) chip("boosted-shiny", "BOOSTED SHINY", n);
    const a = SHINY_AFTER_RE.exec(t);
    if (a) for (const n of splitNames(a[1])) chip("boosted-shiny", "BOOSTED SHINY", n);
  }
  const feat = (details?.fields?.featured || []);
  feat.forEach((r, i) => {
    if (!trustedRow(r) || !/^Mega-Evolved Pok[eé]mon Debut$/i.test(rowText(r).trim())) return;
    const next = feat[i + 1], m = next && trustedRow(next) && /^(Mega [A-Z][\p{L}'.\-]*(?: [XYZ])?)\*?$/u.exec(rowText(next).trim());
    if (m) chip("debut", "DEBUT", m[1]);
  });
  return out.sort((a, b) => (b.type === "debut") - (a.type === "debut"));
}

// Adds derived chips that no hand-written chip of the same type and species already covers.
export function mergeDerived(existing, derived) {
  const have = Array.isArray(existing) ? existing.slice() : [];
  const seen = new Set(have.map(h => `${h?.type}|${species(h?.label)}`));
  for (const d of derived) { const k = `${d.type}|${species(d.label)}`; if (!seen.has(k)) { seen.add(k); have.push(d); } }
  return have;
}

export function applyDerived(data, detailsEvents) {
  const changes = [];
  for (const e of data.events || []) {
    const d = detailsEvents?.[e.id];
    if (!d) continue;
    const merged = mergeDerived(e.highlights, deriveHighlights(d));
    if (merged.length !== (e.highlights || []).length) { changes.push({ id: e.id, title: e.t, added: merged.slice((e.highlights || []).length) }); e.highlights = merged; }
  }
  return changes;
}

// Imported-only events (ids not in data.json, e.g. "leekduck:*") keep their chips on the event-details entry; the catalogue carries them to the app.
export function applyDerivedImported(data, detailsEvents) {
  const curated = new Set((data.events || []).map(e => e.id)), changes = [];
  for (const [id, d] of Object.entries(detailsEvents || {})) {
    if (curated.has(id) || !d || typeof d !== "object") continue;
    const merged = mergeDerived(d.highlights, deriveHighlights(d, { explicitSingle: id.startsWith("leekduck:") }));
    if (merged.length !== (d.highlights || []).length) { changes.push({ id, title: d.name, added: merged.slice((d.highlights || []).length) }); d.highlights = merged; }
  }
  return changes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const DATA = process.env.DATA_FILE || "public/data.json", DET = process.env.EVENT_DETAILS_FILE || "public/event-details.json";
  const data = JSON.parse(await readFile(DATA, "utf8")), det = JSON.parse(await readFile(DET, "utf8"));
  const changes = applyDerived(data, det.events || {}).concat(applyDerivedImported(data, det.events || {}));
  for (const c of changes) console.log(`${c.id} (${c.title}): +${c.added.map(h => h.label).join(", ")}`);
  if (process.argv.includes("--check")) { if (changes.length) { console.error("derived highlights are stale: run node scripts/derive-highlights.mjs"); process.exit(1); } }
  else if (changes.length) { const rawD = await readFile(DET, "utf8"); await writeFile(DET, JSON.stringify(det, null, rawD.includes('\n "') ? 1 : 0) + (rawD.endsWith("\n") ? "\n" : "")); const raw = await readFile(DATA, "utf8"); await writeFile(DATA, JSON.stringify(data, null, raw.includes('\n  "') ? 2 : 0) + (raw.endsWith("\n") ? "\n" : "")); }
  console.log(changes.length ? `${changes.length} event(s) updated` : "no derived highlights to add");
}
