# Mission Control v3

Multi-agent task management system with automated workflows.

## Features

- 🎖️ **Multi-agent collaboration** - Content Writer, SEO Analyst, Jarvis (Lead)
- 📝 **@mention-based routing** - Agents communicate via task comments
- 🔄 **Automated triggers** - Tasks auto-dispatch on assignment and mentions
- ✅ **Review workflows** - Strict quality gates with revision loops
- 🚀 **Parallel execution** - Handle multiple tasks concurrently

## Architecture

- **API**: Cloudflare Workers + D1 (SQLite)
- **Dashboard**: Next.js 14 static export → Cloudflare Pages
- **Agents**: OpenClaw cron jobs with isolated sessions

## Endpoints

- API: `https://mc-v3-api.saurabh-198.workers.dev`
- Dashboard: `https://mc-v3-dashboard.pages.dev`

## Workflow

```
Task Created → Assigned to Content-Writer
Content-Writer → writes content → @SEO-Analyst
SEO-Analyst → reviews → @Content-Writer (revisions) OR @Jarvis (approved)
Jarvis → final approval → Done
```

## Setup

### API
```bash
cd api
npm install
npx wrangler deploy
```

### Dashboard
```bash
cd dashboard
npm install
npm run build
npx wrangler pages deploy out --project-name mc-v3-dashboard
```

## License

MIT
