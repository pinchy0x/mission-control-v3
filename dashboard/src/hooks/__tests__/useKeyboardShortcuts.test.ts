import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

// Mock handlers
const createMockHandlers = () => ({
  onNewTask: jest.fn(),
  onFocusSearch: jest.fn(),
  onNavigateUp: jest.fn(),
  onNavigateDown: jest.fn(),
  onOpenSelected: jest.fn(),
  onEscape: jest.fn(),
  onGoHome: jest.fn(),
  onGoTasks: jest.fn(),
  onShowHelp: jest.fn(),
});

// Helper to dispatch keyboard events
const dispatchKeyEvent = (key: string, options: Partial<KeyboardEventInit> = {}) => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  document.dispatchEvent(event);
  return event;
};

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
  });

  describe('single-key shortcuts', () => {
    it('N should trigger onNewTask', () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      act(() => {
        dispatchKeyEvent('n');
      });

      expect(handlers.onNewTask).toHaveBeenCalledTimes(1);
    });

    it('/ should trigger onFocusSearch', () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      act(() => {
        dispatchKeyEvent('/');
      });

      expect(handlers.onFocusSearch).toHaveBeenCalledTimes(1);
    });

    it('J should trigger onNavigateDown', () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      act(() => {
        dispatchKeyEvent('j');
      });

      expect(handlers.onNavigateDown).toHaveBeenCalledTimes(1);
    });

    it('K should trigger onNavigateUp', () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      act(() => {
        dispatchKeyEvent('k');
      });

      expect(handlers.onNavigateUp).toHaveBeenCalledTimes(1);
    });

    it('Escape should trigger onEscape', () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      act(() => {
        dispatchKeyEvent('Escape');
      });

      expect(handlers.onEscape).toHaveBeenCalledTimes(1);
    });

    it('? should trigger onShowHelp', () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      act(() => {
        dispatchKeyEvent('?');
      });

      expect(handlers.onShowHelp).toHaveBeenCalledTimes(1);
    });
  });

  describe('multi-key shortcuts (g then ...)', () => {
    it('G then H should trigger onGoHome', async () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      act(() => {
        dispatchKeyEvent('g');
      });

      // Small delay then press second key
      await act(async () => {
        await new Promise(r => setTimeout(r, 100));
        dispatchKeyEvent('h');
      });

      expect(handlers.onGoHome).toHaveBeenCalledTimes(1);
    });

    it('G then T should trigger onGoTasks', async () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      act(() => {
        dispatchKeyEvent('g');
      });

      await act(async () => {
        await new Promise(r => setTimeout(r, 100));
        dispatchKeyEvent('t');
      });

      expect(handlers.onGoTasks).toHaveBeenCalledTimes(1);
    });
  });

  describe('input focus behavior', () => {
    it('should NOT trigger shortcuts when input is focused (except Escape)', () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      // Create and focus an input
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      act(() => {
        dispatchKeyEvent('n');
        dispatchKeyEvent('/');
        dispatchKeyEvent('j');
      });

      expect(handlers.onNewTask).not.toHaveBeenCalled();
      expect(handlers.onFocusSearch).not.toHaveBeenCalled();
      expect(handlers.onNavigateDown).not.toHaveBeenCalled();
    });

    it('should still trigger Escape when input is focused', () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      // Create and focus an input
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      act(() => {
        dispatchKeyEvent('Escape');
      });

      expect(handlers.onEscape).toHaveBeenCalledTimes(1);
    });

    it('should NOT trigger shortcuts when textarea is focused', () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      // Create and focus a textarea
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      act(() => {
        dispatchKeyEvent('n');
      });

      expect(handlers.onNewTask).not.toHaveBeenCalled();
    });
  });

  describe('modifier keys', () => {
    it('should NOT trigger shortcuts with Cmd/Ctrl modifier', () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      act(() => {
        dispatchKeyEvent('n', { metaKey: true });
        dispatchKeyEvent('n', { ctrlKey: true });
      });

      expect(handlers.onNewTask).not.toHaveBeenCalled();
    });

    it('should NOT trigger shortcuts with Alt modifier', () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers }));

      act(() => {
        dispatchKeyEvent('n', { altKey: true });
      });

      expect(handlers.onNewTask).not.toHaveBeenCalled();
    });
  });

  describe('enabled flag', () => {
    it('should NOT trigger shortcuts when enabled=false', () => {
      const handlers = createMockHandlers();
      renderHook(() => useKeyboardShortcuts({ handlers, enabled: false }));

      act(() => {
        dispatchKeyEvent('n');
        dispatchKeyEvent('/');
        dispatchKeyEvent('Escape');
      });

      expect(handlers.onNewTask).not.toHaveBeenCalled();
      expect(handlers.onFocusSearch).not.toHaveBeenCalled();
      expect(handlers.onEscape).not.toHaveBeenCalled();
    });
  });

  describe('shortcuts list', () => {
    it('should return all shortcuts grouped by category', () => {
      const handlers = createMockHandlers();
      const { result } = renderHook(() => useKeyboardShortcuts({ handlers }));

      expect(result.current.groupedShortcuts.navigation.length).toBeGreaterThan(0);
      expect(result.current.groupedShortcuts.actions.length).toBeGreaterThan(0);
      expect(result.current.groupedShortcuts.modals.length).toBeGreaterThan(0);
    });

    it('should include required shortcuts', () => {
      const handlers = createMockHandlers();
      const { result } = renderHook(() => useKeyboardShortcuts({ handlers }));

      const allKeys = result.current.shortcuts.map(s => s.key);
      expect(allKeys).toContain('N');
      expect(allKeys).toContain('/');
      expect(allKeys).toContain('J');
      expect(allKeys).toContain('K');
      expect(allKeys).toContain('Enter');
      expect(allKeys).toContain('Esc');
      expect(allKeys).toContain('?');
    });
  });
});
