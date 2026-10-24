#!/usr/bin/env node
// A short Telegram note, at most once a day, and only when there is something new:
//   - infographics waiting for your approval
//   - events where the sources disagree
//   - events starting today or tomorrow (Community Day, Spotlight Hour, raid hours, regional events)
// With NUDGE_ONLY=queue (used right after the infographic search) it mentions only new infographics, straight away.
// It remembers what it already told you (data/nudge-state.json), so nothing is repeated.
// Needs two repository secrets, TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. Without them it only prints what it would send.
import { readFile, writeFile } from "node:fs/promises";
import { keyboard, hookSecret } from "../src/telegram.js";
import { routed } from "../src/tgroute.js";
import { localToMs, TZ_DEFAULT } from "../src/notify.js";

const APP = "https://pogo.michaelpuff.com";
const STATE = process.env.NUDGE_STATE || "data/nudge-state.json";
const hoursAhead = 36;

const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };
const day = s => String(s).slice(0, 10);

// Event times in data.json are written in each player's own local time, which for you is Melbourne/Sydney (the same clock), so they are shown as they are.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hasTime = s => /T\d\d:\d\d/.test(String(s || ""));
const clock = s => { const [h, m] = String(s).slice(11, 16).split(":").map(Number); return (h % 12 || 12) + ":" + String(m).padStart(2, "0") + " " + (h < 12 ? "am" : "pm"); };
const dateLabel = s => { const [, mo, d] = day(s).split("-").map(Number); return d + " " + MON[mo - 1]; };
// "2:00 pm–5:00 pm", "all day", "until 31 Oct", or "time not listed" when the source only gave a date.
export function whenText(i) {
  if (!hasTime(i.start)) return "time not listed";
  const multi = i.end && day(i.end) > day(i.start);
  if (i.start.slice(11, 16) === "00:00") return multi ? "until " + dateLabel(i.end) : "all day";
  if (i.end && hasTime(i.end) && !multi) return clock(i.start) + "–" + clock(i.end);
  return "from " + clock(i.start) + (multi ? " until " + dateLabel(i.end) : "");
}


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
const mel = (ms, o) => new Intl.DateTimeFormat("en-AU", { timeZone: TZ_DEFAULT, hour12: true, ...o }).format(new Date(ms)).replace(/\s?([ap])m/i, (_, x) => " " + x.toLowerCase() + "m");
const meltime = ms => mel(ms, { hour: "numeric", minute: "2-digit" });
const meldate = ms => day(localDay(ms));
function localDay(ms) { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ_DEFAULT, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return p.year + "-" + p.month + "-" + p.day; }
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

// Events the app knows about, as { id, name, start } with local start times.
export function upcoming(data, world, now = new Date(), details = null) {
  const items = [];
  for (const e of data.events || []) if (e.s) items.push({ id: "e:" + e.id, name: e.t, start: e.s, end: e.e });
  for (const x of data.spotlight || []) items.push({ id: "spot:" + x.d, name: x.n + " Spotlight Hour", start: x.d + "T18:00", end: x.d + "T19:00" });
  for (const x of data.raidHour || []) items.push({ id: "rh:" + x.d, name: x.n + " Raid Hour", start: x.d + "T18:00", end: x.d + "T19:00" });
  for (const w of (world && world.events) || []) if (w.start) items.push({ id: w.id, name: w.name + (w.place ? " (" + w.place + ")" : ""), start: w.start + "T00:00", end: w.end, place: w.place, dateOnly: true });
  // An event with a venue time replaces the date-only entry for the same city; its time is shown in your local time.
  const timed = venueItems(details);
  const cityOf = i => String(i.place || "").split(",")[0].trim().toLowerCase();
  const covered = i => i.dateOnly && cityOf(i) && timed.some(v => v.name.toLowerCase().includes(cityOf(i)));
  const all = items.filter(i => !covered(i)).concat(timed);
  const t0 = now.getTime(), t1 = t0 + hoursAhead * 36e5;
  return all.map(i => ({ ...i, ms: i.ms ?? (i.dateOnly ? new Date(i.start).getTime() : localToMs(i.start, TZ_DEFAULT)) })).filter(i => i.ms >= t0 - 2 * 36e5 && i.ms <= t1);
}

