# Data Table Design Patterns

**Last updated: 2026-04-04**

## Overview

Data tables are core to SaaS apps—they display lists of records (customers, invoices, issues) with filtering, sorting, and bulk actions. Modern tables use TanStack Table (React Table) for headless, performant table logic paired with shadcn/ui for accessible UI.

---

## Table Anatomy

```
┌────────────────────────────────────────────────────────────────┐
│ [Search/Filter controls]                      [Export] [+ Add] │  ← Header
├─────────────────────────────────────────────────────────────────┤
│ ☐ Name            │ Status     │ Revenue   │ Date       │ ...   │  ← Column Headers
│  ↑ sortable       │            │  ↕        │            │       │    (with sort icons)
├─────────────────────────────────────────────────────────────────┤
│ ☐ Acme Corp       │ ● Active   │ $12,500   │ 2025-01-15 │ ⋯   │  ← Row
│ ☐ TechStart Inc   │ ● Active   │ $8,200    │ 2025-01-14 │ ⋯   │
│ ☐ Global Ltd      │ ⊘ Inactive │ $0        │ 2024-11-20 │ ⋯   │
├─────────────────────────────────────────────────────────────────┤
│ ☐ 1 2 3 ... 10    Showing 1-10 of 247       Items per page: [10]│  ← Footer
└─────────────────────────────────────────────────────────────────┘
```

### Key Sections

1. **Header Controls:** Search, filters, export, bulk actions (when rows selected)
2. **Column Headers:** Labels, sort indicators (↑ ↓ ↕), optional icons
3. **Table Body:** Rows of data, expandable rows, action dropdowns
4. **Footer:** Pagination controls, item count, density selector

---

## Column Types

### Text Column

```tsx
{
  id: 'name',
  header: 'Name',
  cell: ({ row }) => <div className="font-medium">{row.getValue('name')}</div>,
}
```

### Number / Currency Column

```tsx
{
  id: 'revenue',
  header: () => <div className="text-right">Revenue</div>,
  cell: ({ row }) => (
    <div className="text-right font-mono">
      ${(row.getValue('revenue') as number).toLocaleString()}
    </div>
  ),
  accessorFn: (row) => row.revenue, // For sorting numeric values
}
```

### Date Column

```tsx
{
  id: 'created_at',
  header: 'Created',
  cell: ({ row }) => (
    <span className="text-gray-600 text-sm">
      {new Date(row.getValue('created_at')).toLocaleDateString()}
    </span>
  ),
}
```

### Status Badge Column

```tsx
{
  id: 'status',
  header: 'Status',
  cell: ({ row }) => {
    const status = row.getValue('status');
    const variants: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      pending: 'bg-yellow-100 text-yellow-800',
    };
    return (
      <Badge className={variants[status as string]}>
        {status === 'active' && <span className="w-2 h-2 bg-green-600 rounded-full inline-block mr-2" />}
        {String(status).charAt(0).toUpperCase() + String(status).slice(1)}
      </Badge>
    );
  },
}
```

### Avatar + Name Column

```tsx
{
  id: 'user',
  header: 'User',
  cell: ({ row }) => (
    <div className="flex items-center gap-3">
      <Avatar className="w-8 h-8">
        <AvatarImage src={row.original.avatar_url} />
        <AvatarFallback>{row.original.name.charAt(0)}</AvatarFallback>
      </Avatar>
      <div>
        <p className="font-medium">{row.original.name}</p>
        <p className="text-xs text-gray-500">{row.original.email}</p>
      </div>
    </div>
  ),
}
```

### Actions Dropdown Column

```tsx
{
  id: 'actions',
  header: 'Actions',
  cell: ({ row }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleEdit(row.original.id)}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDuplicate(row.original.id)}>
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleDelete(row.original.id)}
          className="text-red-600"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}
```

---

## Sorting

### Indicator Icons

```tsx
const SortHeader = ({ column, title }: { column: Column<any>; title: string }) => (
  <Button
    variant="ghost"
    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    className="gap-2"
  >
    {title}
    <ArrowUpDown className="w-4 h-4" />
    {/* Show filled arrow for active sort */}
    {column.getIsSorted() === 'asc' && <ArrowUp className="w-4 h-4 fill-current" />}
    {column.getIsSorted() === 'desc' && <ArrowDown className="w-4 h-4 fill-current" />}
  </Button>
);
```

### Multi-Sort Pattern

Hold Shift + click to add secondary sorts. Show sort order numbers on icons:

```tsx
{column.getIsSorted() && (
  <span className="text-xs bg-blue-600 text-white rounded-full w-4 h-4 flex items-center justify-center">
    {column.getIndex()}
  </span>
)}
```

---

## Filtering

### Search Bar (Global Filter)

```tsx
const [globalFilter, setGlobalFilter] = useState('');

<Input
  placeholder="Search customers..."
  value={globalFilter}
  onChange={(e) => setGlobalFilter(e.target.value)}
  className="max-w-sm"
/>
```

