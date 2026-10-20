// Phase 1 source pipeline: discover -> extract and normalise -> verify and deduplicate -> store with history.
// Pure functions (normaliseEvent, validateFeed, findConflicts, resolveStatus, sourceHealth) plus small D1 helpers.
// Nothing here runs unless the Worker calls it, and nothing here touches the existing dex / datamine tables.
import { MIGRATIONS } from "./migrations.js";

const HOUR = 3600000, DAY = 86400000;
export const OFFICIAL_HOSTS = ["pokemongolive.com", "www.pokemongolive.com", "niantic.helpshift.com"];
export const TIER = { official_confirmed: 3, community_reported: 2, datamined: 1 };
export const LEEKDUCK = {
  id: "leekduck", name: "Leek Duck (via ScrapedDuck)", kind: "community", defaultStatus: "community_reported", minItems: 10,
  url: "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json",
  updatedUrl: "https://api.github.com/repos/bigfoott/ScrapedDuck/commits/data",
  terms: "ScrapedDuck data is provided by LeekDuck.com with permission; apps must credit both, stay free and carry no ads. Files are cached by GitHub for 5 minutes.",
};
export const CURATED = {
  id: "curated", name: "Hand-curated (data.json)", kind: "curated", defaultStatus: "community_reported", minItems: 1,
  url: "/data.json", terms: "Entered by hand from public posts. Kept as the fallback and cross-check.",
};

// ---------------------------------------------------------------- trust

export function resolveStatus(defaultStatus, evidence) {
  if (evidence && evidence.kind === "official" && typeof evidence.url === "string") {
    let u = null; try { u = new URL(evidence.url); } catch { /* not a URL */ }
    if (u && u.protocol === "https:" && OFFICIAL_HOSTS.includes(u.hostname)) return "official_confirmed";
  }
  return defaultStatus === "official_confirmed" ? "community_reported" : defaultStatus; // official needs evidence, not just a label
}
export const isAnnounced = (status) => status === "official_confirmed" || status === "community_reported";

// ---------------------------------------------------------------- normalise

