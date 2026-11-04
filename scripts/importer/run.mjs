#!/usr/bin/env node
// Reads event write-ups from several sources, compares them, and writes public/event-details.json.
// Existing hand-checked data (data.json, event-info.json) is never changed; this adds a labelled "From the sources" layer.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { SOURCES, sourceFor } from "./sources.mjs";
import { discover, get } from "./discover.mjs";
import { extractFields, hasContent } from "./extract.mjs";
import { mergeSources } from "./compare.mjs";
import { pageTitle, htmlToLines } from "./text.mjs";
import { entriesFromPage, mergeWorld, collapseWorld, parseDateRange, placeOf, cleanTitle, tidyName, keepOldWorld, normUrl, sameWriteupRulings, preserveWorldSources, prioritizeWatchedPages, regionalSeedEntries } from "./world.mjs";
import { matchEvent } from "../g47ix-review.mjs";
import { discoverIntl, entryFromIntlPage, INTL_PATTERN } from "./intl.mjs";
import { failRun } from "../fail-run.mjs";

const APP = process.env.APP_URL || "https://pogo.michaelpuff.com";
const OUT = process.env.OUT_FILE || "public/event-details.json";
const REPORT = process.env.REPORT_FILE || "data/importer-report.json";
const MAX_PAGES = +(process.env.MAX_PAGES || 80);
const WORLD_OUT = process.env.WORLD_FILE || "public/world-events.json";
const SEREBII = "https://www.serebii.net/pokemongo/reallifeevents.shtml";
const SOURCE_NAMES = Object.fromEntries(SOURCES.map(x => [x.id, x.name]).concat([["serebii", "Serebii"]]));

// Older generated snapshots used "confirmed" for agreement between multiple sources.
// Keep that distinct from official confirmation when preserving records across importer runs.
export function normaliseLegacyStatuses(value, inheritedTrust = null) {
  if (Array.isArray(value)) return value.map(item => normaliseLegacyStatuses(item, inheritedTrust));
  if (!value || typeof value !== "object") return value;
  const sourceRecords = Array.isArray(value.sources) && value.sources.some(s => s && typeof s === "object" && typeof s.id === "string");
  const trustBySource = sourceRecords
    ? new Map(value.sources.map(s => [s.id, s.trust || (s.id === "official" ? "official" : "")]))
    : inheritedTrust;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (key === "status" && (child === "confirmed" || child === "corroborated")) {
      const ids = Array.isArray(value.sources) ? value.sources : [];
      const hasOfficial = ids.some(s =>
        (typeof s === "string" && (s === "official" || trustBySource?.get(s) === "official")) ||
        (s && typeof s === "object" && (s.id === "official" || s.trust === "official"))
      );
      return [key, hasOfficial ? "official" : "corroborated"];
    }
    return [key, normaliseLegacyStatuses(child, trustBySource)];
  }));
}

// Serebii lists real-life events in a table: name, place, dates.
export function serebiiEvents(html, today = new Date().toISOString().slice(0, 10)) {
  const out = [];
  for (const l of htmlToLines(html)) {
    if (!l.text.includes(" | ")) continue;
    const cells = l.text.split(" | ").map(c => c.trim()).filter(Boolean);
    const range = parseDateRange(cells.slice(1).join(" . "), +today.slice(0, 4));
    if (!range || cells[0].length < 4) continue;
    if (!placeOf(cells.join(" "), "")) continue; // no place we can pin to an area: leave it out rather than guess
    const where = placeOf(cells.join(" "), ""), plain = cells.slice(1).find(c => !/\d{4}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(c)) || "";
    out.push({ name: cleanTitle(cells[0]), place: where ? where.place : plain, area: where ? where.area : "", scope: "regional", start: range.start, end: range.end, datesKnown: true, url: SEREBII, source: "serebii" });
  }
  return out;
}

// Rows Serebii lists with dates but no place we know: left out of the app, so they are named in the importer report instead of vanishing.
export function serebiiSkipped(html, today = new Date().toISOString().slice(0, 10)) {
  const out = [];
  for (const l of htmlToLines(html)) {
    if (!l.text.includes(" | ")) continue;
    const cells = l.text.split(" | ").map(c => c.trim()).filter(Boolean);
    if (cells[0].length >= 4 && parseDateRange(cells.slice(1).join(" . "), +today.slice(0, 4)) && !placeOf(cells.join(" "), "")) out.push(l.text.slice(0, 160));
  }
  return out;
}

