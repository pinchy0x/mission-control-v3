'use client';

import { useState, useEffect } from 'react';
import { fetchAPI } from '@/lib/api';
import type { Agent, Task, Team, Workspace, Tag, Activity } from '@/lib/types';

import { Header } from '@/components/layout';
import { TaskBoard, TaskDetailModal, NewTaskModal } from '@/components/tasks';
import { AgentsSidebar } from '@/components/agents';
import { TeamsView } from '@/components/teams';
import { ActivityFeed } from '@/components/activity';
import { DocsModal } from '@/components/docs';
import { TableView, CalendarView, ViewSwitcher, type ViewType } from '@/components/views';
import { Button } from '@/components/ui';
import { FileText } from 'lucide-react';

export default function Dashboard() {
  // Data state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  
  // UI state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState('all');
  const [viewMode, setViewMode] = useState<ViewType>(() => {
    // Load from localStorage on client
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mc-view-preference');
      if (saved && ['board', 'table', 'calendar', 'teams'].includes(saved)) {
        return saved as ViewType;
      }
    }
    return 'board';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load and polling
  useEffect(() => {
    loadData();
    const dataInterval = setInterval(loadData, 10000);
    return () => clearInterval(dataInterval);
  }, []);

  // Persist view preference
  useEffect(() => {
    localStorage.setItem('mc-view-preference', viewMode);
  }, [viewMode]);

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

  async function createTask(title: string, description: string, dueDate: string | null, estimate: number | null) {
    await fetchAPI('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ 
        title, 
        description,
        due_date: dueDate,
        estimated_minutes: estimate,
        workspace_id: selectedWorkspace !== 'all' ? selectedWorkspace : undefined,
      }),
    });
    loadData();
  }

  // Filter tasks by workspace
  const filteredTasks = selectedWorkspace === 'all' 
    ? tasks 
    : tasks.filter(t => t.workspace_id === selectedWorkspace);

  // Loading state
  if (loading && agents.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🦀</div>
          <div className="text-zinc-400">Loading Mission Control...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Error banner */}
      {error && (
        <div className="bg-red-500/20 text-red-300 px-4 py-2 text-center text-sm border-b border-red-500/30">
          {error} 
          <button onClick={() => { setError(null); loadData(); }} className="underline ml-2 hover:text-red-200">
            Retry
          </button>
        </div>
      )}

      {/* Header */}
      <Header
        tasks={filteredTasks}
        agents={agents}
        workspaces={workspaces}
        selectedWorkspace={selectedWorkspace}
        onWorkspaceChange={setSelectedWorkspace}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onCreateTask={() => setShowNewTask(true)}
        onRefresh={loadData}
        onTaskClick={(id) => {
          const task = tasks.find(t => t.id === id);
          if (task) setSelectedTask(task);
        }}
        isLoading={loading}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
        {/* Left Sidebar - Agents */}
        <aside className="col-span-1 md:col-span-2 order-2 md:order-1">
          <AgentsSidebar 
            agents={agents} 
            onTaskClick={setSelectedTask}
          />
        </aside>

        {/* Main Content - Task Board or Teams View */}
        <main className="col-span-1 md:col-span-7 order-1 md:order-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-zinc-300">
              {viewMode === 'teams' ? 'Teams' : 'Tasks'}
            </h2>
            <div className="flex items-center gap-2">
              <ViewSwitcher currentView={viewMode} onViewChange={setViewMode} />
              <Button variant="secondary" size="sm" onClick={() => setShowDocs(true)}>
                <FileText className="h-4 w-4" />
                Docs
              </Button>
            </div>
          </div>

          {viewMode === 'board' && (
            <TaskBoard 
              tasks={filteredTasks} 
              onTaskClick={setSelectedTask}
            />
          )}

          {viewMode === 'table' && (
            <TableView
              tasks={filteredTasks}
              agents={agents}
              onTaskClick={setSelectedTask}
              onUpdate={loadData}
            />
          )}

          {viewMode === 'calendar' && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 h-[calc(100vh-16rem)]">
              <CalendarView
                tasks={filteredTasks}
                onTaskClick={setSelectedTask}
                onUpdate={loadData}
              />
            </div>
          )}

          {viewMode === 'teams' && (
            <TeamsView
              teams={teams}
              agents={agents}
              tasks={filteredTasks}
              onAgentClick={(agent) => {
                console.log('Agent clicked:', agent);
              }}
            />
          )}
        </main>

        {/* Right Sidebar - Activity Feed */}
        <aside className="col-span-1 md:col-span-3 order-3">
          <ActivityFeed activities={activities} />
        </aside>
      </div>

      {/* Modals */}
      <NewTaskModal
        isOpen={showNewTask}
        onClose={() => setShowNewTask(false)}
        onCreate={createTask}
      />

      <TaskDetailModal
        task={selectedTask}
        agents={agents}
        tags={tags}
        tasks={tasks}
        onClose={() => setSelectedTask(null)}
        onUpdate={loadData}
      />

      <DocsModal
        isOpen={showDocs}
        onClose={() => setShowDocs(false)}
        workspaceId={selectedWorkspace !== 'all' ? selectedWorkspace : 'default'}
      />
    </div>
  );
}
