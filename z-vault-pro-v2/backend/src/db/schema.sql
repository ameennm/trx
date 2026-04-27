CREATE TABLE IF NOT EXISTS relay_requests (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  correlation_id TEXT NOT NULL,
  user_address TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount_sun TEXT NOT NULL,
  fee_sun TEXT NOT NULL,
  vault_address TEXT NOT NULL,
  status TEXT NOT NULL,
  tx_hash TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS relay_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
