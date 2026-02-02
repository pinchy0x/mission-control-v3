'use client';

import { useState, useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  RowSelectionState,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import type { Task, TaskStatus, Agent } from '@/lib/types';
import { STATUS_LABELS } from '@/lib/types';
import { fetchAPI } from '@/lib/api';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

interface TableViewProps {
  tasks: Task[];
  agents: Agent[];
  onTaskClick: (task: Task) => void;
  onUpdate: () => void;
}

const columnHelper = createColumnHelper<Task>();

const PRIORITY_OPTIONS = ['critical', 'high', 'normal', 'low'];
const STATUS_OPTIONS: TaskStatus[] = ['inbox', 'assigned', 'in_progress', 'review', 'done', 'blocked'];

const priorityColors: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/20',
  high: 'text-orange-400 bg-orange-500/20',
  normal: 'text-blue-400 bg-blue-500/20',
  low: 'text-zinc-400 bg-zinc-500/20',
};

const statusColors: Record<string, string> = {
  inbox: 'text-zinc-400 bg-zinc-500/20',
  assigned: 'text-purple-400 bg-purple-500/20',
  in_progress: 'text-blue-400 bg-blue-500/20',
  review: 'text-amber-400 bg-amber-500/20',
  done: 'text-green-400 bg-green-500/20',
  blocked: 'text-red-400 bg-red-500/20',
};

export function TableView({ tasks, agents, onTaskClick, onUpdate }: TableViewProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  async function updateTaskField(taskId: string, field: string, value: string) {
    try {
      await fetchAPI(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value }),
      });
      onUpdate();
    } catch (e) {
      console.error('Failed to update task:', e);
    }
  }

  const columns = useMemo(() => [
    // Selection checkbox
    columnHelper.display({
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
        />
      ),
      size: 40,
    }),

    // Title
    columnHelper.accessor('title', {
      header: 'Title',
      cell: (info) => (
        <div className="flex items-center gap-2">
          <span className="truncate max-w-[300px] font-medium text-zinc-100">
            {info.getValue()}
          </span>
          {info.row.original.has_subtasks && (
            <span className="text-xs text-zinc-500">
              ({info.row.original.subtask_count} subtasks)
            </span>
          )}
        </div>
      ),
      size: 300,
    }),

    // Status (inline editable)
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => (
        <select
          value={info.getValue()}
          onChange={(e) => {
            e.stopPropagation();
            updateTaskField(info.row.original.id, 'status', e.target.value);
          }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer',
            'bg-transparent focus:ring-1 focus:ring-blue-500',
            statusColors[info.getValue()] || 'text-zinc-400'
          )}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status} className="bg-zinc-800 text-zinc-100">
              {STATUS_LABELS[status] || status}
            </option>
          ))}
        </select>
      ),
      size: 120,
    }),

    // Priority (inline editable)
    columnHelper.accessor('priority', {
      header: 'Priority',
      cell: (info) => (
        <select
          value={info.getValue()}
          onChange={(e) => {
            e.stopPropagation();
            updateTaskField(info.row.original.id, 'priority', e.target.value);
          }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer capitalize',
            'bg-transparent focus:ring-1 focus:ring-blue-500',
            priorityColors[info.getValue()] || 'text-zinc-400'
          )}
        >
          {PRIORITY_OPTIONS.map((priority) => (
            <option key={priority} value={priority} className="bg-zinc-800 text-zinc-100 capitalize">
              {priority}
            </option>
          ))}
        </select>
      ),
      size: 100,
    }),

    // Assignees
    columnHelper.accessor('assignee_names', {
      header: 'Assignee',
      cell: (info) => {
        const names = info.getValue() || [];
        return (
          <div className="flex items-center gap-1">
            {names.length > 0 ? (
              <span className="text-sm text-zinc-300 truncate max-w-[150px]">
                {names.join(', ')}
              </span>
            ) : (
              <span className="text-sm text-zinc-600 italic">Unassigned</span>
            )}
          </div>
        );
      },
      size: 150,
    }),

    // Due Date
    columnHelper.accessor('due_date', {
      header: 'Due Date',
      cell: (info) => {
        const date = info.getValue();
        if (!date) return <span className="text-zinc-600">—</span>;
        
        const d = new Date(date);
        const now = new Date();
        const isOverdue = d < now;
        const isToday = d.toDateString() === now.toDateString();
        
        return (
          <span className={cn(
            'text-sm',
            isOverdue && 'text-red-400',
            isToday && !isOverdue && 'text-amber-400',
            !isOverdue && !isToday && 'text-zinc-400'
          )}>
            {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        );
      },
      size: 100,
    }),

    // Created At
    columnHelper.accessor('created_at', {
      header: 'Created',
      cell: (info) => {
        const date = new Date(info.getValue());
        return (
          <span className="text-sm text-zinc-500">
            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        );
      },
      size: 100,
    }),
  ], [onUpdate]);

  const table = useReactTable({
    data: tasks,
    columns,
    state: {
      sorting,
      rowSelection,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
  });

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="rounded-lg border border-zinc-700 overflow-hidden">
      {/* Bulk actions bar */}
      {selectedCount > 0 && (
        <div className="bg-blue-500/10 border-b border-blue-500/30 px-4 py-2 flex items-center gap-4">
          <span className="text-sm text-blue-400">
            {selectedCount} task{selectedCount !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setRowSelection({})}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-zinc-800/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider',
                      header.column.getCanSort() && 'cursor-pointer select-none hover:text-zinc-200'
                    )}
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="ml-1">
                          {header.column.getIsSorted() === 'asc' ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 text-zinc-600" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onTaskClick(row.original)}
                className={cn(
                  'hover:bg-zinc-800/50 cursor-pointer transition-colors',
                  row.getIsSelected() && 'bg-blue-500/10'
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-4 py-3 whitespace-nowrap"
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Empty state */}
        {tasks.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            No tasks found
          </div>
        )}
      </div>

      {/* Footer with count */}
      <div className="bg-zinc-800/30 px-4 py-2 text-xs text-zinc-500 border-t border-zinc-700">
        {tasks.length} task{tasks.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
