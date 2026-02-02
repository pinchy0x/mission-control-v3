# Table + Calendar Library Research

**Research Task:** fccff1deb36043d6  
**Date:** 2026-02-03  
**Researcher:** Researcher Agent

---

## Requirements

### Table View
- Sortable columns
- Bulk select (checkbox)
- Inline editing
- Next.js 14+ compatible
- TypeScript support

### Calendar View
- Event display
- Drag-drop support
- Month/week views
- Next.js 14+ compatible
- TypeScript support

---

## Table Libraries Comparison

| Library | Version | Last Updated | Size (unpacked) | License | TypeScript |
|---------|---------|--------------|-----------------|---------|------------|
| **@tanstack/react-table** | 8.21.3 | Dec 2025 | 762 KB | MIT | ✅ Native |
| **ag-grid-react** | 35.0.1 | Jan 2026 | 663 KB | MIT (Community) | ✅ Native |
| **@mui/x-data-grid** | 8.27.0 | Feb 2026 | 5.1 MB | MIT (Community) | ✅ Native |
| **mantine-datatable** | 8.3.13 | Jan 2026 | 633 KB | MIT | ✅ Native |
| **react-data-grid** | 7.0.0-beta | Dec 2025 | 412 KB | MIT | ✅ Native |

### Analysis

#### 🏆 RECOMMENDED: @tanstack/react-table

**Pros:**
- Headless (full UI control, works with any component library)
- Tiny core, tree-shakeable
- First-class TypeScript support
- Active development (TanStack ecosystem)
- Works perfectly with Next.js App Router
- Plugin system for sorting, filtering, pagination, selection

**Cons:**
- Requires building your own UI (not a con for custom dashboards)
- Learning curve for headless paradigm

**Why best for MC v4:**
- Full control over styling (matches existing Tailwind setup)
- Only import features you need
- No vendor lock-in

#### Alternatives Considered

**ag-grid-react:** Feature-rich but community version lacks inline editing. Enterprise license expensive ($1k+).

**@mui/x-data-grid:** 5MB+ bundle, requires MUI ecosystem. Overkill for our needs.

**mantine-datatable:** Great if using Mantine. We're on Tailwind, so adds unnecessary dependency.

---

## Calendar Libraries Comparison

| Library | Version | Last Updated | Size (unpacked) | License | TypeScript |
|---------|---------|--------------|-----------------|---------|------------|
| **@fullcalendar/react** | 6.1.20 | Dec 2025 | 24 KB core + plugins | MIT | ✅ Native |
| **react-big-calendar** | 1.19.4 | Jun 2025 | 2.6 MB | MIT | ✅ Types |
| **@schedule-x/react** | 4.1.0 | Jan 2026 | 16 KB | MIT | ✅ Native |

### Full Bundle Sizes (with drag-drop)

- **FullCalendar:** ~250 KB (core + daygrid + timegrid + interaction)
- **react-big-calendar:** 2.6 MB (monolithic)
- **Schedule-X:** ~100 KB (modular)

### Analysis

#### 🏆 RECOMMENDED: @fullcalendar/react

**Pros:**
- Industry standard, battle-tested
- Full-featured: month/week/day views, drag-drop, event resize
- Plugin architecture (only load what you need)
- Excellent TypeScript support
- Works with Next.js App Router (tested)
- Active maintenance

**Cons:**
- Some advanced features require premium plugins (not needed for our use case)
- Requires multiple packages

**Why best for MC v4:**
- Complete feature set out of box
- Proven reliability
- Easy to customize styles

#### Runner-up: @schedule-x/react

If bundle size is critical priority, Schedule-X is newer and lighter. But less battle-tested.

---

## Integration Code Snippets

### TanStack Table - Basic Setup

```tsx
// components/DataTable.tsx
'use client';

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  RowSelectionState,
} from '@tanstack/react-table';
import { useState } from 'react';

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
}

export function DataTable<T>({ data, columns }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
  });

  return (
    <table className="w-full">
      <thead>
        {table.getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <th
                key={header.id}
                onClick={header.column.getToggleSortingHandler()}
                className="cursor-pointer select-none p-2 text-left"
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? null}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map(row => (
          <tr key={row.id} className="border-b">
            {row.getVisibleCells().map(cell => (
              <td key={cell.id} className="p-2">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Selection Column Helper

```tsx
// columns/selectionColumn.tsx
import { ColumnDef } from '@tanstack/react-table';

export const selectionColumn: ColumnDef<any> = {
  id: 'select',
  header: ({ table }) => (
    <input
      type="checkbox"
      checked={table.getIsAllRowsSelected()}
      onChange={table.getToggleAllRowsSelectedHandler()}
    />
  ),
  cell: ({ row }) => (
    <input
      type="checkbox"
      checked={row.getIsSelected()}
      onChange={row.getToggleSelectedHandler()}
    />
  ),
};
```

### FullCalendar - Basic Setup

```tsx
// components/EventCalendar.tsx
'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { EventInput, DateSelectArg, EventClickArg } from '@fullcalendar/core';

interface EventCalendarProps {
  events: EventInput[];
  onEventClick?: (info: EventClickArg) => void;
  onDateSelect?: (info: DateSelectArg) => void;
  onEventDrop?: (info: any) => void;
}

export function EventCalendar({
  events,
  onEventClick,
  onDateSelect,
  onEventDrop,
}: EventCalendarProps) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay',
      }}
      events={events}
      editable={true}
      selectable={true}
      selectMirror={true}
      dayMaxEvents={true}
      eventClick={onEventClick}
      select={onDateSelect}
      eventDrop={onEventDrop}
    />
  );
}
```

### Package Installation

```bash
# Table
npm install @tanstack/react-table

# Calendar
npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
```

---

## Summary

| Component | Recommended Library | Bundle Impact | Justification |
|-----------|---------------------|---------------|---------------|
| **Table** | @tanstack/react-table | ~50KB gzipped | Headless, flexible, TS-native |
| **Calendar** | @fullcalendar/react | ~80KB gzipped | Feature-complete, reliable |

**Total estimated bundle increase:** ~130KB gzipped

Both libraries are MIT licensed, actively maintained, and have excellent Next.js 14+ compatibility.

---

## Next Steps

1. Install packages in MC v4 dashboard
2. Create reusable `<DataTable>` component
3. Create reusable `<EventCalendar>` component
4. Wire up to tasks API for table view
5. Wire up to due dates for calendar view

**@Backend-Tech-Lead** - Research complete. Ready for implementation.
