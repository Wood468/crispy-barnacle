// Invite-only accounts. You (the owner, with the sync PIN) create invite codes; each invited person registers with an email and a
// password and gets their own private marks. Passwords are stored only as salted PBKDF2 hashes; sessions are random tokens held in an
// HttpOnly cookie and stored only as hashes. Events, infographics and everything public stay shared.
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const ITER = 100000; // the most the Workers runtime allows
export const COOKIE = "gofn_s", SESSION_DAYS = 30, INVITE_DAYS = 14;

export const validEmail = e => typeof e === "string" && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
export const validPassword = p => typeof p === "string" && p.length >= 10 && p.length <= 200;
export const normEmail = e => String(e || "").trim().toLowerCase();

export async function sha256(s) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
async function derive(pw, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
}
export async function hashPassword(pw, salt = crypto.getRandomValues(new Uint8Array(16)), iter = ITER) {
  return ["pbkdf2", iter, b64(salt), b64(await derive(pw, salt, iter))].join("$");
}
export async function verifyPassword(pw, stored) {
  const [kind, iter, salt, hash] = String(stored || "").split("$");
  if (kind !== "pbkdf2" || !salt || !hash) return false;
  const got = new Uint8Array(await derive(pw, unb64(salt), +iter)), want = unb64(hash);
  let d = got.length ^ want.length; for (let i = 0; i < got.length; i++) d |= got[i] ^ want[i % want.length];
  return d === 0;
}
const token = (n = 32) => hex(crypto.getRandomValues(new Uint8Array(n)));
const DUMMY = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // so unknown emails cost the same as known ones

export async function ensureAuth(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, pass TEXT NOT NULL, created INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sessions (h TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS invites (h TEXT PRIMARY KEY, note TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, used_by INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS login_fails (key TEXT NOT NULL, at INTEGER NOT NULL)"),
  ]);
}

