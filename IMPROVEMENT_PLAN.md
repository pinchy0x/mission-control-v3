# Mission Control v3 - Improvement Plan

**Reference:** Bhanu's Mission Control UI (IMG_0468.jpeg)
**Sources:** Feature review + UI gap analysis

---

## Priority Order (Top to Bottom)

### 1. 🔴 Agent Queue View (P0)
**What:** Each agent needs a "My Queue" endpoint showing their assigned tasks
**Why:** Agents can't answer "what should I work on?" without this
**API Changes:**
- `GET /api/agents/:id/queue` - Returns tasks assigned to agent, ordered by priority/due date
**Dashboard Changes:**
- Click agent in sidebar → shows their queue
**Effort:** Small (1-2 hrs)

---

### 2. 🔴 Task Dependencies (P0)
**What:** Tasks can be blocked by other tasks
**Why:** "Blocked on what?" is unanswerable currently
**Schema Changes:**
```sql
CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL,
  blocked_by_task_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, blocked_by_task_id)
);
```
**API Changes:**
- `POST /api/tasks/:id/dependencies` - Add dependency
- `DELETE /api/tasks/:id/dependencies/:blockedById` - Remove
- Auto-set status to 'blocked' when dependency added
- Auto-notify when blocking task completes
**Effort:** Medium (2-3 hrs)

---

### 3. 🟡 Due Dates & Time Estimates (P1)
**What:** Tasks need due dates and estimated time
**Why:** Priority without deadline = meaningless
**Schema Changes:**
- Already have `due_date` column
- Add: `estimated_minutes INTEGER`
**API Changes:**
- Include in task CRUD
- Sort queue by due date
**Dashboard Changes:**
- Show due date on cards
- Show time estimate badge (like Bhanu's "1 day ago")
**Effort:** Small (1-2 hrs)

---

### 4. 🟡 Task Tags (P1)
**What:** Tags for categorization (research, content, demo, etc.)
**Why:** Bhanu's UI shows tags on every card - helps filtering/organization
**Schema Changes:**
```sql
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#gray'
);
CREATE TABLE task_tags (
  task_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (task_id, tag_id)
);
```
**API Changes:**
- `GET /api/tags` - List all tags
- `POST /api/tags` - Create tag
- `POST /api/tasks/:id/tags` - Add tag to task
- Include tags in task responses
**Dashboard Changes:**
- Show tag pills on cards
- Filter by tag
**Effort:** Medium (2-3 hrs)

---

### 5. 🟡 Enhanced Header Stats (P1)
**What:** Top bar showing "X AGENTS ACTIVE" and "Y TASKS IN QUEUE"
**Why:** At-a-glance status (matches Bhanu's UI)
**API Changes:**
- `GET /api/stats` - Returns { agentsActive, tasksInQueue, tasksInProgress, etc. }
**Dashboard Changes:**
- Header with stats display
- Online/offline indicator
- Clock display
**Effort:** Small (1 hr)

---

### 6. 🟡 Better Live Feed (P1)
**What:** Tabbed feed (All / Tasks / Comments / Docs / Status) + agent filters
**Why:** Current feed is basic, Bhanu's has rich filtering
**API Changes:**
- `GET /api/activities?type=comment&agent=xxx` - Better filtering
**Dashboard Changes:**
- Tab bar in activity panel
- Agent filter chips
- Click activity → go to task
**Effort:** Medium (2-3 hrs)

---

### 7. 🟡 Review Feedback Loop (P1)
**What:** Approve/reject tasks in review with feedback
**Why:** Review status exists but no approve/reject workflow
**API Changes:**
- `POST /api/tasks/:id/approve` - Move to done + notify
- `POST /api/tasks/:id/reject` - Back to in_progress + feedback comment
**Dashboard Changes:**
- Approve/Reject buttons in review column
- Feedback modal on reject
**Effort:** Small (1-2 hrs)

---

### 8. 🟢 Agent Status Display (P2)
**What:** Show WORKING badge, role badges (LEAD/SPC/INT)
**Why:** Visual clarity on who's doing what
**Dashboard Changes:**
- Status dot (green = working, gray = idle)
- Role badge next to name
**Effort:** Small (1 hr)

---

### 9. 🟢 Task Self-Assignment (P2)
**What:** Agents can claim tasks from inbox
**Why:** Pull-based work vs push-only
**API Changes:**
- `POST /api/tasks/:id/claim` - Self-assign
**Dashboard Changes:**
- "Claim" button on inbox tasks
**Effort:** Small (30 min)

---

### 10. 🟢 Workspace Selector (P2)
**What:** Multiple workspaces/projects
**Why:** Bhanu's UI has workspace dropdown
**Schema Changes:**
```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```
**API Changes:**
- Workspace CRUD
- Filter tasks by workspace
**Effort:** Medium (2-3 hrs)

---

### 11. 🟢 Relative Timestamps (P2)
**What:** Show "1 day ago", "about 9 hours ago" on task cards
**Why:** Bhanu's cards show relative time, not absolute dates
**Dashboard Changes:**
- Use date-fns or similar for `formatDistanceToNow()`
- Apply to task cards and activity feed
**Effort:** Tiny (30 min)

---

### 12. 🟢 Column Counts (P2)
**What:** Show task count in column headers (INBOX 11, ASSIGNED 10)
**Why:** Bhanu's UI shows counts - quick status glance
**Dashboard Changes:**
- Count tasks per status and display in header
**Effort:** Tiny (15 min)

---

### 13. 🟢 Docs System (P3)
**What:** Docs tab in activity feed, link docs to tasks
**Why:** Bhanu has Docs tab - teams need shared documentation
**Schema Changes:**
```sql
CREATE TABLE docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  task_id TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```
**API Changes:**
- Docs CRUD
- Link to tasks
**Dashboard Changes:**
- Docs tab in live feed
- Doc viewer/editor
**Effort:** Medium (3-4 hrs)

---

## Implementation Order

Sprint 1 (Core Agent Workflow):
1. Agent Queue View
2. Task Dependencies
3. Due Dates

Sprint 2 (UI Polish - Bhanu Parity):
4. Task Tags
5. Header Stats
6. Better Live Feed
7. Relative Timestamps
8. Column Counts

Sprint 3 (Workflow Refinement):
9. Review Feedback Loop
10. Agent Status Display
11. Task Self-Assignment

Sprint 4 (Advanced):
12. Workspace Selector
13. Docs System

---

## Total Estimated Effort
- Sprint 1: ~5-7 hrs
- Sprint 2: ~6-7 hrs (added timestamps, counts)
- Sprint 3: ~3-4 hrs
- Sprint 4: ~5-7 hrs
- **Total: ~19-25 hrs**
