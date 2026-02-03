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
  // Skip auth for public endpoints
  if (c.req.path === '/api/ping') {
    return await next();
  }
  
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

// Public ping endpoint
app.get('/api/ping', (c) => c.json({ pong: true, timestamp: new Date().toISOString() }));

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

// Agent Stats - metrics for agent performance
app.get('/api/agents/:id/stats', async (c) => {
  const agentId = c.req.param('id');
  
  // Verify agent exists
  const agent = await c.env.DB.prepare('SELECT id, name, updated_at FROM agents WHERE id = ?').bind(agentId).first() as any;
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  // Calculate date boundaries (in UTC for SQLite comparison)
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  // Run all queries in parallel
  const [
    totalCompleted,
    weekCompleted,
    monthCompleted,
    currentAssigned,
    avgCompletionTime,
    reviewStats,
    lastActivity
  ] = await Promise.all([
    // Total tasks completed (all time)
    c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM tasks t
      JOIN task_assignees ta ON t.id = ta.task_id
      WHERE ta.agent_id = ? AND t.status = 'done'
    `).bind(agentId).first() as Promise<any>,
    
    // Tasks completed this week
    c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM tasks t
      JOIN task_assignees ta ON t.id = ta.task_id
      WHERE ta.agent_id = ? AND t.status = 'done' AND t.updated_at >= ?
    `).bind(agentId, weekAgo).first() as Promise<any>,
    
    // Tasks completed this month
    c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM tasks t
      JOIN task_assignees ta ON t.id = ta.task_id
      WHERE ta.agent_id = ? AND t.status = 'done' AND t.updated_at >= ?
    `).bind(agentId, monthAgo).first() as Promise<any>,
    
    // Currently assigned (not done/archived)
    c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM tasks t
      JOIN task_assignees ta ON t.id = ta.task_id
      WHERE ta.agent_id = ? AND t.status NOT IN ('done', 'archived')
    `).bind(agentId).first() as Promise<any>,
    
    // Average completion time (minutes) - from assigned_at to updated_at when done
    c.env.DB.prepare(`
      SELECT AVG(
        CAST((julianday(t.updated_at) - julianday(ta.assigned_at)) * 24 * 60 AS INTEGER)
      ) as avg_minutes
      FROM tasks t
      JOIN task_assignees ta ON t.id = ta.task_id
      WHERE ta.agent_id = ? AND t.status = 'done' AND ta.assigned_at IS NOT NULL
    `).bind(agentId).first() as Promise<any>,
    
    // Review stats - count rejections and total reviews for rejection rate
    c.env.DB.prepare(`
      SELECT 
        COUNT(CASE WHEN n.type = 'rejection' THEN 1 END) as rejections,
        COUNT(CASE WHEN n.type IN ('rejection', 'approval') THEN 1 END) as total_reviews
      FROM notifications n
      WHERE n.agent_id = ? AND n.type IN ('rejection', 'approval')
    `).bind(agentId).first() as Promise<any>,
    
    // Last activity (most recent message or task update)
    c.env.DB.prepare(`
      SELECT MAX(created_at) as last_active FROM (
        SELECT created_at FROM messages WHERE from_agent_id = ?
        UNION ALL
        SELECT created_at FROM activities WHERE agent_id = ?
      )
    `).bind(agentId, agentId).first() as Promise<any>
  ]);
  
  // Calculate rejection rate
  const rejectionRate = reviewStats?.total_reviews > 0 
    ? Math.round((reviewStats.rejections / reviewStats.total_reviews) * 100) 
    : 0;
  
  return c.json({
    agent_id: agentId,
    agent_name: agent.name,
    tasks_completed: {
      total: totalCompleted?.count || 0,
      week: weekCompleted?.count || 0,
      month: monthCompleted?.count || 0
    },
    avg_completion_time_minutes: avgCompletionTime?.avg_minutes 
      ? Math.round(avgCompletionTime.avg_minutes) 
      : null,
    tasks_assigned: currentAssigned?.count || 0,
    review_rejection_rate: rejectionRate,
    last_active_at: lastActivity?.last_active || agent.updated_at
  });
});

// ============ TASKS ============

app.get('/api/tasks', async (c) => {
  const status = c.req.query('status');
  const assignee = c.req.query('assignee');
  const parentId = c.req.query('parent_id'); // Filter by parent (null = top-level only)
  const includeSubtasks = c.req.query('include_subtasks') !== 'false'; // Default true
  
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
       WHERE td2.task_id = t.id AND t2.status != 'done') as incomplete_blocker_count,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id) as subtask_count,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.status != 'done') as incomplete_subtask_count
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
  
  // Filter by parent_id (use 'null' string to get top-level tasks only)
  if (parentId === 'null') {
    conditions.push('t.parent_task_id IS NULL');
  } else if (parentId) {
    conditions.push('t.parent_task_id = ?');
    bindings.push(parentId);
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
    subtask_count: t.subtask_count || 0,
    incomplete_subtask_count: t.incomplete_subtask_count || 0,
    has_subtasks: (t.subtask_count || 0) > 0,
  }));
  
  return c.json({ tasks });
});

