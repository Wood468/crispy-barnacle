// Pure logic for the Telegram jobs that run on the Worker's cron (and from the scripts/ command-line versions): no file or network access here.
export const APP = "https://pogo.michaelpuff.com";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const LEAGUE = /(great|ultra|master) league|battle league|\bcup\b|\bgbl\b/i;

const hhmm = s => { const m = /T(\d\d):(\d\d)/.exec(s || ""); if (!m || (m[1] === "00" && m[2] === "00")) return ""; const h = +m[1]; return " " + (h % 12 || 12) + (m[2] === "00" ? "" : ":" + m[2]) + (h < 12 ? "am" : "pm"); };
const artName = a => typeof a === "string" ? { n: a } : { n: a.n, shiny: a.shiny };

// Everything that touches the seven days from `from` (a YYYY-MM-DD string), as { day, text, art } rows, in order.
export function buildWeek(data, from, extraDrop = LEAGUE) {
  const d0 = new Date(from + "T00:00:00Z"), days = [];
  for (let i = 0; i < 7; i++) days.push(new Date(d0.getTime() + i * 864e5).toISOString().slice(0, 10));
  const last = days[6], rows = [];
  for (const e of data.events || []) {
    if (!e.s || extraDrop.test(e.t || "")) continue;
    const s = e.s.slice(0, 10), en = (e.e || e.s).slice(0, 10);
    if (en < from || s > last) continue;
    const long = (new Date(en) - new Date(s)) > 3 * 864e5;
    const day = s >= from ? s : from;
    rows.push({ day, text: (long ? (s < from ? "Ongoing: " : "Starts: ") : "") + e.t + (long ? "" : hhmm(e.s)) + (long ? " (until " + DOW[new Date(en + "T12:00Z").getUTCDay()] + " " + +en.slice(8) + ")" : ""), art: (e.art || []).slice(0, 2).map(artName) });
  }
  for (const x of data.spotlight || []) if (x.d >= from && x.d <= last) rows.push({ day: x.d, text: x.n + " Spotlight Hour 6pm" + (x.b ? " (" + x.b + ")" : ""), art: [{ n: x.n }] });
  for (const x of data.raidHour || []) if (x.d >= from && x.d <= last) rows.push({ day: x.d, text: x.n + " Raid Hour 6pm", art: [{ n: x.n }] });
  rows.sort((a, b) => a.day.localeCompare(b.day));
  return rows;
}
export function formatWeek(rows) {
  const by = new Map();
  for (const r of rows) { if (!by.has(r.day)) by.set(r.day, []); by.get(r.day).push(r.text); }
  const out = ["📅 Week ahead"];
  for (const [day, list] of by) { const d = new Date(day + "T12:00Z"); out.push("", DOW[d.getUTCDay()] + " " + d.getUTCDate() + " " + MON[d.getUTCMonth()]); for (const t of list.slice(0, 8)) out.push("• " + t); }
  if (!by.size) out.push("", "Nothing listed yet.");
  return out.join("\n") + "\n\n" + APP;
}
export function pictureUrls(rows, max = 6) {
  const seen = new Set(), urls = [];
  for (const r of rows) for (const a of r.art) {
    if (!a.n) continue; const key = a.n + (a.shiny ? "*" : ""); if (seen.has(key)) continue; seen.add(key);
    urls.push({ url: APP + "/api/art?n=" + encodeURIComponent(a.n) + (a.shiny ? "&shiny=1" : ""), caption: (a.shiny ? "Shiny " : "") + a.n });
    if (urls.length >= max) return urls;
  }
  return urls;
}


