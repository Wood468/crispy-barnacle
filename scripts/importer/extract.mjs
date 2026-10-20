// Pulls the same fields out of any article: what a heading says it is about decides where the lines under it go.
import { htmlToLines } from "./text.mjs";

export const FIELDS = ["bonuses", "featured", "raids", "eggs", "research", "shiny", "moves", "costumes", "tickets", "dates"];
const HEAD = [
  ["tickets", /ticket|go pass|purchase|buy|price|event pass/i],
  ["bonuses", /bonus|boost/i],
  ["shiny", /shiny|shinies/i],
  ["costumes", /costume|outfit|hat\b|visor|clothing/i],
  ["eggs", /\begg|hatch/i],
  ["research", /research|quest|task/i],
  ["raids", /raid|max battle|dynamax|gigantamax|power spot/i],
  ["moves", /\bmoves?\b|attack/i],
  ["featured", /featur|wild encounter|spawn|appear|habitat|debut|encounter|incense|lure/i]
];
const LINE = [
  ["tickets", /\b(ticket|go pass)\b.*(\$|A\$|US\$|€|£)|(\$|A\$|US\$)\s?\d/i],
  ["bonuses", /\b(\d(?:\.\d)?\s?[×x]|double|triple|half|\d+%)\b.*\b(xp|stardust|candy|hatch|distance|lure|incense|catch|trade|raid pass|egg)/i],
  ["shiny", /\bshiny\b/i],
  ["moves", /\b(exclusive|special|new)\b.*\b(fast|charged)\b.*\bmove|learn.*\bmove/i],
  ["costumes", /\b(wearing|costume|hat|visor|outfit)\b/i],
  ["dates", /\b(\d{1,2}(:\d\d)?\s?(a\.?m\.?|p\.?m\.?)|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2})\b.*\b(to|until|–|-)\b/i]
];
const RANKLABEL = /^(?:tier\s*\d+\W*)?\(?rank\s*(\d+)\)?\W*(?:bonus(?:es)?|milestone)?\W*$|^tier\s*\d+\s*bonus\s*starting at rank\s*(\d+)\W*$/i;
const trim = s => s.replace(/^[•·\-–\s]+/, "").replace(/\s+/g, " ").trim();
const NOISE = /^(share|read more|related|advertisement|sign up|follow us|comments?|learn more|and even more|keep an eye out|tier \d|rank \d+\s*$)|and even more goodies|learn more about|^\*/i;
const keep = s => (s.length >= 14 || /[×]|\d\s?x\b/i.test(s) && s.length >= 6) && s.length <= 220 && !NOISE.test(s);

export function extractFields(html) {
  const lines = Array.isArray(html) ? html : htmlToLines(html);
  const out = Object.fromEntries(FIELDS.map(f => [f, []]));
  const add = (f, s) => { s = trim(s); if (keep(s) && !out[f].includes(s) && out[f].filter(x => /^rank \d+/i.test(x) === /^rank \d+/i.test(s)).length < (/^rank \d+/i.test(s) ? 110 : 14)) out[f].push(s); };
  let cur = null, rank = 0, headSeen = "", deluxe = false, taken = 0;
  for (const l of lines) {
    // "Tier 2 – Rank 25" style labels: remember the rank so the bonus lines under it say which rank unlocks them.
    const rm = RANKLABEL.exec(l.text);
    if (/^upgrade to the go pass deluxe to strengthen/i.test(l.text)) { deluxe = true; continue; }
    if (rm) { rank = +(rm[1] || rm[2]); cur = "bonuses"; taken = 0; continue; }
    const tr = /^tier\s*\d+\s*\(rank\s*(\d+)\)\s*\|\s*(.{6,})$/i.exec(l.text);
    if (tr) { add("bonuses", `Rank ${tr[1]}: ${tr[2]}`); continue; }
    // reward table rows such as "97 | Kyogre Candy": GO Pass rank rewards
    const row = /^(?:rank\s*)?(\d{1,3})\s*\|\s*(.{3,})$/i.exec(l.text);
    if (row && /pass|rank|reward|milestone/i.test(headSeen)) {
      const cols = row[2].split(/\s*\|\s*/);
      if (cols[0].length > 70) continue; // the long milestone rows repeat the bonuses above
      add("tickets", cols.length >= 2 ? `Rank ${row[1]}: Free: ${cols[0]} | Deluxe: ${cols[1]}` : `Rank ${row[1]}: ${cols[0]}`); continue;
    }
    if (l.t === "p" && rank) rank = 0;
    if (l.t === "li" && rank && cur === "bonuses") {
      if (++taken > 6 || /https?:|last update|categories|editor in chief/i.test(l.text)) { rank = 0; continue; } add("bonuses", `Rank ${rank}${deluxe ? " Deluxe" : ""}: ${l.text}`); continue; }
    if (l.t === "h") {
      rank = 0; deluxe = false; headSeen = l.text;
      const hit = HEAD.find(([, re]) => re.test(l.text));
      cur = hit ? hit[0] : null;
      if (/\bdebut\b/i.test(l.text) && !/shiny/i.test(l.text)) add("featured", l.text);
      continue;
    }
    if (cur) add(cur, l.text);
    for (const [f, re] of LINE) if (re.test(l.text) && f !== cur) add(f, l.text);
  }
  return out;
}
export function hasContent(fields) { return FIELDS.some(f => fields[f] && fields[f].length); }
