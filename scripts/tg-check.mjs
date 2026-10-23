// One-off helper: sends a short message to each Topic saying which routing settings this job can see (never the values).
import { route, CATEGORIES, routed } from "../src/tgroute.js";
const token = process.env.TELEGRAM_BOT_TOKEN;
const set = k => process.env[k] ? "set" : "MISSING";
const lines = ["Group id: " + set("TELEGRAM_GROUP_ID")].concat(CATEGORIES.map(c => c + " topic: " + (process.env["TELEGRAM_TOPIC_" + c.toUpperCase()] || process.env["TELEGRAM_TOPICS_" + c.toUpperCase()] ? "set" : "MISSING") + " -> thread " + route(process.env, c).thread));
for (const c of CATEGORIES) {
  const f = routed(process.env, c, globalThis.fetch), dest = route(process.env, c);
  const r = await f("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: "Routing check for " + c + (dest.thread ? " ✅ topic " + dest.thread : " ⚠️ no topic set, so this went to General") + "\n" + lines.join("\n") }) });
  const j = await r.json().catch(() => ({}));
  // Shown as a workflow annotation, so the result can be read without opening the logs. No secret values are printed.
  console.log("::" + (j.ok ? "notice" : "error") + "::" + c + ": " + (j.ok ? "sent to " + (dest.thread ? "topic " + dest.thread : "General") : "Telegram said " + r.status + " " + (j.description || "no reason given")));
  if (!j.ok) process.exitCode = 1;
}
if (!token) console.log("::error::TELEGRAM_BOT_TOKEN is not set for this run");
if (!process.env.TELEGRAM_CHAT_ID) console.log("::error::TELEGRAM_CHAT_ID is not set for this run");
