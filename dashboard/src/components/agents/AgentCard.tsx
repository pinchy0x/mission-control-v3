'use client';

import type { Agent, AgentStats } from '@/lib/types';
import { Badge } from '@/components/ui';
import { formatRelativeTime } from '@/lib/utils';
import { Clock, Briefcase, Users, CheckCircle, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentCardProps {
  agent: Agent;
  stats?: AgentStats;
  onClick?: () => void;
}

// Generate a consistent color based on agent name
function getAgentColor(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-purple-500',
    'bg-green-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-cyan-500',
    'bg-indigo-500',
    'bg-rose-500',
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

// Get initials from name
function getInitials(name: string): string {
  return name
    .split(/[\s-_]+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function AgentCard({ agent, stats, onClick }: AgentCardProps) {
  const isActive = agent.status === 'active';

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-5 rounded-xl border bg-zinc-900/50 transition-all duration-200',
        onClick && 'cursor-pointer',
        isActive
          ? 'border-green-500/30 hover:border-green-500/50'
          : 'border-zinc-800 hover:border-zinc-700'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="relative">
            {agent.avatar_emoji ? (
              <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center text-2xl">
                {agent.avatar_emoji}
              </div>
            ) : (
              <div
                className={cn(
                  'h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold',
                  getAgentColor(agent.name)
                )}
              >
                {getInitials(agent.name)}
              </div>
            )}
            {/* Status indicator */}
            <div
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-zinc-900',
                isActive ? 'bg-green-500' : agent.status === 'blocked' ? 'bg-red-500' : 'bg-zinc-600'
              )}
            />
          </div>

          {/* Name & Role */}
          <div>
            <h3 className="text-base font-semibold text-zinc-100">{agent.name}</h3>
            <p className="text-sm text-zinc-500">{agent.role}</p>
          </div>
        </div>

        {/* Status Badge */}
        <Badge 
          variant={isActive ? 'success' : agent.status === 'blocked' ? 'danger' : 'default'}
        >
          {agent.status}
        </Badge>
      </div>

      {/* Info */}
      <div className="space-y-2">
        {/* Team */}
        {agent.team_name && (
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-zinc-500" />
            <span className="text-zinc-400">{agent.team_name}</span>
          </div>
        )}

        {/* Level Badge */}
        <div className="flex items-center gap-2">
          <Badge 
            variant={agent.level === 'lead' ? 'warning' : agent.level === 'specialist' ? 'info' : 'default'}
          >
            {agent.level === 'lead' ? 'LEAD' : agent.level === 'specialist' ? 'SPECIALIST' : 'INTERN'}
          </Badge>
          {agent.department && (
            <Badge variant="purple">
              {agent.department}
            </Badge>
          )}
        </div>

        {/* Current Task */}
        {agent.current_task_id ? (
          <div className="flex items-start gap-2 text-sm">
            <Briefcase className="h-4 w-4 text-zinc-500 mt-0.5" />
            <span className="text-zinc-300">Working on task</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Briefcase className="h-4 w-4 text-zinc-600" />
            <span className="text-zinc-600 italic">No active task</span>
          </div>
        )}
      </div>

      {/* Stats Footer */}
      {stats && (
        <div className="mt-4 pt-3 border-t border-zinc-800">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-400" title="Tasks completed">
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              <span className="text-zinc-200 font-medium">{stats.tasks_completed.total}</span>
              <span>completed</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-400" title="Currently assigned">
              <ListTodo className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-zinc-200 font-medium">{stats.tasks_assigned}</span>
              <span>assigned</span>
            </div>
          </div>
          {stats.last_active_at && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-2">
              <Clock className="h-3.5 w-3.5" />
              <span>Last seen {formatRelativeTime(stats.last_active_at)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
