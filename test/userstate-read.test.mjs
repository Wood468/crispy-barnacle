import test from "node:test";
import assert from "node:assert/strict";
import { cleanReadKeys, MAX_READ_KEYS, readKeys } from "../src/userstate.js";

function fakeDb(results) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return { all: async () => ({ results }) };
        }
      };
    }
  };
}

test("user-state keyed reads: accepts repeated valid keys and removes duplicates", () => {
  assert.deepEqual(cleanReadKeys(["saved:event-1", "follow:pikachu", "saved:event-1"]), {
    keys: ["saved:event-1", "follow:pikachu"],
    error: null
  });
});

test("user-state keyed reads: rejects empty, malformed and over-limit selections", () => {
  assert.equal(cleanReadKeys([]).error, "empty");
  assert.equal(cleanReadKeys(["saved:event-1", "not-a-user-state-key"]).error, "invalid");
  assert.equal(cleanReadKeys(["saved:bad\u0001key"]).error, "invalid");
  assert.equal(cleanReadKeys(Array.from({ length: MAX_READ_KEYS + 1 }, (_, i) => "saved:event-" + i)).error, "too_many");
  assert.equal(cleanReadKeys(Array.from({ length: MAX_READ_KEYS + 1 }, () => "saved:event-1")).error, "too_many");
});

test("user-state keyed reads: member reads bind only its own prefixed keys and preserve tombstones", async () => {
  const db = fakeDb([
    { k: "u42|saved:event-1", v: "true", t: 20 },
    { k: "u42|saved:deleted", v: null, t: 30 },
    { k: "u99|saved:event-1", v: "false", t: 40 },
    { k: "saved:event-1", v: "false", t: 50 }
  ]);
  const result = await readKeys(db, ["saved:event-1", "saved:deleted"], 10, "u42");
  assert.deepEqual(result, {
    "saved:event-1": { v: true, t: 20 },
    "saved:deleted": { v: null, t: 30 }
  });
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /t > \? AND k LIKE \? AND k IN \(\?, \?\)/);
  assert.deepEqual(db.calls[0].values, [10, "u42|%", "u42|saved:event-1", "u42|saved:deleted"]);
});

test("user-state keyed reads: owner query retains the existing member-row exclusion", async () => {
  const db = fakeDb([
    { k: "saved:event-1", v: "true", t: 10 },
    { k: "u42|saved:event-1", v: "false", t: 11 }
  ]);
  const result = await readKeys(db, ["saved:event-1"], 0, "");
  assert.deepEqual(result, { "saved:event-1": { v: true, t: 10 } });
  assert.match(db.calls[0].sql, /k NOT GLOB \? AND k IN \(\?\)/);
  assert.deepEqual(db.calls[0].values, [0, "u[0-9]*|*", "saved:event-1"]);
});

test("user-state keyed reads: rejects invalid selections before issuing SQL", async () => {
  const db = fakeDb([]);
  await assert.rejects(() => readKeys(db, ["saved:ok", "invalid"], 0, ""), /Invalid user-state key selection/);
  assert.equal(db.calls.length, 0);
});
