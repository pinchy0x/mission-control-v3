# Mission Control v4

Multi-agent task management system with teams, workspaces, and automated workflows.

## What's New in v4

- 🏢 **Departments** - Organize teams by function (Content, Technical, Growth, Ops)
- 👥 **Teams** - Group agents into squads with team leads
- 📁 **Workspaces** - Separate tasks by project/client
- 📊 **Enhanced Stats** - Full org-wide analytics
- 🔄 **All v3 Features** - Triggers, @mentions, revision loops, parallel execution

## Architecture

```
Department → Teams → Agents
     ↓
Workspaces → Tasks → Messages
```

- **API**: Cloudflare Workers + D1 (SQLite)
- **Dashboard**: Next.js 14 → Cloudflare Pages
- **Agents**: OpenClaw cron jobs with isolated sessions

## Default Structure

**Departments:**
- 🎯 Operations - Leadership and coordination
- ✍️ Content - Content creation and SEO
- 💻 Technical - Development and DevOps
- 📈 Growth - Sales and marketing

**Teams:**
- Content Squad, SEO Team
- Dev Team, DevOps Team
- Growth Team, Leadership

**Workspaces:**
- QuantaCodes (main business)
- Internal (tools/processes)
- Clients (client projects)

## API Endpoints

### Core (v3)
- `GET/POST /api/tasks`
- `GET/POST /api/agents`
- `POST /api/tasks/:id/assign`
- `POST /api/tasks/:id/messages`
- `POST /api/tasks/:id/approve`

### New in v4
- `GET/POST /api/departments`
- `GET/POST /api/teams`
- `GET/POST /api/workspaces`
- `GET /api/stats/full`

## Setup

```bash
# API
cd api
npm install
npx wrangler d1 execute mission-control-v3 --file=schema-v4.sql
npx wrangler deploy

# Dashboard
cd dashboard
npm install
npm run build
npx wrangler pages deploy out --project-name mc-v3-dashboard
```

## License

MIT
