-- Migration 0004: browser alerts for invited members. ADDITIVE ONLY: two new tables, nothing existing is touched.
-- Each member's push addresses (no secrets: the keys stay in the browser).
CREATE TABLE IF NOT EXISTS member_push_subs (
  id         TEXT PRIMARY KEY,          -- SHA-256 of the endpoint
  uid        TEXT NOT NULL,             -- the member, e.g. 'u3'
  endpoint   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_ok    INTEGER,
  fail_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS member_push_subs_uid ON member_push_subs (uid);

-- What each member has already been told (so nothing is sent twice) and the message their phone reads back.
CREATE TABLE IF NOT EXISTS member_notif_sent (
  uid        TEXT NOT NULL,
  dedupe     TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  url        TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uid, dedupe)
);
