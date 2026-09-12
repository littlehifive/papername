CREATE TABLE installs (
  token_hash TEXT PRIMARY KEY,
  credits INTEGER NOT NULL CHECK (credits >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE access_keys (
  key_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('gift', 'purchase')),
  credits INTEGER NOT NULL CHECK (credits > 0),
  redeemed_by TEXT REFERENCES installs(token_hash),
  redeemed_at TEXT,
  claim_id TEXT UNIQUE
);

CREATE TABLE telemetry_counters (
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  event TEXT NOT NULL,
  preset TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT NOT NULL,
  latency_bucket TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (day, version, event, preset, outcome, reason, latency_bucket)
);
