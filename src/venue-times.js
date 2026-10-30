// Venue times for in-person events (Night Out and similar).
// Parse the source's explicit clock and zone into an exact instant; never guess when the
// abbreviation conflicts with the IANA zone's offset on that date.
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const TZ_DEFAULT = "Australia/Melbourne";
// Daylight abbreviations map to an IANA region and are checked against that date.
// Ambiguous standard abbreviations use an IANA fixed-offset zone rather than guessing a city.
const ZONES = {
  PDT: { timeZone: "America/Los_Angeles", offsetMinutes: -420 },
  PST: { timeZone: "America/Los_Angeles", offsetMinutes: -480 },
  MDT: { timeZone: "America/Denver", offsetMinutes: -360 },
  MST: { timeZone: "Etc/GMT+7", offsetMinutes: -420 },
  CDT: { timeZone: "America/Chicago", offsetMinutes: -300 },
  CST: { timeZone: "Etc/GMT+6", offsetMinutes: -360 },
  EDT: { timeZone: "America/New_York", offsetMinutes: -240 },
  EST: { timeZone: "Etc/GMT+5", offsetMinutes: -300 },
  GMT: { timeZone: "Etc/UTC", offsetMinutes: 0 },
  UTC: { timeZone: "Etc/UTC", offsetMinutes: 0 },
  BST: { timeZone: "Europe/London", offsetMinutes: 60 },
  CET: { timeZone: "Etc/GMT-1", offsetMinutes: 60 },
  CEST: { timeZone: "Europe/Paris", offsetMinutes: 120 },
  EET: { timeZone: "Etc/GMT-2", offsetMinutes: 120 },
  EEST: { timeZone: "Europe/Helsinki", offsetMinutes: 180 },
  JST: { timeZone: "Asia/Tokyo", offsetMinutes: 540 },
  KST: { timeZone: "Asia/Seoul", offsetMinutes: 540 },
  SGT: { timeZone: "Asia/Singapore", offsetMinutes: 480 },
  HKT: { timeZone: "Asia/Hong_Kong", offsetMinutes: 480 },
  PHT: { timeZone: "Asia/Manila", offsetMinutes: 480 },
  ICT: { timeZone: "Asia/Bangkok", offsetMinutes: 420 },
  WIB: { timeZone: "Asia/Jakarta", offsetMinutes: 420 },
  AEDT: { timeZone: "Australia/Sydney", offsetMinutes: 660 },
  AEST: { timeZone: "Etc/GMT-10", offsetMinutes: 600 },
  NZDT: { timeZone: "Pacific/Auckland", offsetMinutes: 780 },
  NZST: { timeZone: "Etc/GMT-12", offsetMinutes: 720 }
};
const T = "(\\d{1,2})(?::(\\d\\d))?\\s*([ap])\\.?m\\.?";
const mins = (h, m, ap) => ((+h % 12) + (/p/i.test(ap) ? 12 : 0)) * 60 + (+m || 0);
function safeTimeZone(value) {
  try { new Intl.DateTimeFormat("en-AU", { timeZone: value }).format(0); return value; }
  catch { return TZ_DEFAULT; }
}
function offsetAt(timeZone, instant) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date(instant));
  const label = String((parts.find(x => x.type === "timeZoneName") || {}).value || "").replace(/\u2212/g, "-");
  const match = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(label);
  if (!match) return null;
  return match[1] ? (match[1] === "-" ? -1 : 1) * (+match[2] * 60 + (+match[3] || 0)) : 0;
}
function localClockToMs(year, month, day, minuteOfDay, timeZone, expectedOffset) {
  const hour = Math.floor(minuteOfDay / 60), minute = minuteOfDay % 60;
  const wallAsUtc = Date.UTC(year, month, day, hour, minute);
  const instant = wallAsUtc - expectedOffset * 60000;
  if (offsetAt(timeZone, instant) !== expectedOffset) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(instant)).map(x => [x.type, x.value]));
  if (+parts.year !== year || +parts.month !== month + 1 || +parts.day !== day || +parts.hour % 24 !== hour || +parts.minute !== minute) return null;
  return instant;
}
// "Date: October 24, 2026 ... show starts: 7:30 p.m. PDT" -> exact instant.
// Null unless the date, time, known zone and that zone's offset all agree.
export function parseVenueTimes(text) {
  const t = String(text || "");
  const d = /\bDate:\s*([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/.exec(t);
  const z = /\b(PDT|PST|MDT|MST|CDT|CST|EDT|EST|GMT|UTC|BST|CEST|CET|EEST|EET|JST|KST|SGT|HKT|PHT|ICT|WIB|AEDT|AEST|NZDT|NZST)\b/.exec(t);
  const mo = d && MONTHS.indexOf(d[1].toLowerCase()), zone = z && ZONES[z[1]];
  if (!d || mo < 0 || !zone) return null;
  const at = (h, m, ap) => localClockToMs(+d[3], mo, +d[2], mins(h, m, ap), zone.timeZone, zone.offsetMinutes);
  const pick = re => {
    const m = new RegExp(re + "\\s*:\\s*" + T + "(?:\\s*(?:to|until|–|-)\\s*" + T + ")?", "i").exec(t);
    if (!m) return null;
    const a = at(m[1], m[2], m[3]), b = m[4] ? at(m[4], m[5], m[6]) : null;
    return a == null || (m[4] && b == null) ? null : { a, b };
  };
  // Pokémon GO gameplay hours beat the show time, which is only a guide.
  const go = pick("(?:pok[eé]mon go|gameplay|in-game)(?: gameplay)?(?: hours| starts?| start time| time)?");
  const show = go || pick("(?:show starts|event time|start time|starts?)");
  const doors = pick("doors open"), end = pick("end time");
  if (!show) return null;
  const venue = (/(?:show starts|event time|start time|starts?)\s*:\s*(\d{1,2}(?::\d\d)?\s*[ap]\.?m\.?)/i.exec(t) || [])[1];
  return {
    start: show.a, end: show.b || (end && end.a) || null, doors: doors ? doors.a : null,
    zone: z[1], timeZone: zone.timeZone, offsetMinutes: zone.offsetMinutes,
    venue: venue ? venue.replace(/\./g, "").toLowerCase() : "", official: !!go
  };
}
// Times a person typed in by hand. Same shape; this wins over page text that can carry another city's date.
const MANUAL = {
  "leekduck:pokemon-night-out-london-2026": "Date: November 10, 2026 Event time: 6:00 p.m. to 10:30 p.m. GMT (unconfirmed for Pokémon GO)"
};
const fmt = (ms, timeZone, options) => new Intl.DateTimeFormat("en-AU", { timeZone, ...options }).format(new Date(ms));
const fmtTime = (ms, timeZone) => fmt(ms, timeZone, { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?([ap])m/i, (_, x) => " " + x.toLowerCase() + "m");
const fmtDay = (ms, timeZone) => fmt(ms, timeZone, { weekday: "short", day: "numeric", month: "short" });
// Return both the viewer's clock and the venue's clock; defaults preserve existing Melbourne reminder behaviour.
export function describeVenue(v, viewerTimeZone = TZ_DEFAULT) {
  const viewer = safeTimeZone(viewerTimeZone), venueZone = safeTimeZone(v.timeZone || "Etc/UTC");
  return {
    day: fmtDay(v.ms, viewer), show: fmtTime(v.ms, viewer), end: v.endMs ? fmtTime(v.endMs, viewer) : "",
    venueDay: fmtDay(v.ms, venueZone), venueShow: fmtTime(v.ms, venueZone),
    venueEnd: v.endMs ? fmtTime(v.endMs, venueZone) : "",
    zone: v.zone || "", timeZone: venueZone,
    note: v.unconfirmed ? "expected, Pokémon GO hours not confirmed yet" : ""
  };
}
// Which venue items belong to a saved event: the same series (first three words) inside the event's dates.
const words = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
const shift = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export function venueFor(name, startDay, endDay, venue, viewerTimeZone = TZ_DEFAULT) {
  const w = words(name).slice(0, 3).join(" "), zone = safeTimeZone(viewerTimeZone);
  const dayOf = ms => new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(ms));
  return w.split(" ").length < 3 ? [] : venue.filter(v => words(v.name).slice(0, 3).join(" ") === w && (!startDay || dayOf(v.ms) >= shift(startDay, -1)) && (!endDay || dayOf(v.ms) <= shift(endDay, 1)));
}
// Every event whose page supplied a date, start time and known zone (or has a reviewed manual entry above).
export function venueItems(details) {
  const out = [];
  for (const [id, ev] of Object.entries((details && details.events) || {})) {
    const texts = ((ev.fields && ev.fields.dates) || []).map(x => x.text);
    if (MANUAL[id]) texts.unshift(MANUAL[id]);
    const hit = texts.find(t => parseVenueTimes(t)), v = hit && parseVenueTimes(hit);
    const link = ((ev.sources || []).map(x => x && x.url).find(u => /^https:\/\/(www\.)?(leekduck|pokemongo)\.com\//.test(u || ""))) || "";
    if (v) out.push({
      id: "v:" + id, name: ev.name || id, ms: v.start, endMs: v.end, doorsMs: v.doors,
      venueTime: v.venue + " " + v.zone, zone: v.zone, timeZone: v.timeZone,
      unconfirmed: !v.official && /unconfirmed|not (yet )?(been )?confirmed/i.test(hit), link, venue: true
    });
  }
  return out;
}
