'use client';

import { useState } from 'react';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { Activity } from '@/lib/types';

interface ActivityFeedProps {
  activities: Activity[];
}

type FilterType = 'all' | 'tasks' | 'comments' | 'status';

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredActivities = activities.filter(activity => {
    if (filter === 'all') return true;
    if (filter === 'tasks') return activity.type?.includes('task');
    if (filter === 'comments') return activity.type === 'message_sent';
    if (filter === 'status') return activity.type?.includes('status');
    return true;
  });

  return (
    <aside className="w-full">
      <h2 className="text-base font-semibold mb-4 text-zinc-300">Activity</h2>
      
      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(['all', 'tasks', 'comments', 'status'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
            )}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Activity List */}
      <div className="bg-zinc-800/30 rounded-lg border border-zinc-700 p-4 max-h-[550px] overflow-y-auto">
        {filteredActivities.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-8">No activity yet</p>
        ) : (
          <div className="space-y-4">
            {filteredActivities.map(activity => (
              <div key={activity.id} className="border-b border-zinc-700/50 pb-3 last:border-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">{activity.avatar_emoji || '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200">{activity.message}</p>
                    {activity.task_title && (
                      <p className="text-xs text-zinc-500 mt-1 truncate">
                        on &quot;{activity.task_title}&quot;
                      </p>
                    )}
                    <p className="text-xs text-zinc-600 mt-1">
                      {formatRelativeTime(activity.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
