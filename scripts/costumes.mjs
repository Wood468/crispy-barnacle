// Finds a picture for every costume Pokémon the site mentions. Names come from the event data and the compared write-ups;
// each candidate picture address is checked before it is saved, so the app only ever uses ones that exist.
// Run: node scripts/costumes.mjs   (writes public/costumes.json)
import { readFile, writeFile } from "node:fs/promises";

const BASE = "https://assets.dittobase.com/go/pokemon-unpadded/";
const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const SEREBII = "https://www.serebii.net/pokemongo/pokemon/";
const SEED = [["Machamp", "Modern Jacket"]];
// The announcement describes the outfit; Serebii names it by event. Only add one here when the event and outfit clearly match.
export const ALIAS = { "pikachu|hat and capelet": "halloween 2026" };
// Serebii lists every costume of a Pokémon on its page: <img src="/pokemongo/pokemon/068-jacket.png" title="Modern Jacket" class="formpic">
export function serebiiForms(html, id) {
  const pad = String(id).padStart(3, "0"), out = {};
  for (const m of String(html).matchAll(/<img[^>]*?src="\/pokemongo\/pokemon\/(\d{3})-([a-z0-9-]+)\.png"[^>]*?title="([^"]+)"[^>]*>/gi)) {
    if (m[1] !== pad) continue;
    out[m[3].toLowerCase()] = { url: `${SEREBII}${pad}-${m[2]}.png`, shiny: `${SEREBII}shiny/${pad}-${m[2]}.png` };
  }
  return out;
}
const read = async f => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return null; } };

export function collect(data, details) {
  const out = new Map();
  const add = (n, label) => { if (n && label && /^[A-Za-z' .-]{3,26}$/.test(label)) out.set(n.toLowerCase() + "|" + label.toLowerCase(), { n, label }); };
  const walk = x => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") { if (x.costume && x.n) add(x.n, x.label); Object.values(x).forEach(walk); }
  };
  walk(data);
  // "Machamp (Modern Jacket)" in the costume and featured lines of the compared write-ups
  for (const ev of Object.values((details && details.events) || {})) {
    for (const f of ["costumes", "featured"]) for (const it of (ev.fields && ev.fields[f]) || []) {
      for (const m of String(it.text).matchAll(/([A-Z][A-Za-zé'.-]+(?: [A-Z][A-Za-zé'.-]+)?)\s*\(([A-Z][A-Za-z' ]{2,24})\)/g)) add(m[1], m[2]);
    }
  }
  for (const [n, label] of SEED) add(n, label);
  return [...out.entries()];
}

// Serebii has a Gigantamax picture for every Pokémon that has one: /pokemongo/pokemon/NNN-gi.png (shiny under /shiny/).
export function gmaxNames(data, details) {
  const out = new Set(), add = n => { const m = /^Gigantamax (.+)$/i.exec(String(n).trim()); if (m) out.add(m[1].trim()); };
  const walk = x => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { if (typeof x.n === "string") add(x.n); Object.values(x).forEach(walk); } else if (typeof x === "string") for (const m of x.matchAll(/Gigantamax ([A-Z][A-Za-z.'-]+(?: [A-Z][a-z]+)?)/g)) out.add(m[1]); };
  walk(data); walk(details);
  for (const n of GMAX_KNOWN) out.add(n);
  return [...out];
}
const GMAX_KNOWN = ["Venusaur", "Charizard", "Blastoise", "Pikachu", "Eevee", "Meowth", "Machamp", "Gengar", "Kingler", "Lapras", "Snorlax", "Garbodor", "Butterfree", "Rillaboom", "Cinderace", "Inteleon", "Corviknight", "Orbeetle", "Drednaw", "Coalossal", "Flapple", "Appletun", "Sandaconda", "Toxtricity", "Centiskorch", "Hatterene", "Grimmsnarl", "Alcremie", "Copperajah", "Duraludon", "Urshifu"];

export async function main(fetchFn = fetch) {
  const [data, details, dex, old] = await Promise.all([read("public/data.json"), read("public/event-details.json"), read("public/dex.json"), read("public/costumes.json")]);
  const no = {}; for (const p of dex || []) no[String(p[1]).toLowerCase()] = p[0];
  const res = { updated: new Date().toISOString(), pictures: { ...((old && old.pictures) || {}) }, shiny: { ...((old && old.shiny) || {}) }, gmax: { ...((old && old.gmax) || {}) }, gmaxShiny: { ...((old && old.gmaxShiny) || {}) }, missing: [] };
  for (const n of gmaxNames(data, details)) {
    const key = ("gigantamax " + n).toLowerCase(), id = no[n.toLowerCase()]; if (!id || res.gmax[key]) continue;
    const pad = String(id).padStart(3, "0"), url = `${SEREBII}${pad}-gi.png`, sh = `${SEREBII}shiny/${pad}-gi.png`;
    try { const r = await fetchFn(url, { method: "HEAD", headers: { "user-agent": "Mozilla/5.0 go-field-notes" } }); if (r.ok) { res.gmax[key] = url; const q = await fetchFn(sh, { method: "HEAD" }); if (q.ok) res.gmaxShiny[key] = sh; } else res.missing.push(key); } catch { res.missing.push(key); }
  }
  const pages = {};
  for (const [key, { n, label }] of collect(data, details)) {
    if (res.pictures[key]) continue;
    const id = no[n.toLowerCase()]; if (!id) { res.missing.push(key + " (no dex number)"); continue; }
    try {
      if (!(id in pages)) { const r = await fetchFn(`${SEREBII}${String(id).padStart(3, "0")}.shtml`, { headers: { "user-agent": "Mozilla/5.0 go-field-notes" } }); pages[id] = r.ok ? serebiiForms(await r.text(), id) : {}; }
      const hit = pages[id][label.toLowerCase()] || (ALIAS[key] && pages[id][ALIAS[key]]);
      if (hit) { res.pictures[key] = hit.url; res.shiny[key] = hit.shiny; continue; }
    } catch { /* fall through to the second source */ }
    const url = `${BASE}${id}-${slug(n)}-${slug(label)}.png`;
    try { const r = await fetchFn(url, { method: "HEAD" }); if (r.ok) res.pictures[key] = url; else res.missing.push(key); }
    catch { res.missing.push(key); }
  }
  await writeFile("public/costumes.json", JSON.stringify(res, null, 1) + "\n");
  console.log(`${Object.keys(res.pictures).length} costume pictures found, ${res.missing.length} not found`);
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(0); });
