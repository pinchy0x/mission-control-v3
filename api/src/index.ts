import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Env = {
  DB: D1Database;
  API_TOKEN: string;
};

// Pre-defined tag color palette
const TAG_COLORS = [
  '#ef4444', // red
  '#f97316', // orange  
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6b7280', // gray
];

const app = new Hono<{ Bindings: Env }>();

// Global error handler
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: 'Internal server error', message: err.message }, 500);
});

// CORS - allow dashboard and all preview deployments
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return 'https://mc-v3-dashboard.pages.dev';
    // Allow main domain, all preview deployments, and localhost
    if (origin.endsWith('.mc-v3-dashboard.pages.dev') || 
        origin === 'https://mc-v3-dashboard.pages.dev' ||
        origin.startsWith('http://localhost')) {
      return origin;
    }
    return 'https://mc-v3-dashboard.pages.dev';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Timing-safe comparison helper
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  
  // Use subtle crypto for constant-time comparison
  const aKey = await crypto.subtle.importKey(
    'raw', aBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const bKey = await crypto.subtle.importKey(
    'raw', bBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const testData = encoder.encode('test');
  const [aSig, bSig] = await Promise.all([
    crypto.subtle.sign('HMAC', aKey, testData),
    crypto.subtle.sign('HMAC', bKey, testData)
  ]);
  
  // Compare the signatures (constant time)
  const aArr = new Uint8Array(aSig);
  const bArr = new Uint8Array(bSig);
  if (aArr.length !== bArr.length) return false;
  
  let result = 0;
  for (let i = 0; i < aArr.length; i++) {
    result |= aArr[i] ^ bArr[i];
  }
  return result === 0;
}

// Auth middleware with timing-safe comparison
app.use('/api/*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const expected = `Bearer ${c.env.API_TOKEN}`;
  const isValid = await timingSafeEqual(auth, expected);
  
  if (!isValid) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Stats with simple caching
let statsCache: { data: any; expires: number } = { data: null, expires: 0 };

app.get('/api/stats', async (c) => {
  // Return cached if fresh (5 second TTL)
  if (statsCache.data && Date.now() < statsCache.expires) {
    return c.json(statsCache.data);
  }
  
  const [agentsResult, tasksInQueueResult, tasksInProgressResult] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(DISTINCT ta.agent_id) as count FROM task_assignees ta JOIN tasks t ON ta.task_id = t.id WHERE t.status IN ('assigned', 'in_progress')").first(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM tasks WHERE status IN ('inbox', 'assigned')").first(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'in_progress'").first(),
  ]);
  
  const data = {
    agentsActive: (agentsResult as any)?.count || 0,
    tasksInQueue: (tasksInQueueResult as any)?.count || 0,
    tasksInProgress: (tasksInProgressResult as any)?.count || 0,
  };
  
  statsCache = { data, expires: Date.now() + 5000 };
  return c.json(data);
});

// ============ AGENTS ============

app.get('/api/agents', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM agents ORDER BY name').all();
  return c.json({ agents: result.results });
});

app.get('/api/agents/:id', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(c.req.param('id')).first();
  if (!result) return c.json({ error: 'Agent not found' }, 404);
  return c.json({ agent: result });
});

app.post('/api/agents', async (c) => {
  const body = await c.req.json();
  
  // Input validation
  if (!body.name?.trim()) {
    return c.json({ error: 'name is required' }, 400);
  }
  if (!body.role?.trim()) {
    return c.json({ error: 'role is required' }, 400);
  }
  
  const id = crypto.randomUUID().slice(0, 16);
  await c.env.DB.prepare(
    'INSERT INTO agents (id, name, role, level, session_key, avatar_emoji) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, body.name.trim(), body.role.trim(), body.level || 'specialist', body.session_key || null, body.avatar_emoji || '🤖').run();
  
  // Log activity
  await logActivity(c.env.DB, 'agent_status_changed', id, null, `Agent ${body.name} created`);
  
  return c.json({ id, success: true }, 201);
});

app.patch('/api/agents/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const updates: string[] = [];
  const values: any[] = [];
  
  for (const [key, value] of Object.entries(body)) {
    if (['name', 'role', 'status', 'level', 'current_task_id', 'avatar_emoji', 'cron_job_id', 'team_id', 'department'].includes(key)) {
      updates.push(`${key} = ?`);
      values.push(value);
    }
  }
  
  if (updates.length === 0) return c.json({ error: 'No valid fields to update' }, 400);
  
  updates.push('updated_at = datetime("now")');
  values.push(id);
  
  await c.env.DB.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  
  if (body.status) {
    await logActivity(c.env.DB, 'agent_status_changed', id, null, `Agent status changed to ${body.status}`);
  }
  
  return c.json({ success: true });
});

