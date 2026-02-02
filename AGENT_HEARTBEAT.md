# Agent Heartbeat Protocol

How agents automatically pick up and work tasks.

---

## Heartbeat Flow

```
Every 15 minutes:
1. Check notifications → handle @mentions
2. Check assigned queue → continue work
3. Check inbox → auto-claim matching tasks
4. Work on current task
```

---

## Auto-Claim Logic

### Step 1: Check Current Load
```bash
# Get agent's active tasks
curl -H "Authorization: Bearer mc-v3-token-2026" \
  "https://mc-v3-api.saurabh-198.workers.dev/api/agents/{AGENT_ID}/queue"
```

**Limits by level:**
- Intern: 1 active task
- Specialist: 3 active tasks  
- Lead: No limit

### Step 2: Find Matching Tasks in Inbox
```bash
# Get inbox tasks
curl -H "Authorization: Bearer mc-v3-token-2026" \
  "https://mc-v3-api.saurabh-198.workers.dev/api/tasks?status=inbox"
```

**Matching criteria by agent:**

| Agent | Claims tasks with... |
|-------|---------------------|
| Content Writer | tags: `content`, `blog`, `copy` OR title contains: writing, article, post, draft |
| SEO Analyst | tags: `seo`, `keywords`, `audit` OR title contains: SEO, keyword, search, ranking |
| Jarvis (Lead) | Can claim anything, but prioritizes unassigned urgent tasks |

### Step 3: Claim Task
```bash
curl -X POST -H "Authorization: Bearer mc-v3-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "{AGENT_ID}"}' \
  "https://mc-v3-api.saurabh-198.workers.dev/api/tasks/{TASK_ID}/claim"
```

### Step 4: Start Working
```bash
# Update status to in_progress
curl -X PATCH -H "Authorization: Bearer mc-v3-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}' \
  "https://mc-v3-api.saurabh-198.workers.dev/api/tasks/{TASK_ID}"
```

---

## Work Loop

Once a task is claimed:

1. **Read task details**
   ```bash
   curl -H "Authorization: Bearer mc-v3-token-2026" \
     "https://mc-v3-api.saurabh-198.workers.dev/api/tasks/{TASK_ID}"
   ```

2. **Do the work** (based on agent skills)

3. **Post progress/output as comment**
   ```bash
   curl -X POST -H "Authorization: Bearer mc-v3-token-2026" \
     -H "Content-Type: application/json" \
     -d '{"from_agent_id": "{AGENT_ID}", "content": "Draft complete:\n\n{CONTENT}"}' \
     "https://mc-v3-api.saurabh-198.workers.dev/api/tasks/{TASK_ID}/messages"
   ```

4. **If deliverable, set path**
   ```bash
   curl -X PATCH -H "Authorization: Bearer mc-v3-token-2026" \
     -H "Content-Type: application/json" \
     -d '{"deliverable_path": "/path/to/output.md"}' \
     "https://mc-v3-api.saurabh-198.workers.dev/api/tasks/{TASK_ID}"
   ```

5. **Submit for review**
   ```bash
   curl -X PATCH -H "Authorization: Bearer mc-v3-token-2026" \
     -H "Content-Type: application/json" \
     -d '{"status": "review"}' \
     "https://mc-v3-api.saurabh-198.workers.dev/api/tasks/{TASK_ID}"
   ```

---

## Complete Heartbeat Script (for agents)

```
HEARTBEAT START

1. GET /api/notifications/{MY_ID}?unread=true
   → If mentions, respond to them

2. GET /api/agents/{MY_ID}/queue
   → If task in_progress, continue working on it
   → If task assigned, start it (move to in_progress)

3. IF queue count < limit:
   GET /api/tasks?status=inbox
   → Filter for tasks matching my skills
   → POST /api/tasks/{id}/claim on first match

4. Work on current task:
   → Read task details
   → Do the work
   → Post output as comment
   → Move to review when done

HEARTBEAT END
```

---

## Tags to Create

For auto-claim matching to work well, create these tags:

```bash
# Content tags
curl -X POST -H "Authorization: Bearer mc-v3-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"name": "content", "color": "#8b5cf6"}' \
  "https://mc-v3-api.saurabh-198.workers.dev/api/tags"

curl -X POST -H "Authorization: Bearer mc-v3-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"name": "blog", "color": "#8b5cf6"}' \
  "https://mc-v3-api.saurabh-198.workers.dev/api/tags"

# SEO tags  
curl -X POST -H "Authorization: Bearer mc-v3-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"name": "seo", "color": "#22c55e"}' \
  "https://mc-v3-api.saurabh-198.workers.dev/api/tags"

curl -X POST -H "Authorization: Bearer mc-v3-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"name": "keywords", "color": "#22c55e"}' \
  "https://mc-v3-api.saurabh-198.workers.dev/api/tags"
```

---

## Example: Content Writer Heartbeat

```
I am Content Writer (✍️). Checking in.

1. Notifications: None unread
2. My queue: 1 task in_progress ("Blog post about AI agents")
3. Continuing work on current task...

[Does the writing work]

4. Posting draft as comment
5. Moving to review

Done. Next heartbeat in 15 minutes.
```
