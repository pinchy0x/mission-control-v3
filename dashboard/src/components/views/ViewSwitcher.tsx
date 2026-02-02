'use client';

import { cn } from '@/lib/utils';
import { LayoutGrid, Table2, Calendar } from 'lucide-react';

export type ViewType = 'board' | 'table' | 'calendar' | 'teams';

interface ViewSwitcherProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

const views = [
  { id: 'board' as const, label: 'Kanban', icon: LayoutGrid },
  { id: 'table' as const, label: 'Table', icon: Table2 },
  { id: 'calendar' as const, label: 'Calendar', icon: Calendar },
];

export function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  return (
    <div className="flex items-center bg-zinc-800/50 rounded-lg p-1 border border-zinc-700">
      {views.map((view) => {
        const Icon = view.icon;
        const isActive = currentView === view.id;
        
        return (
          <button
            key={view.id}
            onClick={() => onViewChange(view.id)}
            title={view.label}
            className={cn(
              'p-2 rounded-md transition-all flex items-center gap-1.5',
              isActive
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="text-xs hidden sm:inline">{view.label}</span>
          </button>
        );
      })}
    </div>
  );
}