app.delete('/api/agents/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM agents WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// Agent Queue - tasks assigned to this agent, ordered by priority/due date
app.get('/api/agents/:id/queue', async (c) => {
  const agentId = c.req.param('id');
  
  // Verify agent exists
  const agent = await c.env.DB.prepare('SELECT id, name FROM agents WHERE id = ?').bind(agentId).first();
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  const result = await c.env.DB.prepare(`
    SELECT t.* FROM tasks t
    JOIN task_assignees ta ON t.id = ta.task_id
    WHERE ta.agent_id = ?
    AND t.status NOT IN ('done', 'archived')
    ORDER BY 
      CASE t.priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'normal' THEN 3 
        WHEN 'low' THEN 4 
      END,
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date ASC,
      t.created_at ASC
  `).bind(agentId).all();
  
  return c.json({ 
    agent: agent,
    queue: result.results,
    count: result.results.length
  });
});

// ============ TASKS ============

app.get('/api/tasks', async (c) => {
  const status = c.req.query('status');
  const assignee = c.req.query('assignee');
  
  let query = `
    SELECT t.*, 
      GROUP_CONCAT(DISTINCT ta.agent_id) as assignee_ids,
      GROUP_CONCAT(DISTINCT a.name) as assignee_names,
      GROUP_CONCAT(DISTINCT tg.tag_id) as tag_ids,
      GROUP_CONCAT(DISTINCT tags.name) as tag_names,
      GROUP_CONCAT(DISTINCT tags.color) as tag_colors,
      (SELECT COUNT(*) FROM task_dependencies WHERE task_id = t.id) as blocker_count,
      (SELECT COUNT(*) FROM task_dependencies td2 
       JOIN tasks t2 ON t2.id = td2.depends_on_task_id 
       WHERE td2.task_id = t.id AND t2.status != 'done') as incomplete_blocker_count
    FROM tasks t
    LEFT JOIN task_assignees ta ON t.id = ta.task_id
    LEFT JOIN agents a ON ta.agent_id = a.id
    LEFT JOIN task_tags tg ON t.id = tg.task_id
    LEFT JOIN tags ON tg.tag_id = tags.id
  `;
  
  const conditions: string[] = [];
  const bindings: any[] = [];
  
  if (status) {
    conditions.push('t.status = ?');
    bindings.push(status);
  }
  
  if (assignee) {
    conditions.push('ta.agent_id = ?');
    bindings.push(assignee);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' GROUP BY t.id ORDER BY t.created_at DESC';
  
  const stmt = c.env.DB.prepare(query);
  const result = bindings.length > 0 ? await stmt.bind(...bindings).all() : await stmt.all();
  
  // Parse assignee and tag arrays, add dependency info
  const tasks = result.results.map((t: any) => ({
    ...t,
    assignee_ids: t.assignee_ids ? t.assignee_ids.split(',') : [],
    assignee_names: t.assignee_names ? t.assignee_names.split(',') : [],
    tag_ids: t.tag_ids ? t.tag_ids.split(',') : [],
    tag_names: t.tag_names ? t.tag_names.split(',') : [],
    tag_colors: t.tag_colors ? t.tag_colors.split(',') : [],
    has_blockers: (t.blocker_count || 0) > 0,
    is_blocked: (t.incomplete_blocker_count || 0) > 0,
  }));
  
  return c.json({ tasks });
});

app.get('/api/tasks/:id', async (c) => {
  const id = c.req.param('id');
  
  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  if (!task) return c.json({ error: 'Task not found' }, 404);
  
  const assignees = await c.env.DB.prepare(`
    SELECT a.* FROM agents a
    JOIN task_assignees ta ON a.id = ta.agent_id
    WHERE ta.task_id = ?
  `).bind(id).all();
  
  const messages = await c.env.DB.prepare(`
    SELECT m.*, a.name as from_agent_name, a.avatar_emoji
    FROM messages m
    JOIN agents a ON m.from_agent_id = a.id
    WHERE m.task_id = ?
    ORDER BY m.created_at ASC
  `).bind(id).all();
  
  return c.json({ 
    task: { ...task, assignees: assignees.results },
    messages: messages.results 
  });
});

// Valid status and priority values
const VALID_STATUSES = ['inbox', 'assigned', 'in_progress', 'review', 'blocked', 'done', 'archived'];
const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

app.post('/api/tasks', async (c) => {
  try {
    const body = await c.req.json();
    
    // Input validation
    if (!body.title?.trim()) {
      return c.json({ error: 'title is required' }, 400);
    }
    
    const status = body.status || 'inbox';
    if (!VALID_STATUSES.includes(status)) {
      return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, 400);
    }
    
    const priority = body.priority || 'normal';
    if (!VALID_PRIORITIES.includes(priority)) {
      return c.json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` }, 400);
    }
    
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    
    await c.env.DB.prepare(
      'INSERT INTO tasks (id, title, description, status, priority, workspace_id, created_by, due_date, estimated_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, body.title.trim(), body.description || '', status, priority, body.workspace_id || null, body.created_by || null, body.due_date || null, body.estimated_minutes || null).run();
    
    // Log activity (don't fail if this fails)
    try {
      await logActivity(c.env.DB, 'task_created', body.created_by || null, id, `Task "${body.title}" created`);
    } catch (e) {
      console.error('Activity log failed:', e);
    }
    
    return c.json({ id, success: true }, 201);
  } catch (e: any) {
    console.error('Create task error:', e);
    return c.json({ error: 'Failed to create task', message: e.message }, 500);
  }
});

app.patch('/api/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  const oldTask = await c.env.DB.prepare('SELECT status FROM tasks WHERE id = ?').bind(id).first() as any;
  
  // STATUS GUARD: Check dependencies before allowing transition to in_progress
  if (body.status === 'in_progress' && oldTask?.status !== 'in_progress') {
    const incompleteBlockers = await c.env.DB.prepare(`
      SELECT t.id, t.title FROM task_dependencies td
      JOIN tasks t ON t.id = td.depends_on_task_id
      WHERE td.task_id = ? AND t.status != 'done'
    `).bind(id).all();
    
    if (incompleteBlockers.results.length > 0) {
      const blockerTitles = (incompleteBlockers.results as any[]).map(b => b.title).join(', ');
      return c.json({ 
        error: 'Cannot start task - blocked by incomplete dependencies',
        blockers: incompleteBlockers.results,
        message: `Blocked by: ${blockerTitles}`
      }, 409);
    }
  }
  
  const updates: string[] = [];
  const values: any[] = [];
  
  for (const [key, value] of Object.entries(body)) {
    if (['title', 'description', 'status', 'priority', 'workspace_id', 'deliverable_path', 'due_date', 'blocked_reason', 'estimated_minutes'].includes(key)) {
      updates.push(`${key} = ?`);
      values.push(value);
    }
  }
  
  if (updates.length === 0) return c.json({ error: 'No valid fields to update' }, 400);
  
  updates.push('updated_at = datetime("now")');
  values.push(id);
  
  await c.env.DB.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  
  if (body.status && oldTask && body.status !== oldTask.status) {
    await logActivity(c.env.DB, 'task_status_changed', null, id, `Task status: ${oldTask.status} → ${body.status}`);
    
    // Notify subscribers
    await notifySubscribers(c.env.DB, id, `Task status changed to ${body.status}`, 'status_change');
    
    // If task completed, check if any dependent tasks can be unblocked
    if (body.status === 'done') {
      await checkAndUnblockDependents(c.env.DB, id);
    }
  }
  
  return c.json({ success: true });
});

app.delete('/api/tasks/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// Assign agent to task
app.post('/api/tasks/:id/assign', async (c) => {
  const taskId = c.req.param('id');
  const body = await c.req.json();
  
  // Input validation
  if (!body.agent_id?.trim()) {
    return c.json({ error: 'agent_id is required' }, 400);
  }
  
  const agentId = body.agent_id.trim();
  
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO task_assignees (task_id, agent_id) VALUES (?, ?)'
  ).bind(taskId, agentId).run();
  
  // Auto-subscribe
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO subscriptions (agent_id, task_id) VALUES (?, ?)'
  ).bind(agentId, taskId).run();
  
  // Update task status if inbox
  await c.env.DB.prepare(
    `UPDATE tasks SET status = 'assigned', updated_at = datetime('now') WHERE id = ? AND status = 'inbox'`
  ).bind(taskId).run();
  
  const [agent, task] = await Promise.all([
    c.env.DB.prepare('SELECT name FROM agents WHERE id = ?').bind(agentId).first() as Promise<any>,
    c.env.DB.prepare('SELECT title FROM tasks WHERE id = ?').bind(taskId).first() as Promise<any>,
  ]);
  
  await logActivity(c.env.DB, 'task_assigned', agentId, taskId, `${agent?.name || 'Agent'} assigned to task`);
  
  // Create notification for assigned agent
  await createNotification(c.env.DB, agentId, taskId, null, `You were assigned to a task`, 'assignment');
  
  // Create instant trigger for assigned agent
  await createPendingTrigger(c.env.DB, agentId, 'task_assigned', taskId, undefined, {
    task_title: task?.title
  });
  
  return c.json({ success: true });
});

app.post('/api/tasks/:id/unassign', async (c) => {
  const taskId = c.req.param('id');
  const body = await c.req.json();
  
  await c.env.DB.prepare(
    'DELETE FROM task_assignees WHERE task_id = ? AND agent_id = ?'
  ).bind(taskId, body.agent_id).run();
  
  return c.json({ success: true });
});

// ============ MESSAGES ============

app.get('/api/tasks/:id/messages', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT m.*, a.name as from_agent_name, a.avatar_emoji
    FROM messages m
    JOIN agents a ON m.from_agent_id = a.id
    WHERE m.task_id = ?
    ORDER BY m.created_at ASC
  `).bind(c.req.param('id')).all();
  
  return c.json({ messages: result.results });
});

app.post('/api/tasks/:id/messages', async (c) => {
  const taskId = c.req.param('id');
  const body = await c.req.json();
  
  // Input validation
  if (!body.from_agent_id?.trim()) {
    return c.json({ error: 'from_agent_id is required' }, 400);
  }
  if (!body.content?.trim()) {
    return c.json({ error: 'content is required' }, 400);
  }
  
  const id = crypto.randomUUID().slice(0, 16);
  
  await c.env.DB.prepare(
    'INSERT INTO messages (id, task_id, from_agent_id, content) VALUES (?, ?, ?, ?)'
  ).bind(id, taskId, body.from_agent_id, body.content).run();
  
  // Auto-subscribe commenter
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO subscriptions (agent_id, task_id) VALUES (?, ?)'
  ).bind(body.from_agent_id, taskId).run();
  
  const agent = await c.env.DB.prepare('SELECT name FROM agents WHERE id = ?').bind(body.from_agent_id).first() as any;
  
  await logActivity(c.env.DB, 'message_sent', body.from_agent_id, taskId, `${agent?.name || 'Agent'} commented`);
  
  // Detect @mentions and create notifications (supports hyphenated names like @Content-Writer)
  const mentions = body.content.match(/@([\w-]+)/g) || [];
  for (const mention of mentions) {
    const mentionName = mention.slice(1); // Remove @ prefix
    const mentionedAgent = await c.env.DB.prepare('SELECT id FROM agents WHERE name = ?').bind(mentionName).first() as any;
    if (mentionedAgent) {
      await createNotification(c.env.DB, mentionedAgent.id, taskId, id, `${agent?.name} mentioned you: ${body.content.slice(0, 100)}`, 'mention');
      // Auto-subscribe mentioned
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO subscriptions (agent_id, task_id) VALUES (?, ?)'
      ).bind(mentionedAgent.id, taskId).run();
      
      // Create instant trigger for mentioned agent
      await createPendingTrigger(c.env.DB, mentionedAgent.id, 'mention_created', taskId, id, {
        mentioned_by: agent?.name,
        message_preview: body.content.slice(0, 100)
      });
    }
  }
  
  // Notify other subscribers (except commenter)
  await notifySubscribers(c.env.DB, taskId, `${agent?.name}: ${body.content.slice(0, 100)}`, 'reply', body.from_agent_id);
  
  return c.json({ id, success: true }, 201);
});

