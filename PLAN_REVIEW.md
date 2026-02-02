# Mission Control v3 - Plan Review

**Reviewer:** Pinch (Subagent)  
**Date:** 2025-01-31  
**Files Reviewed:** IMPROVEMENT_PLAN.md, ARCHITECTURE.md, api/src/index.ts  
**Reference:** Bhanu's Mission Control UI

---

## Verdict

### ⚠️ APPROVED WITH CHANGES

The plan is solid but has priority sequencing issues and underestimates complexity in a few areas. Fix these before starting.

---

## Priority Adjustments

### Current vs Recommended Order

| Current | Item | Recommended | Reason |
|---------|------|-------------|--------|
| 1 (P0) | Agent Queue View | **1 (P0)** ✓ | Correct - foundational |
| 2 (P0) | Task Dependencies | **6 (P1)** ↓ | Over-engineered for v3, not visible in reference |
| 3 (P1) | Due Dates | **2 (P0)** ↑ | Already have column, trivial, blocks queue sorting |
| 4 (P1) | Task Tags | **3 (P0)** ↑ | Extremely prominent in reference UI, high impact |
| 5 (P1) | Header Stats | **4 (P1)** ✓ | Quick win, visible impact |
| 6 (P1) | Better Live Feed | **5 (P1)** ✓ | Important but needs reference agent counts |
| 7 (P1) | Review Feedback Loop | **7 (P1)** ✓ | Correct |
| 8 (P2) | Agent Status Display | **8 (P2)** ✓ | Correct |
| 9 (P2) | Task Self-Assignment | **9 (P2)** ✓ | Correct |
| 10 (P2) | Workspace Selector | **10 (P2)** ✓ | Correct |

### Why Demote Dependencies?

Looking at Bhanu's reference:
- No visible dependency indicators on cards
- "Blocked" is handled via status, not dependency trees
- Full dependency management (cycle detection, cascading status changes, notifications) is complex
- Better to nail the visible features first, add dependencies in v4 if needed

---

## Technical Concerns

### 1. Task Dependencies (Now P1, Item 6)

**Issues:**
```
❌ No circular dependency detection
❌ Auto-setting 'blocked' status is dangerous
   - Task A blocked by B and C
   - B completes → what status? Still blocked by C
   - Need dependency count tracking or different approach
❌ Effort severely underestimated
```

**Fix:** Simplify to just `blocked_by_task_id` single column on tasks table (nullable). No junction table. One blocker per task is enough for v3.

```sql
-- Instead of junction table, just:
ALTER TABLE tasks ADD COLUMN blocked_by_task_id TEXT REFERENCES tasks(id);
```

**Revised effort:** If keeping junction table approach: 4-5 hrs. If simplified: 1-2 hrs.

---

### 2. Agent Queue Endpoint

**Issues:**
```
⚠️ Missing sort order specification
⚠️ Should include blocked status context
```

**Fix:** Define the sort order explicitly:
```
1. Urgent priority first
2. Then by due_date (nulls last)
3. Then by created_at (oldest first)
```

**Endpoint should return:**
```typescript
{
  tasks: [{
    ...task,
    blocked_reason?: string,  // If blocked
    is_overdue: boolean,      // due_date < now
    assignee_position: number // 1st, 2nd assignee (for multi-assign)
  }]
}
```

---

### 3. Tags Schema

**Issues:**
```
⚠️ No workspace scoping - tags will collide across workspaces
⚠️ No validation on color field
```

**Fix:**
```sql
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#gray' CHECK (color GLOB '#[0-9a-fA-F]*' OR color IN ('gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple')),
  workspace_id TEXT,  -- Add this
  UNIQUE(name, workspace_id)
);
```

---

### 4. Activities Filtering

**Issue:** Plan says `?type=comment` but schema stores `'message_sent'`. Naming mismatch.

**Fix:** Either:
- A) Use schema names in API: `?type=message_sent`
- B) Map friendly names: `comment` → `message_sent`, `status` → `task_status_changed`

Recommend B for better DX.

---

### 5. Header Stats Endpoint

**Missing fields for reference parity:**
```typescript
// Current plan
{ agentsActive, tasksInQueue, tasksInProgress }

// Should be
{
  agentsActive: number,
  agentsTotal: number,
  tasksByStatus: {
    inbox: number,
    assigned: number,
    in_progress: number,
    review: number,
    done: number
  },
  // For live feed pagination
  activitiesTotal: number
}
```

---

### 6. Review Feedback Loop

**Missing:** What feedback format?

**Add:**
```typescript
POST /api/tasks/:id/reject
{
  feedback: string,       // Required
  from_agent_id: string,  // Who rejected
  reassign_to?: string    // Optional: different agent
}
```

Should auto-create a message with the feedback (not just change status).

---

## Missing Features (From Reference)

