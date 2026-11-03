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
  ["dates", /\b(\d{1,2}(:\d\d)?\s?(a\.?m\.?|p\.?m\.?)|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2})\b.*\b(to|until|–|-)\b/i],
  // In-person events give their times as "Event time: 6:00 p.m. to 10:30 p.m. GMT" or "Doors open: 6:00 p.m. PDT": keep those lines so the digest and reminders can convert them.
  ["dates", /\b(doors open|show starts|event time|start time)\b.*\d\s?[ap]\.?m\.?/i]
];
const RANKLABEL = /^(?:tier\s*\d+\W*)?\(?rank\s*(\d+)\)?\W*(?:bonus(?:es)?|milestone)?\W*$|^tier\s*\d+\s*bonus\s*starting at rank\s*(\d+)\W*$/i;
const trim = s => s.replace(/^[•·\-–\s]+/, "").replace(/\s+/g, " ").trim();
const NOISE = /^(share|read more|related|advertisement|sign up|follow us|comments?|learn more|and even more|keep an eye out|tier \d|rank \d+\s*$)|and even more goodies|learn more about|^\*/i;
const keep = s => (s.length >= 14 || /[×]|\d\s?x\b/i.test(s) && s.length >= 6) && s.length <= 220 && !NOISE.test(s);

function parseResearchTask(line, category) {
  const marker = /\b(?:possible\s+)?rewards?\s*:?\s*/i.exec(String(line || ""));
  if (!marker) return null;
  const task = trim(String(line).slice(0, marker.index)).replace(/[|:–—-]+$/, "").trim();
  const rewardText = trim(String(line).slice(marker.index + marker[0].length));
  if (!task || /^task$/i.test(task) || task.length < 4 || !rewardText || /^(possible )?rewards?$/i.test(rewardText)) return null;
  if (!/^(catch|spin|make|win|complete|send|hatch|power up|evolve|take|use|earn|battle|trade|transfer|walk|feed|give|land|defeat|purify|exchange|open|explore|adventure|beat|visit|photograph|level up|collect|get|play|perform|throw)\\b/i.test(task)) return null;
  const rewards = [];
  const cp = /([^|]+?)\s+Max CP\s+(\d{2,4})\s+Min CP\s+(\d{2,4})/gi;
  let match;
  while ((match = cp.exec(rewardText)) !== null) {
    const name = trim(match[1]).replace(/^[|,;\s]+/, "");
    const maxCP = Number(match[2]), minCP = Number(match[3]);
    if (!name || minCP > maxCP || maxCP > 9999) continue;
    rewards.push({ type: "encounter", name, quantity: 1, cpMin: minCP, cpMax: maxCP });
  }
  if (!rewards.length) {
    for (const chunk of rewardText.split(/\s+\|\s+/).map(trim).filter(Boolean)) {
      const qty = /^(?:[×x]\s*(\d+)\s*)?(.+?)(?:\s+[×x]\s*(\d+))?$/i.exec(chunk);
      if (!qty) continue;
      let name = trim(qty[2]);
      if (!name || /^(possible )?rewards?$/i.test(name) || name.length > 100) continue;
      let quantity = Number(qty[1] || qty[3] || 1);
      const numeric = /^(\d+)\s+(.+)$/.exec(name);
      if (numeric) { quantity = Number(numeric[1]); name = trim(numeric[2]); }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) continue;
      const encounter = /^(?:an?\s+)?encounter with\s+(.+)$/i.exec(name);
      const knownItem = /\b(candy|ball|stardust|xp|energy|pass|incubator|revive|potion|pok[eé]coin|rare candy|incense|lure|egg)\b/i.test(name);
      const explicitQuantity = !!(qty[1] || qty[3] || numeric);
      if (!encounter && !knownItem && !explicitQuantity) continue;
      if (encounter) name = trim(encounter[1]);
      const type = encounter ? "encounter" : knownItem ? "item" : "other";
      rewards.push({ type, name, quantity });
    }
  }
  return rewards.length ? { task, category: category || "research", rewards } : null;
}

export function extractFields(html) {
  const lines = Array.isArray(html) ? html : htmlToLines(html);
  const out = Object.fromEntries(FIELDS.map(f => [f, []])); out.researchTasks = [];
  const add = (f, s) => { s = trim(s); if (keep(s) && !out[f].includes(s) && out[f].filter(x => /^rank \d+/i.test(x) === /^rank \d+/i.test(s)).length < (/^rank \d+/i.test(s) ? 110 : 14)) out[f].push(s); };
  let cur = null, rank = 0, headSeen = "", deluxe = false, taken = 0, researchKind = "research";
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
      researchKind = /field\s+research/i.test(l.text) ? "field" : /timed\s+research/i.test(l.text) ? "timed" : /special\s+research/i.test(l.text) ? "special" : "research";
      if (/\bdebut\b/i.test(l.text) && !/shiny/i.test(l.text)) add("featured", l.text);
      continue;
    }
    if (cur) add(cur, l.text);
    if (cur === "research") {
      const task = parseResearchTask(l.text, researchKind);
      if (task) {
        const key = JSON.stringify([task.category, task.task.toLowerCase(), task.rewards]);
        if (!out.researchTasks.some(x => JSON.stringify([x.category, x.task.toLowerCase(), x.rewards]) === key)) out.researchTasks.push(task);
      }
    }
    for (const [f, re] of LINE) if (re.test(l.text) && f !== cur) add(f, l.text);
  }
  return out;
}
export function hasContent(fields) { return FIELDS.some(f => fields[f] && fields[f].length); }
