'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://mc-v3-api.saurabh-198.workers.dev';
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || 'mc-v3-token-2026';

type Agent = {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'active' | 'blocked';
  level: string;
  avatar_emoji: string;
  current_task_id: string | null;
  team_id?: string;
  team_name?: string;
  department?: string;
};

type Team = {
  id: string;
  name: string;
  emoji: string;
  department_name: string;
  agent_count: number;
};

type Workspace = {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  task_count: number;
  completed_count: number;
};

type Task = {
  id: string;
  title: string;
  description: string;
  status: 'inbox' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked';
  priority: string;
  assignee_ids: string[];
  assignee_names: string[];
  created_at: string;
  due_date: string | null;
  estimated_minutes: number | null;
  tag_ids: string[];
  tag_names: string[];
  tag_colors: string[];
};

type Tag = {
  id: string;
  name: string;
  color: string;
};

// Helper functions for due dates and estimates
function formatDueDate(dueDate: string | null, status: string): { text: string; isOverdue: boolean } {
  if (!dueDate) return { text: '', isOverdue: false };
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  const isOverdue = diffDays < 0 && status !== 'done';
  if (isOverdue) return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true };
  if (diffDays === 0) return { text: 'Due today', isOverdue: false };
  if (diffDays === 1) return { text: 'Due tomorrow', isOverdue: false };
  return { text: `Due in ${diffDays}d`, isOverdue: false };
}