export async function appEvents() {
  const evs = [];
  try {
    const j = await (await fetch(APP + "/api/events", { signal: AbortSignal.timeout(20000) })).json();
    for (const e of j.events || []) evs.push({ id: e.id, t: e.name, link: e.link || "", start: e.start, end: e.end, detailIds: [] });
  } catch { /* snapshot only */ }
  try {
    const curated = JSON.parse(await readFile("public/data.json", "utf8")).events || [];
    for (const e of curated) {
      const existing = evs.find(x => x.id === e.id);
      const detailIds = Array.isArray(e.detailIds) ? e.detailIds : [];
      const link = e.sourceUrl || e.link || "";
      if (existing) {
        existing.t = e.t || existing.t;
        existing.link = link || existing.link;
        existing.start = e.s || existing.start;
        existing.end = e.e || existing.end;
        existing.detailIds = detailIds;
      } else evs.push({ id: e.id, t: e.t, link, start: e.s, end: e.e, detailIds });
    }
  } catch { /* no snapshot */ }
  return evs;
}

function pageDatesOverlapEvent(page, event) {
  const eventStart = String(event.start || "").slice(0, 10);
  const eventEnd = String(event.end || event.start || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventStart) || !/^\d{4}-\d{2}-\d{2}$/.test(eventEnd) || eventEnd < eventStart) return true;

  // Prefer dates extracted under a Dates heading. If none were classified, inspect only
  // early article lines that actually contain a month/day, not arbitrary prose or metadata.
  const monthDay = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
  const lineDates = (page.lines || []).slice(0, 40).filter(line => monthDay.test(String(line.text || ""))).map(line => line.text);
  const dateTexts = [
    ...(Array.isArray(page.fields?.dates) ? page.fields.dates : []),
    ...lineDates
  ].map(value => String(value || "").trim()).filter(Boolean);
  const yearHint = Number(eventStart.slice(0, 4)) || new Date().getUTCFullYear();
  const ranges = dateTexts.map(value => parseDateRange(value, yearHint)).filter(Boolean);
  if (!ranges.length) return true; // Missing source dates are unknown, not evidence of a mismatch.
  return ranges.some(range => range.start <= eventEnd && range.end >= eventStart);
}

