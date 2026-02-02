-- Mission Control v3: Webhook Deliveries Schema
-- Task: [SUB] Webhooks - Retry Logic + Test Endpoint

-- Webhook deliveries table (tracks delivery attempts)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  webhook_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT,  -- Reference to the triggering event (task_id, message_id, etc.)
  payload TEXT NOT NULL,  -- JSON payload sent
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  last_status_code INTEGER,
  next_retry_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
);

-- Indexes for webhook deliveries
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(status, next_retry_at);