function formatEstimate(mins: number | null): string {
  if (!mins) return '';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `about ${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

type Activity = {
  id: string;
  type: string;
  agent_name: string;
  avatar_emoji: string;
  task_title: string;
  message: string;
  created_at: string;
};

type Doc = {
  id: string;
  workspace_id: string;
  filename: string;
  content?: string;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
  content_length: number;
};

const statusColumns = ['inbox', 'assigned', 'in_progress', 'review', 'done'] as const;
const statusLabels: Record<string, string> = {
  inbox: 'Inbox',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};

async function fetchAPI(path: string, options?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
  
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    clearTimeout(timeout);
    return res.json();
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      console.error('Request timeout:', path);
      return null;
    }
    throw e;
  }
}

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskEstimate, setNewTaskEstimate] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agentQueue, setAgentQueue] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState({ agentsActive: 0, tasksInQueue: 0, tasksInProgress: 0 });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activityFilter, setActivityFilter] = useState<'all' | 'tasks' | 'comments' | 'status'>('all');
  const [showDocs, setShowDocs] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [docContent, setDocContent] = useState('');
  const [editingDoc, setEditingDoc] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const currentWorkspace = 'default'; // Hardcoded for v1
  const [taskMessages, setTaskMessages] = useState<{id: string; content: string; from_agent_name: string; avatar_emoji: string; created_at: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'board' | 'teams'>('board');

  useEffect(() => {
    loadData();
    loadStats();
    const dataInterval = setInterval(loadData, 10000); // Refresh every 10s
    const statsInterval = setInterval(loadStats, 30000); // Stats every 30s
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(statsInterval);
      clearInterval(clockInterval);
    };
  }, []);

  async function loadStats() {
    try {
      const data = await fetchAPI('/api/stats');
      if (data) setStats(data);
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  }

  async function loadData() {
    try {
      setError(null);
      const [agentsData, tasksData, activitiesData, tagsData, teamsData, workspacesData] = await Promise.all([
        fetchAPI('/api/agents'),
        fetchAPI('/api/tasks'),
        fetchAPI('/api/activities?limit=20'),
        fetchAPI('/api/tags'),
        fetchAPI('/api/teams'),
        fetchAPI('/api/workspaces'),
      ]);
      setAgents(agentsData?.agents || []);
      setTasks(tasksData?.tasks || []);
      setActivities(activitiesData?.activities || []);
      setTags(tagsData?.tags || []);
      setTeams(teamsData?.teams || []);
      setWorkspaces(workspacesData?.workspaces || []);
    } catch (e) {
      console.error('Failed to load data:', e);
      setError('Failed to load data. Pull to refresh.');
    } finally {
      setLoading(false);
    }
  }

  async function createTask() {
    if (!newTaskTitle.trim()) return;
    await fetchAPI('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ 
        title: newTaskTitle, 
        description: newTaskDesc,
        due_date: newTaskDueDate ? new Date(newTaskDueDate).toISOString() : null,
        estimated_minutes: newTaskEstimate ? parseInt(newTaskEstimate) : null,
      }),
    });
    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskDueDate('');
    setNewTaskEstimate('');
    setShowNewTask(false);
    loadData();
  }

  async function loadAgentQueue(agent: Agent) {
    if (selectedAgent?.id === agent.id) {
      // Toggle off if same agent clicked
      setSelectedAgent(null);
      setAgentQueue([]);
      return;
    }
    setSelectedAgent(agent);
    const data = await fetchAPI(`/api/agents/${agent.id}/queue`);
    setAgentQueue(data.queue || []);
  }

  async function updateTaskStatus(taskId: string, status: string) {
    await fetchAPI(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadData();
  }

  async function updateTaskField(taskId: string, field: string, value: string | number | null) {
    await fetchAPI(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ [field]: value }),
    });
    loadData();
  }

  async function toggleTaskTag(taskId: string, tagId: string, currentTagIds: string[]) {
    const newTagIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter(id => id !== tagId)
      : [...currentTagIds, tagId];
    await fetchAPI(`/api/tasks/${taskId}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tag_ids: newTagIds }),
    });
    loadData();
  }

  async function approveTask(taskId: string, agentId: string) {
    await fetchAPI(`/api/tasks/${taskId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId }),
    });
    loadData();
  }

  async function rejectTask(taskId: string, agentId: string, feedback: string) {
    await fetchAPI(`/api/tasks/${taskId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, feedback }),
    });
    loadData();
  }

  async function claimTask(taskId: string, agentId: string) {
    const result = await fetchAPI(`/api/tasks/${taskId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId }),
    });
    if (result.error) {
      alert(result.error);
    }
    loadData();
  }

  async function assignAgent(taskId: string, agentId: string) {
    await fetchAPI(`/api/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId }),
    });
    loadData();
  }

  async function loadDocs() {
    const data = await fetchAPI(`/api/docs?workspace=${currentWorkspace}`);
    setDocs(data.docs || []);
  }

  async function loadDocContent(doc: Doc) {
    setSelectedDoc(doc);
    const data = await fetchAPI(`/api/docs/${doc.workspace_id}/${doc.filename}`);
    setDocContent(data.doc?.content || '');
    setEditingDoc(false);
  }

  async function saveDoc() {
    if (!selectedDoc) return;
    await fetchAPI(`/api/docs/${selectedDoc.workspace_id}/${selectedDoc.filename}`, {
      method: 'POST',
      body: JSON.stringify({ content: docContent }),
    });
    setEditingDoc(false);
    loadDocs();
  }

  async function createDoc() {
    if (!newDocName.trim()) return;
    const filename = newDocName.endsWith('.md') ? newDocName : `${newDocName}.md`;
    await fetchAPI(`/api/docs/${currentWorkspace}/${filename}`, {
      method: 'POST',
      body: JSON.stringify({ content: `# ${newDocName.replace('.md', '')}\n\n` }),
    });
    setNewDocName('');
    loadDocs();
  }

  async function deleteDoc(doc: Doc) {
    if (!confirm(`Delete ${doc.filename}?`)) return;
    await fetchAPI(`/api/docs/${doc.workspace_id}/${doc.filename}`, { method: 'DELETE' });
    if (selectedDoc?.id === doc.id) {
      setSelectedDoc(null);
      setDocContent('');
    }
    loadDocs();
  }

  function openDocs() {
    loadDocs();
    setShowDocs(true);
  }

  async function selectTask(task: Task) {
    setSelectedTask(task);
    // Load messages for this task
    const data = await fetchAPI(`/api/tasks/${task.id}/messages`);
    setTaskMessages(data.messages || []);
  }

  const tasksByStatus = statusColumns.reduce((acc, status) => {
    acc[status] = tasks.filter(t => t.status === status);
    return acc;
  }, {} as Record<string, Task[]>);

  // Loading state
  if (loading && agents.length === 0) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🦀</div>
          <div className="text-stone-600">Loading Mission Control...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-amber-50">
      {/* Error banner */}
      {error && (
        <div className="bg-red-500 text-white px-4 py-2 text-center text-sm">
          {error} <button onClick={() => { setError(null); loadData(); }} className="underline ml-2">Retry</button>
        </div>
      )}
      {/* Header */}
      <header className="bg-stone-800 text-amber-50 px-4 md:px-6 py-3 md:py-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-0 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-8 w-full md:w-auto">
            <div className="flex justify-between items-center w-full md:w-auto">
              <h1 className="text-xl md:text-2xl font-serif font-bold">Mission Control</h1>
              {/* Mobile: Online indicator in header row */}
              <div className="flex md:hidden items-center gap-2 bg-green-600/20 px-2 py-1 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-green-400">ONLINE</span>
              </div>
            </div>
            <div className="flex items-center gap-4 md:gap-6 text-sm">
              <div className="text-center">
                <div className="text-xl md:text-2xl font-bold">{stats.agentsActive}</div>
                <div className="text-[10px] md:text-xs opacity-75 uppercase tracking-wide">Active</div>
              </div>
              <div className="text-center">
                <div className="text-xl md:text-2xl font-bold">{stats.tasksInQueue + stats.tasksInProgress}</div>
                <div className="text-[10px] md:text-xs opacity-75 uppercase tracking-wide">In Queue</div>
              </div>
              {/* Mobile: Docs button inline with stats */}
              <button
                onClick={openDocs}
                className="md:hidden bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
              >
                📄
              </button>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            {/* Workspace Selector */}
            <select
              value={selectedWorkspace}
              onChange={(e) => setSelectedWorkspace(e.target.value)}
              className="bg-stone-700 text-amber-50 px-3 py-2 rounded text-sm border border-stone-600 focus:border-amber-500 outline-none"
            >
              <option value="all">All Workspaces</option>
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.emoji} {ws.name}</option>
              ))}
            </select>
            {/* View Mode Toggle */}
            <div className="flex bg-stone-700 rounded overflow-hidden">
              <button
                onClick={() => setViewMode('board')}
                className={`px-3 py-2 text-sm ${viewMode === 'board' ? 'bg-amber-600 text-white' : 'text-stone-300 hover:text-white'}`}
              >
                📋 Board
              </button>
              <button
                onClick={() => setViewMode('teams')}
                className={`px-3 py-2 text-sm ${viewMode === 'teams' ? 'bg-amber-600 text-white' : 'text-stone-300 hover:text-white'}`}
              >
                👥 Teams
              </button>
            </div>
            <button
              onClick={openDocs}
              className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              📄 Docs
            </button>
            <div className="text-right">
              <div className="text-xl font-mono">{currentTime.toLocaleTimeString()}</div>
              <div className="text-xs opacity-75">
                {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>
            <div className="flex items-center gap-2 bg-green-600/20 px-3 py-1 rounded-full">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-green-400">ONLINE</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
        {/* Sidebar - Agents */}
        <aside className="col-span-1 md:col-span-2 order-2 md:order-1">
          <h2 className="font-serif text-base md:text-lg font-semibold mb-3 md:mb-4 text-stone-700">The Squad</h2>
          <div className="flex md:flex-col gap-3 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0">
            {agents.map(agent => (
              <div key={agent.id} className="flex-shrink-0 w-[140px] md:w-auto">
                <div 
                  onClick={() => loadAgentQueue(agent)}
                  className={`bg-white rounded-lg p-2 md:p-3 shadow-sm border cursor-pointer transition-all ${
                    selectedAgent?.id === agent.id 
                      ? 'border-amber-500 ring-2 ring-amber-200' 
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{agent.avatar_emoji}</span>
                    <div className="flex-1">
                      <div className="font-medium text-stone-800">{agent.name}</div>
                      <div className="text-xs text-stone-500">{agent.role}</div>
                    </div>
                    {selectedAgent?.id === agent.id && (
                      <span className="text-xs text-amber-600">▼</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      agent.level === 'lead' ? 'bg-amber-100 text-amber-700 font-medium' :
                      agent.level === 'specialist' ? 'bg-blue-100 text-blue-700' :
                      'bg-stone-100 text-stone-600'
                    }`}>
                      {agent.level === 'lead' ? 'LEAD' : agent.level === 'specialist' ? 'SPC' : 'INT'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${
                      agent.status === 'active' ? 'bg-green-100 text-green-700' :
                      agent.status === 'blocked' ? 'bg-red-100 text-red-700' :
                      'bg-stone-100 text-stone-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        agent.status === 'active' ? 'bg-green-500 animate-pulse' :
                        agent.status === 'blocked' ? 'bg-red-500' :
                        'bg-stone-400'
                      }`}></span>
                      {agent.status}
                    </span>
                  </div>
                </div>
                
                {/* Agent Queue (expanded when selected) */}
                {selectedAgent?.id === agent.id && (
                  <div className="mt-2 ml-2 border-l-2 border-amber-300 pl-3 space-y-2">
                    <div className="text-xs font-medium text-amber-700 mb-2">
                      Queue ({agentQueue.length})
                    </div>
                    {agentQueue.length === 0 ? (
                      <p className="text-xs text-stone-400 italic">No tasks assigned</p>
                    ) : (
                      agentQueue.map(task => (
                        <div 
                          key={task.id}
                          onClick={(e) => { e.stopPropagation(); selectTask(task); }}
                          className="bg-amber-50 rounded p-2 text-xs cursor-pointer hover:bg-amber-100 border border-amber-200"
                        >
                          <div className="font-medium text-stone-800 truncate">{task.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                              task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                              'bg-stone-100 text-stone-600'
                            }`}>
                              {task.priority}
                            </span>
                            <span className="text-stone-400">{task.status}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Main - Task Board */}
        <main className="col-span-1 md:col-span-7 order-1 md:order-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-serif text-lg font-semibold text-stone-700">Tasks</h2>
            <button
              onClick={() => setShowNewTask(true)}
              className="bg-stone-800 text-white px-4 py-2 rounded text-sm hover:bg-stone-700"
            >
              + New Task
            </button>
          </div>

          {/* New Task Modal */}
          {showNewTask && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
              <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
                <h3 className="font-serif text-lg font-semibold mb-4">New Task</h3>
                <input
                  type="text"
                  placeholder="Task title..."
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  className="w-full border border-stone-300 rounded px-3 py-2 mb-3"
                />
                <textarea
                  placeholder="Description..."
                  value={newTaskDesc}
                  onChange={e => setNewTaskDesc(e.target.value)}
                  className="w-full border border-stone-300 rounded px-3 py-2 mb-3 h-24"
                />
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Due Date</label>
                    <input
                      type="date"
                      value={newTaskDueDate}
                      onChange={e => setNewTaskDueDate(e.target.value)}
                      className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Estimate (minutes)</label>
                    <input
                      type="number"
                      placeholder="e.g. 60"
                      value={newTaskEstimate}
                      onChange={e => setNewTaskEstimate(e.target.value)}
                      className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowNewTask(false)}
                    className="px-4 py-2 text-stone-600 hover:text-stone-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createTask}
                    className="bg-stone-800 text-white px-4 py-2 rounded hover:bg-stone-700"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Kanban Board */}
          <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
            {statusColumns.map(status => (
              <div key={status} className="flex-shrink-0 w-[160px] md:w-auto md:flex-1 md:min-w-[180px]">
                <div className="bg-stone-200 rounded-t px-2 md:px-3 py-2 font-medium text-stone-700 text-xs md:text-sm">
                  {statusLabels[status]} ({tasksByStatus[status]?.length || 0})
                </div>
                <div className="bg-stone-100 rounded-b p-2 min-h-[300px] md:min-h-[400px] space-y-2">
                  {tasksByStatus[status]?.map(task => {
                    const dueInfo = formatDueDate(task.due_date, task.status);
                    return (
                      <div
                        key={task.id}
                        onClick={() => selectTask(task)}
                        className={`bg-white rounded p-3 shadow-sm border cursor-pointer hover:shadow-md transition-shadow ${
                          dueInfo.isOverdue ? 'border-l-4 border-l-red-500 border-stone-200' : 'border-stone-200'
                        }`}
                      >
                        <div className="font-medium text-stone-800 text-sm">{task.title}</div>
                        {task.assignee_names?.length > 0 && (
                          <div className="text-xs text-stone-500 mt-1">
                            {task.assignee_names.join(', ')}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {task.priority === 'urgent' && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                              Urgent
                            </span>
                          )}
                          {dueInfo.text && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              dueInfo.isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {dueInfo.text}
                            </span>
                          )}
                          {task.estimated_minutes && (
                            <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
                              ⏱ {formatEstimate(task.estimated_minutes)}
                            </span>
                          )}
                          {task.tag_names?.map((tagName, i) => (
                            <span 
                              key={tagName}
                              className="text-xs px-2 py-0.5 rounded text-white"
                              style={{ backgroundColor: task.tag_colors?.[i] || '#6b7280' }}
                            >
                              {tagName}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Task Detail Modal */}
          {selectedTask && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
              <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-serif text-xl font-semibold">{selectedTask.title}</h3>
                  <button onClick={() => { setSelectedTask(null); setTaskMessages([]); }} className="text-stone-400 hover:text-stone-600">
                    ✕
                  </button>
                </div>
                <p className="text-stone-600 mb-4">{selectedTask.description || 'No description'}</p>
                
                <div className="mb-4">
                  <label className="text-sm font-medium text-stone-700">Status</label>
                  <select
                    value={selectedTask.status}
                    onChange={e => {
                      updateTaskStatus(selectedTask.id, e.target.value);
                      setSelectedTask({ ...selectedTask, status: e.target.value as Task['status'] });
                    }}
                    className="w-full mt-1 border border-stone-300 rounded px-3 py-2"
                  >
                    {statusColumns.map(s => (
                      <option key={s} value={s}>{statusLabels[s]}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="text-sm font-medium text-stone-700">Assign Agent</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {agents.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => assignAgent(selectedTask.id, agent.id)}
                        className={`px-3 py-1 rounded text-sm ${
                          selectedTask.assignee_ids?.includes(agent.id)
                            ? 'bg-stone-800 text-white'
                            : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                        }`}
                      >
                        {agent.avatar_emoji} {agent.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-sm font-medium text-stone-700">Tags</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => {
                          toggleTaskTag(selectedTask.id, tag.id, selectedTask.tag_ids || []);
                          const newTagIds = selectedTask.tag_ids?.includes(tag.id)
                            ? selectedTask.tag_ids.filter(id => id !== tag.id)
                            : [...(selectedTask.tag_ids || []), tag.id];
                          const newTagNames = newTagIds.map(id => tags.find(t => t.id === id)?.name || '');
                          const newTagColors = newTagIds.map(id => tags.find(t => t.id === id)?.color || '');
                          setSelectedTask({ 
                            ...selectedTask, 
                            tag_ids: newTagIds,
                            tag_names: newTagNames,
                            tag_colors: newTagColors
                          });
                        }}
                        className={`px-3 py-1 rounded text-sm transition-all ${
                          selectedTask.tag_ids?.includes(tag.id)
                            ? 'text-white ring-2 ring-stone-800 ring-offset-1'
                            : 'text-white opacity-50 hover:opacity-75'
                        }`}
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                      </button>
                    ))}
                    {tags.length === 0 && (
                      <span className="text-xs text-stone-400 italic">No tags created yet</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-sm font-medium text-stone-700">Due Date</label>
                    <input
                      type="date"
                      value={selectedTask.due_date ? selectedTask.due_date.split('T')[0] : ''}
                      onChange={e => {
                        const newDate = e.target.value ? new Date(e.target.value).toISOString() : null;
                        updateTaskField(selectedTask.id, 'due_date', newDate);
                        setSelectedTask({ ...selectedTask, due_date: newDate });
                      }}
                      className="w-full mt-1 border border-stone-300 rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-stone-700">Estimate (min)</label>
                    <input
                      type="number"
                      placeholder="e.g. 60"
                      value={selectedTask.estimated_minutes || ''}
                      onChange={e => {
                        const mins = e.target.value ? parseInt(e.target.value) : null;
                        updateTaskField(selectedTask.id, 'estimated_minutes', mins);
                        setSelectedTask({ ...selectedTask, estimated_minutes: mins });
                      }}
                      className="w-full mt-1 border border-stone-300 rounded px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Action Buttons based on status */}
                {selectedTask.status === 'inbox' && agents.length > 0 && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-700 mb-2">Claim this task to start working on it</p>
                    <div className="flex flex-wrap gap-2">
                      {agents.map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => {
                            claimTask(selectedTask.id, agent.id);
                            setSelectedTask(null);
                          }}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                          Claim as {agent.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTask.status === 'review' && agents.length > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-sm text-amber-700 mb-2">Review this task</p>
                    <div className="flex gap-2">
                      <select id="reviewer-select" className="border rounded px-2 py-1 text-sm flex-1">
                        {agents.map(agent => (
                          <option key={agent.id} value={agent.id}>
                            {agent.avatar_emoji} {agent.name} ({agent.level})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          const select = document.getElementById('reviewer-select') as HTMLSelectElement;
                          approveTask(selectedTask.id, select.value);
                          setSelectedTask(null);
                        }}
                        className="px-4 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => {
                          const select = document.getElementById('reviewer-select') as HTMLSelectElement;
                          const feedback = prompt('Enter rejection feedback (required):');
                          if (feedback?.trim()) {
                            rejectTask(selectedTask.id, select.value, feedback);
                            setSelectedTask(null);
                          }
                        }}
                        className="px-4 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                      >
                        ✗ Reject
                      </button>
                    </div>
                  </div>
                )}

                {/* Comments/Messages Section */}
                {taskMessages.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-stone-200">
                    <h4 className="text-sm font-medium text-stone-700 mb-3">
                      💬 Comments ({taskMessages.length})
                    </h4>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {taskMessages.map(msg => (
                        <div key={msg.id} className="bg-stone-50 rounded-lg p-3 border border-stone-200">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{msg.avatar_emoji || '🤖'}</span>
                            <span className="font-medium text-sm text-stone-800">{msg.from_agent_name}</span>
                            <span className="text-xs text-stone-400">{timeAgo(msg.created_at)}</span>
                          </div>
                          <div className="text-sm text-stone-700 whitespace-pre-wrap max-h-[200px] overflow-y-auto font-mono text-xs bg-white p-2 rounded border">
                            {msg.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-stone-400 mt-4">
                  Created: {new Date(selectedTask.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Docs Modal */}
          {showDocs && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
              <div className="bg-white rounded-lg w-full max-w-4xl h-[90vh] md:h-[80vh] shadow-xl flex flex-col">
                {/* Docs Header */}
                <div className="flex justify-between items-center p-3 md:p-4 border-b border-stone-200">
                  <h3 className="font-serif text-lg md:text-xl font-semibold">📄 Docs</h3>
                  <button onClick={() => setShowDocs(false)} className="text-stone-400 hover:text-stone-600 text-2xl">
                    ✕
                  </button>
                </div>
                
                {/* Docs Content */}
                <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                  {/* Doc List Sidebar */}
                  <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-stone-200 flex flex-col max-h-[30vh] md:max-h-none">
                    <div className="p-3 border-b border-stone-100">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="new-doc-name"
                          value={newDocName}
                          onChange={e => setNewDocName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && createDoc()}
                          className="flex-1 border border-stone-300 rounded px-2 py-1 text-sm"
                        />
                        <button
                          onClick={createDoc}
                          className="bg-stone-800 text-white px-3 py-1 rounded text-sm hover:bg-stone-700"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {docs.length === 0 ? (
                        <p className="text-sm text-stone-400 p-2">No docs yet</p>
                      ) : (
                        docs.map(doc => (
                          <div
                            key={doc.id}
                            className={`flex items-center justify-between p-2 rounded cursor-pointer group ${
                              selectedDoc?.id === doc.id
                                ? 'bg-amber-100 border border-amber-300'
                                : 'hover:bg-stone-100'
                            }`}
                          >
                            <div className="flex-1" onClick={() => loadDocContent(doc)}>
                              <div className="text-sm font-medium text-stone-800">{doc.filename}</div>
                              <div className="text-xs text-stone-500">
                                {timeAgo(doc.updated_at)}
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteDoc(doc); }}
                              className="text-stone-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              🗑
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  
                  {/* Doc Content */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {selectedDoc ? (
                      <>
                        <div className="flex justify-between items-center p-3 border-b border-stone-100 bg-stone-50">
                          <div>
                            <span className="font-medium">{selectedDoc.filename}</span>
                            {selectedDoc.updated_by_name && (
                              <span className="text-xs text-stone-500 ml-2">
                                Last edited by {selectedDoc.updated_by_name}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {editingDoc ? (
                              <>
                                <button
                                  onClick={() => setEditingDoc(false)}
                                  className="px-3 py-1 text-stone-600 text-sm hover:text-stone-800"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={saveDoc}
                                  className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                                >
                                  Save
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setEditingDoc(true)}
                                className="bg-stone-200 text-stone-700 px-3 py-1 rounded text-sm hover:bg-stone-300"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                          {editingDoc ? (
                            <textarea
                              value={docContent}
                              onChange={e => setDocContent(e.target.value)}
                              className="w-full h-full border border-stone-300 rounded p-3 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          ) : (
                            <div className="prose prose-stone max-w-none">
                              <pre className="whitespace-pre-wrap font-sans text-sm text-stone-800 leading-relaxed">
                                {docContent || 'Empty document'}
                              </pre>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-stone-400">
                        <div className="text-center">
                          <div className="text-4xl mb-2">📄</div>
                          <p>Select a doc to view</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Right Sidebar - Activity Feed */}
        <aside className="col-span-1 md:col-span-3 order-3">
          <h2 className="font-serif text-lg font-semibold mb-4 text-stone-700">Activity</h2>
          
          {/* Filter Chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            {(['all', 'tasks', 'comments', 'status'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setActivityFilter(filter)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activityFilter === filter
                    ? 'bg-stone-800 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-4 max-h-[550px] overflow-y-auto">
            {activities.length === 0 ? (
              <p className="text-stone-400 text-sm">No activity yet</p>
            ) : (
              <div className="space-y-4">
                {activities
                  .filter(activity => {
                    if (activityFilter === 'all') return true;
                    if (activityFilter === 'tasks') return activity.type?.includes('task');
                    if (activityFilter === 'comments') return activity.type === 'message_sent';
                    if (activityFilter === 'status') return activity.type?.includes('status');
                    return true;
                  })
                  .map(activity => (
                  <div key={activity.id} className="border-b border-stone-100 pb-3 last:border-0">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{activity.avatar_emoji || '📋'}</span>
                      <div className="flex-1">
                        <p className="text-sm text-stone-800">{activity.message}</p>
                        {activity.task_title && (
                          <p className="text-xs text-stone-500 mt-1">on "{activity.task_title}"</p>
                        )}
                        <p className="text-xs text-stone-400 mt-1">
                          {timeAgo(activity.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
