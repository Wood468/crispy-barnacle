import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const LOCAL = require("../public/local-state.js");

class Storage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const read = (storage, key, fallback = {}) => {
  try { return JSON.parse(storage.getItem(key) || "null") || fallback; } catch { return fallback; }
};

test("Dex snapshot merge keeps marks from both devices and uses the newer snapshot for conflicts", () => {
  const local = {
    have: { 25: 1, 26: 1 }, hundo: { 25: 1 },
    m: { shiny: { 25: 1 }, gmax: { 26: 1 } }, bt: { "Mega Lucario": 1 }
  };
  const remote = {
    have: { 25: 0, 150: 1 }, hundo: { 150: 1 },
    m: { shiny: { 25: 0, 150: 1 }, dynamax: { 26: 1 } }, bt: { "Mega Lucario": 0, "Mega Mewtwo": 1 }
  };
  const localWins = LOCAL.mergeDexSnapshot(local, remote, 300, 200);
  assert.deepEqual(localWins.have, { 25: 1, 150: 1, 26: 1 });
  assert.deepEqual(localWins.m.shiny, { 25: 1, 150: 1 });
  assert.deepEqual(localWins.m.dynamax, { 26: 1 });
  assert.deepEqual(localWins.bt, { "Mega Lucario": 1, "Mega Mewtwo": 1 });
  const remoteWins = LOCAL.mergeDexSnapshot(local, remote, 100, 200);
  assert.equal(remoteWins.have[25], 0);
  assert.equal(remoteWins.m.shiny[25], 0);
  assert.equal(remoteWins.bt["Mega Lucario"], 0);
  assert.equal(remoteWins.have[26], 1, "a mark present only on the local device is retained");
});


test("three-way Dex reconciliation propagates deletions and preserves independent additions", () => {
  const baseline = { have: { 25: 1, 26: 1, 27: 1 }, hundo: {}, m: { shiny: { 25: 1, 26: 1 } }, bt: {} };
  const local = { have: { 25: 2, 27: 1, 28: 1 }, hundo: {}, m: { shiny: { 25: 2 } }, bt: {} };
  const remote = { have: { 25: 0, 26: 1, 29: 1 }, hundo: {}, m: { shiny: { 25: 0, 26: 1 } }, bt: {} };
  const merged = LOCAL.mergeDexSnapshot(local, remote, 300, 200, baseline);
  assert.equal(merged.have[25], 2, "newer local edit wins a same-key conflict");
  assert.equal(merged.have[26], 1, "an unchanged remote mark remains");
  assert.equal(merged.have[27], undefined, "a remote deletion wins when the local value is unchanged");
  assert.equal(merged.have[28], 1, "local-only addition survives");
  assert.equal(merged.have[29], 1, "remote-only addition survives");

  const localDelete = { have: { 25: 1 }, hundo: {}, m: {}, bt: {} };
  const remoteUnchanged = { have: { 25: 1, 26: 1 }, hundo: {}, m: {}, bt: {} };
  const base = { have: { 25: 1, 26: 1 }, hundo: {}, m: {}, bt: {} };
  const deleted = LOCAL.mergeDexSnapshot(localDelete, remoteUnchanged, 300, 200, base);
  assert.equal(deleted.have[26], undefined, "a local deletion is retained when the server did not change that mark");
});

test("guest marks merge into the first signed-in account, then stay isolated from other accounts", () => {
  const storage = new Storage();
  storage.setItem("gofn-dex-v1", JSON.stringify({ have: { 25: 1 }, hundo: {}, m: { shiny: { 25: 1 } }, bt: {} }));
  storage.setItem("gofn-stamp", "100");
  storage.setItem("gofn-us-v1", JSON.stringify({ "saved:guest": { v: true, t: 100 } }));
  storage.setItem("gofn-saved", JSON.stringify(["legacy-guest"]));
  assert.equal(LOCAL.activate(storage, "guest", false), true);

  // Prepare an existing account-local cache, then return to guest state.
  LOCAL.activate(storage, "account:a@example.com", false);
  storage.setItem("gofn-dex-v1", JSON.stringify({ have: { 150: 1 }, hundo: { 150: 1 }, m: {}, bt: {} }));
  storage.setItem("gofn-stamp", "200");
  storage.setItem("gofn-us-v1", JSON.stringify({ "saved:account": { v: true, t: 200 } }));
  storage.setItem("gofn-dex-baseline-v1", JSON.stringify({ have: { 150: 1 }, hundo: { 150: 1 }, m: {}, bt: {} }));
  LOCAL.activate(storage, "guest", false);

  // A mark made while signed out is imported without dropping the account's existing marks.
  storage.setItem("gofn-dex-v1", JSON.stringify({ have: { 25: 1, 26: 1 }, hundo: {}, m: { shiny: { 25: 1 } }, bt: {} }));
  storage.setItem("gofn-stamp", "300");
  storage.setItem("gofn-us-v1", JSON.stringify({ "saved:guest": { v: true, t: 300 }, "saved:extra": { v: true, t: 300 } }));
  storage.setItem("gofn-follow", JSON.stringify(["Pikachu"]));
  LOCAL.activate(storage, "account:a@example.com", true);

  const dex = read(storage, "gofn-dex-v1");
  assert.deepEqual(Object.keys(dex.have).sort(), ["150", "25", "26"]);
  assert.deepEqual(Object.keys(dex.hundo), ["150"]);
  assert.deepEqual(read(storage, "gofn-dex-baseline-v1").have, { 150: 1 }, "the account's last server baseline stays attached to that account");
  const us = read(storage, "gofn-us-v1");
  assert.deepEqual(Object.keys(us).sort(), ["saved:account", "saved:extra", "saved:guest"]);
  assert.deepEqual(read(storage, "gofn-saved", []), ["legacy-guest"]);
  assert.deepEqual(read(storage, "gofn-follow", []), ["Pikachu"]);
  assert.equal(storage.getItem(LOCAL.activeKey), "account:a@example.com");

  // Signing out restores the empty guest partition; another account never sees account A's marks.
  LOCAL.activate(storage, "guest", false);
  assert.equal(storage.getItem("gofn-dex-v1"), null);
  LOCAL.activate(storage, "account:b@example.com", false);
  assert.equal(storage.getItem("gofn-dex-v1"), null);
  assert.deepEqual(read(storage, "gofn-us-v1"), {});
  LOCAL.activate(storage, "account:a@example.com", false);
  assert.deepEqual(Object.keys(read(storage, "gofn-dex-v1").have).sort(), ["150", "25", "26"]);
});

test("first activation adopts legacy localStorage without clearing it", () => {
  const storage = new Storage();
  storage.setItem("gofn-dex-v1", JSON.stringify({ have: { 1: 1 }, hundo: {}, m: {}, bt: {} }));
  assert.equal(LOCAL.activate(storage, "guest", false), true);
  assert.deepEqual(read(storage, "gofn-dex-v1").have, { 1: 1 });
  assert.equal(storage.getItem(LOCAL.activeKey), "guest");
});

test("account transitions no longer wipe the active device marks", () => {
  const account = fs.readFileSync(new URL("../public/account.js", import.meta.url), "utf8");
  assert.doesNotMatch(account, /wipeLocal/);
  assert.match(account, /switchIdentity\(identity\(email\), true\)/);
  assert.match(account, /switchIdentity\('guest', false\)/);
});
