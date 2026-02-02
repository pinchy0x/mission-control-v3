-- FTS5 v2: Simple setup without contentless mode
-- D1 appears to have issues with contentless FTS5

-- Drop old triggers
DROP TRIGGER IF EXISTS tasks_fts_insert;
DROP TRIGGER IF EXISTS tasks_fts_update;
DROP TRIGGER IF EXISTS tasks_fts_delete;
DROP TRIGGER IF EXISTS messages_fts_insert;
DROP TRIGGER IF EXISTS messages_fts_delete;

-- Drop old table
DROP TABLE IF EXISTS tasks_fts;

-- Create FTS5 table (regular mode, not contentless)
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  task_id,
  title,
  description,
  messages_text
);

-- Populate with existing data
INSERT INTO tasks_fts(task_id, title, description, messages_text)
SELECT 
  t.id,
  t.title,
  COALESCE(t.description, ''),
  COALESCE((SELECT GROUP_CONCAT(m.content, ' ') FROM messages m WHERE m.task_id = t.id), '')
FROM tasks t;

-- Trigger: Insert into FTS when task is created
CREATE TRIGGER tasks_fts_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(task_id, title, description, messages_text)
  VALUES (NEW.id, NEW.title, COALESCE(NEW.description, ''), '');
END;

-- Trigger: Update FTS when task is updated
CREATE TRIGGER tasks_fts_update AFTER UPDATE OF title, description ON tasks BEGIN
  UPDATE tasks_fts SET 
    title = NEW.title,
    description = COALESCE(NEW.description, '')
  WHERE task_id = OLD.id;
END;

-- Trigger: Delete from FTS when task is deleted
CREATE TRIGGER tasks_fts_delete AFTER DELETE ON tasks BEGIN
  DELETE FROM tasks_fts WHERE task_id = OLD.id;
END;

-- Trigger: Update FTS when message is added
CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages BEGIN
  UPDATE tasks_fts SET 
    messages_text = COALESCE((SELECT GROUP_CONCAT(content, ' ') FROM messages WHERE task_id = NEW.task_id), '')
  WHERE task_id = NEW.task_id;
END;
