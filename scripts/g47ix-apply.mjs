#!/usr/bin/env node
// Applies the owner's decisions made in the app's "Infographic review" list.
// The app stores Approve / Reject / Change event in the site database; this reads them (they carry no private data),
// attaches approved pictures to the chosen event in public/event-info.json, and drops rejected ones.
// The owner's tap in the app is the approval, so the workflow commits this straight to main.
import { readFile, writeFile, rm } from "node:fs/promises";
import { addToEventInfo } from "./g47ix-publish.mjs";

const APP = process.env.APP_URL || "https://pogo.michaelpuff.com";
const REG = process.env.REGISTRY_FILE || "data/g47ix-infographics-review.json";
const INFO = process.env.EVENT_INFO_FILE || "public/event-info.json";
const QUEUE = process.env.QUEUE_FILE || "public/infographic-queue.json";

// Removes one picture (by its file path) from the given events in event-info.json.
export function removeFromEventInfo(info, url, eventIds) {
  const ids = new Set(eventIds);
  for (const [key, e] of Object.entries(info.events || {})) {
    const bare = key.replace(/^[a-z]+:/, "");
    if (!ids.has(key) && !ids.has(bare) && !ids.has("e:" + key)) continue;
    e.infographics = (e.infographics || []).filter(g => g.url !== url);
    if (!e.infographics.length) delete e.infographics;
  }
}
const idsOf = d => String(d.eventId || "").split(",").filter(Boolean);
const titlesOf = d => String(d.eventTitle || "").split(" | ");

// A decision is the wanted state: which events carry the picture. Later changes (add another event, unlink one, discard)
// are applied to pictures that were already published too.
export function applyDecisions(reg, info, decisions, today = new Date().toISOString().slice(0, 10)) {
  const out = { published: [], rejected: [], skipped: [], changed: [] };
  for (const d of decisions || []) {
    const c = (reg.candidates || []).find(x => x.id === d.id);
    if (!c) { out.skipped.push(d.id); continue; }
    const was = c.publishedEvents || (c.publishedEvent ? [c.publishedEvent] : []);
    const wasLive = c.reviewStatus === "published";
    if (d.status === "rejected") {
      if (c.overview) { out.skipped.push(d.id); continue; } // a restored week/month picture is not re-discarded by an old Discard
      if (wasLive && c.stagedPath) removeFromEventInfo(info, c.stagedPath, was);
      if (c.decision === "rejected" && !wasLive) { out.skipped.push(d.id); continue; }
      c.decision = "rejected"; c.reviewStatus = "rejected"; c.publishedEvents = []; out.rejected.push(c); continue;
    }
    if (d.status === "week" || d.status === "month") {
      if (c.overview === d.status && c.reviewStatus === "weekly") { out.skipped.push(d.id); continue; }
      if (wasLive && c.stagedPath) removeFromEventInfo(info, c.stagedPath, was);
      c.overview = d.status; c.reviewStatus = "weekly"; c.decision = ""; c.publishedEvents = []; delete c.publishedEvent; out.changed.push(c); continue;
    }
    if (d.status === "unlinked") {
      if (!wasLive) { out.skipped.push(d.id); continue; }
      if (c.stagedPath) removeFromEventInfo(info, c.stagedPath, was);
      c.reviewStatus = "needs_review"; c.decision = ""; c.publishedEvents = []; delete c.publishedEvent; out.changed.push(c); continue;
    }
    if (d.status !== "approved" || !d.eventId || !c.stagedPath) { out.skipped.push(d.id); continue; }
    if (c.decision === "rejected" && c.reviewStatus === "rejected") { out.skipped.push(d.id); continue; }
    const want = idsOf(d), titles = titlesOf(d);
    if (wasLive && want.length === was.length && want.every(x => was.includes(x))) { out.skipped.push(d.id); continue; }
    if (wasLive) removeFromEventInfo(info, c.stagedPath, was.filter(x => !want.includes(x)));
    want.forEach((id, i) => {
      const t = titles[i] || id;
      addToEventInfo(info, { id, t }, { url: c.stagedPath, sourceUrl: c.url, observed: today, alt: t + " infographic", creator: c.creator });
    });
    c.reviewStatus = "published"; c.decision = "approved"; c.publishedEvent = want[0]; c.publishedEvents = want;
    (wasLive ? out.changed : out.published).push(c);
  }
  return out;
}

async function main() {
  const r = await fetch(APP + "/api/ig-decisions", { signal: AbortSignal.timeout(20000) });
  if (!r.ok) { console.log("No decisions available (HTTP " + r.status + ")."); return; }
  const { decisions } = await r.json();
  const reg = JSON.parse(await readFile(REG, "utf8")), info = JSON.parse(await readFile(INFO, "utf8"));
  const res = applyDecisions(reg, info, decisions);
  for (const c of res.rejected) if (c.stagedPath) await rm("public" + c.stagedPath, { force: true });
  await writeFile(REG, JSON.stringify(reg, null, 2) + "\n");
  await writeFile(INFO, JSON.stringify(info, null, 2) + "\n");
  try {
    const q = JSON.parse(await readFile(QUEUE, "utf8")), gone = new Set(res.rejected.map(c => c.id)), live = new Set([...res.published, ...res.changed].filter(c => c.reviewStatus === "published").map(c => c.id));
    q.items = (q.items || []).filter(i => !gone.has(i.id)).map(i => live.has(i.id) ? { ...i, linked: true } : i); await writeFile(QUEUE, JSON.stringify(q, null, 1) + "\n");
  } catch { /* no queue yet */ }
  console.log("Published " + res.published.length + ", rejected " + res.rejected.length + ", changed " + res.changed.length + ", skipped " + res.skipped.length + ".");
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(0); });
