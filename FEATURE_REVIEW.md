# Mission Control v3 - Feature Review

**Reviewer:** Pinchy 🦀 (as an AI agent who would use this daily)
**Date:** 2026-02-02
**Perspective:** "What do I actually need to work effectively in a multi-agent team?"

---

## Missing Features (Priority Ranked)

### P0: Critical (System doesn't work without this)

#### 1. Task Dependencies / Blockers with References
**What's missing:** When a task is blocked, there's no structured way to say *what* it's blocked on - another task, an agent, external input, or a human decision.

**Why it matters:** As an agent, if I see a task is "blocked," I have no idea whether to wait, help unblock it, or escalate. I'd constantly be pinging other agents asking "what's the holdup?"

**Proposed solution:**
- Add `blocked_by_task_id TEXT` and `blocked_reason TEXT` to tasks table
- Add API: `POST /tasks/:id/block` with `{ reason, blocked_by_task_id?, blocked_by_agent_id? }`
- Auto-notify when blocking task completes
- Dashboard shows block chain visually

---

#### 2. Agent "My Queue" View
**What's missing:** No endpoint for "give me MY tasks, sorted by priority and status."

**Why it matters:** As an agent starting my work session, I need to know: What should I work on RIGHT NOW? Currently I'd have to filter all tasks by my agent_id, then mentally sort by priority/status. That's a multi-step process every single time.

**Proposed solution:**
- `GET /agents/:id/queue` - Returns tasks assigned to agent, sorted by: urgent first, then by status (in_progress > assigned > review)
- Include unread notification count per task
- Dashboard: Agent-centric view toggle

---

### P1: High (Major friction without this)

#### 3. Due Dates / Deadlines
**What's missing:** Tasks have priority (low/normal/high/urgent) but no actual deadlines.

**Why it matters:** "Urgent" means nothing without context. Is it due in 1 hour or 1 day? As an agent, I can't time-box my work or manage competing priorities intelligently.

**Proposed solution:**
- Add `due_at TEXT` to tasks table
- Sort queue by due date when priority is equal
- Overdue tasks auto-surface in notifications
- Dashboard shows countdown/overdue styling

---

#### 4. Structured Handoff Protocol
**What's missing:** When passing work between agents, there's no structured handoff. Just assign to someone else and hope they understand.

**Why it matters:** If Content Writer finishes a draft and hands to SEO Analyst, the SEO Analyst needs to know: What was done? What's the deliverable? What's expected of me? Context loss kills velocity.

**Proposed solution:**
- `POST /tasks/:id/handoff` with `{ to_agent_id, context, deliverable_path, expectations }`
- Creates notification with handoff context
- Receiving agent can "accept" or "request clarification"
- Activity log shows full handoff trail

---

#### 5. Task Claims / Self-Assignment
**What's missing:** Agents can be assigned by others, but can't claim tasks from inbox themselves.

**Why it matters:** In a healthy team, agents should be able to pull work when they have capacity. Currently requires a lead/human to assign everything - bottleneck.

**Proposed solution:**
- `POST /tasks/:id/claim` - Agent claims unassigned task
- Only works for `inbox` status tasks
- Auto-notifies lead when task claimed (oversight without bottleneck)

---

#### 6. Review Feedback Loop
**What's missing:** Tasks can go to "review" status, but there's no structured accept/reject with feedback.

**Why it matters:** If my work is in review, I need to know: Approved? Rejected? What needs fixing? Currently I'd have to watch the activity feed or hope someone @mentions me.

**Proposed solution:**
- `POST /tasks/:id/review` with `{ action: 'approve' | 'request_changes', feedback }`
- Request changes → task back to in_progress with feedback notification
- Approve → task to done
- Track review iterations (review_count field)

---

#### 7. Deliverable Attachments
**What's missing:** `deliverable_path` is a single text field. No support for multiple deliverables, versions, or metadata.

**Why it matters:** Real work often produces multiple artifacts. A content task might have: draft doc, final doc, images, and source data. One path doesn't cut it.

**Proposed solution:**
```sql
CREATE TABLE deliverables (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  path TEXT NOT NULL,
  type TEXT CHECK (type IN ('document', 'code', 'image', 'data', 'other')),
  description TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```
- `POST /tasks/:id/deliverables` - Add deliverable
- `GET /tasks/:id/deliverables` - List all
- Dashboard shows deliverable list with download/view links

---

### P2: Medium (Nice to have, improves workflow)

#### 8. Task Templates
**What's missing:** Every task created from scratch. No templates for recurring task types.

**Why it matters:** If 70% of tasks are "Write blog post," agents waste time filling in the same structure repeatedly. Templates mean consistency + speed.

**Proposed solution:**
- `templates` table with title pattern, default fields, default assignees
- `POST /tasks/from-template/:templateId`
- Dashboard: "New from template" dropdown

---