// ============ FULL-TEXT SEARCH ============

// Search endpoint with FTS5 (with LIKE fallback)
// NOTE: Must be defined BEFORE /api/tasks/:id to avoid route conflict
app.get('/api/tasks/search', async (c) => {
  const query = c.req.query('q')?.trim();
  if (!query || query.length < 2) {
    return c.json({ error: 'Query must be at least 2 characters', results: [] }, 400);
  }
  
  const workspace = c.req.query('workspace');
  const status = c.req.query('status');
  const assignee = c.req.query('assignee');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
  
  try {
    // Try FTS5 first (faster, better ranking)
    let results;
    let usedFTS = false;
    
    try {
      // FTS5 search - get matching task IDs with ranking first, then join
      const sanitized = query.replace(/[^\w\s]/g, '').trim();
      if (!sanitized) throw new Error('Empty query after sanitization');
      const ftsQuery = sanitized + '*';
      
      // Step 1: Get matching task IDs with FTS ranking and snippets
      const ftsResults = await c.env.DB.prepare(`
        SELECT 
          task_id,
          bm25(tasks_fts) as rank,
          snippet(tasks_fts, 1, '<mark>', '</mark>', '...', 32) as title_snippet,
          snippet(tasks_fts, 2, '<mark>', '</mark>', '...', 64) as desc_snippet,
          snippet(tasks_fts, 3, '<mark>', '</mark>', '...', 64) as msg_snippet
        FROM tasks_fts
        WHERE tasks_fts MATCH ?
        ORDER BY rank
        LIMIT 100
      `).bind(ftsQuery).all();
      
      if (!ftsResults.results.length) {
        results = { results: [] };
        usedFTS = true;
      } else {
        // Step 2: Get full task data for matching IDs
        const taskIds = (ftsResults.results as any[]).map(r => r.task_id);
        const snippetMap = new Map((ftsResults.results as any[]).map(r => [r.task_id, r]));
        
        let sql = `
          SELECT 
            t.*,
            GROUP_CONCAT(DISTINCT ta.agent_id) as assignee_ids,
            GROUP_CONCAT(DISTINCT a.name) as assignee_names,
            w.name as workspace_name,
            w.emoji as workspace_emoji
          FROM tasks t
          LEFT JOIN task_assignees ta ON t.id = ta.task_id
          LEFT JOIN agents a ON ta.agent_id = a.id
          LEFT JOIN workspaces w ON t.workspace_id = w.id
          WHERE t.id IN (${taskIds.map(() => '?').join(',')})
        `;
        
        const bindings: any[] = [...taskIds];
        
        if (workspace && workspace !== 'all') {
          sql += ' AND t.workspace_id = ?';
          bindings.push(workspace);
        }
        if (status) {
          sql += ' AND t.status = ?';
          bindings.push(status);
        }
        if (assignee) {
          sql += ' AND ta.agent_id = ?';
          bindings.push(assignee);
        }
        
        sql += ' GROUP BY t.id LIMIT ?';
        bindings.push(limit);
        
        const taskResults = await c.env.DB.prepare(sql).bind(...bindings).all();
        
        // Merge FTS snippets with task data and sort by rank
        results = {
          results: (taskResults.results as any[]).map(t => {
            const fts = snippetMap.get(t.id) || {};
            return { ...t, ...fts };
          }).sort((a, b) => (a.rank || 0) - (b.rank || 0))
        };
        usedFTS = true;
      }
    } catch (ftsError: any) {
      // FTS5 not available or query failed, fallback to LIKE
      console.log('FTS5 error, using LIKE fallback:', ftsError?.message || ftsError);
      
      const likePattern = `%${query}%`;
      
      let sql = `
        SELECT DISTINCT
          t.*,
          CASE 
            WHEN t.title LIKE ? THEN 3
            WHEN t.description LIKE ? THEN 2
            ELSE 1
          END as rank,
          t.title as title_snippet,
          SUBSTR(t.description, 1, 150) as desc_snippet,
          NULL as msg_snippet,
          GROUP_CONCAT(DISTINCT ta.agent_id) as assignee_ids,
          GROUP_CONCAT(DISTINCT a.name) as assignee_names,
          w.name as workspace_name,
          w.emoji as workspace_emoji
        FROM tasks t
        LEFT JOIN task_assignees ta ON t.id = ta.task_id
        LEFT JOIN agents a ON ta.agent_id = a.id
        LEFT JOIN workspaces w ON t.workspace_id = w.id
        LEFT JOIN messages m ON m.task_id = t.id
        WHERE (t.title LIKE ? OR t.description LIKE ? OR m.content LIKE ?)
      `;
      
      const bindings: any[] = [likePattern, likePattern, likePattern, likePattern, likePattern];
      
      if (workspace && workspace !== 'all') {
        sql += ' AND t.workspace_id = ?';
        bindings.push(workspace);
      }
      if (status) {
        sql += ' AND t.status = ?';
        bindings.push(status);
      }
      if (assignee) {
        sql += ' AND ta.agent_id = ?';
        bindings.push(assignee);
      }
      
      sql += ' GROUP BY t.id ORDER BY rank DESC, t.updated_at DESC LIMIT ?';
      bindings.push(limit);
      
      const stmt = c.env.DB.prepare(sql);
      results = await stmt.bind(...bindings).all();
    }
    
    // Parse results
    const searchResults = results.results.map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      workspace_id: r.workspace_id,
      workspace_name: r.workspace_name,
      workspace_emoji: r.workspace_emoji,
      created_at: r.created_at,
      updated_at: r.updated_at,
      assignee_ids: r.assignee_ids ? r.assignee_ids.split(',') : [],
      assignee_names: r.assignee_names ? r.assignee_names.split(',') : [],
      // Snippets with highlights
      snippets: {
        title: r.title_snippet || r.title,
        description: r.desc_snippet,
        message: r.msg_snippet,
      },
      rank: r.rank,
    }));
    
    return c.json({
      query,
      results: searchResults,
      count: searchResults.length,
      usedFTS,
    });
  } catch (e: any) {
    console.error('Search error:', e);
    return c.json({ error: 'Search failed', message: e.message }, 500);
  }
});

