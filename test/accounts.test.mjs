import test from "node:test";
import { readPrivate } from "./_private.mjs";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { makeDB } from "./helpers.mjs";
import worker from "../src/worker.js";
import * as A from "../src/auth.js";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const mk = () => { const db = makeDB(); db.raw.exec("CREATE TABLE user_state (k TEXT PRIMARY KEY, v TEXT, t INTEGER NOT NULL)"); return { DB: db, SYNC_PIN: "1234", ASSETS: { fetch: async () => new Response("{}") }, MEDIA: { get: async k => { const m = /^private\/(\w+)\.json$/.exec(k); if (!m) return null; const f = readPrivate(m[1] === "prices" ? "prices.json" : "places.json", m[1] === "prices" ? "private-prices.json" : "places-private.json"); return { json: async () => f }; } } }; };
const call = (env, path, { method = "GET", body, cookie, pin, ip = "1.1.1.1" } = {}) => worker.fetch(new Request("https://x.test" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(pin ? { "x-pin": pin } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
const ck = res => (res.headers.get("set-cookie") || "").split(";")[0];

test("passwords: salted PBKDF2, wrong password rejected, rules enforced", async () => {
  const h = await A.hashPassword("correct horse battery"), h2 = await A.hashPassword("correct horse battery");
  assert.notEqual(h, h2); assert.ok(h.startsWith("pbkdf2$100000$"));
  assert.ok(await A.verifyPassword("correct horse battery", h)); assert.ok(!(await A.verifyPassword("nope nope nope", h)));
  assert.ok(A.validEmail("a@b.co") && !A.validEmail("nope") && !A.validPassword("short"));
});

test("invite-only: needs the owner PIN to invite, code works once, then sign in / out", async () => {
  const env = mk();
  assert.equal((await call(env, "/api/auth/invite", { method: "POST", body: {}, pin: "bad" })).status, 401);
  const code = (await (await call(env, "/api/auth/invite", { method: "POST", body: { note: "Sam" }, pin: "1234" })).json()).code;
  assert.match(code, /^[a-f0-9]{4}(-[a-f0-9]{4}){3}$/);
  assert.equal((await call(env, "/api/auth/register", { method: "POST", body: { invite: "wrong", email: "sam@example.com", password: "a long password" } })).status, 403);
  const reg = await call(env, "/api/auth/register", { method: "POST", body: { invite: code, email: "Sam@Example.com", password: "a long password" } });
  assert.equal(reg.status, 200); const cookie = ck(reg); assert.match(reg.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await call(env, "/api/auth/register", { method: "POST", body: { invite: code, email: "other@example.com", password: "a long password" } })).status, 403, "code is single use");
  assert.deepEqual(await (await call(env, "/api/auth/me", { cookie })).json(), { signedIn: true, owner: false, email: "sam@example.com" });
  assert.equal((await call(env, "/api/auth/login", { method: "POST", body: { email: "sam@example.com", password: "wrong wrong wrong" } })).status, 401);
  const login = await call(env, "/api/auth/login", { method: "POST", body: { email: "SAM@example.com", password: "a long password" } });
  assert.equal(login.status, 200);
  await call(env, "/api/auth/logout", { method: "POST", body: {}, cookie });
  assert.equal((await (await call(env, "/api/auth/me", { cookie })).json()).signedIn, false);
  assert.equal((await call(env, "/api/auth/users", { method: "POST", body: {} })).status, 401, "member list is owner only");
});

test("each person's marks are private; the owner's stay separate", async () => {
  const env = mk(), mkUser = async (email) => {
    const code = (await (await call(env, "/api/auth/invite", { method: "POST", body: {}, pin: "1234" })).json()).code;
    return ck(await call(env, "/api/auth/register", { method: "POST", body: { invite: code, email, password: "a long password" } }));
  };
  const a = await mkUser("a@example.com"), b = await mkUser("b@example.com");
  await call(env, "/api/dex", { method: "PUT", pin: "1234", body: { have: { 1: 1 }, hundo: {}, m: {}, bt: {}, updated: 5, baseUpdated: 0 } });
  await call(env, "/api/dex", { method: "PUT", cookie: a, body: { have: { 25: 1 }, hundo: {}, m: {}, bt: {}, updated: 6, baseUpdated: 0 } });
  const get = async (o) => Object.keys((await (await call(env, "/api/dex", o)).json()).have);
  assert.deepEqual(await get({ pin: "1234" }), ["1"]); assert.deepEqual(await get({ cookie: a }), ["25"]); assert.deepEqual(await get({ cookie: b }), []);
  const put = (o, k) => call(env, "/api/userstate", { method: "PUT", ...o, body: { entries: { [k]: { v: true, t: 10 } } } });
  await put({ pin: "1234" }, "pref:owner"); await put({ cookie: a }, "pref:a");
  const keys = async o => Object.keys((await (await call(env, "/api/userstate", o)).json()).entries);
  assert.deepEqual(await keys({ pin: "1234" }), ["pref:owner"]); assert.deepEqual(await keys({ cookie: a }), ["pref:a"]); assert.deepEqual(await keys({ cookie: b }), []);
  assert.equal((await call(env, "/api/dex")).status, 401, "signed-out visitors get nothing");
});


test("Dex sync rejects stale whole-snapshot writes and returns the current revision", async () => {
  const env = mk();
  const put = body => call(env, "/api/dex", { method: "PUT", pin: "1234", body });
  const missingVersion = await put({ have: { 9: 1 }, hundo: {}, m: {}, bt: {}, updated: 50 });
  assert.equal(missingVersion.status, 428, "legacy tabs cannot replace a newer account snapshot");

  const first = await put({ have: { 1: 1 }, hundo: {}, m: {}, bt: {}, updated: 100, baseUpdated: 0 });
  assert.equal(first.status, 200);
  const firstAck = await first.json();
  assert.equal(firstAck.updated, 100);

  const stale = await put({ have: { 2: 1 }, hundo: {}, m: {}, bt: {}, updated: 200, baseUpdated: 0 });
  assert.equal(stale.status, 409);
  const conflict = await stale.json();
  assert.deepEqual(conflict.have, { 1: 1 });
  assert.equal(conflict.updated, firstAck.updated);

  const merged = await put({ have: { 1: 1, 2: 1 }, hundo: {}, m: {}, bt: {}, updated: 300, baseUpdated: conflict.updated });
  assert.equal(merged.status, 200);
  const final = await (await call(env, "/api/dex", { pin: "1234" })).json();
  assert.deepEqual(final.have, { 1: 1, 2: 1 });
  assert.ok(final.updated > conflict.updated, "the revision advances monotonically");
});

test("sign-in tries are throttled, and removing a person deletes their data", async () => {
  const env = mk();
  const code = (await (await call(env, "/api/auth/invite", { method: "POST", body: {}, pin: "1234" })).json()).code;
  const cookie = ck(await call(env, "/api/auth/register", { method: "POST", body: { invite: code, email: "c@example.com", password: "a long password" } }));
  await call(env, "/api/dex", { method: "PUT", cookie, body: { have: { 7: 1 }, hundo: {}, m: {}, bt: {}, updated: 1 } });
  assert.equal((await call(env, "/api/auth/remove", { method: "POST", pin: "1234", body: { email: "c@example.com" } })).status, 200);
  assert.equal((await call(env, "/api/dex", { cookie })).status, 401);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM dex WHERE id LIKE 'u%'").get().n, 0);
  let last; for (let i = 0; i < 11; i++) last = (await call(env, "/api/auth/login", { method: "POST", body: { email: "x@example.com", password: "wrong wrong wrong" }, ip: "9.9.9.9" })).status;
  assert.equal(last, 429);
});

test("owner can add a person directly and reset their password", async () => {
  const env = mk();
  assert.equal((await call(env, "/api/auth/create", { method: "POST", body: { email: "n@example.com", password: "a long password" } })).status, 401);
  assert.deepEqual(await (await call(env, "/api/auth/create", { method: "POST", pin: "1234", body: { email: "N@example.com", password: "a long password" } })).json(), { ok: true, email: "n@example.com", created: true });
  const cookie = ck(await call(env, "/api/auth/login", { method: "POST", body: { email: "n@example.com", password: "a long password" } }));
  assert.equal((await (await call(env, "/api/auth/me", { cookie })).json()).signedIn, true);
  assert.equal((await (await call(env, "/api/auth/create", { method: "POST", pin: "1234", body: { email: "n@example.com", password: "another long one" } })).json()).created, false);
  assert.equal((await (await call(env, "/api/auth/me", { cookie })).json()).signedIn, false, "reset signs them out");
  assert.equal((await call(env, "/api/auth/login", { method: "POST", body: { email: "n@example.com", password: "another long one" } })).status, 200);
  assert.equal((await call(env, "/api/auth/create", { method: "POST", pin: "1234", body: { email: "bad", password: "a long password" } })).status, 400);
});

test("Indonesian prices are owner-only: no PIN, wrong PIN and invited members never get them", async () => {
  const env = mk();
  assert.equal((await call(env, "/api/prices-private")).status, 401);
  assert.equal((await call(env, "/api/prices-private", { pin: "bad" })).status, 401);
  const code = (await (await call(env, "/api/auth/invite", { method: "POST", body: {}, pin: "1234" })).json()).code;
  const reg = await call(env, "/api/auth/register", { method: "POST", body: { invite: code, email: "sam@example.com", password: "a long password" } });
  assert.equal((await call(env, "/api/prices-private", { cookie: ck(reg) })).status, 401);
  const ok = await call(env, "/api/prices-private", { pin: "1234" });
  assert.equal(ok.status, 200); const j = await ok.json();
  assert.ok(j.fx && j.prices.length > 0 && j.prices.every(p => p.currency === "IDR"));
  assert.match(ok.headers.get("cache-control"), /no-store/);
});
