// Synced personal state (Phase 4): form marks, saved events, followed Pokémon, preferences.
// One row per entry; the newest timestamp wins per entry, so a phone and a laptop never overwrite each other wholesale.
export const KEY_RE = /^(form|costume|saved|follow|pref|goal|import|hide|hidekind|mega):[^\u0000-\u001f]{1,100}$/;
export const MAX_ENTRIES = 5000, MAX_PER_REQUEST = 500, MAX_VALUE = 600;
export const MAX_READ_KEYS = 50;

export async function stateReady(db) {
  try { return !!(await db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='user_state'").first()); } catch { return false; }
}

// GET /api/userstate accepts repeated ?key=<entry-key> parameters for a bounded,
// targeted read. Keep the full incremental read as the default for existing sync clients.
export function cleanReadKeys(raw) {
  if (!Array.isArray(raw) || !raw.length) return { keys: [], error: "empty" };
  const keys = [...new Set(raw)];
  if (keys.length > MAX_READ_KEYS) return { keys: [], error: "too_many" };
  if (keys.some(k => typeof k !== "string" || !KEY_RE.test(k))) return { keys: [], error: "invalid" };
  return { keys, error: null };
}

// Returns {entries, rejected}. Keeps only well-formed entries; never throws on bad input.
export function cleanEntries(body, now) {
  const src = body && typeof body === "object" && body.entries && typeof body.entries === "object" && !Array.isArray(body.entries) ? body.entries : {};
  const entries = {}, rejected = [];
  for (const k of Object.keys(src).slice(0, MAX_PER_REQUEST)) {
    const e = src[k];
    if (!KEY_RE.test(k) || !e || typeof e !== "object" || !Number.isFinite(e.t)) { rejected.push(k); continue; }
    let v = e.v === undefined ? null : e.v;
    const s = v === null ? null : JSON.stringify(v);
    if (s !== null && s.length > MAX_VALUE) { rejected.push(k); continue; }
    entries[k] = { v: s, t: Math.max(0, Math.min(Math.floor(e.t), now + 60000)) };
  }
  if (Object.keys(src).length > MAX_PER_REQUEST) rejected.push("(over " + MAX_PER_REQUEST + " entries in one request)");
  return { entries, rejected };
}

// Each signed-in person's keys are stored with a "u<id>|" prefix, so they never mix with yours (the owner has no prefix).
// uid is "" for the owner, or "u<id>".
const pre = uid => (uid && uid !== "me" ? uid + "|" : "");
const mine = uid => pre(uid) ? { sql: "k LIKE ?", arg: pre(uid) + "%" } : { sql: "k NOT GLOB ?", arg: "u[0-9]*|*" };
export async function readAll(db, since = 0, uid = "") {
  const w = mine(uid), p = pre(uid);
  const rows = (await db.prepare("SELECT k, v, t FROM user_state WHERE t > ? AND " + w.sql + " ORDER BY t LIMIT 6000").bind(since, w.arg).all()).results;
  const out = {};
  for (const r of rows) { let v = null; try { v = r.v === null ? null : JSON.parse(r.v); } catch { /* skip bad json */ } out[r.k.slice(p.length)] = { v, t: r.t }; }
  return out;
}

// Fetch only the requested keys. Account scoping is applied in SQL as well as by
// exact bound key values, so a member cannot ask for another member's prefixed row.
// Tombstones (v = NULL) are retained exactly like readAll().
export async function readKeys(db, keys, since = 0, uid = "") {
  const selection = cleanReadKeys(keys);
  if (selection.error) throw new TypeError("Invalid user-state key selection");
  const w = mine(uid), p = pre(uid), stored = selection.keys.map(k => p + k);
  const placeholders = stored.map(() => "?").join(", ");
  const sql = "SELECT k, v, t FROM user_state WHERE t > ? AND " + w.sql + " AND k IN (" + placeholders + ") ORDER BY t";
  const rows = (await db.prepare(sql).bind(since, w.arg, ...stored).all()).results;
  const wanted = new Set(stored), out = {};
  for (const r of rows) {
    if (!wanted.has(r.k)) continue;
    let v = null;
    try { v = r.v === null ? null : JSON.parse(r.v); } catch { /* skip bad json */ }
    out[r.k.slice(p.length)] = { v, t: r.t };
  }
  return out;
}

// Upserts only when the incoming entry is newer than what is stored (ties keep the stored one).
export async function writeEntries(db, entries, uid = "") {
  const keys = Object.keys(entries), p = pre(uid), w = mine(uid);
  if (!keys.length) return { applied: 0, ignored: 0 };
  const have = (await db.prepare("SELECT COUNT(*) AS n FROM user_state WHERE " + w.sql).bind(w.arg).first()).n;
  let applied = 0, ignored = 0, room = MAX_ENTRIES - have;
  const stmts = [];
  for (const key of keys) {
    const k = p + key;
    const cur = await db.prepare("SELECT t FROM user_state WHERE k = ?").bind(k).first();
    if (cur) { if (entries[key].t <= cur.t) { ignored++; continue; } }
    else { if (room <= 0) { ignored++; continue; } room--; }
    stmts.push(db.prepare("INSERT INTO user_state (k, v, t) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, t = excluded.t WHERE excluded.t > user_state.t").bind(k, entries[key].v, entries[key].t));
    applied++;
  }
  if (stmts.length) await db.batch(stmts);
  return { applied, ignored };
}
