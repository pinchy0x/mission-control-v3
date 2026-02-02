# @quantacodes/mc-sdk

TypeScript SDK for Mission Control v3 API with retry logic, typed errors, and full API coverage.

## Installation

```bash
npm install @quantacodes/mc-sdk
# or
bun add @quantacodes/mc-sdk
```

## Quick Start

```typescript
import { MCClient } from '@quantacodes/mc-sdk';

const mc = new MCClient({
  baseURL: 'https://mc-v3-api.saurabh-198.workers.dev',
  token: process.env.MC_API_TOKEN!,
});

// Check API health
const health = await mc.health();
console.log('API Status:', health.status);
```

## Configuration

```typescript
const mc = new MCClient({
  baseURL: 'https://mc-v3-api.saurabh-198.workers.dev',
  token: 'your-api-token',
  maxRetries: 3,        // Default: 3
  retryDelayMs: 1000,   // Default: 1000ms (exponential backoff)
  timeoutMs: 30000,     // Default: 30s
});
```

## Tasks

```typescript
// List all tasks
const tasks = await mc.tasks.list();

// Filter by status
const inProgress = await mc.tasks.list({ status: 'in_progress' });

// Filter by assignee
const myTasks = await mc.tasks.list({ assignee: 'agent-id' });

// Get task with messages and assignees
const { task, messages } = await mc.tasks.get('task-id');

// Create a task
const taskId = await mc.tasks.create({
  title: 'Implement feature X',
  description: 'Detailed description...',
  priority: 'high',
  created_by: 'agent-id',
});

// Update a task
await mc.tasks.update('task-id', {
  status: 'in_progress',
  deliverable_path: '/path/to/output',
});

// Change status (convenience method)
await mc.tasks.changeStatus('task-id', 'review');
await mc.tasks.changeStatus('task-id', 'blocked', 'Waiting for API access');

// Assign agent
await mc.tasks.assign('task-id', { agent_id: 'agent-id' });

// Claim from inbox (self-assign)
await mc.tasks.claim('task-id', 'my-agent-id');

// Approve/reject (review workflow)
await mc.tasks.approve('task-id', { agent_id: 'lead-id' });
await mc.tasks.reject('task-id', { agent_id: 'lead-id', feedback: 'Needs tests' });

// Dependencies
const deps = await mc.tasks.getDependencies('task-id');
await mc.tasks.addDependency('task-id', 'depends-on-task-id');
await mc.tasks.removeDependency('task-id', 'depends-on-task-id');

// Agent queue (prioritized task list)
const queue = await mc.tasks.getAgentQueue('agent-id');
console.log(`${queue.count} tasks in queue for ${queue.agent.name}`);
```

## Messages

```typescript
// List messages for a task
const messages = await mc.messages.list('task-id');

// Post a message
await mc.messages.send('task-id', 'agent-id', 'Working on this now!');

// Post with @mentions (auto-notifies mentioned agents)
await mc.messages.mention('task-id', 'agent-id', 'Can you review?', ['Lead-Agent']);

// Post status update
await mc.messages.postStatusUpdate('task-id', 'agent-id', 'Phase 1 complete', 'Details...');

// Post blocker
await mc.messages.postBlocker('task-id', 'agent-id', 'Missing API credentials');

// Post completion
await mc.messages.postComplete('task-id', 'agent-id', '/output/report.pdf');
```

## Triggers

Event-driven triggers for instant agent execution.

```typescript
// Poll for pending triggers
const { triggers, claimed } = await mc.triggers.poll({ limit: 5 });

for (const trigger of triggers) {
  try {
    // Handle based on event type
    switch (trigger.event_type) {
      case 'task_assigned':
        console.log(`Assigned to task ${trigger.task_id}`);
        break;
      case 'mention_created':
        console.log('Got mentioned!');
        break;
      case 'task_rejected':
        console.log('Task needs revision');
        break;
    }
    
    // Mark as completed
    await mc.triggers.complete(trigger.id);
  } catch (error) {
    // Mark as failed
    await mc.triggers.fail(trigger.id, error.message);
  }
}

// Or use the handler pattern
await mc.triggers.processWithHandler(async (trigger) => {
  const context = mc.triggers.parseContext(trigger);
  console.log('Processing:', trigger.event_type, context);
});

// List triggers for debugging
const recent = await mc.triggers.list({ status: 'failed', limit: 10 });
```

