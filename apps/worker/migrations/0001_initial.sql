CREATE TABLE invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  token_hash TEXT UNIQUE,
  activated_at TEXT
);

CREATE TABLE monthly_usage (
  token_hash TEXT NOT NULL,
  month TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (token_hash, month),
  FOREIGN KEY (token_hash) REFERENCES invite_codes(token_hash)
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
