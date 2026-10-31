// Finds events the live feed does not list: in-person, regional and exclusive events, and new announcements.
// Read from write-ups that matched no feed event. Each gets a place, an area, dates and the sources that mention it.
import { createRequire } from "node:module";
import { similar } from "./compare.mjs";
const dd = createRequire(import.meta.url)("../../public/dedupe.js"); // the same rule the app and the daily audit use

const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const MONRE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// First date range in the text: "Oct 24 and 25", "October 24–25, 2026", "Tuesday, October 27, at 10 a.m. to Sunday, November 1, 2026".
export function parseDateRange(text, yearHint = new Date().getUTCFullYear()) {
  const t = String(text || "");
  const found = [];
  const mdy = new RegExp("\\b" + MONRE + "\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d|:)(?:,?\\s+(20\\d\\d))?", "gi");
  for (let m; (m = mdy.exec(t));) {
    const mo = MON[m[1].slice(0, 3).toLowerCase()], d = +m[2]; if (d < 1 || d > 31) continue;
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 24);
    const same = after.match(/^\s*(?:–|-|—|and|to|through|&)\s*(\d{1,2})(?!\d|:|\s*(?:a\.?m|p\.?m|[a-z]{3}))/i);
    const ty = m[3] ? +m[3] : (after.match(/^\s*(?:(?:–|-|—|and|to|through|&)\s*\d{1,2}(?:st|nd|rd|th)?)?,?\s+(20\d\d)\b/) || [])[1];
    found.push({ idx: m.index, mo, d, y: ty ? +ty : null, d2: same ? +same[1] : null });
  }
  const dmy = new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+" + MONRE + "\\b(?:,?\\s+(20\\d\\d))?", "gi");
  for (let m; (m = dmy.exec(t));) { const d = +m[1]; if (d >= 1 && d <= 31) found.push({ idx: m.index, mo: MON[m[2].slice(0, 3).toLowerCase()], d, y: m[3] ? +m[3] : null, d2: null }); }
  found.sort((a, b) => a.idx - b.idx);
  if (!found.length) return null;
  const y0 = found.find(f => f.y)?.y || yearHint;
  const a = found[0];
  let start = iso(a.y || y0, a.mo, a.d), end = start;
  if (a.d2 && a.d2 >= a.d) end = iso(a.y || y0, a.mo, a.d2);
  else {
    const b = found.find(f => f !== a && f.idx - a.idx < 140);
    if (b) { const e = iso(b.y || a.y || y0, b.mo, b.d); if (e >= start) end = e; }
  }
  return { start, end };
}