// ============ ACTIVITIES ============

app.get('/api/activities', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  
  const result = await c.env.DB.prepare(`
    SELECT act.*, a.name as agent_name, a.avatar_emoji, t.title as task_title
    FROM activities act
    LEFT JOIN agents a ON act.agent_id = a.id
    LEFT JOIN tasks t ON act.task_id = t.id
    ORDER BY act.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();
  
  return c.json({ activities: result.results });
});

// ============ NOTIFICATIONS ============

app.get('/api/notifications/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const unreadOnly = c.req.query('unread') === 'true';
  
  let query = 'SELECT * FROM notifications WHERE agent_id = ?';
  if (unreadOnly) query += ' AND read = 0';
  query += ' ORDER BY created_at DESC LIMIT 50';
  
  const result = await c.env.DB.prepare(query).bind(agentId).all();
  return c.json({ notifications: result.results });
});

app.post('/api/notifications/:id/read', async (c) => {
  await c.env.DB.prepare(
    'UPDATE notifications SET read = 1 WHERE id = ?'
  ).bind(c.req.param('id')).run();
  return c.json({ success: true });
});

app.post('/api/notifications/:id/delivered', async (c) => {
  await c.env.DB.prepare(
    'UPDATE notifications SET delivered = 1 WHERE id = ?'
  ).bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// ============ SUBSCRIPTIONS ============

app.get('/api/subscriptions/:agentId', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT s.*, t.title as task_title
    FROM subscriptions s
    JOIN tasks t ON s.task_id = t.id
    WHERE s.agent_id = ?
  `).bind(c.req.param('agentId')).all();
  return c.json({ subscriptions: result.results });
});

