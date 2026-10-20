-- Migration 0002: synced personal state (Phase 4). ADDITIVE ONLY: one new table, nothing existing is touched.
-- One row per entry (a form mark, a saved event, a followed Pokemon, a preference). The newest timestamp wins per entry,
-- so two devices editing different things never overwrite each other. A deleted entry keeps its row (v = NULL) so the deletion syncs.
CREATE TABLE IF NOT EXISTS user_state (
  k TEXT PRIMARY KEY,       -- 'form:25:alola', 'saved:<event id>', 'follow:<pokemon>', 'pref:<name>', 'costume:...'
  v TEXT,                   -- JSON value, or NULL for a deletion
  t INTEGER NOT NULL        -- client timestamp (ms) of the change, clamped to the server clock
);
