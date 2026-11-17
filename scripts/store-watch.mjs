#!/usr/bin/env node
// Compares a fresh snapshot of the Pokemon GO web store with what we saw last time and tells you on Telegram about anything
// new (tickets, GO Passes, boxes, bundles) or any price change: one message per item, with its picture and an "Open store"
// link button.
// Usage: node scripts/store-watch.mjs snapshot.json   (state is kept in data/store-state.json)
import { readFile, writeFile } from "node:fs/promises";
import { routed } from "../src/tgroute.js";
import { currencyOf, validateStoreObservation, deriveCompleteness, EVIDENCE_PRODUCER, lastCompleteAt } from "../src/store-validate.js";

// Pure validators live in src/store-validate.js (shared with the Worker ingest route); re-exported so existing imports keep working.
export { currencyOf, validateStoreObservation, deriveCompleteness, EVIDENCE_PRODUCER };

const STATE = process.env.STORE_STATE || "data/store-state.json";
const STORE = "https://store.pokemongo.com";
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };
const key = i => i.href || i.name;
// Image URLs are evidence only when supplied by the matching product snapshot.
export const imageUrls = i => (Array.isArray(i.imgs) ? i.imgs : []).filter(u => { try { const x=new URL(u); return x.protocol === "https:" && !x.username && !x.password; } catch { return false; } }).slice(0,4);
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

// The store shows a rounded countdown ("4 hours left"). Turn it into an estimated end time, and keep the earlier estimate while a
// new reading still agrees with it to within one unit, so the saved time does not wobble every hour (and so the site is not redeployed).
const UNIT = { day: 864e5, hour: 36e5, minute: 6e4 };
export function endsAtFrom(left, nowIso, prev) {
  const m = /(\d+)\s*(day|hour|minute)s?\s*left/i.exec(String(left || ""));
  if (!m) return prev || null;
  const unit = UNIT[m[2].toLowerCase()], est = Date.parse(nowIso) + Number(m[1]) * unit;
  if (prev && Math.abs(est - Date.parse(prev)) <= unit) return prev;
  return new Date(est).toISOString();
}

