import test from "node:test";
import assert from "node:assert/strict";
import { makeDB } from "./helpers.mjs";
import { migrate } from "../src/pipeline.js";

test("migration 0004 adds per-mark Dex storage without changing legacy snapshots", async () => {
  const db = makeDB();
  await db.exec("CREATE TABLE dex (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)");
  await db.prepare("INSERT INTO dex (id, data, updated) VALUES (?, ?, ?)").bind("me", JSON.stringify({ have: { 25: 1 } }), 123).run();

  await migrate(db, 456);

  const legacy = await db.prepare("SELECT data, updated FROM dex WHERE id = ?").bind("me").first();
  assert.deepEqual(JSON.parse(legacy.data), { have: { 25: 1 } });
  assert.equal(legacy.updated, 123);

  const schema = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dex_marks'").first();
  assert.ok(schema, "the new table exists");

  await db.batch([
    db.prepare("INSERT INTO dex_marks (uid, mark_key, value, updated) VALUES (?, ?, ?, ?)").bind("me", "have:25", "1", 500),
    db.prepare("INSERT INTO dex_marks (uid, mark_key, value, updated) VALUES (?, ?, ?, ?)").bind("u7", "have:25", "1", 501),
    db.prepare("INSERT INTO dex_marks (uid, mark_key, value, updated) VALUES (?, ?, ?, ?)").bind("me", "m:shiny:25", null, 502)
  ]);
  const rows = (await db.prepare("SELECT uid, mark_key, value, updated FROM dex_marks ORDER BY uid, mark_key").all()).results;
  assert.equal(rows.length, 3);
  assert.equal(rows.find(r => r.mark_key === "m:shiny:25").value, null, "NULL is retained as a deletion tombstone");
  assert.equal(rows.find(r => r.uid === "u7").updated, 501, "account marks remain isolated by uid");

  await migrate(db, 789);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 4").first()).n, 1, "migration is idempotent");
});
