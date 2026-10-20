import test from "node:test";
import assert from "node:assert/strict";
import { runBackup } from "../src/backup.js";
test("backup writes the database and private files, and drops days older than 30", async () => {
  const store = new Map([["backups/2026-08-01/d1.json", "old"], ["backups/2026-10-10/d1.json", "recent"], ["private/prices.json", '{"a":1}']]);
  const env = {
    DB: { prepare: sql => ({ all: async () => sql.startsWith("SELECT name") ? { results: [{ name: "user_state" }] } : { results: [{ k: "x", v: "1" }] } }) },
    MEDIA: {
      put: async (k, v) => { store.set(k, v); },
      get: async k => store.has(k) ? { text: async () => store.get(k) } : null,
      list: async () => ({ objects: [...store.keys()].map(key => ({ key })) }),
      delete: async k => { store.delete(k); },
    },
  };
  const r = await runBackup(env, new Date("2026-10-20T20:30:00Z"));
  assert.equal(r.tables, 1); assert.equal(r.rows, 1); assert.equal(r.files, 1); assert.equal(r.removed, 1);
  assert.ok(store.has("backups/2026-10-20/d1.json") && store.has("backups/2026-10-20/private-prices.json"));
  assert.ok(!store.has("backups/2026-08-01/d1.json") && store.has("backups/2026-10-10/d1.json"));
  assert.deepEqual(await runBackup({}), { skipped: "no database or bucket" });
});
