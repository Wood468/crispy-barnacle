#!/usr/bin/env node
// When the weekly "what is on this week" picture appears (public/weekly.json, written by scripts/g47ix-publish.mjs),
// send it to Telegram once. It is usually posted Monday or Tuesday, after the Monday summary, so it follows on its own.
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. data/weekly-pic-state.json remembers what was already sent.
import { readFile, writeFile } from "node:fs/promises";
import { routed } from "../src/tgroute.js";

const APP = "https://pogo.michaelpuff.com";
const STATE = process.env.WEEKLY_PIC_STATE || "data/weekly-pic-state.json";
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };

// Pictures not sent yet, oldest first, and the new state. Nothing older than 6 days is sent (it would no longer be "this week").
export function pending(weekly, state, now = Date.now()) {
  const sent = new Set((state && state.sent) || []);
  const items = ((weekly && weekly.items) || []).filter(i => i && i.id && i.image && i.kind !== "month" && !sent.has(i.id) && Date.parse(i.publishedAt || "") > now - 6 * 864e5)
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  return items;
}
export const captionFor = it => "🗓 This week at a glance\n" + String(it.title || "").slice(0, 120) + "\n\n" + APP;

async function send(token, chat, it) {
  const bytes = await readFile("public" + it.image);
  for (const [method, field, name] of [["sendPhoto", "photo", "week.jpg"], ["sendDocument", "document", "week.webp"]]) { // a very tall picture is refused as a photo, so it falls back to a file
    const fd = new FormData(); fd.set("chat_id", String(chat)); fd.set("caption", captionFor(it)); fd.set(field, new Blob([bytes]), name);
    const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, { method: "POST", body: fd });
    if (r.ok) return true;
  }
  return false;
}
async function main() {
  globalThis.fetch = routed(process.env, "pictures", globalThis.fetch);
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  const weekly = await readJson("public/weekly.json", { items: [] }), state = await readJson(STATE, { sent: [] });
  const todo = pending(weekly, state);
  if (!todo.length) { console.log("No new weekly picture."); return; }
  if (!token || !chat || process.env.DRY_RUN === "true") { console.log("Not sending: " + todo.map(i => i.title).join(", ")); return; }
  for (const it of todo) {
    let ok = false; try { ok = await send(token, chat, it); } catch { ok = false; }
    if (ok) state.sent = [...(state.sent || []), it.id].slice(-50); else console.log("Could not send " + it.id);
  }
  await writeFile(STATE, JSON.stringify(state, null, 1) + "\n");
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
