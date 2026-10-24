import { routed } from "./tgroute.js";
import { eventImage } from "./og.js";
// Phase 5: notifications. Telegram first, then browser push (payload-less, so no message encryption is needed).
// Rules that are enforced here, not left to the UI:
//   * Only ANNOUNCED events (official or community reported, not in conflict, with a known start) can produce an alert.
//   * Datamined or conflicting information is never urgent: datamine finds are a labelled, opt-in digest ("not announced").
//   * Every alert has a dedupe key and a row in notif_sent, so a retry or an overlapping run can't send it twice.
//   * First run only records a baseline; it never floods you with everything that already exists.
//   * Tokens/keys come from Worker secrets; nothing secret is stored in the repo or returned by any route.
import { readAll } from "./userstate.js";
import { stateReady } from "./userstate.js";

export const TZ_DEFAULT = "Australia/Melbourne";
export const MAX_PER_RUN = 8;
const HOUR = 3600000;

export async function notifyReady(db) {
  try { return !!(await db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='notif_sent'").first()); } catch { return false; }
}

// ---- time ----
// "2026-10-10T14:00:00.000" means 14:00 wherever each player is. Returns the instant for the given IANA zone.
export function localToMs(str, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(str || ""));
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offsetAt = (t) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
  };
  let t = asUtc - offsetAt(asUtc);
  t = asUtc - offsetAt(t);
  return t;
}
export function startMs(ev, tz) {
  if (ev.tzMode === "utc") return Date.parse(ev.start);
  if (ev.tzMode === "local") return localToMs(ev.start, tz);
  return null; // unknown: we don't guess
}
export function endMs(ev, tz) {
  if (ev.tzMode === "utc") return Date.parse(ev.end);
  if (ev.tzMode === "local") return localToMs(ev.end, tz);
  return null;
}
const isDateOnly = (s) => /T00:00(:00)?(\.000)?$/.test(String(s || ""));

// ---- preferences (stored as synced user_state entries pref:notify.*) ----
export function prefsFrom(entries) {
  const g = (k, d) => { const e = entries["pref:notify." + k]; return e && e.v !== null && e.v !== undefined ? e.v : d; };
  return { on: g("on", false) === true, telegram: g("telegram", true) !== false, push: g("push", true) !== false, announced: g("announced", true) !== false, changed: g("changed", true) !== false,
    starting: g("starting", true) !== false, missing: g("missing", true) !== false, datamine: g("datamine", false) === true,
    leadHours: Math.min(48, Math.max(1, Number(g("lead", 12)) || 12)), tz: String(g("tz", TZ_DEFAULT)) };
}

const TYPE_WORTH = new Set(["community-day", "raid-battles", "raid-day", "raid-hour", "pokemon-spotlight-hour", "go-fest", "max-battles", "max-monday", "research-day", "event", "season", "go-battle-league", "go-rocket-takeover", "pokemon-go-tour", "elite-raids", "timed-research", "research-breakthrough", "bonus-hour", "city-safari", "safari-zone", "wild-area", "update"]);
// National Dex ranges per generation (static facts).
const GEN_END = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
const genOf = (dex) => { const i = GEN_END.findIndex((e) => dex <= e); return i < 0 ? 0 : i + 1; };
const eligible = (ev) => ev.announced === true && ev.status !== "conflicting" && !ev.missing && ev.status !== "datamined";
const hostOf = (u) => { try { return new URL(u).host; } catch { return ""; } };
const link = (ev) => { const r = (ev.reports || []).find((x) => /^https:\/\//.test(x.link || "")); return r ? r.link : null; };
const label = (ev) => (ev.status === "official_confirmed" ? "Official" : "Community reported");
const fmt = (ms, tz) => new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms));

