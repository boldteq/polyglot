# Dashboard Design Patterns

**Last updated: 2026-04-04**

## Overview

Dashboards are the command centers of SaaS apps. They display KPIs, trends, and actionable insights at a glance. Modern dashboards balance information density with clarity, using visual hierarchy to guide users to what matters most.

## Dashboard Layout Architectures

### Sidebar + Main (Industry Standard)

**Best for:** Product dashboards, admin panels, multi-section apps

```
┌──────────────────────────────────────────────┐
│ Logo        [Search]        Notifications User│
├─────────────┬──────────────────────────────────┤
│ Dashboard   │ Metric Cards (4-column grid)     │
│ Projects    │ ┌──────┬──────┬──────┬──────┐   │
│ Analytics   │ │ MRR  │ Users│ Churn│ COGS │   │
│ Settings    │ │      │      │      │      │   │
│             │ └──────┴──────┴──────┴──────┘   │
│ [Collapse]  │                                  │
│             │ Charts (2-column or full-width)  │
│             │ ┌──────────────────────────────┐ │
│             │ │ Revenue Trend (Line Chart)   │ │
│             │ └──────────────────────────────┘ │
│             │ ┌──────────────┬──────────────┐  │
│             │ │ Customers by │ Top Products │  │
│             │ │ Region (Bar)  │ (Donut)      │  │
│             │ └──────────────┴──────────────┘  │
│             │                                  │
│             │ Recent Activity / Data Table    │
└─────────────┴──────────────────────────────────┘
```

**Tailwind Implementation:**
```tsx
<div className="flex h-screen">
  <Sidebar className="w-64 border-r" /> {/* Fixed or collapsible */}
  <div className="flex-1 overflow-auto">
    <DashboardHeader /> {/* Title, filters, export */}
    <main className="space-y-6 p-6">
      <MetricCards /> {/* 4-col grid → 2-col tablet → 1-col mobile */}
      <div className="grid grid-cols-2 gap-6">
        <ChartCard /> {/* Left: Primary metric */}
        <ChartCard /> {/* Right: Secondary metric */}
      </div>
      <DataTable /> {/* Full width */}
    </main>
  </div>
</div>
```

### Top Navigation + Grid (Minimal)

**Best for:** Web apps, collaborative tools, minimal dashboards

Layout: Full-width top nav → Content grid below with no sidebar.

**Advantages:** More horizontal space for content, modern/clean feel.

**Disadvantages:** Secondary navigation must fit top nav, less room for deep hierarchies.

### Command Center (Advanced)

**Best for:** Operations dashboards, monitoring, real-time data

Layout: Hero metric in center, supporting metrics around it, mini charts for context.

**Characteristics:**
- Large primary KPI in center (e.g., MRR = $50k)
- Surrounding rings/cards for related metrics (ARR, growth %, churn)
- Quick action buttons (Add Plan, View Churn, etc.)
- Real-time indicators (live dot, last updated: 2m ago)

---

## Metric / KPI Cards

### Anatomy

```
┌─────────────────────────────────────────┐
│ Label (e.g., "Monthly Recurring Revenue")│  ← gray-600, text-sm
├─────────────────────────────────────────┤
│                                         │
│ $125,430.00                  ↑ 12% ✓   │  ← Number + trend
│                                         │
│ This month: 5 new customers  📊        │  ← Sparkline or context
└─────────────────────────────────────────┘
```

### Card Variants

#### Number + Trend (Most Common)

```tsx
<Card className="p-6">
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium text-gray-600">
      Monthly Recurring Revenue
    </CardTitle>
    <TrendIcon className={trend > 0 ? "text-green-600" : "text-red-600"} />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">$125,430</div>
    <p className="text-xs text-gray-500 mt-2">
      {trend > 0 ? '+' : ''}{trend}% from last month
    </p>
  </CardContent>
</Card>
```

#### With Sparkline

Use Recharts `AreaChart` or `LineChart` embedded in card footer:

```tsx
<Card>
  <CardHeader>/* ... */</CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">$125,430</div>
  </CardContent>
  <CardFooter className="h-16">
    <AreaChart data={last30days} width={200} height={60}>
      <Area type="monotone" dataKey="value" fill="#3b82f6" stroke="none" />
    </AreaChart>
  </CardFooter>
</Card>
```

### Responsive Grid Layout

