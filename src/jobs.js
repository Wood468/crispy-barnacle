// Telegram jobs that run on the Worker's own cron, so they cost no GitHub Actions minutes:
//   - "Starting soon": about an hour before a Spotlight Hour, Raid Hour, Community Day, new raid bosses and so on (every hour, 7 am to 10 pm Melbourne).
//   - Monday summary: the week ahead (Sunday 20:30 UTC, about 7:30 am Monday in Melbourne).
// What was already sent is kept in the D1 table job_state (created here the first time, nothing else is touched).
import { keyboard } from "./telegram.js";
import { routed } from "./tgroute.js";
import * as userstate from "./userstate.js";
import { venueItems, describeVenue, venueFor } from "./venue-times.js";
import { eventImage } from "./og.js";
export { eventImage };
import { APP, buildWeek, formatWeek, pictureUrls, melbourneNow, startingSoon, messageFor, pending, quiet } from "./jobs-core.js";

const SQL_TABLE = "CREATE TABLE IF NOT EXISTS job_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)";
async function getState(db, key, dflt) {
  await db.prepare(SQL_TABLE).run();
  const r = await db.prepare("SELECT value FROM job_state WHERE key = ?").bind(key).first();
  try { return r ? JSON.parse(r.value) : dflt; } catch { return dflt; }
}
async function setState(db, key, val) {
  await db.prepare("INSERT INTO job_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(key, JSON.stringify(val), new Date().toISOString()).run();
}
async function siteData(env) {
  const r = await env.ASSETS.fetch(new Request(APP + "/data.json"));
  if (!r.ok) throw new Error("data.json " + r.status);
  return r.json();
}
async function tg(env, method, body, f) {
  const r = await f("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, ...body }) });
  return r.ok;
}

// opts: { now: Date, dry: bool, fetch }. Returns what it sent (or would send when dry).
export async function runSoon(env, opts = {}) {
  const f = routed(env, "events", opts.fetch || fetch), nowMs = melbourneNow(opts.now || new Date());
  const data = await siteData(env), state = await getState(env.DB, "soon", { sent: [] });
  const todo = pending(startingSoon(data, nowMs), state);
  if (!todo.length) return { sent: [], note: "nothing starting soon" };
  if (quiet(nowMs)) return { sent: [], note: "quiet hours" };
  const texts = todo.map(i => messageFor(i, nowMs));
  if (opts.dry || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { sent: [], would: texts, note: "not sent" };
  const sent = [];
  for (const it of todo) {
    const text = messageFor(it, nowMs); let ok = false;
    if (it.art[0]) ok = await tg(env, "sendPhoto", { photo: APP + "/api/art?n=" + encodeURIComponent(it.art[0]), caption: text.replace(/\n\n(https:\S+)$/, "\n$1") }, f);
    if (!ok) ok = await tg(env, "sendMessage", { text, disable_web_page_preview: true }, f);
    if (ok) { state.sent = [...(state.sent || []), it.id].slice(-200); sent.push(it.id); }
  }
  if (sent.length) await setState(env.DB, "soon", state);
  return { sent };
}

// The week-ahead message gets a "yours" section: events you starred that touch the week from `from` (YYYY-MM-DD).
export function savedThisWeek(data, world, savedIds, from) {
  const last = new Date(Date.parse(from + "T00:00Z") + 6 * 864e5).toISOString().slice(0, 10);
  const all = new Map((data.events || []).map(e => [String(e.id), { t: e.t, s: e.s.slice(0, 10), e: (e.e || e.s).slice(0, 10) }]));
  for (const w of world) if (w && w.id && w.start) all.set(String(w.id), { t: w.name, s: w.start, e: w.end || w.start });
  const out = [];
  for (const sid of savedIds) { const x = all.get(String(sid).replace(/^cur:/, "")); if (x && x.e >= from && x.s <= last) out.push(x); }
  return out.sort((a, b) => a.s.localeCompare(b.s)).map(x => "⭐ " + x.t + " (" + (x.s === x.e ? x.s.slice(5) : x.s.slice(5) + " to " + x.e.slice(5)) + ")");
}
export async function runWeekly(env, opts = {}) {
  const f = routed(env, "events", opts.fetch || fetch), now = opts.now || new Date();
  const from = new Date(now.getTime() + 11 * 36e5).toISOString().slice(0, 10); // Melbourne date
  const state = await getState(env.DB, "weekly", { last: "" });
  if (state.last === from && !opts.dry) return { sent: false, note: "already sent today" };
  const sd = await siteData(env), rows = buildWeek(sd, from);
  const rowsState = await userstate.readAll(env.DB, 0, "").catch(() => ({}));
  const savedIds = Object.keys(rowsState).filter(k => k.startsWith("saved:") && rowsState[k].v === true).map(k => k.slice(6));
  const world = await env.ASSETS.fetch(new Request(APP + "/world-events.json")).then(r => r.ok ? r.json() : {}).then(x => x.events || []).catch(() => []);
  const mine = savedThisWeek(sd, world, savedIds, from);
  const text = formatWeek(rows) + (mine.length ? "\n\nYours this week:\n" + mine.join("\n") : ""), pics = pictureUrls(rows);
  if (opts.dry || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { sent: false, would: text, pictures: pics.map(p => p.caption), note: "not sent" };
  if (pics.length >= 2) await tg(env, "sendMediaGroup", { media: pics.map((p, i) => ({ type: "photo", media: p.url, caption: i === 0 ? "This week: " + pics.map(x => x.caption).join(", ").slice(0, 900) : undefined })) }, f);
  else if (pics.length === 1) await tg(env, "sendPhoto", { photo: pics[0].url, caption: pics[0].caption }, f);
  if (!(await tg(env, "sendMessage", { text, disable_web_page_preview: true }, f))) throw new Error("Telegram did not accept the weekly message");
  await setState(env.DB, "weekly", { last: from });
  return { sent: true };
}

// Reminders for the events you starred (they are saved in your synced list as "saved:cur:<id>").
// "Starting soon" already pings for single-day timed events, so these cover the rest: events with no clock time and long events.
// At 7:30 am Melbourne you hear about the ones starting today, and the ones ending today.
export function savedReminders(data, savedIds, nowMs, world = []) {
  const today = new Date(nowMs).toISOString().slice(0, 10), out = [];
  const byId = new Map((data.events || []).map(e => [String(e.id), { ...e, page: e.sourceUrl }]));
  for (const w of world) if (w && w.id && w.start) byId.set(String(w.id), { id: w.id, t: w.name, s: w.start + "T00:00", e: (w.end || w.start) + "T23:59", page: ((w.sources || []).find(x => x && /leekduck|pokemongo/.test(x.url || "")) || {}).url });
  for (const sid of savedIds) {
    const id = String(sid).replace(/^cur:/, ""), e = byId.get(id); if (!e || !e.s) continue;
    const s = e.s.slice(0, 10), en = (e.e || e.s).slice(0, 10), timed = !/T00:00/.test(e.s);
    const long = Date.parse(en + "T00:00Z") - Date.parse(s + "T00:00Z") > 864e5 || (e.e && Date.parse(e.e.slice(0, 16) + "Z") - Date.parse(e.s.slice(0, 16) + "Z") > 24 * 36e5);
    if (timed && !long) continue; // covered by the "starting soon" ping
    if (s === today) out.push({ key: "start:" + id + ":" + s, title: e.t, text: "🔔 Starts today: " + e.t + (en !== s ? " (until " + en.slice(5) + ")" : ""), link: id.startsWith("w-") ? id : "cur:" + id, page: e.page });
    else if (en === today && s < today) out.push({ key: "end:" + id + ":" + en, title: e.t, text: "⏳ Last day: " + e.t + " ends today", link: id.startsWith("w-") ? id : "cur:" + id, page: e.page });
  }
  return out;
}
// A reminder you set for one event ("pref:lead:<id>" = minutes before, or "off"). All-day events count as starting at 8 am.
// It is sent at the first hourly run after that moment (outside quiet hours) while the event has not yet started.
export function leadReminders(data, world, saved, leads, nowMs, venue = [], realNow = Date.now()) {
  const byId = new Map((data.events || []).map(e => [String(e.id), { t: e.t, s: e.s, e: e.e, page: e.sourceUrl }]));
  for (const w of world) if (w && w.id && w.start) byId.set(String(w.id), { t: w.name, s: w.start + "T00:00", e: (w.end || w.start) + "T23:59", page: ((w.sources || []).find(x => x && /leekduck|pokemongo/.test(x.url || "")) || {}).url });
  const out = [];
  for (const sid of saved) {
    const id = String(sid).replace(/^cur:/, ""), mins = Number(leads[sid] ?? leads[id]); const e = byId.get(id);
    if (!e || !e.s || !(mins > 0)) continue;
    // An in-person event with real venue times (Night Out): one reminder per city, when its rewards and bonuses start, in your time.
    const vs = venueFor(e.t, e.s.slice(0, 10), (e.e || e.s).slice(0, 10), venue);
    if (vs.length) {
      for (const v of vs) {
        const at = v.ms, left = Math.max(10, Math.round((at - realNow) / 300000) * 5), d = describeVenue(v);
        if (at - mins * 60000 <= realNow && at > realNow) out.push({ key: "lead:" + v.id + ":" + mins, title: v.name, link: id.startsWith("w-") ? id : "cur:" + id, page: v.link,
          text: "🔔 " + v.name + "\nRewards and bonuses start " + (mins >= 1440 ? "tomorrow" : "in about " + (left >= 90 ? Math.round(left / 60) + " h" : left + " min")) + " · " + d.show + " your time" + (d.note ? " (" + d.note + ")" : "") });
      }
      continue;
    }
    const m = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)/.exec(e.s); if (!m) continue;
    const startMs = Date.parse(m[1] + "T" + (m[2] === "00" && m[3] === "00" ? "08:00" : m[2] + ":" + m[3]) + ":00Z");
    const dueMs = startMs - mins * 60000;
    if (dueMs <= nowMs && startMs > nowMs) out.push({ key: "lead:" + id + ":" + mins + ":" + e.s, title: e.t, text: "🔔 " + e.t + "\nRewards and bonuses start " + (mins >= 1440 ? "tomorrow" : "in about " + Math.round(Math.max(10, (startMs - nowMs) / 60000) / 5) * 5 + " min"), link: id.startsWith("w-") ? id : "cur:" + id, page: e.page });
  }
  return out;
}
export async function runSaved(env, opts = {}) {
  const f = routed(env, "events", opts.fetch || fetch), nowMs = melbourneNow(opts.now || new Date());
  const morning = new Date(nowMs).getUTCHours() === 7 || opts.force;
  const rows = await userstate.readAll(env.DB, 0, "").catch(() => ({}));
  const ids = Object.keys(rows).filter(k => k.startsWith("saved:") && rows[k].v === true).map(k => k.slice(6));
  if (!ids.length) return { sent: [], note: "nothing saved" };
  const state = await getState(env.DB, "saved", { sent: [] });
  const world = await env.ASSETS.fetch(new Request(APP + "/world-events.json")).then(r => r.ok ? r.json() : {}).then(j => j.events || []).catch(() => []);
  const data = await siteData(env), leads = {};
  const details = await env.ASSETS.fetch(new Request(APP + "/event-details.json")).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  for (const k of Object.keys(rows)) if (k.startsWith("pref:lead:") && rows[k].v) leads[k.slice(10)] = rows[k].v === "off" ? -1 : rows[k].v;
  const off = new Set(Object.keys(leads).filter(k => leads[k] === -1).map(k => k.replace(/^cur:/, "")));
  const lead = quiet(nowMs) ? [] : leadReminders(data, world, ids, leads, nowMs, venueItems(details), (opts.now || new Date()).getTime());
  const todo = (morning ? savedReminders(data, ids, nowMs, world).filter(r => !off.has(r.key.split(":")[1])) : []).concat(lead).filter(r => !(state.sent || []).includes(r.key));
  if (!todo.length) return { sent: [], note: "nothing today" };
  if (opts.dry || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { sent: [], would: todo.map(t => t.text) };
  const sent = [];
  for (const r of todo) {
    const text = r.text + "\n" + APP + "/#event=" + encodeURIComponent(r.link), image = await eventImage(r.page, opts.pageFetch || fetch);
    let ok = false;
    if (image) ok = await tg(env, "sendPhoto", { photo: image, caption: text.slice(0, 1000) }, f); // the event's own picture, with the reminder as its caption
    if (!ok) ok = await tg(env, "sendMessage", { text, disable_web_page_preview: true }, f);
    if (ok) { state.sent = [...(state.sent || []), r.key].slice(-300); sent.push(r.key); }
  }
  if (sent.length) await setState(env.DB, "saved", state);
  return { sent };
}

// New pictures in the Discord channel go straight to Telegram, without waiting for the GitHub infographic check.
// Needs the Worker secrets DISCORD_TOKEN and CHANNEL_ID. The first run only notes where the channel is up to.
// Which Telegram message each forwarded Discord picture became, so the later suggestion step can edit it instead of sending a second one.
export async function discordSent(env) { return getState(env.DB, "discord_msgs", {}); }
export async function runDiscord(env, opts = {}) {
  const f = routed(env, "pictures", opts.fetch || fetch);
  if (!env.DISCORD_TOKEN || !env.CHANNEL_ID) return { sent: [], note: "Discord is not set up on the Worker" };
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { sent: [], note: "Telegram is not set up" };
  const state = await getState(env.DB, "discord", { last: "" });
  const q = state.last ? "limit=30&after=" + encodeURIComponent(state.last) : "limit=1";
  const r = await f("https://discord.com/api/v10/channels/" + encodeURIComponent(env.CHANNEL_ID) + "/messages?" + q, { headers: { authorization: "Bot " + env.DISCORD_TOKEN, "user-agent": "go-field-notes (https://pogo.michaelpuff.com, 1)" } });
  if (!r.ok) throw new Error("Discord answered HTTP " + r.status);
  const msgs = (await r.json()).filter(m => m && /^\d+$/.test(String(m.id))).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  if (!msgs.length) return { sent: [], note: "nothing new" };
  const last = msgs[msgs.length - 1].id;
  if (!state.last) { await setState(env.DB, "discord", { last }); return { sent: [], note: "starting point noted" }; }
  const sent = [], ids = await getState(env.DB, "discord_msgs", {}), stuck = state.stuck || {};
  const post = (method, body) => f("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async x => (x.ok ? ((await x.json().catch(() => null)) || {}).result || {} : null)).catch(() => null);
  // The cursor only moves past a message once it was handled. A picture Telegram refuses is tried again next hour (3 tries, then skipped),
  // and a busy channel is worked through 10 pictures per run instead of dropping the older ones.
  let cursor = state.last, handled = 0, blocked = null;
  for (const m of msgs) {
    if (handled >= 10) break;
    const { url, text: raw } = discordPicture(m);
    if (url) {
      const id = "discord:" + m.id, text = String(raw).replace(/\s+/g, " ").trim().slice(0, 300), caption = ("New on Discord" + (text ? ": " + text : "") + "\nSuggested events will appear on this message.").slice(0, 900), reply_markup = keyboard({ id, guesses: [] }, [], APP);
      let ok = await post("sendPhoto", { chat_id: env.TELEGRAM_CHAT_ID, photo: url, caption, reply_markup });
      if (!ok) ok = await post("sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text: (caption.split("\nSuggested")[0] + "\n" + url + "\nSuggested events will appear on this message.").slice(0, 3900), reply_markup }); // Telegram refused the picture itself (too big, odd shape): send the link instead
      if (ok) { sent.push(id); if (ok.message_id) ids[id] = ok.message_id; }
      else { const n = (stuck.id === m.id ? stuck.n : 0) + 1; if (n < 3) { blocked = { id: m.id, n }; break; } }
      handled++;
    }
    cursor = m.id;
  }
  const keep = Object.fromEntries(Object.entries(ids).slice(-100));
  await setState(env.DB, "discord_msgs", keep);
  await setState(env.DB, "discord", { last: cursor, stuck: blocked || {} });
  return blocked ? { sent, note: "Telegram refused " + blocked.id + " (try " + blocked.n + " of 3); will retry next hour" } : { sent };
}
// The first picture in a Discord message. Forwarded and crossposted posts keep their media under message_snapshots, and some posts carry it only as an embed thumbnail.
export function discordPicture(m) {
  const parts = [m, ...(((m && m.message_snapshots) || []).map(s => s && s.message).filter(Boolean))];
  for (const p of parts) {
    const img = (p.attachments || []).find(a => a && (/^image\//.test(a.content_type || "") || /\.(png|jpe?g|webp)(\?|$)/i.test(a.url || "")));
    const url = img ? img.url : ((p.embeds || []).map(e => e && ((e.image && e.image.url) || (e.thumbnail && e.thumbnail.url))).find(Boolean) || "");
    if (url) return { url, text: String(m.content || p.content || "") };
  }
  return { url: "", text: "" };
}

// Watchdog. The importer, store watch, site check and the rest run as GitHub scheduled jobs, so nothing inside GitHub can tell you they
// stopped. This runs on the Worker's own cron instead: it looks at when GitHub last started ANY scheduled run and tells you once when
// that is more than 3 hours ago (the site check alone should fire every 15 minutes), and once more when they are back.
export const WATCHDOG_HOURS = 3;
export function scheduleStatus(runs, nowMs, hours = WATCHDOG_HOURS) {
  const last = (runs || []).map(r => Date.parse(r && r.created_at)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  return { last: last ? new Date(last).toISOString() : null, stale: !last || nowMs - last > hours * 36e5 };
}
export async function runWatchdog(env, opts = {}) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { note: "Telegram is not set up" };
  const f = routed(env, "system", opts.fetch || fetch), now = opts.now || new Date();
  const headers = { accept: "application/vnd.github+json", "user-agent": "go-field-notes-watchdog" };
  if (env.GITHUB_TOKEN) headers.authorization = "Bearer " + env.GITHUB_TOKEN;
  const r = await f("https://api.github.com/repos/" + (env.GITHUB_REPO || "Wood468/crispy-barnacle") + "/actions/runs?event=schedule&per_page=5", { headers });
  if (!r.ok) return { note: "GitHub answered HTTP " + r.status + ", so not judging" };
  const s = scheduleStatus(((await r.json()) || {}).workflow_runs, now.getTime());
  const state = await getState(env.DB, "watchdog", { alerted: false });
  if (s.stale && !state.alerted) {
    const since = s.last ? "The last one started " + new Date(s.last).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + "." : "None has started yet.";
    const text = "⚠️ GitHub's scheduled jobs have stopped. " + since + "\nImporter, store watch, site check and health check are paused. In the repo's Actions tab, check scheduled workflows are on, then run one by hand.";
    if (opts.dry || !(await tg(env, "sendMessage", { text, disable_web_page_preview: true }, f))) return { alerted: false, would: text };
    await setState(env.DB, "watchdog", { alerted: true, at: now.toISOString() });
    return { alerted: true };
  }
  if (!s.stale && state.alerted) {
    if (!opts.dry && await tg(env, "sendMessage", { text: "✅ GitHub's scheduled jobs are running again.", disable_web_page_preview: true }, f)) await setState(env.DB, "watchdog", { alerted: false });
    return { recovered: true };
  }
  return { stale: s.stale, last: s.last };
}

// Last chance: store items you ticked in the Purchase planner ("pref:buy:<item>" = "plan", not "bought") that end within the next 6 hours.
// The end time is the watcher's estimate in /store-log.json. One message per item per day; items you marked bought stay quiet.
export const STORE = "https://store.pokemongo.com";
export function lastChance(log, marks, nowMs, hours = 6) {
  const out = [];
  for (const i of (log && log.items) || []) {
    if (i.goneAt || !i.endsAt) continue;
    const end = Date.parse(i.endsAt), left = end - nowMs;
    if (!(left > 0 && left <= hours * 36e5) || marks["pref:buy:" + i.slug] !== "plan") continue;
    const h = Math.round(left / 36e5), when = left < 36e5 ? "in under an hour" : "in about " + h + (h === 1 ? " hour" : " hours");
    out.push({ key: "last:" + i.slug + ":" + String(i.endsAt).slice(0, 10), text: "⏳ Last chance: " + i.name + " ends " + when + ". It is on your buying list.\n" + STORE + (i.href || "") });
  }
  return out;
}
export async function runLastChance(env, opts = {}) {
  const f = routed(env, "changes", opts.fetch || fetch), nowMs = (opts.now || new Date()).getTime();
  const log = await env.ASSETS.fetch(new Request(APP + "/store-log.json")).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!log) return { sent: [], note: "no store log" };
  const rows = await userstate.readAll(env.DB, 0, "").catch(() => ({}));
  const marks = {};
  for (const k of Object.keys(rows)) if (k.startsWith("pref:buy:")) marks[k] = rows[k].v;
  const state = await getState(env.DB, "lastchance", { sent: [] });
  const todo = lastChance(log, marks, nowMs).filter(x => !(state.sent || []).includes(x.key));
  if (!todo.length) return { sent: [], note: "nothing you planned is ending soon" };
  if (opts.dry || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { sent: [], would: todo.map(t => t.text) };
  const sent = [];
  for (const x of todo) if (await tg(env, "sendMessage", { text: x.text, disable_web_page_preview: true }, f)) { state.sent = [...(state.sent || []), x.key].slice(-100); sent.push(x.key); }
  if (sent.length) await setState(env.DB, "lastchance", state);
  return { sent };
}

// Called every hour at :30 UTC by the cron trigger.
export async function runHourly(env, when = new Date()) {
  const out = {}, utcDay = when.getUTCDay(), utcHour = when.getUTCHours();
  try { out.saved = await runSaved(env, { now: when }); } catch (e) { out.saved = { error: String(e && e.message || e) }; }
  try { out.discord = await runDiscord(env); } catch (e) { out.discord = { error: String(e && e.message || e) }; }
  try { out.soon = await runSoon(env, { now: when }); } catch (e) { out.soon = { error: String(e && e.message || e) }; }
  try { out.lastChance = await runLastChance(env, { now: when }); } catch (e) { out.lastChance = { error: String(e && e.message || e) }; }
  try { out.watchdog = await runWatchdog(env, { now: when }); } catch (e) { out.watchdog = { error: String(e && e.message || e) }; }
  if (utcDay === 0 && utcHour === 20) { try { out.weekly = await runWeekly(env, { now: when }); } catch (e) { out.weekly = { error: String(e && e.message || e) }; } }
  try { await setState(env.DB, "heartbeat", { at: new Date().toISOString(), failed: Object.keys(out).filter(x => out[x] && out[x].error), discord: out.discord ? String(out.discord.error ? "error: " + out.discord.error : (out.discord.sent && out.discord.sent.length ? "sent " + out.discord.sent.length : out.discord.note || "nothing sent")).slice(0, 120) : "" }); } catch { /* best effort */ }
  return out;
}
export const heartbeat = env => getState(env.DB, "heartbeat", null);