export function buildDigest({ queue, details, data, world, state = {}, now = new Date(), only = "" }) {
  const told = { queue: new Set(state.queue || []), conflicts: new Set(state.conflicts || []), events: new Set(state.events || []) };
  const lines = [], next = { queue: [...told.queue], conflicts: [...told.conflicts], events: [...told.events] };

  // Pictures the app linked to an event by itself are announced too (recent ones only, so the back catalogue is not replayed), so you know the automatic step ran.
  const fresh = i => !i.history && now.getTime() - new Date(i.publishedAt || 0).getTime() < 3 * 864e5;
  const newQ = ((queue && queue.items) || []).filter(i => !told.queue.has(i.id) && (!i.linked || fresh(i)));
  const waiting = newQ.filter(i => !i.linked).length;
  if (waiting) lines.push("🖼 " + waiting + " infographic" + (waiting === 1 ? "" : "s") + " waiting for your approval (Menu → Infographic review).");
  if (newQ.length > waiting) lines.push("✅ " + (newQ.length - waiting) + " infographic" + (newQ.length - waiting === 1 ? "" : "s") + " added automatically.");
  next.queue.push(...newQ.map(i => i.id));

  if (only === "queue") { if (!lines.length) return null; next.queue = next.queue.slice(-400); return { text: lines.join("\n") + "\n\n" + APP, state: next, items: newQ }; }

  // Only events that have not finished: a disagreement about last week's event is no use to you.
  const live = ((data && data.events) || []).filter(e => e.e && new Date(e.e).getTime() >= now.getTime()).map(e => String(e.t).toLowerCase());
  const isLive = n => live.some(t => t.includes(String(n).toLowerCase()) || String(n).toLowerCase().includes(t));
  const conf = Object.entries((details && details.events) || {}).filter(([id, e]) => (e.conflicts || []).length && isLive(e.name || id) && !told.conflicts.has(id + ":" + e.conflicts.length));
  for (const [id, e] of conf.slice(0, 4)) { lines.push("⚠️ Sources disagree: " + (e.name || id) + " (" + e.conflicts.map(c => c.field).join(", ") + ")."); next.conflicts.push(id + ":" + e.conflicts.length); }

  const soon = upcoming(data, world, now, details).filter(i => !told.events.has(i.id));
  for (const i of soon.slice(0, 6)) {
    const d = i.venue ? meldate(i.ms) : day(i.start), today = localDay(now.getTime()); // your date
    const label = d === today ? "Today" : "Tomorrow (" + new Intl.DateTimeFormat("en-AU", { timeZone: TZ_DEFAULT, weekday: "short", day: "numeric", month: "short" }).format(new Date(i.ms)) + ")";
    const when = i.venue ? meltime(i.ms) + (i.endMs ? "–" + meltime(i.endMs) : "") + " your time" + (i.doorsMs ? " (doors " + meltime(i.doorsMs) + ")" : "") + " · " + i.venueTime + " at the venue" : i.dateOnly ? "time not listed" : whenText(i);
    lines.push("📅 " + label + ": " + i.name + " · " + when);
    next.events.push(i.id);
  }
  if (!lines.length) return null;
  next.events = next.events.slice(-200); next.queue = next.queue.slice(-400); next.conflicts = next.conflicts.slice(-100);
  return { text: lines.join("\n") + "\n\n" + APP, state: next };
}

