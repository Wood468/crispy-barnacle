// Checks our event dates and times against Leek Duck's events list, which carries a machine-readable start and end for each event.
// Writes data/schedule-audit.json: dates that differ, and events on Leek Duck that we do not list.
// Run: node scripts/schedule-audit.mjs   (needs a network that can reach leekduck.com, such as GitHub Actions)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { routed } from "../src/tgroute.js";
import { OFFICIAL_HOSTS } from "../src/pipeline.js";

const SKIP = /^(go-battle-league|max-mondays|raid-battles|twitch-drops|raid-hour|pok.mon-spotlight-hour|go-pass|season|research)$/; // a season, the GO Pass and promo research are not events in the app
export function parseList(html) {
  const out = [], seen = new Set();
  for (const m of String(html).matchAll(/<span class="event-header-item-wrapper"([^>]*)>\s*<a[^>]*href="\/events\/([^"/]+)\/?"/g)) {
    const attr = k => (new RegExp(k + '="([^"]*)"').exec(m[1]) || [])[1];
    const slug = m[2]; if (seen.has(slug)) continue; seen.add(slug);
    out.push({ slug, type: attr("data-event-type"), start: attr("data-event-start-date-check"), end: attr("data-event-end-date"), local: attr("data-event-local-time") === "true" });
  }
  return out;
}
const words = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(w => w.length > 2);
// Words that say what the event is, not which one: the slug and the title are compared on these.
const GENERIC = new Set(["pokemon", "pok", "mon", "the", "and", "for", "with", "event", "update", "rescheduled", "global", "debut", "debuts", "one", "part", "2026", "2027", "2025"]);
const sig = s => new Set(words(String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")).filter(w => !GENERIC.has(w) && !/^\d+$/.test(w)));
const day = s => String(s || "").slice(0, 10);
const overlaps = (a1, a2, b1, b2) => day(a1) && day(b1) && day(a1) <= day(b2 || b1) && day(b1) <= day(a2 || a1);
// Same event under a different name: enough shared key words, and the dates overlap unless almost every word agrees.
export function fuzzy(name, s, e, t) {
  const a = sig(name), b = sig(t.slug.replace(/-/g, " ")); let n = 0; for (const w of a) if (b.has(w)) n++;
  const covers = b.size ? n / b.size : 0;
  if (n >= 1 && n === a.size && n === b.size && day(s) === day(t.start)) return true; // the same single key word and the same start day
  return n >= 3 && covers >= 0.6 || (n >= 2 && covers >= 0.5 && overlaps(s, e, t.start, t.end));
}
export function match(ours, theirs) {
  const bySlug = theirs.find(t => ours.sourceUrl && ours.sourceUrl.includes("/" + t.slug + "/"));
  if (bySlug) return bySlug;
  const w = words(ours.t);
  const cands = w.length ? theirs.filter(t => w.every(x => t.slug.includes(x))) : [];
  // Two events can share a name (the Super Mega Raid Days): take the one that starts nearest to ours.
  const gap = t => Math.abs(Date.parse(t.start) - Date.parse(ours.s)) || 0;
  return cands.sort((a, b) => gap(a) - gap(b))[0] || theirs.find(t => fuzzy(ours.t, ours.s, ours.e, t)) || null;
}
const min = s => String(s).slice(0, 16);
function hasOfficialSource(event) {
  return (event.sources || []).some(source => {
    try {
      const url = new URL(String(source && source.url || ""));
      return url.protocol === "https:" && OFFICIAL_HOSTS.includes(url.hostname);
    } catch { return false; }
  });
}
// World events (public/world-events.json) carry dates only; a Leek Duck page in their sources identifies them.
function matchWorld(w, theirs) {
  const hit = (w.sources || []).map(s => theirs.find(t => String(s.url || "").includes("/" + t.slug + "/"))).find(Boolean);
  if (hit) return hit;
  const ws = words(w.name); const exact = ws.length ? theirs.find(t => ws.every(x => t.slug.includes(x))) : null;
  return exact || theirs.find(t => fuzzy(w.name, w.start, w.end, t)) || null;
}
export function auditWorld(world, theirs, used = new Set()) {
  const fixes = [], conflicts = [];
  for (const w of world) {
    const t = matchWorld(w, theirs); if (!t) continue;
    used.add(t.slug);
    if (!t.local) continue;
    const s = String(t.start).slice(0, 10), e = String(t.end).slice(0, 10);
    if (w.start === s && w.end === e) continue;
    const change = { id: w.id, name: w.name, slug: t.slug, from: [w.start, w.end], to: [s, e] };
    // Leek Duck is a useful cross-check, but it must not silently overwrite dates
    // attached to an official Pokémon GO source. Keep the discrepancy for review.
    if (hasOfficialSource(w)) conflicts.push({ ...change, reason: "official_source_present" });
    else fixes.push(change);
  }
  return { fixes, conflicts };
}
export function audit(events, theirs, world = []) {
  const problems = [], used = new Set();
  const worldAudit = auditWorld(world, theirs, used);
  const worldFixes = worldAudit.fixes;
  for (const e of events) {
    const t = match(e, theirs); if (!t) continue;
    used.add(t.slug);
    if (!t.local) continue; // times given in UTC are not comparable with local-time entries
    if (min(e.s) !== min(t.start)) problems.push({ id: e.id, name: e.t, field: "start", ours: e.s, leekduck: t.start, slug: t.slug });
    if (min(e.e) !== min(t.end)) problems.push({ id: e.id, name: e.t, field: "end", ours: e.e, leekduck: t.end, slug: t.slug });
  }
  const missing = theirs.filter(t => !used.has(t.slug) && !SKIP.test(t.type || "")).map(t => ({ slug: t.slug, type: t.type, start: t.start, end: t.end }));
  return { problems, missing, worldFixes, worldConflicts: worldAudit.conflicts };
}
// An event on Leek Duck's list that the app lacks is added to the world list straight from that list's own dates.
// The name comes from the address; the next importer run keeps it (source.auto) and replaces it when a real write-up is read.
const REGIONAL = /city-safari|wild-area|tour|go-fest|safari-zone/;
export function prettyName(slug) {
  return String(slug).replace(/-(20\d\d)(-rescheduled)?$/, "").split("-").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ").replace(/^Pokemon Go /, "Pokémon GO ").replace(/\bGo\b/g, "GO");
}
export function addMissing(world, missing, now = new Date(), days = 120) {
  const added = [], limit = now.getTime() + days * 864e5, today = now.toISOString().slice(0, 10);
  for (const m of missing) {
    if (!m.start || !m.end || /[+Z]/.test(String(m.start).slice(19))) continue; // UTC times are not plain dates; leave those to the importer
    const s = String(m.start).slice(0, 10), e = String(m.end).slice(0, 10);
    if (Date.parse(s) > limit || e < today) continue;
    const id = "w-" + m.slug.replace(/-20\d\d.*$/, "").slice(0, 50);
    if (world.some(w => w.id === id || (w.sources || []).some(x => String(x.url || "").includes("/" + m.slug + "/")))) continue;
    const regional = REGIONAL.test(m.slug);
    const w = { id, name: prettyName(m.slug), place: "", area: "Worldwide", scope: regional ? "regional" : "global", start: s, end: e, datesKnown: true, sources: [{ id: "leekduck", name: "Leek Duck", url: "https://leekduck.com/events/" + m.slug + "/", auto: true }], status: "single", seen: today };
    world.push(w); added.push(w);
  }
  return added;
}

// Tell me on Telegram once about each new problem; data/audit-alerted.json remembers what was already sent.
export function newAlerts(res, done = [], now = new Date()) {
  const soon = now.getTime() + 75 * 864e5, out = [];
  for (const p of res.problems) out.push({ key: `p:${p.id}:${p.field}:${p.leekduck}`, text: `Date differs: ${p.name} ${p.field}. App ${p.ours}, Leek Duck ${p.leekduck}` });
  for (const f of res.worldFixes) out.push({ key: `f:${f.id}:${f.to.join(">")}`, text: `Fixed dates: ${f.name} now ${f.to[0]} to ${f.to[1]} (was ${f.from.join(" to ")})` });
  for (const c of res.worldConflicts || []) out.push({ key: `c:${c.id}:${c.to.join(">")}`, text: `Possible date conflict: ${c.name}. Leek Duck lists ${c.to[0]} to ${c.to[1]}, but an official source is attached; dates were left unchanged for review.` });
  for (const a of res.added || []) out.push({ key: `a:${a.id}`, text: `Added from Leek Duck: ${a.name} (${a.start} to ${a.end}). Name came from the web address, so check it.` });
  for (const m of res.missing) if (Date.parse(m.start) <= soon) out.push({ key: `m:${m.slug}`, text: `On Leek Duck, not in the app: ${m.slug} (${m.start.slice(0, 10)} to ${m.end.slice(0, 10)})` });
  return out.filter(a => !done.includes(a.key));
}
async function alert(res) {
  globalThis.fetch = routed(process.env, "system", globalThis.fetch);
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  let done = []; try { done = JSON.parse(await readFile("data/audit-alerted.json", "utf8")); } catch {}
  const fresh = newAlerts(res, done); if (!fresh.length) return;
  if (token && chat) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: "🔎 Data check\n" + fresh.map(a => "• " + a.text).join("\n") }) });
    if (!r.ok) throw new Error("Telegram " + r.status);
  }
  await writeFile("data/audit-alerted.json", JSON.stringify([...done, ...fresh.map(a => a.key)].slice(-300), null, 1) + "\n");
}
export async function main(fetchFn = fetch) {
  const r = await fetchFn("https://leekduck.com/events/", { headers: { "user-agent": "Mozilla/5.0 go-field-notes" } });
  if (!r.ok) throw new Error("Leek Duck events list: HTTP " + r.status);
  const theirs = parseList(await r.text());
  if (theirs.length < 5) throw new Error("Leek Duck list read " + theirs.length + " events; the page layout may have changed");
  const data = JSON.parse(await readFile("public/data.json", "utf8"));
  let wf = { events: [] }; try { wf = JSON.parse(await readFile("public/world-events.json", "utf8")); } catch {}
  const world = Array.isArray(wf) ? wf : wf.events || [];
  const res = audit(data.events || [], theirs, world);
  // Dates on world events are corrected straight from Leek Duck's machine-readable list.
  if (res.worldFixes.length) {
    for (const f of res.worldFixes) { const w = world.find(x => x.id === f.id); w.start = f.to[0]; w.end = f.to[1]; }
    await writeFile("public/world-events.json", JSON.stringify(wf, null, 1) + "\n");
  }
  res.added = [];
  if (world.length) { res.added = addMissing(world, res.missing); if (res.added.length) { wf.events = Array.isArray(wf) ? wf : world; await writeFile("public/world-events.json", JSON.stringify(wf, null, 1) + "\n"); res.missing = res.missing.filter(m => !res.added.some(a => a.sources[0].url.includes("/" + m.slug + "/"))); } }
  await alert(res).catch(e => console.log("alert skipped: " + e.message));
  await mkdir("data", { recursive: true });
  await writeFile("data/schedule-audit.json", JSON.stringify({ checked: new Date().toISOString(), compared: theirs.length, ...res }, null, 1) + "\n");
  console.log(`${theirs.length} events read, ${res.problems.length} dates differ, ${res.missing.length} not listed here`);
  for (const p of res.problems) console.log(`  ${p.name}: ${p.field} ours ${p.ours}, Leek Duck ${p.leekduck}`);
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(0); });
