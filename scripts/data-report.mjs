// Weekly "is the data healthy" message for Telegram: what the checks fixed, what is still wrong, whether every source answered.
// Run: node scripts/data-report.mjs   (needs a checkout with history; sends only when TELEGRAM_* are set)
import { readFile } from "node:fs/promises";
import { routed } from "../src/tgroute.js";
import { execFileSync } from "node:child_process";

const read = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };
export function buildReport({ audit = {}, importer = {}, commits = [], now = new Date() }) {
  const ago = iso => { const h = Math.round((now - Date.parse(iso)) / 36e5); return isNaN(h) ? "never" : h < 48 ? h + " h ago" : Math.round(h / 24) + " days ago"; };
  const src = Object.entries(importer.sources || {});
  const bad = src.filter(([, v]) => v && v.error).map(([k, v]) => k + " (" + String(v.error).slice(0, 60) + ")");
  const lines = ["📊 Data report, week to " + now.toISOString().slice(0, 10)];
  lines.push((bad.length ? "⚠️ " : "✅ ") + "Sources: " + (bad.length ? "PROBLEM with " + bad.join(", ") : "all " + src.length + " answered") + (importer.runAt ? ". Last import " + ago(importer.runAt) : ""));
  lines.push(((audit.problems || []).length || !audit.checked ? "⚠️ " : "✅ ") + "Dates vs Leek Duck: " + (audit.checked ? ago(audit.checked) + ", " + (audit.compared || 0) + " compared, " + ((audit.problems || []).length) + " date mismatches" : "has not run"));
  const soon = (audit.missing || []).filter(m => Date.parse(m.start) < now.getTime() + 75 * 864e5);
  lines.push((soon.length ? "🆕 " : "✅ ") + "On Leek Duck, not in the app (next 75 days): " + soon.length + (soon.length ? " - " + soon.slice(0, 5).map(m => m.slug).join(", ") : ""));
  if ((importer.worldUndated || []).length) lines.push("📅 Events with no dates yet: " + importer.worldUndated.length);
  const fixes = commits.filter(c => /fix|dates|event|picture|infographic|AI|data/i.test(c));
  lines.push("📝 Data changes this week: " + commits.length + (fixes.length ? "\n" + commits.slice(0, 6).map(c => "• " + c.slice(0, 90)).join("\n") : ""));
  return lines.join("\n");
}
async function main() {
  const commits = execFileSync("git", ["log", "--since=7 days ago", "--no-merges", "--pretty=%s", "--", "public/data.json", "public/world-events.json", "public/event-details.json", "data/g47ix-infographics-review.json"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const text = buildReport({ audit: await read("data/schedule-audit.json", {}), importer: await read("data/importer-report.json", {}), commits });
  globalThis.fetch = routed(process.env, "system", globalThis.fetch);
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat || process.env.DRY_RUN === "true") { console.log(text); return; }
  const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }) });
  if (!r.ok) throw new Error("Telegram answered HTTP " + r.status);
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
