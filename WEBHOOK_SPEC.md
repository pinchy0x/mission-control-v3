# Event-Driven Agent Triggers - Specification

## Problem Statement

**Current flow:** Agents poll for work every 15 minutes via cron jobs.

```
[Task Assigned] → ... up to 15 min wait ... → [Cron fires] → [Agent sees assignment]
[@Mention]      → ... up to 15 min wait ... → [Cron fires] → [Agent responds]
```

**Desired flow:** Agents respond instantly when assigned or mentioned.

```
[Task Assigned] → [Trigger fires] → [Agent sees assignment immediately]
[@Mention]      → [Trigger fires] → [Agent responds immediately]
```

---

## Events to Handle

| Event | Trigger Condition | Which Agent |
|-------|-------------------|-------------|
| `task_assigned` | Task assigned to agent via `/api/tasks/:id/assign` | Assigned agent |
| `mention_created` | Message contains `@AgentName` | Mentioned agent |
| `task_rejected` | Task rejected and sent back for revision | Assigned agent(s) |

---

## Architecture Decision: Pending Triggers Table

**Why not direct HTTP to gateway?**
- Gateway runs on local machine (127.0.0.1:18789)
- Cloudflare Workers can't reach localhost
- Exposing gateway publicly creates security risks

**Why not Cloudflare Queues?**
- Adds complexity (queue setup, consumer workers)
- Overkill for internal use case
- Queues require pro plan or billable usage

**Solution: D1 pending triggers + fast local poller**

1. API writes trigger to `pending_triggers` table in D1
2. Local machine runs a fast poller (every 30 seconds)
3. Poller claims and executes triggers via `openclaw cron run --force`
4. Poller marks trigger as completed

This approach:
- Works within Cloudflare free tier
- No external exposure needed
- Simple to implement and debug
- Reliable (D1 is the source of truth)

---

## Database Schema Addition

```sql
CREATE TABLE pending_triggers (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  cron_job_id TEXT NOT NULL,  -- OpenClaw cron job ID
  event_type TEXT NOT NULL CHECK (event_type IN ('task_assigned', 'mention_created', 'task_rejected')),
  task_id TEXT,
  message_id TEXT,
  context TEXT,  -- JSON with extra context
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TEXT DEFAULT (datetime('now')),
  claimed_at TEXT,
  completed_at TEXT,
  error TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX idx_pending_triggers_status ON pending_triggers(status);
CREATE INDEX idx_pending_triggers_agent ON pending_triggers(agent_id);
```

---

## Agent to Cron Job Mapping

Store in the `agents` table or hardcoded:

| Agent ID | Agent Name | Cron Job ID |
|----------|-----------|-------------|
| `9d59c008-49ef-4c` | Content Writer | `eb745829-dc73-40f7-bbe1-8d2596ed0e63` |
| `1432c7a3-f144-42` | SEO Analyst | `a1813310-288b-4a9a-b45d-6aec06b6be45` |
| `8f9b070f-c98c-4c` | Jarvis | `07f1e8e8-ce6b-4751-82f1-645aafb452fc` |

**Proposal:** Add `cron_job_id` column to agents table for cleaner mapping.

---

## API Changes

### 1. Add cron_job_id to agents

```sql
ALTER TABLE agents ADD COLUMN cron_job_id TEXT;

-- Update existing agents
UPDATE agents SET cron_job_id = 'eb745829-dc73-40f7-bbe1-8d2596ed0e63' WHERE id = '9d59c008-49ef-4c';
UPDATE agents SET cron_job_id = 'a1813310-288b-4a9a-b45d-6aec06b6be45' WHERE id = '1432c7a3-f144-42';
UPDATE agents SET cron_job_id = '07f1e8e8-ce6b-4751-82f1-645aafb452fc' WHERE id = '8f9b070f-c98c-4c';
```

### 2. Helper: Create Pending Trigger

