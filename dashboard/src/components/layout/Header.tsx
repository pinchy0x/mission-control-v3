'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { Agent, Task, Workspace } from '@/lib/types';
import type { ViewType } from '@/components/views';
import { NotificationsPanel } from '@/components/notifications';
import { SearchModal } from '@/components/search';
import { Search, RefreshCw, Plus, LayoutGrid, Users } from 'lucide-react';
import { Button } from '@/components/ui';

interface HeaderProps {
  title?: string;
  tasks: Task[];
  agents: Agent[];
  workspaces: Workspace[];
  selectedWorkspace: string;
  onWorkspaceChange: (id: string) => void;
  viewMode: ViewType;
  onViewModeChange: (mode: ViewType) => void;
  onCreateTask: () => void;
  onRefresh: () => void;
  onTaskClick?: (taskId: string) => void;
  isLoading?: boolean;
}

export function Header({
  title = 'Mission Control',
  tasks,
  agents,
  workspaces,
  selectedWorkspace,
  onWorkspaceChange,
  viewMode,
  onViewModeChange,
  onCreateTask,
  onRefresh,
  onTaskClick,
  isLoading,
}: HeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const activeAgents = agents.filter(a => a.status === 'active');
  const tasksInProgress = tasks.filter(t => t.status === 'in_progress').length;
  const tasksInQueue = tasks.filter(t => ['inbox', 'assigned'].includes(t.status)).length;

  // Update clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Cmd/Ctrl + K keyboard shortcut
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setIsSearchOpen(true);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
      <div className="px-4 md:px-6 py-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          {/* Left side - Title + Stats */}
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">{title}</h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
                <span>{tasks.length} tasks</span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  {activeAgents.length} / {agents.length} agents
                </span>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="hidden lg:flex items-center gap-4">
              <div className="text-center px-4 py-2 bg-zinc-900/50 rounded-lg border border-zinc-800">
                <div className="text-xl font-bold text-white">{tasksInQueue}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Queue</div>
              </div>
              <div className="text-center px-4 py-2 bg-zinc-900/50 rounded-lg border border-zinc-800">
                <div className="text-xl font-bold text-blue-400">{tasksInProgress}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Active</div>
              </div>
            </div>
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Workspace Selector */}
            <select
              value={selectedWorkspace}
              onChange={(e) => onWorkspaceChange(e.target.value)}
              className="bg-zinc-800 text-zinc-100 px-3 py-2 rounded-lg text-sm border border-zinc-700 focus:border-blue-500 outline-none"
            >
              <option value="all">All Workspaces</option>
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.emoji} {ws.name}</option>
              ))}
            </select>

            {/* View Mode Toggle - Tasks vs Teams */}
            <div className="hidden md:flex bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700">
              <button
                onClick={() => onViewModeChange('board')}
                className={cn(
                  'px-3 py-2 flex items-center gap-1.5 text-sm transition-colors',
                  viewMode !== 'teams' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                Board
              </button>
              <button
                onClick={() => onViewModeChange('teams')}
                className={cn(
                  'px-3 py-2 flex items-center gap-1.5 text-sm transition-colors',
                  viewMode === 'teams' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
                )}
              >
                <Users className="h-4 w-4" />
                Teams
              </button>
            </div>

            {/* Quick Search */}
            <button 
              className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span className="text-xs">Search</span>
              <kbd className="text-[10px] bg-zinc-700 px-1.5 py-0.5 rounded ml-1">⌘K</kbd>
            </button>

            {/* Refresh */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className={isLoading ? 'animate-spin' : ''}
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>

            {/* Notifications */}
            <NotificationsPanel onTaskClick={onTaskClick} />

            {/* Live Status */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/50 border border-zinc-700">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-xs text-zinc-400">Live</span>
            </div>

            {/* Clock */}
            <div className="hidden lg:block text-right">
              <div className="text-lg font-mono text-zinc-300">{currentTime.toLocaleTimeString()}</div>
              <div className="text-xs text-zinc-500">
                {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>

            {/* Create Task */}
            <Button onClick={onCreateTask} size="md">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Task</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Search Modal */}
      <SearchModal 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)}
        onTaskClick={onTaskClick}
        tasks={tasks}
        agents={agents}
      />
    </header>
  );
}
