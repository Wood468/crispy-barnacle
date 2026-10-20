// Read-only cross-check of our event list against ScrapedDuck's copy of Leek Duck (https://github.com/bigfoott/ScrapedDuck, the data branch).
// Lists events ScrapedDuck has that we lack, events we have that it lacks, and shiny flags that disagree. It never edits public data and
// is not used as a source: it only writes data/scrapedduck-compare.json for the daily check (and a person) to look at.
// ScrapedDuck asks to be credited and not paywalled; this is an internal check. Fetch at most once per run (GitHub caches the file 5 minutes).
// Run: node scripts/scrapedduck-compare.mjs
import { readFile, writeFile } from "node:fs/promises";

export const URL_EVENTS = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json";
const DAY = 864e5, WINDOW = 45;
const STOP = new Set(["the", "a", "of", "in", "and", "day", "event", "pokemon", "pokémon", "go", "2026", "season", "raid", "raids", "battle", "battles"]);
const words = s => new Set(String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)));
const day = s => (s ? Date.parse(String(s).slice(0, 10)) : NaN);
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= DAY;
// Two events are the same when they start within a day of each other and share a meaningful word, or when both are type "GBL"/league seasons (ignored).
export function same(sd, ours) {
  if (!near(day(sd.start), day(ours.start))) return false;
  const a = words(sd.name), b = words(ours.name);
  for (const w of a) if (b.has(w)) return true;
  return false;
}
// Leagues and the weekly rotations (raid bosses, spotlights, raid hours, Max Mondays, passes, seasons) live in their own lists in data.json, not in events.
const SKIP_TYPES = new Set(["go-battle-league", "raid-battles", "pokemon-spotlight-hour", "raid-hour", "max-mondays", "go-pass", "season"]);
const skip = e => SKIP_TYPES.has(e.eventType) || /^GBL\b/i.test(e.name);

export function compare({ sd, ours, now }) {
  const inWin = e => { const s = day(e.start), en = day(e.end ?? e.start); return Number.isFinite(s) && s <= now + WINDOW * DAY && (Number.isFinite(en) ? en : s) >= now - DAY; };
  const a = (sd || []).filter(e => !skip(e) && inWin(e)), b = (ours || []).filter(inWin);
  const missingHere = a.filter(e => !b.some(o => same(e, o))).map(e => ({ name: e.name, type: e.eventType, start: e.start, link: e.link }));
  const missingThere = b.filter(o => !a.some(e => same(e, o))).map(o => ({ id: o.id, name: o.name, start: o.start }));
  // shiny: ScrapedDuck lists shinies for Community Days, spotlights, breakthroughs and raids; ours has art {shiny:1} or text "shiny"
  const shinyDisagree = [];
  for (const e of a) {
    const x = e.extraData || {}, names = [];
    for (const k of ["communityday", "raidbattles"]) for (const s of (x[k] && x[k].shinies) || []) names.push(s.name);
    for (const k of ["spotlight", "breakthrough"]) if (x[k] && x[k].canBeShiny) names.push(x[k].name);
    const mine = b.find(o => same(e, o));
    if (!mine || !names.length) continue;
    const blob = JSON.stringify([mine.art, mine.p, mine.highlights]).toLowerCase();
    if (!/shiny/.test(blob)) shinyDisagree.push({ event: mine.id, name: mine.name, scrapedDuckShinies: [...new Set(names)] });
  }
  return { missingHere, missingThere, shinyDisagree };
}

async function main() {
  const rd = async f => JSON.parse(await readFile(f, "utf8"));
  const [data, world] = await Promise.all([rd("public/data.json"), rd("public/world-events.json")]);
  const ours = [...(data.events || []).map(e => ({ ...e, start: e.s, end: e.e, name: e.t })), ...(world.events || [])];
  let sd;
  try {
    const res = await fetch(URL_EVENTS, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    sd = await res.json();
    if (!Array.isArray(sd) || !sd.length) throw new Error("not an event list");
  } catch (e) {
    await writeFile("data/scrapedduck-compare.json", JSON.stringify({ updated: new Date().toISOString(), state: "error", note: String(e.message).slice(0, 120) }, null, 1) + "\n");
    console.log("ScrapedDuck unavailable: " + e.message); return;
  }
  const out = { updated: new Date().toISOString(), state: "ok", scrapedDuckEvents: sd.length, ...compare({ sd, ours, now: Date.now() }) };
  await writeFile("data/scrapedduck-compare.json", JSON.stringify(out, null, 1) + "\n");
  console.log(`ScrapedDuck ${sd.length} events: ${out.missingHere.length} not in our list, ${out.missingThere.length} of ours not in theirs, ${out.shinyDisagree.length} shiny disagreements`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
