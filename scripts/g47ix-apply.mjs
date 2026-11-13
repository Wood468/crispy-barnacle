#!/usr/bin/env node
// Applies the owner's decisions made in the app's "Infographic review" list.
// The app stores Approve / Reject / Change event in the site database; this reads them (they carry no private data),
// attaches approved pictures to the chosen event in public/event-info.json, and drops rejected ones.
// The owner's tap in the app is the approval, so the workflow commits this straight to main.
import { readFile, writeFile, rm } from "node:fs/promises";
import {addToEventInfo, datedEvents, publicSourceUrl, sanitizePublicInfographicSources, sanitizeRegistrySources } from "./g47ix-publish.mjs";
import { targetsFromInfographicDecision } from "./infographic-target-contract.mjs";

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
// Guides live independently of rotations: exact Pokémon, form and battle mode.
export function removeFromPokemonGuides(info, url) {
  if (!Array.isArray(info.pokemonGuides)) return;
  info.pokemonGuides = info.pokemonGuides.map(g => ({
    ...g, infographics: (g.infographics || []).filter(i => i.url !== url)
  })).filter(g => g.infographics.length);
}
export function addToPokemonGuides(info, target, graphic) {
  if (!target || target.type !== "raid-boss" || !graphic || !graphic.url) return false;
  info.pokemonGuides ||= [];
  let guide = info.pokemonGuides.find(g => g.pokemonId === target.pokemonId &&
    g.formId === target.formId && g.battleMode === target.battleMode);
  if (!guide) {
    guide = {pokemonId: target.pokemonId, formId: target.formId, battleMode: target.battleMode, infographics: []};
    info.pokemonGuides.push(guide);
  }
  if (guide.infographics.some(i => i.url === graphic.url)) return false;
  const sourceUrl = publicSourceUrl(graphic.sourceUrl), creator = graphic.creator || "G47IX";
  guide.infographics.push({url: graphic.url, label: "Raid boss guide · " + creator,
    source: creator, ...(sourceUrl ? {sourceUrl} : {}), alt: graphic.alt || "Pokémon raid boss infographic"});
  return true;
}

