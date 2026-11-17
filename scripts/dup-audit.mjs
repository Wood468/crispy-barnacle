// Daily check for events listed twice. Looks across our curated events (public/data.json) and the world list
// (public/world-events.json) with the one shared rule in public/dedupe.js.
//   node scripts/dup-audit.mjs            report only (writes data/dup-audit.json)
//   node scripts/dup-audit.mjs --apply    also join the world-list duplicates in public/world-events.json
// Rulings the owner made live in data/event-aliases.json: { same: [[a, b]], different: [[a, b]] }.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { collapseWorld } from "./importer/world.mjs";
const dd = createRequire(import.meta.url)("../public/dedupe.js");
const WORLD = process.env.WORLD_FILE || "public/world-events.json", DATA = process.env.DATA_FILE || "public/data.json";
const RULES = process.env.RULES_FILE || "data/event-aliases.json", OUT = process.env.AUDIT_FILE || "data/dup-audit.json";
const rd = async (f, d) => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return d; } };
const label = e => ({ id: e.id, name: e.name, place: e.place || "", start: String(e.start || "").slice(0, 10), end: String(e.end || "").slice(0, 10), list: e.list });

const validDay = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const dateIssue = e => {
  // Curated events use ISO local timestamps; world rows use date-only windows.
  // Validate the complete input shape before extracting the calendar day.
  const day = value => {
    if (typeof value !== "string") return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (e.list === "curated" && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.test(value)) return value.slice(0, 10);
    return "";
  };
  const start = day(e.start), end = day(e.end ?? e.start);
  if (!validDay(start) || !validDay(end)) return "invalid calendar date";
  if (end < start || (end === start && typeof e.start === "string" && typeof e.end === "string" && e.start.includes("T") && e.end.includes("T") && Date.parse(e.end) < Date.parse(e.start))) return "ends before it starts";
  if ((Date.parse(end) - Date.parse(start)) / 864e5 > 3 * 365) return "runs longer than 3 years (typo year?)";
  return null;
};

export function audit(world, curated, rules, today = new Date().toISOString().slice(0, 10)) {
  const w = (world || []).filter(e => e.start && (e.end || e.start) >= today).map(e => ({ ...e, list: "world" }));
  const c = (curated || []).filter(e => e.s && String(e.e || e.s).slice(0, 10) >= today).map(e => ({ id: e.id, name: e.t, start: String(e.s).slice(0, 10), end: String(e.e || e.s).slice(0, 10), place: "", scope: "curated", list: "curated" }));
  const same = [], crossList = [], maybe = [];
  for (const g of dd.groups([...c, ...w], rules)) {
    for (const d of g.dupes) (g.keep.list === d.event.list ? same : crossList).push({ keep: label(g.keep), dupe: label(d.event), why: d.why });
    for (const m of g.maybe) maybe.push({ a: label(g.keep), b: label(m.event), why: m.why });
  }
  // Inspect all input rows: malformed dates must not disappear during active-day filtering.
  const odd = [...(world || []).map(e=>({...e,list:"world"})),
    ...(curated || []).map(e=>({id:e.id,name:e.t,start:e.s,end:e.e||e.s,list:"curated"}))]
    .map(e=>({event:e,why:dateIssue(e)})).filter(x=>x.why)
    .map(({event,why})=>({...label(event),why}));
  return { same, crossList, maybe, odd };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const worldFile = await rd(WORLD, { events: [] }), rules = await rd(RULES, null), data = await rd(DATA, { events: [] });
  let events = worldFile.events || [], joined = [];
  if (apply) {
    const r = collapseWorld(events, rules); joined = r.merged; events = r.events;
    if (joined.length) await writeFile(WORLD, JSON.stringify({ ...worldFile, events }, null, 1) + "\n");
  }
  const res = audit(events, data.events, rules);
  const report = { updated: new Date().toISOString(), joinedThisRun: joined, ...res };
  await writeFile(OUT, JSON.stringify(report, null, 1) + "\n");
  console.log(`Duplicate check: ${joined.length} joined this run, ${res.same.length} still listed twice, ${res.crossList.length} in both lists (the app shows one), ${res.maybe.length} to review, ${res.odd.length} odd dates.`);
  for (const s of res.same) console.log(`  SAME  ${s.keep.name} [${s.keep.list}]  =  ${s.dupe.name} [${s.dupe.list}]  (${s.why})`);
  for (const s of res.crossList) console.log(`  BOTH  ${s.keep.name} [${s.keep.list}]  =  ${s.dupe.name} [${s.dupe.list}]  (app hides the world copy)`);
  for (const m of res.maybe) console.log(`  MAYBE ${m.a.name}  ~  ${m.b.name}  (${m.why})`);
  for (const o of res.odd) console.log(`  ODD   ${o.name}: ${o.why}`);
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exitCode = 1; });
