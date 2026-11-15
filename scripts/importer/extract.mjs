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

const TASK_VERB = /^(?:catch|spin|make|win|complete|send|hatch|power up|evolve|take|use|earn|battle|trade|transfer|walk|feed|give|land|defeat|purify|exchange|open|explore|adventure|beat|visit|photograph|level up|collect|get|play|perform|throw|claim reward)\b/i;
// Must equal the slice(0, 900000) in discover.mjs get(), the importer's page cap (a test pins the two together).
const PAGE_CAP = 900000;
// A line that looks like a task row (task verb, then a cell or REWARD marker), whether or not it parsed.
const looksLikeTaskRow = text => { const t = trim(String(text || "")); return TASK_VERB.test(t) && (/\s\|\s/.test(t) || /\breward/i.test(t)); };

function extractFromLines(html, options, lines, { skipPass = false } = {}) {
  const declaredNames=researchRewardNames(options);
  const out = Object.fromEntries(FIELDS.map(f => [f, []])); out.researchTasks = [];
  const add = (f, s) => { s = trim(s); if (keep(s) && !out[f].includes(s) && out[f].filter(x => /^rank \d+/i.test(x) === /^rank \d+/i.test(s)).length < (/^rank \d+/i.test(s) ? 110 : 14)) out[f].push(s); };
  let cur = null, rank = 0, headSeen = "", deluxe = false, taken = 0, researchKind = "research", researchTable = false;
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
  out.researchParse = { status: truncated ? "incomplete" : parsedTasks && !unparsedRows ? "ok" : parsedTasks || seenResearch ? "incomplete" : "none", ...health, parsedTasks, truncated, lines: lines.length };
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

function parseDom(html) {
  const cleaned = String(html || "").replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const root = { tag: "#root", kids: [] }, stack = [root];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+|<)/g;
  let m;
  while ((m = re.exec(cleaned))) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) { top.kids.push({ text: m[4] }); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const at = stack.map(n => n.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    if (["li", "p", "tr", "td", "th"].includes(tag) && top.tag === tag) stack.pop();
    const node = { tag, kids: [], cls: attr(m[3], "class"), alt: attr(m[3], "alt") };
    stack[stack.length - 1].kids.push(node);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push(node);
  }
  return root;
}
const isEl = n => !!n.tag;
const hasBlock = n => (n.kids || []).some(k => isEl(k) && (BLOCK.has(k.tag) || hasBlock(k)));
const textOf = n => n.text !== undefined ? decode(n.text) : SKIP.has(n.tag) || n.tag === "img" ? "" : (n.kids || []).map(textOf).join(BLOCK.has(n.tag) || n.tag === "br" ? " " : "");
const flat = s => s.replace(/[\s\u00a0]+/g, " ").trim();

