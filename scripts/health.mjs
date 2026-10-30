#!/usr/bin/env node
// Checks that the background jobs behind the app are still running, writes public/health.json for the app's
// "Sources and freshness" panel, and tells you on Telegram when a job has gone quiet or is failing (once per episode).
// Needs GITHUB_TOKEN and GITHUB_REPOSITORY (set by the workflow). Telegram is optional: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
import { readFile, writeFile } from "node:fs/promises";
import { routed } from "../src/tgroute.js";

const HOUR = 36e5;
export const JOBS = [
  { id: "event-importer.yml", name: "Event importer", everyH: 1 },
  { id: "source-watch.yml", name: "Source feed watcher", everyH: 3 },
  { id: "location-discovery.yml", name: "Community location discovery", everyH: 6 },
  { id: "low-raids.yml", name: "1–3 star raid rotation", everyH: 84, staleAfterH: 156 },
  { id: "g47ix-infographics.yml", name: "Infographic check", everyH: 2 },
  { id: "store-watch.yml", name: "Store watcher", everyH: 1 },
  { id: "nudge.yml", name: "Daily nudge", everyH: 24 },
  { id: "best-by-type.yml", name: "Best-by-type rankings", everyH: 168 },
  { id: "discord_sync.yml", name: "Discord reader", everyH: 2 },
  { id: "data-report.yml", name: "Weekly data report", everyH: 168 },
];
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };

// runs: { lastSuccess: ISO|null, lastConclusion: string|null }. A job is "stale" when it has not succeeded for 2.5 times its
// usual gap (at least 3 hours of slack), and "failing" when its latest finished run failed.
export function judge(job, runs, now = Date.now()) {
  const ok = runs && runs.lastSuccess ? Date.parse(runs.lastSuccess) : NaN;
  const limit = (Number.isFinite(job.staleAfterH) && job.staleAfterH > 0 ? job.staleAfterH : Math.max(job.everyH * 2.5, job.everyH + 3)) * HOUR;
  let state = "fresh";
  if (!Number.isFinite(ok)) state = "never";
  else if (now - ok > limit) state = "stale";
  if (runs && runs.lastConclusion === "failure" && state === "fresh" && now - ok > job.everyH * 1.5 * HOUR) state = "failing";
  return { id: job.id, name: job.name, everyH: job.everyH, lastSuccess: Number.isFinite(ok) ? new Date(ok).toISOString() : null, state };
}
// Which jobs to warn about now: bad, and not already warned about. Also which ones recovered.
export function alerts(rows, prev) {
  const was = new Set((prev && prev.alerted) || []);
  const bad = rows.filter(r => r.state === "stale" || r.state === "failing");
  return { warn: bad.filter(r => !was.has(r.id)), recovered: rows.filter(r => r.state === "fresh" && was.has(r.id)), alerted: bad.map(r => r.id) };
}
export const warnText = r => "⚠️ " + r.name + " has " + (r.state === "failing" ? "been failing" : "gone quiet") + (r.lastSuccess ? ". Last good run: " + r.lastSuccess.slice(0, 16).replace("T", " ") + " UTC." : ". It has no good run on record.");

