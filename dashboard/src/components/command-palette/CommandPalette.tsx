'use client';

import { useEffect, useRef } from 'react';
import { Command } from 'cmdk';
import { cn } from '@/lib/utils';
import type { CommandItem } from '@/hooks/useCommandPalette';
import { Search, X, Keyboard } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  recentIds: string[];
}

export function CommandPalette({ isOpen, onOpenChange, items, recentIds }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Group items by type
  const actionItems = items.filter((i) => i.type === 'action');
  const navigationItems = items.filter((i) => i.type === 'navigation');
  const workspaceItems = items.filter((i) => i.type === 'workspace');
  const agentItems = items.filter((i) => i.type === 'agent');
  const taskItems = items.filter((i) => i.type === 'task');
  const recentItems = items.filter((i) => recentIds.includes(i.id)).slice(0, 5);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Command Dialog */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
        <Command
          className={cn(
            'w-full max-w-xl rounded-xl border border-zinc-700/50 bg-zinc-900 shadow-2xl',
            'animate-in fade-in-0 zoom-in-95 duration-200'
          )}
          loop
        >
          {/* Search Input */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
            <Search className="h-5 w-5 text-zinc-500 shrink-0" />
            <Command.Input
              ref={inputRef}
              placeholder="Search tasks, navigate, or type a command..."
              className={cn(
                'flex-1 bg-transparent text-zinc-100 text-base placeholder:text-zinc-500',
                'outline-none border-none'
              )}
            />
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Results */}
          <Command.List className="max-h-[60vh] overflow-y-auto py-2 px-2">
            <Command.Empty className="py-8 text-center text-zinc-500">
              No results found. Try a different search.
            </Command.Empty>

            {/* Recent Items */}
            {recentItems.length > 0 && (
              <Command.Group heading="Recent" className="mb-2">
                <GroupHeading>Recent</GroupHeading>
                {recentItems.map((item) => (
                  <CommandItemRow key={item.id} item={item} />
                ))}
              </Command.Group>
            )}

            {/* Quick Actions (Create) */}
            {actionItems.length > 0 && (
              <Command.Group heading="Actions" className="mb-2">
                <GroupHeading>Actions</GroupHeading>
                {actionItems.map((item) => (
                  <CommandItemRow key={item.id} item={item} />
                ))}
              </Command.Group>
            )}

            {/* Navigation */}
            {navigationItems.length > 0 && (
              <Command.Group heading="Navigation" className="mb-2">
                <GroupHeading>Navigate</GroupHeading>
                {navigationItems.map((item) => (
                  <CommandItemRow key={item.id} item={item} />
                ))}
              </Command.Group>
            )}

            {/* Workspaces */}
            {workspaceItems.length > 0 && (
              <Command.Group heading="Workspaces" className="mb-2">
                <GroupHeading>Workspaces</GroupHeading>
                {workspaceItems.map((item) => (
                  <CommandItemRow key={item.id} item={item} />
                ))}
              </Command.Group>
            )}

            {/* Agents */}
            {agentItems.length > 0 && (
              <Command.Group heading="Agents" className="mb-2">
                <GroupHeading>Agents</GroupHeading>
                {agentItems.slice(0, 10).map((item) => (
                  <CommandItemRow key={item.id} item={item} />
                ))}
              </Command.Group>
            )}

            {/* Tasks (Search by title) */}
            {taskItems.length > 0 && (
              <Command.Group heading="Tasks" className="mb-2">
                <GroupHeading>Tasks</GroupHeading>
                {taskItems.slice(0, 15).map((item) => (
                  <CommandItemRow key={item.id} item={item} />
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer with keyboard hints */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 text-xs text-zinc-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">↵</kbd>
                select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">esc</kbd>
                close
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Keyboard className="h-3 w-3" />
              <span>⌘K</span>
            </div>
          </div>
        </Command>
      </div>
    </>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">
      {children}
    </div>
  );
}

function CommandItemRow({ item }: { item: CommandItem }) {
  return (
    <Command.Item
      value={`${item.label} ${item.keywords?.join(' ') || ''}`}
      onSelect={item.onSelect}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer',
        'text-zinc-300 hover:text-zinc-100',
        'data-[selected=true]:bg-zinc-800 data-[selected=true]:text-zinc-100',
        'transition-colors duration-150'
      )}
    >
      <span className="text-lg shrink-0 w-6 text-center">{item.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{item.label}</div>
        {item.sublabel && (
          <div className="text-xs text-zinc-500 truncate">{item.sublabel}</div>
        )}
      </div>
      {item.shortcut && (
        <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 text-xs font-mono">
          {item.shortcut}
        </kbd>
      )}
      <TypeBadge type={item.type} />
    </Command.Item>
  );
}

function TypeBadge({ type }: { type: CommandItem['type'] }) {
  const styles: Record<string, string> = {
    action: 'bg-blue-500/20 text-blue-400',
    navigation: 'bg-emerald-500/20 text-emerald-400',
    workspace: 'bg-purple-500/20 text-purple-400',
    agent: 'bg-green-500/20 text-green-400',
    task: 'bg-amber-500/20 text-amber-400',
  };

  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium capitalize', styles[type])}>
      {type}
    </span>
  );
}