app.get('/api/tasks/:id', async (c) => {
  const id = c.req.param('id');
  
  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  if (!task) return c.json({ error: 'Task not found' }, 404);
  
  const [assignees, messages, subtasks, parentTask] = await Promise.all([
    c.env.DB.prepare(`
      SELECT a.* FROM agents a
      JOIN task_assignees ta ON a.id = ta.agent_id
      WHERE ta.task_id = ?
    `).bind(id).all(),
    c.env.DB.prepare(`
      SELECT m.*, a.name as from_agent_name, a.avatar_emoji
      FROM messages m
      LEFT JOIN agents a ON m.from_agent_id = a.id
      WHERE m.task_id = ?
      ORDER BY m.created_at ASC
    `).bind(id).all(),
    // Get subtasks with assignee info
    c.env.DB.prepare(`
      SELECT t.*, 
        GROUP_CONCAT(DISTINCT a.name) as assignee_names
      FROM tasks t
      LEFT JOIN task_assignees ta ON t.id = ta.task_id
      LEFT JOIN agents a ON ta.agent_id = a.id
      WHERE t.parent_task_id = ?
      GROUP BY t.id
      ORDER BY t.created_at ASC
    `).bind(id).all(),
    // Get parent task if this is a subtask
    (task as any).parent_task_id 
      ? c.env.DB.prepare('SELECT id, title, status FROM tasks WHERE id = ?').bind((task as any).parent_task_id).first()
      : Promise.resolve(null),
  ]);
  
  // Parse subtask assignee names
  const parsedSubtasks = subtasks.results.map((st: any) => ({
    ...st,
    assignee_names: st.assignee_names ? st.assignee_names.split(',') : [],
  }));
  
  return c.json({ 
    task: { 
      ...task, 
      assignees: assignees.results,
      subtask_count: subtasks.results.length,
      incomplete_subtask_count: subtasks.results.filter((st: any) => st.status !== 'done').length,
    },
    messages: messages.results,
    subtasks: parsedSubtasks,
    parent_task: parentTask,
  });
});

