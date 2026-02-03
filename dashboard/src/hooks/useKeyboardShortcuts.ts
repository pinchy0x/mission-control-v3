'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface ShortcutAction {
  key: string;
  description: string;
  category: 'navigation' | 'actions' | 'modals';
  action: () => void;
  requiresPrefix?: string; // For multi-key shortcuts like 'g then h'
  disabled?: boolean;
}

export interface ShortcutHandlers {
  onNewTask: () => void;
  onFocusSearch: () => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onOpenSelected: () => void;
  onEscape: () => void;
  onGoHome: () => void;
  onGoTasks: () => void;
  onShowHelp: () => void;
  onJumpToColumn?: (column: number) => void;
}

interface UseKeyboardShortcutsOptions {
  handlers: ShortcutHandlers;
  enabled?: boolean;
}

// Check if user is focused on an input element
function isInputFocused(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  
  const tagName = activeElement.tagName.toLowerCase();
  const isEditable = activeElement.getAttribute('contenteditable') === 'true';
  
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || isEditable;
}

// Check if Mac
function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

export function useKeyboardShortcuts({ handlers, enabled = true }: UseKeyboardShortcutsOptions) {
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const prefixRef = useRef<string | null>(null);
  const prefixTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear prefix after delay
  const clearPrefix = useCallback(() => {
    if (prefixTimeoutRef.current) {
      clearTimeout(prefixTimeoutRef.current);
    }
    prefixRef.current = null;
  }, []);

  // Set prefix with timeout
  const setPrefix = useCallback((key: string) => {
    prefixRef.current = key;
    if (prefixTimeoutRef.current) {
      clearTimeout(prefixTimeoutRef.current);
    }
    prefixTimeoutRef.current = setTimeout(clearPrefix, 1000); // 1 second timeout for second key
  }, [clearPrefix]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if shortcuts disabled
    if (!enabled) return;
    
    // Don't handle if focused on input (except Escape)
    if (isInputFocused() && e.key !== 'Escape') return;
    
    // Don't handle if modifier keys are pressed (except for specific combos)
    const hasModifier = e.metaKey || e.ctrlKey || e.altKey;
    
    const key = e.key.toLowerCase();
    
    // Handle Escape - always works
    if (e.key === 'Escape') {
      e.preventDefault();
      handlers.onEscape();
      setSelectedIndex(-1);
      setShowHelpModal(false);
      clearPrefix();
      return;
    }

    // Skip if modifier is pressed for single-key shortcuts
    if (hasModifier) return;
    
    // Check for prefixed shortcuts (g then ...)
    if (prefixRef.current === 'g') {
      clearPrefix();
      if (key === 'h') {
        e.preventDefault();
        handlers.onGoHome();
        return;
      }
      if (key === 't') {
        e.preventDefault();
        handlers.onGoTasks();
        return;
      }
      // If not a valid second key, continue to check single-key shortcuts
    }
    
    // Set prefix for 'g'
    if (key === 'g') {
      setPrefix('g');
      return;
    }
    
    // Single-key shortcuts
    switch (key) {
      case 'n':
        e.preventDefault();
        handlers.onNewTask();
        break;
      case '/':
        e.preventDefault();
        handlers.onFocusSearch();
        break;
      case 'j':
        e.preventDefault();
        setSelectedIndex(prev => prev + 1);
        handlers.onNavigateDown();
        break;
      case 'k':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(-1, prev - 1));
        handlers.onNavigateUp();
        break;
      case 'enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          handlers.onOpenSelected();
        }
        break;
      case '?':
        e.preventDefault();
        setShowHelpModal(true);
        handlers.onShowHelp();
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        e.preventDefault();
        handlers.onJumpToColumn?.(parseInt(key));
        break;
    }
  }, [enabled, handlers, selectedIndex, setPrefix, clearPrefix]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (prefixTimeoutRef.current) {
        clearTimeout(prefixTimeoutRef.current);
      }
    };
  }, [handleKeyDown]);

  // Get shortcut display string
  const getShortcutDisplay = useCallback((key: string, requiresPrefix?: string) => {
    if (requiresPrefix) {
      return `${requiresPrefix.toUpperCase()} then ${key.toUpperCase()}`;
    }
    return key.toUpperCase();
  }, []);

  // All shortcuts for help modal
  const shortcuts: ShortcutAction[] = [
    { key: 'N', description: 'New task (open quick create)', category: 'actions', action: handlers.onNewTask },
    { key: '/', description: 'Focus search / Open command palette', category: 'actions', action: handlers.onFocusSearch },
    { key: 'J', description: 'Navigate down in lists', category: 'navigation', action: handlers.onNavigateDown },
    { key: 'K', description: 'Navigate up in lists', category: 'navigation', action: handlers.onNavigateUp },
    { key: 'Enter', description: 'Open selected item', category: 'navigation', action: handlers.onOpenSelected },
    { key: 'Esc', description: 'Close modals / Deselect', category: 'modals', action: handlers.onEscape },
    { key: 'H', description: 'Go Home (Board view)', category: 'navigation', action: handlers.onGoHome, requiresPrefix: 'G' },
    { key: 'T', description: 'Go Tasks (Board view)', category: 'navigation', action: handlers.onGoTasks, requiresPrefix: 'G' },
    { key: '?', description: 'Show this help', category: 'modals', action: handlers.onShowHelp },
    { key: '1', description: 'Jump to Inbox column', category: 'navigation', action: () => handlers.onJumpToColumn?.(1) },
    { key: '2', description: 'Jump to Assigned column', category: 'navigation', action: () => handlers.onJumpToColumn?.(2) },
    { key: '3', description: 'Jump to In Progress column', category: 'navigation', action: () => handlers.onJumpToColumn?.(3) },
    { key: '4', description: 'Jump to Review column', category: 'navigation', action: () => handlers.onJumpToColumn?.(4) },
    { key: '5', description: 'Jump to Done column', category: 'navigation', action: () => handlers.onJumpToColumn?.(5) },
  ];

  const groupedShortcuts = {
    navigation: shortcuts.filter(s => s.category === 'navigation'),
    actions: shortcuts.filter(s => s.category === 'actions'),
    modals: shortcuts.filter(s => s.category === 'modals'),
  };

  return {
    showHelpModal,
    setShowHelpModal,
    selectedIndex,
    setSelectedIndex,
    shortcuts,
    groupedShortcuts,
    getShortcutDisplay,
    isMac: isMac(),
    modifierKey: isMac() ? '⌘' : 'Ctrl',
  };
}
