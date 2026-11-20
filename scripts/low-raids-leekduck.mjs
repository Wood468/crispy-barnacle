// Second source for the 1-3 star and Shadow raid bosses: Leek Duck's "Current Raid Bosses" page.
// Same safety as the Pokémon GO Hub path in low-raids.mjs, and stricter in two ways:
//  - the page is matched to a rotation only when its regular 5-star boss SET equals the rotation's 5-star set (not "any one of them");
//  - it only FILLS an empty "low" block. A block that already exists (from Hub, from a person, or from an earlier Leek Duck run) is never overwritten;
//    if an importer-written block disagrees with this page the conflict is reported and the first writer is kept.
// Any malformed or partial page changes nothing. An unreachable page changes nothing.
// Run through scripts/low-raids.mjs (after the Hub step). LEEKDUCK_HTML=<file> reads a saved page instead of fetching; DRY_RUN=true writes nothing.
import { readFile, writeFile } from "node:fs/promises";
import { toLines, cleanName, isBossName, saneList, norm, applyLow, isActiveRaidDay, SOURCE as HUB_SOURCE, LEEKDUCK_SOURCE } from "./low-raids.mjs";

export const LEEKDUCK_URL = "https://leekduck.com/raid-bosses/";
const TYPES = new Set("normal fire water electric grass ice fighting poison ground flying psychic bug rock ghost dragon dark steel fairy".split(" "));
const isType = l => TYPES.has(l.toLowerCase().replace(/\s+type(\s+icon)?$/, ""));
const CP = /^CP\s*\d[\d,]*(\s*[-–]\s*\d[\d,]*)?$/i;

