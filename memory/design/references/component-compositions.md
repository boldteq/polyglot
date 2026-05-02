# Component Composition Library — Production Page Patterns

**Purpose:** Show Vega and Koda how to COMBINE shadcn/ui components into production pages. Not individual components — complete, copy-paste page sections.

**Rule:** Every composition includes: layout structure, component imports, responsive behavior, dark mode, loading state, empty state, error state.

---

## Quick Reference: Which Composition for Which Page

| Page Type | Primary Composition | Key Components |
|-----------|-------------------|----------------|
| Dashboard | Metric Cards + Chart Grid + Activity Feed | Card, Badge, Tabs |
| Settings | Sidebar Tabs + Form Sections + Danger Zone | Tabs, Card, Form, Input, Switch, AlertDialog |
| Data List | Toolbar + Table + Pagination + Bulk Actions | Table, Checkbox, DropdownMenu, Button, Badge |
| Auth | Split Layout + Form + Social Login | Card, Form, Input, Button, Separator |
| Billing/Pricing | Plan Cards + Feature Comparison + Usage Meter | Card, Badge, Progress, Button, Tabs |
| Detail View | Header + Tabs + Content Panels + Actions | Tabs, Card, Badge, Button, Separator |
| Admin Panel | Sidebar Nav + Header + Content Area + Stats | Sidebar, Card, Table, Badge, Tabs |
| Landing Page | Hero + Features + Social Proof + Pricing + CTA | Card, Badge, Button, Separator |
| Onboarding | Stepper + Cards + Checklist + Progress | Card, Progress, Checkbox, Button |
| Search/Filter | Command Palette + Filter Bar + Results Grid | Command, Popover, Badge, Card, Checkbox |

---

## 1. Dashboard Composition

### Metric Cards Row
```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowUpRight, ArrowDownRight, Users, DollarSign, Activity, TrendingUp } from "lucide-react"

// --- Metric Card (reusable) ---
function MetricCard({ title, value, change, changeType, icon: Icon }: {
  title: string
  value: string
  change: string
  changeType: "up" | "down" | "neutral"
  icon: React.ElementType
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          {changeType === "up" && <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
          {changeType === "down" && <ArrowDownRight className="h-3 w-3 text-red-500" />}
          <span className={changeType === "up" ? "text-emerald-500" : changeType === "down" ? "text-red-500" : ""}>
            {change}
          </span>
          <span>from last period</span>
        </div>
      </CardContent>
    </Card>
  )
}

// --- Layout: 4 cards in a row, responsive ---
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <MetricCard title="Total Revenue" value="$45,231" change="+20.1%" changeType="up" icon={DollarSign} />
  <MetricCard title="Active Users" value="2,350" change="+15.3%" changeType="up" icon={Users} />
  <MetricCard title="Conversion Rate" value="3.2%" change="-0.4%" changeType="down" icon={Activity} />
  <MetricCard title="Growth" value="+573" change="+201" changeType="up" icon={TrendingUp} />
</div>
```

**Responsive:** 1 col mobile → 2 col tablet → 4 col desktop
**Spacing:** `gap-4` (16px) between cards
**Loading state:** Replace each card with `<Skeleton className="h-[120px]" />`
**Empty state:** N/A (metrics always have values, show 0 if no data)

### Dashboard Chart + Table Grid
```tsx
// Two-column layout: chart left, activity right
<div className="grid grid-cols-1 lg:grid-cols-7 gap-4 mt-4">
  {/* Chart takes 4/7 on desktop */}
  <Card className="lg:col-span-4">
    <CardHeader>
      <CardTitle className="text-base">Revenue Over Time</CardTitle>
    </CardHeader>
    <CardContent>
      {/* Recharts / Chart.js here */}
      <div className="h-[300px]">
        {isLoading ? <Skeleton className="h-full w-full" /> : <RevenueChart data={data} />}
      </div>
    </CardContent>
  </Card>

  {/* Activity feed takes 3/7 on desktop */}
  <Card className="lg:col-span-3">
    <CardHeader>
      <CardTitle className="text-base">Recent Activity</CardTitle>
    </CardHeader>
    <CardContent>
      <ScrollArea className="h-[300px]">
        <div className="space-y-4">
          {activities.map(activity => (
            <div key={activity.id} className="flex items-start gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{activity.initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{activity.user}</p>
                <p className="text-xs text-muted-foreground">{activity.action}</p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{activity.time}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </CardContent>
  </Card>
</div>
```

