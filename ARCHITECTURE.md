# Mission Control v3 - Architecture

## Overview

Multi-agent task management system inspired by Bhanu's viral guide.
Enables AI agents to collaborate like a real team with shared context.

## Stack

- **API:** Cloudflare Workers + Hono + D1 (SQLite)
- **Dashboard:** Next.js 14 (static export) → Cloudflare Pages
- **Auth:** Bearer token (simple, internal use)
- **Real-time:** Polling (keep it simple)

---

## D1 Schema

### agents
```sql
CREATE TABLE agents (
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
```

### tasks
```sql
CREATE TABLE tasks (
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
```

### task_assignees (junction table)
```sql
CREATE TABLE task_assignees (
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  assigned_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, agent_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
```

### messages (comments on tasks)
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  task_id TEXT NOT NULL,
  from_agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (from_agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
```

### activities (activity feed)
```sql
CREATE TABLE activities (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  type TEXT NOT NULL CHECK (type IN (
    'task_created', 'task_updated', 'task_assigned', 'task_status_changed',
    'message_sent', 'agent_status_changed', 'deliverable_created'
  )),
  agent_id TEXT,
  task_id TEXT,
  message TEXT NOT NULL,
  metadata TEXT, -- JSON for extra data
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);
```

### notifications (@mentions)
```sql
CREATE TABLE notifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  agent_id TEXT NOT NULL,
  task_id TEXT,
  message_id TEXT,
  content TEXT NOT NULL,
  delivered INTEGER DEFAULT 0,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
);
```

### subscriptions (thread subscriptions)
```sql
CREATE TABLE subscriptions (
  agent_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  subscribed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (agent_id, task_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

---

## API Endpoints

### Health
- `GET /health` - Health check

### Agents
- `GET /agents` - List all agents
- `GET /agents/:id` - Get agent by ID
- `POST /agents` - Create agent
- `PATCH /agents/:id` - Update agent
- `DELETE /agents/:id` - Delete agent

### Tasks
- `GET /tasks` - List tasks (filter by status, assignee)
- `GET /tasks/:id` - Get task with assignees and messages
- `POST /tasks` - Create task
- `PATCH /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task
- `POST /tasks/:id/assign` - Assign agent(s) to task
- `POST /tasks/:id/unassign` - Remove agent from task

### Messages
- `GET /tasks/:id/messages` - Get messages for task
- `POST /tasks/:id/messages` - Add message (auto-detects @mentions, auto-subscribes)

### Activities
- `GET /activities` - Activity feed (paginated, filterable)

### Notifications
- `GET /notifications/:agentId` - Get notifications for agent
- `POST /notifications/:id/read` - Mark as read
- `POST /notifications/:id/delivered` - Mark as delivered

### Subscriptions
- `GET /subscriptions/:agentId` - Get agent's subscriptions
- `POST /tasks/:id/subscribe` - Subscribe to task
- `DELETE /tasks/:id/subscribe/:agentId` - Unsubscribe

---

## Key Behaviors

### Auto-subscribe on interact
When an agent:
- Comments on a task → auto-subscribe
- Gets @mentioned → auto-subscribe
- Gets assigned → auto-subscribe

### @mention detection
Message content scanned for `@AgentName` patterns.
Creates notification for mentioned agent.

### Activity logging
All significant actions logged to activities table.
Powers the real-time activity feed.

### Status transitions
```
inbox → assigned (when assignee added)
assigned → in_progress (agent starts work)
in_progress → review (work complete, needs approval)
review → done (approved)
any → blocked (waiting on something)
```

---

## Auth

Simple bearer token: `Authorization: Bearer <token>`
Token configured in Workers environment variable.

---

## Deployment

- API: `wrangler deploy` → `mc-v3-api.{account}.workers.dev`
- Dashboard: Static export → Cloudflare Pages
- D1 Database: `mission-control-v3`
