# Navigation Design Patterns

**Last updated: 2026-04-04**

## Overview

Navigation is the skeleton of a SaaS app. It must be intuitive, discoverable, and fast. Modern patterns include sidebar navigation, command palettes (Cmd+K), top navigation bars, and breadcrumbs. This guide covers all major navigation patterns for production SaaS.

---

## Sidebar Navigation

### Collapsible Sidebar (Industry Standard)

```
┌──────────────────────────────────────────────┐
│ [≡] Logo                [Search] [Notif] [👤]│
├──────────┬───────────────────────────────────┤
│ Dashboard│ Main content area                  │
│ ├─ Home  │                                    │
│ ├─ Stats │                                    │
│ Projects │                                    │
│ ├─ All   │ [collapse sidebar to icons only]  │
│ ├─ Active│                                    │
│ Invoices │                                    │
│ Settings │                                    │
│ Help     │                                    │
│          │                                    │
│ [Pin]    │                                    │
│ [Sign out]                                   │
└──────────┴───────────────────────────────────┘
```

### Expanded State

```tsx
<div className="w-64 border-r bg-white shadow-sm">
  {/* Header */}
  <div className="p-4 border-b flex items-center justify-between">
    <h1 className="text-xl font-bold">Logo</h1>
    <Button variant="ghost" size="icon" onClick={toggleCollapse}>
      <ChevronLeft className="w-4 h-4" />
    </Button>
  </div>

  {/* Navigation */}
  <nav className="p-4 space-y-2">
    {navItems.map((item) => (
      <div key={item.id}>
        {/* Section header */}
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
          {item.label}
        </h3>

        {/* Section items */}
        <div className="space-y-1">
          {item.children.map((child) => (
            <Link
              key={child.id}
              href={child.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${
                isActive(child.href)
                  ? 'bg-blue-100 text-blue-900 font-semibold'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {child.icon && <child.icon className="w-4 h-4 flex-shrink-0" />}
              <span>{child.label}</span>
            </Link>
          ))}
        </div>
      </div>
    ))}
  </nav>

  {/* Footer */}
  <div className="p-4 border-t space-y-2 absolute bottom-0 left-0 right-0 w-64">
    <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
      <HelpCircle className="w-4 h-4" />
      Help
    </Button>
    <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={signOut}>
      <LogOut className="w-4 h-4" />
      Sign Out
    </Button>
  </div>
</div>
```

### Collapsed State (Icons Only)

```tsx
<div className="w-20 border-r bg-white shadow-sm">
  <div className="p-4 border-b flex justify-center">
    <LogoIcon className="w-6 h-6" />
  </div>

  <nav className="p-2 space-y-2">
    {navItems.map((item) =>
      item.children.map((child) => (
        <Tooltip key={child.id} delayDuration={200}>
          <TooltipTrigger asChild>
            <Link
              href={child.href}
              className={`flex items-center justify-center p-3 rounded-md transition ${
                isActive(child.href)
                  ? 'bg-blue-100 text-blue-900'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <child.icon className="w-5 h-5" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{child.label}</TooltipContent>
        </Tooltip>
      ))
    )}
  </nav>
</div>
```

### Sidebar with Pinned Sections

```tsx
const [pinnedSections, setPinnedSections] = useState<Set<string>>(new Set());

