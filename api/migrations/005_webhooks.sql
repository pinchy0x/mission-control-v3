-- Mission Control v3: Webhooks Schema
-- Task: [SUB] Webhooks - Database Schema + CRUD API

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  url TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '[]',  -- JSON array of event types
  workspace_id TEXT,
  secret TEXT NOT NULL,  -- For signature verification
  active INTEGER DEFAULT 1,
  name TEXT,  -- Optional friendly name
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);

-- Indexes for webhooks
CREATE INDEX IF NOT EXISTS idx_webhooks_workspace ON webhooks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active);