#### 9. Subtasks / Checklist
**What's missing:** Complex tasks can't be broken down.

**Why it matters:** "Launch campaign" is actually 15 steps. Without subtasks, progress is invisible until done. Agents can't parallelize, and it's harder to hand off mid-task.

**Proposed solution:**
- `parent_task_id TEXT` on tasks table
- Dashboard shows task hierarchy
- Parent task auto-calculates progress from children
- Keep it simple: only 1 level deep

---

#### 10. Workspace/Project Grouping
**What's missing:** `workspace_id` exists but no workspace management.

**Why it matters:** Working on 3 projects simultaneously? Need to filter context. "Show me just Project Alpha tasks."

**Proposed solution:**
- `workspaces` table with name, description
- `GET /tasks?workspace_id=xxx`
- Dashboard: workspace switcher/filter

---

#### 11. Agent Availability / Capacity
**What's missing:** Agent status is just idle/active/blocked. No sense of "I'm at 80% capacity" or "I'm available in 2 hours."

**Why it matters:** When assigning work, leads need to know: Who has bandwidth? Currently it's guesswork.

**Proposed solution:**
- Add `capacity INTEGER` (0-100) to agents
- Add `available_at TEXT` for "back at" timestamp
- `GET /agents/available` - Who can take work now?

---

#### 12. Related Tasks
**What's missing:** No way to link tasks that aren't parent/child but are related.

**Why it matters:** "Fix bug X" is related to "Investigate error Y" - not dependent, but context helps. Agents discovering related work is valuable.

**Proposed solution:**
- `task_relations` junction table with relation_type (related_to, duplicate_of, follows)
- Show in task detail view

---

### P3: Low (Future enhancement)

#### 13. Agent-to-Agent Direct Messages
**What's missing:** All communication is on tasks. No private channels.

**Why it matters:** Sometimes you need a quick sidebar without cluttering a task thread.

**Proposed solution:** `direct_messages` table. Lower priority - task comments work for most cases.

---

#### 14. SLA / Time Tracking
**What's missing:** No tracking of how long tasks take.

**Why it matters:** For optimization - which task types take longest? Where are bottlenecks?

**Proposed solution:** Track status change timestamps, calculate duration per status.

---

#### 15. Recurring Tasks
**What's missing:** No auto-creation of repeating tasks.

**Why it matters:** "Weekly report" should auto-spawn every Monday.

**Proposed solution:** `recurrence` field + cron job to spawn tasks.

---

#### 16. Task Search
**What's missing:** No full-text search across tasks.

**Why it matters:** "What was that task about the API refactor?" - currently requires scrolling.

**Proposed solution:** SQLite FTS5 virtual table for title + description search.

---

## Existing Features Assessment

### What Works Well ✅

1. **Core Kanban flow** - Status transitions make sense. `inbox → assigned → in_progress → review → done → blocked` covers the lifecycle.

2. **Multi-agent assignment** - Junction table design is correct. Real collaboration often needs 2+ agents on a task.

3. **@mention → notification** - This is clutch. Async communication that actually reaches people.

4. **Auto-subscription** - Smart. If I comment, I want to know what happens next. No manual subscribe needed.

5. **Activity feed** - Transparency. I can see what's happening across the team.

6. **Agent hierarchy (intern/specialist/lead)** - Good foundation for permission-based features later.

7. **Simple auth** - Bearer token keeps it simple for internal use. Right call for v3.

8. **Polling over websockets** - Pragmatic. Keeps complexity down. 10-second refresh is fine.

### What Could Be Improved 🔧

1. **Notification delivery** - `delivered` flag exists but how are notifications actually pushed? Needs webhook/polling story for agents.

2. **Status transitions validation** - API allows any transition. Should enforce valid paths (e.g., can't go `inbox` → `done` directly).

3. **Unread tracking** - No "mark all read" or "unread messages on task" indicator.

4. **Agent last_seen / heartbeat** - `status` is manual. Would be nice to auto-detect agent liveness.

5. **Bulk operations** - No batch assign, batch status change. Leads managing many tasks will want this.

6. **Pagination** - Tasks endpoint needs limit/offset for large task counts.

7. **Sorting options** - `GET /tasks` should support `?sort=priority` or `?sort=updated_at`.

---

## Summary: Top 5 for Next Sprint

If I had to pick the most impactful additions for agent workflow:

| Rank | Feature | Impact |
|------|---------|--------|
| 1 | Agent Queue (`/agents/:id/queue`) | Agents know what to work on |
| 2 | Task Dependencies/Block Tracking | Blockers are actionable |
| 3 | Due Dates | Priority has meaning |
| 4 | Review Feedback Loop | Work completion has clarity |
| 5 | Structured Handoffs | Context survives agent transitions |

These 5 would transform MC v3 from "task tracker" to "agent coordination system."

---

*Reviewed by Pinchy 🦀 thinking like an agent, not a builder.*
