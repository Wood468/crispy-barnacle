#!/usr/bin/env node
// Compares a fresh snapshot of the Pokemon GO web store with what we saw last time and tells you on Telegram about anything
// new (tickets, GO Passes, boxes, bundles) or any price change: one message per item, with its picture and an "Open store"
// link button.
// Usage: node scripts/store-watch.mjs snapshot.json   (state is kept in data/store-state.json)
import { readFile, writeFile } from "node:fs/promises";
import { routed } from "../src/tgroute.js";

const STATE = process.env.STORE_STATE || "data/store-state.json";
const STORE = "https://store.pokemongo.com";
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };
const key = i => i.href || i.name;
export const slugOf = i => String(i.href || i.name || "").split("/").filter(Boolean).pop().toLowerCase().replace(/[^a-z0-9_.-]/g, "-").slice(-60);
export const isTicketOrPass = n => /ticket|go pass|pass deluxe|go fest|tour|safari|city|hatch day/i.test(n);

// What kind of thing is it? Gives the emoji and a short label for the top of the message.
export function kindOf(name, section = "") {
  const n = String(name);
  if (/go pass/i.test(n)) return { emoji: "🎫", label: "GO Pass" };
  if (/ticket|hatch day|go fest|tour\b|safari/i.test(n)) return { emoji: "🎟", label: "Event ticket" };
  if (/coin/i.test(n) || /^POKECOINS$/i.test(section)) return { emoji: "🪙", label: "PokéCoins" };
  if (/raid/i.test(n)) return { emoji: "⚔️", label: "Raid passes" };
  if (/incubator|egg/i.test(n)) return { emoji: "🥚", label: "Eggs & incubators" };
  if (/box|bundle|pack/i.test(n)) return { emoji: "🎁", label: "Box" };
  return { emoji: "🛒", label: "Store item" };
}

export function diffStore(prev, snap, nowIso) {
  const old = (prev && prev.items) || {}, next = {}, added = [], changed = [], gone = [];
  for (const i of snap.items) {
    const k = key(i), o = old[k];
    next[k] = { name: i.name, price: i.price, section: i.section, tag: i.tag, limit: i.limit, firstSeen: o ? o.firstSeen : nowIso, lastSeen: nowIso };
    if (!o) added.push(i); else if (o.price !== i.price) changed.push({ ...i, was: o.price });
  }
  const history = { ...((prev && prev.gone) || {}) };
  for (const [k, o] of Object.entries(old)) if (!next[k]) { gone.push(o); history[k] = { ...o, goneAt: nowIso }; }
  for (const k of Object.keys(next)) delete history[k]; // back on sale
  const keep = Object.entries(history).sort((a, b) => String(b[1].goneAt).localeCompare(String(a[1].goneAt))).slice(0, 150);
  const watchStart = (prev && prev.watchStart) || (prev && prev.items ? Object.values(prev.items).map(o => o.firstSeen).sort()[0] : nowIso);
  return { state: { items: next, gone: Object.fromEntries(keep), watchStart, updated: nowIso }, added, changed, gone, first: !prev || !prev.items };
}

// One message per item: { text, photo, slug, url }.
export function buildMessages(d) {
  const limited = i => /limited/i.test(i.tag || "") || i.section === "LIMITED_TIME";
  const want = d.first ? d.added.filter(limited) : d.added;
  const out = [];
  const card = (i, head) => {
    const k = kindOf(i.name, i.section), slug = slugOf(i);
    const lines = [k.emoji + " " + head + " · " + k.label, "", "✨ " + i.name, "💰 " + i.price + (i.was ? "  (was " + i.was + ")" : "")];
    if (limited(i)) lines.push("⏳ Limited time only");
    if (i.limit) lines.push("🔒 " + i.limit.replace(/^Can only be purchased /, "Limit: ").replace(/\.$/, ""));
    return { text: lines.join("\n"), photo: (i.imgs && (i.imgs[1] || i.imgs[0])) || "", slug, url: STORE + (i.href || "/") };
  };
  for (const i of want) out.push(card(i, d.first ? "ON SALE NOW" : "NEW IN STORE"));
  for (const i of d.changed) out.push(card(i, "PRICE CHANGE"));
  return out;
}

// The public log the Purchase planner reads: only tickets, passes and boxes, with when each was first and last seen.
export function storeLog(state) {
  const row = (k, o) => ({ name: o.name, price: o.price, section: o.section || "", slug: slugOf({ href: k.startsWith("/") ? k : "", name: o.name }), firstSeen: o.firstSeen, lastSeen: o.lastSeen, goneAt: o.goneAt || null });
  const items = [...Object.entries(state.items || {}).map(([k, o]) => row(k, o)), ...Object.entries(state.gone || {}).map(([k, o]) => row(k, o))];
  return { watchStart: state.watchStart || null, updated: state.updated, items: items.filter(i => isTicketOrPass(i.name) || /box|bundle/i.test(i.name)) };
}

async function tg(token, method, body) {
  const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.ok;
}
export async function send(m, token, chat) {
  const markup = { inline_keyboard: [[{ text: "🛒 Open store", url: m.url }]] };
  if (m.photo && await tg(token, "sendPhoto", { chat_id: chat, photo: m.photo, caption: m.text, reply_markup: markup })) return true;
  return tg(token, "sendMessage", { chat_id: chat, text: m.text, reply_markup: markup, disable_web_page_preview: true });
}
async function main() {
  const snap = await readJson(process.argv[2], null);
  if (!snap || !snap.items || snap.items.length < 3) throw new Error("No usable snapshot");
  const prev = await readJson(STATE, null), now = new Date().toISOString();
  const d = diffStore(prev, snap, now), msgs = buildMessages(d);
  globalThis.fetch = routed(process.env, "changes", globalThis.fetch);
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!msgs.length) console.log("Nothing new to tell you (" + snap.items.length + " items in the store).");
  else if (!token || !chat || process.env.DRY_RUN === "true") console.log("Not sending. Messages would be:\n\n" + msgs.map(m => m.text + "\n[" + (m.photo || "no picture") + "]").join("\n\n"));
  else {
    let failed = 0;
    for (const m of msgs.slice(0, 12)) if (!(await send(m, token, chat))) failed++;
    if (msgs.length > 12) await tg(token, "sendMessage", { chat_id: chat, text: "+ " + (msgs.length - 12) + " more in the store: " + STORE, disable_web_page_preview: true });
    if (failed === Math.min(msgs.length, 12)) throw new Error("Telegram did not accept any message; state not saved so it retries");
    console.log("Sent " + (Math.min(msgs.length, 12) - failed) + " message(s).");
  }
  if (process.env.DRY_RUN !== "true") {
    await writeFile(STATE, JSON.stringify(d.state, null, 1) + "\n");
    await writeFile(process.env.STORE_LOG || "public/store-log.json", JSON.stringify(storeLog(d.state), null, 1) + "\n");
  }
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