// The page as plain lines. Works on the site's HTML and on its markdown rendering (images become their alt text).
export function pageLines(src) {
  const s = String(src || "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => (alt.trim() ? "\n" + alt.trim() + "\n" : "\n"))
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  return toLines(s).map(l => l.replace(/^#{1,6}\s*/, "").replace(/\*\*|__/g, "").trim()).filter(Boolean);
}

// { one, three, five, shadowOne, shadowThree } or null when the page is not in the expected shape.
// Each boss is a name line followed by its type lines and then a "CP a - b" line; a record whose name is not a Pokémon makes the whole page untrusted.
export function parseLeekDuck(src) {
  const lines = pageLines(src), out = { one: [], three: [], five: [], shadowOne: [], shadowThree: [] };
  let shadow = false, key = null; const seen = new Set();
  const heading = l => {
    if (/^Shadow Raids?$/i.test(l)) return { shadow: true, key: null };
    const m = /^(?:(Shadow)\s+)?([1-6])[\s-]*Star\s+Raids?$/i.exec(l);
    if (m) return { shadow: m[1] ? true : undefined, tier: +m[2] };
    return /^[A-Za-z' -]+\sRaids?$/i.test(l) ? { shadow: false, key: null } : null; // "Mega Raids", "Current Raid Bosses": ends the tier
  };
  for (let i = 0; i < lines.length; i++) {
    const h = heading(lines[i]);
    if (h && lines[i] === lines[i - 1]) continue; // markdown shows a heading icon's alt text and the heading text: same line twice
    if (h) {
      if (!h.tier) shadow = !!h.shadow; // "Shadow Raids" starts the Shadow part; any other raid heading ends it
      if (h.tier) { const k = ({ 1: "one", 3: "three", 5: "five" })[h.tier], sh = h.shadow === undefined ? shadow : h.shadow; key = k ? (sh ? (k === "five" ? null : "shadow" + k[0].toUpperCase() + k.slice(1)) : k) : null; if (key && seen.has(key)) key = null; if (key) seen.add(key); }
      else key = null;
      continue;
    }
    if (!CP.test(lines[i]) || (i > 0 && CP.test(lines[i - 1]))) continue; // first CP line of a record
    if (!key) continue; // not under a tier we use (Shadow 5-star, Mega, ...)
    let j = i - 1; while (j >= 0 && isType(lines[j])) j--;
    const name = j >= 0 ? cleanName(lines[j]) : "";
    if (!isBossName(name) || heading(lines[j])) return null; // a record without a recognisable boss name: do not trust the page
    out[key].push(key.startsWith("shadow") ? "Shadow " + name.replace(/^Shadow\s+/i, "") : name);
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])];
  return out;
}

export const sane = t => !!t && saneList(t.one, 1) && saneList(t.three, 1) && saneList(t.five, 1, 4) && saneList(t.shadowOne, 0) && saneList(t.shadowThree, 0);

// A rotation's "five" text ("Cresselia and Darkrai", "Giratina (Altered Forme)") as a set of normalised boss names.
const fiveSet = s => new Set(String(s || "").split(/\s*(?:,|&|\band\b)\s*/i).map(norm).filter(Boolean));
const sameSet = (a, b) => a.size > 0 && a.size === b.size && [...a].every(x => b.has(x));

// Current Leek Duck boss lists prove current low tiers only, not future ones.
export function matchRotation(rotation, five, nowMs = Date.now()) {
  const want = new Set(five.map(norm).filter(Boolean));
  const hits = (rotation || []).filter(r => isActiveRaidDay(r, nowMs) && sameSet(fiveSet(r.five), want));
  return hits.length === 1 ? hits[0] : null;
}

const key = l => JSON.stringify(["one", "three", "shadowOne", "shadowThree"].map(k => (l[k] || []).map(norm).sort()));
export const importerWrote = low => !!low && (String(low.source || "").startsWith(HUB_SOURCE) || low.source === LEEKDUCK_SOURCE);

// Decides what to do with a page. Pure: { action: "write"|"skip"|"conflict"|"untrusted", reason, rotation?, low? }.
export function planLeekDuck(html, rotation, nowMs = Date.now()) {
  const t = parseLeekDuck(html);
  if (!sane(t)) return { action: "untrusted", reason: "the page did not parse into sensible lists" };
  const r = matchRotation(rotation, t.five, nowMs);
  if (!r) return { action: "skip", reason: "the page's 5-star bosses (" + t.five.join(", ") + ") match no single active rotation" };
  const low = { one: t.one, three: t.three, ...(t.shadowOne.length ? { shadowOne: t.shadowOne } : {}), ...(t.shadowThree.length ? { shadowThree: t.shadowThree } : {}) };
  if (r.low) {
    if (!importerWrote(r.low)) return { action: "skip", reason: "the " + r.five + " rotation has hand-entered data from " + r.low.source + "; left alone", rotation: r };
    return key(r.low) === key(low)
      ? { action: "skip", reason: "agrees with the existing " + r.low.source + " data for " + r.five, rotation: r }
      : { action: "conflict", reason: "disagrees with the existing " + r.low.source + " data for " + r.five + " (kept as is). Existing: " + JSON.stringify({ one: r.low.one, three: r.low.three, shadowOne: r.low.shadowOne, shadowThree: r.low.shadowThree }) + " Leek Duck: " + JSON.stringify(low), rotation: r };
  }
  return { action: "write", reason: "filled " + r.five, rotation: r, low };
}

export async function leekDuckStage({ dry = false, dataFile = "public/data.json", html = process.env.LEEKDUCK_HTML, fetchPage, now = Date.now() } = {}) {
  let page;
  try {
    page = html ? await readFile(html, "utf8") : await (fetchPage || (async () => {
      const r = await fetch(LEEKDUCK_URL, { headers: { "user-agent": "GO-Field-Notes/1.0 (+https://pogo.michaelpuff.com)" }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }))();
  } catch (e) { console.log("::notice::1-3 star raids (Leek Duck): page not reachable (" + e.message + "). Nothing changed."); return { wrote: false, status: "unreachable" }; }
  const raw = await readFile(dataFile, "utf8"), data = JSON.parse(raw);
  const plan = planLeekDuck(page, data.rotation, now);
  if (plan.action === "untrusted") { console.log("::warning::1-3 star raids (Leek Duck): " + plan.reason + ". Nothing changed."); return { wrote: false, status: plan.action }; }
  if (plan.action === "conflict") { console.log("::warning::1-3 star raids (Leek Duck) CONFLICT: " + plan.reason); return { wrote: false, status: plan.action, reason: plan.reason }; }
  if (plan.action === "skip") { console.log("::notice::1-3 star raids (Leek Duck): " + plan.reason + "."); return { wrote: false, status: plan.action, reason: plan.reason }; }
  const iso = new Date(now).toISOString(), low = { ...plan.low, observed: iso.slice(0, 10), source: LEEKDUCK_SOURCE, sourceUrl: LEEKDUCK_URL, fetchedAt: iso };
  const out = applyLow(raw, plan.rotation.s, low), check = JSON.parse(out), was = JSON.parse(raw), idx = was.rotation.findIndex(x => x.s === plan.rotation.s);
  delete check.rotation[idx].low; // nothing but this rotation's low may differ
  if (JSON.stringify(check) !== JSON.stringify(was)) throw new Error("Safety check failed: the edit changed more than the low block. Not written.");
  if (dry) { console.log("Dry run (Leek Duck). Would set " + plan.rotation.five + " (" + plan.rotation.s + "):", JSON.stringify(low)); return { wrote: false, status: "dry", low }; }
  await writeFile(dataFile, out);
  console.log("::notice::1-3 star raids set from Leek Duck for " + plan.rotation.five + ": " + JSON.stringify(plan.low));
  return { wrote: true, status: "write", low };
}
