// Venue times for in-person events (Night Out and similar): "7:30 p.m. PDT" at the venue becomes an exact instant.
// Shared by the daily digest (scripts/nudge.mjs) and the Worker's saved-event reminders (src/jobs.js).
// ---- events with a venue time (Night Out and similar): "7:30 p.m. PDT" there becomes your time here ----
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
// Hours from UTC for the zone names the event pages use (US zones are the ones in use for in-person events so far).
const TZ_OFF = { PDT: -7, PST: -8, MDT: -6, MST: -7, CDT: -5, CST: -6, EDT: -4, EST: -5, GMT: 0, UTC: 0, BST: 1, CET: 1, CEST: 2, EET: 2, EEST: 3, JST: 9, KST: 9, SGT: 8, HKT: 8, PHT: 8, ICT: 7, WIB: 7, AEDT: 11, AEST: 10, NZDT: 13, NZST: 12 };
const T = "(\\d{1,2})(?::(\\d\\d))?\\s*([ap])\\.?m\\.?";
const mins = (h, m, ap) => ((+h % 12) + (/p/i.test(ap) ? 12 : 0)) * 60 + (+m || 0);
// "Date: October 24, 2026 ... Night Out show starts: 7:30 p.m. PDT ... Doors open: 6:00 p.m. PDT" -> instants. Null unless it has a date, a start time and a zone it knows.
export function parseVenueTimes(text) {
  const t = String(text || "");
  const d = /\bDate:\s*([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/.exec(t);
  const z = /\b(PDT|PST|MDT|MST|CDT|CST|EDT|EST|GMT|UTC|BST|CEST|CET|EEST|EET|JST|KST|SGT|HKT|PHT|ICT|WIB|AEDT|AEST|NZDT|NZST)\b/.exec(t);
  const mo = d && MONTHS.indexOf(d[1].toLowerCase());
  if (!d || mo < 0 || !z) return null;
  const at = (h, m, ap) => Date.UTC(+d[3], mo, +d[2]) + mins(h, m, ap) * 6e4 - TZ_OFF[z[1]] * 36e5;
  const pick = re => { const m = new RegExp(re + "\\s*:\\s*" + T + "(?:\\s*(?:to|until|–|-)\\s*" + T + ")?", "i").exec(t); return m && { a: at(m[1], m[2], m[3]), b: m[4] ? at(m[4], m[5], m[6]) : null }; };
  const show = pick("(?:show starts|event time|start time|starts?)") , doors = pick("doors open"), end = pick("end time");
  if (!show) return null;
  const venue = (/(?:show starts|event time|start time|starts?)\s*:\s*(\d{1,2}(?::\d\d)?\s*[ap]\.?m\.?)/i.exec(t) || [])[1];
  return { start: show.a, end: show.b || (end && end.a) || null, doors: doors ? doors.a : null, zone: z[1], venue: venue ? venue.replace(/\./g, "").toLowerCase() : "" };
}
// Times a person typed in by hand for pages the importer could not read yet. Same shape; the importer's own reading wins when it has one.
const MANUAL = {
  "leekduck:pokemon-night-out-london-2026": "Date: November 10, 2026 Event time: 6:00 p.m. to 10:30 p.m. GMT Doors open: 6:00 p.m. GMT"
};

const TZ = "Australia/Melbourne";
const fmtTime = ms => new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms)).replace(/\s?([ap])m/i, (_, x) => " " + x.toLowerCase() + "m");
// Plain-words times in your zone for one venue item: { doors, show, end, venue }.
export function describeVenue(v) {
  return { doors: v.doorsMs ? fmtTime(v.doorsMs) : "", show: fmtTime(v.ms), end: v.endMs ? fmtTime(v.endMs) : "", venue: v.venueTime };
}
// Which venue items belong to a saved event: the same series (first three words of the name) inside the event's dates.
const words = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
// A venue in another time zone can fall a day either side of the event dates once shown in your zone.
const shift = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export function venueFor(name, startDay, endDay, venue) {
  const w = words(name).slice(0, 3).join(" ");
  const dayOf = ms => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ms));
  return w.split(" ").length < 3 ? [] : venue.filter(v => words(v.name).slice(0, 3).join(" ") === w && (!startDay || dayOf(v.ms) >= shift(startDay, -1)) && (!endDay || dayOf(v.ms) <= shift(endDay, 1)));
}

// Every event in event-details.json whose page gave a date, a start time and a zone (or that has a hand-entered entry above).
export function venueItems(details) {
  const out = [];
  for (const [id, ev] of Object.entries((details && details.events) || {})) {
    const texts = ((ev.fields && ev.fields.dates) || []).map(x => x.text);
    if (MANUAL[id]) texts.push(MANUAL[id]);
    const v = texts.map(parseVenueTimes).find(Boolean);
    if (v) out.push({ id: "v:" + id, name: ev.name || id, ms: v.start, endMs: v.end, doorsMs: v.doors, venueTime: v.venue + " " + v.zone, venue: true });
  }
  return out;
}
