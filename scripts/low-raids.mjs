#!/usr/bin/env node
// Weekly: fills the 1-3 star raid bosses for the current and next raid rotation in public/data.json ("low": { one, three, observed, source }).
// Source: Pokémon GO Hub's "Current GO raids" page. Its date line can be out of date, so the page is matched to a rotation by its 5-star boss
// (this week's Palkia page belongs to the rotation whose five is Palkia), never by the dates it prints.
// Safe by design: it only writes when the page parses into sensible lists AND the 5-star boss matches a rotation, it only replaces a "low" block
// that is empty or that it wrote itself, and it edits the file as text so the rest of data.json is untouched.
// Run: node scripts/low-raids.mjs   (DRY_RUN=true prints what it would do; HUB_HTML=<file> reads a saved page instead of fetching)
import { readFile, writeFile } from "node:fs/promises";

const PAGE = "https://pokemongohub.net/post/guide/current-go-raids/";
const DATA = process.env.DATA_FILE || "public/data.json";
const SOURCE = "Pokémon GO Hub current raids";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—" };
const decode = s => String(s).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);

// The page as plain lines. Image alt text counts (Pokémon are often shown as pictures), links and list items each start a new line.
export function toLines(html) {
  const t = String(html || "")
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<img\b[^>]*\balt\s*=\s*"([^"]*)"[^>]*>/gi, (_, alt) => { // "Sprite of Axew from Pokémon GO" means Axew; "Dragon type icon", "Mega Raid Egg icon" and the like are decoration
      const a = decode(alt).trim(), sp = /^Sprite of (.+?) from Pok[eé]mon GO$/i.exec(a);
      return sp ? "\n" + sp[1] + "\n" : /\bicon\b|\blogo\b|\bbadge\b/i.test(a) ? "\n" : "\n" + a + "\n";
    })
    .replace(/<\/(p|li|h[1-6]|div|tr|td|th|ul|ol|section|article|figcaption|a|span|strong|b)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decode(t).split(/\n+/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

const REGION = [[/^Alola\b/i, "Alolan"], [/^Galar\b/i, "Galarian"], [/^Hisui\b/i, "Hisuian"], [/^Paldea\b/i, "Paldean"]];
export function cleanName(s) {
  let n = String(s || "").replace(/\s*\b(Pok[eé]mon|raid|raids|counters?)\b\s*$/i, "").replace(/\s+/g, " ").trim();
  for (const [re, to] of REGION) n = n.replace(re, to);
  return n;
}
const NAME = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.:\- ()♀♂]{1,38}$/;
const NOT_A_NAME = /\b(current|bosses|boss|raids?|guide|guides|related|counters?|stars?|tier)\b|:$/i; // a heading or label, not a Pokémon
const isHeading = l => /\bBosses\b/i.test(l) || /^Current\b/i.test(l) || /\bRaids?\b\s*:?$/i.test(l) || /^Shadow\b.*Raids?/i.test(l) || /\bShadow Raids?\s*:?$/i.test(l) || /^(Last update|Updated|Related|Read more|See also|Share)\b/i.test(l) || /^Raid (Hour|Boss)/i.test(l);

// { one: [...], three: [...], five: [...], mega: [...] } from the headings "1-Star Raids", "3-Star Raids", "5-Star Raids", "Mega Raids".
export function parseTiers(html) {
  const lines = toLines(html), out = { one: [], three: [], five: [], mega: [], shadowOne: [], shadowThree: [] };
  const key = l => {
    const s = /^(?:Shadow\s+(?:Tier\s*)?([13])[\s-]*Star|(?:Tier\s*)?([13])[\s-]*Star\s+Shadow)\s+Raids?\s*:?$/i.exec(l); if (s) return { 1: "shadowOne", 3: "shadowThree" }[s[1] || s[2]];
    const m = /^(?:Tier\s*)?([135])[\s-]*Star Raids?\s*:?$/i.exec(l); if (m) return { 1: "one", 3: "three", 5: "five" }[m[1]]; return /^Mega Raids?\s*:?$/i.test(l) ? "mega" : "";
  };
  for (let i = 0; i < lines.length; i++) {
    let k = key(lines[i]), rest = "";
    if (!k) { const m = /^((?:Shadow\s+)?(?:Tier\s*)?[135][\s-]*Star(?:\s+Shadow)?\s+Raids?|Mega Raids?)\s*:\s*(.+)$/i.exec(lines[i]); if (m) { k = key(m[1] + ":"); rest = m[2]; } }
    if (!k || out[k].length) continue; // the first block under each heading only
    const names = [];
    const take = s => { for (const part of String(s).split(/,|·|\|/)) { const n = cleanName(part); if (n && NAME.test(n) && !NOT_A_NAME.test(n) && !/^(none|n\/a|tba|soon)$/i.test(n)) names.push(n); } };
    if (rest) take(rest);
    for (let j = i + 1; j < lines.length && !rest && names.length < 12; j++) { if (key(lines[j]) || isHeading(lines[j])) break; take(lines[j]); }
    // Shadow lists are always "Shadow X", whether the page wrote "Shadow Primeape", "Primeape (Shadow)" or only the sprite's name.
    out[k] = [...new Set(k.startsWith("shadow") ? names.map(n => "Shadow " + n.replace(/^Shadow\s+/i, "").replace(/\s*\(Shadow\)\s*/i, "").trim()) : names)];
  }
  return out;
}

export const sane = t => (t.shadowOne || []).length <= 8 && (t.shadowThree || []).length <= 8 && t.one.length >= 1 && t.one.length <= 8 && t.three.length >= 1 && t.three.length <= 8 && t.five.length >= 1 && t.five.length <= 4;

const norm = s => String(s || "").toLowerCase().replace(/\(.*?\)/g, "").replace(/\b(forme?|form|mega|primal|shadow)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// The rotation (current or upcoming) whose 5-star boss is one of the page's 5-star bosses.
export function pickRotation(rotation, five, nowMs = Date.now()) {
  const want = five.map(norm).filter(Boolean), today = new Date(nowMs).toISOString().slice(0, 10); // compared as dates, so the machine's time zone does not matter
  const hits = (rotation || []).filter(r => String(r.e || "").slice(0, 10) >= today).filter(r => { const f = norm(r.five); return f && want.some(w => w === f || w.includes(f) || f.includes(w)); });
  return hits.length === 1 ? hits[0] : null; // none, or ambiguous: do nothing
}

// The same low block that is already there, or one we may replace (empty, or written by this job).
export const mayReplace = r => !r.low || String(r.low.source || "").startsWith(SOURCE);
export const sameLow = (a, b) => !!a && JSON.stringify([a.one, a.three, a.shadowOne || [], a.shadowThree || []]) === JSON.stringify([b.one, b.three, b.shadowOne || [], b.shadowThree || []]);

// Rewrites just the one rotation object in the file's text, keeping its other lines and the rest of the file exactly as they were.
export function applyLow(raw, rotationStart, low) {
  const sec = raw.indexOf('"rotation": ['); if (sec < 0) throw new Error("rotation list not found");
  const at = raw.indexOf('"s": "' + rotationStart + '"', sec); if (at < 0) throw new Error("rotation entry not found");
  const open = raw.lastIndexOf("{", at), close = raw.indexOf("\n    }", at); if (open < 0 || close < 0) throw new Error("rotation entry not found");
  const body = raw.slice(open, close + 6);
  const obj = JSON.parse(body.replace(/\}\s*,?\s*$/, "}"));
  const next = {}; let placed = false;
  for (const [k, v] of Object.entries(obj)) { if (k === "low") continue; if (k === "rh" && !placed) { next.low = low; placed = true; } next[k] = v; }
  if (!placed) next.low = low;
  const inline = o => "{ " + Object.entries(o).map(([k, v]) => JSON.stringify(k) + ": " + (Array.isArray(v) ? "[" + v.map(x => JSON.stringify(x)).join(", ") + "]" : JSON.stringify(v))).join(", ") + " }";
  const text = "{\n" + Object.entries(next).map(([k, v]) => '      ' + JSON.stringify(k) + ": " + (k === "low" ? inline(v) : JSON.stringify(v))).join(",\n") + "\n    }";
  return raw.slice(0, open) + text + raw.slice(close + 6);
}

// A note in the Telegram System topic when the job cannot do its work, so a changed page does not fail silently. Skipped without the Telegram secrets.
export async function tell(text, env = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN; if (!token || !env.TELEGRAM_CHAT_ID || env.DRY_RUN === "true") return false;
  try {
    const { route, routed } = await import("../src/tgroute.js"), dest = route(env, "system"); if (!dest.chat) return false;
    const r = await routed(env, "system")("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: dest.chat, text, disable_web_page_preview: true }) });
    return r.ok;
  } catch { return false; }
}

async function main() {
  const dry = process.env.DRY_RUN === "true";
  const html = process.env.HUB_HTML ? await readFile(process.env.HUB_HTML, "utf8") : await (async () => {
    const r = await fetch(PAGE, { headers: { "user-agent": "GO-Field-Notes/1.0 (+https://pogo.michaelpuff.com)" }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error("Pokémon GO Hub answered HTTP " + r.status);
    return r.text();
  })();
  const t = parseTiers(html);
  console.log("Parsed:", JSON.stringify(t));
  if (!sane(t)) { console.log("::warning::1-3 star raids: the page did not parse into sensible lists (" + JSON.stringify(t) + "). Nothing changed."); await tell("⚠️ The weekly 1–3★ raid job could not read Pokémon GO Hub's raid page (its layout may have changed). This week's 1–3★ and Shadow raid bosses were not updated.\n\nhttps://github.com/Wood468/crispy-barnacle/actions/workflows/low-raids.yml"); process.exitCode = 0; return; }
  const raw = await readFile(DATA, "utf8"), data = JSON.parse(raw);
  const r = pickRotation(data.rotation, t.five);
  if (!r) { console.log("::notice::1-3 star raids: the page's 5-star boss (" + t.five.join(", ") + ") matches no current or upcoming rotation. Nothing changed."); return; }
  if (!mayReplace(r)) { console.log("::notice::1-3 star raids: the " + r.five + " rotation already has hand-entered data from " + r.low.source + ". Left alone."); return; }
  if (sameLow(r.low, { one: t.one, three: t.three, shadowOne: t.shadowOne, shadowThree: t.shadowThree })) { console.log("::notice::1-3 star raids for " + r.five + " are already up to date."); return; }
  const low = { one: t.one, three: t.three, ...(t.shadowOne.length ? { shadowOne: t.shadowOne } : {}), ...(t.shadowThree.length ? { shadowThree: t.shadowThree } : {}), observed: new Date().toISOString().slice(0, 10), source: SOURCE };
  const out = applyLow(raw, r.s, low);
  const check = JSON.parse(out); // must still be valid JSON, and nothing but this rotation's low may differ
  const was = JSON.parse(raw); const idx = was.rotation.findIndex(x => x.s === r.s);
  check.rotation[idx].low = was.rotation[idx].low; if (!was.rotation[idx].low) delete check.rotation[idx].low;
  if (JSON.stringify(check) !== JSON.stringify(was)) throw new Error("Safety check failed: the edit changed more than the low block. Not written.");
  if (dry) { console.log("Dry run. Would set " + r.five + " (" + r.s + "):", JSON.stringify(low)); return; }
  await writeFile(DATA, out);
  console.log("::notice::1-3 star raids set for " + r.five + ": 1★ " + t.one.join(", ") + "; 3★ " + t.three.join(", ") + (t.shadowOne.length || t.shadowThree.length ? "; Shadow 1★ " + t.shadowOne.join(", ") + "; Shadow 3★ " + t.shadowThree.join(", ") : "") + ".");
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(async e => { console.error("::error::" + e.message); await tell("⚠️ The weekly 1–3★ raid job failed: " + String(e.message).slice(0, 200) + "\n\nhttps://github.com/Wood468/crispy-barnacle/actions/workflows/low-raids.yml"); process.exit(1); });
