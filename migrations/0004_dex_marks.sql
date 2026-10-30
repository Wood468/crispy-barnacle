-- Migration 0004: per-mark Pokédex sync. ADDITIVE ONLY: creates a dedicated per-entry table.
-- Existing dex snapshots are retained for compatibility and one-time import by the sync API.
-- A NULL value is a tombstone, so unmarking a Pokémon is synced to every device.
-- uid matches dex.id: 'me' for the owner, or 'u<account id>' for an invited account.
CREATE TABLE IF NOT EXISTS dex_marks (
  uid       TEXT NOT NULL,
  mark_key  TEXT NOT NULL, -- e.g. have:25, hundo:25, m:shiny:25, bt:Mega Lucario:s
  value     TEXT,          -- JSON scalar/object, or NULL for a deletion tombstone
  updated   INTEGER NOT NULL,
  PRIMARY KEY (uid, mark_key)
);
CREATE INDEX IF NOT EXISTS dex_marks_updated ON dex_marks (uid, updated);
