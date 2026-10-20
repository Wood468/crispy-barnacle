// Reads the feeds in data/source-feeds.json and lists items from the last 14 days that talk about shinies, costumes or new forms,
// marking the ones whose Pokémon our data does not mention yet. Never changes public data: it only writes data/source-watch.json
// for the daily shiny/costume check (and a person) to follow up. A feed that fails is recorded and skipped.
// Run: node scripts/source-watch.mjs
import { readFile, writeFile } from "node:fs/promises";

const DAY = 864e5, LOOK_DAYS = 14;
// Strong words must appear for a post to count. "debut" and "assets" are too common, so they only count on feeds marked weak:true (game-file commit lists).
export const KEYWORDS = /\b(shiny|shinies|costume[sd]?|wearing a|dressed|new form|alternate form|variocolor)\b/i;
export const WEAK = /\b(debut|assets?|icons?)\b/i;
// Other Pokémon games share the same news feeds.
export const OTHER_GAMES = /\b(pok[eé]mon sleep|tcg pocket|unite|masters ex|caf[eé]|champions|legends)\b/i;
const text = s => String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

// RSS 2.0 <item> and Atom <entry>; tolerant of a feed cut off mid-item.
export function parseFeed(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const b = m[0], tag = t => { const r = b.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`, "i")); return r ? text(r[1]) : ""; };
    const link = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || tag("link");
    const date = Date.parse(tag("pubDate") || tag("updated") || tag("published") || tag("dc:date"));
    if (tag("title")) out.push({ title: tag("title"), link, date: Number.isFinite(date) ? date : null, summary: tag("description") || tag("summary") || tag("content") });
  }
  return out;
}

// Pokémon names (from dex.json rows [id, name, gen]) mentioned in a string, longest names first so "Mr. Mime" wins over "Mime".
export function mentioned(str, names) {
  const s = " " + String(str).toLowerCase().replace(/[^a-z0-9é♀♂'’ .-]+/g, " ") + " ";
  return names.filter(n => n.length > 3 && s.includes(" " + n.toLowerCase() + " ")).sort((a, b) => b.length - a.length);
}

export function review({ items, dex, costumes, dataText, now, weak = false }) {
  const names = dex.map(r => r[1]);
  const known = Object.keys({ ...(costumes.pictures || {}), ...(costumes.shiny || {}) }).map(k => k.split("|")[0]).concat((costumes.missing || []).map(k => String(k).split("|")[0]));
  const hay = String(dataText).toLowerCase();
  return items.filter(i => i.date && i.date >= now - LOOK_DAYS * DAY && (KEYWORDS.test(i.title + " " + i.summary.slice(0, 400)) || (weak && WEAK.test(i.title))) && !OTHER_GAMES.test(i.title)).map(i => {
    // names in the title are what the post is about; fall back to the start of the text only when the title names none
    const inTitle = mentioned(i.title, names), pokemon = (inTitle.length ? inTitle : mentioned(i.summary.slice(0, 300), names)).slice(0, 4);
    const unseen = pokemon.filter(p => !hay.includes(p.toLowerCase()) && !known.includes(p.toLowerCase()));
    return { ...i, summary: i.summary.slice(0, 200), date: new Date(i.date).toISOString(), pokemon, notInOurData: unseen };
  });
}

async function main() {
  const rd = async f => JSON.parse(await readFile(f, "utf8"));
  const [cfg, dex, costumes, data] = await Promise.all([rd("data/source-feeds.json"), rd("public/dex.json"), rd("public/costumes.json"), rd("public/data.json")]);
  const dataText = JSON.stringify(data.events || []);
  const now = Date.now(), hits = [], status = [];
  for (const f of cfg.feeds) {
    try {
      const res = await fetch(f.url, { headers: { "user-agent": "go-field-notes source-watch (+https://github.com/Wood468/go-field-notes)", accept: "application/rss+xml, application/atom+xml, text/xml" }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const found = review({ items: parseFeed(await res.text()), dex, costumes, dataText, now, weak: !!f.weak });
      status.push({ id: f.id, state: "ok", items: found.length });
      for (const i of found) hits.push({ source: f.id, trust: f.trust, ...i });
    } catch (e) { status.push({ id: f.id, state: "error", note: String(e.message || e).slice(0, 120) }); }
  }
  hits.sort((a, b) => (b.notInOurData.length - a.notInOurData.length) || (b.date > a.date ? 1 : -1));
  await writeFile("data/source-watch.json", JSON.stringify({ updated: new Date().toISOString(), status, gaps: hits.filter(h => h.notInOurData.length).length, items: hits.slice(0, 60) }, null, 1) + "\n");
  console.log(status.map(s => `${s.id}: ${s.state}${s.items != null ? " (" + s.items + ")" : " " + s.note}`).join("\n"));
  console.log(`${hits.length} relevant items, ${hits.filter(h => h.notInOurData.length).length} mention a Pokémon our data does not`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
