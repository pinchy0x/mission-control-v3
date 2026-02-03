'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Task, Agent, Workspace } from '@/lib/types';

export interface CommandItem {
  id: string;
  type: 'task' | 'agent' | 'workspace' | 'action' | 'navigation';
  label: string;
  sublabel?: string;
  icon?: string;
  shortcut?: string;
  onSelect: () => void;
  keywords?: string[];
}

interface UseCommandPaletteOptions {
  tasks: Task[];
  agents: Agent[];
  workspaces: Workspace[];
  onTaskClick: (task: Task) => void;
  onWorkspaceChange: (id: string) => void;
  onViewChange: (view: 'board' | 'table' | 'calendar' | 'teams') => void;
  onCreateTask: () => void;
  onOpenDocs: () => void;
}

const RECENT_ITEMS_KEY = 'mc-command-palette-recent';
const MAX_RECENT = 5;

export function useCommandPalette(options: UseCommandPaletteOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Load recent items from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(RECENT_ITEMS_KEY);
      if (saved) {
        try {
          setRecentIds(JSON.parse(saved));
        } catch {
          setRecentIds([]);
        }
      }
    }
  }, []);

  // Track item usage for recents
  const trackUsage = useCallback((id: string) => {
    setRecentIds((prev) => {
      const newRecent = [id, ...prev.filter((i) => i !== id)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(newRecent));
      return newRecent;
    });
  }, []);

  // Handle keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Build command items
  const buildItems = useCallback((): CommandItem[] => {
    const items: CommandItem[] = [];

    // ═══════════════════════════════════════════════════════
    // ACTIONS - Create/Do things
    // ═══════════════════════════════════════════════════════
    items.push({
      id: 'action-new-task',
      type: 'action',
      label: 'New Task',
      sublabel: 'Create a new task',
      icon: '➕',
      shortcut: '⌘N',
      keywords: ['create', 'add', 'new', 'task'],
      onSelect: () => {
        trackUsage('action-new-task');
        options.onCreateTask();
        setIsOpen(false);
      },
    });

    // ═══════════════════════════════════════════════════════
    // NAVIGATION - Views
    // ═══════════════════════════════════════════════════════
    const navigationItems: Array<{ 
      id: string; 
      view?: 'board' | 'table' | 'calendar' | 'teams'; 
      label: string; 
      icon: string;
      action?: () => void;
    }> = [
      { id: 'nav-board', view: 'board', label: 'Board', icon: '📋' },
      { id: 'nav-table', view: 'table', label: 'Table', icon: '📊' },
      { id: 'nav-calendar', view: 'calendar', label: 'Calendar', icon: '📅' },
      { id: 'nav-teams', view: 'teams', label: 'Teams', icon: '👥' },
      { id: 'nav-docs', label: 'Docs', icon: '📄', action: options.onOpenDocs },
    ];

    navigationItems.forEach(({ id, view, label, icon, action }) => {
      items.push({
        id,
        type: 'navigation',
        label: `Go to ${label}`,
        sublabel: view ? `Switch to ${label} view` : `Open ${label}`,
        icon,
        keywords: ['go', 'navigate', 'view', 'switch', label.toLowerCase()],
        onSelect: () => {
          trackUsage(id);
          if (action) {
            action();
          } else if (view) {
            options.onViewChange(view);
          }
          setIsOpen(false);
        },
      });
    });

    // ═══════════════════════════════════════════════════════
    // WORKSPACES
    // ═══════════════════════════════════════════════════════
    items.push({
      id: 'workspace-all',
      type: 'workspace',
      label: 'All Workspaces',
      sublabel: 'Show all tasks',
      icon: '🌐',
      keywords: ['workspace', 'all', 'filter'],
      onSelect: () => {
        trackUsage('workspace-all');
        options.onWorkspaceChange('all');
        setIsOpen(false);
      },
    });

    options.workspaces.forEach((ws) => {
      items.push({
        id: `workspace-${ws.id}`,
        type: 'workspace',
        label: ws.name,
        sublabel: `Switch to ${ws.name} workspace`,
        icon: ws.emoji || '📁',
        keywords: ['workspace', ws.name.toLowerCase(), 'filter'],
        onSelect: () => {
          trackUsage(`workspace-${ws.id}`);
          options.onWorkspaceChange(ws.id);
          setIsOpen(false);
        },
      });
    });

    // ═══════════════════════════════════════════════════════
    // AGENTS
    // ═══════════════════════════════════════════════════════
    options.agents.forEach((agent) => {
      items.push({
        id: `agent-${agent.id}`,
        type: 'agent',
        label: agent.name,
        sublabel: `${agent.role || 'Agent'} • ${agent.status || 'unknown'}`,
        icon: agent.avatar_emoji || '🤖',
        keywords: ['agent', agent.name.toLowerCase(), agent.role?.toLowerCase() || ''],
        onSelect: () => {
          trackUsage(`agent-${agent.id}`);
          // Could navigate to agent or filter by agent
          setIsOpen(false);
        },
      });
    });

    // ═══════════════════════════════════════════════════════
    // TASKS - Search by title
    // ═══════════════════════════════════════════════════════
    options.tasks.forEach((task) => {
      items.push({
        id: `task-${task.id}`,
        type: 'task',
        label: task.title,
        sublabel: `${task.status} • ${task.priority || 'normal'}`,
        icon: task.status === 'done' ? '✅' : task.status === 'blocked' ? '🚫' : '📝',
        keywords: ['task', task.title.toLowerCase(), task.status, task.priority || ''],
        onSelect: () => {
          trackUsage(`task-${task.id}`);
          options.onTaskClick(task);
          setIsOpen(false);
        },
      });
    });

    return items;
  }, [options, trackUsage]);

  // Sort items with recents first
  const getSortedItems = useCallback(
    (items: CommandItem[]): CommandItem[] => {
      const recentItems: CommandItem[] = [];
      const otherItems: CommandItem[] = [];

      items.forEach((item) => {
        if (recentIds.includes(item.id)) {
          recentItems.push(item);
        } else {
          otherItems.push(item);
        }
      });

      // Sort recents by their position in recentIds
      recentItems.sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));

      return [...recentItems, ...otherItems];
    },
    [recentIds]
  );

  return {
    isOpen,
    setIsOpen,
    items: getSortedItems(buildItems()),
    recentIds,
  };
}