const MIN = 6e4;
// Melbourne wall-clock time as a number of milliseconds, read as if it were UTC, so it compares with the app's local-time strings.
export function melbourneNow(date = new Date()) {
  const s = new Intl.DateTimeFormat("sv-SE", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
  return Date.parse(s.replace(" ", "T") + "Z");
}
const local = iso => { const m = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)/.exec(iso || ""); return m ? { ms: Date.parse(m[1] + "T" + m[2] + ":" + m[3] + ":00Z"), midnight: m[2] === "00" && m[3] === "00" } : null; };
export const clock = iso => { const m = /T(\d\d):(\d\d)/.exec(iso || ""); if (!m) return ""; const h = +m[1]; return (h % 12 || 12) + (m[2] === "00" ? "" : ":" + m[2]) + (h < 12 ? "am" : "pm"); };
const soonArt = a => typeof a === "string" ? a : (a && a.n) || "";

// Things that begin between 10 and 75 minutes from `nowMs`, as { id, kind, title, start, startMs, art, note }.
export function startingSoon(data, nowMs, from = 10, to = 75) {
  const out = [], within = ms => ms - nowMs >= from * MIN && ms - nowMs <= to * MIN;
  for (const e of data.events || []) {
    const s = local(e.s), en = local(e.e || e.s); if (!s || s.midnight || LEAGUE.test(e.t || "")) continue;
    if (en && en.ms - s.ms > 24 * 36e5) continue; // seasons and multi-day events are not "starting soon" moments
    if (within(s.ms)) out.push({ id: "ev:" + (e.id || e.t) + ":" + e.s, link: e.id ? "cur:" + e.id : "", kind: "event", title: e.t, start: e.s, startMs: s.ms, end: e.e, art: (e.art || []).map(soonArt).filter(Boolean).slice(0, 1), note: "" });
  }
  for (const x of data.spotlight || []) { const s = local(x.d + "T18:00"); if (s && within(s.ms)) out.push({ id: "spot:" + x.d, link: "cur:spot-" + x.d, kind: "spot", title: x.n + " Spotlight Hour", start: x.d + "T18:00", startMs: s.ms, art: [x.n], note: x.b || "" }); }
  for (const x of data.raidHour || []) { const s = local(x.d + "T18:00"); if (s && within(s.ms)) out.push({ id: "rh:" + x.d, link: "cur:rh-" + x.d, kind: "raidhour", title: x.n + " Raid Hour", start: x.d + "T18:00", startMs: s.ms, art: [x.n], note: "" }); }
  for (const r of data.rotation || []) {
    const s = local(r.s); if (!s || s.midnight || !within(s.ms)) continue;
    const bosses = [["5★", r.five], ["", r.mega], ["", r.shadow]].map(([p, b]) => b ? (p ? p + " " : "") + String(b).replace(/, to .*/, "").trim() : "").filter(Boolean);
    if (!bosses.length) continue;
    out.push({ id: "rot:" + r.s, kind: "rotation", title: "New raid bosses", start: r.s, startMs: s.ms, art: [String(r.five || r.mega || "").replace(/^Mega /, "").replace(/ \(.*/, "")].filter(Boolean), note: bosses.join(" · ") });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}
const ICON = { spot: "🌟", raidhour: "⚔️", event: "🎉", rotation: "🔄" };
export function messageFor(it, nowMs) {
  const mins = Math.max(5, Math.round((it.startMs - nowMs) / MIN / 5) * 5), when = mins >= 55 ? "in about an hour" : "in about " + mins + " min";
  const lines = ["⏰ " + it.title + " " + (it.kind === "rotation" ? "start " : "starts ") + when + " (" + clock(it.start) + (it.end && it.kind === "event" ? "–" + clock(it.end) : "") + ")"];
  if (it.note) lines.push((ICON[it.kind] || "•") + " " + it.note);
  lines.push("", it.link ? APP + "/#event=" + encodeURIComponent(it.link) : APP); // opens straight onto the event
  return lines.join("\n");
}
export const pending = (items, state) => items.filter(i => !new Set((state && state.sent) || []).has(i.id));
// Quiet hours: nothing is sent between 10pm and 7am Melbourne time.
export const quiet = nowMs => { const h = new Date(nowMs).getUTCHours(); return h >= 22 || h < 7; };

