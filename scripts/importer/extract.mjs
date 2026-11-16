// Pulls the same fields out of any article: what a heading says it is about decides where the lines under it go.
import { htmlToLines, decode } from "./text.mjs";
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
// An explicit denial that opens a research section's text: "No Timed Research: There is no Timed Research during ...".
// Anchored at the start of the line, so prose elsewhere ("... no research is needed") never counts.
const RES = "(?:(?:timed|special|field|event)\\s+)?research(?:\\s+tasks?)?", DENY = "(?:no|there\\s+(?:is|are|will\\s+be)\\s+no)\\s+" + RES;
const NO_RESEARCH = new RegExp("^(?:" + DENY + "\\s*:\\s*)?" + DENY + "(?:\\s+(?:during|in|for|with)\\s+(?:the|this)\\s+([\\w'’&-]+(?:\\s+[\\w'’&-]+){0,5}))?\\s*[.!]?$|^(?:timed|special|field|event)\\s+research\\s*:\\s*none\\s*\\.?$", "i");
// Words that turn a denial into a qualified one ("No Timed Research during the first week", "... for ticket holders").
const QUALIFIER = /\b(?:first|second|last|week|weeks|weekend|until|before|after|if|except|unless|ticket|tickets|required|needed|only|yet|bonus|paid|premium|then|but|and|or)\b/i;
const strictDenial = text => { const m = NO_RESEARCH.exec(text.trim()); return !!m && !(m[1] && QUALIFIER.test(m[1])); };
// Clarifying sentences may follow ("The Minior Shower Timed Research only ran during the Orionids ..."), but never availability or qualifier language.
const TRAILING_BAN = /\b(?:on sale|tickets?|bonus(?:es)?|paid|premium|special research|field research|will|starting|from (?:mon|tues|wednes|thurs|fri|satur|sun)day|if|unless|except|but|however|also|additional|extra|yet|coming|soon)\b/i;
// "was only available during the Orionids" is history; "available" alone, or with this event, is a claim about now.
const PAST = /\b(?:was|were|had been|ran|previously|earlier)\b/i, AVAILABLE_NOW = /\b(?:now|today|this event|with this|during the leonids)\b/i;
const trailingOk = x => x.length <= 200 && !TRAILING_BAN.test(x) && (!/\bavailable\b/i.test(x) || (PAST.test(x) && !AVAILABLE_NOW.test(x)));
function isDenial(text) {
  const t = text.trim(), label = new RegExp("^" + DENY + "\\s*:\\s*", "i").exec(t), head = label ? label[0] : "", rest = t.slice(head.length);
  if (!rest) return strictDenial(t);
  const sentences = (rest.match(/[^.!]+(?:[.!]+|$)/g) || []).map(x => x.trim()).filter(Boolean);
  if (!sentences.length || sentences.length > 3) return false;
  return strictDenial(head + sentences[0]) && sentences.slice(1).every(trailingOk);
}
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

// Leek Duck collapses long reward lists behind a "+3" chip; the flattened text glues it onto the next name ("+3 Grookey").
// Only a leading "+N" followed by a space is dropped, so a name that merely contains a plus sign is left alone.
const cleanRewardName = value => trim(value).replace(/^[,;\s]+/, "").replace(/^\+\d{1,3}\s+(?=\S)/, "");
// GO Pass prose ("Complete Pass Tasks to rank up and earn the following rewards. Ranks 101 through 300 award ...") reads like a task row but is a pass fact, not research.
const isPassProse = (task, rewardText) => /\bpass tasks?\b|\brank(?:s)?\s+(?:up|\d+\s+through)\b/i.test(task) || /^[.,;:]/.test(rewardText) || /\branks?\s+\d+\s+(?:through|to)\s+\d+\b/i.test(rewardText);

