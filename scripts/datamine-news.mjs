// Reads the Discord channels that follow PokeMiners' datamining update channels (data/datamine-channels.json) and writes
// public/datamine-news.json for the app's Leaks tab. Everything in it is community datamining: never counted as announced,
// never changes events or any other public data. A channel that cannot be read is recorded and skipped, never fatal.
// Needs DISCORD_TOKEN and CHANNEL_ID (the same secrets the infographic sync uses). Channels are found by name in that channel's server.
// Optional: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (+ TELEGRAM_GROUP_ID / TELEGRAM_TOPIC_DATAMINE) to tell you about new reports.
// Run: node scripts/datamine-news.mjs   (DRY_RUN=true prints instead of sending to Telegram)
import { readFile, writeFile } from "node:fs/promises";
import { routed } from "../src/tgroute.js";

const API = "https://discord.com/api/v10", OUT = "public/datamine-news.json", DAY = 864e5;
const KEEP_DAYS = 60, KEEP_MAX = 250, TEXT_MAX = 700;
const CDN = /^https?:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//i; // signed links that expire within a day: not worth keeping

export function clean(s) {
  return String(s || "")
    .replace(/<a?:\w+:\d+>/g, "")                 // custom emoji
    .replace(/<@[!&]?\d+>|<#\d+>|@everyone|@here/g, "")
    .replace(/<t:\d+(?::\w)?>/g, "")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1")
    .replace(/[*_~`|]{1,3}/g, "")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
const firstUrl = (s) => (String(s || "").match(/https?:\/\/[^\s<>)\]]+/) || [])[0] || "";

// One Discord message (a followed announcement arrives as a webhook message, usually with embeds; forwards keep theirs in message_snapshots).
export function parseMessage(m, src) {
  const parts = [m, ...((m.message_snapshots || []).map((s) => s && s.message).filter(Boolean))];
  let title = "", link = "", image = "";
  const text = [];
  for (const p of parts) {
    if (p.content) text.push(p.content);
    for (const e of p.embeds || []) {
      if (!title && e.title) title = e.title;
      if (!link && e.url) link = e.url;
      if (e.description) text.push(e.description);
      for (const f of e.fields || []) if (f && (f.name || f.value)) text.push((f.name ? f.name + ": " : "") + (f.value || ""));
      const img = (e.image && e.image.url) || (e.thumbnail && e.thumbnail.url) || "";
      if (!image && img && !CDN.test(img)) image = img;
    }
  }
  const body = clean(text.join("\n"));
  if (!link) link = firstUrl(text.join(" "));
  if (!title) title = clean((body.split("\n")[0] || "")).slice(0, 120);
  const hasAttachment = parts.some((p) => (p.attachments || []).length);
  if (!title && !body && !hasAttachment && !image) return null;
  if (!title) title = hasAttachment ? "New image" : "Update";
  const ts = Date.parse(m.timestamp);
  return { id: String(m.id), src, title: clean(title).slice(0, 160), text: body.slice(0, TEXT_MAX), link, image, date: Number.isFinite(ts) ? new Date(ts).toISOString() : "" };
}

// New items go in front; known ids are kept as they were; old ones age out.
export function merge(old, fresh, now = Date.now()) {
  const seen = new Set(old.map((i) => i.id)), added = fresh.filter((i) => !seen.has(i.id));
  const items = [...added, ...old].filter((i) => i.date && Date.parse(i.date) >= now - KEEP_DAYS * DAY);
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { items: items.slice(0, KEEP_MAX), added };
}

export function telegramText(i) {
  const bits = ["PokéMiners report: " + i.title];
  if (i.text) bits.push(i.text.replace(/\s+/g, " ").slice(0, 280));
  if (i.link) bits.push(i.link);
  bits.push("Datamined: not announced.");
  return bits.join("\n\n");
}

async function discord(path, token) {
  for (let a = 0; a < 3; a++) {
    const r = await fetch(API + path, { headers: { authorization: "Bot " + token, "user-agent": "go-field-notes datamine-news (+https://github.com/Wood468/crispy-barnacle)" }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429 && a < 2) { await new Promise((ok) => setTimeout(ok, 2000)); continue; }
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
}

async function main() {
  const token = process.env.DISCORD_TOKEN, anchor = process.env.CHANNEL_ID, dry = process.env.DRY_RUN === "true";
  if (!token || !anchor) { console.log("DISCORD_TOKEN or CHANNEL_ID is not set; nothing to do."); return; }
  const cfg = JSON.parse(await readFile("data/datamine-channels.json", "utf8"));
  let prev = null; try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
  const status = [], fresh = [];
  let guild = null;
  try { guild = (await discord("/channels/" + encodeURIComponent(anchor), token)).guild_id; } catch (e) { for (const c of cfg.channels) status.push({ src: c.src, name: c.name, state: "error", note: "cannot find the server: " + e.message }); }
  const list = guild ? await discord("/guilds/" + guild + "/channels", token).catch((e) => { status.push({ src: "all", name: "", state: "error", note: "cannot list channels: " + e.message }); return []; }) : [];
  for (const c of guild ? cfg.channels : []) {
    const ch = list.find((x) => String(x.name).toLowerCase() === c.name && [0, 5].includes(x.type));
    if (!ch) { status.push({ src: c.src, name: c.name, state: "missing", note: "no channel with this name in the server" }); continue; }
    try {
      const msgs = await discord("/channels/" + ch.id + "/messages?limit=50", token);
      const items = msgs.map((m) => parseMessage(m, c.src)).filter(Boolean);
      fresh.push(...items.map((i) => ({ ...i, notify: !!c.notify })));
      status.push({ src: c.src, name: c.name, state: "ok", count: items.length });
    } catch (e) { status.push({ src: c.src, name: c.name, state: "error", note: e.message + (/40[13]/.test(e.message) ? " (give the bot View Channel and Read Message History)" : "") }); }
  }
  const old = prev && Array.isArray(prev.items) ? prev.items : [];
  const { items, added } = merge(old, fresh.map(({ notify, ...i }) => i));
  // Tell me about new reports only: never on the first run, never about old posts, at most 3 per run.
  const notifyIds = new Set(fresh.filter((i) => i.notify).map((i) => i.id));
  const first = !(prev && prev.seeded);
  const toTell = !first ? added.filter((i) => notifyIds.has(i.id) && Date.parse(i.date) > Date.now() - 2 * DAY).slice(0, 3) : [];
  const token2 = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  let told = 0;
  for (const i of toTell) {
    if (dry || !token2 || !chat) { console.log("Would tell you:\n" + telegramText(i) + "\n"); continue; }
    try {
      const f = routed(process.env, "datamine", globalThis.fetch);
      const r = await f("https://api.telegram.org/bot" + token2 + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: telegramText(i), disable_web_page_preview: true }) });
      if (r.ok) told++;
    } catch {}
  }
  if (toTell.length && !dry && token2 && chat && !told) { console.error("Telegram did not accept the message; the file is not updated, so the next run tries again"); process.exit(1); }
  const out = { updated: new Date().toISOString(), seeded: first ? status.some((x) => x.state === "ok") : true, channels: status, items };
  if (!dry) await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(status.map((s) => s.src + " (" + s.name + "): " + s.state + (s.count != null ? " " + s.count : " " + (s.note || ""))).join("\n"));
  console.log(added.length + " new item(s), " + items.length + " kept, told you about " + told + ".");
}
if (import.meta.url === "file://" + process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });
