-- Migration 0003: notifications (Phase 5). ADDITIVE ONLY: new tables, nothing existing is touched.
-- notif_sent is the dedupe ledger: the dedupe key is UNIQUE, so the same alert can never be queued twice.
CREATE TABLE IF NOT EXISTS notif_sent (
  dedupe     TEXT PRIMARY KEY,          -- kind|item|fingerprint, e.g. 'starting|leekduck:abc|1760000000000'
  kind       TEXT NOT NULL,             -- announced | changed | starting | missing | datamine
  item_id    TEXT,
  level      TEXT NOT NULL,             -- alert (confirmed or community reported) | info (never shown as urgent)
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  url        TEXT,
  created_at INTEGER NOT NULL,
  telegram   TEXT,                      -- sent | failed | skipped
  push       TEXT,                      -- sent | failed | skipped
  error      TEXT
);
CREATE INDEX IF NOT EXISTS notif_sent_created ON notif_sent (created_at);

-- Browser push subscriptions (no secrets: the endpoint is the address, the keys stay in the browser).
CREATE TABLE IF NOT EXISTS push_subs (
  id         TEXT PRIMARY KEY,          -- SHA-256 of the endpoint
  endpoint   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_ok    INTEGER,
  fail_count INTEGER NOT NULL DEFAULT 0
);

-- Small key/value bookkeeping for the notifier (when it last ran, its baseline).
CREATE TABLE IF NOT EXISTS notif_state (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