app.post('/api/tasks/:id/subscribe', async (c) => {
  const body = await c.req.json();
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO subscriptions (agent_id, task_id) VALUES (?, ?)'
  ).bind(body.agent_id, c.req.param('id')).run();
  return c.json({ success: true });
});

app.delete('/api/tasks/:id/subscribe/:agentId', async (c) => {
  await c.env.DB.prepare(
    'DELETE FROM subscriptions WHERE agent_id = ? AND task_id = ?'
  ).bind(c.req.param('agentId'), c.req.param('id')).run();
  return c.json({ success: true });
});

// ============ REVIEW WORKFLOW ============

// Approve task - moves from review to done
app.post('/api/tasks/:id/approve', async (c) => {
  const taskId = c.req.param('id');
  const body = await c.req.json();
  const agentId = body.agent_id;
  
  if (!agentId) {
    return c.json({ error: 'agent_id is required' }, 400);
  }
  
  // Get task and agent
  const [task, agent, assignees] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first(),
    c.env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first(),
    c.env.DB.prepare('SELECT agent_id FROM task_assignees WHERE task_id = ?').bind(taskId).all(),
  ]);
  
  if (!task) return c.json({ error: 'Task not found' }, 404);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if ((task as any).status !== 'review') {
    return c.json({ error: 'Task must be in review status to approve' }, 400);
  }
  
  // Permission check: must be lead OR be an assignee
  const isLead = (agent as any).level === 'lead';
  const isAssignee = assignees.results.some((a: any) => a.agent_id === agentId);
  
  if (!isLead && !isAssignee) {
    return c.json({ error: 'Only leads or assignees can approve tasks' }, 403);
  }
  
  // Update task to done
  await c.env.DB.prepare(
    "UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?"
  ).bind(taskId).run();
  
  await logActivity(c.env.DB, 'task_status_changed', agentId, taskId, 
    `${(agent as any).name} approved task → Done`);
  
  // Notify all assignees
  for (const assignee of assignees.results as any[]) {
    if (assignee.agent_id !== agentId) {
      await createNotification(c.env.DB, assignee.agent_id, taskId, null, 
        `Task "${(task as any).title}" was approved`, 'approval');
    }
  }
  
  // Check if any dependent tasks can be unblocked
  await checkAndUnblockDependents(c.env.DB, taskId);
  
  return c.json({ success: true });
});

// Reject task - moves from review back to in_progress with feedback
app.post('/api/tasks/:id/reject', async (c) => {
  const taskId = c.req.param('id');
  const body = await c.req.json();
  const agentId = body.agent_id;
  const feedback = body.feedback?.trim();
  
  if (!agentId) {
    return c.json({ error: 'agent_id is required' }, 400);
  }
  if (!feedback) {
    return c.json({ error: 'feedback is required when rejecting' }, 400);
  }
  
  // Get task and agent
  const [task, agent] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first(),
    c.env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first(),
  ]);
  
  if (!task) return c.json({ error: 'Task not found' }, 404);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if ((task as any).status !== 'review') {
    return c.json({ error: 'Task must be in review status to reject' }, 400);
  }
  
  // Only leads can reject
  if ((agent as any).level !== 'lead') {
    return c.json({ error: 'Only leads can reject tasks' }, 403);
  }
  
  // Update task back to in_progress
  await c.env.DB.prepare(
    "UPDATE tasks SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?"
  ).bind(taskId).run();
  
  // Create rejection comment
  const msgId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await c.env.DB.prepare(
    'INSERT INTO messages (id, task_id, from_agent_id, content) VALUES (?, ?, ?, ?)'
  ).bind(msgId, taskId, agentId, `[REJECTED] ${feedback}`).run();
  
  await logActivity(c.env.DB, 'task_status_changed', agentId, taskId, 
    `${(agent as any).name} rejected task → In Progress`);
  
  // Notify all assignees
  const assignees = await c.env.DB.prepare(
    'SELECT agent_id FROM task_assignees WHERE task_id = ?'
  ).bind(taskId).all();
  
  for (const assignee of assignees.results as any[]) {
    if (assignee.agent_id !== agentId) {
      await createNotification(c.env.DB, assignee.agent_id, taskId, msgId, 
        `Task rejected: ${feedback.slice(0, 50)}...`, 'rejection');
      
      // Create instant trigger for assignee to revise
      await createPendingTrigger(c.env.DB, assignee.agent_id, 'task_rejected', taskId, msgId, {
        rejected_by: (agent as any).name,
        feedback_preview: feedback.slice(0, 100)
      });
    }
  }
  
  return c.json({ success: true });
});