// Pure: works out what COULD be sent. No I/O, so it is straightforward to test.
// ctx: { events, now, baseline, prefs, follows:Set(lowercase base), saved:Set(ids), forms:{id:{v}}, ownDex:Set(dex numbers)|null, haveMarks, newDatamine:[{id,kind,name,dex,seen}], dexByName }
export function buildCandidates(ctx) {
  const { events, now, baseline, prefs } = ctx, tz = prefs.tz, out = [];
  for (const ev of events) {
    const url = link(ev), s = startMs(ev, tz), e = endMs(ev, tz);
    const firstSeen = Math.min(...(ev.reports || [{ firstSeen: now }]).map((r) => r.firstSeen || now));
    const lastChanged = Math.max(...(ev.reports || [{ lastChanged: 0 }]).map((r) => r.lastChanged || 0));
    if (!eligible(ev) || s == null || e != null && e < now) continue;
    const when = isDateOnly(ev.start) ? new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(s + 12 * HOUR)) : fmt(s, tz);
    const long = e != null && e - s > 36 * HOUR; // seasons and multi-day events: announce and change only
    const fp = String(s) + "|" + String(e);

    if (prefs.announced && firstSeen > baseline && TYPE_WORTH.has(ev.type)) {
      out.push({ kind: "announced", dedupe: `announced|${ev.id}`, item: ev.id, level: "alert", title: `New: ${ev.name}`, body: `${label(ev)}. ${when}.`, url, at: firstSeen });
    } else if (prefs.changed && lastChanged > baseline && firstSeen <= baseline) {
      out.push({ kind: "changed", dedupe: `changed|${ev.id}|${fp}`, item: ev.id, level: "alert", title: `Changed: ${ev.name}`, body: `${label(ev)}. Now ${when}. Check the details.`, url, at: lastChanged });
    }
    if (prefs.starting && !long && !isDateOnly(ev.start) && s > now && s - now <= prefs.leadHours * HOUR) {
      const h = Math.max(1, Math.round((s - now) / HOUR));
      out.push({ kind: "starting", dedupe: `starting|${ev.id}|${s}`, item: ev.id, level: "alert", title: `${ev.name} starts in about ${h}h`, body: `${label(ev)}. ${when}.`, url, at: s });
    }
    if (prefs.missing && s > now && s - now <= 48 * HOUR) {
      for (const f of ev.featured || []) {
        if (!f || !f.name || f.role === "shiny_form") continue;
        const base = String(f.name).replace(/^(Mega|Primal|Shadow|Gigantamax|Dynamax|Alolan|Galarian|Hisuian|Paldean)\s+/i, "").replace(/\s+[XY]$/, "").replace(/\s*\(.*\)\s*$/, "").trim();
        const followed = ctx.follows.has(base.toLowerCase());
        let why = followed ? "You follow " + base : null;
        const dex = ctx.dexByName.get(base.toLowerCase());
        // Need only for a generation you confirmed complete. Unmarked in an unconfirmed generation is Not tracked, never an alert.
        const gen = dex ? genOf(dex) : 0;
        if (!why && dex && gen && ctx.confirmedGens && ctx.confirmedGens.has(gen) && !ctx.ownDex.has(dex) && base.toLowerCase() === String(f.name).toLowerCase()) why = "You marked Gen " + gen + " complete, but " + base + " is not ticked in your Dex, so it counts as one you still need";
        if (!why) continue;
        out.push({ kind: "missing", dedupe: `missing|${ev.id}|${f.name}|${s}`, item: ev.id, level: "alert", title: `${f.name}: ${ev.name}`, body: `${why}. ${label(ev)}. ${when}.`, url, at: s });
      }
    }
  }
  if (prefs.datamine && ctx.newDatamine && ctx.newDatamine.length) {
    const ids = ctx.newDatamine.map((d) => d.id).sort();
    const names = ctx.newDatamine.slice(0, 6).map((d) => d.name).join(", ");
    out.push({ kind: "datamine", dedupe: "datamine|" + hash(ids.join(",")), item: null, level: "info", title: `Datamine: ${ctx.newDatamine.length} new in the game files`, body: `NOT ANNOUNCED. Found by datamining; may change or never ship. ${names}${ctx.newDatamine.length > 6 ? "…" : ""}`, url: null, at: now });
  }
  // an alert-level message must be backed by an eligible event: datamine can only ever be "info"
  return out.filter((c) => c.level === "info" ? c.kind === "datamine" : true);
}
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

