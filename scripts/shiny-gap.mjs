#!/usr/bin/env node
// Daily check: an upcoming or live event whose text talks up Shiny odds but has no boosted-shiny chip is probably a
// derive-highlights gap (new wording). Sends ONE Telegram message (system topic, quiet hours handled by tgroute) and
// remembers what it has told you in data/shiny-gap-state.json. No AI calls. Flags: --dry-run (print only, no state/Telegram).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { routed } from "../src/tgroute.js";

const SITE = "https://pogo.michaelpuff.com";
const MONTHS = "January February March April May June July August September October November December".split(" ");
const BOOST = /\d+\s*%|increased|boosted|\bodds\b|\brate\b|more likely|greatly improve|higher chance|better chance/i;

const rowText = r => String(typeof r === "string" ? r : r?.text || "");

export const hasBoostedChip = (...lists) => lists.some(l => (l || []).some(h => h?.type === "boosted-shiny"));

// Sentences that mention shiny and are boost-like (plain availability wording is ignored unless a boost word is also present).
export function shinySentences(details) {
  const out = [];
  for (const list of Object.values(details?.fields || {})) {
    if (!Array.isArray(list)) continue;
    for (const r of list) for (const s of rowText(r).replace(/\*/g, "").split(/(?<=[.!?])\s+/)) {
      if (/shiny/i.test(s) && BOOST.test(s) && !out.includes(s.trim())) out.push(s.trim());
    }
  }
  return out;
}

// Latest date the event covers (YYYY-MM-DD), from curated end, "Month D, YYYY" in the dates rows, or a date in the id.
export function lastDate(id, details, curated) {
  if (curated?.e) return curated.e.slice(0, 10);
  const found = [];
  for (const r of details?.fields?.dates || []) for (const m of rowText(r).matchAll(new RegExp(`(${MONTHS.join("|")}) (\\d{1,2}),? (\\d{4})`, "g")))
    found.push(`${m[3]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`);
  const idm = /(\d{4})-(\d{2})-(\d{2})/.exec(id); if (idm) found.push(idm[0]);
  return found.sort().pop() || null;
}
export const firstDate = (id, details, curated) => curated?.s ? curated.s.slice(0, 10) : lastDate(id, details, null);

export function findGaps({ data, details, today, alerted = [] }) {
  const cur = new Map((data.events || []).map(e => [e.id, e]));
  const gaps = [];
  for (const [id, d] of Object.entries(details?.events || {})) {
    const c = cur.get(id), end = lastDate(id, d, c);
    if (!end || end < today || alerted.includes(id)) continue; // undated cannot be judged; ended or already alerted skipped
    if (hasBoostedChip(c?.highlights, d.highlights)) continue;
    const s = shinySentences(d);
    if (s.length) gaps.push({ id, title: c?.t || d.name || id, start: firstDate(id, d, c), sentence: s[0] });
  }
  for (const c of data.events || []) { // curated events with shiny wording in their own text but no details entry
    if (details?.events?.[c.id] || alerted.includes(c.id) || !c.e || c.e.slice(0, 10) < today || hasBoostedChip(c.highlights)) continue;
    const s = (c.p || []).filter(x => /shiny/i.test(x) && BOOST.test(x));
    if (s.length) gaps.push({ id: c.id, title: c.t, start: c.s.slice(0, 10), sentence: s[0] });
  }
  return gaps;
}

export const message = gaps => "✨ Shiny boost possibly missing a chip:\n" + gaps.map(g => `• ${g.title} (${g.id}), from ${g.start || "date unknown"}\n  "${g.sentence.slice(0, 220)}"`).join("\n") + `\n\n${SITE}`;

async function readJson(p, fb) { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fb; } }

async function main() {
  const dry = process.argv.includes("--dry-run");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
  const state = await readJson("data/shiny-gap-state.json", { alerted: [] });
  const gaps = findGaps({ data: await readJson("public/data.json", {}), details: await readJson("public/event-details.json", {}), today, alerted: state.alerted });
  if (!gaps.length) { console.log("No new shiny gaps."); return; }
  const text = message(gaps);
  console.log(text);
  if (dry) return;
  const t = process.env.TELEGRAM_BOT_TOKEN, c = process.env.TELEGRAM_CHAT_ID;
  if (t && c) {
    const res = await routed(process.env, "system")("https://api.telegram.org/bot" + t + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: c, text, disable_web_page_preview: true }) });
    if (res && res.ok === false) throw new Error("Telegram send failed: " + res.status);
  } else console.log("No Telegram configured.");
  await writeFile("data/shiny-gap-state.json", JSON.stringify({ alerted: [...state.alerted, ...gaps.map(g => g.id)].slice(-200) }, null, 1) + "\n");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