### Column Filters (Faceted)

```tsx
<Select value={statusFilter} onValueChange={setStatusFilter}>
  <SelectTrigger className="w-32">
    <SelectValue placeholder="Status" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All</SelectItem>
    <SelectItem value="active">Active</SelectItem>
    <SelectItem value="inactive">Inactive</SelectItem>
  </SelectContent>
</Select>

// Apply filter to table instance
table.getColumn('status')?.setFilterValue(statusFilter === 'all' ? '' : statusFilter);
```

### Date Range Filter

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">
      {dateRange.from ? dateRange.from.toDateString() : 'Pick a date'}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0">
    <Calendar
      mode="range"
      selected={dateRange}
      onSelect={(range) => {
        setDateRange(range || {});
        table.getColumn('created_at')?.setFilterValue([range?.from, range?.to]);
      }}
    />
  </PopoverContent>
</Popover>
```

### Filter Pills (Active Filters Display)

```tsx
<div className="flex gap-2 flex-wrap">
  {Object.entries(activeFilters).map(([key, value]) => (
    value && (
      <Badge key={key} variant="secondary" className="gap-2">
        {key}: {value}
        <X
          className="w-3 h-3 cursor-pointer"
          onClick={() => clearFilter(key)}
        />
      </Badge>
    )
  ))}
  {Object.values(activeFilters).some(Boolean) && (
    <Button variant="ghost" size="sm" onClick={clearAllFilters}>
      Clear all
    </Button>
  )}
</div>
```

---

## Pagination

### Page Numbers Style

```tsx
<div className="flex items-center gap-2">
  <Button
    variant="outline"
    size="sm"
    onClick={() => table.previousPage()}
    disabled={!table.getCanPreviousPage()}
  >
    Previous
  </Button>
  {[...Array(pageCount)].map((_, i) => (
    <Button
      key={i}
      variant={currentPage === i ? 'default' : 'outline'}
      size="sm"
      onClick={() => table.setPageIndex(i)}
    >
      {i + 1}
    </Button>
  ))}
  <Button
    variant="outline"
    size="sm"
    onClick={() => table.nextPage()}
    disabled={!table.getCanNextPage()}
  >
    Next
  </Button>
</div>
```

### Load More Pattern (Infinite Scroll)

For mobile or large datasets:

```tsx
const [hasMore, setHasMore] = useState(true);

<Button
  onClick={() => table.setPageIndex(table.getState().pagination.pageIndex + 1)}
  disabled={!hasMore || isLoading}
  className="w-full mt-4"
>
  {isLoading ? 'Loading...' : 'Load More'}
</Button>
```

### Items Per Page Selector

```tsx
<Select
  value={String(table.getState().pagination.pageSize)}
  onValueChange={(value) => table.setPageSize(Number(value))}
