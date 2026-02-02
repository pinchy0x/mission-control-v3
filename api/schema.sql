-- Mission Control v3 Schema

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'blocked')),
  level TEXT DEFAULT 'specialist' CHECK (level IN ('intern', 'specialist', 'lead')),
  session_key TEXT UNIQUE,
  current_task_id TEXT,
  avatar_emoji TEXT DEFAULT '🤖',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'inbox' CHECK (status IN ('inbox', 'assigned', 'in_progress', 'review', 'done', 'blocked')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  workspace_id TEXT,
  deliverable_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Task assignees junction table
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  assigned_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, agent_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Messages (comments on tasks)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  task_id TEXT NOT NULL,
  from_agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (from_agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Activities (activity feed)
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  type TEXT NOT NULL CHECK (type IN (
    'task_created', 'task_updated', 'task_assigned', 'task_status_changed',
    'message_sent', 'agent_status_changed', 'deliverable_created', 'doc_updated'
  )),
  agent_id TEXT,
  task_id TEXT,
  message TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- Notifications (@mentions, assignments, approvals, etc.)
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  agent_id TEXT NOT NULL,
  task_id TEXT,
  message_id TEXT,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'mention' CHECK (type IN ('mention', 'assignment', 'reply', 'status_change', 'approval', 'rejection')),
  delivered INTEGER DEFAULT 0,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
);

-- Subscriptions (thread subscriptions)
CREATE TABLE IF NOT EXISTS subscriptions (
  agent_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  subscribed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (agent_id, task_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Docs table (workspace documentation)
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(workspace_id, filename),
  FOREIGN KEY (created_by) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES agents(id) ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_agent ON notifications(agent_id, delivered);
CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_agent ON task_assignees(agent_id);
CREATE INDEX IF NOT EXISTS idx_docs_workspace ON docs(workspace_id);
