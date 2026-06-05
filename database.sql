-- Barfly Choice Engine database schema
-- The app creates this table automatically on startup when DATABASE_URL is set.
-- The table name remains island_survivor_sessions for backward compatibility with the first V1 build.

CREATE TABLE IF NOT EXISTS island_survivor_sessions (
  code TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_island_survivor_sessions_updated_at
  ON island_survivor_sessions (updated_at DESC);
