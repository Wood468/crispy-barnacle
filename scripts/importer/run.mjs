#!/usr/bin/env node
// Reads event write-ups from several sources, compares them, and writes public/event-details.json.
// Existing hand-checked data (data.json, event-info.json) is never changed; this adds a labelled "From the sources" layer.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { SOURCES, sourceFor } from "./sources.mjs";
import { discover, get } from "./discover.mjs";
import { extractFields, hasContent, researchOptions } from "./extract.mjs";
import { collectCanonicalSourceFacetAudit, worldSourceFacetCandidates } from "./source-facets-canonical-audit.mjs";
import { mergeSources } from "./compare.mjs";
import { pageTitle, htmlToLines } from "./text.mjs";
import { entriesFromPage, mergeWorld, collapseWorld, parseDateRange, placeOf, cleanTitle, tidyName, keepOldWorld, normUrl, sameWriteupRulings, preserveWorldSources, prioritizeWatchedPages, regionalSeedEntries, sharedArticleKey } from "./world.mjs";
import { matchEvent } from "../g47ix-review.mjs";
import { discoverIntl, entryFromIntlPage, INTL_PATTERN } from "./intl.mjs";
import { failRun } from "../fail-run.mjs";
import { extractEncounters, mergeEncounters, reconcileActivityEncounters, posterFromHtml } from "./encounters.mjs";
import catalogue from "../event-experience/build-catalogue.cjs";
import eventAdapter from "../../public/event-adapter.js";
import { announcementFromPage } from "./announcements.mjs";
import { selectArtwork } from "./artwork.mjs";
import { applyLineCorrections } from "./corrections.mjs";
import { pageArtworkIndex } from "./artwork.mjs";

