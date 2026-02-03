'use client';

import { useState, useEffect } from 'react';
import { fetchAPI } from '@/lib/api';
import type { Agent, AgentStats } from '@/lib/types';
import { AgentCard } from './AgentCard';
import { Button } from '@/components/ui';
import { Users, RefreshCw, AlertOctagon } from 'lucide-react';

interface AgentGridProps {
  onAgentClick?: (agent: Agent) => void;
}

export function AgentGrid({ onAgentClick }: AgentGridProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<Record<string, AgentStats>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  async function loadData() {
    try {
      setIsError(false);
      const [agentsData, statsData] = await Promise.all([
        fetchAPI('/api/agents'),
        fetchAPI('/api/agents/stats'),
      ]);
      setAgents(agentsData?.agents || []);
      
      // Convert stats array to lookup object
      const statsMap: Record<string, AgentStats> = {};
      if (statsData?.stats) {
        for (const stat of statsData.stats) {
          statsMap[stat.agent_id] = stat;
        }
      }
      setStats(statsMap);
    } catch (e) {
      console.error('Failed to load agents:', e);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertOctagon className="h-12 w-12 text-red-400 mb-4" />
        <h3 className="text-lg font-semibold text-zinc-100 mb-2">
          Failed to load agents
        </h3>
        <p className="text-zinc-500 mb-4">
          There was an error connecting to the API.
        </p>
        <Button onClick={loadData} variant="secondary">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 animate-pulse">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-zinc-800" />
              <div className="flex-1">
                <div className="h-4 w-24 bg-zinc-800 rounded mb-2" />
                <div className="h-3 w-16 bg-zinc-800 rounded" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-zinc-800 rounded" />
              <div className="h-3 w-3/4 bg-zinc-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Users className="h-12 w-12 text-zinc-600 mb-4" />
        <h3 className="text-lg font-semibold text-zinc-100 mb-2">
          No agents registered
        </h3>
        <p className="text-zinc-500">
          Agents will appear here once they connect to Mission Control.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {agents.map((agent) => (
        <AgentCard 
          key={agent.id} 
          agent={agent} 
          stats={stats[agent.id]}
          onClick={onAgentClick ? () => onAgentClick(agent) : undefined}
        />
      ))}
    </div>
  );
}