// [pattern, label, area]
const PLACES = [
  ["Changi|Singapore", "Singapore", "Asia"], ["Tokyo", "Tokyo, Japan", "Asia"], ["Sendai|Tohoku", "Sendai and Tohoku, Japan", "Asia"], ["Osaka", "Osaka, Japan", "Asia"], ["Yokohama", "Yokohama, Japan", "Asia"], ["Japan", "Japan", "Asia"],
  ["Seoul", "Seoul, South Korea", "Asia"], ["Busan", "Busan, South Korea", "Asia"], ["South Korea|Korea", "South Korea", "Asia"], ["New Taipei", "New Taipei, Taiwan", "Asia"], ["Taichung", "Taichung, Taiwan", "Asia"], ["Hsinchu", "Hsinchu, Taiwan", "Asia"], ["Tainan", "Tainan, Taiwan", "Asia"], ["Taoyuan", "Taoyuan, Taiwan", "Asia"], ["Taipei", "Taipei, Taiwan", "Asia"], ["Kaohsiung", "Kaohsiung, Taiwan", "Asia"], ["Taiwan", "Taiwan", "Asia"],
  ["Hong Kong", "Hong Kong", "Asia"], ["Bangkok", "Bangkok, Thailand", "Asia"], ["Thailand", "Thailand", "Asia"], ["Jakarta", "Jakarta, Indonesia", "Asia"], ["Indonesia", "Indonesia", "Asia"], ["Kuala Lumpur", "Kuala Lumpur, Malaysia", "Asia"], ["Malaysia", "Malaysia", "Asia"],
  ["Manila", "Manila, Philippines", "Asia"], ["Philippines", "Philippines", "Asia"], ["Mumbai", "Mumbai, India", "Asia"], ["Delhi", "Delhi, India", "Asia"], ["India", "India", "Asia"], ["Vietnam|Hanoi|Ho Chi Minh", "Vietnam", "Asia"], ["Shanghai", "Shanghai, China", "Asia"],
  ["Boston", "Boston, USA", "Americas"], ["Chicago", "Chicago, USA", "Americas"], ["New York", "New York, USA", "Americas"], ["Los Angeles", "Los Angeles, USA", "Americas"], ["San Francisco", "San Francisco, USA", "Americas"], ["Las Vegas", "Las Vegas, USA", "Americas"], ["Seattle", "Seattle, USA", "Americas"], ["Dallas", "Dallas, USA", "Americas"],
  ["Mexico City", "Mexico City, Mexico", "Americas"], ["Mexico", "Mexico", "Americas"], ["São Paulo|Sao Paulo", "São Paulo, Brazil", "Americas"], ["Brazil", "Brazil", "Americas"], ["Toronto", "Toronto, Canada", "Americas"], ["Vancouver", "Vancouver, Canada", "Americas"], ["Canada", "Canada", "Americas"],
  ["Buenos Aires", "Buenos Aires, Argentina", "Americas"], ["Santiago", "Santiago, Chile", "Americas"], ["Bogot[aá]", "Bogotá, Colombia", "Americas"], ["Lima", "Lima, Peru", "Americas"], ["United States|USA|U\\.S\\.", "USA", "Americas"],
  ["London", "London, UK", "Europe"], ["Paris", "Paris, France", "Europe"], ["Toulouse", "Toulouse, France", "Europe"], ["Berlin", "Berlin, Germany", "Europe"], ["Nuremberg", "Nuremberg, Germany", "Europe"], ["Madrid", "Madrid, Spain", "Europe"], ["Malaga|Málaga", "Málaga, Spain", "Europe"], ["Marseille", "Marseille, France", "Europe"], ["Lyon", "Lyon, France", "Europe"], ["Munich", "Munich, Germany", "Europe"], ["Incheon", "Incheon, South Korea", "Asia"], ["Nagasaki|Fukuoka|Fukushima", "Japan", "Asia"], ["Barcelona", "Barcelona, Spain", "Europe"], ["Valencia", "Valencia, Spain", "Europe"],
  ["Rome", "Rome, Italy", "Europe"], ["Milan", "Milan, Italy", "Europe"], ["Amsterdam", "Amsterdam, Netherlands", "Europe"], ["Noordwijk", "Noordwijk, Netherlands", "Europe"], ["Brussels", "Brussels, Belgium", "Europe"], ["Transinne", "Transinne, Belgium", "Europe"], ["Stockholm", "Stockholm, Sweden", "Europe"], ["Warsaw", "Warsaw, Poland", "Europe"], ["Lisbon", "Lisbon, Portugal", "Europe"], ["Europe", "Europe", "Europe"],
  ["Brisbane", "Brisbane, Australia", "Oceania"], ["Sydney", "Sydney, Australia", "Oceania"], ["Melbourne", "Melbourne, Australia", "Oceania"], ["Perth", "Perth, Australia", "Oceania"], ["Adelaide", "Adelaide, Australia", "Oceania"], ["Australia", "Australia", "Oceania"], ["Auckland", "Auckland, New Zealand", "Oceania"], ["New Zealand", "New Zealand", "Oceania"]
].map(([p, label, area]) => ({ re: new RegExp("\\b(?:" + p + ")\\b", "i"), label, area }));

export function placeOf(title, text) {
  for (const hay of [title, String(text || "").slice(0, 700)]) {
    const hits = PLACES.map(p => ({ p, i: hay.search(p.re) })).filter(x => x.i >= 0).sort((a, b) => a.i - b.i);
    if (hits.length) return { place: hits[0].p.label, area: hits[0].p.area };
  }
  return null;
}
// For a stop line, the city beats the country: "Taiwan: October 17–18, Taichung Central Park" is Taichung.
function placeOfStop(t) {
  const hits = PLACES.map(p => ({ p, i: t.search(p.re) })).filter(x => x.i >= 0).sort((a, b) => (b.p.label.includes(",") - a.p.label.includes(",")) || a.i - b.i);
  return hits.length ? { place: hits[0].p.label, area: hits[0].p.area } : null;
}
export const IN_PERSON = /pok[eé]mon[ -]run|city safari|safari zone|wild area|go fest|go tour|pok[eé]xciting|airport|in[- ]person|taking place at|venue|know before you go|anniversary|collaborat|partners? with|museum|stadium|pok[eé]mon center|go lab|\blab\b|tour\b|festival of lights|exclusive|only available in|limited to/i;
export const SKIP_NEWS = /this week in|news this week|weekly roundup|pok[eé]mon news/i;
const SKIP = /community day|spotlight hour|raid hour|raid day|max monday|battle league|go pass|season |research breakthrough|shadow raid/i;

