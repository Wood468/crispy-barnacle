-- Migration 0001: source pipeline (Phase 1). ADDITIVE ONLY: creates new tables, touches nothing that exists
-- (dex, pin_fails, dm_state, dm_new are not modified). No DROP / DELETE / UPDATE / ALTER.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  applied_at INTEGER NOT NULL
);

-- One row per place we read from, with its health bookkeeping.
CREATE TABLE IF NOT EXISTS sources (
  id             TEXT PRIMARY KEY,            -- 'leekduck', 'curated', ...
  name           TEXT NOT NULL,
  url            TEXT NOT NULL,
  kind           TEXT NOT NULL,               -- community | curated | datamine | official
  default_status TEXT NOT NULL,               -- official_confirmed | community_reported | datamined
  terms          TEXT,                        -- attribution / usage terms we agreed to follow
  last_checked   INTEGER,                     -- last attempt (ms)
  last_ok        INTEGER,                     -- last attempt whose DATA passed validation (ms)
  last_changed   INTEGER,                     -- last time validated data differed from before (ms)
  source_updated INTEGER,                     -- upstream's own "last updated", when it exposes one (ms)
  last_count     INTEGER,                     -- items in the last accepted feed
  last_invalid   INTEGER,                     -- entries skipped as malformed in the last accepted feed
  last_undated   INTEGER,                     -- entries with no usable dates in the last accepted feed
  content_hash   TEXT,
  fail_streak    INTEGER NOT NULL DEFAULT 0,  -- consecutive failed or rejected checks
  last_error     TEXT
);

-- One row per (source, event): that source's own report. Reports from different sources are never merged here,
-- so disagreement is kept rather than silently resolved.
CREATE TABLE IF NOT EXISTS items (
  id            TEXT PRIMARY KEY,             -- '<source_id>:<ext_id>'
  source_id     TEXT NOT NULL,
  ext_id        TEXT NOT NULL,
  kind          TEXT NOT NULL,                -- 'event'
  type          TEXT NOT NULL,                -- community-day, raid-battles, max-battles, ...
  name          TEXT NOT NULL,
  link          TEXT,
  image         TEXT,
  start_raw     TEXT,                         -- exactly as the source gave it
  end_raw       TEXT,
  tz_mode       TEXT NOT NULL,                -- utc (one instant worldwide) | local (each player's local time) | unknown
  start_ms      INTEGER,                      -- exact only when tz_mode = utc
  end_ms        INTEGER,
  earliest      INTEGER,                      -- earliest instant it could start anywhere (ms)
  latest_end    INTEGER,                      -- latest instant it could still be running anywhere (ms)
  scope         TEXT,                         -- worldwide_local | worldwide_simultaneous | regional
  region        TEXT,                         -- parsed from the title for regional events, else NULL
  featured      TEXT,                         -- JSON [{name, role, dex, form, shiny}]
  bonuses       TEXT,                         -- JSON ["3x Catch XP", ...]
  status        TEXT NOT NULL,                -- official_confirmed | community_reported | datamined
  evidence      TEXT,                         -- JSON {listing, page, official, rawStart, rawEnd}
  hash          TEXT NOT NULL,
  first_seen    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL,
  last_changed  INTEGER NOT NULL,
  missing_since INTEGER                       -- set when it drops out of an accepted feed before it finished
);
CREATE INDEX IF NOT EXISTS items_latest_end ON items (latest_end);
CREATE INDEX IF NOT EXISTS items_source ON items (source_id);

-- Append-only log of material changes.
CREATE TABLE IF NOT EXISTS item_history (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT    NOT NULL,
  at      INTEGER NOT NULL,
  change  TEXT    NOT NULL,                   -- created | changed | missing | reappeared
  detail  TEXT                                -- JSON; for 'changed': {field: [before, after]}
);
CREATE INDEX IF NOT EXISTS item_history_item ON item_history (item_id, at);

-- Disagreements between two sources about the same event. Kept after they resolve.
CREATE TABLE IF NOT EXISTS conflicts (
  id          TEXT PRIMARY KEY,               -- '<item a>|<item b>'
  a_item      TEXT NOT NULL,
  b_item      TEXT NOT NULL,
  field       TEXT NOT NULL,                  -- first differing field: start | end | region
  a_val       TEXT,
  b_val       TEXT,
  detail      TEXT,                           -- JSON of every differing field
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  resolved_at INTEGER
);