const APP = process.env.APP_URL || "https://pogo.michaelpuff.com";
const OUT = process.env.OUT_FILE || "public/event-details.json";
const REPORT = process.env.REPORT_FILE || "data/importer-report.json";
const MAX_PAGES = +(process.env.MAX_PAGES || 80);
const WORLD_OUT = process.env.WORLD_FILE || "public/world-events.json";
const ARTWORK_OUT = process.env.ARTWORK_FILE || (OUT === "public/event-details.json" ? "public/event-artwork.json" : null);
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
    for (const e of j.events || []) evs.push({ id: String(e.id).replace(/^curated:/, ''), t: e.name, link: e.link || (e.reports || []).find(r => sourceFor(r.link))?.link || "", start: e.start, end: e.end, region: e.region || '', detailIds: [] });
  } catch { /* snapshot only */ }
  try {
    const curated = JSON.parse(await readFile("public/data.json", "utf8")).events || [];
    for (const e of curated) {
      const existing = evs.find(x => x.id === e.id);
      const detailIds = Array.isArray(e.detailIds) ? e.detailIds : [];
      const link = e.sourceUrl || e.link || "";
      if (existing) {
        existing.curated = true;
        existing.t = e.t || existing.t;
        existing.link = link || existing.link;
        existing.start = e.s || existing.start;
        existing.end = e.e || existing.end;
        existing.detailIds = detailIds;
        existing.activities = Array.isArray(e.activities) ? e.activities : [];
      } else evs.push({ id: e.id, t: e.t, link, start: e.s, end: e.e, detailIds, activities: Array.isArray(e.activities) ? e.activities : [], curated: true });
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
  let dateTexts = [
    ...(Array.isArray(page.fields?.dates) ? page.fields.dates : []),
    ...lineDates
  ].map(value => String(value || "").trim()).filter(Boolean);
  // A page's own "Dates:" line is its window. Other lines only mention later or earlier events ("starting with Into the Wild on November 9").
  const own = dateTexts.filter(value => /^dates?\s*:/i.test(value));
  if (own.length) dateTexts = own;
  const yearHint = Number(eventStart.slice(0, 4)) || new Date().getUTCFullYear();
  const ranges = dateTexts.map(value => parseDateRange(value, yearHint)).filter(Boolean);
  if (!ranges.length) return true; // Missing source dates are unknown, not evidence of a mismatch.
  return ranges.some(range => range.start <= eventEnd && range.end >= eventStart);
}

// Where a page says the event is (from its title only). "Pokémon GO Wild Area 2026: Mexico City" is the Mexico City event, never the global Into the Wild week.
export function titlePlaceConflict(page, event) {
  // A named installment ("GO Wild Area Global Meetup: Karlsruhe") is never matched by a page that does not name that installment (the shared Global page).
  const variant = String(event.t || event.name || "").split(":").slice(1).join(":").toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  const pageText = (String(page.title || "") + " " + String(page.url || "")).toLowerCase();
  if (variant.length && !variant.some(w => pageText.includes(w))) return true;
  const pagePlace = placeOf(String(page.title || ""), "");
  if (!pagePlace || !pagePlace.place.includes(",")) return false; // only a city/venue ("Mexico City, Mexico"), not a region ("Europe")
  const eventPlace = placeOf(String(event.t || event.name || "") + " " + String(event.place || ""), "");
  return !eventPlace || eventPlace.place !== pagePlace.place;
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
  try {
    const url = new URL(page.url), parts = url.pathname.split("/").filter(Boolean);
    // Stable source IDs also support non-Leek Duck write-ups. Explicitly
    // mapped Hub pages must join the curated event before fuzzy title matching.
    if (page.source === "leekduck" && /^(?:www\.)?leekduck\.com$/i.test(url.hostname) && parts.length === 2 && parts[0] === "events")
      return "leekduck:" + parts[1];
    if (page.source === "hub" && /^(?:www\.)?pokemongohub\.net$/i.test(url.hostname) && parts.length === 3 && parts[0] === "post" && parts[1] === "event")
      return "hub:" + parts[2];
    return "";
  } catch { return ""; }
}
// The live feed can list the same event under a source-derived id ("leekduck:into-the-wild-2026") next to the curated record ("into").
// A page that links to the feed record belongs to the curated record, so Event Details, Research and GO Pass read one merged entry.
function preferCurated(event, events) {
  if (!event || event.curated) return event;
  // A feed's source-derived ID may be explicitly linked by a curated
  // canonical event even when the titles differ ("Pokémon GO Wild Area
  // 2026: Global" vs "GO Wild Area: Global"). Prefer that exact relationship
  // before fuzzy name matching, so unrelated source/article snapshots cannot
  // overwrite a second, source-namespaced event record.
  const owned = events.find(e => e.curated && e !== event &&
    Array.isArray(e.detailIds) && e.detailIds.includes(event.id));
  if (owned) return owned;
  const key = v => String(v || "").toLowerCase().replace(/\b20\d\d\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const name = key(event.t || event.name);
  if (!name) return event;
  const twin = events.find(e => e.curated && e !== event && key(e.t || e.name) === name
    && String(e.start || "").slice(0, 10) <= String(event.end || event.start || "9999").slice(0, 10) && String(e.end || e.start || "9999").slice(0, 10) >= String(event.start || "").slice(0, 10));
  return twin || event;
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
    if (exact) { const pick = preferCurated(exact, events); return pageDatesOverlapEvent(page, pick) ? { event: pick, how: "detail-id" } : null; }
  }
  const normalUrl = value => {
    const text = String(value || "");
    return text.endsWith("/") ? text : text + "/";
  };
  const direct = events.find(e => e.link && normalUrl(e.link) === normalUrl(page.url) && compatible(e));
  if (direct) { const pick = preferCurated(direct, events); return pageDatesOverlapEvent(page, pick) ? { event: pick, how: "linked" } : null; }
  const candidates = events.filter(e => compatible(e) && !titlePlaceConflict(page, e));
  const m = matchEvent({ title: page.title || "" }, candidates);
  if (m && m.confidence === "high") {
    const event = candidates.find(e => e.id === m.eventId);
    const pick = preferCurated(event, events);
    if (pick && pageDatesOverlapEvent(page, pick)) return { event: pick, how: "title" };
  }
  return null;
}


function goPassRowText(value) {
  return typeof value === "string" ? value : String(value?.text || "");
}
function isGoPassRankRow(value) {
  return /^rank \d+(?: deluxe)?:/i.test(goPassRowText(value));
}

/** Preserve the last known-good rank rows if Leek Duck's structured GO Pass markup fails. */
export function preserveGoPassRows(out, old, byEvent) {
  for (const [id, { results }] of byEvent) {
    const failedLeekDuck = results.some(result =>
      result.source?.id === "leekduck" && result.fields?.goPassParseError
    );
    if (!failedLeekDuck || !old[id] || !out[id]) continue;
    const currentFields = out[id].fields || (out[id].fields = {});
    const previousFields = old[id].fields || {};
    let retained = 0;
    for (const field of ["tickets", "bonuses"]) {
      const current = Array.isArray(currentFields[field]) ? currentFields[field] : [];
      const previous = Array.isArray(previousFields[field]) ? previousFields[field] : [];
      const seen = new Set(current.map(goPassRowText));
      const currentRanks = new Set(current.filter(isGoPassRankRow).map(row => /^rank \d+/i.exec(goPassRowText(row))[0].toLowerCase()));
      const keep = previous.filter(row => {
        if (!isGoPassRankRow(row) || seen.has(goPassRowText(row))) return false;
        // A current source's reward for a rank wins over its older snapshot.
        if (field === "tickets" && currentRanks.has(/^rank \d+/i.exec(goPassRowText(row))[0].toLowerCase())) return false;
        seen.add(goPassRowText(row));
        return true;
      });
      currentFields[field] = current.concat(keep);
      retained += keep.length;
    }
    out[id].goPassParseWarning = retained
      ? "GO Pass source parsing failed; previously published rank rewards were retained."
      : "GO Pass source parsing failed; rank rewards could not be refreshed.";
    if (retained) {
      out[id].goPassRetainedAt = old[id].goPassRetainedAt || old[id].updated || null;
      const sources = out[id].sources || (out[id].sources = []);
      for (const source of old[id].sources || []) {
        if (!sources.some(value => value.id === source.id && value.url === source.url)) sources.push(source);
      }
    }
  }
  return out;
}


// Keep source-backed research during a temporary feed outage, but never keep
// outdated rows when the publishing page was actually fetched this run.
// Only tasks with an explicit source URL are eligible; prose is never promoted.
export function preserveUnfetchedResearchTasks(out, old, byEvent) {
  for (const [id, group] of byEvent) {
    const now = out[id], before = old[id];
    if (!now || !before || now.name !== before.name || (now.researchTasks || []).length) continue;
    const fetched = new Set(group.results.map(r => normUrl(r.source?.url || "")).filter(Boolean));
    const carried = (before.researchTasks || []).filter(task =>
      Array.isArray(task.sourceRefs) && task.sourceRefs.some(ref =>
        /^https:\/\//.test(ref.url || "") && !fetched.has(normUrl(ref.url)))
    );
    if (carried.length) now.researchTasks = carried;
  }
  return out;
}

// The API feed can supply a lightweight copy of an already curated event.
// Never let that copy drop an exactly matched, published source-backed activity
// schedule: its typed Raid / Max Hour bosses are authoritative for form IDs.
// This is an exact canonical-ID join, not a name or species guess.
export function sourceBackedActivitiesFor(id, event, curatedById) {
  const record=curatedById.get(id);
  const curated=record&&Array.isArray(record.activities)?record.activities:[];
  return curated.length?curated:(Array.isArray(event?.activities)?event.activities:[]);
}

async function main() {
  const events = await appEvents();
  let curatedById = new Map();
  try {
    const records = JSON.parse(await readFile("public/data.json","utf8")).events || [];
    curatedById = new Map(records.filter(record=>record&&typeof record.id==="string")
      .map(record=>[record.id,record]));
  } catch { /* API-only deployments still reconcile their own activity schedules */ }
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
      if (hasContent(fields) || lines.length) pages.push({ ...f, title, fields, lines, html });
      await new Promise(r => setTimeout(r, 400));
    } catch (e) { errors.push(f.url + ": " + e.message); }
  }
  // A network outage must never replace the last good catalogue with an empty import.
  if (!pages.length) throw new Error('Importer read no source pages; keeping the last published event snapshots');
  let dex=[];try{dex=JSON.parse(await readFile('public/dex.json','utf8'));}catch{/* exact unknown identities remain prose */}
  let artNames=[];try{artNames=Object.keys(JSON.parse(await readFile('public/art/index.json','utf8'))).map(url=>new URL(url,'https://app.invalid').searchParams.get('n')).filter(Boolean);}catch{/* optional asset aliases */}
  let costumeNames=[];try{const data=JSON.parse(await readFile('public/data.json','utf8'));const costumeDB=JSON.parse(await readFile('public/costumes.json','utf8'));eventAdapter.configureSpecies(dex);costumeNames=eventAdapter.costumeDescriptors(data,costumeDB);}catch{/* no inferred costumes */}
  let formData={f:[]};try{formData=JSON.parse(await readFile('public/forms.json','utf8'));}catch{/* undeclared forms remain source prose */}
  const rewardOptions=researchOptions({dex,names:artNames,costumes:costumeNames,forms:formData});
  for(const page of pages)page.fields=extractFields(page.html,rewardOptions);
  // Staging only: count additional verified-source claims for importer QA.
  // Do not merge these preliminary facets into published event-details data.
  // Exact source-facet auditing happens after generated world-event identities are resolved.
  const byEvent = new Map(), unmatched = [];
  for (const p of pages) {
    const hit = pickEvent(p, events);
    if (!hit) { unmatched.push({ source: p.source, title: p.title, url: p.url }); continue; }
    const arr = byEvent.get(hit.event.id) || { event: hit.event, results: [] };
    const s = SOURCES.find(x => x.id === p.source);
    p.fields.eventEncounters=extractEncounters(p.html,{dex,names:rewardOptions.pokemonNames,costumes:costumeNames});
    arr.results.push({ image:posterFromHtml(p.html,p.url), source: { id: s.id, name: s.name, trust: s.trust, url: p.url }, fields: p.fields });
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
    const splitArticles = new Set([...splitUrls].map(sharedArticleKey));
    for (const f of intl.found.slice(0, 40)) {
      if (splitArticles.has(sharedArticleKey(f.url))) continue; // do not recreate a country-only locale alias of split city events
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
  let world = mergeWorld(entries, SOURCE_NAMES).filter(w => w.ongoing || !w.start || (w.end || w.start) >= cutoff);
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
  // A source can belong to an independently discovered in-person world event
  // not present in the curated/API feed. Join only its explicit LeekDuck URL
  // and keep all ticket/move/research claims staging-only until publication QA.
  const sourceFacetStaging = collectCanonicalSourceFacetAudit(
    pages,events.concat(worldSourceFacetCandidates(world))
  ).report;
  await writeFile(WORLD_OUT, JSON.stringify({ updated: new Date().toISOString(), events: world }, null, 1) + "\n");
  let old = {}; try { old = JSON.parse(await readFile(OUT, "utf8")).events || {}; } catch { /* first run */ }
  const now = new Date().toISOString(), out = {};
  // Page-level promotional artwork index: every official / Leek Duck page's own og:image, with its page URL and retrieval date.
  // The catalogue joins it to any event that lists the page as its own source (never to hub round-ups).
  if (ARTWORK_OUT) {
    let previousIndex = {}; try { previousIndex = JSON.parse(await readFile(ARTWORK_OUT, "utf8")).pages || {}; } catch { /* first run */ }
    const index = pageArtworkIndex(pages, previousIndex, now);
    await writeFile(ARTWORK_OUT, JSON.stringify({ updated: now, pages: index }, null, 1) + "\n");
  }
  for (const [id, { event, results }] of byEvent) {
    const activitySchedule = sourceBackedActivitiesFor(id, event, curatedById);
    const merged = { ...mergeSources(results), ...reconcileActivityEncounters(mergeEncounters(results), activitySchedule, {dex,names:rewardOptions.pokemonNames,costumes:costumeNames}) };
    const selected = selectArtwork(event, results, { retrievedAt: now });
    // A temporary source outage must not erase previously verified art for the same event.
    const previous = old[id];
    const sameEvent = previous && previous.name === event.t;
    const retained = !selected.image && sameEvent && previous.imageProvenance && previous.image
      ? selectArtwork(event, [{ image: previous.image, source: { id: previous.imageProvenance.source === 'Pokémon GO (official)' ? 'official' : previous.imageProvenance.source === 'Leek Duck' ? 'leekduck' : 'other', name: previous.imageProvenance.source, url: previous.imageProvenance.sourceUrl } }], { retrievedAt: previous.imageProvenance.retrievedAt }) : null;
    const image = selected.image || (retained && retained.image) || null;
    const imageProvenance = selected.imageProvenance || (retained && retained.image ? previous.imageProvenance : null);
    const researchTasks = (merged.researchTasks || []).map(task => ({
      ...task, eventId: id, eventName: event.t,
      eventWindow: { start: event.start || null, end: event.end || null },
      checkedAt: now.slice(0, 10)
    }));
    out[id] = { name: event.t, image, imageProvenance, updated: now, sources: results.map(r => r.source), ...merged, researchTasks };
  }
  // Unmatched source articles are first-class announcements, not just diagnostics.
  for(const page of pages){
    if([...byEvent.values()].some(group=>group.results.some(result=>result.source.url===page.url)))continue;
    const announcement=announcementFromPage(page,{dex,names:rewardOptions.pokemonNames,costumes:costumeNames});if(!announcement)continue;
    const split=entriesFromPage(page),represented=split.length>0;
    const {native,...metadata}=announcement.internalValidation;
    const selectedArt=selectArtwork({t:announcement.title,start:announcement.schedule?.start,end:announcement.schedule?.end,link:page.url,place:announcement.location},[{image:announcement.image,source:announcement.sources[0]}],{retrievedAt:now});
    announcement.image=selectedArt.image;
    out[announcement.eventId]={name:announcement.title,researchTasks:(page.fields.researchTasks||[]).map(task=>({...task,eventId:announcement.eventId,eventName:announcement.title,eventWindow:{start:announcement.schedule?.start||null,end:announcement.schedule?.end||null},checkedAt:now.slice(0,10)})),updated:now,sources:announcement.sources,image:selectedArt.image,imageProvenance:selectedArt.imageProvenance,fields:Object.fromEntries(Object.entries(page.fields||{}).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.map(text=>typeof text==='string'?{text,sources:[page.source],status:page.source==='official'?'official':'single'}:text)])),
      ...(represented?{}:{normalizedEvent:announcement}),
      ...(split.length<=1?{pokemon:announcement.pokemon,encounters:announcement.encounters}:{}),
      internalValidation:metadata};
  }
  // Reconcile explicitly sourced, curated activity schedules into the imported
  // detail contract. Importer extraction can omit schedule prose when a feed
  // changes its headings; the validated curated schedule remains authoritative.
  try {
    const curated = JSON.parse(await readFile("public/data.json", "utf8")).events || [];
    for (const event of curated) {
      const detail = out[event.id];
      if (!detail || !Array.isArray(event.activities)) continue;
      const hours = event.activities.filter(a =>
        (a.kind === "raid-hour" || a.kind === "max-battle-hour") &&
        a.schedule?.timeBasis === "player-local" &&
        /^https:\/\//.test(a.sourceUrl || "") &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(a.schedule.start || "") &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(a.schedule.end || "")
      );
      if (!hours.length) continue;
      const first = hours[0].schedule;
      if (!hours.every(a => a.schedule.start.slice(11) === first.start.slice(11) &&
                               a.schedule.end.slice(11) === first.end.slice(11))) continue;
      const format = time => { const h = +time.slice(11,13), m = time.slice(14,16); return (h % 12 || 12) + (m === "00" ? "" : ":" + m) + (h >= 12 ? "pm" : "am"); };
      const title = hours.some(a => a.kind === "raid-hour") && hours.some(a => a.kind === "max-battle-hour")
        ? "Daily Raid Hour and Max Battle Hour" : hours[0].kind === "raid-hour" ? "Daily Raid Hour" : "Daily Max Battle Hour";
      const fullText = title + ": " + format(first.start) + " to " + format(first.end) + " local time; " +
        hours.map(a => a.schedule.start.slice(0,10) + " " + a.title).join("; ");
      // The Overview source-highlights widget intentionally caps rows at 240
      // characters. Keep its summary concise; full per-day activities remain
      // available in the structured schedule preview.
      const text = fullText.length <= 240 ? fullText :
        title + ": " + format(first.start) + " to " + format(first.end) + " local time, " +
        hours[0].schedule.start.slice(0,10) + " to " + hours[hours.length-1].schedule.start.slice(0,10) + ".";
      detail.fields ||= {};
      detail.fields.dates ||= [];
      if (!detail.fields.dates.some(row => row.text === text)) detail.fields.dates.push({
        text, sources: [...new Set(hours.map(a => a.sourceUrl))], status: "verified"
      });
    }
  } catch (error) { console.warn("Curated activity reconciliation skipped:", error.message); }
  preserveGoPassRows(out, old, byEvent);
  preserveUnfetchedResearchTasks(out, old, byEvent);
  // A feed-derived twin record (leekduck:<slug>) whose every source page is now read into the curated record is a duplicate: keeping it would show every task and Pokémon twice.
  const claimedUrls = new Set([...byEvent.values()].flatMap(group => group.results.map(result => normUrl(result.source.url))));
  let sameRulings = []; try { sameRulings = JSON.parse(await readFile("data/event-aliases.json", "utf8")).same || []; } catch { /* no rulings */ }
  const twinOfCurated = id => sameRulings.some(pair => Array.isArray(pair) && pair.includes(id) && pair.some(other => other !== id && out[other] && byEvent.has(other)));
  const absorbed = (v, id) => twinOfCurated(id) || ((v.sources || []).length > 0 && (v.sources || []).every(source => claimedUrls.has(normUrl(source.url || ""))));
  for (const [id, v] of Object.entries(old)) if (!out[id] && !absorbed(v, id) && Date.now() - Date.parse(v.updated || 0) < 45 * 864e5) out[id] = normaliseLegacyStatuses(v); // keep recent entries a source stopped listing, with current terminology
  try { applyLineCorrections(out, JSON.parse(await readFile("data/line-corrections.json", "utf8")).lines); } catch { /* optional */ }
  await mkdir("data", { recursive: true });
  await writeFile(OUT, JSON.stringify({ updated: now, events: out }, null, 1) + "\n");
  if (OUT === "public/event-details.json" && WORLD_OUT === "public/world-events.json") await catalogue.publish();
  const gaps = Object.entries(out).flatMap(([id, v]) => (v.gaps || []).map(g => ({ event: v.name, ...g })));
  try { await writeFile("data/importer-lines.json", JSON.stringify(pages.filter(p => /go-pass|pass/i.test(p.url)).map(p => ({ url: p.url, lines: p.lines.slice(0, 260) })), null, 1) + "\n"); } catch { /* debug only */ }
  const artworkCoverage = { selected: Object.values(out).filter(v => !!v.image && !!v.imageProvenance).length, missing: Object.values(out).filter(v => !v.image).length, legacyUnattributed: Object.values(out).filter(v => !!v.image && !v.imageProvenance).length, bySource: {} };
  for (const v of Object.values(out)) if (v.image && v.imageProvenance) { const source = v.imageProvenance.source || "Unknown"; artworkCoverage.bySource[source] = (artworkCoverage.bySource[source] || 0) + 1; }
  artworkCoverage.missingEvents = Object.entries(out).filter(([, v]) => !v.image).map(([id, v]) => ({ id, name: v.name, sources: (v.sources || []).map(s => s.url).filter(Boolean).slice(0, 2) })).slice(0, 100);
  await writeFile(REPORT, JSON.stringify({ runAt: now, artworkCoverage, sources: status, pagesRead: pages.length, events: Object.keys(out).length, worldEvents: world.length, worldUndated: world.filter(w => !w.start).map(w => w.name), unmatchedPages: unmatched.slice(0, 40), intl: intlStatus, serebiiSkipped: serebiiLeft.slice(0, 30), gaps: gaps.slice(0, 80), errors: errors.slice(0, 20), sourceFacetStaging }, null, 1) + "\n");
  console.log(`Read ${pages.length} pages for ${byEvent.size} events; ${unmatched.length} pages matched no event; ${errors.length} errors.`);
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(failRun);