// A long marketing headline ("Ready, set, GO! Join the Pokémon RUN 30 event near you!") is not the event's name: use the series name in it.
export function seriesName(t) {
  const m = /pok[eé]mon[ -]run(?:\s+\d+)?/i.exec(t);
  return m && t.length > m[0].length + 8 ? m[0].replace(/\s+/g, " ").replace(/^pok[eé]mon[ -]run/i, "Pokémon RUN") : t;
}
export function cleanTitle(t) { return String(t || "").replace(/\s*[—–|-]\s*Pok[eé]mon GO\s*$/i, "").replace(/\s+/g, " ").trim(); }

// Official news headlines make long names ("Celebrate the Festival of Lights with the return of Pikachu...!"). Keep the part that names the event.
export function tidyName(name) {
  let t = String(name || "").replace(/\s+/g, " ").trim();
  if (t.length <= 38) return t;
  const before = t;
  t = t.replace(/^(?:Celebrate|Join)\s+(?:the\s+)?/i, "");
  t = t.split(/\s+[—–]\s+|\s+for a chance\b|\s+with the return of\b|\s+and get\b/i)[0];
  t = t.replace(/[!.\s]+$/, "").trim();
  if (t.length < 8) return before;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// One write-up -> one world-events entry, or null when it is not a regional or new event.
export function fromPage(page, today = new Date().toISOString().slice(0, 10)) {
  const title = seriesName(cleanTitle(page.title));
  const text = (page.lines || []).map(l => l.text).join(" ");
  const dateText = [...(page.fields?.dates || []), ...(page.lines || []).slice(0, 40).map(l => l.text)].join(" . ");
  const range = parseDateRange(dateText, +today.slice(0, 4));
  const where = placeOf(title, text);
  const regional = IN_PERSON.test(title) || (!!where && IN_PERSON.test(text.slice(0, 600)));
  if (SKIP_NEWS.test(title)) return null;
  if (SKIP.test(title) && !where) return null;
  if (!regional && !range) return null;
  if (!regional) return { name: title, place: "", area: "Worldwide", scope: "global", start: range.start, end: range.end, datesKnown: true, url: page.url, source: page.source };
  return { name: title, place: where ? where.place : "", area: where ? where.area : "Worldwide", scope: "regional", start: range ? range.start : "", end: range ? range.end : "", datesKnown: !!range, url: page.url, source: page.source };
}

// A tour or series lists its stops, one per line: "Taiwan: October 17–18, 2026, Taichung Central Park". Each stop becomes its own entry,
// so the app shows every date and city instead of only the first one. Needs two or more stops in different places on different dates.
export function stopsFromPage(page, today = new Date().toISOString().slice(0, 10)) {
  const title = seriesName(cleanTitle(page.title));
  const text = (page.lines || []).map(l => l.text).join(" ");
  if (SKIP_NEWS.test(title) || !(IN_PERSON.test(title) || IN_PERSON.test(text.slice(0, 1500)))) return [];
  const stops = [], seen = new Set();
  for (const l of page.lines || []) {
    // Official announcements sometimes put multiple city/date stops in one paragraph.
    // Split before applying the per-stop length limit so the full paragraph is not discarded.
    const segments = String(l.text || "").split(/,\s*and\s+at\b/i);
    for (const segment of segments) {
      const t = String(segment || "").trim();
      if (t.length < 12 || t.length > 220) continue;
      const range = parseDateRange(t, +today.slice(0, 4)), where = range && placeOfStop(t);
      if (!where) continue;
      const key = where.place + "|" + range.start;
      if (seen.has(key)) continue;
      seen.add(key); stops.push({ where, range });
    }
  }
  if (stops.length < 2 || new Set(stops.map(s => s.where.place)).size < 2 || new Set(stops.map(s => s.range.start)).size < 2) return [];
  const city = s => s.where.place.split(",")[0], count = {};
  for (const s of stops) count[city(s)] = (count[city(s)] || 0) + 1;
  return stops.map(s => ({ name: title + ": " + city(s) + (count[city(s)] > 1 ? " (" + s.range.start + ")" : ""), place: s.where.place, area: s.where.area, scope: "regional", start: s.range.start, end: s.range.end, datesKnown: true, url: page.url, source: page.source }));
}
// A venue list with a date range per venue, under country headings:
//   "Singapore"  /  "Changi Airport: November 7, 2026 – February 28, 2027"  /  "Jewel: November 7, 2026 – January 31, 2027"
// Each venue becomes its own entry named "<series>: <venue>". Needs two or more venue lines; a heading is a short line that names a place.
export function venueStopsFromPage(page, today = new Date().toISOString().slice(0, 10)) {
  const title = cleanTitle(page.title).replace(/^pok[eé]mon go\s+(?:joins|partners with)\s+/i, "").replace(/[!.\s]+$/, "");
  const text = (page.lines || []).map(l => l.text).join(" ");
  if (SKIP_NEWS.test(title) || !(IN_PERSON.test(title) || IN_PERSON.test(text.slice(0, 1500)))) return [];
  const stops = [], seen = new Set();
  let ctx = null;
  for (const l of page.lines || []) {
    const t = String(l.text || "").replace(/^[\s•\-–]+/, "").trim();
    const head = t.replace(/^\[|\]$/g, "").trim();
    if (head.length >= 3 && head.length <= 30 && !/[\d:]/.test(head)) { const w = placeOf(head, ""); ctx = w && w.place.toLowerCase().includes(head.toLowerCase().split(/\s+/)[0]) ? w : null; continue; }
    const m = ctx && /^([^:]{3,50}):\s+(.{6,90})$/.exec(t);
    if (!m || /\d/.test(m[1])) continue;
    const range = parseDateRange(m[2], +today.slice(0, 4));
    if (!range) continue;
    const venue = /^[^a-z]+$/.test(m[1]) ? m[1].toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : m[1].trim();
    const key = ctx.place + "|" + venue;
    if (seen.has(key)) continue;
    seen.add(key); stops.push({ name: title + ": " + venue, place: ctx.place + " (" + venue + ")", area: ctx.area, scope: "regional", start: range.start, end: range.end, datesKnown: true, url: page.url, source: page.source });
  }
  return stops.length >= 2 ? stops : [];
}
// One write-up -> its entries: every stop of a multi-stop event, otherwise the single entry fromPage finds.
export function entriesFromPage(page, today) {
  const venues = venueStopsFromPage(page, today);
  if (venues.length) return venues;
  const stops = stopsFromPage(page, today);
  if (stops.length) return stops;
  const one = fromPage(page, today);
  return one ? [one] : [];
}

// Join entries that are the same event seen in several write-ups or lists.
export function mergeWorld(entries, sources) {
  const out = [];
  for (const e of entries) {
    const hit = out.find(o => similar(o.name, e.name) && !(o.name !== e.name && o.sources.some(x => x.url === e.url)) && (!o.start || !e.start || (o.start <= (e.end || e.start) && e.start <= (o.end || o.start))));
    const src = { id: e.source, name: sources[e.source] || e.source, url: e.url };
    if (hit) { if (!hit.sources.some(s => s.url === src.url)) hit.sources.push(src); if (!hit.start && e.start) { hit.start = e.start; hit.end = e.end; hit.datesKnown = true; } if (!hit.place && e.place) { hit.place = e.place; hit.area = e.area; } continue; }
    const slug = "w-" + e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
    let id = slug; for (let n = 2; out.some(o => o.id === id); n++) id = slug + "-" + (e.start || n);
    out.push({ id, name: e.name, place: e.place, area: e.area, scope: e.scope, start: e.start, end: e.end, datesKnown: e.datesKnown, sources: [src] });
  }
  return out.map(o => ({ ...o, status: o.sources.some(s => s.id === "official") ? "official" : o.sources.length > 1 ? "corroborated" : "single" }));
}

// Two entries built from the same write-up in one run are that announcement's separate stops (venues, cities), never one event:
// returns their id pairs as "different" rulings so the duplicate check cannot join "Mall Exploration: SM Davao" with "...: SM Marikina".
export function sameWriteupRulings(world) {
  const out = [];
  for (let i = 0; i < world.length; i++) for (let j = i + 1; j < world.length; j++) {
    const a = world[i], b = world[j];
    if ((a.sources || []).some(x => (b.sources || []).some(y => normUrl(x.url) === normUrl(y.url)))) out.push([a.id, b.id]);
  }
  return out;
}

// Whether an entry from the previous world-events file is kept when this run's sources did not list it.
// Normally for 30 days after it was last seen; an entry whose official page is on data/watch-pages.json (a hand-added tour leg, say)
// stays until its own end date passes. `watchUrls` is a Set of normalised page URLs (trailing slash, see normUrl).
export const normUrl = u => String(u || "").trim().toLowerCase().replace(/\/?$/, "/");
export function preserveWorldSources(current, previous = []) {
  const priorById = new Map((previous || []).filter(event => event && event.id).map(event => [event.id, event]));
  const identity = ["id", "name", "place", "area", "scope", "start", "end"];
  return (current || []).map(event => {
    const prior = priorById.get(event.id);
    if (!prior || identity.some(key => String(event[key] || "") !== String(prior[key] || ""))) return event;

    // Carry forward only exact, previously recorded source objects. Current event facts
    // (name, destination, dates and scope) always come from this run's source results.
    const sources = [...(Array.isArray(event.sources) ? event.sources : [])];
    for (const source of Array.isArray(prior.sources) ? prior.sources : []) {
      const url = normUrl(source?.url);
      if (!source?.id || !url || sources.some(existing => normUrl(existing?.url) === url)) continue;
      sources.push(source);
    }
    const status = sources.some(source => source.id === "official")
      ? "official"
      : sources.length > 1 ? "corroborated" : "single";
    return { ...event, sources, status };
  });
}

export function keepOldWorld(o, { cutoff, today, now = Date.now(), watchUrls = new Set(), splitUrls = new Set() }) {
  const srcs = o.sources || [];
  if (!srcs.length || !srcs.some(x => /official/i.test(x.name || "") || x.auto) || /this week|news this week/i.test(o.name)) return false;
  if (o.start && (o.end || o.start) < cutoff) return false;
  if (srcs.some(x => splitUrls.has(normUrl(x.url)))) return false; // its page now yields separate entries: do not bring the old combined one back
  if (now - Date.parse(o.seen || 0) < 30 * 864e5) return true;
  return !!o.start && (o.end || o.start) >= today && srcs.some(x => /official/i.test(x.name || "") && watchUrls.has(normUrl(x.url)));
}

// The same event kept under two ids (a title changed between runs, two sources worded it differently) becomes one entry.
// `rules` are the owner's own rulings from data/event-aliases.json. Returns { events, merged: [{ kept, dropped, why }] }.
export function collapseWorld(world, rules = null) {
  const rank = e => (e.sources || []).length * 10 + (e.place ? 3 : 0) + (e.status === "official" ? 5 : 0) - String(e.id || "").length / 100;
  const dated = world.filter(w => w.start), merged = [], drop = new Set();
  for (const g of dd.groups(dated, rules, rank)) {
    for (const { event: d, why } of g.dupes) {
      const k = g.keep;
      for (const s of d.sources || []) if (!(k.sources || []).some(x => x.url === s.url)) (k.sources = k.sources || []).push(s);
      if (!k.place && d.place) { k.place = d.place; k.area = d.area || k.area; }
      const span = e => (Date.parse(e.end || e.start) - Date.parse(e.start)) / 864e5;
      if (span(k) > 3 * 365 && span(d) <= 3 * 365) k.end = d.end; // a typo year (2076) on one copy
      if (k.scope === "global" && d.scope === "regional" && d.place) { /* keep the keeper's scope */ }
      drop.add(d); merged.push({ kept: k.id, dropped: d.id, why });
    }
  }
  const events = world.filter(w => !drop.has(w)).map(w => ({ ...w, status: (w.sources || []).some(s => s.id === "official") ? "official" : (w.sources || []).length > 1 ? "corroborated" : w.status || "single" }));
  return { events, merged };
}
