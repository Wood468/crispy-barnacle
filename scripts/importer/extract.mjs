// Pulls the same fields out of any article: what a heading says it is about decides where the lines under it go.
import { htmlToLines } from "./text.mjs";
import { extractLeekDuckGoPassRewards } from "./gopass.mjs";

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
  // Named event bonuses must survive even when the publisher places them
  // outside a section headed "Bonuses" (for example under a Shiny heading).
  ["bonuses", /\b(?:shiny gimmighoul\b.*\bcoin bag|coin bag\b.*\bshiny gimmighoul|shiny meltan\b.*\bmystery box|mystery box\b.*\bshiny meltan)\b/i],
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
const keep = s => (s.length >= 14 || /[×]|\d\s?x\b/i.test(s) && s.length >= 6) && (s.length <= 220 || /^rank \d+/i.test(s) && s.length <= 600) && !NOISE.test(s);

export function researchOptions({dex=[],names=[],costumes=[],forms={f:[]}}={}){
 const byId=new Map(dex.map(p=>[p[0],p[1]])),prefix={alola:'Alolan',galar:'Galarian',hisui:'Hisuian',paldea:'Paldean',mega:'Mega',primal:'Primal',gmax:'Gigantamax'};
 const formNames=(forms.f||[]).filter(row=>prefix[row[1]]&&byId.has(row[0])).map(row=>prefix[row[1]]+' '+byId.get(row[0]));
 return {pokemonNames:[...dex.map(p=>p[1]),...names,...formNames],costumes};
}

function researchRewardNames(options){
 const entries=new Map(),key=value=>trim(value).normalize('NFKC').toLowerCase();
 function add(name,record){entries.set(key(name),record);entries.set(key('Mighty '+name),{...record,mighty:true});}
 for(const name of options.pokemonNames||[]){if(typeof name==='string'&&name)add(name,{name});}
 for(const costume of options.costumes||[]){if(!costume?.name||!costume.label)continue;const record={name:costume.name+' ('+costume.label+')',costume:true,label:costume.label,costumeId:costume.costumeId};for(const alias of [record.name,costume.label+' '+costume.name,costume.name+' wearing a '+costume.label])add(alias,record);}
 const names=[...entries.keys()].sort((a,b)=>b.length-a.length);
 return value=>{let rest=key(value),out=[];if(!rest||!names.length)return null;while(rest){const name=names.find(name=>rest===name||rest.startsWith(name+' '));if(!name)return null;out.push({...entries.get(name)});rest=rest.slice(name.length).trim();}return out;};
}

