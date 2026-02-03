'use client';

import { cn, formatDueDate, formatEstimate } from '@/lib/utils';
import type { Task } from '@/lib/types';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isSelected?: boolean;
}

export function TaskCard({ task, onClick, isSelected = false }: TaskCardProps) {
  const dueInfo = formatDueDate(task.due_date, task.status);
  const isBlocked = task.is_blocked || task.status === 'blocked';

  return (
    <div
      data-task-id={task.id}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      className={cn(
        'bg-white rounded p-3 shadow-sm border cursor-pointer hover:shadow-md transition-all',
        isBlocked && 'border-l-4 border-l-orange-500 border-stone-200 bg-orange-50/50',
        !isBlocked && dueInfo.isOverdue && 'border-l-4 border-l-red-500 border-stone-200',
        !isBlocked && !dueInfo.isOverdue && 'border-stone-200',
        isSelected && 'ring-2 ring-blue-500 ring-offset-1 shadow-lg scale-[1.02]'
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="font-medium text-stone-800 text-sm">{task.title}</div>
          {task.assignee_names?.length > 0 && (
            <div className="text-xs text-stone-500 mt-1">
              {task.assignee_names.join(', ')}
            </div>
          )}
        </div>
        {isBlocked && (
          <span className="text-orange-500 text-lg" title="Blocked by dependencies">🔒</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {isBlocked && (
          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded flex items-center gap-1">
            🔒 Blocked
          </span>
        )}
        {task.priority === 'urgent' && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
            Urgent
          </span>
        )}
        {dueInfo.text && (
          <span className={cn(
            'text-xs px-2 py-0.5 rounded',
            dueInfo.isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
          )}>
            {dueInfo.text}
          </span>
        )}
        {task.estimated_minutes && (
          <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
            ⏱ {formatEstimate(task.estimated_minutes)}
          </span>
        )}
        {task.has_blockers && !isBlocked && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded" title="Has dependencies (all complete)">
            ✓ Deps OK
          </span>
        )}
        {task.tag_names?.map((tagName, i) => (
          <span 
            key={tagName}
            className="text-xs px-2 py-0.5 rounded text-white"
            style={{ backgroundColor: task.tag_colors?.[i] || '#6b7280' }}
          >
            {tagName}
          </span>
        ))}
        {task.has_subtasks && (
          <span 
            className={cn(
              'text-xs px-2 py-0.5 rounded flex items-center gap-1',
              task.incomplete_subtask_count === 0 
                ? 'bg-green-100 text-green-700' 
                : 'bg-purple-100 text-purple-700'
            )} 
            title={`${task.subtask_count} subtask(s), ${task.incomplete_subtask_count} incomplete`}
          >
            📋 {(task.subtask_count || 0) - (task.incomplete_subtask_count || 0)}/{task.subtask_count}
          </span>
        )}
      </div>
    </div>
  );
}