export function cookieValue(request) {
  const m = new RegExp("(?:^|;\\s*)" + COOKIE + "=([a-f0-9]{64})").exec(request.headers.get("cookie") || "");
  return m ? m[1] : "";
}
export const sessionCookie = (tok, maxAge = SESSION_DAYS * 86400) => `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

async function startSession(db, userId, now) {
  const t = token(); await db.prepare("INSERT INTO sessions (h, user_id, expires) VALUES (?, ?, ?)").bind(await sha256(t), userId, now + SESSION_DAYS * 864e5).run();
  await db.prepare("DELETE FROM sessions WHERE expires < ?").bind(now).run();
  return t;
}
export async function sessionUser(db, request, now) {
  const c = cookieValue(request); if (!c) return null;
  try { await ensureAuth(db); } catch { return null; }
  return (await db.prepare("SELECT u.id AS id, u.email AS email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.h = ? AND s.expires > ?").bind(await sha256(c), now).first()) || null;
}
export async function endSession(db, request) {
  const c = cookieValue(request); if (c) await db.prepare("DELETE FROM sessions WHERE h = ?").bind(await sha256(c)).run();
}

// Owner: create an invite code. Shown once; only its hash is kept.
export async function createInvite(db, note, now) {
  await ensureAuth(db);
  const code = token(8).replace(/(.{4})(?=.)/g, "$1-");
  await db.prepare("INSERT INTO invites (h, note, created, expires) VALUES (?, ?, ?, ?)").bind(await sha256(code), String(note || "").slice(0, 60), now, now + INVITE_DAYS * 864e5).run();
  return { code, expiresInDays: INVITE_DAYS };
}

async function throttled(db, keys, now) {
  for (const k of keys) { const { n } = await db.prepare("SELECT COUNT(*) AS n FROM login_fails WHERE key = ? AND at > ?").bind(k, now - 10 * 60 * 1000).first(); if (n >= 10) return true; }
  return false;
}
async function fail(db, keys, now) {
  await db.batch([...keys.map(k => db.prepare("INSERT INTO login_fails (key, at) VALUES (?, ?)").bind(k, now)), db.prepare("DELETE FROM login_fails WHERE at < ?").bind(now - 24 * 3600 * 1000)]);
}

export async function register(db, body, ipHash, now) {
  await ensureAuth(db);
  const email = normEmail(body.email), keys = ["ip:" + ipHash];
  if (await throttled(db, keys, now)) return { status: 429, error: "Too many tries. Wait 10 minutes." };
  if (!validEmail(email)) return { status: 400, error: "Enter a valid email address." };
  if (!validPassword(body.password)) return { status: 400, error: "Use a password of at least 10 characters." };
  const h = await sha256(String(body.invite || "").trim().toLowerCase());
  const inv = await db.prepare("SELECT h FROM invites WHERE h = ? AND used_by IS NULL AND expires > ?").bind(h, now).first();
  if (!inv) { await fail(db, keys, now); return { status: 403, error: "That invite code is not valid, or it has expired or been used." }; }
  if (await db.prepare("SELECT 1 AS x FROM users WHERE email = ?").bind(email).first()) return { status: 409, error: "That email already has an account. Sign in instead." };
  const r = await db.prepare("INSERT INTO users (email, pass, created) VALUES (?, ?, ?)").bind(email, await hashPassword(body.password), now).run();
  const id = r.meta && r.meta.last_row_id;
  const claimed = await db.prepare("UPDATE invites SET used_by = ? WHERE h = ? AND used_by IS NULL").bind(id, h).run();
  if (!claimed.meta || !claimed.meta.changes) { await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run(); return { status: 403, error: "That invite code was just used." }; }
  return { status: 200, email, token: await startSession(db, id, now) };
}

export async function login(db, body, ipHash, now) {
  await ensureAuth(db);
  const email = normEmail(body.email), keys = ["ip:" + ipHash, "em:" + email];
  if (await throttled(db, keys, now)) return { status: 429, error: "Too many tries. Wait 10 minutes." };
  const u = validEmail(email) ? await db.prepare("SELECT id, pass FROM users WHERE email = ?").bind(email).first() : null;
  const ok = await verifyPassword(String(body.password || ""), u ? u.pass : DUMMY);
  if (!u || !ok) { await fail(db, keys, now); return { status: 401, error: "Email or password not recognised." }; }
  return { status: 200, email, token: await startSession(db, u.id, now) };
}

export async function listUsers(db) {
  await ensureAuth(db);
  return (await db.prepare("SELECT id, email, created FROM users ORDER BY id").all()).results;
}
// Owner: remove a person, their sessions and their saved marks.
export async function removeUser(db, email) {
  await ensureAuth(db);
  const u = await db.prepare("SELECT id FROM users WHERE email = ?").bind(normEmail(email)).first(); if (!u) return false;
  const uid = "u" + u.id;
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id), db.prepare("DELETE FROM users WHERE id = ?").bind(u.id),
    db.prepare("DELETE FROM dex WHERE id = ?").bind(uid), db.prepare("DELETE FROM user_state WHERE k LIKE ?").bind(uid + "|%"),
  ]).catch(() => db.prepare("DELETE FROM users WHERE id = ?").bind(u.id).run());
  return true;
}

// Owner: add a person directly (no invite), or set a new password for someone who already has an account (which signs them out everywhere).
export async function setUser(db, body, now) {
  await ensureAuth(db);
  const email = normEmail(body.email);
  if (!validEmail(email)) return { status: 400, error: "Enter a valid email address." };
  if (!validPassword(body.password)) return { status: 400, error: "Use a password of at least 10 characters." };
  const pass = await hashPassword(body.password), u = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (u) { await db.batch([db.prepare("UPDATE users SET pass = ? WHERE id = ?").bind(pass, u.id), db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id)]); return { status: 200, email, created: false }; }
  await db.prepare("INSERT INTO users (email, pass, created) VALUES (?, ?, ?)").bind(email, pass, now).run();
  return { status: 200, email, created: true };
}
