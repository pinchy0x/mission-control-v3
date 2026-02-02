-- Schema updates based on review feedback

-- Add created_by to tasks
ALTER TABLE tasks ADD COLUMN created_by TEXT REFERENCES agents(id) ON DELETE SET NULL;

-- Add type to notifications
ALTER TABLE notifications ADD COLUMN type TEXT DEFAULT 'mention' CHECK (type IN ('mention', 'assignment', 'reply', 'status_change'));

-- Add optional fields to tasks
ALTER TABLE tasks ADD COLUMN due_date TEXT;
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;

-- Additional indexes from review
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status ON tasks(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_task_id ON activities(task_id);
CREATE INDEX IF NOT EXISTS idx_activities_agent_id ON activities(agent_id);