const CURRENCY_HOLD_MS = 72 * 36e5;
export function dominantCurrency(prices) {
  const counts = new Map();
  for (const price of prices || []) {
    const currency = currencyOf(price);
    if (currency) counts.set(currency, (counts.get(currency) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

const LARGE_DROP_MIN = 3;
export function diffStore(prev, snap, nowIso) {
  const invalid = validateStoreObservation(snap);
  if (invalid) return {
    state: { ...(prev || {}), updated: nowIso, lastObservation: { at: nowIso, status: "held", reason: invalid } },
    added: [], changed: [], gone: [], first: false,
    held: { reason: invalid, previousCount: Object.keys((prev && prev.items) || {}).length, incomingCount: Array.isArray(snap?.items) ? snap.items.length : 0 }
  };
  const old = (prev && prev.items) || {};
  const base = prev && prev.items
    ? (prev.currency || dominantCurrency(Object.values(prev.items).map(o => o.price)))
    : "";
  const cur = dominantCurrency((snap.items || []).map(i => i.price));
  let reset = null;

  if (base && cur && cur !== base) {
    const previousHold = prev.currencyHold;
    const hold = previousHold && previousHold.currency === cur && Number.isFinite(Date.parse(previousHold.since))
      ? previousHold
      : { currency: cur, since: nowIso };
    const elapsed = Date.parse(nowIso) - Date.parse(hold.since);
    if (Number.isFinite(elapsed) && elapsed >= CURRENCY_HOLD_MS) {
      reset = { from: base, to: cur };
    } else {
      return {
        state: { ...prev, currency: base, currencyHold: hold, updated: nowIso, lastObservation: { at: nowIso, status: "held", reason: "currency" } },
        added: [], changed: [], gone: [], first: false,
        held: { base, cur, since: hold.since, isNew: !previousHold || previousHold.currency !== cur }
      };
    }
  }

  // A partially rendered storefront is not evidence that previously listed SKUs
  // disappeared. Completeness is DERIVED here from producer evidence checked
  // against the observed items; any caller-supplied `verified` flag is ignored.
  const incoming = Array.isArray(snap.items) ? snap.items : [];
  const incomingKeys = new Set(incoming.map(key).filter(Boolean));
  const missing = Object.keys(old).filter(k => !incomingKeys.has(k));
  const evidence = deriveCompleteness(snap);
  const observed = (status, reason) => ({ at: nowIso, status, ...(reason ? { reason } : {}) });
  const hold = (reason, extra = {}, patch = {}) => ({
    state: { ...prev, updated: nowIso, lastObservation: observed("held", reason), ...patch },
    added: [], changed: [], gone: [], first: false,
    held: { reason, previousCount: Object.keys(old).length, incomingCount: incomingKeys.size, ...extra }
  });
  let pendingGone = { ...((prev && prev.pendingGone) || {}) };
  if (missing.length) {
    if (!evidence.complete) return hold("incomplete-snapshot", { evidence: evidence.reason });
    // A large simultaneous drop is never accepted automatically, even with complete evidence.
    if (missing.length > LARGE_DROP_MIN && missing.length * 4 >= Object.keys(old).length) return hold("large-drop");
    // Retire only SKUs with independent corroboration: their own end date has passed,
    // or an earlier COMPLETE scrape already found them absent (second consecutive complete scrape).
    const uncorroborated = missing.filter(k => {
      const end = Date.parse(old[k].endsAt || "");
      return !((Number.isFinite(end) && end <= Date.parse(nowIso)) || pendingGone[k]);
    });
    if (uncorroborated.length) {
      const pending = { ...pendingGone };
      for (const k of uncorroborated) pending[k] = { firstAbsentAt: nowIso };
      return hold("awaiting-corroboration", { pending: uncorroborated.length }, { pendingGone: pending });
    }
  }
  for (const k of incomingKeys) delete pendingGone[k];
  for (const k of missing) delete pendingGone[k]; // retired below

  const next = {}, added = [], changed = [], gone = [];
  for (const i of snap.items) {
    const k = key(i), o = old[k];
    const oldCurrency = o ? currencyOf(o.price) : "";
    const newCurrency = currencyOf(i.price);
    const mixed = !!o && !reset && !!oldCurrency && !!newCurrency && oldCurrency !== newCurrency;
    // A reading with no currency (bare coin number, "Free", blank) carries no AU price evidence: keep the saved price.
    const np = typeof i.price === "string" ? i.price : "";
    const keepOld = mixed || (!!o && !!oldCurrency && !newCurrency);
    next[k] = {
      name: i.name,
      // Preserve official snapshot imagery; never infer a product image from its label.
      images: imageUrls(i).length ? imageUrls(i) : (o?.images || []),
      price: keepOld ? o.price : np,
      section: i.section,
      tag: i.tag,
      limit: i.limit,
      firstSeen: o ? o.firstSeen : nowIso,
      lastSeen: nowIso,
      endsAt: endsAtFrom(i.left, nowIso, o && o.endsAt)
    };
    if (!o) added.push(i);
    else if (!keepOld && !reset && o.price !== np) changed.push({ ...i, was: o.price });
  }
  const history = { ...((prev && prev.gone) || {}) };
  for (const [k, o] of Object.entries(old)) if (!next[k]) { gone.push(o); history[k] = { ...o, goneAt: nowIso }; }
  for (const k of Object.keys(next)) delete history[k]; // back on sale
  const keep = Object.entries(history).sort((a, b) => String(b[1].goneAt).localeCompare(String(a[1].goneAt))).slice(0, 150);
  const watchStart = (prev && prev.watchStart) || (prev && prev.items ? Object.values(prev.items).map(o => o.firstSeen).sort()[0] : nowIso);
  return {
    state: { items: next, gone: Object.fromEntries(keep), watchStart, updated: nowIso, currency: cur || base,
      ...(prev?.lastPublishedAt ? { lastPublishedAt: prev.lastPublishedAt } : {}),
      ...(evidence.complete ? { lastCompleteAt: nowIso } : lastCompleteAt(prev) ? { lastCompleteAt: lastCompleteAt(prev) } : {}),
      ...(Object.keys(pendingGone).length ? { pendingGone } : {}),
      lastObservation: observed(evidence.complete ? "complete" : "unverified", evidence.complete ? "" : evidence.reason) },
    added, changed, gone, first: !prev || !prev.items, reset
  };
}

// One message per item: { text, photo, slug, url }.
/* Publication heartbeat (PRIVATE: data/store-state.json only, never in public/**).
   Meaning: "a valid, complete observation from THIS run was committed and pushed to main". Called by the workflow
   immediately before its commit, so the stamp only persists if the push succeeds. It also advances when the
   catalogue is unchanged. Limitation: this proves publication to main, not deployment; the Cloudflare build that
   deploys main is not observed here. Held, invalid, incomplete-evidence or stale (older than maxAgeMs) observations
   never advance it. */
export function stampPublication(state, nowIso, maxAgeMs = 30 * 60 * 1000) {
  const o = state && state.lastObservation, at = Date.parse(o && o.at), now = Date.parse(nowIso);
  if (!o || o.status !== "complete" || !Number.isFinite(at) || !Number.isFinite(now) || at > now || now - at > maxAgeMs) return state;
  const last = Date.parse(state.lastPublishedAt || "");
  if (Number.isFinite(last) && last >= at) return state;
  return { ...state, lastPublishedAt: o.at };
}

export function buildMessages(d) {
  const limited = i => /limited/i.test(i.tag || "") || i.section === "LIMITED_TIME";
  const want = d.first ? d.added.filter(limited) : d.added;
  const out = [];
  const card = (i, head) => {
    const k = kindOf(i.name, i.section), slug = slugOf(i);
    const lines = [k.emoji + " " + head + " · " + k.label, "", "✨ " + i.name, "💰 " + (i.price || "price not shown") + (i.was ? "  (was " + i.was + ")" : "")];
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
  const row = (k, o) => ({ name: o.name, image: (o.images || [])[0] || null, imageStatus: (o.images || []).length ? "unverified-remote" : "missing", price: o.price, section: o.section || "", slug: slugOf({ href: k.startsWith("/") ? k : "", name: o.name }), href: k.startsWith("/") ? k : "", endsAt: o.endsAt || null, firstSeen: o.firstSeen, lastSeen: o.lastSeen, goneAt: o.goneAt || null });
  const items = [...Object.entries(state.items || {}).map(([k, o]) => row(k, o)), ...Object.entries(state.gone || {}).map(([k, o]) => row(k, o))];
  return { watchStart: state.watchStart || null, updated: state.updated, items: items.filter(i => isTicketOrPass(i.name) || /box|bundle/i.test(i.name)) };
}

/* Public, price-free storefront evidence for the owner catalogue. Always
   distinguish the current snapshot from retired listings; no owner checkout
   prices, tokens, receipts or personalised account details may enter here. */
export function storeCurrentSnapshot(state) {
  const safeImage = url => typeof url === "string" &&
    /^https:\/\/assets\.pgo\.webstore\.nianticlabs\.com\/pgo\/image_variants\/v1\/sku_assets\/[a-z0-9_.%()\-]+\/w(?:64|128|256|512)\.webp$/i.test(url)
    ? url : null;
  const clean = (key, entry, retired) => ({
    name: String(entry.name || "").slice(0, 160),
    href: /^\/purchase\/item\/[a-z0-9_.-]+$/i.test(key) ? key : null,
    image: safeImage((entry.images || [])[0]),
    lastSeen: entry.lastSeen || null,
    endsAt: entry.endsAt || null,
    goneAt: retired ? entry.goneAt || null : null
  });
  return {
    version: 1,
    updated: state.updated || null,
    items: Object.entries(state.items || {}).map(([k,v]) => clean(k,v,false)),
    gone: Object.entries(state.gone || {}).map(([k,v]) => clean(k,v,true))
  };
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

// ---- Home-reader input guards (the snapshot now comes from the Melbourne add-on via /api/store-ingest) ----
const FRESH_MAX_MS = 6 * 36e5, STALE_PUBLIC_MS = 3 * 864e5, STALE_ALERT_GAP_MS = 24 * 36e5;
// Refuse a snapshot that is missing a time or older than 6 hours: an old upload must never be read as today's store.
export function assertFreshSnapshot(snap, nowMs = Date.now(), maxAgeMs = FRESH_MAX_MS) {
  const at = Date.parse(snap && snap.fetched);
  if (!Number.isFinite(at) || nowMs - at > maxAgeMs) throw new Error("stale snapshot");
}
// Why the home reader looks silent, or null. publicUpdated: `updated` of public/store-current-snapshot.json (ISO);
// receivedMs: when the Worker last accepted an upload (null when it never has, or could not be asked).
// lastComplete: when the last COMPLETE non-held observation was saved (held runs also bump `updated`, so they must not hide staleness);
// publicUpdated is only the fallback when no complete observation is recorded yet.
export function staleReason({ publicUpdated, lastComplete, receivedMs }, nowMs = Date.now()) {
  const upd = Date.parse(lastComplete || publicUpdated);
  if (!Number.isFinite(upd) || nowMs - upd > STALE_PUBLIC_MS) return "the published store snapshot is more than 3 days old";
  if (!Number.isFinite(receivedMs) || nowMs - receivedMs > FRESH_MAX_MS) return "the Melbourne reader has not uploaded for more than 6 hours";
  return null;
}
// At most one stale alert per 24 hours, remembered in state.staleAlertAt (cleared by the next good run rebuilding state).
export function shouldSendStaleAlert(state, nowMs = Date.now()) {
  const last = Date.parse(state && state.staleAlertAt);
  return !(Number.isFinite(last) && nowMs - last < STALE_ALERT_GAP_MS);
}
// Rebaseline: forget the saved catalogue so the next complete snapshot becomes the baseline (first: true, nothing is announced).
export const rebaselinePrev = prev => ({ watchStart: prev && prev.watchStart, gone: (prev && prev.gone) || {} });

async function staleAlert() {
  const now = Date.now(), st = await readJson(STATE, null) || {};
  const pub = await readJson(process.env.STORE_CURRENT_SNAPSHOT || "public/store-current-snapshot.json", {});
  let receivedMs = null;
  try {
    const r = await fetch(process.env.STORE_INGEST_URL || "https://pogo.michaelpuff.com/api/store-ingest", { signal: AbortSignal.timeout(15000) });
    if (r.ok) receivedMs = Date.parse(r.headers.get("x-store-received"));
  } catch { /* unreachable counts as silent */ }
  const why = staleReason({ publicUpdated: pub.updated, lastComplete: lastCompleteAt(st), receivedMs }, now);
  if (!why) { console.log("Store snapshot is fresh."); return; }
  if (!shouldSendStaleAlert(st, now)) { console.log("Stale (" + why + "); already alerted within 24 hours."); return; }
  console.log("Stale: " + why);
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (process.env.DRY_RUN === "true" || !token || !chat) { console.log("Not sending the stale alert."); return; }
  let r = null;
  try {
    r = await routed(process.env, "system")("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: "🛒 Store watch: " + why + ". Check the Home Assistant store add-on. I will say this at most once a day.", disable_web_page_preview: true })
    });
  } catch { /* unreachable: treated as not sent */ }
  // Remember the alert only after Telegram accepted it, and never create a state file holding nothing but the marker.
  if (r && r.ok && st.items) await writeFile(STATE, JSON.stringify({ ...st, staleAlertAt: new Date(now).toISOString() }, null, 1) + "\n");
  else console.log("Stale alert not saved (send failed or no saved store state).");
}
async function main() {
  if (process.argv[2] === "--stamp-publication") {
    const st = await readJson(STATE, null);
    if (st) await writeFile(STATE, JSON.stringify(stampPublication(st, new Date().toISOString()), null, 1) + "\n");
    return;
  }
  if (process.argv[2] === "--stale-alert") return staleAlert();
  if (process.argv[2] === "--check-fresh") { assertFreshSnapshot(await readJson(process.argv[3], null)); return; }
  const snap = await readJson(process.argv[2], null);
  if (!snap || !snap.items || snap.items.length < 3) throw new Error("No usable snapshot");
  assertFreshSnapshot(snap);
  const rebaseline = process.env.STORE_REBASELINE === "1";
  const prev = await readJson(STATE, null), now = new Date().toISOString();
  const d = diffStore(rebaseline ? rebaselinePrev(prev) : prev, snap, now);
  if (rebaseline && (d.held || d.state.lastObservation.status !== "complete")) throw new Error("rebaseline refused: snapshot is not a complete valid observation");
  const msgs = rebaseline ? [] : buildMessages(d);
  if (rebaseline) console.log("Rebaseline: saving " + snap.items.length + " items as the new baseline; no messages sent.");
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (d.reset) {
    console.log("Store has stayed in " + d.reset.to + " for 72 hours; taking it as the new baseline.");
    if (token && chat && process.env.DRY_RUN !== "true") {
      await routed(process.env, "system")("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chat,
          text: "🛒 Store watch: the store has stayed in " + d.reset.to + " prices for 72 hours (was " + d.reset.from + "). Baseline reset to " + d.reset.to + "; no price alerts for the switch.",
          disable_web_page_preview: true
        })
      });
    }
  }
  if (d.held) {
    const counts = d.held.incomingCount === undefined ? "" : " [items=" + d.held.incomingCount + ", previous=" + d.held.previousCount + "]";
    console.log(d.held.reason === "incomplete-snapshot" || d.held.reason === "awaiting-corroboration" || d.held.reason === "large-drop" ? "Store snapshot held (" + d.held.reason + (d.held.evidence ? ": " + d.held.evidence : "") + ")" + counts + "; retaining prior listings without removals." : d.held.cur === undefined ? "Store observation invalid (" + d.held.reason + ")" + counts + "; retaining prior listings." : "Store is showing " + d.held.cur + " prices instead of " + d.held.base + "; ignoring this reading (no alerts, saved prices kept).");
    if (d.held.isNew && token && chat && process.env.DRY_RUN !== "true") {
      await routed(process.env, "system")("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chat,
          text: "🛒 Store watch: the store is showing " + d.held.cur + " prices instead of " + d.held.base + ". Ignoring that reading, so no price alerts. I will say nothing more unless it stays like this.",
          disable_web_page_preview: true
        })
      });
    }
    if (process.env.DRY_RUN !== "true") await writeFile(STATE, JSON.stringify(d.state, null, 1) + "\n");
    return;
  }
  globalThis.fetch = routed(process.env, "changes", globalThis.fetch);
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
    await writeFile(process.env.STORE_CURRENT_SNAPSHOT || "public/store-current-snapshot.json",
      JSON.stringify(storeCurrentSnapshot(d.state), null, 1) + "\n");
  }
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
