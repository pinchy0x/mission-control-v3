-- Populate FTS5 table with existing task data
-- Run this after creating the FTS5 table

-- Clear existing FTS data (if any)
DELETE FROM tasks_fts;

-- Insert all existing tasks with their messages
INSERT INTO tasks_fts(task_id, title, description, messages_text)
SELECT 
  t.id,
  t.title,
  COALESCE(t.description, ''),
  COALESCE((SELECT GROUP_CONCAT(m.content, ' ') FROM messages m WHERE m.task_id = t.id), '')
FROM tasks t;