async function gh(path) {
  const r = await fetch("https://api.github.com/repos/" + process.env.GITHUB_REPOSITORY + path, { headers: { authorization: "Bearer " + process.env.GITHUB_TOKEN, accept: "application/vnd.github+json", "user-agent": "go-field-notes-health" } });
  if (!r.ok) throw new Error("GitHub " + r.status + " for " + path);
  return r.json();
}
async function runsFor(job) {
  const ok = await gh("/actions/workflows/" + job.id + "/runs?status=success&per_page=1");
  const last = await gh("/actions/workflows/" + job.id + "/runs?status=completed&per_page=1");
  return { lastSuccess: ok.workflow_runs && ok.workflow_runs[0] ? ok.workflow_runs[0].updated_at : null, lastConclusion: last.workflow_runs && last.workflow_runs[0] ? last.workflow_runs[0].conclusion : null };
}
// The Worker's own hourly cron (starting-soon pings, Discord forwarding, reminders) leaves a heartbeat; this reads it.
export function judgeWorker(hb, now = Date.now()) {
  const row = { id: "worker-cron", name: "Worker hourly jobs", everyH: 1 };
  const at = hb && hb.at ? Date.parse(hb.at) : NaN;
  if (!Number.isFinite(at)) return { ...row, lastSuccess: null, state: "never" };
  const failed = (hb.failed || []).length > 0, old = now - at > 3 * HOUR;
  return { ...row, lastSuccess: new Date(at).toISOString(), state: old ? "stale" : failed ? "failing" : "fresh", detail: failed ? "failing: " + hb.failed.join(", ") : (hb.discord ? "Discord forwarding: " + hb.discord : "") };
}
async function workerRow() {
  try { const r = await fetch("https://pogo.michaelpuff.com/api/worker-health"); return judgeWorker(r.ok ? (await r.json()).heartbeat : null); } catch { return null; }
}
// The scheduled AI checks end by leaving a dated marker (ai-hb-<name>-<time>); its date is when they last finished.
export const AI_TASKS = [
  { id: "ai-heartbeat-event-check", name: "AI event check", everyH: 168 },
  { id: "ai-heartbeat-pipeline", name: "AI picture matching", everyH: 24 },
  { id: "ai-heartbeat-shiny", name: "AI shiny and costume check", everyH: 96 },
];
// Newest heartbeat for a task. The AI tasks leave a marker named ai-hb-<name>-<YYYYMMDDHHMM> (UTC) each run, never moving or force-pushing anything.
// Scheduled sessions can push branches but not tags, so the marker is a branch (refs/heads/ai-hb-...); a tag with the same name still counts, and
// so does the old single moving tag. Markers older than two days are tidied away (the newest is kept), including stray ai-hb-* branches of any name.
export const hbTime = ref => { const m = /-(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)$/.exec(ref); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null; };
// refs: ["refs/heads/ai-hb-pipeline-202610170001", ...]. Newest stamp for the task, and the markers old enough to delete (the newest is always kept).
export function pickHeartbeat(name, refs, now = Date.now()) {
  const stamps = refs.map(ref => ({ ref, ms: hbTime(ref) })).filter(x => x.ms && x.ref.replace(/^refs\/(heads|tags)\//, "").startsWith("ai-hb-" + name + "-")).sort((a, b) => b.ms - a.ms);
  return { newest: stamps[0] ? stamps[0].ms : null, stale: stamps.slice(1).filter(x => x.ms < now - 2 * 864e5).map(x => x.ref) };
}
async function dropRef(ref) {
  try { await fetch("https://api.github.com/repos/" + process.env.GITHUB_REPOSITORY + "/git/" + ref, { method: "DELETE", headers: { authorization: "Bearer " + process.env.GITHUB_TOKEN, accept: "application/vnd.github+json", "user-agent": "go-field-notes-health" } }); } catch {}
}
async function tagRow(t) {
  try {
    let at = null;
    try { const ref = await gh("/git/ref/tags/" + t.id); const tag = ref.object.type === "tag" ? await gh("/git/tags/" + ref.object.sha) : null; at = tag && tag.tagger ? Date.parse(tag.tagger.date) : null; } catch {}
    const name = t.id.replace(/^ai-heartbeat-/, "");
    const refs = [];
    for (const kind of ["tags", "heads"]) { try { for (const r of await gh("/git/matching-refs/" + kind + "/ai-hb-" + name + "-")) refs.push(r.ref); } catch {} }
    const pick = pickHeartbeat(name, refs);
    if (pick.newest && (!at || pick.newest > at)) at = pick.newest;
    for (const ref of pick.stale) await dropRef(ref);
    return judge(t, { lastSuccess: at ? new Date(at).toISOString() : null, lastConclusion: null });
  } catch { return judge(t, { lastSuccess: null, lastConclusion: null }); }
}
// Stray ai-hb-* branches that belong to no task (for example a test marker) are removed once they are two days old.
async function tidyStrays() {
  try {
    const known = AI_TASKS.map(t => "ai-hb-" + t.id.replace(/^ai-heartbeat-/, "") + "-");
    for (const r of await gh("/git/matching-refs/heads/ai-hb-")) {
      const n = r.ref.replace("refs/heads/", ""), ms = hbTime(r.ref);
      if (!known.some(k => n.startsWith(k)) && ms && ms < Date.now() - 2 * 864e5) await dropRef(r.ref);
    }
  } catch {}
}
// Pictures nobody could match to an event, for long enough that the AI matching has had its chance. Each is reported once.
export function newUnmatched(candidates, seen, now = Date.now(), waitH = 6) {
  const was = new Set(seen || []);
  const waiting = (candidates || []).filter(c => c && c.reviewStatus === "unmatched" && c.decision !== "rejected" && !c.eventMatch && !(c.aiMatch && c.aiMatch.length) && c.stagedPath
    && now - Date.parse(c.publishedAt || 0) > waitH * HOUR);
  return { fresh: waiting.filter(c => !was.has(c.id)), all: waiting.map(c => c.id) };
}
async function tg(text) {
  const t = process.env.TELEGRAM_BOT_TOKEN, c = process.env.TELEGRAM_CHAT_ID; if (!t || !c) { console.log("No Telegram: " + text); return; }
  await routed(process.env, "system")("https://api.telegram.org/bot" + t + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: c, text, disable_web_page_preview: true }) });
}
async function main() {
  const rows = [];
  for (const job of JOBS) { try { rows.push(judge(job, await runsFor(job))); } catch (e) { console.log(job.id + ": " + e.message); } }
  const wr = await workerRow(); if (wr) rows.push(wr);
  for (const t of AI_TASKS) rows.push(await tagRow(t));
  await tidyStrays();
  if (!rows.length) throw new Error("Could not read any job");
  const prev = await readJson("data/health-state.json", { alerted: [] });
  const a = alerts(rows, prev);
  for (const r of a.warn) await tg(warnText(r) + "\n\nhttps://pogo.michaelpuff.com");
  for (const r of a.recovered) await tg("✅ " + r.name + " is running again.");
  const reg = await readJson("data/g47ix-infographics-review.json", {}), un = newUnmatched(reg.candidates, prev.unmatched);
  if (un.fresh.length) await tg("📌 " + un.fresh.length + " infographic" + (un.fresh.length > 1 ? "s match" : " matches") + " no event in the app: " + un.fresh.slice(0, 5).map(c => (c.title || c.id).slice(0, 60)).join("; ") + ".\nThe event may be missing from the app data.\n\nhttps://pogo.michaelpuff.com");
  await writeFile("data/health-state.json", JSON.stringify({ alerted: a.alerted, unmatched: un.all }, null, 1) + "\n");
  const old = await readJson("public/health.json", {});
  const same = JSON.stringify((old.jobs || []).map(j => [j.id, j.state])) === JSON.stringify(rows.map(j => [j.id, j.state]));
  const ageH = old.updated ? (Date.now() - Date.parse(old.updated)) / HOUR : 99;
  if (!same || ageH > 20) await writeFile("public/health.json", JSON.stringify({ updated: new Date().toISOString(), jobs: rows }, null, 1) + "\n");
  console.log(rows.map(r => r.name + ": " + r.state).join("\n"));
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