// ---- senders ----
// "starting soon" and "you are missing it" alerts go to the Events topic; new, changed and datamine alerts go to Changes.
export const topicFor = (kind) => (kind === "starting" || kind === "missing" ? "events" : "changes");
export async function sendTelegram(env, text, fetcher0, cat = "changes", image = "") {
  const fetcher = routed(env, cat, fetcher0);
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { status: "skipped", why: "not configured" };
  const post = (method, body) => fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: String(env.TELEGRAM_CHAT_ID), ...body }) });
  try {
    if (image) { try { const p = await post("sendPhoto", { photo: image, caption: text.slice(0, 1000) }); if (p.ok) return { status: "sent" }; } catch { /* fall back to plain text */ } } // the event's own picture, the alert as its caption
    const r = await post("sendMessage", { text: text.slice(0, 3900), disable_web_page_preview: true });
    if (!r.ok) return { status: "failed", why: "telegram " + r.status };
    return { status: "sent" };
  } catch (e) { return { status: "failed", why: "telegram unreachable" }; }
}

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
export const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
export const okPushEndpoint = (u) => { try { const x = new URL(u); return x.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(x.hostname)) && u.length < 1000; } catch { return false; } };

export async function vapidKeys(env, db) {
  if (env.VAPID_PUBLIC && env.VAPID_PRIVATE) return { pub: env.VAPID_PUBLIC, d: env.VAPID_PRIVATE, from: "secret" };
  const row = await db.prepare("SELECT v FROM notif_state WHERE k='vapid'").first();
  if (row) { try { const k = JSON.parse(row.v); return { ...k, from: "database" }; } catch { /* regenerate not allowed silently */ } }
  return null;
}
export async function vapidCreate(db) {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const keys = { pub: b64u(pubRaw), d: jwk.d };
  await db.prepare("INSERT OR IGNORE INTO notif_state (k, v) VALUES ('vapid', ?)").bind(JSON.stringify(keys)).run();
  return (await vapidKeys({}, db));
}
export async function vapidJwt(keys, audience, subject, now) {
  const pub = unb64u(keys.pub);
  const jwk = { kty: "EC", crv: "P-256", d: keys.d, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)) };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const input = enc({ typ: "JWT", alg: "ES256" }) + "." + enc({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject });
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input));
  return input + "." + b64u(sig);
}
export async function sendPush(env, db, fetcher, now) {
  const keys = await vapidKeys(env, db);
  if (!keys) return { status: "skipped", why: "push not set up" };
  const subs = (await db.prepare("SELECT id, endpoint, fail_count FROM push_subs").all()).results;
  if (!subs.length) return { status: "skipped", why: "no subscriptions" };
  let ok = 0, bad = 0;
  for (const s of subs) {
    if (!okPushEndpoint(s.endpoint)) { bad++; continue; }
    try {
      const jwt = await vapidJwt(keys, new URL(s.endpoint).origin, env.VAPID_SUBJECT || "https://pogo.michaelpuff.com", now);
      const r = await fetcher(s.endpoint, { method: "POST", headers: { authorization: `vapid t=${jwt}, k=${keys.pub}`, ttl: "7200", urgency: "normal" } });
      if (r.ok) { ok++; await db.prepare("UPDATE push_subs SET last_ok = ?, fail_count = 0 WHERE id = ?").bind(now, s.id).run(); }
      else if (r.status === 404 || r.status === 410) { await db.prepare("DELETE FROM push_subs WHERE id = ?").bind(s.id).run(); bad++; } // the browser unsubscribed
      else { bad++; await db.prepare("UPDATE push_subs SET fail_count = fail_count + 1 WHERE id = ?").bind(s.id).run(); }
    } catch { bad++; }
  }
  return ok ? { status: "sent" } : { status: "failed", why: `push failed for ${bad}` };
}