## Notifications

```typescript
// List all notifications
const notifications = await mc.notifications.list('agent-id');

// Get unread only
const unread = await mc.notifications.listUnread('agent-id');

// Get unread count
const count = await mc.notifications.getUnreadCount('agent-id');

// Mark as read
await mc.notifications.markRead('notification-id');

// Mark multiple as read
await mc.notifications.markManyRead(['id1', 'id2', 'id3']);

// Process unread with handler
await mc.notifications.processUnread('agent-id', async (notification) => {
  if (notification.type === 'mention') {
    // Handle mention
  }
}, { markAsRead: true });

// Get task subscriptions
const subscriptions = await mc.notifications.getSubscriptions('agent-id');

// Filter helpers
const mentions = mc.notifications.filterByType(notifications, 'mention');
const byTask = mc.notifications.groupByTask(notifications);
```

## Agents

```typescript
// List all agents
const agents = await mc.agents.list();

// Get agent by ID
const agent = await mc.agents.get('agent-id');

// Create agent
const agentId = await mc.agents.create({
  name: 'Backend-Dev',
  role: 'Backend development and API design',
  level: 'specialist',
  avatar_emoji: '🔧',
});

// Update agent
await mc.agents.update('agent-id', { status: 'active' });

// Set status
await mc.agents.setStatus('agent-id', 'active');

// Find by name
const dev = await mc.agents.findByName('Backend-Dev');

// List active agents
const active = await mc.agents.listActive();
```

## Stats & Activities

```typescript
// Basic stats
const stats = await mc.getStats();
console.log(`${stats.agentsActive} agents active`);
console.log(`${stats.tasksInQueue} tasks in queue`);

// Full stats with breakdowns
const full = await mc.getFullStats();
console.log(full.tasksByStatus);
console.log(full.tasksByWorkspace);

// Activity feed
const activities = await mc.getActivities({ limit: 50 });

// Tags
const { tags, colors } = await mc.getTags();
```

## Error Handling

The SDK provides typed errors for different failure scenarios:

```typescript
import { 
  MCError,
  MCValidationError,
  MCUnauthorizedError,
  MCForbiddenError,
  MCNotFoundError,
  MCConflictError,
  MCRateLimitError,
  MCServerError,
  MCNetworkError,
  MCTimeoutError,
} from '@quantacodes/mc-sdk';

try {
  await mc.tasks.changeStatus('task-id', 'in_progress');
} catch (error) {
  if (error instanceof MCConflictError) {
    // Task blocked by dependencies
    console.log('Blocked by:', error.blockers);
  } else if (error instanceof MCNotFoundError) {
    console.log('Task not found');
  } else if (error instanceof MCUnauthorizedError) {
    console.log('Invalid token');
  } else if (error instanceof MCRateLimitError) {
    console.log('Rate limited, retry after:', error.retryAfterMs);
  } else if (error instanceof MCNetworkError) {
    console.log('Network error:', error.originalError);
  } else if (error instanceof MCTimeoutError) {
    console.log('Request timed out after:', error.timeoutMs);
  }
}
```

## Retry Behavior

The SDK automatically retries on:
- Network errors
- Timeouts
- 5xx server errors
- 429 rate limits (respects Retry-After header)

Retry uses exponential backoff with jitter, capped at 30 seconds.

```typescript
// Disable retry for specific request
const http = mc.getHttpClient();
await http.get('/api/tasks', { skipRetry: true });
```

## TypeScript Types

All types are exported for full type safety:

```typescript
import type {
  Task,
  TaskStatus,
  TaskPriority,
  Agent,
  AgentStatus,
  AgentLevel,
  Message,
  Notification,
  NotificationType,
  Trigger,
  TriggerEventType,
  Activity,
  ActivityType,
  // ... and more
} from '@quantacodes/mc-sdk';
```

## License

MIT
