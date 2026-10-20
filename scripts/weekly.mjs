#!/usr/bin/env node
// Monday-morning Telegram summary of the week ahead: pictures of the headline Pokémon, then a day-by-day list.
// Battle League events are left out (you asked not to see them). Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID;
// without them (or with DRY_RUN=true) it only prints what it would send.
import { readFile } from "node:fs/promises";
import { routed } from "../src/tgroute.js";

import { APP, LEAGUE, buildWeek, formatWeek, pictureUrls } from "../src/jobs-core.js";
export { LEAGUE, buildWeek, formatWeek, pictureUrls };
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };
async function tg(token, method, body) {
  const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.ok;
}
async function main() {
  const data = await readJson("public/data.json", {});
  const from = new Date(Date.now() + 11 * 36e5).toISOString().slice(0, 10); // Melbourne date
  const rows = buildWeek(data, from), text = formatWeek(rows), pics = pictureUrls(rows);
  globalThis.fetch = routed(process.env, "events", globalThis.fetch);
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat || process.env.DRY_RUN === "true") { console.log("Not sending. Pictures: " + pics.map(p => p.caption).join(", ") + "\n\n" + text); return; }
  if (pics.length >= 2) await tg(token, "sendMediaGroup", { chat_id: chat, media: pics.map((p, i) => ({ type: "photo", media: p.url, caption: i === 0 ? "This week: " + pics.map(x => x.caption).join(", ").slice(0, 900) : undefined })) });
  else if (pics.length === 1) await tg(token, "sendPhoto", { chat_id: chat, photo: pics[0].url, caption: pics[0].caption });
  if (!(await tg(token, "sendMessage", { chat_id: chat, text, disable_web_page_preview: true }))) throw new Error("Telegram did not accept the message");
  console.log("Sent.");
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
