import test from "node:test";
import assert from "node:assert/strict";
import { memberDigest, runMemberNotify } from "../src/notify.js";

test("member digest: one message however many things are new", () => {
  assert.equal(memberDigest([]), null);
  assert.equal(memberDigest([{ title: "New: A", body: "b", url: "https://x" }]).title, "New: A");
  const d = memberDigest([1, 2, 3, 4, 5].map(i => ({ title: "E" + i, body: "", url: null })));
  assert.equal(d.title, "5 event updates");
  assert.match(d.body, /E1 · E2 · E3 and 2 more/);
});

test("member alerts skip cleanly when the tables are not there yet", async () => {
  const db = { prepare: () => ({ first: async () => null, all: async () => ({ results: [] }), bind() { return this; } }) };
  assert.deepEqual(await runMemberNotify({}, db, 1, null, {}), { skipped: "tables not created" });
});

// A real (in-memory) SQLite behind a D1-shaped wrapper, with the real migrations applied.
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "../src/migrations.js";
import { vapidCreate } from "../src/notify.js";
function d1() {
  const raw = new DatabaseSync(":memory:");
  const db = { prepare: sql => { const st = raw.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; }, run: async () => { st.run(...args); return {}; }, first: async () => st.get(...args) || null, all: async () => ({ results: st.all(...args) }) }; return o; } };
  for (const m of MIGRATIONS) for (const s of m.sql.split("\n").map(l => l.replace(/--.*$/, "")).join("\n").split(";").map(x => x.trim()).filter(Boolean)) raw.exec(s);
  raw.exec("CREATE TABLE IF NOT EXISTS notif_state (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
  return db;
}
const NOW = Date.parse("2026-10-20T20:30:00Z");
const ev = (id, name, firstSeen) => ({ id, name, type: "event", tzMode: "local", announced: true, status: "official_confirmed", start: "2026-10-24T10:00:00.000", end: "2026-10-24T18:00:00.000", reports: [{ firstSeen, lastChanged: 0, link: "https://pokemongo.com/" + id }] });

test("members: only people who switched alerts on, only new things, once", async () => {
  const db = d1();
  await vapidCreate(db);
  await db.prepare("INSERT INTO notif_state (k, v) VALUES ('baseline', ?)").bind(String(NOW - 10 * 864e5)).run();
  const put = (k, v) => db.prepare("INSERT INTO user_state (k, v, t) VALUES (?, ?, ?)").bind(k, JSON.stringify(v), NOW - 1).run();
  await put("u1|pref:notify.on", true); // member 1 wants alerts, member 2 does not
  const ep = "https://fcm.googleapis.com/fcm/send/abc";
  await db.prepare("INSERT INTO member_push_subs (id, uid, endpoint, created_at) VALUES ('s1', 'u1', ?, ?)").bind(ep, NOW - 5 * 864e5).run();
  await db.prepare("INSERT INTO member_push_subs (id, uid, endpoint, created_at) VALUES ('s2', 'u2', ?, ?)").bind(ep + "2", NOW - 5 * 864e5).run();
  const events = [ev("new", "Fresh Event", NOW - 864e5), ev("old", "Old Event", NOW - 30 * 864e5)];
  const pushes = [], f = async (u) => { pushes.push(u); return new Response("", { status: 201 }); };
  const deps = { listEvents: async () => ({ events }), dexList: [] };
  const r1 = await runMemberNotify({}, db, NOW, f, deps);
  assert.equal(r1.sent, 1);
  assert.deepEqual(pushes, [ep], "only the member who switched alerts on");
  const row = await db.prepare("SELECT title FROM member_notif_sent WHERE uid = 'u1' ORDER BY created_at DESC, rowid DESC LIMIT 1").first();
  assert.match(row.title, /New: Fresh Event/);
  const r2 = await runMemberNotify({}, db, NOW + 36e5, f, deps);
  assert.equal(r2.sent, 0);
  assert.equal(pushes.length, 1, "nothing is sent twice");
});