const HEADER_ROW = /^(?:research\s+)?tasks?\s*\|\s*(?:possible\s+)?rewards?$/i;
// "Minior Shower Timed Research (1/1)", "Bonus Timed Research", "Special Research", "Field Research:" and similar short labels.
const RESEARCH_LABEL = /^(?:[^|.!?]{0,60}?\s)?(?:timed|special|field|event)\s+research(?:\s*[–—-]\s*[\w ]{1,20})?\s*(?:\(\s*\d+\s*\/\s*\d+\s*\))?\s*:?$/i;
const QTY = /(?<![\w,.])(\d{1,3}(?:,\d{3})+|\d+)\s*(?:×\s*|x\s+)(?=\S)/iu;
const isRewardCell = t => /^(?:\d{1,3}(?:,\d{3})+|\d+)\s*(?:×\s*|x\s+)\S/iu.test(t);
const stripIconNoise = t => t.replace(/\s+(?:[\p{L}'’]+\s+){0,4}icons?$/iu, "").replace(/[\s:–—-]+$/, "").trim();

// "Use a Star Piece [icon text] 7740× Stardust" -> "Use a Star Piece | 7740 × Stardust"; null when it is not a task row.
function splitTaskRow(text) {
  const m = QTY.exec(text);
  if (!m) return null;
  const task = stripIconNoise(text.slice(0, m.index).trim());
  const rest = text.slice(m.index + m[0].length).trim();
  if (!TASK_VERB.test(task) || task.length < 4 || QTY.test(task) || !rest) return null;
  return task + " | " + m[1] + " × " + rest;
}

function tolerantLines(html) {
  const out = [], st = { research: false, header: false };
  const heading = text => { out.push({ t: "h", text }); st.research = /research|quest|task/i.test(text); st.header = false; };
  const header = () => { out.push({ t: "p", text: "Task | Rewards" }); st.header = true; };
  const row = line => { if (!st.header) header(); out.push({ t: "p", text: line }); };
  const leaf = (node, tag) => {
    const text = flat(textOf(node));
    if (!text) return;
    if (/^h[1-6]$/.test(tag) || (text.length <= 90 && RESEARCH_LABEL.test(text))) return heading(text);
    if (HEADER_ROW.test(text.replace(/\s+(?=rewards?$)/i, " | ")) && /^tasks?\s/i.test(text) && text.length < 40) return header();
    // Row-per-line markup needs a research heading or a Task/Rewards header; plain paragraphs stay prose.
    const split = (st.header || (st.research && tag === "li")) && splitTaskRow(text);
    if (split) return row(split);
    out.push({ t: tag === "li" ? "li" : "p", text });
  };
  const cellsOf = node => node.kids.filter(k => isEl(k) && !SKIP.has(k.tag)).map(k => flat(textOf(k))).filter(Boolean);
  const walk = node => {
    let run = [];
    const flush = () => { const text = flat(run.map(textOf).join(" ")); run = []; if (text) leaf({ kids: [{ text }] }, "p"); };
    for (const k of node.kids) {
      if (!isEl(k)) { run.push(k); continue; }
      if (SKIP.has(k.tag)) continue;
      if (!BLOCK.has(k.tag)) { if (!hasBlock(k)) { run.push(k); continue; } flush(); walk(k); continue; }
      flush();
      if (k.tag === "tr") {
        const cells = cellsOf(k), joined = cells.join(" | ");
        if (HEADER_ROW.test(joined)) header();
        else if ((st.research || st.header) && cells.length >= 2 && TASK_VERB.test(cells[0]) && splitTaskRow(cells.join(" "))) row(splitTaskRow(cells.join(" ")));
        else if (joined) out.push({ t: "p", text: joined });
      } else if (/^h[1-6]$/.test(k.tag) || !hasBlock(k)) leaf(k, k.tag);
      else {
        // A container of 2-4 leaf blocks is a div/ul grid row: [task, (icon text), reward]. Only inside a Task/Rewards table.
        const blocks = k.kids.filter(c => isEl(c) && !SKIP.has(c.tag)), cells = cellsOf(k);
        const grid = blocks.length >= 2 && blocks.length <= 4 && blocks.length === cells.length && blocks.every(c => BLOCK.has(c.tag) && !hasBlock(c)) && k.kids.every(c => isEl(c) || !flat(textOf(c)));
        if (grid && HEADER_ROW.test(cells.join(" | "))) header();
        else if (grid && st.header && TASK_VERB.test(cells[0]) && !QTY.test(cells[0]) && isRewardCell(cells[cells.length - 1])) {
          const first = cells.findIndex((c, i) => i > 0 && isRewardCell(c));
          row(cells[0] + " | " + cells.slice(first).join(" "));
        } else walk(k);
      }
    }
    flush();
  };
  walk(parseDom(html));
  return out;
}

// A bounded, attribute-free outline of the markup around the first "Timed Research"/"Task" so the next run reveals the real structure.
function structureSample(html) {
  const clean = String(html || "").replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  let at = clean.search(/timed research/i);
  if (at < 0) at = clean.search(/\btask\b/i);
  if (at < 0) return null;
  const outline = src => src.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g, (_, close, tag, attrs, text) => {
    if (text !== undefined) { const t = flat(decode(text)).slice(0, 60); return t ? t + " " : ""; }
    if (close) return "</" + tag.toLowerCase() + ">";
    const keep = ["class", "id", "alt"].map(n => { const v = attr(attrs || "", n).slice(0, 50).replace(/["<>]/g, ""); return v ? " " + n + '="' + v + '"' : ""; }).join("");
    return "<" + tag.toLowerCase() + keep + ">";
  });
  let from = Math.max(0, at - 400); const lt = clean.indexOf("<", from); if (lt >= 0 && lt < at) from = lt;
  const pre = outline(clean.slice(from, at)).slice(-200), post = outline(clean.slice(at, at + 4000));
  return (pre + post).replace(/\s+/g, " ").trim().slice(0, 600);
}

export function extractFields(html, options = {}) {
  const lines = Array.isArray(html) ? html : htmlToLines(html);
  const out = extractFromLines(html, options, lines);
  if (typeof html !== "string") return out;
  const mentions = /research|\btask\b/i.test(html);
  if (mentions) {
    const tolerant = extractFromLines(html, options, tolerantLines(html), { skipPass: true });
    // Adopt only a strictly better reading: more tasks, or the same tasks under headings the first pass could not see
    // (those carry the right track and occurrence). Anything the first pass already reads fully is left alone.
    const better = tolerant.researchTasks.length > out.researchTasks.length ||
      (out.researchTasks.length > 0 && tolerant.researchTasks.length === out.researchTasks.length && tolerant.researchParse.headings > out.researchParse.headings);
    if (better) {
      out.researchTasks = tolerant.researchTasks;
      for (const line of tolerant.research) if (!out.research.includes(line) && out.research.length < 14) out.research.push(line);
      out.researchParse = { ...tolerant.researchParse, lines: out.researchParse.lines, via: "tolerant" };
    }
  }
  if (out.researchParse.status !== "ok" && /timed research|\btask\b/i.test(html)) {
    const sample = structureSample(html);
    if (sample) out.researchParse.sample = sample;
  }
  return out;
}
export function hasContent(fields) { return FIELDS.some(f => fields[f] && fields[f].length); }
