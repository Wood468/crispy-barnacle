#!/usr/bin/env node
// Turns review-queue candidates into a proposed change: download the image, read its text (OCR),
// re-match it to an app event, and, only when the match is confident, stage it in public/ and event-info.json.
// Unsure candidates are left in the queue with their OCR text and reason. The workflow opens a pull request;
// nothing reaches main without the owner merging it.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matchEvent } from "./g47ix-review.mjs";

const DISCORD_FILE = process.env.DISCORD_FILE || "infographics.json";
const REG = process.env.REGISTRY_FILE || "data/g47ix-infographics-review.json";
const INFO = process.env.EVENT_INFO_FILE || "public/event-info.json";
const DATA = process.env.EVENTS_FILE || "public/data.json";
const QUEUE = process.env.QUEUE_FILE || "public/infographic-queue.json";
const WEEKLY = process.env.WEEKLY_FILE || "public/weekly.json";
const IMG_DIR = process.env.IMAGE_DIR || "public/infographics/g47ix";
const MAX_PER_RUN = +process.env.G47IX_MAX_PER_RUN || 60;
const MAX_BYTES = 6 * 1024 * 1024;
const HARD_MAX = 40 * 1024 * 1024; // above this the picture is refused; between 6 and 40 MB it is shrunk first
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function distinctiveTokens(title) {
  const stop = new Set(["pokemon", "pokémon", "event", "events", "raid", "raids", "battle", "battles", "day", "hour", "go", "the", "and", "in", "of", "2026"]);
  return String(title || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(t => t.length > 2 && !stop.has(t));
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
// Dates written in the picture ("13 Oct", "October 13th"), as month-day pairs.
export function datesIn(text) {
  const out = [], t = String(text || "").toLowerCase();
  const mon = "(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*";
  for (const m of t.matchAll(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+" + mon + "\\b", "g"))) out.push([MONTHS[m[2]], +m[1]]);
  for (const m of t.matchAll(new RegExp("\\b" + mon + "\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b", "g"))) out.push([MONTHS[m[1]], +m[2]]);
  return out.filter(([mo, d]) => mo >= 0 && d >= 1 && d <= 31);
}
function dateHit(ev, found) {
  if (!ev || !ev.s || !ev.e || !found.length) return false;
  const s = Date.parse(ev.s) - 864e5, e = Date.parse(ev.e) + 864e5, y = new Date(ev.s).getFullYear();
  return found.some(([mo, d]) => { const t = Date.UTC(y, mo, d, 12); return t >= s && t <= e; });
}
function monHit(ev, ocrText) {
  const names = (ev && ev.art || []).map(a => String(a.n || "").toLowerCase()).filter(n => n.length > 3);
  const hay = String(ocrText || "").toLowerCase();
  return names.filter(n => hay.includes(n));
}

// Decide from several independent signals. Auto-propose only when at least two different kinds of evidence agree
// (caption, name in the picture, a date in the picture inside the event window, a featured Pokémon in the picture,
// posted around the event) and the best event clearly beats the runner-up. Everything else goes to the owner's review list.
// Rotating 5-star, Mega and Shadow raid bosses can carry infographics too. Ids match raidSlots() in public/dash.js.
const slug = n => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export function raidSlots(rotation, now = Date.now()) {
  const out = [];
  for (const r of rotation || []) {
    if (new Date(r.e).getTime() < now - 7 * 864e5) continue;
    for (const [k, label] of [["five", "5-star raids"], ["mega", "Mega raids"], ["shadow", "Shadow raids"]]) {
      const boss = String(r[k] || "").replace(/, to .*/, "").trim(); if (!boss) continue;
      out.push({ id: "raid:" + slug(boss) + ":" + String(r.s).slice(0, 10), t: boss + (k === "five" ? " 5-star raids" : " raids"), s: r.s, e: r.e, kind: "raid" });
    }
  }
  return out;
}
// Stat cards and counter charts name a Pokémon but not an event. Suggest the current or coming events that feature it.
export function monGuesses(ocrText, events, now = Date.now()) {
  const hay = " " + String(ocrText || "").toLowerCase().replace(/[^a-z0-9é]+/g, " ") + " ";
  const out = [];
  for (const ev of events || []) {
    if (!ev || !ev.id || (ev.e && Date.parse(ev.e) < now - 3 * 864e5)) continue;
    const names = (ev.art || []).map(a => String(a.n || "").toLowerCase()).filter(n => n.length > 3);
    if (ev.kind === "raid") { const boss = String(ev.t || "").toLowerCase().replace(/ (5-star )?raids$/, "").replace(/^(mega|shadow|primal) /, ""); if (boss.length > 3) names.push(boss); }
    const hits = [...new Set(names.filter(n => hay.includes(" " + n.replace(/[^a-z0-9é]+/g, " ") + " ")))];
    if (!hits.length) continue;
    const live = ev.s && ev.e && Date.parse(ev.s) <= now + 864e5 && Date.parse(ev.e) >= now;
    out.push({ eventId: ev.id, eventTitle: ev.t || ev.title, score: Math.min(0.9, 0.3 + 0.15 * hits.length + (live ? 0.1 : 0) + (ev.kind === "raid" ? 0.05 : 0)), via: hits.slice(0, 2).join(", ") });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}
export function decide(candidate, ocrText, events) {
  const text = [candidate.title, ocrText].filter(Boolean).join(" ");
  const match = matchEvent({ title: text }, events);
  if (!match) {
    const g = monGuesses(text, events);
    return g.length ? { confident: false, match: null, guess: { ...g[0], alternatives: g }, score: 0, signals: [], reason: "No event name in the picture, but it shows " + g[0].via + ". Check these events." }
      : { confident: false, match: null, score: 0, signals: [], reason: "No event name found in the caption or image text." };
  }
  const ev = events.find(e => e.id === match.eventId);
  const need = distinctiveTokens(match.eventTitle);
  const hay = String(ocrText || "").toLowerCase();
  const hits = need.filter(t => hay.includes(t));
  const inImage = need.length ? hits.length / need.length : 0;
  const signals = [];
  let score = 0;
  if (candidate.title && matchEvent({ title: candidate.title }, [ev])) { signals.push("caption names the event"); score += 1; }
  if (inImage >= 0.5 && hits.length >= 1) { signals.push("picture text names the event"); score += inImage >= 0.8 ? 3 : 2; }
  if (dateHit(ev, datesIn(ocrText))) { signals.push("date in the picture is inside the event"); score += 2; }
  const ms = monHit(ev, ocrText); if (ms.length) { signals.push("shows " + ms.slice(0, 2).join(", ")); score += 1; }
  const pub = Date.parse(candidate.publishedAt || "");
  if (ev && ev.s && ev.e && Number.isFinite(pub) && pub >= Date.parse(ev.s) - 21 * 864e5 && pub <= Date.parse(ev.e) + 3 * 864e5) { signals.push("posted around the event"); score += 1; }
  const second = (match.alternatives || [])[1];
  const clear = !second || match.score - second.score >= 0.15;
  const confident = match.confidence === "high" && signals.length >= 2 && score >= 3 && clear && signals.some(x => /picture/.test(x));
  const reason = confident ? "Several signals agree: " + signals.join("; ") + "." :
    match.confidence !== "high" ? "Match is not strong enough (" + match.confidence + ")." :
    !clear ? "Two events look alike. Please choose." :
    signals.length < 2 ? "Only one signal agrees." : "The image text does not clearly name the event.";
  return { confident, match, event: ev, score, signals, reason };
}

export function addToEventInfo(info, event, graphic) {
  info.events = info.events || {};
  const title = String(event.t || event.title || "").toLowerCase();
  let key = Object.keys(info.events).find(k => k === event.id || (info.events[k].names || []).some(n => String(n).toLowerCase() === title));
  if (!key) {
    key = event.id;
    info.events[key] = { names: [event.t || event.title], source: { label: graphic.creator || "G47IX", trust: "community", url: graphic.sourceUrl, observed: graphic.observed }, tickets: [], info: [], infographics: [] };
  }
  const e = info.events[key];
  e.infographics = e.infographics || [];
  if (e.infographics.some(g => g.url === graphic.url)) return false;
  const who = graphic.creator || "G47IX";
  e.infographics.push({ label: "Infographic · " + who, url: graphic.url, source: who, sourceUrl: graphic.sourceUrl, alt: graphic.alt });
  return true;
}

// Discord mirror candidate -> registry candidate. The creator is only known if the owner names them (DISCORD_CREATOR);
// without it the image is never auto-proposed, so nobody is credited wrongly.
// The last months of the Discord channel (written just before this runs, because Discord picture links expire).
export function mergeHistory(reg, history, creator, now = Date.now()) {
  reg.candidates = reg.candidates || [];
  let added = 0;
  for (const d of (history && history.items) || []) {
    const dc = discordCandidate(d, creator); if (!dc) continue;
    const old = dc.publishedAt && now - Date.parse(dc.publishedAt) > 14 * 864e5;
    const have = reg.candidates.find(c => c.id === dc.id);
    if (have) { if (!have.ocrChecked && dc.imageUrl) have.imageUrl = dc.imageUrl; continue; } // fresh link for one not yet read
    if (old) dc.history = true;
    reg.candidates.push(dc); added++;
  }
  reg.candidates.sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
  return added;
}
export function discordCandidate(d, creator) {
  if (!d || !d.image_url || !d.message_id) return null;
  const caption = String(d.text || "").trim() || String(d.title || "").replace(/\.(png|jpe?g|webp)$/i, "").replace(/[_-]+/g, " ");
  return { id: "discord:" + d.message_id, source: "discord", creator: creator || "", title: caption, url: d.message_url || ("https://discord.com/channels/@me/" + d.channel_id + "/" + d.message_id), publishedAt: d.timestamp || null, imageUrl: d.image_url, reviewStatus: "needs_review", decision: "pending" };
}

async function download(url) {
  if (String(url).startsWith("local:")) { // a picture sent to the Telegram bot, saved by scripts/tg-inbox.mjs
    const file = String(url).slice(6), ext = (/\.(png|jpe?g|webp)$/i.exec(file) || [])[1];
    if (!ext || !file.startsWith("data/tg-inbox/") || file.includes("..")) throw new Error("Not a saved picture");
    const buf = await readFile(file); if (buf.length > HARD_MAX) throw new Error("Image larger than 40 MB");
    return fitSize(buf, ext.toLowerCase().replace("jpeg", "jpg"));
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "GO-Field-Notes-Infographic-Review/1.0" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const type = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!EXT[type]) throw new Error("Not a png, jpeg or webp image: " + type);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > HARD_MAX) throw new Error("Image larger than 40 MB");
  return fitSize(buf, EXT[type]);
}
// A picture over 6 MB used to be skipped, so it never got a suggestion. Now it is scaled down (still large enough to read).
function fitSize(buf, ext) {
  if (buf.length <= MAX_BYTES) return { buf, ext };
  const src = join(tmpdir(), "g47ix-huge." + ext), dst = join(tmpdir(), "g47ix-huge-out.webp");
  writeFileSync(src, buf);
  execFileSync("convert", [src, "-resize", "2400x4000>", "-quality", "85", dst], { timeout: 90000, stdio: "ignore" });
  const out = readFileSync(dst);
  if (!out.length || out.length > MAX_BYTES) throw new Error("Image larger than 6 MB even after shrinking");
  return { buf: out, ext: "webp" };
}
function ocr(file) {
  try { return execFileSync("tesseract", [file, "stdout", "-l", "eng", "--psm", "11"], { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return ""; }
}
// Older pictures are kept as smaller web images so three months of history does not bloat the site.
function shrink(buf, ext) {
  if (buf.length < 700 * 1024) return { buf, ext };
  try {
    const src = join(tmpdir(), "g47ix-big." + ext), dst = join(tmpdir(), "g47ix-small.webp");
    writeFileSync(src, buf);
    execFileSync("convert", [src, "-resize", "1400x1400>", "-quality", "82", dst], { timeout: 60000, stdio: "ignore" });
    const out = readFileSync(dst);
    return out.length && out.length < buf.length ? { buf: out, ext: "webp" } : { buf, ext };
  } catch { return { buf, ext }; }
}
const safeId = s => String(s).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60).toLowerCase();

// G47IX's weekly "what is on this week" picture and monthly overview (file named like OCT_CONTENT_G47IX.png). They are for the
// home page, not for one event, so they never go to the review list.
const MONTH_NAMES = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
export const isWeekly = c => /\bweekly\b/i.test(String(c && c.title || ""));
export const isMonthly = c => {
  const t = String((c && c.title) || "") + " " + String((c && c.imageUrl) || "").split("?")[0];
  return new RegExp("(?:^|[^a-z])(?:" + MONTH_NAMES + ")[ _-]*content", "i").test(t) || /\bmonthly\b/i.test(t);
};
export const isOverview = c => isWeekly(c) || isMonthly(c);
export function buildWeekly(reg, now = Date.now()) {
  const clean = t => String(t || "").replace(/^tr\s+/i, "").replace(/\s+/g, " ").trim().slice(0, 80);
  const pick = (test, days, max, kind, label) => (reg.candidates || []).filter(c => c.stagedPath && c.decision !== "rejected" && (c.overview === kind || (test(c) && !c.overview && Date.parse(c.publishedAt || "") > now - days * 864e5)))
    .sort((a, b) => (b.overview === kind) - (a.overview === kind) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, max)
    .map(c => ({ id: c.id, kind, title: kind === "month" ? label(c) : clean(c.title), image: c.stagedPath, post: c.url || "", publishedAt: c.publishedAt }));
  const monthName = c => { const m = String(c.title || "").concat(" ", String(c.imageUrl || "").split("?")[0]).match(new RegExp("(" + MONTH_NAMES + ")[ _-]*content", "i")); return m ? "Month overview: " + m[1].slice(0, 1).toUpperCase() + m[1].slice(1).toLowerCase() : "Month overview"; };
  // One picture per button: a picture you chose still comes first, and among those the newest wins, so a new one replaces the old instead of stacking behind it.
  const items = [...pick(isWeekly, 10, 1, "week"), ...pick(isMonthly, 40, 1, "month", monthName)];
  return { updated: new Date(now).toISOString(), items };
}

// World and in-person events (public/world-events.json) as the same shape the matcher reads. They are only ever used for suggestions a person confirms.
export function worldAsEvents(world) {
  return ((world && world.events) || []).filter(w => w && w.id && w.name).map(w => ({ id: w.id, t: w.name, s: (w.start || "") + "T00:00", e: (w.end || w.start || "") + "T23:59", p: [w.place || "", w.area || ""] }));
}
export function worldGuess(c, worldEvents) {
  const m = matchEvent({ title: [c.title, c.ocrText].filter(Boolean).join(" ") }, worldEvents);
  return m && m.score >= 0.5 && m.nameOverlap !== 0 ? { ...m, method: "picture text to world and in-person events", confidence: m.confidence } : null;
}

// A match made by reading the picture (the scheduled AI check writes c.aiMatch = [{ eventId, eventTitle }]) goes first and is never overwritten by the OCR matcher.
export function withAi(c, guesses) {
  const ai = (Array.isArray(c.aiMatch) ? c.aiMatch : []).filter(g => g && g.eventId).map(g => ({ eventId: String(g.eventId), eventTitle: String(g.eventTitle || g.eventId), score: 1 }));
  const ids = new Set(ai.map(g => g.eventId));
  return [...ai, ...guesses.filter(g => !ids.has(String(g.eventId)))];
}

// What the app's review list shows: pictures that still need a human decision, with the best guesses and why.
export function buildQueue(reg) {
  const items = (reg.candidates || []).filter(c => c.stagedPath && ["needs_review", "unmatched", "published"].includes(c.reviewStatus) && c.decision !== "rejected").map(c => ({
    linked: c.reviewStatus === "published",
    id: c.id, title: String(c.title || "").slice(0, 160), image: c.stagedPath, post: c.url || "", creator: c.creator || "", publishedAt: c.publishedAt || "",
    note: c.reviewNote || "", history: !!c.history, signals: c.signals || [], text: String(c.ocrText || "").slice(0, 200),
    guesses: withAi(c, (c.eventMatch && c.eventMatch.alternatives) || (c.eventMatch ? [{ eventId: c.eventMatch.eventId, eventTitle: c.eventMatch.eventTitle, score: c.eventMatch.score }] : []))
  }));
  return { updated: new Date().toISOString(), items };
}

async function main() {
  const reg = JSON.parse(await readFile(REG, "utf8"));
  const info = JSON.parse(await readFile(INFO, "utf8"));
  const dataJson = JSON.parse(await readFile(DATA, "utf8"));
  const events = [...(dataJson.events || []), ...raidSlots(dataJson.rotation)];
  let worldEvents = [];
  try { worldEvents = worldAsEvents(JSON.parse(await readFile(process.env.WORLD_FILE || "public/world-events.json", "utf8"))); } catch { /* optional */ }
  const proposed = [];
  try {
    const dc = discordCandidate(JSON.parse(await readFile(DISCORD_FILE, "utf8")), process.env.DISCORD_CREATOR || "");
    if (dc && !(reg.candidates || []).some(c => c.id === dc.id)) { reg.candidates = reg.candidates || []; reg.candidates.push(dc); }
  } catch { /* no Discord file yet */ }
  try { const n = mergeHistory(reg, JSON.parse(await readFile(process.env.DISCORD_HISTORY_FILE || "infographics-history.json", "utf8")), process.env.DISCORD_CREATOR || ""); if (n) console.log("History: " + n + " older pictures added for review."); } catch { /* no history this run */ }
  await mkdir(IMG_DIR, { recursive: true });
  for (const c of reg.candidates || []) { // read earlier, left without any suggestion: try the Pokémon-based guess
    if (!c.ocrChecked || c.eventMatch || c.decision === "rejected" || c.reviewStatus !== "unmatched") continue;
    const wg = worldGuess(c, worldEvents);
    if (wg) { c.eventMatch = wg; c.reviewStatus = "needs_review"; c.reviewNote = "The picture text matches a world or in-person event. Check it."; continue; }
    const g = monGuesses(c.ocrText, events); if (!g.length) continue;
    c.eventMatch = { ...g[0], alternatives: g }; c.reviewStatus = "needs_review"; c.reviewNote = "No event name in the picture, but it shows " + g[0].via + ". Check these events.";
  }
  let checked = 0;
  for (const c of reg.candidates || []) {
    if (!c.imageUrl || c.decision === "rejected" || ["proposed", "approved", "published"].includes(c.reviewStatus) || c.ocrChecked) continue;
    try {
      if (++checked > MAX_PER_RUN) break; // the rest wait for the next run
      const { buf, ext } = await download(c.imageUrl);
      const tmp = join(tmpdir(), "g47ix-" + safeId(c.id) + "." + ext);
      await writeFile(tmp, buf);
      const text = ocr(tmp).replace(/\s+/g, " ").trim();
      c.ocrChecked = true; c.ocrText = text.slice(0, 1500);
      const d = decide(c, text, events);
      if (c.history && d.confident) { d.confident = false; d.reason = "An older post: check the match yourself. " + d.reason; } // history is always for the owner to review
      c.eventMatch = d.match || d.guess || c.eventMatch || (!d.confident ? worldGuess({ ...c, ocrText: text }, worldEvents) : null) || null;
      c.reviewNote = d.reason; c.signals = d.signals || []; c.matchScore = d.score || 0;
      if (d.confident && c.source === "discord" && !c.creator) { d.confident = false; d.reason = "Creator not set. Set the DISCORD_CREATOR variable to credit the right person."; c.reviewNote = d.reason; }
      // Every checked picture is kept next to the site so it can be reviewed in the app, even when the match is unsure.
      const small = c.history ? shrink(buf, ext) : { buf, ext };
      const name = safeId(c.id) + "." + small.ext;
      await writeFile(join(IMG_DIR, name), small.buf);
      c.stagedPath = "/" + IMG_DIR.replace(/^public\//, "") + "/" + name;
      if (isOverview(c)) { c.reviewStatus = "weekly"; continue; } // shown on the home page instead
      if (!d.confident) { c.reviewStatus = d.match || d.guess || c.eventMatch ? "needs_review" : "unmatched"; continue; }
      const added = addToEventInfo(info, d.event, { url: c.stagedPath, sourceUrl: c.url, observed: new Date().toISOString().slice(0, 10), alt: (d.event.t || "Event") + " infographic", creator: c.creator });
      if (added) { c.reviewStatus = "proposed"; proposed.push(d.event.t + " ← " + c.url); }
    } catch (err) { c.reviewNote = "Could not check image: " + err.message; }
  }
  await writeFile(REG, JSON.stringify(reg, null, 2) + "\n");
  await writeFile(QUEUE, JSON.stringify(buildQueue(reg), null, 1) + "\n");
  await writeFile(WEEKLY, JSON.stringify(buildWeekly(reg), null, 1) + "\n");
  await writeFile(INFO, JSON.stringify(info, null, 2) + "\n");
  console.log(proposed.length ? "Proposed:\n" + proposed.join("\n") : "Nothing confident enough to propose.");
}
if (import.meta.url === "file://" + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