// Claim task - self-assign from inbox (with limits based on level)
app.post('/api/tasks/:id/claim', async (c) => {
  const taskId = c.req.param('id');
  const body = await c.req.json();
  const agentId = body.agent_id;
  
  if (!agentId) {
    return c.json({ error: 'agent_id is required' }, 400);
  }
  
  // Get task and agent
  const [task, agent] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first(),
    c.env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first(),
  ]);
  
  if (!task) return c.json({ error: 'Task not found' }, 404);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if ((task as any).status !== 'inbox') {
    return c.json({ error: 'Can only claim tasks from inbox' }, 400);
  }
  
  // Check if already assigned
  const existingAssignment = await c.env.DB.prepare(
    'SELECT 1 FROM task_assignees WHERE task_id = ? AND agent_id = ?'
  ).bind(taskId, agentId).first();
  
  if (existingAssignment) {
    return c.json({ success: true, message: 'Already assigned' });
  }
  
  // Check claim limits based on level
  const level = (agent as any).level;
  const limits: Record<string, number> = { intern: 1, specialist: 3, lead: 999 };
  const limit = limits[level] || 3;
  
  const currentCount = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM task_assignees ta
    JOIN tasks t ON ta.task_id = t.id
    WHERE ta.agent_id = ? AND t.status IN ('assigned', 'in_progress')
  `).bind(agentId).first() as any;
  
  if (currentCount.count >= limit) {
    return c.json({ 
      error: `Claim limit reached (${limit} for ${level}). Complete existing tasks first.` 
    }, 409);
  }
  
  // Assign and update status
  await c.env.DB.prepare(
    'INSERT INTO task_assignees (task_id, agent_id) VALUES (?, ?)'
  ).bind(taskId, agentId).run();
  
  await c.env.DB.prepare(
    "UPDATE tasks SET status = 'assigned', updated_at = datetime('now') WHERE id = ?"
  ).bind(taskId).run();
  
  // Auto-subscribe
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO subscriptions (agent_id, task_id) VALUES (?, ?)'
  ).bind(agentId, taskId).run();
  
  await logActivity(c.env.DB, 'task_assigned', agentId, taskId, 
    `${(agent as any).name} claimed task`);
  
  return c.json({ success: true });
});

// ============ TASK DEPENDENCIES ============

// Get dependencies for a task
app.get('/api/tasks/:id/dependencies', async (c) => {
  const taskId = c.req.param('id');
  
  // Get tasks this task depends on (blockers)
  const blockers = await c.env.DB.prepare(`
    SELECT t.id, t.title, t.status, t.priority, td.created_at as dependency_created_at
    FROM task_dependencies td
    JOIN tasks t ON t.id = td.depends_on_task_id
    WHERE td.task_id = ?
    ORDER BY td.created_at DESC
  `).bind(taskId).all();
  
  // Get tasks that depend on this task (blocked by this)
  const blocking = await c.env.DB.prepare(`
    SELECT t.id, t.title, t.status, t.priority, td.created_at as dependency_created_at
    FROM task_dependencies td
    JOIN tasks t ON t.id = td.task_id
    WHERE td.depends_on_task_id = ?
    ORDER BY td.created_at DESC
  `).bind(taskId).all();
  
  // Check if task is blocked (any non-done blocker)
  const isBlocked = (blockers.results as any[]).some(b => b.status !== 'done');
  
  return c.json({ 
    blockers: blockers.results,
    blocking: blocking.results,
    is_blocked: isBlocked,
    blocker_count: blockers.results.length,
    blocking_count: blocking.results.length
  });
});

// Add a dependency (task depends on another task)
app.post('/api/tasks/:id/dependencies', async (c) => {
  const taskId = c.req.param('id');
  const body = await c.req.json();
  
  if (!body.depends_on_task_id?.trim()) {
    return c.json({ error: 'depends_on_task_id is required' }, 400);
  }
  
  const dependsOnId = body.depends_on_task_id.trim();
  
  // Prevent self-reference
  if (taskId === dependsOnId) {
    return c.json({ error: 'A task cannot depend on itself' }, 400);
  }
  
  // Check both tasks exist
  const [task, dependsOn] = await Promise.all([
    c.env.DB.prepare('SELECT id, title, status FROM tasks WHERE id = ?').bind(taskId).first(),
    c.env.DB.prepare('SELECT id, title, status FROM tasks WHERE id = ?').bind(dependsOnId).first(),
  ]);
  
  if (!task) return c.json({ error: 'Task not found' }, 404);
  if (!dependsOn) return c.json({ error: 'Dependency task not found' }, 404);
  
  // Prevent circular dependencies (basic check - A -> B -> A)
  const wouldCreateCycle = await c.env.DB.prepare(`
    SELECT 1 FROM task_dependencies 
    WHERE task_id = ? AND depends_on_task_id = ?
  `).bind(dependsOnId, taskId).first();
  
  if (wouldCreateCycle) {
    return c.json({ error: 'Cannot create circular dependency' }, 400);
  }
  
  try {
    await c.env.DB.prepare(
      'INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)'
    ).bind(taskId, dependsOnId).run();
    
    // If the dependency is not done, auto-set task to blocked
    if ((dependsOn as any).status !== 'done') {
      await c.env.DB.prepare(
        "UPDATE tasks SET status = 'blocked', blocked_reason = ?, updated_at = datetime('now') WHERE id = ? AND status NOT IN ('done', 'blocked')"
      ).bind(`Blocked by: ${(dependsOn as any).title}`, taskId).run();
      
      await logActivity(c.env.DB, 'task_status_changed', null, taskId, 
        `Task blocked by "${(dependsOn as any).title}"`);
    }
    
    await logActivity(c.env.DB, 'task_updated', null, taskId, 
      `Dependency added: blocked by "${(dependsOn as any).title}"`);
    
    return c.json({ success: true }, 201);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE') || e.message?.includes('PRIMARY')) {
      return c.json({ error: 'Dependency already exists' }, 409);
    }
    throw e;
  }
});

// Remove a dependency
app.delete('/api/tasks/:id/dependencies/:depId', async (c) => {
  const taskId = c.req.param('id');
  const depId = c.req.param('depId');
  
  const result = await c.env.DB.prepare(
    'DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?'
  ).bind(taskId, depId).run();
  
  if (result.meta.changes === 0) {
    return c.json({ error: 'Dependency not found' }, 404);
  }
  
  // Check if task can be unblocked (no more incomplete dependencies)
  const remainingBlockers = await c.env.DB.prepare(`
    SELECT 1 FROM task_dependencies td
    JOIN tasks t ON t.id = td.depends_on_task_id
    WHERE td.task_id = ? AND t.status != 'done'
    LIMIT 1
  `).bind(taskId).first();
  
  if (!remainingBlockers) {
    // Unblock the task if it was blocked
    await c.env.DB.prepare(
      "UPDATE tasks SET status = 'assigned', blocked_reason = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'blocked'"
    ).bind(taskId).run();
    
    await logActivity(c.env.DB, 'task_status_changed', null, taskId, 
      `Task unblocked - all dependencies completed`);
  }
  
  await logActivity(c.env.DB, 'task_updated', null, taskId, `Dependency removed`);
  
  return c.json({ success: true });
});

// Helper: Check and unblock tasks when a task is completed
async function checkAndUnblockDependents(db: D1Database, completedTaskId: string) {
  // Find all tasks that depend on the completed task
  const dependents = await db.prepare(`
    SELECT DISTINCT td.task_id 
    FROM task_dependencies td
    JOIN tasks t ON t.id = td.task_id
    WHERE td.depends_on_task_id = ? AND t.status = 'blocked'
  `).bind(completedTaskId).all();
  
  for (const dep of dependents.results as any[]) {
    // Check if this dependent still has other incomplete blockers
    const stillBlocked = await db.prepare(`
      SELECT 1 FROM task_dependencies td
      JOIN tasks t ON t.id = td.depends_on_task_id
      WHERE td.task_id = ? AND t.status != 'done'
      LIMIT 1
    `).bind(dep.task_id).first();
    
    if (!stillBlocked) {
      // Unblock the task
      await db.prepare(
        "UPDATE tasks SET status = 'assigned', blocked_reason = NULL, updated_at = datetime('now') WHERE id = ?"
      ).bind(dep.task_id).run();
      
      await logActivity(db, 'task_status_changed', null, dep.task_id, 
        `Task auto-unblocked - all dependencies completed`);
      
      // Create notification for assignees
      const assignees = await db.prepare(
        'SELECT agent_id FROM task_assignees WHERE task_id = ?'
      ).bind(dep.task_id).all();
      
      for (const assignee of assignees.results as any[]) {
        await createNotification(db, assignee.agent_id, dep.task_id, null,
          'Task unblocked - ready to work on', 'status_change');
      }
    }
  }
}

// ============ TAGS ============

// Get all tags
app.get('/api/tags', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM tags ORDER BY name').all();
  return c.json({ tags: result.results, colors: TAG_COLORS });
});

// Create tag
app.post('/api/tags', async (c) => {
  const body = await c.req.json();
  
  if (!body.name?.trim()) {
    return c.json({ error: 'name is required' }, 400);
  }
  
  const color = body.color && TAG_COLORS.includes(body.color) ? body.color : TAG_COLORS[8]; // default gray
  const name = body.name.trim().toLowerCase().replace(/\s+/g, '-');
  
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  
  try {
    await c.env.DB.prepare(
      'INSERT INTO tags (id, name, color) VALUES (?, ?, ?)'
    ).bind(id, name, color).run();
    return c.json({ id, name, color, success: true }, 201);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      return c.json({ error: 'Tag already exists' }, 409);
    }
    throw e;
  }
});

// Delete tag
app.delete('/api/tags/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM tags WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// Set tags for a task (replaces existing)
app.put('/api/tasks/:id/tags', async (c) => {
  const taskId = c.req.param('id');
  const body = await c.req.json();
  const tagIds = body.tag_ids || [];
  
  // Delete existing tags
  await c.env.DB.prepare('DELETE FROM task_tags WHERE task_id = ?').bind(taskId).run();
  
  // Add new tags
  if (tagIds.length > 0) {
    const placeholders = tagIds.map(() => '(?, ?)').join(', ');
    const values = tagIds.flatMap((tagId: string) => [taskId, tagId]);
    await c.env.DB.prepare(
      `INSERT INTO task_tags (task_id, tag_id) VALUES ${placeholders}`
    ).bind(...values).run();
  }
  
  return c.json({ success: true });
});

// ============ DOCS ============

// List docs for a workspace
app.get('/api/docs', async (c) => {
  const workspace = c.req.query('workspace');
  
  if (!workspace?.trim()) {
    return c.json({ error: 'workspace query param is required' }, 400);
  }
  
  const result = await c.env.DB.prepare(`
    SELECT d.id, d.workspace_id, d.filename, d.created_by, d.updated_by, d.created_at, d.updated_at,
           a1.name as created_by_name, a2.name as updated_by_name,
           LENGTH(d.content) as content_length
    FROM docs d
    LEFT JOIN agents a1 ON d.created_by = a1.id
    LEFT JOIN agents a2 ON d.updated_by = a2.id
    WHERE d.workspace_id = ?
    ORDER BY d.filename ASC
  `).bind(workspace.trim()).all();
  
  return c.json({ docs: result.results });
});

// Get single doc content
app.get('/api/docs/:workspace/:filename', async (c) => {
  const workspace = c.req.param('workspace');
  const filename = c.req.param('filename');
  
  const doc = await c.env.DB.prepare(`
    SELECT d.*, a1.name as created_by_name, a2.name as updated_by_name
    FROM docs d
    LEFT JOIN agents a1 ON d.created_by = a1.id
    LEFT JOIN agents a2 ON d.updated_by = a2.id
    WHERE d.workspace_id = ? AND d.filename = ?
  `).bind(workspace, filename).first();
  
  if (!doc) {
    return c.json({ error: 'Doc not found' }, 404);
  }
  
  return c.json({ doc });
});

// Create or update doc
app.post('/api/docs/:workspace/:filename', async (c) => {
  const workspace = c.req.param('workspace');
  const filename = c.req.param('filename');
  const body = await c.req.json();
  
  if (body.content === undefined) {
    return c.json({ error: 'content is required' }, 400);
  }
  
  // Validate filename (alphanumeric, hyphens, underscores, must end in .md)
  if (!/^[\w-]+\.md$/i.test(filename)) {
    return c.json({ error: 'filename must be alphanumeric with .md extension' }, 400);
  }
  
  const agentId = body.agent_id || null;
  
  // Check if exists
  const existing = await c.env.DB.prepare(
    'SELECT id FROM docs WHERE workspace_id = ? AND filename = ?'
  ).bind(workspace, filename).first();
  
  if (existing) {
    // Update
    await c.env.DB.prepare(`
      UPDATE docs 
      SET content = ?, updated_by = ?, updated_at = datetime('now')
      WHERE workspace_id = ? AND filename = ?
    `).bind(body.content, agentId, workspace, filename).run();
    
    if (agentId) {
      const agent = await c.env.DB.prepare('SELECT name FROM agents WHERE id = ?').bind(agentId).first() as any;
      await logActivity(c.env.DB, 'doc_updated', agentId, null, 
        `${agent?.name || 'Agent'} updated doc: ${workspace}/${filename}`);
    }
    
    return c.json({ success: true, action: 'updated', id: (existing as any).id });
  } else {
    // Create
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await c.env.DB.prepare(`
      INSERT INTO docs (id, workspace_id, filename, content, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, workspace, filename, body.content, agentId, agentId).run();
    
    if (agentId) {
      const agent = await c.env.DB.prepare('SELECT name FROM agents WHERE id = ?').bind(agentId).first() as any;
      await logActivity(c.env.DB, 'doc_updated', agentId, null, 
        `${agent?.name || 'Agent'} created doc: ${workspace}/${filename}`);
    }
    
    return c.json({ success: true, action: 'created', id }, 201);
  }
});