const WHEN = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?(Z)?$/;
export function parseWhen(raw) {
  if (raw == null || raw === "") return null;
  const m = WHEN.exec(String(raw));
  if (!m) return { bad: true };
  const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || "00"}Z`);
  return Number.isNaN(ms) ? { bad: true } : { ms, utc: !!m[7] };
}

const REGIONAL_TYPES = /^(wild-area|pokemon-go-tour|pokemon-go-fest|safari-zone|city-safari|live-event|location-specific|ticketed-event|ticketed)$/;
function regionOf(type, name, mode) {
  if (REGIONAL_TYPES.test(type)) {
    const m = /:\s*(.+?)(?:\s+\d{4})?\s*$/.exec(name || "");
    const label = m ? m[1].trim() : null;
    if (label && /(^|[-–]\s*)(global|worldwide)$/i.test(label)) return { scope: "worldwide_local", region: "Global" };
    if (label) return { scope: "regional", region: label };
  }
  return { scope: mode === "utc" ? "worldwide_simultaneous" : "worldwide_local", region: null };
}

function dexFromImage(url) {
  if (typeof url !== "string") return {};
  let m = /pokemon_icon_(\d+)_(\w+?)(_shiny)?\.png/.exec(url);
  if (m) return { dex: +m[1], form: /^\d+$/.test(m[2]) ? String(+m[2]) : m[2], shiny: !!m[3] };
  m = /\/pm(\d+)(?:\.f([A-Za-z0-9_]+))?(\.s)?\.icon/.exec(url);
  if (m) return { dex: +m[1], form: m[2] || "0", shiny: !!m[3] };
  return {};
}
const clean = (s) => String(s == null ? "" : s).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

export function extractFeatured(extra) {
  const out = [], seen = new Set();
  const add = (o, role, shiny) => {
    if (!o || typeof o.name !== "string") return;
    const d = dexFromImage(o.image);
    const e = { name: clean(o.name), role };
    if (d.dex) { e.dex = d.dex; e.form = String(d.form); }
    e.shiny = shiny === true || d.shiny === true;
    if (o.canBeShiny === true) e.canBeShiny = true;
    const k = role + "|" + e.name + "|" + (e.form || "");
    if (!seen.has(k)) { seen.add(k); out.push(e); }
  };
  const x = extra && typeof extra === "object" ? extra : {};
  const rb = x.raidbattles || {};
  (rb.bosses || []).forEach((o) => add(o, "raid_boss"));
  (rb.shinies || []).forEach((o) => add(o, "shiny_form", true));
  const cdy = x.communityday || {};
  (cdy.spawns || []).forEach((o) => add(o, "spawn"));
  (cdy.shinies || []).forEach((o) => add(o, "shiny_form", true));
  if (x.spotlight) add(x.spotlight, "spotlight");
  if (x.breakthrough) add(x.breakthrough, "breakthrough");
  (x.curatedFeatured || []).forEach((o) => add(o, "featured"));
  return out;
}
// Some events (Max Battle days, Raid/Spotlight Hours) carry no structured Pokémon, only the title. Names read from a title are
// labelled role "title" so they are never mistaken for the source's own structured data.
export function featuredFromTitle(name, type) {
  let m, list = [];
  if (/^(max-battles|max-mondays)$/.test(type) && (m = /^(?:Dynamax|Gigantamax)\s+(.+?)(?:\s+(?:during|Max Battle).*)?$/i.exec(name))) list = m[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/i);
  else if (/^(raid-hour|pokemon-spotlight-hour)$/.test(type) && (m = /^(.+?)\s+(?:Raid|Spotlight)\s+Hour$/i.exec(name))) list = [m[1]];
  return list.map((n) => n.trim()).filter((n) => n && n.length < 40).map((n) => ({ name: n, role: "title", shiny: false }));
}
export function extractBonuses(extra) {
  const x = extra && typeof extra === "object" ? extra : {};
  const out = [];
  for (const b of (x.communityday && x.communityday.bonuses) || []) if (b && b.text) out.push(clean(b.text));
  if (x.spotlight && x.spotlight.bonus) out.push(clean(x.spotlight.bonus));
  return out.filter(Boolean);
}

function fnv(str) {
  let a = 0x811c9dc5, b = 0x01000193 ^ str.length;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x85ebca6b) >>> 0; }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
const safeLink = (l) => (typeof l === "string" && /^https:\/\/[^\s]+$/.test(l) ? l : null);

// Returns a row-shaped object (without status/first_seen/etc.) or null when the entry is malformed.
export function normaliseEvent(raw, source) {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.eventID, name = clean(raw.name), type = raw.eventType;
  if (typeof id !== "string" || !id || typeof type !== "string" || !type || !name) return null;
  const s = parseWhen(raw.start), e = parseWhen(raw.end);
  if ((s && s.bad) || (e && e.bad)) return null;
  const first = s || e;
  const mode = !first ? "unknown" : first.utc ? "utc" : "local";
  if (s && e && s.utc !== e.utc) return null; // mixed time bases are not trustworthy
  const o = { id: `${source.id}:${id}`, source_id: source.id, ext_id: id, kind: "event", type, name, link: safeLink(raw.link), image: safeLink(raw.image),
    start_raw: raw.start || null, end_raw: raw.end || null, tz_mode: mode, start_ms: null, end_ms: null, earliest: null, latest_end: null };
  if (mode === "utc") { o.start_ms = s ? s.ms : null; o.end_ms = e ? e.ms : null; o.earliest = s ? s.ms : e.ms; o.latest_end = e ? e.ms : s.ms + DAY; }
  if (mode === "local") { // a floating time can be any instant between UTC+14 and UTC-12
    o.earliest = s ? s.ms - 14 * HOUR : e.ms - 14 * HOUR;
    o.latest_end = (e ? e.ms : s.ms + DAY) + 12 * HOUR;
  }
  Object.assign(o, regionOf(type, name, mode));
  o.featured = extractFeatured(raw.extraData);
  if (!o.featured.length) o.featured = featuredFromTitle(name, type);
  o.bonuses = extractBonuses(raw.extraData);
  return o;
}

export const isExpired = (item, now) => item.latest_end != null && item.latest_end < now;

// ---------------------------------------------------------------- validate

// Decides whether a feed is trustworthy BEFORE anything is stored. Success of the HTTP request proves nothing.
export function validateFeed(raw, source, prevCount = 0) {
  if (!Array.isArray(raw)) return { ok: false, reason: "response is not a list of events" };
  const min = source.minItems ?? 1;
  if (raw.length < min) return { ok: false, reason: `only ${raw.length} entries (expected at least ${min})` };
  if (prevCount >= 10 && raw.length < prevCount * 0.5) return { ok: false, reason: `entries dropped from ${prevCount} to ${raw.length}` };
  const byId = new Map();
  let invalid = 0;
  for (const r of raw) {
    const n = normaliseEvent(r, source);
    if (!n) { invalid++; continue; }
    byId.set(n.id, { ...n, _raw: r }); // a repeated ID inside one feed keeps the last copy
  }
  if (invalid > raw.length * 0.2) return { ok: false, reason: `${invalid} of ${raw.length} entries were malformed` };
  const items = [...byId.values()];
  const undated = items.filter((i) => i.tz_mode === "unknown").length;
  if (undated > items.length * 0.3) return { ok: false, reason: `${undated} of ${items.length} entries have no dates` };
  if (items.length < min) return { ok: false, reason: `only ${items.length} usable entries` };
  return { ok: true, items, invalid, undated, total: raw.length };
}

// ---------------------------------------------------------------- health

export function sourceHealth(s, now, maxAge = 36 * HOUR) {
  if (!s || !s.last_checked) return { state: "never", note: "Not checked yet." };
  // A timestamp that is not a number, or is in the future, cannot be judged: say so rather than call the source fresh.
  const badTs = (t) => t != null && (!Number.isFinite(Number(t)) || Number(t) > now + 5 * 60 * 1000);
  if (badTs(s.last_checked) || badTs(s.last_ok) || badTs(s.source_updated)) return { state: "unknown", note: "A recorded time is invalid or in the future, so freshness cannot be judged." };
  if (!s.last_ok) return { state: "failing", note: s.last_error || "No successful check yet." };
  if (s.fail_streak >= 3 || now - s.last_ok > 4 * maxAge) return { state: "failing", note: s.last_error || "Repeated failures." };
  if (s.fail_streak > 0) return { state: "degraded", note: s.last_error || "Latest check failed." };
  if (now - s.last_ok > maxAge) return { state: "stale", note: "No good check for over " + Math.round(maxAge / HOUR) + " hours." };
  if (s.upcoming === 0) return { state: "stale", note: "Data is valid but every event has finished." };
  if (s.source_updated && now - s.source_updated > 14 * DAY) return { state: "stale", note: "Upstream has not updated for over 14 days." };
  return { state: "healthy", note: "Last check passed validation." };
}

// ---------------------------------------------------------------- conflicts

const STOP = new Set(["the", "a", "an", "in", "of", "and", "to", "for", "with", "during", "pokemon", "pokémon", "go"]);
const tokens = (n) => new Set(String(n).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter((t) => t && !STOP.has(t)));
function jaccard(a, b) { const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let i = 0; for (const t of A) if (B.has(t)) i++; return i / (A.size + B.size - i); }
const approxStart = (r) => { const w = parseWhen(r.start_raw); return w && !w.bad ? w.ms : null; };

export function sameEvent(a, b) {
  if (a.source_id === b.source_id) return false;
  const sa = approxStart(a), sb = approxStart(b);
  if (sa == null || sb == null || Math.abs(sa - sb) > 3 * DAY) return false;
  const j = jaccard(a.name, b.name);
  return ((a.type === b.type || a.type === "event" || b.type === "event") && j >= 0.5) || j >= 0.75; // hand-entered items are all typed "event"
}

export function diffFields(a, b) {
  const out = {};
  if (a.tz_mode === b.tz_mode) {
    const pairs = [["start", a.start_raw, b.start_raw], ["end", a.end_raw, b.end_raw]];
    for (const [f, x, y] of pairs) {
      const p = parseWhen(x), q = parseWhen(y);
      if (!p || !q || p.bad || q.bad) continue;
      const dateOnly = (w) => w.ms % DAY === 0 || (f === "end" && w.ms % DAY === 23 * HOUR + 59 * 60000); // "T00:00" / "T23:59" are placeholders for "that day"
      const differs = dateOnly(p) || dateOnly(q) ? String(x).slice(0, 10) !== String(y).slice(0, 10) : Math.abs(p.ms - q.ms) >= HOUR;
      if (differs) out[f] = [x, y];
    }
  }
  if (a.region && b.region && a.region.toLowerCase() !== b.region.toLowerCase()) out.region = [a.region, b.region];
  return out;
}

export function findConflicts(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    let a = rows[i], b = rows[j];
    if (!sameEvent(a, b)) continue;
    if (a.id > b.id) [a, b] = [b, a];
    const d = diffFields(a, b), f = Object.keys(d);
    if (f.length) out.push({ id: `${a.id}|${b.id}`, a_item: a.id, b_item: b.id, field: f[0], a_val: d[f[0]][0], b_val: d[f[0]][1], detail: d });
  }
  return out;
}

// ---------------------------------------------------------------- database

export async function migrate(db, now) {
  let done = new Set();
  try { done = new Set((await db.prepare("SELECT version FROM schema_migrations").all()).results.map((r) => r.version)); } catch { /* first run */ }
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    const stmts = m.sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n").split(";").map((s) => s.trim()).filter(Boolean);
    await db.batch([...stmts.map((s) => db.prepare(s)), db.prepare("INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").bind(m.version, m.name, now)]);
  }
}
export async function pipelineReady(db) {
  try { return !!(await db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='items'").first()); } catch { return false; }
}

async function upsertSource(db, src, now) {
  await db.prepare("INSERT INTO sources (id, name, url, kind, default_status, terms, last_checked) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, url = excluded.url, kind = excluded.kind, default_status = excluded.default_status, terms = excluded.terms, last_checked = excluded.last_checked")
    .bind(src.id, src.name, src.url, src.kind, src.defaultStatus, src.terms || null, now).run();
}
async function recordFailure(db, src, now, reason) {
  await upsertSource(db, src, now);
  await db.prepare("UPDATE sources SET fail_streak = fail_streak + 1, last_error = ? WHERE id = ?").bind(String(reason).slice(0, 300), src.id).run();
  return { ok: false, reason };
}

const FIELDS = ["name", "type", "link", "start_raw", "end_raw", "tz_mode", "scope", "region", "featured", "bonuses", "status"];
const short = (v) => (typeof v === "string" && v.length > 300 ? v.slice(0, 300) + "…" : v);
const COLS = ["id", "source_id", "ext_id", "kind", "type", "name", "link", "image", "start_raw", "end_raw", "tz_mode", "start_ms", "end_ms", "earliest", "latest_end", "scope", "region", "featured", "bonuses", "status", "evidence", "hash", "first_seen", "last_seen", "last_changed", "missing_since"];

export async function ingestFeed(db, src, raw, now, meta = {}) {
  await upsertSource(db, src, now);
  const prev = await db.prepare("SELECT last_count FROM sources WHERE id = ?").bind(src.id).first();
  const v = validateFeed(raw, src, (prev && prev.last_count) || 0);
  if (!v.ok) return recordFailure(db, src, now, v.reason);

  const existing = new Map((await db.prepare("SELECT * FROM items WHERE source_id = ?").bind(src.id).all()).results.map((r) => [r.id, r]));
  const stmts = [];
  const hist = (id, change, detail) => stmts.push(db.prepare("INSERT INTO item_history (item_id, at, change, detail) VALUES (?, ?, ?, ?)").bind(id, now, change, detail ? JSON.stringify(detail) : null));
  let created = 0, changed = 0, unchanged = 0, missing = 0, reappeared = 0;
  const seen = new Set();

  for (const n of v.items) {
    seen.add(n.id);
    const evidence = typeof src.evidenceFor === "function" ? src.evidenceFor(n._raw) : null;
    const row = { ...n, featured: JSON.stringify(n.featured), bonuses: JSON.stringify(n.bonuses), status: resolveStatus(src.defaultStatus, evidence) };
    delete row._raw;
    row.evidence = JSON.stringify({ listing: src.url, page: n.link, official: evidence || null, rawStart: n.start_raw, rawEnd: n.end_raw });
    row.hash = fnv(JSON.stringify(FIELDS.map((f) => row[f])));
    const old = existing.get(n.id);
    if (!old) {
      created++;
      Object.assign(row, { first_seen: now, last_seen: now, last_changed: now, missing_since: null });
      stmts.push(db.prepare(`INSERT INTO items (${COLS.join(", ")}) VALUES (${COLS.map(() => "?").join(", ")})`).bind(...COLS.map((c) => row[c] ?? null)));
      hist(n.id, "created", { type: row.type, start: row.start_raw, end: row.end_raw, status: row.status });
      continue;
    }
    if (old.missing_since != null) { reappeared++; hist(n.id, "reappeared", null); }
    if (old.hash === row.hash) {
      unchanged++;
      stmts.push(db.prepare("UPDATE items SET last_seen = ?, missing_since = NULL WHERE id = ?").bind(now, n.id));
      continue;
    }
    changed++;
    const diff = {};
    for (const f of FIELDS) if (old[f] !== row[f]) diff[f] = [short(old[f]), short(row[f])];
    hist(n.id, "changed", diff);
    const set = ["type", "name", "link", "image", "start_raw", "end_raw", "tz_mode", "start_ms", "end_ms", "earliest", "latest_end", "scope", "region", "featured", "bonuses", "status", "evidence", "hash"];
    stmts.push(db.prepare(`UPDATE items SET ${set.map((c) => c + " = ?").join(", ")}, last_seen = ?, last_changed = ?, missing_since = NULL WHERE id = ?`).bind(...set.map((c) => row[c] ?? null), now, now, n.id));
  }
  for (const [id, old] of existing) { // things that left the feed
    if (seen.has(id) || old.missing_since != null) continue;
    if (old.latest_end != null && old.latest_end < now) continue; // finished: leaving the feed is normal
    missing++;
    stmts.push(db.prepare("UPDATE items SET missing_since = ? WHERE id = ?").bind(now, id));
    hist(id, "missing", null);
  }
  const hash = fnv(v.items.map((i) => i.id + ":" + i.start_raw + i.end_raw + i.name).join("|"));
  const anyChange = created + changed + missing + reappeared > 0;
  stmts.push(db.prepare("UPDATE sources SET last_ok = ?, last_changed = CASE WHEN ? = 1 OR content_hash IS NOT ? THEN ? ELSE last_changed END, source_updated = COALESCE(?, source_updated), last_count = ?, last_invalid = ?, last_undated = ?, content_hash = ?, fail_streak = 0, last_error = NULL WHERE id = ?")
    .bind(now, anyChange ? 1 : 0, hash, now, meta.sourceUpdated || null, v.items.length, v.invalid, v.undated, hash, src.id));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return { ok: true, created, changed, unchanged, missing, reappeared, undated: v.undated, invalid: v.invalid, total: v.total };
}

export async function runSource(db, src, fetchFn, now, meta = {}) {
  let raw;
  try {
    const r = await fetchFn();
    if (!r.ok) return recordFailure(db, src, now, `HTTP ${r.status}`);
    try { raw = await r.json(); } catch { return recordFailure(db, src, now, "response was not valid JSON"); }
  } catch (e) {
    return recordFailure(db, src, now, "request failed: " + (e && e.message ? e.message : e));
  }
  return ingestFeed(db, src, raw, now, meta);
}

export async function detectConflicts(db, now) {
  const rows = (await db.prepare("SELECT * FROM items WHERE latest_end IS NULL OR latest_end >= ?").bind(now - 7 * DAY).all()).results;
  const found = findConflicts(rows);
  const open = new Map((await db.prepare("SELECT id FROM conflicts WHERE resolved_at IS NULL").all()).results.map((r) => [r.id, true]));
  const stmts = [];
  for (const c of found) {
    stmts.push(db.prepare("INSERT INTO conflicts (id, a_item, b_item, field, a_val, b_val, detail, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET field = excluded.field, a_val = excluded.a_val, b_val = excluded.b_val, detail = excluded.detail, last_seen = excluded.last_seen, resolved_at = NULL")
      .bind(c.id, c.a_item, c.b_item, c.field, String(c.a_val), String(c.b_val), JSON.stringify(c.detail), now, now));
    open.delete(c.id);
  }
  for (const id of open.keys()) stmts.push(db.prepare("UPDATE conflicts SET resolved_at = ? WHERE id = ?").bind(now, id));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return { open: found.length };
}

// ---------------------------------------------------------------- read side

const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

// Overall freshness of the EVENT feed, kept apart from each source's own times and from trust.
// Only times and failure counts go in: never a status, so freshness cannot change what an event is labelled.
//   lastSuccess = the newest time any live event feed passed validation (not "when the page loaded", not "when a check was attempted")
//   lastAttempt = the newest time any live event feed was checked, whether or not it worked
// The hand-curated snapshot has no feed, so it never counts as a refresh.
export function feedFreshness(sources, now, maxAge = 36 * HOUR) {
  const live = (sources || []).filter((s) => s && s.kind !== "curated" && s.kind !== "datamine");
  const ok = (t) => Number.isFinite(Number(t)) && t != null && Number(t) <= now + 5 * 60 * 1000;
  const succ = live.map((s) => s.lastOk).filter(ok).map(Number), att = live.map((s) => s.lastChecked).filter(ok).map(Number);
  const lastSuccess = succ.length ? Math.max(...succ) : null, lastAttempt = att.length ? Math.max(...att) : null;
  const invalid = live.some((s) => (s.lastOk != null && !ok(s.lastOk)) || (s.lastChecked != null && !ok(s.lastChecked)));
  const failing = live.filter((s) => s.failStreak > 0 || s.state === "failing").map((s) => s.id);
  let state, note;
  if (!live.length) { state = "none"; note = "No live event feed is connected."; }
  else if (invalid) { state = "unknown"; note = "A recorded time is invalid or in the future, so freshness cannot be judged."; }
  else if (lastSuccess == null) { state = "never"; note = lastAttempt == null ? "Not checked yet." : "Checked, but no refresh has passed validation yet."; }
  else if (failing.length === live.length) { state = "failed"; note = "The latest refresh failed. Showing data from the last good refresh."; }
  else if (now - lastSuccess > maxAge) { state = "stale"; note = "No good refresh for over " + Math.round(maxAge / HOUR) + " hours."; }
  else if (failing.length) { state = "degraded"; note = "One feed's latest check failed. Others are current."; }
  else { state = "fresh"; note = "Latest refresh passed validation."; }
  return { state, note, lastSuccess, lastAttempt, failing };
}

export async function listSources(db, now) {
  const rows = (await db.prepare("SELECT * FROM sources ORDER BY id").all()).results;
  const out = [];
  for (const s of rows) {
    const up = (await db.prepare("SELECT COUNT(*) n FROM items WHERE source_id = ? AND (latest_end IS NULL OR latest_end >= ?)").bind(s.id, now).first()).n;
    const dated = (await db.prepare("SELECT COUNT(*) n FROM items WHERE source_id = ? AND latest_end >= ?").bind(s.id, now).first()).n;
    const h = sourceHealth({ ...s, upcoming: dated }, now);
    out.push({ id: s.id, name: s.name, kind: s.kind, url: s.url, terms: s.terms, state: h.state, note: h.note, lastChecked: s.last_checked, lastOk: s.last_ok, lastChanged: s.last_changed, sourceUpdated: s.source_updated, count: s.last_count, invalid: s.last_invalid, undated: s.last_undated, failStreak: s.fail_streak, lastError: s.last_error, upcoming: up });
  }
  return out;
}

export async function listEvents(db, now, opts = {}) {
  const rows = (await db.prepare("SELECT * FROM items ORDER BY id").all()).results;
  const live = rows.filter((r) => opts.includePast || !isExpired(r, now)).filter((r) => opts.includeUndated || r.tz_mode !== "unknown" || opts.includePast);
  const conflicts = (await db.prepare("SELECT * FROM conflicts WHERE resolved_at IS NULL").all()).results;
  const inConflict = new Map();
  for (const c of conflicts) for (const id of [c.a_item, c.b_item]) inConflict.set(id, c);
  // group reports of the same event from different sources
  const parent = live.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) if (sameEvent(live[i], live[j])) parent[find(j)] = find(i);
  const groups = new Map();
  live.forEach((r, i) => { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  let events = [];
  for (const reps of groups.values()) {
    reps.sort((a, b) => (TIER[b.status] - TIER[a.status]) || (a.source_id === "leekduck" ? -1 : 0) || a.id.localeCompare(b.id));
    const p = reps[0];
    const conflicting = reps.some((r) => inConflict.has(r.id));
    const best = reps.reduce((m, r) => (TIER[r.status] > TIER[m] ? r.status : m), reps[0].status);
    events.push({
      id: p.id, name: p.name, type: p.type, start: p.start_raw, end: p.end_raw, tzMode: p.tz_mode, scope: p.scope, region: p.region,
      earliest: p.earliest, latestEnd: p.latest_end, image: p.image, featured: parseJ(p.featured, []), bonuses: parseJ(p.bonuses, []),
      status: conflicting ? "conflicting" : best, bestTier: best, announced: reps.some((r) => isAnnounced(r.status)),
      conflict: conflicting ? [...new Set(reps.filter((r) => inConflict.has(r.id)).map((r) => inConflict.get(r.id)))].map((c) => ({ field: c.field, a: c.a_item, b: c.b_item, aVal: c.a_val, bVal: c.b_val })) : null,
      missing: reps.every((r) => r.missing_since != null),
      reports: reps.map((r) => ({ source: r.source_id, status: r.status, link: r.link, start: r.start_raw, end: r.end_raw, region: r.region, firstSeen: r.first_seen, lastChecked: r.last_seen, lastChanged: r.last_changed, missingSince: r.missing_since })),
    });
  }
  if (opts.type) events = events.filter((e) => e.type === opts.type);
  events.sort((a, b) => (a.earliest ?? Infinity) - (b.earliest ?? Infinity) || a.name.localeCompare(b.name));
  return { events, sources: await listSources(db, now), openConflicts: conflicts.length };
}

export async function eventHistory(db, id) {
  return (await db.prepare("SELECT at, change, detail FROM item_history WHERE item_id = ? ORDER BY at, id").bind(id).all()).results.map((r) => ({ at: r.at, change: r.change, detail: parseJ(r.detail, null) }));
}

// ---------------------------------------------------------------- adapters

// data.json's hand-entered events, spotlight hours and raid hours, in the same shape as a Leek Duck feed.
export function curatedFeed(data) {
  const out = [];
  for (const e of (data && data.events) || []) out.push({ eventID: e.id, name: e.t, eventType: "event", link: "", start: e.s, end: e.e, extraData: { curatedFeatured: ((e.art) || []).filter((a) => a && a.n).map((a) => ({ name: a.n })) } });
  for (const s of (data && data.spotlight) || []) out.push({ eventID: "spot-" + s.d, name: s.n + " Spotlight Hour", eventType: "pokemon-spotlight-hour", link: "", start: s.d + "T18:00", end: s.d + "T19:00", extraData: { curatedFeatured: [{ name: s.n }] } });
  for (const r of (data && data.raidHour) || []) out.push({ eventID: "rh-" + r.d, name: r.n + " Raid Hour", eventType: "raid-hour", link: "", start: r.d + "T18:00", end: r.d + "T19:00", extraData: { curatedFeatured: [{ name: r.n }] } });
  return out;
}

export async function fetchLeekDuck(fetchFn) {
  const r = await fetchFn(LEEKDUCK.url, { headers: { "user-agent": "go-field-notes/1.0 (personal tracker; credit LeekDuck.com / ScrapedDuck)" } });
  return r;
}
export async function sourceUpdatedAt(fetchFn) { // best effort: when did upstream last publish?
  try {
    const r = await fetchFn(LEEKDUCK.updatedUrl, { headers: { "user-agent": "go-field-notes/1.0", accept: "application/vnd.github+json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const t = Date.parse(j && j.commit && j.commit.committer && j.commit.committer.date);
    return Number.isNaN(t) ? null : t;
  } catch { return null; }
}

// Full run used by the nightly job and POST /api/pipeline/run. Each source is independent: one failing never blocks another.
export async function runPipeline(db, now, fetchFn, data) {
  await migrate(db, now);
  const log = {};
  const upd = await sourceUpdatedAt(fetchFn);
  log.leekduck = await runSource(db, LEEKDUCK, () => fetchLeekDuck(fetchFn), now, { sourceUpdated: upd });
  log.curated = await ingestFeed(db, CURATED, curatedFeed(data), now);
  log.conflicts = await detectConflicts(db, now);
  return log;
}

// Dry run: fetches and validates but writes nothing anywhere. Safe to call against production data.
export async function preview(fetchFn, data, now) {
  const out = { at: now };
  let items = [];
  try {
    const r = await fetchLeekDuck(fetchFn);
    if (!r.ok) out.leekduck = { ok: false, reason: `HTTP ${r.status}` };
    else {
      const v = validateFeed(await r.json(), LEEKDUCK);
      out.leekduck = v.ok ? { ok: true, total: v.total, valid: v.items.length, invalid: v.invalid, undated: v.undated } : v;
      if (v.ok) {
        const types = {}; for (const i of v.items) types[i.type] = (types[i.type] || 0) + 1;
        out.leekduck.types = types;
        out.leekduck.utc = v.items.filter((i) => i.tz_mode === "utc").length;
        out.leekduck.local = v.items.filter((i) => i.tz_mode === "local").length;
        out.leekduck.regional = v.items.filter((i) => i.scope === "regional").map((i) => ({ name: i.name, region: i.region }));
        out.leekduck.upcoming = v.items.filter((i) => !isExpired(i, now) && i.tz_mode !== "unknown").length;
        out.leekduck.undatedNames = v.items.filter((i) => i.tz_mode === "unknown").map((i) => i.name);
        items = v.items.map(({ _raw, ...r2 }) => ({ ...r2, status: resolveStatus(LEEKDUCK.defaultStatus, null) }));
      }
    }
  } catch (e) { out.leekduck = { ok: false, reason: "request failed: " + (e && e.message ? e.message : e) }; }
  const cv = validateFeed(curatedFeed(data), CURATED);
  out.curated = cv.ok ? { ok: true, valid: cv.items.length } : cv;
  const cur = cv.ok ? cv.items.map(({ _raw, ...r2 }) => ({ ...r2, status: "community_reported" })) : [];
  out.conflicts = findConflicts([...items, ...cur].filter((r) => !isExpired(r, now))).map((c) => ({ a: c.a_item, b: c.b_item, field: c.field, aVal: c.a_val, bVal: c.b_val, fields: c.detail }));
  out.events = items.filter((i) => !isExpired(i, now) && i.tz_mode !== "unknown").sort((a, b) => (a.earliest ?? 0) - (b.earliest ?? 0)).slice(0, 80)
    .map((i) => ({ id: i.id, name: i.name, type: i.type, start: i.start_raw, end: i.end_raw, tzMode: i.tz_mode, scope: i.scope, region: i.region, featured: i.featured, bonuses: i.bonuses, link: i.link, status: i.status }));
  return out;
}
