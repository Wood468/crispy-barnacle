#!/usr/bin/env node
// Tells you on Telegram when the importer has found an event we have not seen before (a new write-up on the official site,
// Leek Duck or Pokémon GO Hub, or a new real-life event on Serebii). Runs right after the importer.
// It remembers every event it has seen in data/seen-events.json. The very first run only records what is already known.
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID; without them it prints what it would send and does not mark anything as told.
import { readFile, writeFile } from "node:fs/promises";
import { routed } from "../src/tgroute.js";

const APP = process.env.APP_URL || "https://pogo.michaelpuff.com";
const STATE = process.env.SEEN_FILE || "data/seen-events.json";
const DETAILS = process.env.DETAILS_FILE || "public/event-details.json";
const WORLD = process.env.WORLD_FILE || "public/world-events.json";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/pok[eé]mon go/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const fmt = iso => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(iso || "")); if (!m) return ""; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)); return DOW[d.getUTCDay()] + " " + +m[3] + " " + MON[+m[2] - 1]; };

// Everything the importer knows, as { id, name, start, end, place, sources: [{name,url}] }.
export function collect(details, world, live = []) {
  const byLive = new Map(); for (const e of live) { if (e.id) byLive.set(String(e.id), e); byLive.set(norm(e.name), e); }
  const out = [];
  for (const [id, e] of Object.entries((details && details.events) || {})) {
    const l = byLive.get(id) || byLive.get(norm(e.name)) || {};
    out.push({ id, name: e.name || id, start: l.start || "", end: l.end || "", place: "", sources: (e.sources || []).map(s => ({ name: s.name, url: s.url })) });
  }
  for (const w of (world && world.events) || []) out.push({ id: w.id, name: w.name, start: w.start || "", end: w.end || "", place: w.place || "", sources: (w.sources || []).map(s => ({ name: s.name, url: s.url })) });
  return out;
}
export function diffSeen(prev, items) {
  const had = new Set((prev && prev.ids) || []), ids = items.map(i => i.id);
  const fresh = prev ? items.filter(i => !had.has(i.id)) : [];
  return { fresh, state: { ids: Array.from(new Set([...(prev ? prev.ids : []), ...ids])).slice(-1500), updated: new Date().toISOString() }, baseline: !prev };
}
export function messageFor(i) {
  const dates = i.start ? fmt(i.start) + (i.end && fmt(i.end) !== fmt(i.start) ? " → " + fmt(i.end) : "") : "";
  const world = !!i.place;
  const lines = [(world ? "🌏" : "🆕") + " New " + (world ? "real-life " : "") + "event spotted", "", "📌 " + i.name];
  if (dates) lines.push("🗓 " + dates);
  if (i.place) lines.push("📍 " + i.place);
  if (i.sources.length) lines.push("🔎 Found on: " + i.sources.map(s => s.name).join(", "));
  const url = (i.sources.find(s => /pokemongo\.com/.test(s.url || "")) || i.sources[0] || {}).url;
  if (url) lines.push("", url);
  return lines.join("\n");
}

async function main() {
  const [details, world] = await Promise.all([readJson(DETAILS, {}), readJson(WORLD, {})]);
  let live = []; try { const r = await fetch(APP + "/api/events", { signal: AbortSignal.timeout(20000) }); if (r.ok) live = ((await r.json()).events || []).map(e => ({ id: e.id, name: e.name, start: String(e.start || "").slice(0, 10), end: String(e.end || "").slice(0, 10) })); } catch { /* dates are optional */ }
  const items = collect(details, world, live), prev = await readJson(STATE, null), d = diffSeen(prev, items);
  globalThis.fetch = routed(process.env, "changes", globalThis.fetch);
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID, dry = process.env.DRY_RUN === "true";
  if (d.baseline) { if (!dry) await writeFile(STATE, JSON.stringify(d.state, null, 1) + "\n"); console.log("First run: recorded " + items.length + " known events, nothing sent."); return; }
  if (!d.fresh.length) { console.log("No new events."); if (!dry) await writeFile(STATE, JSON.stringify(d.state, null, 1) + "\n"); return; }
  if (!token || !chat || dry) { console.log("Not sending. New events:\n\n" + d.fresh.map(messageFor).join("\n\n---\n")); return; }
  let sent = 0; const batch = d.fresh.slice(0, 8);
  for (const i of batch) {
    const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: messageFor(i) }) });
    if (r.ok) sent++;
  }
  if (d.fresh.length > 8) await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: "+ " + (d.fresh.length - 8) + " more new events: " + APP, disable_web_page_preview: true }) });
  if (!sent) throw new Error("Telegram did not accept any message; not marked as told, so it retries");
  await writeFile(STATE, JSON.stringify(d.state, null, 1) + "\n");
  console.log("Told you about " + sent + " new event(s).");
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
