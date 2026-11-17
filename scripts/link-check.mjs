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
// Only probe public HTTPS links. Match excluded domains on parsed hostnames,
// never URL substrings (which can occur in attacker-controlled paths).
export function publicSourceUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") ||
        host === "michaelpuff.com" || host.endsWith(".michaelpuff.com") ||
        host === "cdn.discordapp.com" || host.endsWith(".cdn.discordapp.com") ||
        host === "example.com" || host.endsWith(".example.com") ||
        host === "example.org" || host.endsWith(".example.org") ||
        host === "example.net" || host.endsWith(".example.net") ||
        host.endsWith(".local") || host.endsWith(".internal") ||
        /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
        host.includes(":")) return null;
    // Do not forward URLs containing credentials or signed-token query strings.
    if ([...u.searchParams.keys()].some(k => /(?:token|key|secret|password|signature|auth|credential|access)/i.test(k))) return null;
    u.hash = "";
    return u.href;
  } catch { return null; }
}
// Diagnostics never expose URL query values or fragments.
export function safeLinkLabel(raw) {
  try { const u = new URL(raw); return u.origin + u.pathname; }
  catch { return "[invalid URL]"; }
}
async function alive(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      let target = url, r;
      for (let hop = 0; hop <= 5; hop++) {
        r = await fetch(target, { method, redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (go-field-notes link check)" }, signal: AbortSignal.timeout(20000) });
        if (![301, 302, 303, 307, 308].includes(r.status)) break;
        const location = r.headers.get("location");
        if (!location) return "redirect without location";
        const next = publicSourceUrl(new URL(location, target).href);
        if (!next) return "redirect to excluded or unsafe URL";
        target = next;
        if (hop === 5) return "too many redirects";
      }
      if (r.ok) return null;
      if (method === "GET") return "HTTP " + r.status;
    } catch { if (method === "GET") return "network error"; }
  }
  return null;
}
export async function main() {
  const all = new Set();
  for (const f of FILES) { try { urlsIn(JSON.parse(await readFile(f, "utf8")), all); } catch { /* file optional */ } }
  const list = [...new Set([...all].map(publicSourceUrl).filter(Boolean))];
  const bad = [];
  const queue = [...list];
  await Promise.all(Array.from({ length: 8 }, async () => { for (let u; (u = queue.pop());) { const why = await alive(u); if (why) bad.push(safeLinkLabel(u) + " (" + why + ")"); } }));
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
