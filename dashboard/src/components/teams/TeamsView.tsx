'use client';

import type { Agent, Team, Task } from '@/lib/types';

interface TeamsViewProps {
  teams: Team[];
  agents: Agent[];
  tasks: Task[];
  onAgentClick: (agent: Agent) => void;
}

export function TeamsView({ teams, agents, tasks, onAgentClick }: TeamsViewProps) {
  // Group agents by team
  const agentsByTeam = teams.reduce((acc, team) => {
    acc[team.id] = {
      team,
      agents: agents.filter(a => a.team_id === team.id)
    };
    return acc;
  }, {} as Record<string, { team: Team; agents: Agent[] }>);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Object.values(agentsByTeam).filter(({ agents }) => agents.length > 0).map(({ team, agents: teamAgents }) => (
        <div key={team.id} className="bg-white rounded-lg border border-stone-200 shadow-sm overflow-hidden">
          <div className="bg-stone-100 px-4 py-3 border-b border-stone-200">
            <div className="flex items-center gap-2">
              <span className="text-xl">{team.emoji}</span>
              <div>
                <div className="font-semibold text-stone-800">{team.name}</div>
                <div className="text-xs text-stone-500">{team.department_name}</div>
              </div>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {teamAgents.map(agent => {
              const agentTasks = tasks.filter(t => t.assignee_ids?.includes(agent.id));
              const activeTasks = agentTasks.filter(t => !['done', 'blocked'].includes(t.status));
              return (
                <div 
                  key={agent.id}
                  onClick={() => onAgentClick(agent)}
                  className="flex items-center gap-3 p-2 rounded hover:bg-stone-50 cursor-pointer"
                >
                  <span className="text-2xl">{agent.avatar_emoji}</span>
                  <div className="flex-1">
                    <div className="font-medium text-stone-800">{agent.name}</div>
                    <div className="text-xs text-stone-500">{agent.role}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs px-2 py-1 rounded ${
                      agent.status === 'active' ? 'bg-green-100 text-green-700' :
                      agent.status === 'blocked' ? 'bg-red-100 text-red-700' :
                      'bg-stone-100 text-stone-600'
                    }`}>
                      {agent.status}
                    </div>
                    {activeTasks.length > 0 && (
                      <div className="text-xs text-stone-500 mt-1">
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
      {/* Show empty teams */}
      {Object.values(agentsByTeam).filter(({ agents }) => agents.length === 0).length > 0 && (
        <div className="bg-stone-50 rounded-lg border border-dashed border-stone-300 p-4">
          <div className="text-sm text-stone-500 mb-2">Empty Teams</div>
          {Object.values(agentsByTeam).filter(({ agents }) => agents.length === 0).map(({ team }) => (
            <div key={team.id} className="text-xs text-stone-400 py-1">
              {team.emoji} {team.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
