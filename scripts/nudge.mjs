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

// Events the app knows about, as { id, name, start } with local start times.
export function upcoming(data, world, now = new Date()) {
  const items = [];
  for (const e of data.events || []) if (e.s) items.push({ id: "e:" + e.id, name: e.t, start: e.s, end: e.e });
  for (const x of data.spotlight || []) items.push({ id: "spot:" + x.d, name: x.n + " Spotlight Hour", start: x.d + "T18:00", end: x.d + "T19:00" });
  for (const x of data.raidHour || []) items.push({ id: "rh:" + x.d, name: x.n + " Raid Hour", start: x.d + "T18:00", end: x.d + "T19:00" });
  for (const w of (world && world.events) || []) if (w.start) items.push({ id: w.id, name: w.name + (w.place ? " (" + w.place + ")" : ""), start: w.start + "T00:00", end: w.end, place: w.place, dateOnly: true });
  const t0 = now.getTime(), t1 = t0 + hoursAhead * 36e5;
  return items.filter(i => { const t = new Date(i.start).getTime(); return t >= t0 - 2 * 36e5 && t <= t1; });
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

  const soon = upcoming(data, world, now).filter(i => !told.events.has(i.id));
  for (const i of soon.slice(0, 6)) {
    const d = day(i.start), today = day(new Date(now.getTime() + 11 * 36e5).toISOString()); // Melbourne date
    lines.push("📅 " + (d === today ? "Today" : "Tomorrow") + ": " + i.name + " · " + (i.dateOnly ? "time not listed" : whenText(i)));
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
