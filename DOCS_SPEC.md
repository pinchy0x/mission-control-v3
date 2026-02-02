# Docs System Spec (Lightweight)

*Aligned with Bhanu's Mission Control design*

---

## What It Is

A simple documentation viewer - NOT a full wiki/CRUD system.

- **Docs button** in header opens a sidebar/modal
- Shows markdown files from workspace's `docs/` folder
- Agents can write deliverables here for persistent reference

---

## Implementation

### 1. Storage
```
workspaces/
  sitegpt/
    docs/
      overview.md
      features.md
      pricing-audit.md    ← agent output
      customer-research.md ← agent output
```

Just markdown files. No database tables for docs content.

### 2. API Endpoints

```
GET  /api/docs?workspace=sitegpt
     → Returns list of doc files: [{name, path, updated_at}]

GET  /api/docs/:workspace/:filename
     → Returns markdown content

POST /api/docs/:workspace/:filename
     → Creates/updates doc (for agents to write deliverables)

DELETE /api/docs/:workspace/:filename
     → Removes doc
```

Using R2 or just filesystem. ~50 LOC in the worker.

### 3. Dashboard UI

- **"Docs" button** in header (per Bhanu's design)
- Opens **sidebar** with file list
- Click file → renders markdown in main area or modal
- Simple text editor for manual edits (optional v1.1)

### 4. Agent Integration

When task type = `documentation` or `research`:
```
Agent writes to: docs/{workspace}/{slug}.md
Sets task.deliverable_path = "docs/sitegpt/pricing-audit.md"
Posts comment: "Documentation complete, see Docs > pricing-audit.md"
```

---

## What We're NOT Building

- ❌ Rich text editor
- ❌ Doc versioning/history
- ❌ Doc linking/relationships
- ❌ Search within docs (v1.1 maybe)
- ❌ Permissions per doc

---

## Effort Estimate

| Component | Time |
|-----------|------|
| API (R2 storage) | 1-2 hrs |
| Dashboard sidebar | 2-3 hrs |
| Markdown viewer | 1 hr |
| Agent output integration | 30 min |
| **Total** | ~5-6 hrs |

---

## Decision

Lightweight viewer that:
1. Gives agents a place to write reference docs
2. Lets Saurabh see agent outputs in context
3. Matches Bhanu's design intent

Approve? 🦀
