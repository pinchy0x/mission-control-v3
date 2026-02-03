'use client';

import { cn } from '@/lib/utils';
import type { Task, TaskStatus } from '@/lib/types';
import { STATUS_COLUMNS, STATUS_LABELS } from '@/lib/types';
import { TaskCard } from './TaskCard';

interface TaskBoardProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  selectedTaskId?: string | null;
}

export function TaskBoard({ tasks, onTaskClick, selectedTaskId }: TaskBoardProps) {
  const tasksByStatus = STATUS_COLUMNS.reduce((acc, status) => {
    acc[status] = tasks.filter(t => t.status === status);
    return acc;
  }, {} as Record<TaskStatus, Task[]>);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
      {STATUS_COLUMNS.map(status => (
        <div key={status} data-column={status} className="flex-shrink-0 w-[200px] md:w-auto md:flex-1 md:min-w-[200px]">
          {/* Column Header */}
          <div className={cn(
            'rounded-t-lg px-3 py-2 font-medium text-sm border border-b-0',
            status === 'done' 
              ? 'bg-green-500/10 border-green-500/30 text-green-400' 
              : status === 'review' 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : status === 'in_progress'
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : 'bg-zinc-800/50 border-zinc-700 text-zinc-400'
          )}>
            {STATUS_LABELS[status]} <span className="text-zinc-500">({tasksByStatus[status]?.length || 0})</span>
          </div>
          
          {/* Column Body */}
          <div className="bg-zinc-900/50 rounded-b-lg p-2 min-h-[400px] space-y-2 border border-t-0 border-zinc-700">
            {tasksByStatus[status]?.map(task => (
              <TaskCard 
                key={task.id} 
                task={task} 
                onClick={() => onTaskClick(task)}
                isSelected={task.id === selectedTaskId}
              />
            ))}
            {tasksByStatus[status]?.length === 0 && (
              <div className="text-center py-8 text-zinc-600 text-sm">
                No tasks
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
