-- #885: Explicitly provision before enabling STORE_INGEST_KEY.
-- Apply only to a reviewed disposable D1 first; production requires separate approval.
CREATE TABLE IF NOT EXISTS store_ingest (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  received INTEGER NOT NULL,
  fetched TEXT NOT NULL,
  body TEXT NOT NULL
);