function parseResearchTask(line, category, declaredNames) {
  // Published research tables may use "Task | 7740 × Stardust" rather
  // than the prose marker "REWARD". Only accept an explicit task verb
  // and a concrete reward cell; do not infer tasks from event descriptions.
  const cells = String(line || "").split(/\s*\|\s*/).map(trim);
  if (cells.length === 2 && /^(?:catch|spin|make|win|complete|send|hatch|power up|evolve|take|use|earn|battle|trade|transfer|walk|feed|give|land|defeat|purify|exchange|open|explore|adventure|beat|visit|photograph|level up|collect|get|play|perform|throw|unlock|claim reward)\b/i.test(cells[0]) &&
      /^(?:\d[\d,]*\s*[×x]\s*|[×x]\s*\d+\s+|\d[\d,]*\s+|an?\s+encounter with\s+)/i.test(cells[1])) {
    line = cells[0] + " REWARD " + cells[1].replace(/^(\d[\d,]*)\s*[×x]\s*/i, "×$1 ");
  }
  const marker = /\sREWARD\s/i.exec(String(line || "")) || /\b(?:possible\s+)?rewards?\s*:?\s*/i.exec(String(line || ""));
  if (!marker) return null;
  const task = trim(String(line).slice(0, marker.index)).replace(/[|:–—-]+$/, "").trim();
  const rewardText = trim(String(line).slice(marker.index + marker[0].length));
  if (!task || /^task$/i.test(task) || task.length < 4 || !rewardText || /^(possible )?rewards?$/i.test(rewardText)) return null;
  if (!/^(catch|spin|make|win|complete|send|hatch|power up|evolve|take|use|earn|battle|trade|transfer|walk|feed|give|land|defeat|purify|exchange|open|explore|adventure|beat|visit|photograph|level up|collect|get|play|perform|throw|unlock|claim reward)\b/i.test(task)) return null;
  if (isPassProse(task, rewardText)) return null;
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
      const name = cleanRewardName(match[1]);
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
    let name = cleanRewardName(qty[2]).replace(/\s+REWARD$/i, "");
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

const TASK_VERB = /^(?:catch|spin|make|win|complete|send|hatch|power up|evolve|take|use|earn|battle|trade|transfer|walk|feed|give|land|defeat|purify|exchange|open|explore|adventure|beat|visit|photograph|level up|collect|get|play|perform|throw|unlock|claim reward)\b/i;
// Must equal the slice(0, 900000) in discover.mjs get(), the importer's page cap (a test pins the two together).
const PAGE_CAP = 900000;
// A line that looks like a task row (task verb, then a cell or REWARD marker), whether or not it parsed.
const looksLikeTaskRow = text => { const t = trim(String(text || "")); return TASK_VERB.test(t) && !/\bpass tasks?\b|\branks?\s+\d+\s+(?:through|to)\s+\d+\b/i.test(t) && (/\s\|\s/.test(t) || /\breward/i.test(t)); };

function extractFromLines(html, options, lines, { skipPass = false } = {}) {
  const declaredNames=researchRewardNames(options);
  const out = Object.fromEntries(FIELDS.map(f => [f, []])); out.researchTasks = [];
  const add = (f, s) => { s = trim(s); if (keep(s) && !out[f].includes(s) && out[f].filter(x => /^rank \d+/i.test(x) === /^rank \d+/i.test(s)).length < (/^rank \d+/i.test(s) ? 110 : 14)) out[f].push(s); };
  let cur = null, rank = 0, headSeen = "", deluxe = false, taken = 0, researchKind = "research", researchTable = false, denial = false, deniedSections = 0;
  // Extraction health for research: a fetched page that shows a research
  // section but yields no tasks is a parse failure, not an event with no research.
  const health = { headings: 0, table: false, candidateRows: 0 }; let unparsedRows = 0;
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
      if (cur === "research" && denial) deniedSections++;
      denial = false;
      const hit = HEAD.find(([, re]) => re.test(l.text));
      cur = hit ? hit[0] : null;
      if (cur === "research") health.headings++;
      researchKind = /field\s+research/i.test(l.text) ? "field" : /timed\s+research/i.test(l.text) ? "timed" : /special\s+research/i.test(l.text) ? "special" : "research";
      if (/\bdebut\b/i.test(l.text) && !/shiny/i.test(l.text)) add("featured", l.text);
      continue;
    }
    // Only explicit table rows imply multiple identical claimable tasks.
    // Repeated prose outside a task/reward table is often publisher duplication.
    if (/^task\s*\|\s*(?:possible\s+)?rewards?$/i.test(l.text)) { researchTable = true; health.table = true; }
    if (cur === "research" && l.t !== "h" && l.text.length <= 600 && isDenial(l.text)) denial = true;
    if (cur) add(cur, l.text);
    // Explicit task + reward rows can appear beneath event, raid or general
    // headings. Parse only self-contained rows with a recognizable task verb
    // and reward, never infer a reward from surrounding descriptive prose.
    const task = parseResearchTask(l.text, cur === "research" ? researchKind : "research", declaredNames);
    // Task-like rows only count inside a research section or task table; prose elsewhere is not evidence.
    if ((cur === "research" || researchTable) && looksLikeTaskRow(l.text)) { health.candidateRows++; if (!task) unparsedRows++; }
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
      if (count === 0 || (researchTable && /\s\|\s/.test(l.text) && count < 20))
        out.researchTasks.push({ ...task, occurrence: count + 1 });
      add("research", l.text);
    }
    for (const [f, re] of LINE) if (re.test(l.text) && f !== cur) add(f, l.text);
  }
  // Leek Duck renders GO Pass ranks as nested divs, not table rows. Parse that
  // source-specific structure separately; malformed pass markup is reported but
  // does not discard the article's other successfully extracted details.
  if (!skipPass && typeof html === "string" && html.includes("battle-pass-container")) {
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
  const truncated = typeof html === "string" && (html.length >= PAGE_CAP || (/<body\b/i.test(html) && !/<\/body\s*>/i.test(html) && !/<\/html\s*>/i.test(html)));
  const parsedTasks = out.researchTasks.length;
  const seenResearch = health.headings > 0 || health.table || health.candidateRows > 0;
  // ok: tasks parsed. incomplete: research seen (or page cut off) but nothing parsed. none: a fully read page with no research.
  // explicit-none: a fully read page whose research section says there is none, with no task rows, table or candidate rows anywhere.
  if (cur === "research" && denial) deniedSections++;
  // Every research-labelled section on the page must deny; one section that does not (tasks, unparsed cells, no statement) keeps it from counting.
  const explicitNone = deniedSections > 0 && deniedSections === health.headings && !truncated && !parsedTasks && !unparsedRows && !health.table && !health.candidateRows;
  out.researchParse = { status: truncated ? "incomplete" : explicitNone ? "explicit-none" : parsedTasks && !unparsedRows ? "ok" : parsedTasks || seenResearch ? "incomplete" : "none", ...health, parsedTasks, truncated, lines: lines.length, ...(explicitNone ? { explicitNone: true } : {}) };
  return out;
}