// Delete doc
app.delete('/api/docs/:workspace/:filename', async (c) => {
  const workspace = c.req.param('workspace');
  const filename = c.req.param('filename');
  
  const result = await c.env.DB.prepare(
    'DELETE FROM docs WHERE workspace_id = ? AND filename = ?'
  ).bind(workspace, filename).run();
  
  if (result.meta.changes === 0) {
    return c.json({ error: 'Doc not found' }, 404);
  }
  
  return c.json({ success: true });
});

// ============ TRIGGERS (Event-Driven Agent Execution) ============

// Atomically claim pending triggers for processing
app.post('/api/triggers/claim', async (c) => {
  const body = await c.req.json();
  const limit = body.limit || 5;
  
  // Get pending triggers
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
  
  // Atomic claim: update status to processing
  await c.env.DB.prepare(`
    UPDATE pending_triggers 
    SET status = 'processing', claimed_at = datetime('now')
    WHERE id IN (${placeholders}) AND status = 'pending'
  `).bind(...ids).run();
  
  // Fetch claimed triggers with full data
  const claimed = await c.env.DB.prepare(`
    SELECT pt.*, a.name as agent_name 
    FROM pending_triggers pt
    LEFT JOIN agents a ON pt.agent_id = a.id
    WHERE pt.id IN (${placeholders}) AND pt.status = 'processing'
  `).bind(...ids).all();
  
  return c.json({ 
    triggers: claimed.results,
    claimed: claimed.results.length
  });
});

