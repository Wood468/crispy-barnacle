#!/usr/bin/env node
// Collects pictures you sent to the Telegram bot and adds them to the infographic review list.
//   1. asks the site for the pictures waiting in the inbox (proving who it is with a handshake derived from the bot token)
//   2. downloads each from Telegram into data/tg-inbox/ (the token never leaves this job and is never written to a file)
//   3. adds a candidate "tg:<id>" to the review registry; scripts/g47ix-publish.mjs then reads the text in it, guesses the event
//      and puts it in the review list, and the daily note sends it back to you in Telegram with Link / Discard buttons.
//   4. tells the site which pictures it has taken, so they are not collected twice.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { hookSecret } from "../src/telegram.js";

const APP = process.env.APP_URL || "https://pogo.michaelpuff.com";
const REG = process.env.REGISTRY_FILE || "data/g47ix-infographics-review.json";
const DIR = process.env.INBOX_DIR || "data/tg-inbox";
const MAX = 6 * 1024 * 1024;

export function telegramCandidate(item, ext, nowIso) {
  if (!item || !/^[a-z0-9_-]{1,64}$/i.test(String(item.id || "")) || !/^(png|jpg|webp)$/.test(ext)) return null;
  const caption = String(item.caption || "").replace(/\s+/g, " ").trim();
  return { id: "tg:" + item.id, source: "telegram", creator: "", title: caption || "Picture sent from Telegram", url: "", publishedAt: item.at ? new Date(item.at).toISOString() : nowIso, imageUrl: "local:" + DIR + "/tg-" + item.id + "." + ext, reviewStatus: "needs_review", decision: "pending" };
}
export const extOf = path => { const e = (/\.([a-z0-9]+)$/i.exec(String(path || "")) || [])[1]; const x = String(e || "jpg").toLowerCase().replace("jpeg", "jpg"); return /^(png|jpg|webp)$/.test(x) ? x : "jpg"; };

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { console.log("TELEGRAM_BOT_TOKEN is not set: nothing to collect."); return; }
  const headers = { "x-hook-secret": await hookSecret(token) };
  const r = await fetch(APP + "/api/tg-inbox", { headers, signal: AbortSignal.timeout(20000) });
  if (!r.ok) { console.log("Inbox not available (HTTP " + r.status + ")."); return; }
  const { items } = await r.json();
  if (!items || !items.length) { console.log("No pictures waiting."); return; }
  let reg; try { reg = JSON.parse(await readFile(REG, "utf8")); } catch { reg = { candidates: [] }; }
  reg.candidates = reg.candidates || [];
  await mkdir(DIR, { recursive: true });
  const taken = [];
  for (const it of items) {
    try {
      const f = await (await fetch("https://api.telegram.org/bot" + token + "/getFile?file_id=" + encodeURIComponent(it.fileId), { signal: AbortSignal.timeout(20000) })).json();
      if (!f.ok || !f.result || !f.result.file_path) throw new Error("Telegram would not give the file");
      const ext = extOf(f.result.file_path), c = telegramCandidate(it, ext, new Date().toISOString());
      if (!c) throw new Error("Unusable picture");
      if (!reg.candidates.some(x => x.id === c.id)) {
        const img = await fetch("https://api.telegram.org/file/bot" + token + "/" + f.result.file_path, { signal: AbortSignal.timeout(30000) });
        if (!img.ok) throw new Error("HTTP " + img.status);
        const buf = Buffer.from(await img.arrayBuffer());
        if (buf.length > MAX) throw new Error("Larger than 6 MB");
        await writeFile(c.imageUrl.slice(6), buf);
        reg.candidates.push(c);
      }
      taken.push(it.id); console.log("Collected " + c.id);
    } catch (e) { console.log("Skipped " + it.id + ": " + e.message); }
  }
  await writeFile(REG, JSON.stringify(reg, null, 2) + "\n");
  if (taken.length) await fetch(APP + "/api/tg-inbox", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ids: taken }), signal: AbortSignal.timeout(20000) });
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
