-- Migration: Add parent_task_id for subtask support
-- Date: 2025-01-XX

-- Add parent_task_id column to tasks (nullable - null means top-level task)
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;

-- Index for efficient subtask queries
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
