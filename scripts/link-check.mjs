// Weekly: do the official/source links in our data still open? Prints the broken ones as warnings and tells Telegram (System topic).
import { readFile } from "node:fs/promises";
import { routed, route } from "../src/tgroute.js";
const FILES = ["public/data.json", "public/world-events.json", "public/event-info.json", "public/regional-events.json", "public/prices.json", "public/tickets-external.json"];
export function urlsIn(value, out = new Set()) {
  if (typeof value === "string") { for (const m of value.matchAll(/https?:\/\/[^\s"'<>)]+/g)) out.add(m[0].replace(/[.,;]+$/, "")); }
  else if (Array.isArray(value)) value.forEach(v => urlsIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach(v => urlsIn(v, out));
  return out;
}
async function alive(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const r = await fetch(url, { method, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (go-field-notes link check)" }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return null;
      if (method === "GET") return "HTTP " + r.status;
    } catch (e) { if (method === "GET") return String(e && e.message || e).slice(0, 80); }
  }
  return null;
}
export async function main() {
  const all = new Set();
  for (const f of FILES) { try { urlsIn(JSON.parse(await readFile(f, "utf8")), all); } catch { /* file optional */ } }
  const list = [...all].filter(u => !/michaelpuff\.com|cdn\.discordapp|example\./.test(u));
  const bad = [];
  const queue = [...list];
  await Promise.all(Array.from({ length: 8 }, async () => { for (let u; (u = queue.pop());) { const why = await alive(u); if (why) bad.push(u + " (" + why + ")"); } }));
  console.log("Checked " + list.length + " links, " + bad.length + " not opening.");
  for (const b of bad) console.log("::warning title=Link::" + b);
  const t = process.env.TELEGRAM_BOT_TOKEN, dest = route(process.env, "system");
  if (bad.length && t && dest.chat) {
    const text = "🔗 " + bad.length + " of " + list.length + " source links are not opening\n" + bad.slice(0, 12).map(b => "• " + b).join("\n") + (bad.length > 12 ? "\n+ " + (bad.length - 12) + " more (see the run)" : "");
    await routed(process.env, "system")("https://api.telegram.org/bot" + t + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: dest.chat, text, disable_web_page_preview: true }) });
  }
  return bad;
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
