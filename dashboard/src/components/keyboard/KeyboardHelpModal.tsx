'use client';

import { Modal } from '@/components/ui';
import type { ShortcutAction } from '@/hooks/useKeyboardShortcuts';
import { Keyboard } from 'lucide-react';

interface KeyboardHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: ShortcutAction[];
  groupedShortcuts: {
    navigation: ShortcutAction[];
    actions: ShortcutAction[];
    modals: ShortcutAction[];
  };
}

function ShortcutKey({ keyStr, prefix }: { keyStr: string; prefix?: string }) {
  if (prefix) {
    return (
      <span className="flex items-center gap-1">
        <kbd className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300">
          {prefix}
        </kbd>
        <span className="text-zinc-500 text-xs">then</span>
        <kbd className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300">
          {keyStr}
        </kbd>
      </span>
    );
  }
  
  return (
    <kbd className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300">
      {keyStr}
    </kbd>
  );
}

function ShortcutGroup({ 
  title, 
  shortcuts,
  icon 
}: { 
  title: string; 
  shortcuts: ShortcutAction[];
  icon: string;
}) {
  if (shortcuts.length === 0) return null;
  
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
        <span>{icon}</span>
        {title}
      </h3>
      <div className="space-y-1">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.key + (shortcut.requiresPrefix || '')}
            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-zinc-800/50 transition-colors"
          >
            <span className="text-sm text-zinc-300">{shortcut.description}</span>
            <ShortcutKey keyStr={shortcut.key} prefix={shortcut.requiresPrefix} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function KeyboardHelpModal({ 
  isOpen, 
  onClose, 
  groupedShortcuts 
}: KeyboardHelpModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keyboard Shortcuts" size="lg">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-zinc-800">
          <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
            <Keyboard className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-zinc-400">
              Use these shortcuts to navigate Mission Control faster.
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Shortcuts are disabled when typing in an input field.
            </p>
          </div>
        </div>
        
        {/* Shortcut Groups */}
        <div className="grid gap-6">
          <ShortcutGroup 
            title="Actions" 
            shortcuts={groupedShortcuts.actions}
            icon="⚡"
          />
          
          <ShortcutGroup 
            title="Navigation" 
            shortcuts={groupedShortcuts.navigation}
            icon="🧭"
          />
          
          <ShortcutGroup 
            title="Modals & Windows" 
            shortcuts={groupedShortcuts.modals}
            icon="📦"
          />
        </div>
        
        {/* Footer hint */}
        <div className="pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 text-center">
            Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono">⌘K</kbd> or{' '}
            <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono">Ctrl+K</kbd> for the command palette
          </p>
        </div>
      </div>
    </Modal>
  );
}