// Update trigger status after execution
app.patch('/api/triggers/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  const updates: string[] = [];
  const values: any[] = [];
  
  if (body.status) {
    updates.push('status = ?');
    values.push(body.status);
    
    if (body.status === 'completed' || body.status === 'failed') {
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

// List recent triggers (for debugging/monitoring)
app.get('/api/triggers', async (c) => {
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '20');
  
  let query = `
    SELECT pt.*, a.name as agent_name 
    FROM pending_triggers pt
    LEFT JOIN agents a ON pt.agent_id = a.id
  `;
  
  if (status) {
    query += ` WHERE pt.status = ?`;
    query += ` ORDER BY pt.created_at DESC LIMIT ?`;
    const result = await c.env.DB.prepare(query).bind(status, limit).all();
    return c.json({ triggers: result.results });
  }
  
  query += ` ORDER BY pt.created_at DESC LIMIT ?`;
  const result = await c.env.DB.prepare(query).bind(limit).all();
  return c.json({ triggers: result.results });
});

// ============ HELPERS ============

async function logActivity(db: D1Database, type: string, agentId: string | null, taskId: string | null, message: string, metadata?: any) {
  const id = crypto.randomUUID().slice(0, 16);
  await db.prepare(
    'INSERT INTO activities (id, type, agent_id, task_id, message, metadata) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, type, agentId, taskId, message, metadata ? JSON.stringify(metadata) : null).run();
}

async function createNotification(db: D1Database, agentId: string, taskId: string | null, messageId: string | null, content: string, type: string) {
  const id = crypto.randomUUID().slice(0, 16);
  await db.prepare(
    'INSERT INTO notifications (id, agent_id, task_id, message_id, content, type) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, agentId, taskId, messageId, content, type).run();
}

async function notifySubscribers(db: D1Database, taskId: string, content: string, type: string, excludeAgentId?: string) {
  let query = 'SELECT agent_id FROM subscriptions WHERE task_id = ?';
  if (excludeAgentId) {
    query += ' AND agent_id != ?';
  }
  
  const stmt = db.prepare(query);
  const result = excludeAgentId 
    ? await stmt.bind(taskId, excludeAgentId).all()
    : await stmt.bind(taskId).all();
  
  // Batch insert all notifications at once
  if (result.results.length === 0) return;
  
  const statements = (result.results as any[]).map(sub => {
    const id = crypto.randomUUID().slice(0, 16);
    return db.prepare(
      'INSERT INTO notifications (id, agent_id, task_id, message_id, content, type) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, sub.agent_id, taskId, null, content, type);
  });
  
  await db.batch(statements);
}

// Create a pending trigger for instant agent execution
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
  
  // Check for recent duplicate to prevent spam
  const recent = await db.prepare(`
    SELECT id FROM pending_triggers
    WHERE agent_id = ? 
    AND event_type = ?
    AND (task_id = ? OR (task_id IS NULL AND ? IS NULL))
    AND status IN ('pending', 'processing')
    AND created_at > datetime('now', '-2 minutes')
  `).bind(agentId, eventType, taskId || null, taskId || null).first();
  
  if (recent) {
    console.log(`Skipping duplicate trigger for agent ${agentId}: ${eventType}`);
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
  return id;
}

// ============ DEPARTMENTS ============

app.get('/api/departments', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT d.*, 
           COUNT(DISTINCT t.id) as team_count,
           COUNT(DISTINCT a.id) as agent_count
    FROM departments d
    LEFT JOIN teams t ON t.department_id = d.id
    LEFT JOIN agents a ON a.team_id = t.id
    GROUP BY d.id
    ORDER BY d.name
  `).all();
  return c.json({ departments: result.results });
});

app.post('/api/departments', async (c) => {
  const body = await c.req.json();
  const id = body.id || crypto.randomUUID().slice(0, 16);
  
  await c.env.DB.prepare(
    'INSERT INTO departments (id, name, emoji, description) VALUES (?, ?, ?, ?)'
  ).bind(id, body.name, body.emoji || '🏢', body.description || null).run();
  
  return c.json({ id, success: true }, 201);
});

// ============ TEAMS ============

app.get('/api/teams', async (c) => {
  const deptId = c.req.query('department_id');
  
  let query = `
    SELECT t.*, 
           d.name as department_name,
           d.emoji as department_emoji,
           COUNT(a.id) as agent_count,
           l.name as lead_name,
           l.avatar_emoji as lead_emoji
    FROM teams t
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN agents a ON a.team_id = t.id
    LEFT JOIN agents l ON l.id = t.lead_agent_id
  `;
  
  if (deptId) {
    query += ` WHERE t.department_id = '${deptId}'`;
  }
  
  query += ` GROUP BY t.id ORDER BY d.name, t.name`;
  
  const result = await c.env.DB.prepare(query).all();
  return c.json({ teams: result.results });
});

app.get('/api/teams/:id', async (c) => {
  const team = await c.env.DB.prepare(`
    SELECT t.*, d.name as department_name
    FROM teams t
    LEFT JOIN departments d ON d.id = t.department_id
    WHERE t.id = ?
  `).bind(c.req.param('id')).first();
  
  if (!team) return c.json({ error: 'Team not found' }, 404);
  
  const agents = await c.env.DB.prepare(
    'SELECT * FROM agents WHERE team_id = ?'
  ).bind(c.req.param('id')).all();
  
  return c.json({ team, agents: agents.results });
});

app.post('/api/teams', async (c) => {
  const body = await c.req.json();
  const id = body.id || crypto.randomUUID().slice(0, 16);
  
  await c.env.DB.prepare(
    'INSERT INTO teams (id, department_id, name, emoji, description, lead_agent_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, body.department_id, body.name, body.emoji || '👥', body.description || null, body.lead_agent_id || null).run();
  
  return c.json({ id, success: true }, 201);
});

app.patch('/api/teams/:id', async (c) => {
  const body = await c.req.json();
  const updates: string[] = [];
  const values: any[] = [];
  
  for (const [key, value] of Object.entries(body)) {
    if (['name', 'emoji', 'description', 'department_id', 'lead_agent_id'].includes(key)) {
      updates.push(`${key} = ?`);
      values.push(value);
    }
  }
  
  if (updates.length === 0) return c.json({ error: 'No valid fields' }, 400);
  values.push(c.req.param('id'));
  
  await c.env.DB.prepare(`UPDATE teams SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  return c.json({ success: true });
});

// ============ WORKSPACES ============

app.get('/api/workspaces', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT w.*,
           COUNT(t.id) as task_count,
           SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as completed_count
    FROM workspaces w
    LEFT JOIN tasks t ON t.workspace_id = w.id
    GROUP BY w.id
    ORDER BY w.name
  `).all();
  return c.json({ workspaces: result.results });
});

app.get('/api/workspaces/:id', async (c) => {
  const workspace = await c.env.DB.prepare(
    'SELECT * FROM workspaces WHERE id = ?'
  ).bind(c.req.param('id')).first();
  
  if (!workspace) return c.json({ error: 'Workspace not found' }, 404);
  
  const tasks = await c.env.DB.prepare(
    'SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(c.req.param('id')).all();
  
  return c.json({ workspace, tasks: tasks.results });
});

app.post('/api/workspaces', async (c) => {
  const body = await c.req.json();
  const id = body.id || crypto.randomUUID().slice(0, 16);
  const slug = body.slug || body.name.toLowerCase().replace(/\s+/g, '-');
  
  await c.env.DB.prepare(
    'INSERT INTO workspaces (id, name, slug, emoji, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, body.name, slug, body.emoji || '📁', body.description || null).run();
  
  return c.json({ id, success: true }, 201);
});

app.patch('/api/workspaces/:id', async (c) => {
  const body = await c.req.json();
  const updates: string[] = [];
  const values: any[] = [];
  
  for (const [key, value] of Object.entries(body)) {
    if (['name', 'slug', 'emoji', 'description', 'status'].includes(key)) {
      updates.push(`${key} = ?`);
      values.push(value);
    }
  }
  
  if (updates.length === 0) return c.json({ error: 'No valid fields' }, 400);
  values.push(c.req.param('id'));
  
  await c.env.DB.prepare(`UPDATE workspaces SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  return c.json({ success: true });
});

// ============ ENHANCED STATS ============

app.get('/api/stats/full', async (c) => {
  const [depts, teams, agents, workspaces, tasksByStatus, tasksByWorkspace] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM departments').first(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM teams').first(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM agents').first(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM workspaces WHERE status = "active"').first(),
    c.env.DB.prepare(`
      SELECT status, COUNT(*) as count FROM tasks GROUP BY status
    `).all(),
    c.env.DB.prepare(`
      SELECT w.name, COUNT(t.id) as count 
      FROM workspaces w 
      LEFT JOIN tasks t ON t.workspace_id = w.id 
      GROUP BY w.id
    `).all(),
  ]);
  
  return c.json({
    departments: (depts as any)?.count || 0,
    teams: (teams as any)?.count || 0,
    agents: (agents as any)?.count || 0,
    workspaces: (workspaces as any)?.count || 0,
    tasksByStatus: tasksByStatus.results,
    tasksByWorkspace: tasksByWorkspace.results,
  });
});

export default app;
