'use client';

import { useState, useEffect } from 'react';
import { fetchAPI } from '@/lib/api';
import type { Task, Agent, Tag } from '@/lib/types';
import { TaskCard, TaskDetailModal } from '@/components/tasks';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';

export default function ReviewPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    try {
      const [tasksData, agentsData, tagsData, allTasksData] = await Promise.all([
        fetchAPI('/api/tasks?status=review'),
        fetchAPI('/api/agents'),
        fetchAPI('/api/tags'),
        fetchAPI('/api/tasks'),
      ]);
      setTasks(tasksData?.tasks || []);
      setAgents(agentsData?.agents || []);
      setTags(tagsData?.tags || []);
      setAllTasks(allTasksData?.tasks || []);
    } catch (e) {
      console.error('Failed to load review tasks:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">Review Queue</h1>
          <p className="text-zinc-500 mt-1">Tasks waiting for review and approval</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="text-4xl mb-4">🦀</div>
            <div className="text-zinc-400">Loading review queue...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Review Queue</h1>
          <p className="text-zinc-500 mt-1">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''} waiting for review
          </p>
        </div>
        <Button variant="secondary" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardCheck className="h-12 w-12 text-green-500 mb-4" />
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">
            All caught up!
          </h3>
          <p className="text-zinc-500">
            No tasks are currently waiting for review.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => setSelectedTask(task)}
            />
          ))}
        </div>
      )}

      <TaskDetailModal
        task={selectedTask}
        agents={agents}
        tags={tags}
        tasks={allTasks}
        onClose={() => setSelectedTask(null)}
        onUpdate={loadData}
      />
    </div>
  );
}