### High Priority (Should Add to Plan)

| Feature | In Reference | Notes |
|---------|--------------|-------|
| **Urgent visual indicator** | Red bar on left of urgent cards | Just CSS, but needs frontend work |
| **Agent activity counts** | "Jarvis 17", "Quill 22" in filter | Need aggregation query |
| **Relative time display** | "about 5 hours ago" | Use `timeago.js` or similar |
| **Task count per column** | "INBOX (11)" header | Already available via stats, just display |

### Medium Priority (Nice to Have)

| Feature | In Reference | Notes |
|---------|--------------|-------|
| **Pagination indicator** | "1 / 35 active" | For live feed |
| **Docs button/integration** | Visible in header | Out of scope for v3? |
| **Workspace display in header** | "SiteGPT" dropdown | Part of item 10 |

### Already Covered ✓

- Agent role badges (LEAD/SPC/INT)
- Working status indicator
- Tag pills on cards
- Live feed tabs

---

## Effort Estimate Corrections

| Item | Original | Revised | Delta |
|------|----------|---------|-------|
| Agent Queue View | 1-2 hrs | 1-2 hrs | ✓ |
| Task Dependencies | 2-3 hrs | 4-5 hrs (or 1-2 hrs if simplified) | ⚠️ +2 hrs |
| Due Dates | 1-2 hrs | 1 hr | ✓ |
| Task Tags | 2-3 hrs | 2-3 hrs | ✓ |
| Header Stats | 1 hr | 1 hr | ✓ |
| Better Live Feed | 2-3 hrs | 3-4 hrs (with agent counts) | ⚠️ +1 hr |
| Review Feedback | 1-2 hrs | 2 hrs | ✓ |
| Agent Status Display | 1 hr | 30 min | ✓ |
| Self-Assignment | 30 min | 30 min | ✓ |
| Workspace Selector | 2-3 hrs | 2-3 hrs | ✓ |

**Revised Total:** 17-23 hrs (was 14-18)

---

## Risks

### 1. No Migration Strategy 🔴

**Problem:** Plan mentions schema changes but no migration path.

**Fix:** Add to plan:
```bash
# For each schema change, create migration file:
# api/migrations/002_add_tags.sql

-- Up
CREATE TABLE tags (...);
CREATE TABLE task_tags (...);

-- Down  
DROP TABLE task_tags;
DROP TABLE tags;

# Run with: wrangler d1 execute mission-control-v3 --file migrations/002_add_tags.sql
```

### 2. Breaking API Changes 🟡

**Problem:** Adding fields is safe, but changing response structure could break dashboard.

**Mitigation:** 
- Only ADD fields, never remove
- Version API if structure changes needed: `/api/v2/tasks`

### 3. Polling Performance 🟡

**Problem:** `/api/activities` will get slow as data grows.

**Fix:** Add index NOW:
```sql
CREATE INDEX idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX idx_activities_agent_id ON activities(agent_id);
CREATE INDEX idx_activities_task_id ON activities(task_id);
```

### 4. D1 Batch Limits 🟡

**Problem:** `notifySubscribers` uses batch insert. D1 has limits.

**Check:** D1 batch limit is 100 statements. Should be fine for now, but add chunking if >100 subscribers.

---

## Quick Wins (Do First)

These can be knocked out in <30 min each:

1. **Add missing indexes** - Prevents future perf issues
2. **Due dates display** - Column exists, just include in responses
3. **Agent status badge** - Pure frontend CSS
4. **Task count in column headers** - Already have data

---

## Top 3 Recommendations Before Starting

### 1. Simplify Dependencies → Single `blocked_by_task_id` Column

Don't build a full dependency graph. One blocker per task. Can upgrade later if needed. This drops 2-3 hours of work.

### 2. Reorder Sprints

**New Sprint 1 (Quick Wins + Agent UX):**
1. Due Dates (have column, just use it)
2. Agent Queue View
3. Task Tags (high visual impact)
4. Header Stats

**New Sprint 2 (Polish):**
5. Better Live Feed (with agent counts)
6. Agent Status Display
7. Urgent task indicator (red bar)

**New Sprint 3 (Workflow):**
8. Review Feedback Loop
9. Task Dependencies (simplified)
10. Self-Assignment
11. Workspace Selector

### 3. Add Database Indexes Immediately

Before any feature work:
```sql
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_task_assignees_agent ON task_assignees(agent_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);
```

---

## Summary

| Aspect | Assessment |
|--------|------------|
| Priority order | Needs adjustment - Tags up, Dependencies down |
| Technical approach | Mostly sound, Dependencies over-engineered |
| Effort estimates | ~20% underestimated |
| Missing items | 4 visual features from reference |
| Quick wins | 4 items can be done in <2 hrs total |
| Risks | Migration strategy missing, add indexes |

**Ready to execute with above changes.** 🦀
