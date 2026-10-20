import test from "node:test";
import assert from "node:assert/strict";
import { cleanFeedback, feedbackAllowed, sendFeedback } from "../src/jobs.js";

function fakeEnv() {
  const rows = new Map();
  const db = { prepare: sql => ({ _a: [], bind(...a) { this._a = a; return this; },
    async run() { if (/^INSERT/.test(sql)) rows.set(this._a[0], this._a[1]); return {}; },
    async first() { return /^SELECT/.test(sql) && rows.has(this._a[0]) ? { value: rows.get(this._a[0]) } : null; } }) };
  return { DB: db, TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "c" };
}
const who = { uid: "u1", email: "sam@example.com" };
const mk = () => { const sent = []; const f = async (u, i = {}) => { sent.push(JSON.parse(i.body)); return new Response("{}", { status: 200 }); }; f.sent = sent; return f; };

test("feedback text is cleaned and capped", () => {
  assert.equal(cleanFeedback({ kind: "event", text: "  a \n\n b  " }).text, "a b");
  assert.equal(cleanFeedback({ kind: "x", text: "hello" }).kind, "problem");
  assert.equal(cleanFeedback({ text: "x".repeat(2000) }).text.length, 600);
});

test("feedback limit: five a day, old ones age out", () => {
  const now = 1e12; let t = [];
  for (let i = 0; i < 5; i++) { const r = feedbackAllowed(t, now); assert.equal(r.ok, true); t = r.times; }
  assert.equal(feedbackAllowed(t, now).ok, false);
  assert.equal(feedbackAllowed(t, now + 864e5 + 1).ok, true);
});

test("feedback reaches Telegram once per send and stops at the limit", async () => {
  const env = fakeEnv(), f = mk();
  assert.equal((await sendFeedback(env, who, { kind: "event", text: "Go Fest Osaka is missing" }, { fetch: f })).status, 200);
  assert.match(f.sent[0].text, /Event suggestion from sam@example.com/);
  assert.equal((await sendFeedback(env, who, { text: "" }, { fetch: f })).status, 400);
  for (let i = 0; i < 4; i++) await sendFeedback(env, who, { text: "again " + i }, { fetch: f });
  assert.equal((await sendFeedback(env, who, { text: "one more" }, { fetch: f })).status, 429);
  assert.equal(f.sent.length, 5);
  assert.equal((await sendFeedback({ ...env, TELEGRAM_BOT_TOKEN: "" }, who, { text: "hi there" }, { fetch: f })).status, 503);
});
