-- Event-Driven Triggers Schema Update
-- Migration for instant agent triggers instead of polling

-- Add cron_job_id to agents table for OpenClaw integration
ALTER TABLE agents ADD COLUMN cron_job_id TEXT;

-- Update existing agents with their cron job IDs
UPDATE agents SET cron_job_id = 'eb745829-dc73-40f7-bbe1-8d2596ed0e63' WHERE id = '9d59c008-49ef-4c';
UPDATE agents SET cron_job_id = 'a1813310-288b-4a9a-b45d-6aec06b6be45' WHERE id = '1432c7a3-f144-42';
UPDATE agents SET cron_job_id = '07f1e8e8-ce6b-4751-82f1-645aafb452fc' WHERE id = '8f9b070f-c98c-4c';

-- Pending triggers table for event-driven agent execution
CREATE TABLE IF NOT EXISTS pending_triggers (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  cron_job_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('task_assigned', 'mention_created', 'task_rejected')),
  task_id TEXT,
  message_id TEXT,
  context TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TEXT DEFAULT (datetime('now')),
  claimed_at TEXT,
  completed_at TEXT,
  error TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- Indexes for efficient polling
CREATE INDEX IF NOT EXISTS idx_pending_triggers_status ON pending_triggers(status);
CREATE INDEX IF NOT EXISTS idx_pending_triggers_status_created ON pending_triggers(status, created_at);
CREATE INDEX IF NOT EXISTS idx_pending_triggers_agent ON pending_triggers(agent_id);