// ---------------------------------------------------------------------------
// Tolerant research pass. The first pass reads h1-h4/p/li/tr only, so a page
// that renders headings as h5/h6 or bold paragraphs, or rows as div/ul grids,
// yields no research at all. When the first pass does not fully succeed, this
// second pass walks a small DOM and emits the same {t,text} lines, which then
// go through the same task parser. It only replaces research output when it
// parses MORE tasks than the first pass, and it never touches other fields.
// ---------------------------------------------------------------------------
const VOID = new Set(["br", "img", "hr", "input", "meta", "link", "source", "wbr", "col", "area", "base", "embed", "param", "track"]);
const SKIP = new Set(["script", "style", "noscript", "svg", "nav", "footer", "aside", "form", "template", "iframe", "head"]);
const BLOCK = new Set(["div", "p", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "section", "article", "main", "figure", "figcaption", "blockquote", "dl", "dt", "dd", "h1", "h2", "h3", "h4", "h5", "h6"]);
const attr = (src, name) => { const m = new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(src); return m ? (m[1] ?? m[2] ?? m[3] ?? "") : ""; };

const MAX_DEPTH = 200, MAX_NODES = 60000;
// Drops scripts/styles/comments; an unclosed <script>/<style> swallows the rest of the document, as a browser would.
const stripInert = html => String(html || "").replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<(?:script|style|noscript|svg|template)\b[\s\S]*$/i, " ");

