#!/usr/bin/env node
// "Starting soon": about an hour before a Spotlight Hour, Raid Hour, Community Day, Hatch Day, Super Mega Raid Day or a new set of
// raid bosses begins, send a Telegram message (with the Pokémon's picture). Times are local to Melbourne, where you play.
// Runs every 15 minutes. data/soon-state.json remembers what was already announced. Battle League events are left out.
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID; without them (or with DRY_RUN=true) it only prints. SOON_NOW="YYYY-MM-DDTHH:MM" pretends it is that local time.
import { readFile, writeFile } from "node:fs/promises";
import { routed } from "../src/tgroute.js";

import { APP, melbourneNow, clock, startingSoon, messageFor, pending, quiet } from "../src/jobs-core.js";
export { melbourneNow, clock, startingSoon, messageFor, pending, quiet };
const STATE = process.env.SOON_STATE || "data/soon-state.json";
const MIN = 6e4;
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };
async function tg(token, method, body) { return (await fetch("https://api.telegram.org/bot" + token + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).ok; }
async function main() {
  const data = await readJson("public/data.json", {});
  const nowMs = process.env.SOON_NOW ? Date.parse(process.env.SOON_NOW + ":00Z") : melbourneNow();
  const state = await readJson(STATE, { sent: [] }), todo = pending(startingSoon(data, nowMs), state);
  if (!todo.length) { console.log("Nothing starting soon."); return; }
  if (quiet(nowMs)) { console.log("Quiet hours, not sending."); return; }
  globalThis.fetch = routed(process.env, "events", globalThis.fetch);
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat || process.env.DRY_RUN === "true") { console.log("Not sending:\n" + todo.map(i => messageFor(i, nowMs)).join("\n---\n")); return; }
  for (const it of todo) {
    const text = messageFor(it, nowMs); let ok = false;
    if (it.art[0]) ok = await tg(token, "sendPhoto", { chat_id: chat, photo: APP + "/api/art?n=" + encodeURIComponent(it.art[0]), caption: text.replace(/\n\n(https:\S+)$/, "\n$1") });
    if (!ok) ok = await tg(token, "sendMessage", { chat_id: chat, text, disable_web_page_preview: true });
    if (ok) state.sent = [...(state.sent || []), it.id].slice(-200);
  }
  await writeFile(STATE, JSON.stringify(state, null, 1) + "\n");
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