// A decision is the wanted state: which events carry the picture. Later changes (add another event, unlink one, discard)
// are applied to pictures that were already published too.
// eventOf(id) may return the event (with s, e, src) so the entry is dated; without it entries are written undated, as before.
export function applyDecisions(reg, info, decisions, today = new Date().toISOString().slice(0, 10), eventOf = () => null) {
  const out = { published: [], rejected: [], skipped: [], changed: [] };
  for (const d of decisions || []) {
    const c = (reg.candidates || []).find(x => x.id === d.id);
    if (!c) { out.skipped.push(d.id); continue; }
    const was = c.publishedEvents || (c.publishedEvent ? [c.publishedEvent] : []);
    const wasLive = c.reviewStatus === "published";
    const previousBoss = Array.isArray(c.publishedTargets) ? c.publishedTargets : [];
    if (d.status === "rejected") {
      if (c.overview) { out.skipped.push(d.id); continue; } // a restored week/month picture is not re-discarded by an old Discard
      if (wasLive && c.stagedPath) { removeFromEventInfo(info, c.stagedPath, was); removeFromPokemonGuides(info, c.stagedPath); }
      if (c.decision === "rejected" && !wasLive) { out.skipped.push(d.id); continue; }
      c.decision = "rejected"; c.reviewStatus = "rejected"; c.publishedEvents = []; c.publishedTargets = []; out.rejected.push(c); continue;
    }
    if (d.status === "week" || d.status === "month") {
      if (c.overview === d.status && c.reviewStatus === "weekly") { out.skipped.push(d.id); continue; }
      if (wasLive && c.stagedPath) { removeFromEventInfo(info, c.stagedPath, was); removeFromPokemonGuides(info, c.stagedPath); }
      c.overview = d.status; c.reviewStatus = "weekly"; c.decision = ""; c.publishedEvents = []; c.publishedTargets = []; delete c.publishedEvent; out.changed.push(c); continue;
    }
    if (d.status === "unlinked") {
      if (!wasLive) { out.skipped.push(d.id); continue; }
      if (c.stagedPath) { removeFromEventInfo(info, c.stagedPath, was); removeFromPokemonGuides(info, c.stagedPath); }
      c.reviewStatus = "needs_review"; c.decision = ""; c.publishedEvents = []; c.publishedTargets = []; delete c.publishedEvent; out.changed.push(c); continue;
    }
    if (d.status !== "approved" || !c.stagedPath) { out.skipped.push(d.id); continue; }
    let targets;
    try { targets = targetsFromInfographicDecision(d); }
    catch { out.skipped.push(d.id); continue; }
    if (!targets.length || targets.length > 8) { out.skipped.push(d.id); continue; }
    const bossTargets = targets.filter(t => t.type === "raid-boss");
    if (c.decision === "rejected" && c.reviewStatus === "rejected") { out.skipped.push(d.id); continue; }
    const want = targets.filter(t => t.type === "event").map(t => t.eventId), titles = titlesOf(d);
    if (wasLive && want.length === was.length && want.every(x => was.includes(x)) &&
        JSON.stringify(bossTargets) === JSON.stringify(previousBoss)) { out.skipped.push(d.id); continue; }
    if (wasLive) { removeFromEventInfo(info, c.stagedPath, was.filter(x => !want.includes(x))); removeFromPokemonGuides(info, c.stagedPath); }
    want.forEach((id, i) => {
      const t = titles[i] || id;
      addToEventInfo(info, { id, t, ...(eventOf(id) || {}) }, { url: c.stagedPath, sourceUrl: c.url, observed: today, alt: t + " infographic", creator: c.creator });
    });
    bossTargets.forEach(t => addToPokemonGuides(info, t, {url: c.stagedPath, sourceUrl: c.url,
      observed: today, alt: c.title || "Pokémon raid boss guide", creator: c.creator}));
    c.reviewStatus = "published"; c.decision = "approved"; c.publishedEvent = want[0] || "";
    c.publishedEvents = want; c.publishedTargets = bossTargets;
    (wasLive ? out.changed : out.published).push(c);
  }
  return out;
}

async function main() {
  const r = await fetch(APP + "/api/ig-decisions", { signal: AbortSignal.timeout(20000) });
  if (!r.ok) { console.log("No decisions available (HTTP " + r.status + ")."); return; }
  const { decisions } = await r.json();
  const reg = JSON.parse(await readFile(REG, "utf8")), info = JSON.parse(await readFile(INFO, "utf8"));
  const read = async f => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return {}; } };
  const events = datedEvents({ data: await read("public/data.json"), details: await read("public/event-details.json"), world: await read("public/world-events.json") });
  const bare = id => String(id).replace(/^[a-z]+:/, "");
  const eventOf = id => { const hit = events.find(e => e.id === id) || events.find(e => bare(e.id) === bare(id)); return hit ? { s: hit.s, e: hit.e, src: hit.src } : null; };
  const res = applyDecisions(reg, info, decisions, undefined, eventOf);
  for (const c of res.rejected) if (c.stagedPath) await rm("public" + c.stagedPath, { force: true });
  await writeFile(REG, JSON.stringify(sanitizeRegistrySources(reg), null, 2) + "\n");
  await writeFile(INFO, JSON.stringify(sanitizePublicInfographicSources(info), null, 2) + "\n");
  try {
    const q = JSON.parse(await readFile(QUEUE, "utf8")), gone = new Set(res.rejected.map(c => c.id)), live = new Set([...res.published, ...res.changed].filter(c => c.reviewStatus === "published").map(c => c.id));
    q.items = (q.items || []).filter(i => !gone.has(i.id)).map(i => ({ ...i, ...(live.has(i.id) ? { linked: true } : {}), post: publicSourceUrl(i.post) })); await writeFile(QUEUE, JSON.stringify(q, null, 1) + "\n");
  } catch { /* no queue yet */ }
  console.log("Published " + res.published.length + ", rejected " + res.rejected.length + ", changed " + res.changed.length + ", skipped " + res.skipped.length + ".");
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(0); });