// Get subtasks for a task
app.get('/api/tasks/:id/subtasks', async (c) => {
  const id = c.req.param('id');
  
  // Verify parent task exists
  const task = await c.env.DB.prepare('SELECT id, title FROM tasks WHERE id = ?').bind(id).first();
  if (!task) return c.json({ error: 'Task not found' }, 404);
  
  const subtasks = await c.env.DB.prepare(`
    SELECT t.*, 
      GROUP_CONCAT(DISTINCT ta.agent_id) as assignee_ids,
      GROUP_CONCAT(DISTINCT a.name) as assignee_names
    FROM tasks t
    LEFT JOIN task_assignees ta ON t.id = ta.task_id
    LEFT JOIN agents a ON ta.agent_id = a.id
    WHERE t.parent_task_id = ?
    GROUP BY t.id
    ORDER BY 
      CASE t.status WHEN 'done' THEN 1 ELSE 0 END,
      t.created_at ASC
  `).bind(id).all();
  
  const parsed = subtasks.results.map((st: any) => ({
    ...st,
    assignee_ids: st.assignee_ids ? st.assignee_ids.split(',') : [],
    assignee_names: st.assignee_names ? st.assignee_names.split(',') : [],
  }));
  
  return c.json({ 
    parent: task,
    subtasks: parsed,
    count: subtasks.results.length,
    completed: subtasks.results.filter((st: any) => st.status === 'done').length,
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
    
    let workspaceId = body.workspace_id || null;
    let parentTaskId = body.parent_task_id || null;
    
    // Subtask validation
    if (parentTaskId) {
      const parentTask = await c.env.DB.prepare(
        'SELECT id, title, workspace_id, parent_task_id FROM tasks WHERE id = ?'
      ).bind(parentTaskId).first() as any;
      
      if (!parentTask) {
        return c.json({ error: 'Parent task not found' }, 404);
      }
      
      // Max 2 levels: subtask of a subtask is not allowed
      if (parentTask.parent_task_id) {
        return c.json({ 
          error: 'Cannot create subtask of a subtask (max 2 levels)',
          parent_is_subtask_of: parentTask.parent_task_id
        }, 400);
      }
      
      // Inherit workspace from parent
      workspaceId = parentTask.workspace_id;
    }
    
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    
    await c.env.DB.prepare(
      'INSERT INTO tasks (id, title, description, status, priority, workspace_id, created_by, due_date, estimated_minutes, parent_task_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, body.title.trim(), body.description || '', status, priority, workspaceId, body.created_by || null, body.due_date || null, body.estimated_minutes || null, parentTaskId).run();
    
    // Log activity (don't fail if this fails)
    try {
      const activityMsg = parentTaskId 
        ? `Subtask "${body.title}" created` 
        : `Task "${body.title}" created`;
      await logActivity(c.env.DB, 'task_created', body.created_by || null, id, activityMsg);
    } catch (e) {
      console.error('Activity log failed:', e);
    }
    
    // Dispatch webhook event (background - use waitUntil to keep worker alive)
    c.executionCtx.waitUntil(
      dispatchWebhookEvent(c.env.DB, 'task_created', workspaceId, {
        task_id: id,
        title: body.title.trim(),
        description: body.description || '',
        status,
        priority,
        workspace_id: workspaceId,
        parent_task_id: parentTaskId,
        created_by: body.created_by || null
      }, id).catch(e => console.error('Webhook dispatch failed:', e))
    );
    
    return c.json({ id, success: true, parent_task_id: parentTaskId }, 201);
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
  
  // SUBTASK GATE: Parent can't close until ALL subtasks are done
  if (body.status === 'done' && oldTask?.status !== 'done') {
    const incompleteSubtasks = await c.env.DB.prepare(`
      SELECT id, title, status FROM tasks 
      WHERE parent_task_id = ? 
      AND status != 'done'
    `).bind(id).all();
    
    if (incompleteSubtasks.results.length > 0) {
      const subtaskTitles = (incompleteSubtasks.results as any[]).map(t => `${t.title} (${t.status})`).join(', ');
      return c.json({ 
        error: 'Cannot close task - incomplete subtasks exist',
        incomplete_subtasks: incompleteSubtasks.results,
        message: `Complete these subtasks first: ${subtaskTitles}`
      }, 409);
    }
  }
  
  const updates: string[] = [];
  const values: any[] = [];
  
  for (const [key, value] of Object.entries(body)) {
    if (['title', 'description', 'status', 'priority', 'workspace_id', 'deliverable_path', 'due_date', 'blocked_reason', 'estimated_minutes', 'parent_task_id'].includes(key)) {
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
    
    // Dispatch webhook event for status change (get workspace for routing)
    const taskForWebhook = await c.env.DB.prepare('SELECT workspace_id, title FROM tasks WHERE id = ?').bind(id).first() as any;
    c.executionCtx.waitUntil(
      dispatchWebhookEvent(c.env.DB, 'task_status_changed', taskForWebhook?.workspace_id || null, {
        task_id: id,
        title: taskForWebhook?.title,
        old_status: oldTask.status,
        new_status: body.status
      }, id).catch(e => console.error('Webhook dispatch failed:', e))
    );
    
    // If task completed, check if any dependent tasks can be unblocked
    if (body.status === 'done') {
      await checkAndUnblockDependents(c.env.DB, id);
      
      // Auto-close orphaned subtasks (assigned/in_progress) when parent completes
      const orphanedSubtasks = await c.env.DB.prepare(`
        SELECT id, title, status FROM tasks 
        WHERE parent_task_id = ? 
        AND status IN ('assigned', 'in_progress')
      `).bind(id).all();
      
      for (const subtask of orphanedSubtasks.results as any[]) {
        // Update subtask status to done
        await c.env.DB.prepare(
          "UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?"
        ).bind(subtask.id).run();
        
        // Add message to subtask using System agent
        const systemAgent = await c.env.DB.prepare(
          "SELECT id FROM agents WHERE name = 'System' LIMIT 1"
        ).first() as any;
        
        if (systemAgent) {
          const msgId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
          await c.env.DB.prepare(
            'INSERT INTO messages (id, task_id, from_agent_id, content) VALUES (?, ?, ?, ?)'
          ).bind(msgId, subtask.id, systemAgent.id, '[SYSTEM] Auto-closed: parent task completed').run();
        }
        
        await logActivity(c.env.DB, 'task_status_changed', null, subtask.id, 
          `Auto-closed: parent task completed`);
      }
      
      // Log count of auto-closed subtasks on parent task
      if (orphanedSubtasks.results.length > 0) {
        await logActivity(c.env.DB, 'task_updated', null, id,
          `Auto-closed ${orphanedSubtasks.results.length} orphaned subtask(s)`);
      }
    }
  }
  
  // Dispatch task_updated webhook for any update (skip if we already dispatched status_changed)
  if (!(body.status && oldTask && body.status !== oldTask.status)) {
    const taskForWebhook2 = await c.env.DB.prepare('SELECT workspace_id, title FROM tasks WHERE id = ?').bind(id).first() as any;
    c.executionCtx.waitUntil(
      dispatchWebhookEvent(c.env.DB, 'task_updated', taskForWebhook2?.workspace_id || null, {
        task_id: id,
        title: taskForWebhook2?.title,
        updated_fields: Object.keys(body)
      }, id).catch(e => console.error('Webhook dispatch failed:', e))
    );
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
  
  // Dispatch webhook event for task assignment
  const taskForWebhook = await c.env.DB.prepare('SELECT workspace_id FROM tasks WHERE id = ?').bind(taskId).first() as any;
  c.executionCtx.waitUntil(
    dispatchWebhookEvent(c.env.DB, 'task_assigned', taskForWebhook?.workspace_id || null, {
      task_id: taskId,
      task_title: task?.title,
      assigned_agent_id: agentId,
      assigned_agent_name: agent?.name
    }, taskId).catch(e => console.error('Webhook dispatch failed:', e))
  );
  
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
    LEFT JOIN agents a ON m.from_agent_id = a.id
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
  
  // Get task workspace for webhook routing
  const taskForWebhook = await c.env.DB.prepare('SELECT workspace_id, title FROM tasks WHERE id = ?').bind(taskId).first() as any;
  
  // Dispatch message_created webhook (background)
  c.executionCtx.waitUntil(
    dispatchWebhookEvent(c.env.DB, 'message_sent', taskForWebhook?.workspace_id || null, {
      message_id: id,
      task_id: taskId,
      task_title: taskForWebhook?.title,
      from_agent_id: body.from_agent_id,
      from_agent_name: agent?.name,
      content: body.content
    }, id).catch(e => console.error('Webhook dispatch failed:', e))
  );
  
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
      
      // Dispatch agent_mentioned webhook (using task's workspace, background)
      c.executionCtx.waitUntil(
        dispatchWebhookEvent(c.env.DB, 'agent_mentioned', taskForWebhook?.workspace_id || null, {
          task_id: taskId,
          task_title: taskForWebhook?.title,
          message_id: id,
          mentioned_agent_id: mentionedAgent.id,
          mentioned_agent_name: mentionName,
          mentioned_by_id: body.from_agent_id,
          mentioned_by_name: agent?.name,
          message_preview: body.content.slice(0, 100)
        }, id).catch(e => console.error('Webhook dispatch failed:', e))
      );
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

app.delete('/api/teams/:id', async (c) => {
  const teamId = c.req.param('id');
  
  // Check if team exists
  const team = await c.env.DB.prepare('SELECT id, name FROM teams WHERE id = ?').bind(teamId).first();
  if (!team) return c.json({ error: 'Team not found' }, 404);
  
  // Check if team has agents assigned
  const agents = await c.env.DB.prepare('SELECT COUNT(*) as count FROM agents WHERE team_id = ?').bind(teamId).first() as { count: number };
  if (agents && agents.count > 0) {
    return c.json({ error: 'Cannot delete team with assigned agents', agent_count: agents.count }, 400);
  }
  
  // Delete the team
  await c.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(teamId).run();
  return c.json({ success: true, deleted: team.name });
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

// ============ WEBHOOKS ============

// Valid webhook event types
const WEBHOOK_EVENTS = [
  'task_created', 'task_updated', 'task_assigned', 'task_status_changed',
  'message_sent', 'agent_mentioned', 'agent_status_changed', 'deliverable_created', 'doc_updated'
] as const;

// Helper to generate secure webhook secret
function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper to validate HTTPS URL
function isValidHttpsUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

// List webhooks (optionally filter by workspace)
app.get('/api/webhooks', async (c) => {
  const workspaceId = c.req.query('workspace_id');
  
  let query = `
    SELECT w.*, ws.name as workspace_name
    FROM webhooks w
    LEFT JOIN workspaces ws ON w.workspace_id = ws.id
  `;
  
  if (workspaceId) {
    query += ` WHERE w.workspace_id = ?`;
    query += ` ORDER BY w.created_at DESC`;
    const result = await c.env.DB.prepare(query).bind(workspaceId).all();
    return c.json({ webhooks: result.results });
  }
  
  query += ` ORDER BY w.created_at DESC`;
  const result = await c.env.DB.prepare(query).all();
  return c.json({ webhooks: result.results });
});

// Get single webhook
app.get('/api/webhooks/:id', async (c) => {
  const id = c.req.param('id');
  
  const webhook = await c.env.DB.prepare(`
    SELECT w.*, ws.name as workspace_name
    FROM webhooks w
    LEFT JOIN workspaces ws ON w.workspace_id = ws.id
    WHERE w.id = ?
  `).bind(id).first();
  
  if (!webhook) {
    return c.json({ error: 'Webhook not found' }, 404);
  }
  
  return c.json({ webhook });
});

// Create webhook
app.post('/api/webhooks', async (c) => {
  const body = await c.req.json();
  
  // Validate required fields
  if (!body.url?.trim()) {
    return c.json({ error: 'url is required' }, 400);
  }
  
  // Validate URL is HTTPS
  if (!isValidHttpsUrl(body.url.trim())) {
    return c.json({ error: 'URL must be a valid HTTPS URL' }, 400);
  }
  
  // Validate events array
  let events: string[] = [];
  if (body.events) {
    if (!Array.isArray(body.events)) {
      return c.json({ error: 'events must be an array' }, 400);
    }
    
    // Validate each event type
    for (const event of body.events) {
      if (!WEBHOOK_EVENTS.includes(event as any)) {
        return c.json({ 
          error: `Invalid event type: ${event}. Valid types: ${WEBHOOK_EVENTS.join(', ')}` 
        }, 400);
      }
    }
    events = body.events;
  }
  
  // Generate ID and secret
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const secret = generateWebhookSecret();
  
  await c.env.DB.prepare(`
    INSERT INTO webhooks (id, url, events, workspace_id, secret, name, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.url.trim(),
    JSON.stringify(events),
    body.workspace_id || null,
    secret,
    body.name?.trim() || null,
    body.active !== false ? 1 : 0
  ).run();
  
  // Log activity
  await logActivity(c.env.DB, 'task_created', null, null, `Webhook created: ${body.name || body.url}`);
  
  return c.json({ 
    id, 
    secret,  // Return secret on creation only
    success: true 
  }, 201);
});

// Update webhook
app.patch('/api/webhooks/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  const updates: string[] = [];
  const values: any[] = [];
  
  // URL update
  if (body.url !== undefined) {
    if (!isValidHttpsUrl(body.url.trim())) {
      return c.json({ error: 'URL must be a valid HTTPS URL' }, 400);
    }
    updates.push('url = ?');
    values.push(body.url.trim());
  }
  
  // Events update
  if (body.events !== undefined) {
    if (!Array.isArray(body.events)) {
      return c.json({ error: 'events must be an array' }, 400);
    }
    for (const event of body.events) {
      if (!WEBHOOK_EVENTS.includes(event as any)) {
        return c.json({ 
          error: `Invalid event type: ${event}` 
        }, 400);
      }
    }
    updates.push('events = ?');
    values.push(JSON.stringify(body.events));
  }
  
  // Name update
  if (body.name !== undefined) {
    updates.push('name = ?');
    values.push(body.name?.trim() || null);
  }
  
  // Active toggle
  if (body.active !== undefined) {
    updates.push('active = ?');
    values.push(body.active ? 1 : 0);
  }
  
  // Workspace update
  if (body.workspace_id !== undefined) {
    updates.push('workspace_id = ?');
    values.push(body.workspace_id || null);
  }
  
  if (updates.length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }
  
  updates.push("updated_at = datetime('now')");
  values.push(id);
  
  const result = await c.env.DB.prepare(
    `UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();
  
  if (result.meta.changes === 0) {
    return c.json({ error: 'Webhook not found' }, 404);
  }
  
  return c.json({ success: true });
});

// Delete webhook
app.delete('/api/webhooks/:id', async (c) => {
  const id = c.req.param('id');
  
  const result = await c.env.DB.prepare(
    'DELETE FROM webhooks WHERE id = ?'
  ).bind(id).run();
  
  if (result.meta.changes === 0) {
    return c.json({ error: 'Webhook not found' }, 404);
  }
  
  return c.json({ success: true });
});

// Regenerate webhook secret
app.post('/api/webhooks/:id/regenerate-secret', async (c) => {
  const id = c.req.param('id');
  const newSecret = generateWebhookSecret();
  
  const result = await c.env.DB.prepare(
    "UPDATE webhooks SET secret = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(newSecret, id).run();
  
  if (result.meta.changes === 0) {
    return c.json({ error: 'Webhook not found' }, 404);
  }
  
  return c.json({ secret: newSecret, success: true });
});

// ============ WEBHOOK DELIVERIES & RETRY LOGIC ============

// Calculate exponential backoff with jitter (in seconds)
function calculateBackoff(attempt: number): number {
  const base = 60; // 1 minute base
  const maxDelay = 3600; // 1 hour max
  const delay = Math.min(base * Math.pow(2, attempt), maxDelay);
  const jitter = delay * 0.2 * Math.random(); // 20% jitter
  return Math.floor(delay + jitter);
}

// Create HMAC signature for webhook payload
async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Deliver webhook (internal helper)
async function deliverWebhook(
  db: D1Database,
  webhookId: string,
  url: string,
  secret: string,
  eventType: string,
  eventId: string | null,
  payload: object
): Promise<{ success: boolean; statusCode?: number; error?: string; deliveryId: string }> {
  const payloadStr = JSON.stringify(payload);
  const signature = await signPayload(payloadStr, secret);
  const deliveryId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const timestamp = Date.now();
  
  // Create delivery record
  await db.prepare(`
    INSERT INTO webhook_deliveries (id, webhook_id, event_type, event_id, payload, status, attempts)
    VALUES (?, ?, ?, ?, ?, 'pending', 1)
  `).bind(deliveryId, webhookId, eventType, eventId, payloadStr).run();
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MC-Signature': signature,
        'X-MC-Timestamp': timestamp.toString(),
        'X-MC-Event': eventType,
        'X-MC-Delivery': deliveryId,
      },
      body: payloadStr,
    });
    
    if (response.ok) {
      // Success
      await db.prepare(`
        UPDATE webhook_deliveries 
        SET status = 'success', last_status_code = ?, completed_at = datetime('now')
        WHERE id = ?
      `).bind(response.status, deliveryId).run();
      
      return { success: true, statusCode: response.status, deliveryId };
    } else {
      // Failed - schedule retry
      const backoffSeconds = calculateBackoff(1);
      await db.prepare(`
        UPDATE webhook_deliveries 
        SET status = 'retrying', 
            last_status_code = ?, 
            last_error = ?,
            next_retry_at = datetime('now', '+' || ? || ' seconds')
        WHERE id = ?
      `).bind(response.status, `HTTP ${response.status}`, backoffSeconds, deliveryId).run();
      
      return { success: false, statusCode: response.status, error: `HTTP ${response.status}`, deliveryId };
    }
  } catch (err: any) {
    // Network error - schedule retry
    const backoffSeconds = calculateBackoff(1);
    await db.prepare(`
      UPDATE webhook_deliveries 
      SET status = 'retrying', 
          last_error = ?,
          next_retry_at = datetime('now', '+' || ? || ' seconds')
      WHERE id = ?
    `).bind(err.message || 'Network error', backoffSeconds, deliveryId).run();
    
    return { success: false, error: err.message || 'Network error', deliveryId };
  }
}

// ============ WEBHOOK EVENT DISPATCHER ============
// Dispatches events to all matching active webhooks

async function dispatchWebhookEvent(
  db: D1Database,
  eventType: string,
  workspaceId: string | null,
  data: object,
  eventId?: string | null
): Promise<{ dispatched: number; errors: string[] }> {
  const errors: string[] = [];
  let dispatched = 0;

  // Dispatch webhook event

  try {
    // Find active webhooks matching workspace (or global) that subscribe to this event
    // Events stored as JSON array, so we check with LIKE for simplicity
    let webhooks: any[] = [];
    const likePattern = `%"${eventType}"%`;
    
    if (workspaceId) {
      // Get webhooks for specific workspace OR global webhooks (null workspace)
      const result = await db.prepare(`
        SELECT id, url, secret, events FROM webhooks 
        WHERE active = 1 
        AND (workspace_id = ? OR workspace_id IS NULL)
        AND events LIKE ?
      `).bind(workspaceId, likePattern).all();
      webhooks = result.results as any[];
    } else {
      // Global event - only global webhooks
      const result = await db.prepare(`
        SELECT id, url, secret, events FROM webhooks 
        WHERE active = 1 
        AND workspace_id IS NULL
        AND events LIKE ?
      `).bind(likePattern).all();
      webhooks = result.results as any[];
    }

    // Dispatch to each matching webhook
    for (const webhook of webhooks) {
      try {
        // Build payload
        const payload = {
          event: eventType,
          timestamp: new Date().toISOString(),
          data
        };

        // Await the delivery
        await deliverWebhook(
          db,
          webhook.id,
          webhook.url,
          webhook.secret,
          eventType,
          eventId || null,
          payload
        );
        dispatched++;
      } catch (err: any) {
        errors.push(`Failed to dispatch to webhook ${webhook.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`Event dispatch error: ${err.message}`);
  }

  return { dispatched, errors };
}

// Test webhook endpoint - sends sample event
app.post('/api/webhooks/:id/test', async (c) => {
  const id = c.req.param('id');
  
  // Get webhook
  const webhook = await c.env.DB.prepare(
    'SELECT * FROM webhooks WHERE id = ?'
  ).bind(id).first() as any;
  
  if (!webhook) {
    return c.json({ error: 'Webhook not found' }, 404);
  }
  
  if (!webhook.active) {
    return c.json({ error: 'Webhook is not active' }, 400);
  }
  
  // Create test payload
  const testPayload = {
    event: 'test',
    webhook_id: webhook.id,
    timestamp: new Date().toISOString(),
    data: {
      message: 'This is a test delivery from Mission Control',
      test: true,
    }
  };
  
  const result = await deliverWebhook(
    c.env.DB,
    webhook.id,
    webhook.url,
    webhook.secret,
    'test',
    null,
    testPayload
  );
  
  return c.json({
    success: result.success,
    delivery_id: result.deliveryId,
    status_code: result.statusCode,
    error: result.error,
  });
});

// Get webhook deliveries
app.get('/api/webhooks/:id/deliveries', async (c) => {
  const id = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '20');
  const status = c.req.query('status');
  
  // Verify webhook exists
  const webhook = await c.env.DB.prepare(
    'SELECT id FROM webhooks WHERE id = ?'
  ).bind(id).first();
  
  if (!webhook) {
    return c.json({ error: 'Webhook not found' }, 404);
  }
  
  let query = `
    SELECT * FROM webhook_deliveries
    WHERE webhook_id = ?
  `;
  
  const params: any[] = [id];
  
  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }
  
  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);
  
  const result = await c.env.DB.prepare(query).bind(...params).all();
  
  return c.json({ deliveries: result.results });
});

// Process pending retries (can be called by a cron job)
app.post('/api/webhooks/process-retries', async (c) => {
  // Get deliveries that need retry
  const pending = await c.env.DB.prepare(`
    SELECT wd.*, w.url, w.secret, w.active
    FROM webhook_deliveries wd
    JOIN webhooks w ON wd.webhook_id = w.id
    WHERE wd.status = 'retrying'
    AND wd.next_retry_at <= datetime('now')
    AND wd.attempts < wd.max_attempts
    AND w.active = 1
    LIMIT 10
  `).all();
  
  const results: any[] = [];
  
  for (const delivery of pending.results as any[]) {
    const newAttempt = delivery.attempts + 1;
    const payloadObj = JSON.parse(delivery.payload);
    
    try {
      const signature = await signPayload(delivery.payload, delivery.secret);
      const timestamp = Date.now();
      
      const response = await fetch(delivery.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MC-Signature': signature,
          'X-MC-Timestamp': timestamp.toString(),
          'X-MC-Event': delivery.event_type,
          'X-MC-Delivery': delivery.id,
          'X-MC-Retry': newAttempt.toString(),
        },
        body: delivery.payload,
      });
      
      if (response.ok) {
        await c.env.DB.prepare(`
          UPDATE webhook_deliveries 
          SET status = 'success', attempts = ?, last_status_code = ?, completed_at = datetime('now')
          WHERE id = ?
        `).bind(newAttempt, response.status, delivery.id).run();
        
        results.push({ id: delivery.id, success: true, attempt: newAttempt });
      } else {
        if (newAttempt >= delivery.max_attempts) {
          // Max retries reached - mark as failed
          await c.env.DB.prepare(`
            UPDATE webhook_deliveries 
            SET status = 'failed', attempts = ?, last_status_code = ?, last_error = ?
            WHERE id = ?
          `).bind(newAttempt, response.status, `HTTP ${response.status} after ${newAttempt} attempts`, delivery.id).run();
          
          results.push({ id: delivery.id, success: false, failed: true, attempt: newAttempt });
        } else {
          // Schedule next retry
          const backoffSeconds = calculateBackoff(newAttempt);
          await c.env.DB.prepare(`
            UPDATE webhook_deliveries 
            SET attempts = ?, last_status_code = ?, last_error = ?,
                next_retry_at = datetime('now', '+' || ? || ' seconds')
            WHERE id = ?
          `).bind(newAttempt, response.status, `HTTP ${response.status}`, backoffSeconds, delivery.id).run();
          
          results.push({ id: delivery.id, success: false, retry_scheduled: true, attempt: newAttempt });
        }
      }
    } catch (err: any) {
      if (newAttempt >= delivery.max_attempts) {
        await c.env.DB.prepare(`
          UPDATE webhook_deliveries 
          SET status = 'failed', attempts = ?, last_error = ?
          WHERE id = ?
        `).bind(newAttempt, `${err.message} after ${newAttempt} attempts`, delivery.id).run();
        
        results.push({ id: delivery.id, success: false, failed: true, error: err.message });
      } else {
        const backoffSeconds = calculateBackoff(newAttempt);
        await c.env.DB.prepare(`
          UPDATE webhook_deliveries 
          SET attempts = ?, last_error = ?,
              next_retry_at = datetime('now', '+' || ? || ' seconds')
          WHERE id = ?
        `).bind(newAttempt, err.message, backoffSeconds, delivery.id).run();
        
        results.push({ id: delivery.id, success: false, retry_scheduled: true, error: err.message });
      }
    }
  }
  
  return c.json({ processed: results.length, results });
});

export default app;
