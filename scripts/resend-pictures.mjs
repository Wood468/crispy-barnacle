// One-off: resend auto-linked infographics that reached Telegram as text only (before the picture fix) as real pictures.
// Picks queue items that were auto-linked, posted on or after SINCE (default 2026-10-21), and that the Worker did not already forward as a photo.
// Prints the list first; sends only when DRY_RUN is not "true". Marks each message "Resent with picture". Never changes any state or data.
import { readFile } from "node:fs/promises";
import { captionFor, buttonsFor } from "./nudge.mjs";
import { routed } from "../src/tgroute.js";
import { hookSecret } from "../src/telegram.js";

const APP = "https://pogo.michaelpuff.com";
export function pick(items, fwd, since, max = 8) {
  return (items || []).filter((i) => i.linked && i.image && !fwd[i.id] && String(i.publishedAt || "").slice(0, 10) >= since).sort((a, b) => (a.publishedAt < b.publishedAt ? -1 : 1)).slice(-max);
}
async function main() {
  const since = process.env.SINCE || "2026-10-21", dry = process.env.DRY_RUN !== "false";
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  const queue = JSON.parse(await readFile("public/infographic-queue.json", "utf8")), list = Array.isArray(queue) ? queue : queue.items || [];
  let fwd = {};
  try { const r = await fetch(APP + "/api/discord-sent", { headers: { "x-hook-secret": await hookSecret(token) } }); if (r.ok) fwd = (await r.json()).sent || {}; } catch { /* the Worker list is optional */ }
  const items = pick(list, fwd, since);
  console.log((dry ? "DRY RUN. " : "") + items.length + " picture(s) since " + since + ":");
  for (const i of items) console.log(" - " + String(i.publishedAt).slice(0, 10) + " | " + captionFor(i).split("\n").slice(0, 2).join(" | ").slice(0, 100) + " | " + i.image);
  if (dry || !items.length) return;
  if (!token || !chat) throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set");
  const f = routed(process.env, "pictures", globalThis.fetch);
  let sent = 0;
  for (const i of items) {
    let bytes; try { bytes = await readFile("public" + i.image); } catch { console.log("::warning::picture file missing, skipped: " + i.image); continue; }
    const fd = new FormData(); fd.set("chat_id", String(chat)); fd.set("caption", ("↻ Resent with picture\n" + captionFor(i)).slice(0, 1000)); fd.set("reply_markup", JSON.stringify(buttonsFor(i)));
    fd.set("disable_notification", "true"); fd.set("photo", new Blob([bytes]), "infographic.jpg");
    const r = await f("https://api.telegram.org/bot" + token + "/sendPhoto", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    console.log("::" + (j.ok ? "notice" : "error") + "::" + i.id + ": " + (j.ok ? "sent" : "Telegram said " + r.status + " " + (j.description || "")));
    if (j.ok) sent++;
  }
  console.log("Sent " + sent + " of " + items.length + ".");
  if (!sent) process.exitCode = 1;
}
if (import.meta.url === "file://" + process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });
