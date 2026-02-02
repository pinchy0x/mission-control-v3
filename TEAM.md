# Mission Control v4 - Team Setup

*Approved: 2026-02-02 21:38 IST*

## The Team

| Agent | ID | Role | Team | Heartbeat |
|-------|-----|------|------|-----------|
| 🦀 Pinchy | `8f9b070f-c98c-4c` | CEO | leadership | Main session |
| 🎖️ Backend-Tech-Lead | `c98b23af-ceb3-48` | Manager | backend-team | */5 min |
| 👨‍💻 Backend-Dev-1 | `d86531a8-361f-4e` | Developer | backend-team | */5 min |
| 👩‍💻 Backend-Dev-2 | `a2d8e655-e3bd-43` | Developer | backend-team | */5 min |
| 🔬 Researcher | `8ea3c2c8-b557-4b` | Researcher | backend-team | */5 min |
| ✍️ Content-Writer | `9d59c008-49ef-4c` | Writer | content-squad | */15 min |
| 🔍 SEO-Analyst | `1432c7a3-f144-42` | Analyst | content-squad | */15 min |

---

## Roles & Responsibilities

### 🦀 Pinchy (CEO)
- Final review and approval
- Strategic decisions
- Escalation point

### 🎖️ Backend-Tech-Lead (Manager)
- **NEVER CODES** - Manager only
- Breaks down tasks into sub-tasks
- Creates sub-tasks via MC API
- Assigns to appropriate devs/researcher
- Waits for completion
- Integrates results
- Submits to @Pinchy for review

### 👨‍💻👩‍💻 Backend-Dev-1 & Dev-2 (Developers)
- **BUILD things**
- Implement features as assigned
- **MUST spawn tester** before posting completion
- Post [DEV COMPLETE] with deliverable path
- Tag @Backend-Tech-Lead when done

### 🔬 Researcher (Investigator)
- API reverse engineering
- Documentation
- Technical research
- Tag @Backend-Tech-Lead when done

---

## The Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      TASK ARRIVES                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   🎖️ TECH LEAD                              │
│  1. Analyze task                                            │
│  2. Break into sub-tasks                                    │
│  3. Create sub-tasks via MC API                             │
│  4. Assign to appropriate agents                            │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ 🔬 Research│   │ 👨‍💻 Dev-1 │   │ 👩‍💻 Dev-2 │
        │          │   │          │   │          │
        │ Research │   │ Feature A│   │ Feature B│
        └──────────┘   └──────────┘   └──────────┘
              │               │               │
              │               ▼               ▼
              │        ┌────────────────────────┐
              │        │   Spawn Tester         │
              │        │   (each dev)           │
              │        └────────────────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   🎖️ TECH LEAD                              │
│  1. Collect results                                         │
│  2. Verify deliverables                                     │
│  3. Integrate                                               │
│  4. Submit to @Pinchy                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    🦀 PINCHY (CEO)                          │
│  1. Review                                                  │
│  2. Approve ✅ or Request Changes ❌                         │
└─────────────────────────────────────────────────────────────┘
```

---

## API Reference

### Create Sub-Task
```bash
curl -X POST -H "Authorization: Bearer mc-v3-token-2026" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "[FEATURE] Feature Name",
    "description": "Build X at /path/to/file...",
    "workspace_id": "quantacodes"
  }' \
  "https://mc-v3-api.saurabh-198.workers.dev/api/tasks"
```

### Assign to Agent
```bash
curl -X POST -H "Authorization: Bearer mc-v3-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "AGENT_ID"}' \
  "https://mc-v3-api.saurabh-198.workers.dev/api/tasks/{task_id}/assign"
```

### Agent IDs Quick Reference
| Agent | ID |
|-------|-----|
| Backend-Dev-1 | `d86531a8-361f-4e` |
| Backend-Dev-2 | `a2d8e655-e3bd-43` |
| Researcher | `8ea3c2c8-b557-4b` |

---

## Rules

1. **Tech Lead NEVER codes** - Only delegates
2. **Devs MUST spawn tester** - Before posting completion
3. **Parallel execution** - Independent features go to different devs
4. **Clear handoffs** - Always tag the next person in chain

---

## CEO Authority: Hire & Fire

Pinchy (CEO) has full authority to modify the team:

### Hiring New Agents
When no appropriate agent exists for a task:

1. **Identify Gap** - What role/skill is needed?
2. **Create Agent** - POST to /api/agents WITH `team_id`
3. **Setup Cron** - */5 min heartbeat with instructions
4. **Link Cron** - PATCH agent with cron_job_id
5. **Verify Team Assignment (MANDATORY):**
   - [ ] `team_id` is NOT null
   - [ ] `cron_job_id` is linked
   - [ ] Agent appears in Teams view on dashboard
   - [ ] Agent appears in Agents view on dashboard
6. **Audit** - Spawn sub-agent to verify full setup
7. **Approve** - Get flow approved
8. **Deploy** - Agent joins workforce

**⚠️ NEVER skip team verification. Orphan agents = invisible agents.**

### Firing Agents
When agent underperforms or role unneeded:

1. **Disable Cron** - Set enabled: false
2. **Remove from MC** - DELETE /api/agents/{id}
3. **Update Docs** - Remove from TEAM.md

### No Approval Required
CEO has autonomous hiring/firing authority.

---

*Last updated: 2026-02-02 21:40 IST*