```typescript
async function createPendingTrigger(
  db: D1Database,
  agentId: string,
  eventType: 'task_assigned' | 'mention_created' | 'task_rejected',
  taskId?: string,
  messageId?: string,
  context?: object
) {
  // Get agent's cron job ID
  const agent = await db.prepare(
    'SELECT cron_job_id FROM agents WHERE id = ?'
  ).bind(agentId).first() as any;
  
  if (!agent?.cron_job_id) {
    console.log(`No cron_job_id for agent ${agentId}, skipping trigger`);
    return;
  }
  
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  
  await db.prepare(`
    INSERT INTO pending_triggers (id, agent_id, cron_job_id, event_type, task_id, message_id, context)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    agentId,
    agent.cron_job_id,
    eventType,
    taskId || null,
    messageId || null,
    context ? JSON.stringify(context) : null
  ).run();
  
  console.log(`Created trigger ${id} for agent ${agentId}: ${eventType}`);
}
```

### 3. Modify `/api/tasks/:id/assign`

After assignment, add:
```typescript
// Create instant trigger for assigned agent
await createPendingTrigger(c.env.DB, agentId, 'task_assigned', taskId, null, {
  task_title: task?.title
});
```

### 4. Modify `/api/tasks/:id/messages` (mention detection)

After detecting mention, add:
```typescript
// Create instant trigger for mentioned agent
await createPendingTrigger(c.env.DB, mentionedAgent.id, 'mention_created', taskId, id, {
  mentioned_by: agent?.name,
  message_preview: body.content.slice(0, 100)
});
```

### 5. Modify `/api/tasks/:id/reject`

After rejection, add:
```typescript
// Create instant trigger for assignees to revise
for (const assignee of assignees.results as any[]) {
  if (assignee.agent_id !== agentId) {
    await createPendingTrigger(c.env.DB, assignee.agent_id, 'task_rejected', taskId, msgId, {
      rejected_by: (agent as any).name,
      feedback_preview: feedback.slice(0, 100)
    });
  }
}
```

### 6. New Endpoint: POST /api/triggers/claim

Atomically claim pending triggers for processing (prevents race conditions):

```typescript
app.post('/api/triggers/claim', async (c) => {
  const body = await c.req.json();
  const limit = body.limit || 5;
  const claimant = body.claimant || 'default';  // Identifier for this poller instance
  
  // Atomic claim: select and update in one transaction-like operation
  // First, get IDs of pending triggers
  const pending = await c.env.DB.prepare(`
    SELECT id FROM pending_triggers
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT ?
  `).bind(limit).all();
  
  if (pending.results.length === 0) {
    return c.json({ triggers: [], claimed: 0 });
  }
  
  const ids = (pending.results as any[]).map(t => t.id);
  const placeholders = ids.map(() => '?').join(',');
  
  // Update status to processing (atomic claim)
  await c.env.DB.prepare(`
    UPDATE pending_triggers 
    SET status = 'processing', claimed_at = datetime('now')
    WHERE id IN (${placeholders}) AND status = 'pending'
  `).bind(...ids).run();
  
  // Fetch the claimed triggers with full data
  const claimed = await c.env.DB.prepare(`
    SELECT * FROM pending_triggers
    WHERE id IN (${placeholders}) AND status = 'processing'
  `).bind(...ids).all();
  
  return c.json({ 
    triggers: claimed.results,
    claimed: claimed.results.length
  });
});
```

### 7. New Endpoint: PATCH /api/triggers/:id

For the poller to update trigger status:

```typescript
app.patch('/api/triggers/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  const updates: string[] = [];
  const values: any[] = [];
  
  if (body.status) {
    updates.push('status = ?');
    values.push(body.status);
    
    if (body.status === 'processing') {
      updates.push("claimed_at = datetime('now')");
    } else if (body.status === 'completed' || body.status === 'failed') {
      updates.push("completed_at = datetime('now')");
    }
  }
  
  if (body.error) {
    updates.push('error = ?');
    values.push(body.error);
  }
  
  if (updates.length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }
  
  values.push(id);
  
  await c.env.DB.prepare(
    `UPDATE pending_triggers SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();
  
  return c.json({ success: true });
});
```

---

## Local Poller Script

Create `scripts/trigger-poller.sh`:

```bash
#!/bin/bash
# Trigger Poller - Checks for pending triggers and fires them
# Run via cron: * * * * * /path/to/trigger-poller.sh (every minute)

API_URL="https://mc-v3-api.saurabh-198.workers.dev"
API_TOKEN="mc-v3-token-2026"

# Fetch pending triggers
TRIGGERS=$(curl -s -H "Authorization: Bearer $API_TOKEN" "$API_URL/api/triggers/pending?limit=5")

# Parse and process each trigger
echo "$TRIGGERS" | jq -r '.triggers[] | @base64' | while read trigger_b64; do
  trigger=$(echo "$trigger_b64" | base64 -d)
  
  id=$(echo "$trigger" | jq -r '.id')
  cron_job_id=$(echo "$trigger" | jq -r '.cron_job_id')
  event_type=$(echo "$trigger" | jq -r '.event_type')
  
  echo "Processing trigger $id: $event_type -> cron $cron_job_id"
  
  # Mark as processing
  curl -s -X PATCH -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status": "processing"}' \
    "$API_URL/api/triggers/$id" > /dev/null
  
  # Fire the cron job
  if openclaw cron run "$cron_job_id" --force --timeout 30000 2>&1; then
    # Mark as completed
    curl -s -X PATCH -H "Authorization: Bearer $API_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"status": "completed"}' \
      "$API_URL/api/triggers/$id" > /dev/null
    echo "Trigger $id completed"
  else
    # Mark as failed
    curl -s -X PATCH -H "Authorization: Bearer $API_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"status": "failed", "error": "cron run failed"}' \
      "$API_URL/api/triggers/$id" > /dev/null
    echo "Trigger $id failed"
  fi
done
```

**Alternative: OpenClaw Cron Job for Poller**

Instead of system cron, add an OpenClaw cron job that runs every minute:

```bash
openclaw cron add "Trigger Poller" \
  --schedule "cron * * * * * @ Asia/Kolkata" \
  --prompt "Check for pending triggers at https://mc-v3-api.saurabh-198.workers.dev/api/triggers/pending and execute them using openclaw cron run <cron_job_id> --force"
```

---

## Deduplication & Rate Limiting

To prevent trigger spam (e.g., multiple mentions in quick succession):

```typescript
async function createPendingTrigger(...) {
  // Check for recent duplicate
  const recent = await db.prepare(`
    SELECT id FROM pending_triggers
    WHERE agent_id = ? 
    AND event_type = ?
    AND task_id = ?
    AND status IN ('pending', 'processing')
    AND created_at > datetime('now', '-2 minutes')
  `).bind(agentId, eventType, taskId).first();
  
  if (recent) {
    console.log(`Skipping duplicate trigger for agent ${agentId}`);
    return;
  }
  
  // Create trigger...
}
```

---

## Expected Latency

| Component | Latency |
|-----------|---------|
| API writes trigger to D1 | ~50ms |
| Poller checks for triggers | Every 30-60 seconds |
| Cron run execution | ~2-5 seconds to spawn |
| **Total worst case** | ~65 seconds |
| **Total best case** | ~5 seconds |

This is a massive improvement over 15 minute polling!

---

## Testing Plan

### Test 1: Assignment Trigger
1. Create a task in inbox
2. Assign it to Content Writer
3. Verify trigger appears in `pending_triggers`
4. Verify poller picks it up
5. Verify agent actually runs

### Test 2: Mention Trigger
1. Create task with Content Writer assigned
2. Post message with `@SEO-Analyst`
3. Verify trigger created for SEO Analyst
4. Verify SEO Analyst fires

### Test 3: Rejection Trigger
1. Create task, assign to Content Writer
2. Move to review
3. Jarvis rejects with feedback
4. Verify trigger fires for Content Writer

### Test 4: Full E2E Loop
1. Create task "Write blog post about webhooks"
2. Assign to Content Writer → verify instant fire
3. Writer drafts, submits for review
4. Jarvis reviews, @mentions Writer for changes
5. Verify instant response to mention
6. Writer revises, resubmits
7. Jarvis approves

---

## Migration Steps

1. ✅ Run SQL to add `pending_triggers` table
2. ✅ Run SQL to add `cron_job_id` column to agents
3. ✅ Update agent records with cron job IDs
4. ✅ Deploy API changes
5. ✅ Set up trigger poller (OpenClaw cron job `69bd6f02-ed8a-4367-aed9-8a7f8f733891`)
6. ✅ Test each trigger type
7. Monitor for a day
8. Consider reducing regular heartbeat frequency (15min → 30min)

## Implementation Status (2026-02-02)

**Completed:**
- Database schema updated with `pending_triggers` table
- Agents updated with `cron_job_id` field
- API endpoints added: `/api/triggers/claim`, `PATCH /api/triggers/:id`, `GET /api/triggers`
- Trigger creation integrated into: assign, messages (mentions), reject endpoints
- Trigger poller cron job running every minute

**Tested:**
- ✅ task_assigned trigger: Created when agent assigned to task
- ✅ mention_created trigger: Created when @AgentName detected in message
- ✅ task_rejected trigger: Created when task rejected and sent back
- ✅ Atomic claim prevents race conditions
- ✅ Deduplication prevents spam (2-minute window)
- ✅ Poller claims and fires cron jobs

**Known Limitations:**
- Agent names with spaces (e.g., "SEO Analyst") can't be mentioned with `@SEO Analyst`
- Workaround: Use hyphenated names in DB or single-word names for mention support
- Current agents: Jarvis (works), Content Writer/SEO Analyst (need rename for mentions)

---

## Rollback Plan

If issues arise:
1. Disable the trigger poller
2. System falls back to normal 15-min polling
3. Pending triggers remain in DB but are ignored
4. No data loss, no breaking changes

---

## Future Enhancements

1. **WebSocket push** - If gateway exposed via Tailscale funnel
2. **Priority triggers** - Urgent tasks get processed first
3. **Batch processing** - Fire multiple agents in parallel
4. **Metrics dashboard** - Track trigger latency and success rate