>
  <SelectTrigger className="w-20">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {[10, 20, 50, 100].map((pageSize) => (
      <SelectItem key={pageSize} value={String(pageSize)}>
        {pageSize}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Item Count Display

```tsx
<p className="text-xs text-gray-600">
  Showing {table.getState().pagination.pageIndex * pageSize + 1} to{' '}
  {Math.min((table.getState().pagination.pageIndex + 1) * pageSize, totalItems)} of{' '}
  {totalItems} results
</p>
```

---

## Row Selection

### Checkbox Column

```tsx
{
  id: 'select',
  header: ({ table }) => (
    <Checkbox
      checked={table.getIsAllPageRowsSelected()}
      indeterminate={table.getIsSomePageRowsSelected()}
      onChange={(value) => table.toggleAllPageRowsSelected(!!value)}
    />
  ),
  cell: ({ row }) => (
    <Checkbox
      checked={row.getIsSelected()}
      onChange={(value) => row.toggleSelected(!!value)}
    />
  ),
}
```

### Highlight Selected Rows

```tsx
<TableRow
  className={row.getIsSelected() ? 'bg-blue-50' : ''}
  onClick={() => row.toggleSelected()}
>
  {/* Row cells */}
</TableRow>
```

---

## Bulk Actions Toolbar

### Pattern

Appears when rows selected. Sticky or floating.

```tsx
{selectedRows.length > 0 && (
  <div className="sticky bottom-0 left-0 right-0 bg-blue-50 border-t border-blue-200 p-4 flex items-center justify-between">
    <span className="text-sm font-medium">
      {selectedRows.length} selected
    </span>
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => assignTeam(selectedRows)}>
        Assign Team
      </Button>
      <Button variant="outline" size="sm" onClick={() => changeStatus(selectedRows)}>
        Change Status
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => deleteRows(selectedRows)}
      >
        Delete
      </Button>
    </div>
  </div>
)}
```

---

## Row Actions (3-Dot Menu)

See **Actions Dropdown Column** section above.

---

## Expandable Rows

### Pattern

Click row to reveal inline details (orders, invoice line items, etc.).

```tsx
const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

<TableRow
  className="cursor-pointer hover:bg-gray-50"
  onClick={() => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(row.id)) {
      newExpanded.delete(row.id);
    } else {
      newExpanded.add(row.id);
    }
    setExpandedRows(newExpanded);
  }}
>
  <TableCell>
    <ChevronRight
      className={`w-4 h-4 transition ${expandedRows.has(row.id) ? 'rotate-90' : ''}`}
    />
  </TableCell>
  {/* Other cells */}
</TableRow>

{expandedRows.has(row.id) && (
  <TableRow className="bg-gray-50">
    <TableCell colSpan={columns.length}>
      <div className="p-4 space-y-2">
        <p><strong>Description:</strong> {row.description}</p>
        <p><strong>Tags:</strong> {row.tags.join(', ')}</p>
      </div>
    </TableCell>
  </TableRow>
)}
```

---

## Empty Table State

```tsx
<div className="flex flex-col items-center justify-center py-12">
  <FileText className="w-12 h-12 text-gray-300 mb-4" />
  <h3 className="text-lg font-medium text-gray-900">No results</h3>
  <p className="text-sm text-gray-500 mt-2">
    {hasFilters ? 'Try adjusting your filters' : 'Get started by adding your first item'}
  </p>
  {!hasFilters && <Button className="mt-4">Add Item</Button>}
</div>
```

---

## Loading State (Skeleton Rows)

```tsx
<TableBody>
  {isLoading
    ? [...Array(pageSize)].map((_, i) => (
        <TableRow key={i}>
          {columns.map((col) => (
            <TableCell key={col.id}>
              <Skeleton className="h-4 w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))
    : data.map((row) => {
        /* Regular rows */
      })}
</TableBody>
```

---

## Responsive Tables

### Horizontal Scroll (Desktop)

```tsx
<div className="overflow-x-auto">
  <Table>
    {/* Standard table */}
  </Table>
</div>
```

### Card View (Mobile)

Automatically switch to card layout on small screens:

```tsx
// Desktop: normal table
<div className="hidden md:block">
  <Table>{/* ... */}</Table>
</div>

// Mobile: card grid
<div className="md:hidden grid grid-cols-1 gap-4">
  {data.map((item) => (
    <Card key={item.id} className="p-4">
      <div className="space-y-2">
        <p className="font-medium">{item.name}</p>
        <p className="text-sm text-gray-600">{item.status}</p>
        <p className="text-sm font-mono">${item.revenue}</p>
      </div>
    </Card>
  ))}
</div>
```

### Hidden Columns (Responsive)

```tsx
<TableHead>
  {columns.map((col) => (
    <TableHeader key={col.id} className={col.hideOnMobile ? 'hidden md:table-cell' : ''}>
      {col.label}
    </TableHeader>
  ))}
</TableHead>
```

---

## Column Resizing

Use TanStack Table's `useColumnSizingInfo` hook:

```tsx
const [columnSizingInfo, setColumnSizingInfo] = useState({
  startOffset: null,
  startSize: null,
  deltaOffset: null,
});

<TableHeader
  colSpan={column.getSpan()}
  style={{ width: column.getSize() }}
  onMouseDown={column.getResizeHandler()}
  className="relative select-none touch-none cursor-col-resize"
>
  {column.columnDef.header}
  <div
    className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none bg-blue-500 opacity-0 hover:opacity-100"
  />
</TableHeader>
```

---

## Sticky Header on Scroll

```tsx
<div className="sticky top-0 z-10 bg-white border-b">
  <TableHeader>
    {/* Column headers */}
  </TableHeader>
</div>
```

---

## Row Density Options

```tsx
<Select value={density} onValueChange={setDensity}>
  <SelectTrigger className="w-32">
    <SelectValue placeholder="Density" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="compact">Compact</SelectItem>
    <SelectItem value="comfortable">Comfortable</SelectItem>
    <SelectItem value="spacious">Spacious</SelectItem>
  </SelectContent>
</Select>

// Apply density classes
const densityClasses = {
  compact: 'py-2 px-3 text-xs',
  comfortable: 'py-3 px-4 text-sm',
  spacious: 'py-4 px-6 text-base',
};

<TableCell className={densityClasses[density]}>
  {/* Content */}
</TableCell>
```

---

## Export (CSV, Excel, PDF)

### CSV Export

```tsx
const exportToCSV = () => {
  const headers = columns.map((col) => col.header);
  const rows = data.map((item) =>
    columns.map((col) => item[col.accessorKey as keyof typeof item])
  );

  const csv = [
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `export-${new Date().toISOString()}.csv`;
  a.click();
};
```

### Export Button

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm">
      <Download className="w-4 h-4 mr-2" />
      Export
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={exportToCSV}>CSV</DropdownMenuItem>
    <DropdownMenuItem onClick={exportToExcel}>Excel</DropdownMenuItem>
    <DropdownMenuItem onClick={exportToPDF}>PDF</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## TanStack Table + shadcn/ui Integration Pattern

### Basic Setup

```tsx
import { useReactTable, getCoreRowModel, getPaginationRowModel, getSortedRowModel } from '@tanstack/react-table';
import { useState } from 'react';

export const CustomerTable = ({ data }: { data: Customer[] }) => {
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<Customer>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => /* checkbox column */,
      cell: ({ row }) => /* checkbox cell */,
    },
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => /* status badge */,
    },
    {
      id: 'actions',
      cell: ({ row }) => /* actions dropdown */,
    },
  ], []);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
  });

  return (
    <div className="space-y-4">
      {/* Search */}
      <Input
        placeholder="Search..."
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
      />

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8">
                  No results
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">
          Showing {table.getState().pagination.pageIndex * 10 + 1} to{' '}
          {Math.min((table.getState().pagination.pageIndex + 1) * 10, data.length)} of{' '}
          {data.length}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};
```

---

## Responsive Design

### Breakpoint Behavior

- **sm (640px):** Table → card list, 2-3 essential columns, filter bar collapse to icon, pagination simplified
- **md (768px):** Table appears but with horizontal scroll, sticky first column, filter partially visible
- **lg (1024px):** Full table with all columns, filter bar visible, pagination with page numbers
- **xl (1280px):** Maximum column widths, full filter UX, bulk action bar visible

### Layout Transformations

**Table → Card List:**
```tsx
{/* Desktop: Standard table */}
<div className="hidden md:block overflow-x-auto">
  <Table>
    {/* All columns visible */}
  </Table>
</div>

{/* Mobile: Card list (each row becomes a card) */}
<div className="md:hidden space-y-3">
  {data.map(item => (
    <Card className="p-4">
      <div className="space-y-2">
        <p className="font-medium">{item.name}</p>
        <p className="text-sm text-gray-600">{item.status}</p>
        <p className="text-sm font-mono">${item.revenue}</p>
      </div>
      <Button size="sm" className="mt-3 w-full h-10">View</Button>
    </Card>
  ))}
</div>
```

**Column Visibility: Hide Non-Essential:**
```tsx
{/* Mobile: 2-3 key columns */}
<TableHead className="md:table-cell hidden">Secondary Column</TableHead>

{/* Desktop: All columns shown */}
<TableHead className="table-cell">Secondary Column</TableHead>
```

**Filter Bar: Collapse → Sheet:**
```tsx
{/* Desktop: Horizontal filter controls */}
<div className="hidden md:flex gap-2 mb-4">
  <Input placeholder="Search..." className="max-w-sm" />
  <Select>/* Status filter */</Select>
  <DateRangePicker />
</div>

{/* Mobile: Collapse to filter icon + Sheet */}
<div className="md:hidden flex gap-2 mb-4">
  <Input placeholder="Search..." className="flex-1" />
  <Sheet open={showFilters} onOpenChange={setShowFilters}>
    <SheetTrigger asChild>
      <Button variant="outline" size="icon" className="h-10 w-10">
        <Filter className="w-4 h-4" />
      </Button>
    </SheetTrigger>
    <SheetContent side="bottom" className="h-96">
      {/* Filter controls with full-width buttons */}
    </SheetContent>
  </Sheet>
</div>
```

**Pagination: Page Numbers → Prev/Next Only:**
```tsx
{/* Desktop: Full pagination */}
<div className="flex gap-2 items-center">
  <Button variant="outline" size="sm">Previous</Button>
  {[...Array(pageCount)].map((_, i) => (
    <Button key={i} variant={i === currentPage ? 'default' : 'outline'} size="sm">
      {i + 1}
    </Button>
  ))}
  <Button variant="outline" size="sm">Next</Button>
</div>

{/* Mobile: Just prev/next */}
<div className="flex gap-2 justify-between">
  <Button variant="outline" className="h-10">Previous</Button>
  <span className="text-sm text-gray-600 self-center">Page {currentPage}</span>
  <Button variant="outline" className="h-10">Next</Button>
</div>
```

**Bulk Actions: Floating Bar → Fixed Bottom:**
```tsx
{/* Desktop: Floating bar near top */}
<div className="sticky top-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-2">
  {selectedCount} selected | [Actions]
</div>

{/* Mobile: Fixed bottom bar */}
<div className="fixed bottom-0 left-0 right-0 bg-blue-50 border-t border-blue-200 p-4 flex gap-2">
  <span className="flex-1">{selectedCount} selected</span>
  <Button size="sm" className="h-10">Delete</Button>
</div>
```

**Sort: Column Click → Dropdown:**
```tsx
{/* Desktop: Click header to sort */}
<TableHead className="cursor-pointer" onClick={() => toggleSort('name')}>
  Name {isSorted && <ArrowUp className="w-4 h-4 inline" />}
</TableHead>

{/* Mobile: Sort dropdown */}
<Select value={sortBy} onValueChange={setSortBy}>
  <SelectTrigger className="w-full h-10 md:hidden mb-4">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="name_asc">Name (A-Z)</SelectItem>
    <SelectItem value="name_desc">Name (Z-A)</SelectItem>
    <SelectItem value="date_asc">Date (Oldest)</SelectItem>
    <SelectItem value="date_desc">Date (Newest)</SelectItem>
  </SelectContent>
</Select>
```

### Touch Targets

- **Row clickable area:** Full-width card on mobile, min 44px height
- **Checkbox:** 44x44px inclusive
- **Row expand button:** 44px icon minimum
- **Sort header:** 44px height minimum
- **Filter button:** 44x44px icon
- **Pagination buttons:** 44px height minimum
- **Action buttons:** 44px height minimum
- **Bulk action buttons:** 44px height, full-width on mobile

### Code Example

```tsx
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';

export const ResponsiveDataTable = () => {
  const isMobile = useIsMobile();
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('date_desc');

  const data = [
    { id: 1, name: 'Acme Corp', status: 'Active', revenue: 12500, date: '2025-01-15' },
    { id: 2, name: 'TechStart', status: 'Active', revenue: 8200, date: '2025-01-14' },
    { id: 3, name: 'Global Ltd', status: 'Inactive', revenue: 0, date: '2024-11-20' },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header with Search */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Customers</h1>

        {/* Search & Filter Row */}
        <div className="flex gap-2">
          <Input
            placeholder="Search..."
            className="flex-1 md:w-64 h-10 md:h-11 text-base"
          />

          {/* Desktop: Filters inline */}
          <div className="hidden md:flex gap-2">
            <Select>
              <SelectTrigger className="w-32 h-10 md:h-11">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mobile: Filter button */}
          <Sheet open={showFilters} onOpenChange={setShowFilters}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="outline" size="icon" className="h-10 w-10">
                <Filter className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-80">
              <div className="space-y-4 mt-6">
                <div>
                  <p className="text-sm font-medium mb-2">Status</p>
                  <Select>
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full h-11">Apply Filters</Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Mobile Sort Dropdown */}
      <div className="md:hidden mb-4">
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full h-10 text-base">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Newest First</SelectItem>
            <SelectItem value="date_asc">Oldest First</SelectItem>
            <SelectItem value="name_asc">Name (A-Z)</SelectItem>
            <SelectItem value="name_desc">Name (Z-A)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: Table */}
      <div className="hidden md:block overflow-x-auto border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-10">
                <Checkbox
                  checked={selectedRows.size === data.length}
                  onChange={() => {
                    if (selectedRows.size === data.length) {
                      setSelectedRows(new Set());
                    } else {
                      setSelectedRows(new Set(data.map(d => String(d.id))));
                    }
                  }}
                />
              </TableHead>
              <TableHead className="cursor-pointer">Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-10">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(item => (
              <TableRow key={item.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedRows.has(String(item.id))}
                    onChange={() => {
                      const newSet = new Set(selectedRows);
                      if (newSet.has(String(item.id))) {
                        newSet.delete(String(item.id));
                      } else {
                        newSet.add(String(item.id));
                      }
                      setSelectedRows(newSet);
                    }}
                  />
                </TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell><Badge>{item.status}</Badge></TableCell>
                <TableCell className="text-right">${item.revenue}</TableCell>
                <TableCell className="text-sm text-gray-600">{item.date}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" className="h-8 text-xs">
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: Card List */}
      <div className="md:hidden space-y-3">
        {data.map(item => (
          <Card key={item.id} className="p-4">
            <div className="flex gap-3 mb-3">
              <Checkbox
                checked={selectedRows.has(String(item.id))}
                onChange={() => {
                  const newSet = new Set(selectedRows);
                  if (newSet.has(String(item.id))) {
                    newSet.delete(String(item.id));
                  } else {
                    newSet.add(String(item.id));
                  }
                  setSelectedRows(newSet);
                }}
              />
              <div className="flex-1">
                <p className="font-semibold text-sm">{item.name}</p>
                <div className="flex justify-between mt-2 text-xs text-gray-600">
                  <span>{item.status}</span>
                  <span>${item.revenue}</span>
                </div>
              </div>
            </div>
            <Button size="sm" className="w-full h-10">View Details</Button>
          </Card>
        ))}
      </div>

      {/* Bulk Actions: Fixed on mobile */}
      {selectedRows.size > 0 && (
        <div className="fixed md:sticky bottom-0 left-0 right-0 md:bottom-auto p-4 md:p-0 bg-blue-50 md:bg-transparent border-t md:border-t-0 md:mt-4 flex gap-2 md:items-center">
          <span className="text-sm font-medium flex-1 md:flex-none">
            {selectedRows.size} selected
          </span>
          <Button variant="outline" size="sm" className="h-10 md:h-9 text-xs">
            Delete
          </Button>
          <Button size="sm" className="h-10 md:h-9 text-xs">
            Export
          </Button>
        </div>
      )}

      {/* Bottom spacer on mobile when bulk actions visible */}
      {selectedRows.size > 0 && <div className="md:hidden h-16" />}

      {/* Pagination */}
      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-xs md:text-sm text-gray-600">
          Showing 1-3 of 247 results
        </p>

        {/* Desktop: Full pagination */}
        <div className="hidden md:flex gap-2 items-center">
          <Button variant="outline" size="sm" className="h-9">Previous</Button>
          <Button variant="default" size="sm" className="h-9">1</Button>
          <Button variant="outline" size="sm" className="h-9">2</Button>
          <Button variant="outline" size="sm" className="h-9">3</Button>
          <Button variant="outline" size="sm" className="h-9">Next</Button>
        </div>

        {/* Mobile: Simple prev/next */}
        <div className="md:hidden flex gap-2">
          <Button variant="outline" className="flex-1 h-10">Previous</Button>
          <Button variant="outline" className="flex-1 h-10">Next</Button>
        </div>
      </div>
    </div>
  );
};
```

### Mobile-Specific Considerations

- **Table → Cards:** Show 2-3 key columns on mobile, full card view
- **Filter bar:** Collapse to icon + Sheet on mobile
- **Sort controls:** Click header on desktop, dropdown select on mobile
- **Pagination:** Prev/Next only on mobile, full pagination on desktop
- **Bulk actions:** Fixed bottom bar on mobile with safe-area padding
- **Column widths:** Shrink/hide on mobile, full width on desktop
- **Row height:** 56px+ on mobile for touch comfort
- **Checkbox:** 44x44px inclusive touch area

---


## Performance Tips

- **Virtualization:** Use `@tanstack/react-virtual` for 1000+ rows
- **Stable data reference:** Use `useMemo` for data array
- **Stable columns reference:** Use `useMemo` for columns definition
- **Row key:** Use stable unique ID, not index
- **Memoize cells:** Wrap cell components with `memo()` for large tables

---

## Dark Mode

Data tables need careful dark mode treatment—rows, alternating backgrounds, sort icons, and focus states must remain distinct. Headers and pagination controls are especially important for usability.

### CSS Variable Mapping

**Light Mode (default):**
```css
--background: 0 0% 100%        /* Table container background */
--card: 0 0% 100%              /* Table surface */
--border: 0 0% 89.8%           /* Row separators, borders */
--muted: 0 0% 96.1%            /* Alternating row backgrounds */
--foreground: 0 0% 3.6%        /* Text, numbers, labels */
--input: 0 0% 89.8%            /* Filter dropdown backgrounds */
--ring: 0 0% 3.6%              /* Focus indicators, sort arrows */
```

**Dark Mode:**
```css
--background: 0 0% 3.6%        /* Near black */
--card: 0 0% 8%                /* Table surface */
--border: 0 0% 20%             /* Subtle dark row separators */
--muted: 0 0% 14.9%            /* Alternating rows visible */
--foreground: 0 0% 98%         /* Off white text */
--input: 0 0% 14.9%            /* Dark filter dropdowns */
--ring: 0 0% 63.9%             /* Light focus indicators */
```

### Component-Level Overrides

#### Table Header (Sticky)

```tsx
<div className="sticky top-0 z-10 dark:bg-muted/50 dark:border-border bg-gray-50 border-b">
  <TableHeader>
    {table.getHeaderGroups().map((headerGroup) => (
      <TableRow key={headerGroup.id} className="dark:border-border hover:dark:bg-muted/70">
        {headerGroup.headers.map((header) => (
          <TableHead key={header.id} className="dark:text-foreground dark:hover:bg-muted">
            {header.isPlaceholder
              ? null
              : flexRender(header.column.columnDef.header, header.getContext())}
          </TableHead>
        ))}
      </TableRow>
    ))}
  </TableHeader>
</div>
```

#### Table Body with Alternating Rows

```tsx
<TableBody>
  {table.getRowModel().rows.length ? (
    table.getRowModel().rows.map((row, idx) => (
      <TableRow
        key={row.id}
        className={cn(
          'dark:border-border dark:hover:bg-muted/50 transition',
          idx % 2 === 0 ? 'dark:bg-transparent' : 'dark:bg-muted/30'
        )}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id} className="dark:text-foreground">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    ))
  ) : (
    <TableRow className="dark:border-border">
      <TableCell colSpan={columns.length} className="text-center py-8 dark:text-muted-foreground">
        No results found
      </TableCell>
    </TableRow>
  )}
</TableBody>
```

#### Sort Header with Icons

```tsx
const SortHeader = ({ column, title }: { column: Column<any>; title: string }) => (
  <Button
    variant="ghost"
    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    className="gap-2 dark:text-foreground dark:hover:bg-muted"
  >
    {title}
    {column.getIsSorted() === 'asc' && <ArrowUp className="w-4 h-4 dark:text-foreground" />}
    {column.getIsSorted() === 'desc' && <ArrowDown className="w-4 h-4 dark:text-foreground" />}
    {!column.getIsSorted() && <ArrowUpDown className="w-4 h-4 dark:text-muted-foreground" />}
  </Button>
);
```

#### Filter Dropdown

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button
      variant="outline"
      className="dark:bg-muted dark:border-border dark:text-foreground dark:hover:bg-muted/80"
    >
      <Filter className="w-4 h-4 mr-2" />
      Filter
    </Button>
  </PopoverTrigger>
  <PopoverContent className="dark:bg-card dark:border-border">
    <div className="space-y-2">
      <Label className="dark:text-foreground">Status</Label>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="dark:bg-input dark:border-border dark:text-foreground">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="dark:bg-card dark:border-border">
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </PopoverContent>
</Popover>
```

#### Row Selection Checkbox

```tsx
{
  id: 'select',
  header: ({ table }) => (
    <Checkbox
      checked={table.getIsAllPageRowsSelected()}
      indeterminate={table.getIsSomePageRowsSelected()}
      onChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      className="dark:border-border"
    />
  ),
  cell: ({ row }) => (
    <Checkbox
      checked={row.getIsSelected()}
      onChange={(value) => row.toggleSelected(!!value)}
      className="dark:border-border"
    />
  ),
}
```

#### Bulk Action Bar

```tsx
{selectedRows.length > 0 && (
  <div className="sticky bottom-0 left-0 right-0 dark:bg-blue-950/30 dark:border-blue-800 border-t bg-blue-50 p-4 flex items-center justify-between">
    <span className="text-sm font-medium dark:text-blue-400">
      {selectedRows.length} selected
    </span>
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="dark:bg-muted dark:border-border dark:text-foreground"
        onClick={() => assignTeam(selectedRows)}
      >
        Assign Team
      </Button>
      <Button
        variant="destructive"
        size="sm"
        className="dark:bg-destructive dark:text-destructive-foreground"
        onClick={() => deleteRows(selectedRows)}
      >
        Delete
      </Button>
    </div>
  </div>
)}
```

#### Pagination Controls

```tsx
<div className="flex items-center justify-between dark:border-border border-t pt-4">
  <span className="text-sm dark:text-muted-foreground">
    Showing {table.getState().pagination.pageIndex * 10 + 1} to{' '}
    {Math.min((table.getState().pagination.pageIndex + 1) * 10, data.length)} of{' '}
    {data.length}
  </span>
  <div className="flex gap-2">
    <Button
      variant="outline"
      size="sm"
      onClick={() => table.previousPage()}
      disabled={!table.getCanPreviousPage()}
      className="dark:bg-muted dark:border-border dark:text-foreground dark:disabled:opacity-50"
    >
      Previous
    </Button>
    {[...Array(pageCount)].map((_, i) => (
      <Button
        key={i}
        variant={currentPage === i ? 'default' : 'outline'}
        size="sm"
        onClick={() => table.setPageIndex(i)}
        className={cn(
          i === currentPage
            ? 'dark:bg-primary dark:text-primary-foreground'
            : 'dark:bg-muted dark:border-border dark:text-foreground'
        )}
      >
        {i + 1}
      </Button>
    ))}
    <Button
      variant="outline"
      size="sm"
      onClick={() => table.nextPage()}
      disabled={!table.getCanNextPage()}
      className="dark:bg-muted dark:border-border dark:text-foreground dark:disabled:opacity-50"
    >
      Next
    </Button>
  </div>
</div>
```

#### Items Per Page Selector

```tsx
<Select
  value={String(table.getState().pagination.pageSize)}
  onValueChange={(value) => table.setPageSize(Number(value))}
>
  <SelectTrigger className="w-20 dark:bg-input dark:border-border dark:text-foreground">
    <SelectValue />
  </SelectTrigger>
  <SelectContent className="dark:bg-card dark:border-border">
    {[10, 20, 50, 100].map((pageSize) => (
      <SelectItem key={pageSize} value={String(pageSize)}>
        {pageSize}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

#### Status Badge Column

```tsx
{
  id: 'status',
  header: 'Status',
  cell: ({ row }) => {
    const status = row.getValue('status') as string;
    return (
      <Badge className={cn(
        status === 'active' && 'dark:bg-green-900 dark:text-green-400 bg-green-100 text-green-800',
        status === 'inactive' && 'dark:bg-gray-700 dark:text-gray-300 bg-gray-100 text-gray-800',
        status === 'pending' && 'dark:bg-amber-900 dark:text-amber-400 bg-amber-100 text-amber-800',
      )}>
        {status}
      </Badge>
    );
  },
}
```

### Common Dark Mode Mistakes in Data Tables

1. **Alternating row colors too subtle:** Alternate rows need `dark:bg-muted/30` (14.9%) vs transparent to be visible. Without it, rows blend together.
2. **Sort icons invisible:** Arrow up/down icons need `dark:text-foreground` when active, `dark:text-muted-foreground` when inactive.
3. **Table header blends with body:** Use `dark:bg-muted/50` on sticky header to contrast with table body.
4. **Row hover state too faint:** Hover state needs `dark:hover:bg-muted/50` to be noticeable.
5. **Selected row highlight missing:** When rows are selected, use `dark:bg-blue-950/30` to distinguish selected rows.
6. **Pagination buttons hard to distinguish:** Current page button needs `dark:bg-primary` vs other buttons `dark:bg-muted`.
7. **Filter dropdowns hard to see:** Filter buttons and trigger dropdowns need `dark:bg-muted dark:border-border`.
8. **Status badges wrong dark colors:** Green badges should be `dark:bg-green-900`, not pure green. Use semantic dark colors.

### Code Example: Complete Dark Mode Data Table

```tsx
'use client';

import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
  flexRender,
  SortingState,
} from '@tanstack/react-table';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUpDown, ArrowUp, ArrowDown, MoreHorizontal, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Customer {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive' | 'pending';
  revenue: number;
  joinDate: string;
}

const mockData: Customer[] = [
  {
    id: '1',
    name: 'Acme Corp',
    email: 'contact@acme.com',
    status: 'active',
    revenue: 12500,
    joinDate: '2025-01-15',
  },
  {
    id: '2',
    name: 'TechStart Inc',
    email: 'hello@techstart.com',
    status: 'active',
    revenue: 8200,
    joinDate: '2025-01-14',
  },
  {
    id: '3',
    name: 'Global Ltd',
    email: 'support@global.com',
    status: 'inactive',
    revenue: 0,
    joinDate: '2024-11-20',
  },
];

export const DarkModeDataTable = () => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            className="dark:border-border"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onChange={(value) => row.toggleSelected(!!value)}
            className="dark:border-border"
          />
        ),
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="dark:text-foreground dark:hover:bg-muted"
          >
            Name
            {column.getIsSorted() === 'asc' && <ArrowUp className="ml-2 w-4 h-4" />}
            {column.getIsSorted() === 'desc' && <ArrowDown className="ml-2 w-4 h-4" />}
            {!column.getIsSorted() && <ArrowUpDown className="ml-2 w-4 h-4 dark:text-muted-foreground" />}
          </Button>
        ),
        cell: ({ row }) => <div className="dark:text-foreground font-medium">{row.getValue('name')}</div>,
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => <div className="dark:text-muted-foreground text-sm">{row.getValue('email')}</div>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as string;
          return (
            <Badge
              className={cn(
                status === 'active' && 'dark:bg-green-900 dark:text-green-400',
                status === 'inactive' && 'dark:bg-gray-700 dark:text-gray-300',
                status === 'pending' && 'dark:bg-amber-900 dark:text-amber-400'
              )}
            >
              {status}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'revenue',
        header: () => <div className="text-right">Revenue</div>,
        cell: ({ row }) => (
          <div className="text-right font-mono dark:text-foreground">
            ${(row.getValue('revenue') as number).toLocaleString()}
          </div>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: mockData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
    onSortingChange: setSorting,
  });

  return (
    <div className="min-h-screen dark:bg-background p-6 space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold dark:text-foreground">Customers</h1>
        <p className="dark:text-muted-foreground">Manage your customer accounts</p>
      </div>

      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="Search customers..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm dark:bg-input dark:border-border dark:text-foreground dark:placeholder:text-muted-foreground"
        />
        <Button variant="outline" className="dark:bg-muted dark:border-border dark:text-foreground">
          <Filter className="w-4 h-4 mr-2" />
          Filter
        </Button>
      </div>

      {/* Table */}
      <div className="border dark:border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="dark:bg-muted/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="dark:border-border">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="dark:text-foreground">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row, idx) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'dark:border-border dark:hover:bg-muted/50 transition',
                      idx % 2 === 0 ? '' : 'dark:bg-muted/30'
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="dark:text-foreground">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow className="dark:border-border">
                  <TableCell colSpan={columns.length} className="text-center py-8 dark:text-muted-foreground">
                    No customers found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between dark:border-t dark:border-border pt-4">
        <span className="text-sm dark:text-muted-foreground">
          Showing{' '}
          {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            mockData.length
          )}{' '}
          of {mockData.length}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="dark:bg-muted dark:border-border dark:text-foreground disabled:dark:opacity-50"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="dark:bg-muted dark:border-border dark:text-foreground disabled:dark:opacity-50"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};
```

---

## Sources

- [TanStack Table Documentation](https://tanstack.com/table/latest)
- [shadcn/ui Data Table](https://www.shadcn.io/ui/data-table)
- [Advanced Shadcn Table: Server-Side Sort, Filter, Paginate](https://next.jqueryscript.net/shadcn-ui/advanced-shadcn-table/)
- [Building Interactive Data Tables with shadcn UI and TanStack Table](https://medium.com/@enayetflweb/building-interactive-data-tables-with-shadcn-ui-and-tanstack-table-f2154c2f3b85)
- [A complete guide to TanStack Table](https://www.contentful.com/blog/tanstack-table-react-table/)