- **Desktop:** 4 columns (`grid-cols-4`)
- **Tablet:** 2 columns (`md:grid-cols-2`)
- **Mobile:** 1 column (`grid-cols-1`)

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <MetricCard />
  <MetricCard />
  {/* ... */}
</div>
```

---

## Chart Patterns

### Line Chart (Trends Over Time)

**Use for:** Revenue, users, growth metrics with temporal progression

```tsx
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={timeSeriesData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="date" />
    <YAxis />
    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
    <Legend />
    <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} />
  </LineChart>
</ResponsiveContainer>
```

### Bar Chart (Comparisons)

**Use for:** Top customers, regions, categories by metric

```tsx
<ResponsiveContainer width="100%" height={300}>
  <BarChart data={categoryData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="name" />
    <YAxis />
    <Tooltip />
    <Bar dataKey="value" fill="#3b82f6" />
  </BarChart>
</ResponsiveContainer>
```

### Donut Chart (Composition)

**Use for:** Market share, product mix, customer breakdown by plan

```tsx
<ResponsiveContainer width="100%" height={300}>
  <PieChart>
    <Pie
      data={planData}
      dataKey="count"
      nameKey="plan"
      cx="50%"
      cy="50%"
      innerRadius={60}
      outerRadius={120}
    >
      {planData.map((entry, i) => (
        <Cell key={`cell-${i}`} fill={COLORS[i]} />
      ))}
    </Pie>
    <Legend />
    <Tooltip />
  </PieChart>
</ResponsiveContainer>
```

### Area Chart (Volume / Cumulative)

**Use for:** Stacked metrics, total volume growth

```tsx
<ResponsiveContainer width="100%" height={300}>
  <AreaChart data={volumeData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="date" />
    <YAxis />
    <Tooltip />
    <Legend />
    <Area type="monotone" dataKey="free" stackId="1" fill="#e5e7eb" />
    <Area type="monotone" dataKey="pro" stackId="1" fill="#3b82f6" />
    <Area type="monotone" dataKey="enterprise" stackId="1" fill="#1e40af" />
  </AreaChart>
</ResponsiveContainer>
```

### Chart Wrapper Component

```tsx
<Card className="col-span-2">
  <CardHeader>
    <CardTitle>Revenue Trend</CardTitle>
  </CardHeader>
  <CardContent>
    <ResponsiveContainer width="100%" height={300}>
      {/* Chart component */}
    </ResponsiveContainer>
  </CardContent>
</Card>
```

---

## Activity Feeds / Recent Activity Lists

### Pattern

```
┌─────────────────────────────────────────┐
│ Recent Activity                         │
├─────────────────────────────────────────┤
│ 🔵 12:34 PM - User upgraded to Pro     │
│ 🔴  12:20 PM - Churn: acme@example.com │
│ 🟢  11:50 AM - New customer onboarded   │
│ 🔵 11:30 AM - Invoice paid ($500)       │
└─────────────────────────────────────────┘
```

### Implementation

```tsx
<Card>
  <CardHeader>
    <CardTitle>Recent Activity</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-4">
      {activities.map((activity) => (
        <div key={activity.id} className="flex gap-4 pb-4 border-b last:border-b-0">
          <div className={`w-3 h-3 rounded-full mt-2 flex-shrink-0 ${getStatusColor(activity.type)}`} />
          <div className="flex-1">
            <p className="text-sm font-medium">{activity.title}</p>
            <p className="text-xs text-gray-500">{activity.timestamp}</p>
          </div>
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

---

## Quick Action Cards

### Purpose

Provide one-click shortcuts to common tasks (Add User, Send Invoice, View Report).

### Pattern

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <Button variant="outline" className="h-24 flex flex-col gap-2">
    <PlusIcon className="w-6 h-6" />
    Add Customer
  </Button>
  <Button variant="outline" className="h-24 flex flex-col gap-2">
    <DownloadIcon className="w-6 h-6" />
    Export Report
  </Button>
  {/* ... */}
</div>
```

---

## Time Range Selectors

### Preset Buttons Pattern

```tsx
<div className="flex gap-2">
  {['Today', '7d', '30d', '90d', 'Custom'].map((period) => (
    <Button
      key={period}
      variant={selectedPeriod === period ? 'default' : 'outline'}
      size="sm"
      onClick={() => setSelectedPeriod(period)}
    >
      {period}
    </Button>
  ))}
</div>
```

### Dropdown + Date Picker

For more flexibility:

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">
      {formatDateRange(dateRange)} <ChevronDown className="ml-2 w-4 h-4" />
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    <div className="space-y-2">
      <Button variant="ghost" onClick={() => setDateRange(last7Days)}>Last 7 days</Button>
      <Button variant="ghost" onClick={() => setDateRange(last30Days)}>Last 30 days</Button>
      <Separator />
      <DateRangePicker value={dateRange} onChange={setDateRange} />
    </div>
  </PopoverContent>
</Popover>
```

---

## Empty Dashboard State (First-Time User)

### Pattern

```
┌─────────────────────────────────────────┐
│                                         │
│        ✨ Welcome to your Dashboard     │
│                                         │
│    You have no data yet. Get started:   │
│                                         │
│    [Add your first customer] [Tutorial] │
│                                         │
└─────────────────────────────────────────┘
```

### Implementation

```tsx
export const EmptyDashboard = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="text-center space-y-4">
      <div className="text-5xl">✨</div>
      <h2 className="text-2xl font-bold">Welcome to your Dashboard</h2>
      <p className="text-gray-500">You have no data yet. Get started:</p>
      <div className="flex gap-3 justify-center">
        <Button>Add Your First Customer</Button>
        <Button variant="outline">View Tutorial</Button>
      </div>
    </div>
  </div>
);
```

---

## Dashboard Header

### Components

- **Title** (e.g., "Analytics")
- **Subtitle** (optional, e.g., "Q1 2026 Performance")
- **Date Range Selector**
- **Filters** (e.g., "Product: All")
- **Export Button** (CSV, PDF)

### Layout

```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-3xl font-bold">Analytics</h1>
    <p className="text-gray-600 text-sm">Q1 2026 Performance</p>
  </div>
  <div className="flex gap-2">
    <DateRangeSelector value={range} onChange={setRange} />
    <Select value={filter} onValueChange={setFilter}>
      <SelectTrigger className="w-32">
        <SelectValue placeholder="All Products" />
      </SelectTrigger>
      {/* Options */}
    </Select>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <DownloadIcon className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportCSV()}>Export CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportPDF()}>Export PDF</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</div>
```

---

## Real-Time Data Indicators

### Live Dot + Timestamp

```tsx
<div className="flex items-center gap-2 text-xs text-gray-500">
  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
  <span>Live • Updated 2 minutes ago</span>
</div>
```

### Refresh Button

```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={refetch}
  disabled={isLoading}
>
  <RefreshCwIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
  Refresh
</Button>
```

---

## Skeleton Loading for Dashboards

### Pattern

Show skeleton cards while loading data (similar shape/size as real content).

```tsx
export const DashboardSkeleton = () => (
  <div className="space-y-6 p-6">
    {/* Metric cards skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>

    {/* Charts skeleton */}
    <div className="grid grid-cols-2 gap-6">
      {[...Array(2)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);
```

---

## Responsive Dashboard Rules

### Breakpoints

- **Desktop (lg):** 4-col metric grid, 2-col charts, sidebar visible
- **Tablet (md):** 2-col metric grid, 1-col charts, sidebar collapsible
- **Mobile (sm):** 1-col metric grid, full-width charts, sidebar as drawer

### Implementation

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* Metrics reflow automatically */}
</div>

<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {/* Charts stack on mobile */}
</div>

<div className="hidden md:block">
  <Sidebar /> {/* Hidden on mobile */}
</div>

<Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
  <SheetContent side="left" className="md:hidden">
    <Sidebar /> {/* Drawer on mobile */}
  </SheetContent>
</Sheet>
```

---

## Responsive Design

### Breakpoint Behavior

- **sm (640px):** 1-column metric grid, full-width cards, sidebar hidden (drawer on demand)
- **md (768px):** 2-column metric grid, chart stacking begins, sidebar appears but collapsible
- **lg (1024px):** 4-column metric grid, 2-column charts, sidebar always visible
- **xl (1280px):** 4-column metrics, optimized chart widths, sidebar maintains width

### Layout Transformations

**Metric Cards:**
```tsx
{/* Desktop: 4 columns */}
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* Auto-reflows: 1 → 2 → 4 */}
</div>
```

**Charts:**
```tsx
{/* Desktop: 2 columns, Mobile: 1 column */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {/* Charts stack vertically on mobile */}
</div>
```

**Sidebar Navigation:**
```tsx
{/* Desktop: Fixed sidebar visible */}
<div className="hidden md:block w-64 border-r bg-white">
  <Sidebar />
</div>

{/* Mobile: Drawer sheet instead */}
<Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
  <SheetContent side="left" className="md:hidden w-64">
    <Sidebar />
  </SheetContent>
</Sheet>
```

### Touch Targets

- **Minimum:** 44x44px for interactive elements (buttons, sort headers)
- **Metric cards:** Full-width touchable on mobile (min 56px height)
- **Chart tooltip hit zones:** Expand on touch for better precision
- **Sidebar toggle:** Large button in header on mobile

### Code Example

```tsx
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';

export const ResponsiveDashboard = () => {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-white">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 border-r border-gray-200 flex-col">
        <Sidebar />
      </aside>

      {/* Mobile Drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="md:hidden w-64 p-0">
          <Sidebar />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile Header: Hamburger + Title */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b md:border-b-0">
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <h1 className="text-xl md:text-3xl font-bold">Analytics</h1>
          <div />
        </div>

        {/* Controls: Stacked on mobile, horizontal on desktop */}
        <div className="p-4 md:p-6 space-y-3 md:space-y-0 md:flex md:items-center md:justify-between border-b">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="sm:w-auto w-full text-xs sm:text-sm h-9 sm:h-10">
              Last 7 days
            </Button>
            <Button variant="outline" className="sm:w-auto w-full text-xs sm:text-sm h-9 sm:h-10">
              All Products
            </Button>
          </div>
          <Button variant="outline" size="sm" className="w-full sm:w-auto">
            Export
          </Button>
        </div>

        {/* Content Area */}
        <div className="p-4 md:p-6 space-y-6">
          {/* KPI Cards: 1→2→4 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {metrics.map((m) => (
              <Card key={m.id} className="p-4 md:p-6 h-24 md:h-28">
                <p className="text-xs md:text-sm text-gray-600 font-medium">{m.label}</p>
                <p className="text-2xl md:text-3xl font-bold mt-2">{m.value}</p>
                <p className="text-xs md:text-sm text-green-600 mt-1">+{m.trend}%</p>
              </Card>
            ))}
          </div>

          {/* Charts: 1→2 columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-sm md:text-base">Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent className="p-4 md:p-6 h-48 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: isMobile ? 10 : 12 }} />
                    <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} />
                    <Line type="monotone" dataKey="revenue" stroke="#3b82f6" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-sm md:text-base">Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-4 md:p-6 h-48 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie dataKey="count" data={pieData} cx="50%" cy="50%"
                      outerRadius={isMobile ? 60 : 100} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Activity Feed: Full width */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-sm md:text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-6 space-y-3 max-h-48 overflow-y-auto">
              {activities.map((a) => (
                <div key={a.id} className="flex gap-2 pb-3 border-b last:border-b-0">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-blue-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm font-medium truncate">{a.title}</p>
                    <p className="text-xs text-gray-500">{a.timestamp}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};
```

### Mobile-Specific Considerations

- **Chart height reduced:** 192px (sm) → 288px (lg) for better mobile readability
- **Font sizes responsive:** text-xs on sm, text-sm on md+
- **Padding scales:** p-4 on mobile, p-6 on md+
- **Show top metrics:** Display 2-3 key metrics on sm, all 4 on md+
- **Time range:** Tab buttons on mobile (not dropdown popover)
- **Activity feed:** Max height with scroll to preserve page length
- **Bottom sheet:** Use Sheet component for filters/date pickers on mobile instead of Popover

---

## Dashboard Design Trends (2024-2025)

- **AI Integration:** Anomaly detection, smart summaries, predictive alerts
- **Dark Mode:** Essential for eye strain reduction during long sessions
- **Embedded Collaboration:** Comments, annotations, shared views
- **Microinteractions:** Smooth transitions, hover states, data state changes
- **User-Centric IA:** Role-based dashboards, customizable widgets
- **Minimalist Design:** Whitespace, clear typography, reduced visual noise

---

## Dark Mode

Dark mode is essential for dashboards—users review them during long sessions and need eye strain relief. Implement using Tailwind's `dark:` prefix and shadcn/ui CSS variables.

### CSS Variable Mapping

**Light Mode (default):**
```css
--background: 0 0% 100%        /* Card, table backgrounds */
--foreground: 0 0% 3.6%        /* Text, labels */
--card: 0 0% 100%              /* Card surfaces */
--muted: 0 0% 96.1%            /* Disabled, subtle backgrounds */
--muted-foreground: 0 0% 45.1% /* Secondary text, hints */
--border: 0 0% 89.8%           /* Borders, dividers */
--input: 0 0% 89.8%            /* Input backgrounds */
```

**Dark Mode:**
```css
--background: 0 0% 3.6%        /* Near black */
--foreground: 0 0% 98%         /* Off white text */
--card: 0 0% 8%                /* Slightly lighter card bg */
--muted: 0 0% 14.9%            /* Subtle dark background */
--muted-foreground: 0 0% 63.9% /* Secondary text lighter */
--border: 0 0% 20%             /* Subtle borders */
--input: 0 0% 14.9%            /* Dark input backgrounds */
```

### Component-Level Overrides

#### KPI Cards

```tsx
<Card className="dark:bg-card dark:border-border dark:border-opacity-50">
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium dark:text-muted-foreground">
      Monthly Recurring Revenue
    </CardTitle>
    <TrendIcon className={`${trend > 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`} />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold dark:text-foreground">$125,430</div>
    <p className="text-xs dark:text-muted-foreground mt-2">
      {trend > 0 ? '+' : ''}{trend}% from last month
    </p>
  </CardContent>
</Card>
```

#### Charts with Dark Backgrounds

For Recharts, pass dark mode colors dynamically:

```tsx
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={timeSeriesData}>
    <CartesianGrid
      strokeDasharray="3 3"
      stroke={isDark ? '#27272a' : '#e5e7eb'}
      vertical={false}
    />
    <XAxis
      dataKey="date"
      stroke={isDark ? '#71717a' : '#6b7280'}
      style={{ fontSize: '0.875rem' }}
    />
    <YAxis
      stroke={isDark ? '#71717a' : '#6b7280'}
      style={{ fontSize: '0.875rem' }}
    />
    <Tooltip
      contentStyle={{
        backgroundColor: isDark ? '#27272a' : '#ffffff',
        border: `1px solid ${isDark ? '#3f3f46' : '#e5e7eb'}`,
        borderRadius: '0.375rem',
        color: isDark ? '#fafafa' : '#000000',
      }}
    />
    <Legend wrapperStyle={{ color: isDark ? '#a1a1aa' : '#6b7280' }} />
    <Line
      type="monotone"
      dataKey="revenue"
      stroke="#3b82f6"
      strokeWidth={2}
      dot={{ fill: isDark ? '#1e293b' : '#ffffff', stroke: '#3b82f6', strokeWidth: 2 }}
    />
  </LineChart>
</ResponsiveContainer>
```

#### Activity Feed Items

```tsx
<Card className="dark:bg-card">
  <CardHeader>
    <CardTitle className="dark:text-foreground">Recent Activity</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-4">
      {activities.map((activity) => (
        <div key={activity.id} className="flex gap-4 pb-4 border-b dark:border-border last:border-b-0">
          <div className={`w-3 h-3 rounded-full mt-2 flex-shrink-0 ${getStatusColor(activity.type)}`} />
          <div className="flex-1">
            <p className="text-sm font-medium dark:text-foreground">{activity.title}</p>
            <p className="text-xs dark:text-muted-foreground">{activity.timestamp}</p>
          </div>
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

#### Time Range Selector Dropdown

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" className="dark:bg-muted dark:border-border dark:text-foreground">
      {formatDateRange(dateRange)} <ChevronDown className="ml-2 w-4 h-4" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="dark:bg-card dark:border-border">
    <div className="space-y-2">
      <Button variant="ghost" className="dark:hover:bg-muted w-full justify-start">
        Last 7 days
      </Button>
      <Button variant="ghost" className="dark:hover:bg-muted w-full justify-start">
        Last 30 days
      </Button>
      <Separator className="dark:bg-border" />
      <DateRangePicker value={dateRange} onChange={setDateRange} />
    </div>
  </PopoverContent>
</Popover>
```

#### Stat Numbers and Trend Text

```tsx
<div className="space-y-2">
  <p className="text-sm font-medium dark:text-muted-foreground">Users</p>
  <div className="text-3xl font-bold dark:text-foreground">2,543</div>
  <p className={`text-xs flex items-center gap-1 ${trend > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
    <ArrowUp className="w-3 h-3" />
    {trend > 0 ? '+' : ''}{Math.abs(trend)}% this month
  </p>
</div>
```

### Common Dark Mode Mistakes in Dashboards

1. **Chart text disappears:** Don't hardcode chart colors. Use `isDark` state to adjust CartesianGrid, XAxis, YAxis stroke colors.
2. **Chart tooltips unreadable:** Set `contentStyle` with dark background and light text. Test on both light and dark.
3. **Metric card borders too light:** Use `dark:border-border` which is 20% opacity, not pure gray.
4. **Trend indicators lose meaning:** Always pair color with icon (up/down arrow). Dark mode may shift hue; use both visual + semantic cues.
5. **Activity feed items blend:** Ensure `dark:border-border` on separators; low contrast borders become invisible.
6. **Sparkline colors unclear:** Recharts Area components need explicit `fill` colors adjusted for dark. Use a utility to pick light/dark variant.
7. **Status badge colors clash:** Use semantic dark colors (green-500 for success in dark, not green-600 which was designed for light).

### Code Example: Complete Dark Mode Dashboard Card

```tsx
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { AreaChart, Area, LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';

export const DashboardCard = ({ data }: { data: any[] }) => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Listen for dark mode toggle
    const darkModeListener = (e: MediaQueryListEvent) => setIsDark(e.matches);
    const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
    darkMode.addEventListener('change', darkModeListener);
    setIsDark(darkMode.matches);
    return () => darkMode.removeEventListener('change', darkModeListener);
  }, []);

  const chartConfig = {
    gridColor: isDark ? '#27272a' : '#e5e7eb',
    axisColor: isDark ? '#71717a' : '#6b7280',
    textColor: isDark ? '#a1a1aa' : '#6b7280',
    tooltipBg: isDark ? '#27272a' : '#ffffff',
    tooltipBorder: isDark ? '#3f3f46' : '#e5e7eb',
    tooltipText: isDark ? '#fafafa' : '#000000',
  };

  return (
    <div className="space-y-6">
      {/* KPI Card */}
      <Card className="dark:bg-card dark:border-border/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium dark:text-muted-foreground">
            Total Revenue
          </CardTitle>
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold dark:text-foreground">$125,430</div>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
            <span>↑</span> 12% from last month
          </p>
        </CardContent>
      </Card>

      {/* Chart Card */}
      <Card className="dark:bg-card dark:border-border/50">
        <CardHeader>
          <CardTitle className="dark:text-foreground">Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartConfig.gridColor} vertical={false} />
              <XAxis dataKey="date" stroke={chartConfig.axisColor} style={{ fontSize: '0.875rem' }} />
              <YAxis stroke={chartConfig.axisColor} style={{ fontSize: '0.875rem' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartConfig.tooltipBg,
                  border: `1px solid ${chartConfig.tooltipBorder}`,
                  borderRadius: '0.375rem',
                  color: chartConfig.tooltipText,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <Card className="dark:bg-card dark:border-border/50">
        <CardHeader>
          <CardTitle className="dark:text-foreground">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { id: 1, title: 'New customer onboarded', type: 'success', timestamp: '2 hours ago' },
              { id: 2, title: 'Invoice paid: $500', type: 'payment', timestamp: '4 hours ago' },
            ].map((activity) => (
              <div key={activity.id} className="flex gap-4 pb-4 border-b dark:border-border last:border-b-0">
                <div className={`w-3 h-3 rounded-full mt-2 flex-shrink-0 ${activity.type === 'success' ? 'bg-green-500' : 'bg-blue-500'}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium dark:text-foreground">{activity.title}</p>
                  <p className="text-xs dark:text-muted-foreground">{activity.timestamp}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
```

---

## Sources

- [166 SaaS Dashboard UI Design Examples in 2026](https://www.saasframe.io/categories/dashboard)
- [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Vercel Dashboard Redesign](https://vercel.com/blog/dashboard-redesign)
- [Top Dashboard Design Trends for SaaS Products in 2025](https://uitop.design/blog/design/top-dashboard-design-trends/)
- [TailwindCSS KPI Cards](https://www.material-tailwind.com/blocks/kpi-cards)
- [Tremor Dashboard Components](https://www.tremor.so/)
- [SaaSUI Dashboard Patterns](https://www.saasui.design/)
