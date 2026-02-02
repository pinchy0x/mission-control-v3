'use client';

import { useState, useRef, useEffect } from 'react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { fetchAPI } from '@/lib/api';
import type { Notification } from '@/lib/types';
import { Bell, AtSign, User, CheckCircle, MessageSquare, Check, X, Loader2 } from 'lucide-react';

interface NotificationsPanelProps {
  onTaskClick?: (taskId: string) => void;
}

function getNotificationIcon(type: Notification['type']) {
  switch (type) {
    case 'mention': return <AtSign className="h-4 w-4 text-blue-400" />;
    case 'assignment': return <User className="h-4 w-4 text-purple-400" />;
    case 'status_change': return <CheckCircle className="h-4 w-4 text-green-400" />;
    case 'comment': return <MessageSquare className="h-4 w-4 text-amber-400" />;
    case 'approval': return <Check className="h-4 w-4 text-emerald-400" />;
    default: return <Bell className="h-4 w-4 text-zinc-400" />;
  }
}

export function NotificationsPanel({ onTaskClick }: NotificationsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Load notifications when panel opens
  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  async function loadNotifications() {
    setIsLoading(true);
    try {
      // Using a generic agent ID for now - in production this would be the current user
      const data = await fetchAPI('/api/notifications/8f9b070f-c98c-4c?limit=20');
      setNotifications(data?.notifications || []);
    } catch (e) {
      console.error('Failed to load notifications:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function markAsRead(id: string) {
    await fetchAPI(`/api/notifications/${id}/read`, { method: 'POST' });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    await fetchAPI('/api/notifications/8f9b070f-c98c-4c/read-all', { method: 'POST' });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) markAsRead(notification.id);
    if (notification.task_id && onTaskClick) {
      onTaskClick(notification.task_id);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative p-2 rounded-lg transition-colors',
          isOpen 
            ? 'bg-zinc-700 text-white' 
            : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
        )}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className={cn(
          'absolute right-0 mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50',
          'animate-in fade-in slide-in-from-top-2 duration-200'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
            <h3 className="font-semibold text-zinc-100">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="h-8 w-8 mx-auto text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-500">No notifications</p>
              </div>
            ) : (
              notifications.slice(0, 10).map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b border-zinc-800 last:border-0 transition-colors',
                    'hover:bg-zinc-800/50',
                    !notification.read && 'bg-blue-500/5'
                  )}
                >
                  <div className="flex gap-3">
                    <div className={cn(
                      'mt-0.5 p-1.5 rounded-lg',
                      notification.read ? 'bg-zinc-800' : 'bg-zinc-700'
                    )}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn(
                          'text-sm font-medium truncate',
                          notification.read ? 'text-zinc-400' : 'text-zinc-100'
                        )}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-zinc-600 mt-1">
                        {formatRelativeTime(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
