#!/usr/bin/env node
// One-off backfill: give existing public/event-info.json entries a start / end (YYYY-MM-DD) and dateSource, taken from the event
// with the same id in public/data.json, world-events.json, the raid rotation or event-details.json. Entries with no event of that id,
// or with sources that disagree, are left untouched (never guessed). Dry run by default: `node scripts/event-info-dates.mjs --write` saves.
// New and refreshed pictures are dated by addToEventInfo in g47ix-publish.mjs; this only covers entries that existed before.
import { readFile, writeFile } from "node:fs/promises";
import { datedEvents, eventDates } from "./g47ix-publish.mjs";

const bare = id => String(id || "").replace(/^[a-z]+:/, "").toLowerCase();
// Returns { dated: [{key, ...dates}], left: [{key, why}] } and sets the date fields on info.events entries that qualify.
export function backfill(info, sources) {
  const events = datedEvents(sources), out = { dated: [], left: [] };
  for (const [key, e] of Object.entries(info.events || {})) {
    if (e.start) { out.left.push({ key, why: "already dated" }); continue; }
    const hits = events.filter(x => x.id === key || bare(x.id) === bare(key)).map(eventDates).filter(Boolean);
    const distinct = new Map(hits.map(h => [h.start + "/" + h.end, h]));
    if (!hits.length) { out.left.push({ key, why: "no event with this id and a date" }); continue; }
    if (distinct.size > 1) { out.left.push({ key, why: "sources disagree: " + [...distinct.keys()].join(" vs ") }); continue; }
    const d = hits[0]; e.start = d.start; e.end = d.end; e.dateSource = d.dateSource;
    out.dated.push({ key, ...d });
  }
  return out;
}

async function main() {
  const read = async (f, fallback) => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return fallback; } };
  const INFO = process.env.EVENT_INFO_FILE || "public/event-info.json";
  const info = await read(INFO), sources = { data: await read("public/data.json", {}), details: await read("public/event-details.json", {}), world: await read("public/world-events.json", {}) };
  const r = backfill(info, sources);
  for (const d of r.dated) console.log("dated  ", d.key, d.start, d.end, d.dateSource);
  for (const d of r.left) console.log("undated", d.key, "-", d.why);
  console.log(r.dated.length + " dated, " + r.left.length + " left as they were.");
  if (process.argv.includes("--write")) { await writeFile(INFO, JSON.stringify(info, null, 2) + "\n"); console.log("Saved " + INFO + "."); }
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
