'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { fetchAPI } from '@/lib/api';
import type { Task, Agent, Doc } from '@/lib/types';
import { Search, X, CheckSquare, User, FileText, Loader2, ArrowRight } from 'lucide-react';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskClick?: (taskId: string) => void;
  tasks: Task[];
  agents: Agent[];
}

type SearchResult = {
  id: string;
  type: 'task' | 'agent' | 'doc';
  title: string;
  description?: string;
  emoji?: string;
};

const typeIcons = {
  task: CheckSquare,
  agent: User,
  doc: FileText,
};

const typeColors = {
  task: 'bg-blue-500/20 text-blue-400',
  agent: 'bg-green-500/20 text-green-400',
  doc: 'bg-purple-500/20 text-purple-400',
};

export function SearchModal({ isOpen, onClose, onTaskClick, tasks, agents }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Search logic
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const q = query.toLowerCase();
    const matchedTasks: SearchResult[] = tasks
      .filter(t => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))
      .slice(0, 5)
      .map(t => ({ id: t.id, type: 'task', title: t.title, description: t.description?.slice(0, 60) }));

    const matchedAgents: SearchResult[] = agents
      .filter(a => a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q))
      .slice(0, 3)
      .map(a => ({ id: a.id, type: 'agent', title: a.name, description: a.role, emoji: a.avatar_emoji }));

    setResults([...matchedTasks, ...matchedAgents]);
  }, [query, tasks, agents]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'task' && onTaskClick) {
      onTaskClick(result.id);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div 
        className="relative w-full max-w-xl mx-4 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-zinc-800">
          <Search className="h-5 w-5 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, agents..."
            className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none text-base"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden md:block text-xs bg-zinc-800 px-2 py-1 rounded text-zinc-500">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
            </div>
          ) : query && results.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500">No results found for &quot;{query}&quot;</p>
            </div>
          ) : query ? (
            <div className="p-2">
              {results.map((result) => {
                const Icon = typeIcons[result.type];
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleResultClick(result)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/50 transition-colors text-left group"
                  >
                    <div className={cn('p-2 rounded-lg', typeColors[result.type])}>
                      {result.emoji ? <span className="text-lg">{result.emoji}</span> : <Icon className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">{result.title}</p>
                      {result.description && (
                        <p className="text-xs text-zinc-500 truncate">{result.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-zinc-600 capitalize">{result.type}</span>
                    <ArrowRight className="h-4 w-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm text-zinc-500 mb-4">Quick Actions</p>
              <div className="space-y-2">
                <button
                  onClick={onClose}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-zinc-800/50 transition-colors text-left group"
                >
                  <span className="text-sm text-zinc-300">View all tasks</span>
                  <ArrowRight className="h-4 w-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 text-xs text-zinc-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↵</kbd>
              select
            </span>
          </div>
          <span>Mission Control</span>
        </div>
      </div>
    </div>
  );
}
