'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Agent, Task, AgentStats } from '@/lib/types';
import { fetchAPI } from '@/lib/api';
import { Badge } from '@/components/ui';
import { ChevronDown, CheckCircle, Clock, ListTodo } from 'lucide-react';

interface AgentsSidebarProps {
  agents: Agent[];
  onTaskClick: (task: Task) => void;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

// Role hierarchy for sorting (lower = higher priority)
const ROLE_PRIORITY: Record<string, number> = {
  'ceo': 0,
  'chairman': 0,
  'lead': 1,
  'executive': 1,
  'manager': 2,
  'specialist': 3,
  'intern': 4,
};

function sortAgentsByPriority(agentList: Agent[]): Agent[] {
  return [...agentList].sort((a, b) => {
    // First by level/role hierarchy
    const levelA = ROLE_PRIORITY[a.level || 'specialist'] ?? 3;
    const levelB = ROLE_PRIORITY[b.level || 'specialist'] ?? 3;
    if (levelA !== levelB) return levelA - levelB;
    
    // Then by role name containing Lead/Manager keywords
    const roleA = a.role?.toLowerCase() || '';
    const roleB = b.role?.toLowerCase() || '';
    const isLeadA = roleA.includes('lead') || roleA.includes('ceo') || roleA.includes('manager') ? 0 : 1;
    const isLeadB = roleB.includes('lead') || roleB.includes('ceo') || roleB.includes('manager') ? 0 : 1;
    if (isLeadA !== isLeadB) return isLeadA - isLeadB;
    
    // Finally alphabetically
    return a.name.localeCompare(b.name);
  });
}

export function AgentsSidebar({ agents, onTaskClick }: AgentsSidebarProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agentQueue, setAgentQueue] = useState<Task[]>([]);
  const [agentStats, setAgentStats] = useState<Record<string, AgentStats>>({});
  
  // Sort agents by role priority
  const sortedAgents = sortAgentsByPriority(agents);

  // Fetch stats for all agents
  useEffect(() => {
    async function loadAllStats() {
      const statsMap: Record<string, AgentStats> = {};
      await Promise.all(
        agents.map(async (agent) => {
          try {
            const stats = await fetchAPI(`/api/agents/${agent.id}/stats`);
            if (stats && stats.agent_id) {
              statsMap[agent.id] = stats;
            }
          } catch {
            // Stats not available for this agent
          }
        })
      );
      setAgentStats(statsMap);
    }
    if (agents.length > 0) {
      loadAllStats();
    }
  }, [agents]);

  async function loadAgentQueue(agent: Agent) {
    if (selectedAgent?.id === agent.id) {
      setSelectedAgent(null);
      setAgentQueue([]);
      return;
    }
    setSelectedAgent(agent);
    const data = await fetchAPI(`/api/agents/${agent.id}/queue`);
    setAgentQueue(data?.queue || []);
  }

  return (
    <aside className="w-full">
      <h2 className="text-base font-semibold mb-4 text-zinc-300">The Squad</h2>
      
      <div className="flex md:flex-col gap-3 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0">
        {sortedAgents.map(agent => (
          <div key={agent.id} className="flex-shrink-0 w-[160px] md:w-auto">
            <div 
              onClick={() => loadAgentQueue(agent)}
              className={cn(
                'bg-zinc-800/50 rounded-lg p-3 border cursor-pointer transition-all',
                selectedAgent?.id === agent.id 
                  ? 'border-blue-500 bg-zinc-800' 
                  : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{agent.avatar_emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-zinc-100 text-sm truncate">{agent.name}</div>
                  <div className="text-xs text-zinc-500 truncate">{agent.role}</div>
                </div>
                {selectedAgent?.id === agent.id && (
                  <ChevronDown className="h-4 w-4 text-blue-400" />
                )}
              </div>
              
              <div className="flex items-center gap-2 mt-2">
                <Badge 
                  variant={agent.level === 'lead' ? 'warning' : agent.level === 'specialist' ? 'info' : 'default'}
                  size="sm"
                >
                  {agent.level === 'lead' ? 'LEAD' : agent.level === 'specialist' ? 'SPC' : 'INT'}
                </Badge>
                <Badge 
                  variant={agent.status === 'active' ? 'success' : agent.status === 'blocked' ? 'danger' : 'default'}
                  size="sm"
                  className="flex items-center gap-1"
                >
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    agent.status === 'active' ? 'bg-green-400 animate-pulse' :
                    agent.status === 'blocked' ? 'bg-red-400' :
                    'bg-zinc-400'
                  )} />
                  {agent.status}
                </Badge>
              </div>
              
              {/* Agent Metrics */}
              {agentStats[agent.id] && (
                <div className="flex items-center gap-3 mt-3 pt-2 border-t border-zinc-700/50">
                  <div className="flex items-center gap-1 text-xs text-zinc-400" title="Tasks completed">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-zinc-200 font-medium">{agentStats[agent.id].tasks_completed.total}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-zinc-400" title="Currently assigned">
                    <ListTodo className="h-3 w-3 text-blue-400" />
                    <span className="text-zinc-200 font-medium">{agentStats[agent.id].tasks_assigned}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-zinc-400" title="Last active">
                    <Clock className="h-3 w-3 text-zinc-500" />
                    <span>{formatRelativeTime(agentStats[agent.id].last_active_at)}</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Agent Queue (expanded) */}
            {selectedAgent?.id === agent.id && (
              <div className="mt-2 ml-2 border-l-2 border-blue-500/50 pl-3 space-y-2">
                <div className="text-xs font-medium text-blue-400 mb-2">
                  Queue ({agentQueue.length})
                </div>
                {agentQueue.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">No tasks assigned</p>
                ) : (
                  agentQueue.map(task => (
                    <div 
                      key={task.id}
                      onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
                      className="bg-zinc-800/80 rounded p-2 text-xs cursor-pointer hover:bg-zinc-700 border border-zinc-700"
                    >
                      <div className="font-medium text-zinc-200 truncate">{task.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant={task.priority === 'urgent' ? 'danger' : task.priority === 'high' ? 'warning' : 'default'}
                          size="sm"
                        >
                          {task.priority}
                        </Badge>
                        <span className="text-zinc-500">{task.status}</span>
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
  );
}