function parseResearchTask(line, category, declaredNames) {
  // Published research tables may use "Task | 7740 × Stardust" rather
  // than the prose marker "REWARD". Only accept an explicit task verb
  // and a concrete reward cell; do not infer tasks from event descriptions.
  const cells = String(line || "").split(/\s*\|\s*/).map(trim);
  if (cells.length === 2 && /^(?:catch|spin|make|win|complete|send|hatch|power up|evolve|take|use|earn|battle|trade|transfer|walk|feed|give|land|defeat|purify|exchange|open|explore|adventure|beat|visit|photograph|level up|collect|get|play|perform|throw|claim reward)\b/i.test(cells[0]) &&
      /^(?:\d[\d,]*\s*[×x]\s*|[×x]\s*\d+\s+|\d[\d,]*\s+|an?\s+encounter with\s+)/i.test(cells[1])) {
    line = cells[0] + " REWARD " + cells[1].replace(/^(\d[\d,]*)\s*[×x]\s*/i, "×$1 ");
  }
  const marker = /\sREWARD\s/i.exec(String(line || "")) || /\b(?:possible\s+)?rewards?\s*:?\s*/i.exec(String(line || ""));
  if (!marker) return null;
  const task = trim(String(line).slice(0, marker.index)).replace(/[|:–—-]+$/, "").trim();
  const rewardText = trim(String(line).slice(marker.index + marker[0].length));
  if (!task || /^task$/i.test(task) || task.length < 4 || !rewardText || /^(possible )?rewards?$/i.test(rewardText)) return null;
  if (!/^(catch|spin|make|win|complete|send|hatch|power up|evolve|take|use|earn|battle|trade|transfer|walk|feed|give|land|defeat|purify|exchange|open|explore|adventure|beat|visit|photograph|level up|collect|get|play|perform|throw|claim reward)\b/i.test(task)) return null;
  const rewards = [];
  // Some feeds flatten adjacent item blocks and repeat the quantity around an icon.
  // Only a named item with an explicit × quantity creates a boundary; Pokémon names stay intact.
  const itemNames = '(?:Golden Razz Berry|Silver Pinap Berry|Razz Berry|Pinap Berry|Nanab Berry|Stardust|XP)';
  const itemBlocks = new RegExp('(?:[×x]\\s*\\d+\\s+' + itemNames + '(?:\\s+[×x]\\s*\\d+)?|' + itemNames + '\\s+[×x]\\s*\\d+)', 'gi');
  // Any other item is bounded by its repeated quantity: "×2 Rare Candy ×2 Scyther" is Rare Candy, then the Scyther encounter.
  const repeated = /[×x]\s*(\d+)\s+\p{Lu}[\p{L}'’.\-]*(?:\s+\p{Lu}[\p{L}'’.\-]*){0,3}\s+[×x]\s*\1(?!\d)/gu;
  const columns = rewardText.replace(itemBlocks, text => ' | ' + text + ' | ').replace(repeated, text => ' | ' + text + ' | ');
  // Table columns are independent rewards. Encounter CP text must not suppress adjacent items.
  for (const chunk of columns.split(/\s*\|\s*/).map(trim).filter(Boolean)) {
    const cp = /(.+?)\s+Max CP\s+(\d{2,4})\s+Min CP\s+(\d{2,4})/gi;
    let match, hasCP = false, lastEnd = 0;
    while ((match = cp.exec(chunk)) !== null) {
      hasCP = true; lastEnd = cp.lastIndex;
      const name = trim(match[1]).replace(/^[,;\s]+/, "");
      const maxCP = Number(match[2]), minCP = Number(match[3]);
      if (!name || minCP > maxCP || maxCP > 9999) continue;
      const declared=declaredNames(name);
      if(declared){for(const p of declared.slice(0,-1))rewards.push({type:'encounter',quantity:1,...p});rewards.push({type:'encounter',quantity:1,...declared.at(-1),cpMin:minCP,cpMax:maxCP});}
      else rewards.push({ type: "encounter", name, quantity: 1, cpMin: minCP, cpMax: maxCP });
    }
    if(hasCP){const trailing=declaredNames(chunk.slice(lastEnd));if(trailing)for(const p of trailing)rewards.push({type:'encounter',quantity:1,...p});continue;}
    if(/\b(?:Max|Min) CP\b/i.test(chunk))continue;
    const declared=declaredNames(chunk);
    if(declared){for(const p of declared)rewards.push({type:'encounter',quantity:1,...p});continue;}
    const qty = /^(?:[×x]\s*(\d+)\s*)?(.+?)(?:\s+[×x]\s*(\d+))?$/i.exec(chunk);
    if (!qty) continue;
    // Flattened source tables sometimes repeat the REWARD label after an item name.
    // It is presentation text, not part of the reward's name.
    let name = trim(qty[2]).replace(/\s+REWARD$/i, "");
    if (!name || /^(possible )?rewards?$/i.test(name) || name.length > 100) continue;
    let quantity = Number(qty[1] || qty[3] || 1);
    if (qty[1] && qty[3] && Number(qty[1]) !== Number(qty[3])) continue;
    const numeric = /^(\d[\d,]*)\s+(.+)$/.exec(name);
    if (numeric) {
      if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(numeric[1])) continue;
      const amount = Number(numeric[1].replace(/,/g, ''));
      if ((qty[1] || qty[3]) && quantity !== amount) continue;
      quantity = amount; name = trim(numeric[2]);
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1e9) continue;
    const encounter = /^(?:an?\s+)?encounter with\s+(.+)$/i.exec(name);
    const knownItem = /\b(candy|ball|stardust|xp|energy|pass|incubator|revive|potion|pok[eé]coin|rare candy|incense|lure|egg|berry|star piece)\b/i.test(name);
    const explicitQuantity = !!(qty[1] || qty[3] || numeric);
    if (!encounter && !knownItem && !explicitQuantity) continue;
    if (encounter) name = trim(encounter[1]);
    rewards.push({ type: encounter ? "encounter" : knownItem ? "item" : "other", name, quantity });
  }
  return rewards.length ? { task, category: category || "research", rewards } : null;
}

