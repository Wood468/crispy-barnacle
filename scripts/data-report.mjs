// Weekly "is the data healthy" message for Telegram: what the checks fixed, what is still wrong, whether every source answered.
// Run: node scripts/data-report.mjs   (needs a checkout with history; sends only when TELEGRAM_* are set)
import { readFile } from "node:fs/promises";
import { routed } from "../src/tgroute.js";
import { execFileSync } from "node:child_process";

const read = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };
const MONTHS = Object.fromEntries(["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].map((m, i) => [m, i + 1]));
const day = value => String(value || "").slice(0, 10);
const normBoss = value => String(value || "").toLowerCase().replace(/\b(mega|dynamax|gigantamax|forme|shadow)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function dateRanges(value, year) {
  const re = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+to\s+(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+)?(\d{1,2})\b/gi;
  return [...String(value || "").matchAll(re)].map(m => {
    const sm = MONTHS[m[1].slice(0, 3).toLowerCase()], em = MONTHS[(m[3] || m[1]).slice(0, 3).toLowerCase()];
    const ey = em < sm ? year + 1 : year;
    return {
      start: new Date(Date.UTC(year, sm - 1, Number(m[2]))).toISOString().slice(0, 10),
      end: new Date(Date.UTC(ey, em - 1, Number(m[4]))).toISOString().slice(0, 10)
    };
  });
}
function previousDay(value) {
  const ms = Date.parse(String(value || "") + "T00:00:00Z");
  return Number.isFinite(ms) ? new Date(ms - 864e5).toISOString().slice(0, 10) : "";
}
function windowForBoss(rotation, names) {
  const wants = names.map(normBoss).filter(Boolean);
  const hits = (rotation || []).filter(r => wants.some(w => {
    const got = normBoss(r.mega);
    return got && (got === w || got.includes(w) || w.includes(got));
  })).sort((a, b) => day(a.s).localeCompare(day(b.s)));
  if (!hits.length) return null;
  return { start: day(hits[0].s), end: previousDay(day(hits[hits.length - 1].e)), contiguous: hits.every((r, i) => i === 0 || day(hits[i - 1].e) === day(r.s)) };
}
function artNames(item) {
  return [...new Set((item.art || []).map(x => typeof x === "string" ? x : x && x.n).filter(Boolean).map(normBoss))];
}
export function auditRaidUpcoming(data = {}) {
  const asOfYear = Number((/\b(20\d{2})\b/.exec(String(data.asOf || "")) || [])[1]) || new Date().getUTCFullYear();
  const rotation = Array.isArray(data.rotation) ? data.rotation : [];
  const issues = [];
  let checked = 0;
  for (const [name, note] of Object.entries(data.raidNow || {})) {
    checked++;
    const ranges = dateRanges(note, asOfYear), win = windowForBoss(rotation, [name]);
    if (!win) issues.push("raidNow " + name + " has no matching Mega rotation");
    else if (!win.contiguous) issues.push("raidNow " + name + " spans non-contiguous rotations");
    else if (ranges.length !== 1 || ranges[0].start !== win.start || ranges[0].end !== win.end) issues.push("raidNow " + name + " dates do not match its Mega rotation");
  }
  for (const item of (data.upcoming && data.upcoming.announced) || []) {
    if (item.kind === "Mega" && /^Mega raid\b/i.test(String(item.note || ""))) {
      checked++;
      const names = artNames(item), ranges = dateRanges(item.when, asOfYear), win = windowForBoss(rotation, names.length ? names : [item.name]);
      if (!win) issues.push("Upcoming " + item.name + " has no matching Mega rotation");
      else if (!win.contiguous) issues.push("Upcoming " + item.name + " spans non-contiguous Mega rotations");
      else if (ranges.length !== 1 || ranges[0].start !== win.start || ranges[0].end !== win.end) issues.push("Upcoming " + item.name + " dates do not match its Mega rotation");
    }
    if (item.kind === "Dynamax" && /Weekly Max Battle rotation/i.test(String(item.note || ""))) {
      checked++;
      const names = artNames(item), ranges = dateRanges(item.when, asOfYear), max = Array.isArray(data.maxBattles) ? data.maxBattles : [];
      if (!names.length || names.length !== ranges.length) { issues.push("Upcoming " + item.name + " does not have one date range per Max Battle boss"); continue; }
      for (let i = 0; i < names.length; i++) {
        const match = max.find(row => normBoss(row[2]) === names[i] && day(row[0]) === ranges[i].start && day(row[1]) === ranges[i].end);
        if (!match) issues.push("Upcoming Max Battle " + names[i] + " dates do not match maxBattles");
      }
    }
  }
  return { checked, issues };
}

export function buildReport({ audit = {}, importer = {}, commits = [], data = {}, now = new Date() }) {
  const ago = iso => { const h = Math.round((now - Date.parse(iso)) / 36e5); return isNaN(h) ? "never" : h < 48 ? h + " h ago" : Math.round(h / 24) + " days ago"; };
  const src = Object.entries(importer.sources || {});
  const bad = src.filter(([, v]) => v && v.error).map(([k, v]) => k + " (" + String(v.error).slice(0, 60) + ")");
  const lines = ["📊 Data report, week to " + now.toISOString().slice(0, 10)];
  lines.push((bad.length ? "⚠️ " : "✅ ") + "Sources: " + (bad.length ? "PROBLEM with " + bad.join(", ") : "all " + src.length + " answered") + (importer.runAt ? ". Last import " + ago(importer.runAt) : ""));
  lines.push(((audit.problems || []).length || !audit.checked ? "⚠️ " : "✅ ") + "Dates vs Leek Duck: " + (audit.checked ? ago(audit.checked) + ", " + (audit.compared || 0) + " compared, " + ((audit.problems || []).length) + " date mismatches" : "has not run"));
  const rotationCheck = auditRaidUpcoming(data);
  if (rotationCheck.checked) lines.push((rotationCheck.issues.length ? "⚠️ " : "✅ ") + "Raid/Upcoming consistency: " + (rotationCheck.issues.length ? rotationCheck.issues.slice(0, 4).join("; ") : "raidNow, Mega raid and weekly Max Battle windows match their rotations"));
  else lines.push("ℹ️ Raid/Upcoming consistency: no tracked entries to compare");
  const soon = (audit.missing || []).filter(m => Date.parse(m.start) < now.getTime() + 75 * 864e5);
  lines.push((soon.length ? "🆕 " : "✅ ") + "On Leek Duck, not in the app (next 75 days): " + soon.length + (soon.length ? " - " + soon.slice(0, 5).map(m => m.slug).join(", ") : ""));
  if ((importer.worldUndated || []).length) lines.push("📅 Events with no dates yet: " + importer.worldUndated.length);
  const fixes = commits.filter(c => /fix|dates|event|picture|infographic|AI|data/i.test(c));
  lines.push("📝 Data changes this week: " + commits.length + (fixes.length ? "\n" + commits.slice(0, 6).map(c => "• " + c.slice(0, 90)).join("\n") : ""));
  return lines.join("\n");
}
async function main() {
  const commits = execFileSync("git", ["log", "--since=7 days ago", "--no-merges", "--pretty=%s", "--", "public/data.json", "public/world-events.json", "public/event-details.json", "data/g47ix-infographics-review.json"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const data = await read("public/data.json", {});
  const text = buildReport({ audit: await read("data/schedule-audit.json", {}), importer: await read("data/importer-report.json", {}), data, commits });
  globalThis.fetch = routed(process.env, "system", globalThis.fetch);
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat || process.env.DRY_RUN === "true") { console.log(text); return; }
  const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }) });
  if (!r.ok) throw new Error("Telegram answered HTTP " + r.status);
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
