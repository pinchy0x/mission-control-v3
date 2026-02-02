'use client';

import { useState, useCallback, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { EventDragStopArg } from '@fullcalendar/interaction';
import { EventClickArg, EventDropArg, DatesSetArg } from '@fullcalendar/core';
import type { Task, TaskStatus } from '@/lib/types';
import { fetchAPI } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CalendarViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onUpdate: () => void;
}

type CalendarViewType = 'dayGridMonth' | 'timeGridWeek';

const statusColors: Record<TaskStatus, string> = {
  inbox: '#71717a',
  assigned: '#a855f7',
  in_progress: '#3b82f6',
  review: '#f59e0b',
  done: '#22c55e',
  blocked: '#ef4444',
};

const priorityBorderColors: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  normal: '#3b82f6',
  low: '#71717a',
};

export function CalendarView({ tasks, onTaskClick, onUpdate }: CalendarViewProps) {
  const [currentView, setCurrentView] = useState<CalendarViewType>('dayGridMonth');
  const [isUpdating, setIsUpdating] = useState(false);

  // Convert tasks to calendar events
  const events = useMemo(() => {
    return tasks
      .filter((task) => task.due_date) // Only show tasks with due dates
      .map((task) => ({
        id: task.id,
        title: task.title,
        start: task.due_date!,
        allDay: true,
        backgroundColor: statusColors[task.status] || '#71717a',
        borderColor: priorityBorderColors[task.priority] || '#71717a',
        borderWidth: task.priority === 'critical' ? '3px' : '2px',
        extendedProps: {
          task,
        },
      }));
  }, [tasks]);

  // Handle event click - open task detail
  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      const task = info.event.extendedProps.task as Task;
      onTaskClick(task);
    },
    [onTaskClick]
  );

  // Handle event drag-drop - update due_date
  const handleEventDrop = useCallback(
    async (info: EventDropArg) => {
      const task = info.event.extendedProps.task as Task;
      const newDate = info.event.start;

      if (!newDate) {
        info.revert();
        return;
      }

      const formattedDate = newDate.toISOString().split('T')[0];

      setIsUpdating(true);
      try {
        await fetchAPI(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ due_date: formattedDate }),
        });
        onUpdate();
      } catch (error) {
        console.error('Failed to update task due date:', error);
        info.revert();
      } finally {
        setIsUpdating(false);
      }
    },
    [onUpdate]
  );

  // Toggle between month and week views
  const toggleView = (view: CalendarViewType) => {
    setCurrentView(view);
  };

  // Count tasks without due dates
  const tasksWithoutDueDate = tasks.filter((t) => !t.due_date).length;

  return (
    <div className="flex flex-col h-full">
      {/* View Toggle Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleView('dayGridMonth')}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              currentView === 'dayGridMonth'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
            )}
          >
            Month
          </button>
          <button
            onClick={() => toggleView('timeGridWeek')}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              currentView === 'timeGridWeek'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
            )}
          >
            Week
          </button>
        </div>

        {/* Tasks without due date indicator */}
        {tasksWithoutDueDate > 0 && (
          <div className="text-sm text-zinc-500">
            {tasksWithoutDueDate} task{tasksWithoutDueDate !== 1 ? 's' : ''} without due date
          </div>
        )}

        {/* Loading indicator */}
        {isUpdating && (
          <div className="text-sm text-blue-400 animate-pulse">Updating...</div>
        )}
      </div>

      {/* Calendar */}
      <div className="flex-1 calendar-container">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={currentView}
          key={currentView} // Force re-render on view change
          events={events}
          editable={true}
          droppable={true}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          height="100%"
          eventDisplay="block"
          dayMaxEvents={3}
          moreLinkClick="popover"
          nowIndicator={true}
          weekends={true}
          eventClassNames="cursor-pointer hover:opacity-80 transition-opacity"
          dayCellClassNames="hover:bg-zinc-800/30"
        />
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="font-medium">Status:</span>
          {Object.entries(statusColors).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: color }}
              />
              <span className="capitalize">{status.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom styles for FullCalendar dark theme */}
      <style jsx global>{`
        .calendar-container {
          --fc-border-color: #3f3f46;
          --fc-button-bg-color: #27272a;
          --fc-button-border-color: #3f3f46;
          --fc-button-hover-bg-color: #3f3f46;
          --fc-button-hover-border-color: #52525b;
          --fc-button-active-bg-color: #52525b;
          --fc-button-active-border-color: #71717a;
          --fc-button-text-color: #e4e4e7;
          --fc-today-bg-color: rgba(59, 130, 246, 0.1);
          --fc-neutral-bg-color: #18181b;
          --fc-page-bg-color: transparent;
          --fc-event-bg-color: #3b82f6;
          --fc-event-border-color: #3b82f6;
          --fc-event-text-color: #fff;
          --fc-list-event-hover-bg-color: #27272a;
          --fc-highlight-color: rgba(59, 130, 246, 0.2);
          --fc-non-business-color: rgba(0, 0, 0, 0.2);
        }

        .calendar-container .fc {
          font-family: inherit;
        }

        .calendar-container .fc-theme-standard td,
        .calendar-container .fc-theme-standard th {
          border-color: var(--fc-border-color);
        }

        .calendar-container .fc-col-header-cell {
          background-color: #27272a;
          padding: 8px;
        }

        .calendar-container .fc-col-header-cell-cushion {
          color: #a1a1aa;
          font-weight: 500;
          text-transform: uppercase;
          font-size: 0.75rem;
        }

        .calendar-container .fc-daygrid-day-number {
          color: #d4d4d8;
          padding: 8px;
        }

        .calendar-container .fc-day-today .fc-daygrid-day-number {
          background-color: #3b82f6;
          color: white;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 4px;
        }

        .calendar-container .fc-event {
          padding: 2px 4px;
          font-size: 0.75rem;
          border-radius: 4px;
          margin: 1px 2px;
        }

        .calendar-container .fc-event-title {
          font-weight: 500;
        }

        .calendar-container .fc-daygrid-more-link {
          color: #3b82f6;
          font-weight: 500;
        }

        .calendar-container .fc-toolbar-title {
          color: #e4e4e7;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .calendar-container .fc-button {
          font-size: 0.875rem;
          padding: 6px 12px;
          border-radius: 6px;
        }

        .calendar-container .fc-popover {
          background-color: #27272a;
          border-color: #3f3f46;
        }

        .calendar-container .fc-popover-header {
          background-color: #18181b;
          color: #e4e4e7;
        }

        .calendar-container .fc-timegrid-slot-label {
          color: #71717a;
        }

        .calendar-container .fc-timegrid-axis {
          color: #71717a;
        }

        .calendar-container .fc-day-other .fc-daygrid-day-number {
          color: #52525b;
        }
      `}</style>
    </div>
  );
}