**Responsive:** Stacked on mobile, 4/7 + 3/7 split on desktop
**Chart height:** Fixed 300px (prevents CLS)

---

## 2. Settings Page Composition

### Settings Layout (Sidebar Tabs + Content)
```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences.</p>
      </div>

      {/* Vertical tabs on desktop, horizontal on mobile */}
      <Tabs defaultValue="account" className="flex flex-col md:flex-row gap-6">
        <TabsList className="flex md:flex-col h-auto md:w-48 bg-transparent justify-start">
          <TabsTrigger value="account" className="justify-start">Account</TabsTrigger>
          <TabsTrigger value="notifications" className="justify-start">Notifications</TabsTrigger>
          <TabsTrigger value="billing" className="justify-start">Billing</TabsTrigger>
          <TabsTrigger value="security" className="justify-start">Security</TabsTrigger>
          <TabsTrigger value="danger" className="justify-start text-destructive">Danger Zone</TabsTrigger>
        </TabsList>

        <div className="flex-1 min-w-0">
          {/* Account Tab */}
          <TabsContent value="account" className="space-y-4 mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profile</CardTitle>
                <CardDescription>Update your personal information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" placeholder="Enter your name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="you@example.com" />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t pt-4 flex justify-end">
                <Button>Save Changes</Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-4 mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notification Preferences</CardTitle>
                <CardDescription>Choose what you want to be notified about.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { id: "email-updates", label: "Product updates", desc: "News about features and improvements" },
                  { id: "email-security", label: "Security alerts", desc: "Important security notifications" },
                  { id: "email-marketing", label: "Marketing emails", desc: "Tips, offers, and newsletters" },
                ].map(item => (
                  <div key={item.id} className="flex items-center justify-between py-2">
                    <div>
                      <Label htmlFor={item.id} className="font-medium">{item.label}</Label>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch id={item.id} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Danger Zone Tab */}
          <TabsContent value="danger" className="space-y-4 mt-0">
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Delete Account</CardTitle>
                <CardDescription>Permanently delete your account and all data. This cannot be undone.</CardDescription>
              </CardHeader>
              <CardFooter className="border-t pt-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">Delete Account</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. All your data, projects, and billing history will be permanently deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete Account
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardFooter>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
```

**Key patterns:**
- Vertical tabs on desktop (`md:flex-col md:w-48`), horizontal on mobile
- Each tab content = Card with Header + Content + Footer
- Form fields: 2-col grid on desktop, stack on mobile
- Danger zone: red border card (`border-destructive/50`) + AlertDialog confirmation
- Save button in CardFooter with `border-t` separator
- Switch rows: flex justify-between for label + toggle alignment

---

## 3. Data List / Table Page Composition

### Full Table Page with Toolbar, Filters, Bulk Actions
```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { MoreHorizontal, Search, Download, Trash2, Filter, ChevronLeft, ChevronRight } from "lucide-react"

function DataListPage({ data, isLoading, totalPages, currentPage, onPageChange }) {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState("")

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">Manage all registered users.</p>
        </div>
        <Button>Add User</Button>
      </div>

      {/* Toolbar: Search + Filters + Bulk Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="banned">Banned</SelectItem>
            </SelectContent>
          </Select>

          {selected.length > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in">
              <span className="text-sm text-muted-foreground">{selected.length} selected</span>
              <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1.5" />Export</Button>
              <Button variant="destructive" size="sm"><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete</Button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selected.length === data.length}
                  onCheckedChange={checked => setSelected(checked ? data.map(d => d.id) : [])}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No users found</p>
                    <Button variant="outline" size="sm">Add your first user</Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.map(user => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(user.id)}
                      onCheckedChange={checked =>
                        setSelected(prev => checked ? [...prev, user.id] : prev.filter(id => id !== user.id))
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.status === "active" ? "default" : user.status === "banned" ? "destructive" : "secondary"}>
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{user.plan}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View Details</DropdownMenuItem>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">Ban User</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {((currentPage - 1) * 10) + 1} to {Math.min(currentPage * 10, totalCount)} of {totalCount} results
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

**Key patterns:**
- Search input with icon: `pl-9` padding + absolute positioned icon
- Bulk actions: appear only when items selected, with `animate-in fade-in`
- Badge variants: `default` (active), `destructive` (banned), `secondary` (inactive), `outline` (plan)
- Row actions: ghost icon button + DropdownMenu aligned end
- Loading: Skeleton rows matching table structure (prevents CLS)
- Empty: centered icon + message + CTA in colSpan cell
- Pagination: left count text + right prev/next buttons

---

## 4. Auth Page Composition

### Split Layout Login
```tsx
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

function AuthPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left: Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary/5 items-center justify-center p-12">
        <div className="max-w-md space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary" />
            <span className="text-xl font-bold">AppName</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Build something great today.</h2>
          <p className="text-muted-foreground">Join thousands of teams shipping faster with our platform.</p>
        </div>
      </div>

      {/* Right: Form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-sm border-0 shadow-none sm:border sm:shadow-sm">
          <CardHeader className="text-center">
            {/* Logo on mobile only */}
            <div className="lg:hidden flex justify-center mb-4">
              <div className="h-8 w-8 rounded-lg bg-primary" />
            </div>
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>Sign in to your account to continue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Social Login */}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="w-full">
                <svg className="mr-2 h-4 w-4" /* Google icon */ />Google
              </Button>
              <Button variant="outline" className="w-full">
                <svg className="mr-2 h-4 w-4" /* GitHub icon */ />GitHub
              </Button>
            </div>

            {/* Divider */}
            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                or continue with email
              </span>
            </div>

            {/* Email/Password */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</a>
              </div>
              <Input id="password" type="password" />
            </div>

            <Button className="w-full">Sign In</Button>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <a href="/signup" className="text-primary font-medium hover:underline">Sign up</a>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
```

**Key patterns:**
- Split layout: hidden left panel on mobile, 50/50 on desktop
- Card: borderless on mobile (`border-0 shadow-none sm:border sm:shadow-sm`)
- Separator with text overlay: absolute positioned span
- Social buttons: 2-col grid
- Forgot password: inline link next to label (flex justify-between)
- Sign up link: in CardFooter

---

## 5. Pricing Page Composition

### 3-Tier Pricing Cards
```tsx
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Check } from "lucide-react"

