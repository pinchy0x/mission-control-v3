'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Agent, Team, Task, AgentStats } from '@/lib/types';
import { fetchAPI } from '@/lib/api';
import { Badge } from '@/components/ui';
import { CheckCircle, Clock, ListTodo } from 'lucide-react';

interface TeamsViewProps {
  teams: Team[];
  agents: Agent[];
  tasks: Task[];
  onAgentClick: (agent: Agent) => void;
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

export function TeamsView({ teams, agents, tasks, onAgentClick }: TeamsViewProps) {
  const [agentStats, setAgentStats] = useState<Record<string, AgentStats>>({});

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

  // Team display priority (lower = shows first)
  const TEAM_PRIORITY: Record<string, number> = {
    'leadership': 1,      // Executive team - ALWAYS first
    'devops-team': 2,     // Products Team (ID is devops-team)
    'backend-team': 3,    // Core engineering
    'security-team': 4,   // Infrastructure protection
    'qa-team': 5,         // Quality assurance
    'growth-team': 6,     // Marketing & expansion
    'content-squad': 7,   // Content & SEO
  };

  // Role hierarchy for sorting agents (lower = higher priority)
  const ROLE_PRIORITY: Record<string, number> = {
    'chairman': 0,    // The human boss (Saurabh)
    'ceo': 1,         // Company leader (Pinchy)
    'lead': 2,        // Team leads
    'executive': 2,
    'manager': 3,
    'senior': 4,
    'specialist': 5,
    'intern': 6,
  };

  // Sort teams by priority
  const sortTeams = (teamList: Team[]) => {
    return [...teamList].sort((a, b) => {
      const priorityA = TEAM_PRIORITY[a.id] ?? 99;
      const priorityB = TEAM_PRIORITY[b.id] ?? 99;
      return priorityA - priorityB;
    });
  };

  // Sort agents by role hierarchy
  const sortByRole = (agentList: Agent[]) => {
    return [...agentList].sort((a, b) => {
      // First check role name for Chairman/CEO
      const roleA = a.role?.toLowerCase() || '';
      const roleB = b.role?.toLowerCase() || '';
      const isChairmanA = roleA.includes('chairman') ? 0 : 1;
      const isChairmanB = roleB.includes('chairman') ? 0 : 1;
      if (isChairmanA !== isChairmanB) return isChairmanA - isChairmanB;
      
      const isCeoA = roleA.includes('ceo') ? 0 : 1;
      const isCeoB = roleB.includes('ceo') ? 0 : 1;
      if (isCeoA !== isCeoB) return isCeoA - isCeoB;

      // Then by level hierarchy
      const levelA = ROLE_PRIORITY[a.level || 'specialist'] ?? 5;
      const levelB = ROLE_PRIORITY[b.level || 'specialist'] ?? 5;
      if (levelA !== levelB) return levelA - levelB;
      
      // Then by role name containing Lead/Manager keywords
      const isLeadA = roleA.includes('lead') || roleA.includes('manager') ? 0 : 1;
      const isLeadB = roleB.includes('lead') || roleB.includes('manager') ? 0 : 1;
      if (isLeadA !== isLeadB) return isLeadA - isLeadB;
      
      // Finally alphabetically
      return a.name.localeCompare(b.name);
    });
  };

  // Group agents by team
  const agentsByTeam = teams.reduce((acc, team) => {
    acc[team.id] = {
      team,
      agents: sortByRole(agents.filter(a => a.team_id === team.id))
    };
    return acc;
  }, {} as Record<string, { team: Team; agents: Agent[] }>);

  const teamsWithAgentsList = Object.values(agentsByTeam).filter(({ agents }) => agents.length > 0);
  // Sort teams by priority (Leadership first, then Products, Backend, etc.)
  const teamsWithAgents = teamsWithAgentsList.sort((a, b) => {
    const priorityA = TEAM_PRIORITY[a.team.id] ?? 99;
    const priorityB = TEAM_PRIORITY[b.team.id] ?? 99;
    return priorityA - priorityB;
  });
  const emptyTeams = Object.values(agentsByTeam).filter(({ agents }) => agents.length === 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {teamsWithAgents.map(({ team, agents: teamAgents }) => (
        <div key={team.id} className="bg-zinc-800/30 rounded-lg border border-zinc-700 overflow-hidden">
          {/* Team Header */}
          <div className="bg-zinc-800/50 px-4 py-3 border-b border-zinc-700">
            <div className="flex items-center gap-2">
              <span className="text-xl">{team.emoji}</span>
              <div>
                <div className="font-semibold text-zinc-100">{team.name}</div>
                <div className="text-xs text-zinc-500">{team.department_name}</div>
              </div>
            </div>
          </div>
          
          {/* Team Members */}
          <div className="p-4 space-y-3">
            {teamAgents.map(agent => {
              const agentTasks = tasks.filter(t => t.assignee_ids?.includes(agent.id));
              const activeTasks = agentTasks.filter(t => !['done', 'blocked'].includes(t.status));
              
              const stats = agentStats[agent.id];
              
              return (
                <div 
                  key={agent.id}
                  onClick={() => onAgentClick(agent)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-700/50 cursor-pointer transition-colors"
                >
                  <span className="text-2xl">{agent.avatar_emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-100">{agent.name}</span>
                      {stats && (
                        <Badge variant="success" size="sm" className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          {stats.tasks_completed.total}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">{agent.role}</div>
                    {stats && (
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-xs text-zinc-400" title="Currently assigned">
                          <ListTodo className="h-3 w-3 text-blue-400" />
                          {stats.tasks_assigned}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-zinc-500" title="Last active">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(stats.last_active_at)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <Badge 
                      variant={agent.status === 'active' ? 'success' : agent.status === 'blocked' ? 'danger' : 'default'}
                      size="sm"
                    >
                      {agent.status}
                    </Badge>
                    {activeTasks.length > 0 && (
                      <div className="text-xs text-zinc-500 mt-1">
                        {activeTasks.length} active
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      
      {/* Empty Teams */}
      {emptyTeams.length > 0 && (
        <div className="bg-zinc-800/20 rounded-lg border border-dashed border-zinc-700 p-4">
          <div className="text-sm text-zinc-500 mb-2">Empty Teams</div>
          {emptyTeams.map(({ team }) => (
            <div key={team.id} className="text-xs text-zinc-600 py-1">
              {team.emoji} {team.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
