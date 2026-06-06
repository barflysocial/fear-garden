CREATE TABLE IF NOT EXISTS island_survivor_sessions (
  code TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_island_survivor_sessions_updated_at
ON island_survivor_sessions (updated_at DESC);
