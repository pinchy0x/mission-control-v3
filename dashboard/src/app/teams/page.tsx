'use client';

import { useState, useEffect } from 'react';
import { fetchAPI } from '@/lib/api';
import type { Agent, Task, Team } from '@/lib/types';
import { TeamsView } from '@/components/teams';

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [teamsData, agentsData, tasksData] = await Promise.all([
          fetchAPI('/api/teams'),
          fetchAPI('/api/agents'),
          fetchAPI('/api/tasks'),
        ]);
        setTeams(teamsData?.teams || []);
        setAgents(agentsData?.agents || []);
        setTasks(tasksData?.tasks || []);
      } catch (e) {
        console.error('Failed to load teams data:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">Teams</h1>
          <p className="text-zinc-500 mt-1">Team organization and agent assignments</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="text-4xl mb-4">🦀</div>
            <div className="text-zinc-400">Loading teams...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Teams</h1>
        <p className="text-zinc-500 mt-1">Team organization and agent assignments</p>
      </div>
      <TeamsView
        teams={teams}
        agents={agents}
        tasks={tasks}
        onAgentClick={(agent) => {
          console.log('Agent clicked:', agent);
        }}
      />
    </div>
  );
}