// ---- the run ----
export async function runNotify(env, db, now, fetcher, deps) {
  if (!(await notifyReady(db))) return { skipped: "tables not created" };
  const entries = (await stateReady(db)) ? await readAll(db) : {};
  const prefs = prefsFrom(entries);
  if (!prefs.on) return { skipped: "notifications are switched off in your settings" };
  const b = await db.prepare("SELECT v FROM notif_state WHERE k='baseline'").first();
  if (!b) { await db.prepare("INSERT OR IGNORE INTO notif_state (k, v) VALUES ('baseline', ?)").bind(String(now)).run(); return { baseline: now, note: "First run: recorded a baseline. Nothing sent for events that already exist." }; }
  const baseline = Number(b.v);
  const { events } = await deps.listEvents(db, now);
  const follows = new Set(), forms = {}, confirmedGens = new Set();
  for (const [k, e] of Object.entries(entries)) { if (e.v === null) continue; if (k.startsWith("follow:")) follows.add(k.slice(7).toLowerCase()); const m = /^pref:gen:(\d+)$/.exec(k); if (m && e.v === true) confirmedGens.add(Number(m[1])); }
  const dexRow = await db.prepare("SELECT data FROM dex WHERE id = 'me'").first().catch(() => null);
  const dexByName = new Map((deps.dexList || []).map((x) => [String(x[1]).toLowerCase(), x[0]]));
  let ownDex = new Set(), haveMarks = false;
  // The app counts a Pokémon as owned from m.own or from the older name-keyed "have" list; the alerts must agree with it.
  if (dexRow) { try { const d = JSON.parse(dexRow.data); ownDex = new Set(Object.keys((d.m && d.m.own) || {}).map(Number)); for (const [name, v] of Object.entries(d.have || {})) { const id = dexByName.get(String(name).toLowerCase()); if (v && id) ownDex.add(id); } haveMarks = ownDex.size > 0; } catch { /* ignore */ } }
  let newDatamine = [];
  if (prefs.datamine) {
    const last = await db.prepare("SELECT v FROM notif_state WHERE k='datamine_cursor'").first();
    const since = Math.max(baseline, last ? Number(last.v) : 0);
    newDatamine = await db.prepare("SELECT id, kind, name, dex, seen FROM dm_new WHERE seen > ? ORDER BY seen LIMIT 100").bind(since).all().then((r) => r.results).catch(() => []);
  }
  const cands = buildCandidates({ events, now, baseline, prefs, follows, forms, ownDex, haveMarks, confirmedGens, newDatamine, dexByName });
  const seen = new Set();
  const fresh = [];
  for (const c of cands) {
    if (seen.has(c.dedupe)) continue; seen.add(c.dedupe);
    const dup = await db.prepare("SELECT 1 AS x FROM notif_sent WHERE dedupe = ?").bind(c.dedupe).first();
    if (!dup) fresh.push(c);
  }
  fresh.sort((a, b2) => (a.level === b2.level ? a.at - b2.at : a.level === "alert" ? -1 : 1));
  const batch = fresh.slice(0, MAX_PER_RUN), held = fresh.length - batch.length;
  const log = { candidates: cands.length, fresh: fresh.length, sent: 0, failed: 0, held };
  for (const c of batch) {
    const text = `${c.title}\n${c.body}${c.url ? "\n" + c.url : ""}`;
    const image = prefs.telegram && c.url && c.level === "alert" ? await eventImage(c.url, deps.pageFetch || fetch) : "";
    const tg = prefs.telegram ? await sendTelegram(env, text, fetcher, topicFor(c.kind), image) : { status: "skipped", why: "off" };
    // the push message is the same row the service worker reads back, so write it first
    await db.prepare("INSERT OR IGNORE INTO notif_sent (dedupe, kind, item_id, level, title, body, url, created_at, telegram, push) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')")
      .bind(c.dedupe, c.kind, c.item, c.level, c.title, c.body, c.url, now, tg.status).run();
    const pu = prefs.push ? await sendPush(env, db, fetcher, now) : { status: "skipped", why: "off" };
    const delivered = tg.status === "sent" || pu.status === "sent";
    const attempted = tg.status !== "skipped" || pu.status !== "skipped";
    if (attempted && !delivered) { // nothing got through: forget it so the next run retries
      await db.prepare("DELETE FROM notif_sent WHERE dedupe = ?").bind(c.dedupe).run(); log.failed++;
      log.lastError = [tg.why, pu.why].filter(Boolean).join("; "); continue;
    }
    await db.prepare("UPDATE notif_sent SET push = ?, error = ? WHERE dedupe = ?").bind(pu.status, [tg.why, pu.why].filter(Boolean).join("; ") || null, c.dedupe).run();
    log.sent += delivered ? 1 : 0;
    if (c.kind === "datamine") await db.prepare("INSERT OR REPLACE INTO notif_state (k, v) VALUES ('datamine_cursor', ?)").bind(String(now)).run();
  }
  await db.prepare("INSERT OR REPLACE INTO notif_state (k, v) VALUES ('last_run', ?)").bind(String(now)).run();
  return log;
}
