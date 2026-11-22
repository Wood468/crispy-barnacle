-- Migration 0004: the latest A$ store snapshot uploaded by the Melbourne reader (/api/store-ingest). ADDITIVE ONLY: one new table.
-- The Worker never creates this table at request time: without it /api/store-ingest answers 503. Idempotent; the live table already exists.
-- Apply by hand once on a fresh database: npx wrangler d1 execute go-field-notes --remote --file migrations/0004_store_ingest.sql
CREATE TABLE IF NOT EXISTS store_ingest (id INTEGER PRIMARY KEY CHECK(id = 1), received INTEGER, fetched TEXT, body TEXT);