function eventPartNumber(value) {
  const pattern = new RegExp("\\bpart[\\s-]*(one|two|three|four|five|iv|iii|ii|i|[1-9]\\d*)\\b", "i");
  const m = pattern.exec(String(value || ""));
  if (!m) return null;
  const token = m[1].toLowerCase();
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const romans = { i: 1, ii: 2, iii: 3, iv: 4 };
  if (words[token]) return words[token];
  if (romans[token]) return romans[token];
  const n = Number(token);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function pageDetailId(page) {
  if (page.source !== "leekduck") return "";
  try {
    const parts = new URL(page.url).pathname.split("/").filter(Boolean);
    return parts.length === 2 && parts[0] === "events" ? "leekduck:" + parts[1] : "";
  } catch { return ""; }
}
export function pickEvent(page, events) {
  const pagePart = eventPartNumber(String(page.title || "") + " " + String(page.url || ""));
  const compatible = event => {
    const eventPart = eventPartNumber(event.t || event.name || "");
    return pagePart === null || eventPart === null || eventPart === pagePart;
  };
  // A Leek Duck detail ID is more precise than title matching: related Part I/II
  // write-ups can mention both date windows while containing different task tables.
  const detailId = pageDetailId(page);
  if (detailId) {
    const exact = events.find(e => Array.isArray(e.detailIds) && e.detailIds.includes(detailId) && compatible(e));
    if (exact) return pageDatesOverlapEvent(page, exact) ? { event: exact, how: "detail-id" } : null;
  }
  const normalUrl = value => {
    const text = String(value || "");
    return text.endsWith("/") ? text : text + "/";
  };
  const direct = events.find(e => e.link && normalUrl(e.link) === normalUrl(page.url) && compatible(e));
  if (direct) return pageDatesOverlapEvent(page, direct) ? { event: direct, how: "linked" } : null;
  const candidates = events.filter(compatible);
  const m = matchEvent({ title: page.title || "" }, candidates);
  if (m && m.confidence === "high") {
    const event = candidates.find(e => e.id === m.eventId);
    if (event && pageDatesOverlapEvent(page, event)) return { event, how: "title" };
  }
  return null;
}


async function main() {
  const events = await appEvents();
  const { found, status } = await discover();
  // every event's own source link is read too, so a linked write-up is never missed by discovery
  for (const e of events) if (e.link && sourceFor(e.link) && !found.some(f => f.url === e.link.replace(/\/?$/, "/"))) found.push({ source: sourceFor(e.link).id, url: e.link.replace(/\/?$/, "/"), title: e.t });
  // Curated watch pages are owner-selected and must be read before the capped feed results.
  let watchPages = [];
  try {
    watchPages = JSON.parse(await readFile("data/watch-pages.json", "utf8")).pages || [];
    for (const w of watchPages) {
      const u = String(w.url || "").replace(/\/?$/, "/"), s = sourceFor(u);
      if (s && !found.some(f => normUrl(f.url) === normUrl(u))) found.push({ source: s.id, url: u, title: w.note || "" });
    }
  } catch { /* no watch list */ }
  found.splice(0, found.length, ...prioritizeWatchedPages(found, watchPages.map(w => w.url)));
  const pages = [], errors = [];
  for (const f of found.slice(0, MAX_PAGES * 2)) {
    if (pages.length >= MAX_PAGES) break;
    try {
      const html = await get(f.url);
      const title = pageTitle(html) || f.title, fields = extractFields(html); if (fields.goPassParseError) errors.push(f.url + ": GO Pass parser: " + fields.goPassParseError);
      const lines = htmlToLines(html);
      if (hasContent(fields) || lines.length) pages.push({ ...f, title, fields, lines });
      await new Promise(r => setTimeout(r, 400));
    } catch (e) { errors.push(f.url + ": " + e.message); }
  }
  const byEvent = new Map(), unmatched = [];
  for (const p of pages) {
    const hit = pickEvent(p, events);
    if (!hit) { unmatched.push({ source: p.source, title: p.title, url: p.url }); continue; }
    const arr = byEvent.get(hit.event.id) || { event: hit.event, results: [] };
    const s = SOURCES.find(x => x.id === p.source);
    arr.results.push({ source: { id: s.id, name: s.name, trust: s.trust, url: p.url }, fields: p.fields });
    byEvent.set(hit.event.id, arr);
  }
  // Events the live feed does not list: regional, in-person, exclusive and new announcements
  const entries = [], splitUrls = new Set(); // splitUrls: pages that now give several entries
  for (const u of unmatched) { const pg = pages.find(p => p.url === u.url); if (!pg) continue; const found = entriesFromPage(pg); if (found.length > 1) splitUrls.add(normUrl(pg.url)); entries.push(...found); }
  // Official pages that exist only in another language (Japan, Korea, Taiwan): in-person events the English lists never show.
  let intlStatus = {};
  try {
    let knownWorld = []; try { knownWorld = JSON.parse(await readFile(WORLD_OUT, "utf8")).events || []; } catch { /* first run */ }
    const knownUrls = new Set(knownWorld.flatMap(w => (w.sources || []).map(x => String(x.url || "").replace(/\/?$/, "/"))));
    let watched = []; try { watched = (JSON.parse(await readFile("data/watch-pages.json", "utf8")).pages || []).map(w => w.url).filter(u => INTL_PATTERN.test(String(u).replace(/\/?$/, "/"))); } catch { /* none */ }
    const intl = await discoverIntl(get, watched); intlStatus = intl.status;
    for (const f of intl.found.slice(0, 40)) {
      if (knownUrls.has(f.url)) continue; // already in the app (read before, or added by hand): never a second entry
      try { const html = await get(f.url); const e = entryFromIntlPage({ ...f, title: pageTitle(html) || f.title, lines: htmlToLines(html) }); if (e) entries.push(e); await new Promise(r => setTimeout(r, 400)); } catch (err) { errors.push(f.url + ": " + err.message); }
    }
  } catch (e) { errors.push("intl: " + e.message); }
  let serebiiLeft = [];
  try { const sh = await get(SEREBII); entries.push(...serebiiEvents(sh)); serebiiLeft = serebiiSkipped(sh); } catch (e) { errors.push("serebii: " + e.message); }
  try { const seed = JSON.parse(await readFile("public/regional-events.json", "utf8")); entries.push(...regionalSeedEntries(seed)); } catch { /* no seed */ }
  const today = new Date().toISOString().slice(0, 10), cutoff = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  let oldWorld = []; try { oldWorld = JSON.parse(await readFile(WORLD_OUT, "utf8")).events || []; } catch { /* first run */ }
  let watchUrls = new Set(); try { watchUrls = new Set((JSON.parse(await readFile("data/watch-pages.json", "utf8")).pages || []).map(w => normUrl(w.url))); } catch { /* no watch list */ }
  let world = mergeWorld(entries, SOURCE_NAMES).filter(w => !w.start || (w.end || w.start) >= cutoff);
  const stopRulings = sameWriteupRulings(world.filter(w => (w.sources || []).length === 1));
  // Detect split destinations from this run before retaining only explicitly watched prior sources.
  world = preserveWorldSources(world, oldWorld, { watchUrls });
  for (const o of oldWorld) if (!world.some(w => w.id === o.id) && keepOldWorld(o, { cutoff, today, watchUrls, splitUrls })) world.push(o); // keep what a source stopped listing, for a while (until its end date when its official page is on the watch list)
  let rules = null; try { rules = JSON.parse(await readFile("data/event-aliases.json", "utf8")); } catch { /* no rulings yet */ }
  rules = { ...(rules || {}), different: [...((rules || {}).different || []), ...stopRulings] };
  const collapsed = collapseWorld(world, rules); world = collapsed.events.map(normaliseLegacyStatuses); // one event, one entry, however many sources or old ids; migrate retained legacy labels
  if (collapsed.merged.length) console.log("Joined duplicate events: " + collapsed.merged.map(m => m.dropped + " into " + m.kept).join("; "));
  // Short, readable names: headline-style titles from official news are tidied; data/name-overrides.json ({ id: name }) always wins.
  let nameFixes = {}; try { nameFixes = JSON.parse(await readFile("data/name-overrides.json", "utf8")).names || {}; } catch { /* none */ }
  world = world.map(w => ({ ...w, name: nameFixes[w.id] || ((w.sources || []).some(x => x.id === "official") && !(w.sources || []).some(x => x.auto) ? tidyName(w.name) : w.name) }));
  world = world.map(w => ({ ...w, seen: w.seen && !entries.some(e => e.name === w.name) ? w.seen : today })).sort((a, b) => String(a.start || "9").localeCompare(String(b.start || "9")));
  await writeFile(WORLD_OUT, JSON.stringify({ updated: new Date().toISOString(), events: world }, null, 1) + "\n");
  let old = {}; try { old = JSON.parse(await readFile(OUT, "utf8")).events || {}; } catch { /* first run */ }
  const now = new Date().toISOString(), out = {};
  for (const [id, { event, results }] of byEvent) {
    const merged = mergeSources(results);
    const researchTasks = (merged.researchTasks || []).map(task => ({
      ...task, eventId: id, eventName: event.t,
      eventWindow: { start: event.start || null, end: event.end || null },
      checkedAt: now.slice(0, 10)
    }));
    out[id] = { name: event.t, updated: now, sources: results.map(r => r.source), ...merged, researchTasks };
  }
  // If a source's structured GO Pass markup changes unexpectedly, retain the
  // last known-good rank rewards rather than replacing them with an empty list.
  for (const [id, { results }] of byEvent) {
    if (!results.some(r => r.fields.goPassParseError) || !old[id] || !out[id]) continue;
    for (const field of ["tickets", "bonuses"]) {
      const previousRows = (old[id][field] || []).filter(value => /^rank \\d+/i.test(String(value)));
      const currentRows = (out[id][field] || []).filter(value => !/^rank \\d+/i.test(String(value)));
      out[id][field] = [...new Set([...currentRows, ...previousRows])];
    }
    out[id].goPassParseWarning = "GO Pass source parsing failed; previously published rank rewards were retained.";
  }
  for (const [id, v] of Object.entries(old)) if (!out[id] && Date.now() - Date.parse(v.updated || 0) < 45 * 864e5) out[id] = normaliseLegacyStatuses(v); // keep recent entries a source stopped listing, with current terminology
  await mkdir("data", { recursive: true });
  await writeFile(OUT, JSON.stringify({ updated: now, events: out }, null, 1) + "\n");
  const gaps = Object.entries(out).flatMap(([id, v]) => (v.gaps || []).map(g => ({ event: v.name, ...g })));
  try { await writeFile("data/importer-lines.json", JSON.stringify(pages.filter(p => /go-pass|pass/i.test(p.url)).map(p => ({ url: p.url, lines: p.lines.slice(0, 260) })), null, 1) + "\n"); } catch { /* debug only */ }
  await writeFile(REPORT, JSON.stringify({ runAt: now, sources: status, pagesRead: pages.length, events: Object.keys(out).length, worldEvents: world.length, worldUndated: world.filter(w => !w.start).map(w => w.name), unmatchedPages: unmatched.slice(0, 40), intl: intlStatus, serebiiSkipped: serebiiLeft.slice(0, 30), gaps: gaps.slice(0, 80), errors: errors.slice(0, 20) }, null, 1) + "\n");
  console.log(`Read ${pages.length} pages for ${byEvent.size} events; ${unmatched.length} pages matched no event; ${errors.length} errors.`);
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(failRun);