{navItems.map((item) => (
  <div key={item.id} className="relative">
    {/* Section with pin button */}
    <div className="flex items-center justify-between px-3 py-1 group">
      <h3 className="text-xs font-semibold text-gray-600 uppercase">{item.label}</h3>
      <Button
        variant="ghost"
        size="icon"
        className="opacity-0 group-hover:opacity-100 w-5 h-5"
        onClick={() => togglePin(item.id)}
      >
        <Pin className={`w-3 h-3 ${pinnedSections.has(item.id) ? 'fill-current' : ''}`} />
      </Button>
    </div>
    {/* Section items */}
  </div>
))}
```

---

## Top Navigation Bar

### Header Layout

```
┌─────────────────────────────────────────────────────┐
│ Logo    Dashboard  Projects  Analytics  [Search]    │
│                                      [🔔] [Settings]│
└─────────────────────────────────────────────────────┘
```

### Implementation

```tsx
export const AppHeader = () => (
  <header className="h-16 border-b bg-white sticky top-0 z-50">
    <div className="flex items-center justify-between px-6 h-full">
      {/* Left: Logo + Nav Links */}
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <Logo className="w-6 h-6" />
          <span className="text-lg font-bold hidden sm:inline">App Name</span>
        </div>

        {/* Desktop nav links */}
        <nav className="hidden md:flex gap-6">
          {['Dashboard', 'Projects', 'Analytics'].map((item) => (
            <Link
              key={item}
              href={`/${item.toLowerCase()}`}
              className="text-sm text-gray-700 hover:text-gray-900 font-medium"
            >
              {item}
            </Link>
          ))}
        </nav>
      </div>

      {/* Right: Search + Notifications + User */}
      <div className="flex items-center gap-4">
        {/* Search (desktop) */}
        <div className="hidden sm:block">
          <SearchBar />
        </div>

        {/* Notifications */}
        <NotificationBell />

        {/* User menu */}
        <UserMenu />

        {/* Mobile menu toggle */}
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="w-5 h-5" />
        </Button>
      </div>
    </div>
  </header>
);
```

---

## Command Palette / cmdk (Cmd+K)

### Pattern

Fast, keyboard-first navigation. Shows recent items, global search, actions.

```
┌─────────────────────────────────────────┐
│ [⌘K] Search anything...                 │
├─────────────────────────────────────────┤
│ Recent                                  │
│ 📄 Customers                            │
│ 📊 Q1 Revenue Report                    │
│                                         │
│ Navigate                                │
│ → Dashboard                             │
│ → Settings                              │
│                                         │
│ Actions                                 │
│ ✎ Create new project                   │
│ 🔐 Change password                      │
└─────────────────────────────────────────┘
```

### Implementation

```tsx
import { Command } from 'cmdk';

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);

  // Keyboard shortcut: Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground">
          {/* Search input */}
          <Command.Input
            placeholder="Search or type command..."
            className="border-none focus:ring-0"
          />

          <Command.List className="max-h-96">
            <Command.Empty>No results found.</Command.Empty>

            {/* Recent items */}
            <Command.Group heading="Recent">
              {recentItems.map((item) => (
                <Command.Item
                  key={item.id}
                  onSelect={() => navigate(item.href)}
                  className="cursor-pointer"
                >
                  {item.icon && <item.icon className="w-4 h-4 mr-2" />}
                  <span>{item.label}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Navigation */}
            <Command.Group heading="Navigate">
              {navItems.map((item) => (
                <Command.Item
                  key={item.id}
                  onSelect={() => navigate(item.href)}
                  className="cursor-pointer"
                >
                  <item.icon className="w-4 h-4 mr-2" />
                  <span>{item.label}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Actions */}
            <Command.Group heading="Actions">
              {actions.map((action) => (
                <Command.Item
                  key={action.id}
                  onSelect={() => action.handler()}
                  className="cursor-pointer"
                >
                  <action.icon className="w-4 h-4 mr-2" />
                  <span>{action.label}</span>
                  <kbd className="ml-auto text-xs text-gray-500">
                    {action.shortcut}
                  </kbd>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
```

### Trigger Button

```tsx
<Button
  variant="outline"
  className="w-full sm:w-48 justify-between text-sm text-muted-foreground"
  onClick={() => setOpen(true)}
>
  <span>Search...</span>
  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
    <span className="text-xs">⌘</span>K
  </kbd>
</Button>
```

---

## Breadcrumbs

### Pattern

Show current location in hierarchy. Skip first (home) level if obvious.

```
Dashboard > Projects > Acme Corp > Settings
   ↓          ↓             ↓          ↓
clickable   clickable     clickable   current (bold)
```

### Implementation

```tsx
export const Breadcrumbs = ({ items }: { items: BreadcrumbItem[] }) => (
  <nav className="flex items-center gap-2 text-sm">
    {items.map((item, i) => (
      <div key={item.id} className="flex items-center gap-2">
        {i > 0 && <ChevronRight className="w-4 h-4 text-gray-400" />}
        {item.href ? (
          <Link
            href={item.href}
            className="text-blue-600 hover:underline"
          >
            {item.label}
          </Link>
        ) : (
          <span className="font-semibold text-gray-900">{item.label}</span>
        )}
      </div>
    ))}
  </nav>
);

// Usage
<Breadcrumbs
  items={[
    { id: '1', label: 'Projects', href: '/projects' },
    { id: '2', label: 'Acme Corp', href: '/projects/acme' },
    { id: '3', label: 'Settings' },
  ]}
/>
```

### Truncation Pattern (For Deep Nesting)

```tsx
{items.length > 4 && (
  <>
    <Link href={items[0].href} className="text-blue-600">
      {items[0].label}
    </Link>
    <ChevronRight className="w-4 h-4 text-gray-400" />
    <DropdownMenu>
      <DropdownMenuTrigger>•••</DropdownMenuTrigger>
      <DropdownMenuContent>
        {items.slice(1, -2).map((item) => (
          <DropdownMenuItem key={item.id} asChild>
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
    {/* Last 2 items */}
  </>
)}
```

---

## Tab Navigation (Horizontal Tabs)

### Underline Style (Modern)

```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="border-b w-full justify-start bg-transparent rounded-none p-0">
    {tabs.map((tab) => (
      <TabsTrigger
        key={tab.id}
        value={tab.id}
        className="border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none"
      >
        {tab.label}
      </TabsTrigger>
    ))}
  </TabsList>

  {tabs.map((tab) => (
    <TabsContent key={tab.id} value={tab.id}>
      {tab.content}
    </TabsContent>
  ))}
</Tabs>
```

### Contained Style (Older, Still Valid)

```tsx
<div className="bg-gray-100 p-1 rounded-lg inline-flex gap-1">
  {tabs.map((tab) => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      className={`px-4 py-2 rounded text-sm font-medium transition ${
        activeTab === tab.id
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {tab.label}
    </button>
  ))}
</div>
```

---

## Mobile Navigation

### Hamburger Menu + Sheet Drawer

```tsx
export const MobileNav = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger button in header */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="w-5 h-5" />
      </Button>

      {/* Drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64">
          {/* Navigation items */}
          <nav className="space-y-2 mt-8">
            {navItems.map((item) => (
              <div key={item.id}>
                <h3 className="text-xs font-semibold text-gray-600 uppercase mb-2">
                  {item.label}
                </h3>
                {item.children.map((child) => (
                  <Link
                    key={child.id}
                    href={child.href}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-gray-100"
                    onClick={() => setOpen(false)}
                  >
                    {child.icon && <child.icon className="w-4 h-4" />}
                    {child.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
};
```

### Bottom Tab Bar (Mobile-First Apps)

```tsx
<div className="fixed bottom-0 left-0 right-0 border-t bg-white sm:hidden">
  <div className="flex justify-around">
    {tabItems.map((item) => (
      <Link
        key={item.id}
        href={item.href}
        className={`flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition ${
          isActive(item.href)
            ? 'text-blue-600 border-t-2 border-blue-600'
            : 'text-gray-600'
        }`}
      >
        <item.icon className="w-6 h-6 mb-1" />
        {item.label}
      </Link>
    ))}
  </div>
</div>
```

---

## User Menu (Avatar Dropdown)

### Pattern

Avatar in top-right corner. Click to reveal dropdown with profile, settings, sign out.

```tsx
export const UserMenu = () => {
  const user = useAuth();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar className="w-8 h-8">
            <AvatarImage src={user.avatar_url} alt={user.name} />
            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* User info */}
        <div className="px-2 py-1.5 text-sm">
          <p className="font-semibold">{user.name}</p>
          <p className="text-xs text-gray-500">{user.email}</p>
        </div>
        <DropdownMenuSeparator />

        {/* Menu items */}
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <User className="w-4 h-4 mr-2" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/billing">
            <CreditCard className="w-4 h-4 mr-2" />
            Billing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/help">
            <HelpCircle className="w-4 h-4 mr-2" />
            Help & Support
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="text-red-600">
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
```

---

## Notification Center

### Bell Icon + Badge

```tsx
export const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-600 rounded-full" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                Mark all as read
              </Button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {notifications.length ? (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-3 rounded-lg text-sm cursor-pointer transition ${
                    notif.read ? 'bg-gray-50' : 'bg-blue-50'
                  }`}
                  onClick={() => markAsRead(notif.id)}
                >
                  <p className="font-medium">{notif.title}</p>
                  <p className="text-xs text-gray-600 mt-1">{notif.message}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {formatDistanceToNow(notif.created_at)} ago
                  </p>
                </div>
              ))
            ) : (
              <p className="text-center text-sm text-gray-500 py-4">
                No notifications
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
```

---

## Global Search Bar

### Pattern

Search bar in header or sidebar. Triggers command palette or global search.

```tsx
export const SearchBar = () => {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);

  return (
    <div className="relative">
      <Input
        placeholder="Search..."
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        onChange={(e) => handleSearch(e.target.value)}
        className="w-48"
      />

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50">
          {results.map((result) => (
            <Link
              key={result.id}
              href={result.href}
              className="block px-4 py-2 hover:bg-gray-100 text-sm"
            >
              {result.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
```

---

## Page Headers

### Pattern

Title, description, actions, back button.

```
┌─────────────────────────────────────────┐
│ [←] Project Settings                    │
│     Manage project preferences           │
│                                         │
│                         [Save] [Cancel] │
└─────────────────────────────────────────┘
```

### Implementation

```tsx
export const PageHeader = ({
  title,
  description,
  actions,
  backButton,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  backButton?: { href: string };
}) => (
  <div className="flex items-start justify-between pb-6 border-b">
    <div>
      <div className="flex items-center gap-2 mb-2">
        {backButton && (
          <Link href={backButton.href}>
            <Button variant="ghost" size="icon">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </Link>
        )}
        <h1 className="text-3xl font-bold">{title}</h1>
      </div>
      {description && <p className="text-gray-600 text-sm">{description}</p>}
    </div>
    <div className="flex gap-2">{actions}</div>
  </div>
);

// Usage
<PageHeader
  title="Project Settings"
  description="Manage project preferences"
  backButton={{ href: '/projects' }}
  actions={
    <>
      <Button variant="outline">Cancel</Button>
      <Button>Save</Button>
    </>
  }
/>
```

---

## Footer (Minimal for SaaS)

### Pattern

Light footer with links, version, status.

```
┌─────────────────────────────────────────────────┐
│ Docs | Blog | Status | Privacy | v1.2.3         │
│ © 2026 Company. All rights reserved.            │
└─────────────────────────────────────────────────┘
```

### Implementation

```tsx
export const Footer = () => (
  <footer className="border-t bg-gray-50 py-6 mt-12">
    <div className="max-w-6xl mx-auto px-6 text-sm text-gray-600 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-6">
          <a href="/docs" className="hover:text-gray-900">Docs</a>
          <a href="/blog" className="hover:text-gray-900">Blog</a>
          <a href="/status" className="hover:text-gray-900">Status</a>
          <a href="/privacy" className="hover:text-gray-900">Privacy</a>
        </div>
        <span>v{appVersion}</span>
      </div>
      <p>© 2026 Company. All rights reserved.</p>
    </div>
  </footer>
);
```

---

## Workspace / Team Switcher

### Pattern

Dropdown in sidebar header to switch organizations/workspaces.

```tsx
export const WorkspaceSwitcher = ({ currentWorkspace, workspaces }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className="w-full justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded text-white text-xs flex items-center justify-center">
            {currentWorkspace.name.charAt(0)}
          </div>
          <span className="font-medium">{currentWorkspace.name}</span>
        </div>
        <ChevronsUpDown className="w-4 h-4 text-gray-400" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="w-full">
      {workspaces.map((ws) => (
        <DropdownMenuItem key={ws.id} onClick={() => switchWorkspace(ws.id)}>
          <div className="w-4 h-4 bg-gray-400 rounded text-white text-xs flex items-center justify-center mr-2">
            {ws.name.charAt(0)}
          </div>
          {ws.name}
          {ws.id === currentWorkspace.id && <Check className="w-4 h-4 ml-auto" />}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <a href="/workspaces/create">+ Create workspace</a>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
```

---

## Keyboard Shortcuts Display

### Tooltip + Command Palette Reference

```tsx
{/* Show shortcut in tooltip */}
<Tooltip delayDuration={200}>
  <TooltipTrigger asChild>
    <Button variant="ghost">
      <Search className="w-4 h-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>
    <div className="space-y-1">
      <p className="text-sm font-medium">Search</p>
      <kbd className="text-xs bg-gray-700 text-white px-2 py-1 rounded">
        ⌘K
      </kbd>
    </div>
  </TooltipContent>
</Tooltip>

{/* Show shortcuts in command palette */}
<Command.Item>
  <span>Create new project</span>
  <kbd className="ml-auto text-xs text-gray-500">⌘N</kbd>
</Command.Item>
```

---

## Navigation Architecture Best Practices

### Config-Driven Navigation

```tsx
const navigationConfig = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    role: ['user', 'admin'],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Settings,
    role: ['admin'],
    children: [
      {
        id: 'users',
        label: 'Users',
        href: '/admin/users',
        role: ['admin'],
      },
      {
        id: 'settings',
        label: 'Settings',
        href: '/admin/settings',
        role: ['admin'],
      },
    ],
  },
];

// Filter by user role, feature flags, etc.
const filteredNav = navigationConfig.filter((item) =>
  item.role?.includes(userRole)
);
```

### Dynamic Routing Based on Permissions

```tsx
const hasAccess = (item: NavItem, user: User): boolean => {
  if (item.requiredRole && !user.roles.includes(item.requiredRole)) {
    return false;
  }
  if (item.requiredFeature && !featureFlags[item.requiredFeature]) {
    return false;
  }
  return true;
};
```

---

## Dark Mode Implementation

### Color Mapping
- Light sidebar: `bg-white` → Dark: `dark:bg-slate-950`
- Light active item: `bg-blue-100 text-blue-900` → Dark: `dark:bg-slate-800 dark:text-blue-400`
- Light borders: `border-slate-200` → Dark: `dark:border-slate-800`
- Light text: `text-gray-700` → Dark: `dark:text-slate-300`
- Light hover: `hover:bg-gray-100` → Dark: `dark:hover:bg-slate-800`

### Key Dark Mode Rules for Navigation
1. **Sidebar background**: Use `dark:bg-slate-950` (not pure black) to avoid harshness and provide hierarchy with hover states
2. **Active item highlight**: Adjust color contrast — `dark:bg-slate-800 dark:text-blue-400` ensures clear visibility against dark background
3. **Border colors**: Use `dark:border-slate-800` for subtle dividers that don't overpower the dark theme

### Dark Mode Navigation Example
```tsx
<div className="w-64 border-r bg-white dark:bg-slate-950 dark:border-slate-800 shadow-sm">
  {/* Header */}
  <div className="p-4 border-b dark:border-slate-800 flex items-center justify-between">
    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Logo</h1>
    <Button variant="ghost" size="icon" onClick={toggleCollapse}>
      <ChevronLeft className="w-4 h-4" />
    </Button>
  </div>

  {/* Navigation with dark mode adjustments */}
  <nav className="p-4 space-y-2">
    {navItems.map((item) => (
      <Link
        key={item.id}
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${
          isActive(item.href)
            ? 'bg-blue-100 dark:bg-slate-800 text-blue-900 dark:text-blue-400 font-semibold'
            : 'text-gray-700 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
        }`}
      >
        {item.icon && <item.icon className="w-4 h-4 flex-shrink-0" />}
        <span>{item.label}</span>
      </Link>
    ))}
  </nav>
</div>
```

---

## Responsive Behavior

### Breakpoint Strategy
- **Mobile (< 640px)**: Hamburger menu + slide-out drawer (Sheet component), full-width drawer
- **Tablet (640px - 1024px)**: Collapsed sidebar (icons only) with tooltips, 80px width
- **Desktop (> 1024px)**: Full expanded sidebar with labels, 256px (w-64) width

### Key Responsive Rules for Navigation
1. **Sidebar visibility**: Hidden on mobile (`hidden md:block`), visible on tablet+
2. **Hamburger toggle**: Visible on mobile (`md:hidden`), triggers Sheet drawer
3. **Icon-only state**: Tablet shows collapsed nav, expand on hover or via toggle
4. **Bottom tab bar (mobile)**: Alternative for mobile-first apps, `fixed bottom-0 left-0 right-0 sm:hidden`

### Responsive Navigation Example
```tsx
export function ResponsiveNavigation() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex">
      {/* Desktop sidebar - hidden on mobile */}
      <div className="hidden md:w-64 md:border-r md:bg-white dark:md:bg-slate-950 md:block">
        {/* Full sidebar content */}
        <DesktopSidebar />
      </div>

      {/* Mobile hamburger - visible on mobile only */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b bg-white dark:bg-slate-950 flex items-center px-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </Button>
        <h1 className="ml-3 text-lg font-bold">App</h1>
      </div>

      {/* Mobile drawer - full-width slide-out */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-full sm:w-64 p-0">
          {/* Navigation items */}
          <nav className="p-4 space-y-2 mt-16">
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-100 dark:hover:bg-slate-800"
                onClick={() => setSidebarOpen(false)}
              >
                {item.icon && <item.icon className="w-4 h-4" />}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <main className="flex-1 md:pl-0 pt-16 md:pt-0">
        {/* Content goes here */}
      </main>

      {/* Bottom tab bar for mobile-first apps (optional) */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white dark:bg-slate-950 sm:hidden">
        <div className="flex justify-around">
          {mobileTabItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium text-gray-600 dark:text-slate-400"
            >
              <item.icon className="w-5 h-5 mb-1" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Sources

- [7 Tips for Designing a SaaS Navigation Menu](https://www.webstacks.com/blog/saas-navigation-menu)
- [Sidebar - SaaS UI](https://saas-ui.dev/docs/components/layout/sidebar)
- [7+ Shadcn Sidebar Examples for Next.js SaaS Apps](https://medium.com/write-a-catalyst/7-best-shadcn-sidebar-patterns-for-modern-saas-dashboards-ef1235cc920d)
- [Designing a layout structure for SaaS products](https://medium.com/design-bootcamp/designing-a-layout-structure-for-saas-products-best-practices-d370211fb0d1)
- [cmdk: Fast, unstyled command menu React component](https://cmdk.paco.me/)
- [React Command Palette with Tailwind CSS and Headless UI](https://blog.logrocket.com/react-command-palette-tailwind-css-headless-ui/)
- [Shadcn Command](https://www.shadcn.io/ui/command)