export function extractFields(html, options={}) {
  const declaredNames=researchRewardNames(options);
  const lines = Array.isArray(html) ? html : htmlToLines(html);
  const out = Object.fromEntries(FIELDS.map(f => [f, []])); out.researchTasks = [];
  const add = (f, s) => { s = trim(s); if (keep(s) && !out[f].includes(s) && out[f].filter(x => /^rank \d+/i.test(x) === /^rank \d+/i.test(s)).length < (/^rank \d+/i.test(s) ? 110 : 14)) out[f].push(s); };
  let cur = null, rank = 0, headSeen = "", deluxe = false, taken = 0, researchKind = "research", researchTable = false;
  for (const l of lines) {
    // "Tier 2 – Rank 25" style labels: remember the rank so the bonus lines under it say which rank unlocks them.
    const rm = RANKLABEL.exec(l.text);
    if (/^upgrade to the go pass deluxe to strengthen/i.test(l.text)) { deluxe = true; continue; }
    if (rm) { rank = +(rm[1] || rm[2]); cur = "bonuses"; taken = 0; continue; }
    const tr = /^tier\s*\d+\s*\(rank\s*(\d+)\)\s*\|\s*(.{6,})$/i.exec(l.text);
    if (tr) { add("bonuses", `Rank ${tr[1]}: ${tr[2]}`); continue; }
    // Leek Duck's GO Pass table labels the first cell "RANK", then places the rank number and Basic/Deluxe rewards in separate cells.
    // htmlToLines turns that row into "RANK | 2 | XP ×10000 | Stardust ×10000".
    if (/^rank\s*\|\s*basic\s*\|\s*deluxe$/i.test(l.text)) continue;
    const duckRow = /^rank\s*\|\s*(\d{1,3})\s*\|\s*(.{3,})$/i.exec(l.text);
    if (duckRow && /pass|rank|reward|milestone/i.test(headSeen)) {
      const cols = duckRow[2].split(/\s*\|\s*/).map(trim);
      // Rank 1 and milestone rows are already represented in the structured bonus section above.
      const milestone = cols.length >= 2 && cols.every(x => /^tier\s*\d+\s+go pass bonus/i.test(x) || x === "-");
      if (cols.length >= 2 && cols[0].length <= 70 && !milestone) {
        add("tickets", "Rank " + duckRow[1] + ": Free: " + cols[0] + " | Deluxe: " + cols[1]);
      }
      continue;
    }
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
      rank = 0; deluxe = false; headSeen = l.text; researchTable = false;
      const hit = HEAD.find(([, re]) => re.test(l.text));
      cur = hit ? hit[0] : null;
      researchKind = /field\s+research/i.test(l.text) ? "field" : /timed\s+research/i.test(l.text) ? "timed" : /special\s+research/i.test(l.text) ? "special" : "research";
      if (/\bdebut\b/i.test(l.text) && !/shiny/i.test(l.text)) add("featured", l.text);
      continue;
    }
    // Only explicit table rows imply multiple identical claimable tasks.
    // Repeated prose outside a task/reward table is often publisher duplication.
    if (/^task\s*\|\s*(?:possible\s+)?rewards?$/i.test(l.text)) researchTable = true;
    if (cur) add(cur, l.text);
    // Explicit task + reward rows can appear beneath event, raid or general
    // headings. Parse only self-contained rows with a recognizable task verb
    // and reward, never infer a reward from surrounding descriptive prose.
    const task = parseResearchTask(l.text, cur === "research" ? researchKind : "research", declaredNames);
    if (task) {
      // A published task/reward TABLE may list the *same* task five times in
      // one stage (Minior Showers). An identical row still means another
      // individual task; deduplication here silently drops real rewards.
      // Assign an occurrence index so cross-source merging can coalesce the
      // Nth occurrence instead of multiplying it or losing it.
      const key = JSON.stringify([task.category, task.task.toLowerCase(), task.rewards]);
      const count = out.researchTasks.filter(x =>
        JSON.stringify([x.category, x.task.toLowerCase(), x.rewards]) === key).length;
      // Bound malformed source tables rather than allowing unbounded repeats.
      if (count === 0 || (researchTable && /\s\|\s/.test(l.text) && count < 20))\n        out.researchTasks.push({ ...task, occurrence: count + 1 });
      add("research", l.text);
    }
    for (const [f, re] of LINE) if (re.test(l.text) && f !== cur) add(f, l.text);
  }
  // Leek Duck renders GO Pass ranks as nested divs, not table rows. Parse that
  // source-specific structure separately; malformed pass markup is reported but
  // does not discard the article's other successfully extracted details.
  if (typeof html === "string" && html.includes("battle-pass-container")) {
    try {
      const pass = extractLeekDuckGoPassRewards(html);
      if (pass) {
        for (const item of pass.bonusItems) {
          const concise = item.name.replace(/^Tier\s*\d+\s+GO Pass Bonus:\s*/i, "");
          const prefix = "Rank " + item.rank + (item.track === "deluxe" ? " Deluxe" : "") + ": ";
          // The generic heading/list scan may already have emitted this milestone.
          if (!out.bonuses.includes("Rank " + item.rank + ": " + concise) &&
              !out.bonuses.includes(prefix + concise)) add("bonuses", prefix + concise);
        }
        for (const row of pass.tickets) add("tickets", row);
      }
    } catch (error) {
      // A failed structured parse must not leave generic/partial rank rows behind.
      out.tickets = out.tickets.filter(value => !/^rank \d+:/i.test(value));
      out.bonuses = out.bonuses.filter(value => !/^rank \d+/i.test(value));
      out.goPassParseError = error instanceof Error ? error.message : String(error);
    }
  }
  return out;
}
export function hasContent(fields) { return FIELDS.some(f => fields[f] && fields[f].length); }
