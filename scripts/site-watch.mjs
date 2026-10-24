#!/usr/bin/env node
// Watches other official Pokémon sites for posts about Pokémon GO and tells you on Telegram (Changes topic) when a new one appears:
// pokemon.com (US, UK), the Japanese Pokémon news page and Taiwan's Pokémon portal. Those sites carry Pokémon GO news only now and then,
// so this only looks at links whose title says Pokémon GO. It reads the page, it does not change any app data.
// The first run only records what is already there. State: data/site-watch.json. A site that fails is recorded and skipped.
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID; without them it prints what it would send and remembers nothing new.
import { readFile, writeFile } from "node:fs/promises";
import { linksFrom } from "./importer/discover.mjs";
import { route, routed } from "../src/tgroute.js";

export const SITES = [
  { id: "pokemon-us", name: "Pokemon.com (US)", url: "https://www.pokemon.com/us/news" },
  { id: "pokemon-uk", name: "Pokemon.com (UK)", url: "https://www.pokemon.com/uk/news" },
  { id: "pokemon-jp", name: "Pokémon Japan", url: "https://www.pokemon.co.jp/info/" },
  { id: "pokemon-tw", name: "Pokémon Taiwan", url: "https://tw.portal-pokemon.com/" },
];
const GO = /Pok[eé]mon ?GO|ポケモン ?GO|寶可夢 ?GO|宝可梦 ?GO|포켓몬 ?GO/i;
const STATE = process.env.SITE_WATCH_STATE || "data/site-watch.json";

// Links on the page whose title names Pokémon GO.
export function goLinks(html, base) {
  // The words around "Pokémon GO" must say something (a menu link that is only "Pokémon GO" is not a post).
  return linksFrom(html, base).filter(l => l.title && l.title.length <= 200 && GO.test(l.title) && l.title.replace(new RegExp(GO.source, "gi"), "").replace(/[\s『』「」\-–—:·|]+/g, "").length >= 6);
}
// The ones not seen before.
export const fresh = (links, seen) => links.filter(l => !(l.url in seen));

export function message(items) {
  const shown = items.slice(0, 5).map(i => "• " + i.title.slice(0, 140) + "\n" + i.url).join("\n");
  return "🌐 New Pokémon GO post on another official site\n\n" + items.slice(0, 5).map(i => "📌 " + i.site).filter((v, k, a) => a.indexOf(v) === k).join("\n") + "\n\n" + shown + (items.length > 5 ? "\n+ " + (items.length - 5) + " more" : "");
}

async function main() {
  let state = null; try { state = JSON.parse(await readFile(STATE, "utf8")); } catch { /* first run */ }
  const seen = { ...((state && state.seen) || {}) }, recorded = new Set((state && state.recorded) || []), status = [], found = [], backlog = [];
  for (const s of SITES) {
    try {
      const r = await fetch(s.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; go-field-notes site-watch)", "accept-language": "en" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const links = goLinks(await r.text(), r.url || s.url);
      status.push({ id: s.id, state: "ok", links: links.length });
      // A site seen for the first time (including one that was down on the first run) is only recorded, never announced, so its existing posts do not flood you.
      for (const l of fresh(links, seen)) (recorded.has(s.id) ? found : backlog).push({ ...l, site: s.name });
      recorded.add(s.id);
    } catch (e) { status.push({ id: s.id, state: "error", note: String(e.message || e).slice(0, 100) }); }
  }
  console.log("Sites:", JSON.stringify(status), "new:", found.length);
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  let told = true;
  if (found.length) {
    if (!token || !chat || process.env.DRY_RUN === "true") { console.log("Not sending. Message would be:\n" + message(found)); told = false; }
    else {
      const env = process.env, dest = route(env, "changes");
      const r = await routed(env, "changes")("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: dest.chat || chat, text: message(found), disable_web_page_preview: true }) });
      if (!r.ok) throw new Error("Telegram answered HTTP " + r.status);
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const f of backlog) seen[f.url] = today;
  if (told) for (const f of found) seen[f.url] = today;
  const keep = Object.fromEntries(Object.entries(seen).slice(-300));
  await writeFile(STATE, JSON.stringify({ updated: new Date().toISOString(), recorded: [...recorded], status, seen: keep }, null, 1) + "\n");
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error("::error::" + e.message); process.exit(1); });