// A picture with buttons (see keyboard in src/telegram.js): link a suggested event, discard, or open the app for another event.
export const buttonsFor = item => item.linked ? { inline_keyboard: [[{ text: "Open app", url: APP }]] } : keyboard(item, [], APP);
// Discord posts often have no real title: the text is a link or the "@Infographics Notify" ping. Show neither.
export const niceTitle = (t, fallback = "New infographic") => String(t || "").replace(/https?:\/\/\S+/gi, "").replace(/@\w+(\s+Notify)?/gi, "").replace(/\s+/g, " ").trim() || fallback;
export function captionFor(item) {
  const g = (item.guesses || [])[0];
  if (item.linked) return ("✅ Added automatically: " + niceTitle(item.title).slice(0, 120) + (g && g.eventTitle ? "\nLinked to: " + g.eventTitle : "") + (item.publishedAt ? "\nPosted " + String(item.publishedAt).slice(0, 10) : "")).slice(0, 1000);
  return (niceTitle(item.title).slice(0, 160) + (item.publishedAt ? "\nPosted " + String(item.publishedAt).slice(0, 10) : "") + (g && g.eventTitle ? "\nBest guess: " + g.eventTitle : "\nNo event match yet") + (item.note ? "\n" + String(item.note).slice(0, 160) : "")).slice(0, 1000);
}
// Pictures the Worker already put in Telegram straight from Discord: { "discord:<id>": message_id }.
async function alreadyForwarded(token) {
  try { const r = await fetch(APP + "/api/discord-sent", { headers: { "x-hook-secret": await hookSecret(token) } }); return r.ok ? ((await r.json()).sent || {}) : {}; } catch { return {}; }
}
async function sendPhotos(items, token, chat) {
  let sent = 0;
  const fwd = await alreadyForwarded(token);
  for (const it of items.slice(0, 5)) {
    let ok = false;
    if (fwd[it.id]) { // edit the earlier message in place: no second copy of the picture
      try { ok = (await fetch("https://api.telegram.org/bot" + token + "/editMessageCaption", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, message_id: fwd[it.id], caption: captionFor(it), reply_markup: buttonsFor(it) }) })).ok; } catch { ok = false; }
      if (ok) { sent++; continue; }
    }
    try {
      const bytes = await readFile("public" + it.image);
      const fd = new FormData(); fd.set("chat_id", String(chat)); fd.set("caption", captionFor(it)); fd.set("reply_markup", JSON.stringify(buttonsFor(it)));
      fd.set("photo", new Blob([bytes]), "infographic.jpg");
      ok = (await fetch("https://api.telegram.org/bot" + token + "/sendPhoto", { method: "POST", body: fd })).ok;
    } catch { ok = false; }
    if (!ok) { const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: captionFor(it) + "\n\n" + APP, reply_markup: buttonsFor(it), disable_web_page_preview: true }) }); ok = r.ok; }
    if (ok) sent++;
  }
  if (items.length > 5) await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: "+ " + (items.length - 5) + " more waiting in the app: " + APP }) });
  return sent;
}

async function main() {
  globalThis.fetch = routed(process.env, process.env.NUDGE_ONLY === "queue" ? "pictures" : "changes", globalThis.fetch);
  const [queue, details, data, world, state] = await Promise.all([
    readJson("public/infographic-queue.json", {}), readJson("public/event-details.json", {}), readJson("public/data.json", {}), readJson("public/world-events.json", {}), readJson(STATE, {})
  ]);
  const digest = buildDigest({ queue, details, data, world, state, only: process.env.NUDGE_ONLY || "" });
  if (!digest) { console.log("Nothing new to tell you."); return; }
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat || process.env.DRY_RUN === "true") { console.log("Not sending (" + (process.env.DRY_RUN === "true" ? "dry run" : "Telegram is not set up") + "). Message would be:\n" + digest.text); return; }
  if (process.env.NUDGE_ONLY === "queue" && digest.items && digest.items.length) {
    const n = await sendPhotos(digest.items, token, chat);
    if (!n) throw new Error("Telegram did not accept any picture");
    await writeFile(STATE, JSON.stringify(digest.state, null, 1) + "\n"); console.log("Sent " + n + " picture(s)."); return;
  }
  const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: digest.text, disable_web_page_preview: true }) });
  if (!r.ok) throw new Error("Telegram answered HTTP " + r.status);
  await writeFile(STATE, JSON.stringify(digest.state, null, 1) + "\n");
  console.log("Sent.");
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
