import test from "node:test";
import assert from "node:assert/strict";
import worker, { MAX_SYNC_JSON_BYTES } from "../src/worker.js";
import { makeDB } from "./helpers.mjs";

function makeEnv() {
  return {
    DB: makeDB(),
    SYNC_PIN: "1234",
    ASSETS: { fetch: async () => new Response("{}") }
  };
}

function put(env, path, body, ip = "203.0.113.10") {
  return worker.fetch(new Request("https://x.test" + path, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-pin": "1234",
      "cf-connecting-ip": ip
    },
    body
  }), env, { waitUntil() {} });
}

test("oversized Dex snapshot writes are rejected before any row is saved", async () => {
  const env = makeEnv();
  const body = JSON.stringify({ baseUpdated: 0, pad: "x".repeat(MAX_SYNC_JSON_BYTES + 1) });
  const response = await put(env, "/api/dex", body);
  assert.equal(response.status, 413);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM dex").first()).n, 0);
});

test("oversized per-entry user-state writes are rejected before any row is saved", async () => {
  const env = makeEnv();
  await env.DB.exec("CREATE TABLE user_state (k TEXT PRIMARY KEY, v TEXT, t INTEGER NOT NULL)");
  const body = JSON.stringify({
    entries: {
      "saved:oversized": { v: "x".repeat(MAX_SYNC_JSON_BYTES + 1), t: Date.now() }
    }
  });
  const response = await put(env, "/api/userstate", body, "203.0.113.11");
  assert.equal(response.status, 413);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM user_state").first()).n, 0);
});

test("bounded JSON parsing preserves valid Dex and user-state writes", async () => {
  const dexEnv = makeEnv();
  const dexBody = JSON.stringify({
    baseUpdated: 0,
    have: { "25": 1 },
    hundo: {},
    m: {},
    bt: {}
  });
  const dexResponse = await put(dexEnv, "/api/dex", dexBody, "203.0.113.12");
  assert.equal(dexResponse.status, 200);
  assert.equal((await dexResponse.json()).ok, true);
  const dexRow = await dexEnv.DB.prepare("SELECT data FROM dex WHERE id = ?").bind("me").first();
  assert.equal(JSON.parse(dexRow.data).have["25"], 1);

  const stateEnv = makeEnv();
  await stateEnv.DB.exec("CREATE TABLE user_state (k TEXT PRIMARY KEY, v TEXT, t INTEGER NOT NULL)");
  const stateBody = JSON.stringify({
    entries: { "saved:event-1": { v: true, t: Date.now() } }
  });
  const stateResponse = await put(stateEnv, "/api/userstate", stateBody, "203.0.113.13");
  assert.equal(stateResponse.status, 200);
  assert.equal((await stateResponse.json()).applied.applied, 1);
  const stateRow = await stateEnv.DB.prepare("SELECT v FROM user_state WHERE k = ?").bind("saved:event-1").first();
  assert.equal(JSON.parse(stateRow.v), true);
});

test("malformed sync JSON remains a client error", async () => {
  const env = makeEnv();
  const response = await put(env, "/api/dex", "{", "203.0.113.14");
  assert.equal(response.status, 400);
});