function parseDom(html) {
  const cleaned = stripInert(html);
  const root = { tag: "#root", kids: [] }, stack = [root], open = new Map();
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+|<)/g;
  let m, nodes = 0;
  while ((m = re.exec(cleaned))) {
    if (++nodes > MAX_NODES) throw new Error("dom-node-limit");
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) { top.kids.push({ text: m[4] }); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      // O(1) unless elements really are closed: pops are paid for by the pushes.
      if (open.get(tag) > 0) { while (stack[stack.length - 1].tag !== tag) { const x = stack.pop(); open.set(x.tag, open.get(x.tag) - 1); } stack.pop(); open.set(tag, open.get(tag) - 1); }
      continue;
    }
    if (["li", "p", "tr", "td", "th"].includes(tag) && top.tag === tag) { stack.pop(); open.set(tag, open.get(tag) - 1); }
    const node = { tag, kids: [], cls: attr(m[3], "class"), id: attr(m[3], "id") };
    stack[stack.length - 1].kids.push(node);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) {
      if (stack.length > MAX_DEPTH) throw new Error("dom-depth-limit");
      stack.push(node); open.set(tag, (open.get(tag) || 0) + 1);
    }
  }
  return root;
}
const isEl = n => !!n.tag;
const hasBlock = n => n.hb ?? (n.hb = (n.kids || []).some(k => isEl(k) && (BLOCK.has(k.tag) || hasBlock(k))));
const textOf = n => n.text !== undefined ? decode(n.text) : SKIP.has(n.tag) || n.tag === "img" ? "" : (n.kids || []).map(textOf).join(BLOCK.has(n.tag) || n.tag === "br" ? " " : "");
const flat = s => s.replace(/[\s ]+/g, " ").trim();

const HEADER_ROW = /^(?:research\s+)?tasks?\s*\|\s*(?:possible\s+)?rewards?$/i;
// Only these anchored label forms open a research section: "Minior Shower Timed Research (1/1)", "Bonus Timed Research", "Special Research", "Field Research:".
const RESEARCH_LABEL = /^(?:[^|.!?]{0,60}?\s)?(?:timed|special|field|event)\s+research(?:\s*[–—-]\s*[\w ]{1,20})?\s*(?:\(\s*\d+\s*\/\s*\d+\s*\))?\s*:?$/i;
const QTY_AT = /(?:\d{1,3}(?:,\d{3})+|\d+)\s*(?:×\s*|x\s+)\S/iu;
const isRewardCell = t => new RegExp("^" + QTY_AT.source, "iu").test(t) && t.length <= 120 && !/[.!?]\s+\p{Lu}/u.test(t) &&
  /\b(candy|ball|stardust|xp|energy|pass|incubator|revive|potion|pok[eé]coin|incense|lure|egg|berry|star piece|encounter)\b/i.test(t);