function PricingPage() {
  const [annual, setAnnual] = useState(false)

  const plans = [
    {
      name: "Free",
      price: { monthly: 0, annual: 0 },
      description: "For individuals getting started",
      features: ["5 projects", "1 GB storage", "Community support", "Basic analytics"],
      cta: "Get Started",
      variant: "outline" as const,
      popular: false,
    },
    {
      name: "Pro",
      price: { monthly: 29, annual: 24 },
      description: "For growing teams",
      features: ["Unlimited projects", "10 GB storage", "Priority support", "Advanced analytics", "Custom domains", "Team collaboration"],
      cta: "Start Free Trial",
      variant: "default" as const,
      popular: true,
    },
    {
      name: "Enterprise",
      price: { monthly: 99, annual: 79 },
      description: "For large organizations",
      features: ["Everything in Pro", "100 GB storage", "Dedicated support", "Custom integrations", "SSO/SAML", "SLA guarantee", "Audit logs"],
      cta: "Contact Sales",
      variant: "outline" as const,
      popular: false,
    },
  ]

  return (
    <div className="max-w-5xl mx-auto py-12 px-4">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple, transparent pricing</h1>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          Choose the plan that fits your needs. Upgrade or downgrade anytime.
        </p>

        {/* Annual/Monthly Toggle */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <Label htmlFor="billing-toggle" className={!annual ? "font-medium" : "text-muted-foreground"}>Monthly</Label>
          <Switch id="billing-toggle" checked={annual} onCheckedChange={setAnnual} />
          <Label htmlFor="billing-toggle" className={annual ? "font-medium" : "text-muted-foreground"}>
            Annual <Badge variant="secondary" className="ml-1.5">Save 20%</Badge>
          </Label>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map(plan => (
          <Card key={plan.name} className={plan.popular ? "border-primary shadow-lg relative" : ""}>
            {plan.popular && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</Badge>
            )}
            <CardHeader>
              <CardTitle className="text-lg">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="mt-3">
                <span className="text-4xl font-bold">
                  ${annual ? plan.price.annual : plan.price.monthly}
                </span>
                {plan.price.monthly > 0 && (
                  <span className="text-muted-foreground text-sm">/month</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {plan.features.map(feature => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant={plan.variant} className="w-full">
                {plan.cta}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

**Key patterns:**
- Annual/monthly toggle: Switch with conditional label weights
- "Save 20%" badge: inline with annual label
- Popular card: `border-primary shadow-lg` + floating badge (`absolute -top-3`)
- Price display: `text-4xl font-bold` + `/month` suffix muted
- Feature list: Check icon + text, `space-y-2.5`
- CTA: `variant="default"` for popular, `variant="outline"` for others

---

## 6. Detail View Composition

### Header + Tabs + Content
```tsx
function DetailView({ item }) {
  return (
    <div className="space-y-6">
      {/* Header with back + title + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{item.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
              <span className="text-xs text-muted-foreground">Created {formatDate(item.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1.5" />Export</Button>
          <Button size="sm"><Edit className="h-3.5 w-3.5 mr-1.5" />Edit</Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Content cards */}
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

---

## 7. Dialog + Form Composition

### Create/Edit Modal with Validation
```tsx
function CreateItemDialog({ open, onOpenChange }) {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", status: "draft" },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Item</DialogTitle>
          <DialogDescription>Fill in the details below to create a new item.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea placeholder="Describe the item..." className="min-h-[80px]" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating..." : "Create Item"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

**Key patterns:**
- Dialog max width: `sm:max-w-md` for forms
- Form fields: `space-y-4` vertical gap
- Validation: FormMessage shows error below each field
- Submit button: disabled during submission with text change
- Cancel: `variant="outline"` in DialogFooter
- Select inside Form: uses FormControl wrapper

---

## 8. Empty State Composition

### Standard Empty State
```tsx
function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: {
  icon: React.ElementType
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      <Button className="mt-4" onClick={onAction}>
        <Plus className="h-4 w-4 mr-1.5" />{actionLabel}
      </Button>
    </div>
  )
}

// Usage:
<EmptyState
  icon={FileText}
  title="No projects yet"
  description="Create your first project to get started with the platform."
  actionLabel="Create Project"
  onAction={() => setCreateDialogOpen(true)}
/>
```

---

## 9. Loading State Composition

### Skeleton Page (matches real layout)
```tsx
function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Metric cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-16 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart + Activity skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        <Card className="lg:col-span-4">
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-[300px]" /></CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-1" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

**Rule:** Skeleton shape MUST match the real component (same heights, widths, grid layout). This prevents CLS.

---

## Component Spacing Quick Reference

| Context | Gap | Tailwind |
|---------|-----|----------|
| Between cards in grid | 16px | `gap-4` |
| Between form fields | 16px | `space-y-4` |
| Between sections | 24px | `space-y-6` |
| Card internal padding | 24px | Default CardContent padding |
| Between page title and content | 24px | `mb-6` |
| Between label and input | 8px | `space-y-2` |
| Between icon and text | 6px | `gap-1.5` or `mr-1.5` |
| Between small items (badges) | 8px | `gap-2` |
| Page horizontal padding | 16px mobile, 24px desktop | `px-4 sm:px-6` |

## Icon Sizing Quick Reference

| Context | Size | Tailwind |
|---------|------|----------|
| Inside buttons (sm) | 14px | `h-3.5 w-3.5` |
| Inside buttons (default) | 16px | `h-4 w-4` |
| Standalone action | 16px | `h-4 w-4` |
| Empty state hero | 24px | `h-6 w-6` |
| Page header icon | 20px | `h-5 w-5` |
| Inline with text | 14-16px | `h-3.5 w-3.5` or `h-4 w-4` |
| Feature card icon | 24-32px | `h-6 w-6` or `h-8 w-8` |

## Badge Variant Quick Reference

| State | Variant | Example |
|-------|---------|---------|
| Active/Success | `default` | `<Badge>Active</Badge>` |
| Inactive/Draft | `secondary` | `<Badge variant="secondary">Draft</Badge>` |
| Error/Banned | `destructive` | `<Badge variant="destructive">Banned</Badge>` |
| Neutral/Info | `outline` | `<Badge variant="outline">Free Plan</Badge>` |

## Button Variant Quick Reference

| Action | Variant | Size | Example |
|--------|---------|------|---------|
| Primary action | `default` | `default` | Save, Create, Submit |
| Secondary action | `outline` | `default` | Cancel, Export, Filter |
| Destructive | `destructive` | `default` | Delete, Ban, Remove |
| Toolbar action | `outline` | `sm` | With icon + label |
| Row action menu | `ghost` | `icon` | MoreHorizontal dots |
| Back navigation | `ghost` | `icon` | ArrowLeft |
| Link-style | `link` | `default` | View Details → |
