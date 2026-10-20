// Finds the moves an event hands out for a limited time ("Evolve Zorua during the event ... to get Zoroark with the exclusive
// Fast Attack Sucker Punch", "Pokémon caught during the event will know X") and writes them to public/event-moves.json.
// These are NOT added to any Pokémon's normal moveset: the app shows them only while the window is open.
// Run: node scripts/event-moves.mjs
import { readFile, writeFile } from "node:fs/promises";

const slug = t => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const NAME = "[A-Z][\\wéÉ'’.-]*(?:\\s+(?:of\\s+)?[A-Z][\\wéÉ'’.-]*){0,2}";   // "Zoroark", "Mr. Mime", "Mega Charizard X"
const MOVE = "[A-Z][\\w'’-]*(?:\\s+(?:of\\s+|the\\s+)?[A-Z][\\w'’-]*){0,3}\\+?";   // "Sucker Punch", "Blast Burn", "Night Shade+"

// Every string worth reading in one event: the schedule's own notes and the importer's compared details.
export function textsOf(ev, details) {
  const out = [];
  for (const k of ["p", "notes"]) for (const t of ev?.[k] || []) if (typeof t === "string") out.push(t);
  const walk = v => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (k !== "sources" && k !== "status") walk(x);
  };
  if (details) { walk(details.fields); }
  return [...new Set(out.map(t => t.replace(/\b([ap])\.m\./gi, "$1m").replace(/\s+/g, " ").trim()).filter(Boolean))];
}

const sentences = t => t.split(/(?<=[.!?])\s+(?=[A-Z])/);

// A local clock time written in the text ("until 8:00 p.m.") on the event's last day; otherwise the event's own end.
function windowEnd(sentence, ev) {
  const end = String(ev.e || ev.end || "");
  const after = /up to (\d+)\s*hours? after/i.exec(sentence);
  if (after && end) { const d = new Date(end + "Z"); d.setUTCHours(d.getUTCHours() + Number(after[1])); return d.toISOString().slice(0, 16); }
  const clock = /until\s+(\d{1,2})(?::(\d{2}))?\s*([ap])m\b/i.exec(sentence);
  if (clock && end) {
    let h = Number(clock[1]) % 12 + (/p/i.test(clock[3]) ? 12 : 0);
    return end.slice(0, 10) + "T" + String(h).padStart(2, "0") + ":" + (clock[2] || "00");
  }
  return end.slice(0, 16);
}

// Keywords match in any case; names and moves must start with a capital letter, so the pattern is built letter by letter.
const k = w => w.replace(/[a-z]/gi, c => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const MOVE_INTRO = `(?:${k("the")}\\s+(?:${k("move")}\\s+)?|(?:${k("the")}\\s+)?(?:${k("exclusive")}\\s+)?(?:${k("fast")}|${k("charged")})\\s+${k("attack")}\\s+)?`;
const KNOW = `${k("will")}|${k("can")}`;
const HAVE = `${k("know")}|${k("learn")}`;   // "will have Mega Level 1" is not a move, so "have" is left out

// One sentence -> the moves it hands out, or [].
export function movesInSentence(s) {
  const out = [];
  const cleanMove = m => m.replace(/\s+(?:and|or|during|in|for|to|from|when)$/i, "").trim();
  const EV = `\\b${k("evolve")}|\\b${k("evolving")}|\\b${k("evolved")}`;
  // "Evolve Zorua during the event ... to get Zoroark with the exclusive Fast Attack Sucker Punch."
  let m = new RegExp(`(?:${EV})\\s+(?:(?:${k("a")}|${k("an")}|${k("the")})\\s+)?(${NAME})\\b[^.]*?\\b(?:${k("to get")}|${k("into")}|${k("get")}|${k("getting")}|${k("receive")})\\s+(?:(?:${k("a")}|${k("an")})\\s+)?(${NAME})\\b[^.]*?\\b(?:(?:${k("exclusive")}|${k("special")}|${k("new")})\\s+)?(Fast|Charged|fast|charged)\\s+${k("attack")}\\s+(${MOVE})`).exec(s);
  if (m) out.push({ acquisition: "EVOLVE", pokemon: m[1], target: m[2], kind: m[3].toLowerCase(), move: cleanMove(m[4]) });
  // "Evolve Zorua ... will know/learn/have X" (no named target: the evolution itself)
  if (!m) {
    m = new RegExp(`(?:${EV})\\s+(?:(?:${k("a")}|${k("an")}|${k("the")})\\s+)?(${NAME})\\b[^.]*?\\b(?:${KNOW})\\s+(?:${HAVE})\\s+${MOVE_INTRO}(${MOVE})`).exec(s);
    if (m) out.push({ acquisition: "EVOLVE", pokemon: m[1], target: "", kind: "", move: cleanMove(m[2]) });
  }
  // "Pokémon caught / hatched during the event will know X"  /  "Machamp caught during the event will know X"
  if (!out.length) {
    m = new RegExp(`(?:(${NAME})\\s+)?(?:${k("caught")}|${k("hatched")}|${k("encountered")})\\s+(?:${k("during")}|${k("in")}|${k("from")}|${k("throughout")})\\b[^.]*?\\b(?:${KNOW})\\s+(?:${HAVE})\\s+${MOVE_INTRO}(${MOVE})`).exec(s);
    if (m) out.push({ acquisition: "CATCH", pokemon: /^(?:Pokémon|Pokemon|Wild|Any|All)$/.test(m[1] || "") ? "" : (m[1] || ""), target: "", kind: "", move: cleanMove(m[2]) });
  }
  return out;
}

// All events -> the flat list the app reads.
export function buildEventMoves(events, details = {}) {
  const moves = [];
  for (const ev of events || []) {
    const start = String(ev.s || ev.start || "").slice(0, 16);
    const seen = new Set();
    for (const text of textsOf(ev, details[ev.id])) {
      for (const sent of sentences(text)) {
        for (const x of movesInSentence(sent)) {
          const id = [ev.id, slug(x.pokemon || "any"), slug(x.target), slug(x.move)].filter(Boolean).join(":");
          if (seen.has(id)) continue;
          seen.add(id);
          moves.push({
            id, eventId: ev.id, eventName: ev.t || ev.name || ev.id,
            pokemon: x.pokemon, evolutionTarget: x.target, move: x.move, moveKind: x.kind,
            acquisition: x.acquisition, windowStart: start, windowEnd: windowEnd(sent, ev),
            evolveProject: x.acquisition === "EVOLVE",   // needs the right form in hand: shown as an "Evolve project"
            text: sent.slice(0, 300)
          });
        }
      }
    }
  }
  return moves;
}

async function main() {
  const data = JSON.parse(await readFile("public/data.json", "utf8"));
  let details = {};
  try { details = JSON.parse(await readFile("public/event-details.json", "utf8")).events || {}; } catch {}
  const moves = buildEventMoves(data.events, details);
  let old = {};
  try { old = JSON.parse(await readFile("public/event-moves.json", "utf8")); } catch {}
  const same = JSON.stringify(old.moves || []) === JSON.stringify(moves);
  const out = { updated: same && old.updated ? old.updated : new Date().toISOString(), note: "Limited-time moves from events. Never part of a Pokémon's normal moveset; the app shows them only while the window is open. Written by scripts/event-moves.mjs.", moves };
  await writeFile("public/event-moves.json", JSON.stringify(out, null, 2) + "\n");
  console.log(`Event moves: ${moves.length} found${same ? " (unchanged)" : ""}.`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