const hasQty = t => new RegExp("(?<![\\w,.])" + QTY_AT.source, "iu").test(t);
const stripIconNoise = t => t.replace(/\s+(?:[\p{L}'’]+\s+){0,4}icons?$/iu, "").replace(/[\s:–—-]+$/, "").trim();

// [task cell, ...noise cells, reward cell(s)] -> "Task | 7740 × Stardust"; null unless the split is structural and the reward is a known kind.
function rowFromCells(cells) {
  const task = stripIconNoise(cells[0] || "");
  if (cells.length < 2 || task.length < 4 || !TASK_VERB.test(task) || hasQty(task) || /\b(?:all|every|each)\b.*\btasks?\b/i.test(task)) return null;
  const first = cells.findIndex((c, i) => i > 0 && isRewardCell(c));
  if (first < 0) return null;
  return task + " | " + cells.slice(first).join(" ").replace(/^(\d[\d,]*)\s*[×x]\s*/i, "$1 × ");
}

function tolerantLines(html) {
  const out = [], st = { research: false, header: false };
  const heading = text => { out.push({ t: "h", text }); st.research = RESEARCH_LABEL.test(text); st.header = false; };
  const header = () => { out.push({ t: "p", text: "Task | Rewards" }); st.header = st.research; };
  const row = line => { if (!st.header) header(); out.push({ t: "p", text: line }); };
  const cellsOf = node => node.kids.filter(k => isEl(k) && !SKIP.has(k.tag)).map(k => flat(textOf(k))).filter(Boolean);
  const leaf = (node, tag) => {
    const text = flat(textOf(node));
    if (!text) return;
    if (/^h[1-6]$/.test(tag) || (text.length <= 90 && RESEARCH_LABEL.test(text))) return heading(text);
    if (text.length < 40 && /^tasks?\s*\|?\s*(?:possible\s+)?rewards?$/i.test(text)) return header();
    // A list item whose parts are separate elements ("<span>task</span> <span>reward</span>") is a row; a sentence is not.
    if (tag === "li" && st.research) {
      const parts = cellsOf(node), r = parts.length >= 2 && rowFromCells(parts);
      if (r) return row(r);
    }
    out.push({ t: tag === "li" ? "li" : "p", text });
  };
  const walk = node => {
    let run = [];
    const flush = () => { const text = flat(run.map(textOf).join(" ")); run = []; if (text) leaf({ kids: [{ text }] }, "p"); };
    for (const k of node.kids) {
      if (!isEl(k)) { run.push(k); continue; }
      if (SKIP.has(k.tag)) continue;
      if (!BLOCK.has(k.tag)) { if (!hasBlock(k)) { run.push(k); continue; } flush(); walk(k); continue; }
      flush();
      if (k.tag === "tr") {
        const cells = cellsOf(k), joined = cells.join(" | "), r = st.research && rowFromCells(cells);
        if (HEADER_ROW.test(joined)) header();
        else if (r) row(r);
        else if (joined) out.push({ t: "p", text: joined });
      } else if (/^h[1-6]$/.test(k.tag) || !hasBlock(k)) leaf(k, k.tag);
      else {
        // A container of 2-4 leaf blocks is a div/ul grid row. Only inside a Task/Rewards table (header seen).
        const blocks = k.kids.filter(c => isEl(c) && !SKIP.has(c.tag)), cells = cellsOf(k);
        const grid = blocks.length >= 2 && blocks.length <= 4 && blocks.length === cells.length && blocks.every(c => BLOCK.has(c.tag) && !hasBlock(c)) && k.kids.every(c => isEl(c) || !flat(textOf(c)));
        const r = grid && st.research && st.header && rowFromCells(cells);
        if (grid && HEADER_ROW.test(cells.join(" | "))) header();
        else if (r) row(r);
        else walk(k);
      }
    }
    flush();
  };
  walk(parseDom(html));
  return out;
}

// A bounded, attribute-free outline of the markup around the first "Timed Research"/"Task" so the next run reveals the real structure.
function structureSample(html) {
  const clean = stripInert(html);
  let at = clean.search(/timed research/i);
  if (at < 0) at = clean.search(/\btask\b/i);
  if (at < 0) return null;
  const outline = src => src.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g, (_, close, tag, attrs, text) => {
    if (text !== undefined) { const t = flat(decode(text)).slice(0, 160); return t ? t + " " : ""; }
    if (close) return "</" + tag.toLowerCase() + ">";
    const keep = ["class", "id", "alt"].map(n => { const v = attr(attrs || "", n).slice(0, 50).replace(/["<>]/g, ""); return v ? " " + n + '="' + v + '"' : ""; }).join("");
    return "<" + tag.toLowerCase() + keep + ">";
  });
  let from = Math.max(0, at - 400); const lt = clean.indexOf("<", from); if (lt >= 0 && lt < at) from = lt;
  const pre = outline(clean.slice(from, at)).slice(-200), post = outline(clean.slice(at, at + 4000));
  return (pre + post).replace(/\s+/g, " ").trim().slice(0, 600);
}

// Does the page's MAIN CONTENT carry research wording? Menus, headers, footers, sidebars, related posts and comments are
// excluded, and the bare word "Task" is not evidence: a Timed/Special/Field Research phrase or a Task/Rewards header is.
const BOILERPLATE = /(?:^|[\s_-])(?:related|comments?|respond|sidebar|widget|menu|share|sharing|breadcrumbs?|newsletter|promo|advert\w*|footer|header|navigation|nav|tags?|author|popular|trending|recent)(?:$|[\s_-])/i;
function researchKeywords(html) {
  const root = parseDom(html), first = n => { for (const k of n.kids || []) { if (!isEl(k)) continue; if (k.tag === "main" || k.tag === "article") return k; const f = first(k); if (f) return f; } return null; };
  const parts = [], walk = n => {
    if (n.text !== undefined) { parts.push(decode(n.text)); return; }
    if (SKIP.has(n.tag) || n.tag === "header" || n.tag === "img" || BOILERPLATE.test(n.cls || "") || BOILERPLATE.test(n.id || "")) return;
    for (const k of n.kids) walk(k);
    if (BLOCK.has(n.tag)) parts.push(" | ");
  };
  for (const k of (first(root) || root).kids) walk(k);
  return /(?:timed|special|field)\s+research|\btasks?\b[\s|]*\brewards?\b/i.test(parts.join(" "));
}

const taskKey = t => JSON.stringify([t.category, String(t.task).toLowerCase(), t.rewards, t.occurrence]);

export function extractFields(html, options = {}) {
  const lines = Array.isArray(html) ? html : htmlToLines(html);
  const out = extractFromLines(html, options, lines);
  if (typeof html !== "string") return out;
  // A first-pass "ok" is never revisited. Otherwise the tolerant pass may replace the research output only if it
  // keeps every task the first pass already parsed (same task, category, occurrence, rewards) and adds more.
  if (out.researchParse.status !== "ok" && /research|\btask\b/i.test(html)) {
    try {
      const tolerant = extractFromLines(html, options, tolerantLines(html), { skipPass: true });
      const have = new Set(tolerant.researchTasks.map(taskKey));
      if (tolerant.researchTasks.length > out.researchTasks.length && out.researchTasks.every(t => have.has(taskKey(t)))) {
        out.researchTasks = tolerant.researchTasks;
        for (const line of tolerant.research) if (!out.research.includes(line) && out.research.length < 14) out.research.push(line);
        out.researchParse = { ...tolerant.researchParse, lines: out.researchParse.lines, via: "tolerant" };
      }
    } catch { out.researchParse.tolerantError = true; }
  }
  // A denial next to a task-like table cell, or one the tolerant pass could not double-check, is not a denial.
  if (out.researchParse.explicitNone && (out.researchParse.tolerantError || /<t[dh]\b[^>]*>(?:\s*<[^>]+>)*\s*tasks?\s*</i.test(stripInert(html)))) {
    delete out.researchParse.explicitNone; out.researchParse.status = "incomplete";
  }
  // Positive evidence for "none": the fully read body has no research wording at all. A parser miss still shows it.
  try { out.researchParse.researchKeywords = researchKeywords(html); } catch { /* unknown stays undefined: no immediate removal relies on it */ }
  if (out.researchParse.status !== "ok" && !out.researchParse.explicitNone && /timed research|\btask\b/i.test(html)) {
    try { const sample = structureSample(html); if (sample) out.researchParse.sample = sample; } catch { out.researchParse.tolerantError = true; }
  }
  return out;
}
export function hasContent(fields) { return FIELDS.some(f => fields[f] && fields[f].length); }
