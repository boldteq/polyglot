# shadcn/ui Components & Composition Patterns

**Last updated: 2026-04-04**

This is a comprehensive reference for all 45+ shadcn/ui components, patterns, composition techniques, and production-grade implementations. shadcn/ui is a collection of beautifully designed, accessible, composable components built with Radix UI, Tailwind CSS, and React. Components live in your repo (not an NPM package), so you own them entirely.

---

## Core Philosophy

- **Composition over inheritance:** Every component follows a predictable interface, making them easy to combine
- **Radix UI foundation:** Built on Radix primitives, so accessibility is built-in (but don't break it)
- **Tailwind first:** All styling via Tailwind classes; no CSS modules or styled-components
- **Copy-paste model:** Install via `npx shadcn-ui@latest add [component]` and modify as needed
- **Blocks not just components:** Use pre-built page layouts (dashboard, auth, settings) for faster builds

---

## Installation

### Add Single Component
```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add data-table
```

### Add Multiple Components at Once
```bash
npx shadcn-ui@latest add button card input dialog form
```

### Update All Components
```bash
npx shadcn-ui@latest sync
```

### Custom Installation (Monorepo)
```bash
npx shadcn-ui@latest add --all --path=apps/web/src/components
```

---

## Component Catalog

### 1. NAVIGATION COMPONENTS

#### Accordion
**When to use:** FAQs, collapsible feature lists, settings with grouped options, expandable documentation sections
**When NOT:** Simple show/hide; use Collapsible instead. Single item; use Collapsible
**Key props:** `type` ("single" | "multiple"), `value`, `onValueChange`, `collapsible` (true for accordion single-select)
**Accessibility:** Keyboard nav (arrow keys), ARIA accordion role, proper focus management
**Composition example:**
```tsx
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"

export function FAQSection() {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="item-1">
        <AccordionTrigger>Is it accessible?</AccordionTrigger>
        <AccordionContent>
          Yes. It adheres to the WAI-ARIA design pattern.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Is it styled?</AccordionTrigger>
        <AccordionContent>
          Yes. It comes with default styles that you can customize.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
```

#### Breadcrumb
**When to use:** Navigation hierarchy (Admin > Users > Edit User), page location context, large admin sections
**When NOT:** Linear page flow; breadcrumbs only show hierarchy, not flow
**Key props:** Semantic structure with `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbSeparator`
**Accessibility:** ARIA breadcrumb navigation role, semantic links
**Composition example:**
```tsx
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from "@/components/ui/breadcrumb"

export function BreadcrumbNav() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator>/</BreadcrumbSeparator>
        <BreadcrumbItem><BreadcrumbLink href="/admin">Admin</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator>/</BreadcrumbSeparator>
        <BreadcrumbItem><BreadcrumbPage>Users</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
```

#### NavigationMenu
**When to use:** Main horizontal navigation with submenus (marketing sites, product nav), complex multi-level navigation
**When NOT:** Sidebar; use Sidebar component. Simple top nav; use Tabs or basic nav
**Key props:** `value`, `onValueChange`, `orientation` ("horizontal" | "vertical")
**Accessibility:** Keyboard navigation (arrow keys), ARIA menu role, focus trap
**Composition example:**
```tsx
import { NavigationMenu, NavigationMenuList, NavigationMenuTrigger, NavigationMenuContent, NavigationMenuLink } from "@/components/ui/navigation-menu"

export function MainNav() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuTrigger>Products</NavigationMenuTrigger>
        <NavigationMenuContent className="grid w-[400px] gap-4 p-4">
          <NavigationMenuLink asChild><a href="/products/billing">Billing</a></NavigationMenuLink>
          <NavigationMenuLink asChild><a href="/products/analytics">Analytics</a></NavigationMenuLink>
        </NavigationMenuContent>
      </NavigationMenuList>
    </NavigationMenu>
  )
}
```

#### Tabs
**When to use:** Switch between content sections (Dashboard | Users | Settings), multi-view layouts, feature comparisons
**When NOT:** Navigation between pages; use links. Single view; remove tabs
**Key props:** `defaultValue`, `value`, `onValueChange`
**Accessibility:** ARIA tabs role, keyboard navigation (arrow keys), focus management
**Composition example:**
```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export function AdminTabs() {
  return (
    <Tabs defaultValue="dashboard" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
      </TabsList>
      <TabsContent value="dashboard" className="space-y-4">
        <Card><CardHeader><CardTitle>Revenue</CardTitle></CardHeader></Card>
      </TabsContent>
      <TabsContent value="users">User management content</TabsContent>
      <TabsContent value="billing">Billing content</TabsContent>
    </Tabs>
  )
}
```

#### Sidebar
**When to use:** Dashboard left navigation, collapsible menus, app navigation, multi-section layouts
**When NOT:** Lightweight nav bars; use DropdownMenu or NavigationMenu. Top nav; use NavigationMenu
**Key props:** `open`, `onOpenChange`, `collapsible` ("icon" | "offcanvas")
**Accessibility:** Keyboard navigation, focus management, ARIA labels on trigger
**Composition example:**
```tsx
import { Sidebar, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "@/components/ui/sidebar"
import { useSidebar } from "@/components/ui/sidebar"

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild><a href="/dashboard">Dashboard</a></SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild><a href="/settings">Settings</a></SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  )
}
```

#### Menubar
**When to use:** Application menu bars (File > Save, Edit > Copy), desktop-like UIs
**When NOT:** Simple navigation; use NavigationMenu. Button groups; use ToggleGroup
**Key props:** `value`, `defaultValue`
**Accessibility:** ARIA menubar role, keyboard shortcuts, focus management
**Composition example:**
```tsx
import { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from "@/components/ui/menubar"

export function AppMenubar() {
  return (
    <Menubar>
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>New</MenubarItem>
          <MenubarItem>Open</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>Copy</MenubarItem>
          <MenubarItem>Paste</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
```

#### DropdownMenu
**When to use:** Context actions, user menu, action buttons, filter options
**When NOT:** Primary navigation; use Sidebar or NavigationMenu. Selection between items; use Select
**Key props:** `open`, `onOpenChange`, `side` ("top" | "right" | "bottom" | "left")
**Accessibility:** ARIA menu role, keyboard navigation, focus trap
**Composition example:**
```tsx
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

export function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">⋮</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>Profile</DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red-600">Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

#### ContextMenu
**When to use:** Right-click context menus, custom interactions
**When NOT:** Default interactions; use standard menus. Mobile UIs; context menu not native on touch
**Key props:** `asChild` for wrapper element
**Accessibility:** ARIA menu role, keyboard fallback to trigger element
**Composition example:**
```tsx
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu"

export function ContextFileMenu() {
  return (
    <ContextMenu>
      <ContextMenuTrigger>Right-click here</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>Copy</ContextMenuItem>
        <ContextMenuItem>Paste</ContextMenuItem>
        <ContextMenuItem className="text-red-600">Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
```

### 2. FORM COMPONENTS

#### Button
**When to use:** All clickable actions (forms, toolbars, CTAs, navigation)
**When NOT:** Decorative; use `<div>`. Toggle states; use Toggle. Text link; use Button variant="link"
**Key props:** `variant` ("default" | "secondary" | "destructive" | "outline" | "ghost" | "link"), `size` ("sm" | "md" | "lg" | "icon"), `disabled`
**Accessibility:** Automatically handles focus states, disabled attribute, ARIA button role
**Composition example:**
```tsx
import { Button } from "@/components/ui/button"

export function ActionButtons() {
  return (
    <div className="flex gap-2">
      <Button>Primary Action</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="destructive">Delete</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button size="icon">→</Button>
    </div>
  )
}
```

#### Input
**When to use:** Text, email, password, URL, number fields
**When NOT:** Boolean; use Checkbox. Selection from list; use Select. Multi-line; use Textarea
**Key props:** `type`, `placeholder`, `disabled`, `value`, `onChange`, `className`
**Accessibility:** Always pair with Label via `htmlFor` and `id`
**Composition example:**
```tsx
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" />
      </div>
    </div>
  )
}
```

#### Label
**When to use:** Form field labels, form section labels
**When NOT:** Standalone text; use `<p>` or `<span>`. Button labels; use Button text
**Key props:** `htmlFor` (must match input id), `className`
**Accessibility:** ARIA form association via `htmlFor` attribute
**Composition example:**
```tsx
import { Label } from "@/components/ui/label"

export function FormLabel() {
  return <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
}
```

#### Textarea
**When to use:** Multi-line text input (descriptions, JD input, comments, feedback)
**When NOT:** Single line; use Input. Rich text; use dedicated editor
**Key props:** `placeholder`, `rows`, `disabled`, `value`, `onChange`
**Accessibility:** Pair with Label via `htmlFor`
**Composition example:**
```tsx
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

export function JobDescriptionInput() {
  return (
    <div className="space-y-2">
      <Label htmlFor="jd">Job Description</Label>
      <Textarea id="jd" placeholder="Paste the job description here..." rows={8} />
    </div>
  )
}
```

#### Checkbox
**When to use:** Boolean toggles, accept terms, feature selection, multiple selection
**When NOT:** Single binary choice; use Switch. Many mutually exclusive options; use RadioGroup
**Key props:** `checked`, `onCheckedChange`, `disabled`, `id`
**Accessibility:** ARIA checkbox role, keyboard navigation (Space to toggle)
**Composition example:**
```tsx
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

export function TermsAcceptance() {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">I agree to the terms and conditions</Label>
    </div>
  )
}
```

#### RadioGroup
**When to use:** Mutually exclusive options (plan selection, billing frequency, priority level)
**When NOT:** Boolean toggle; use Checkbox or Switch. Selection from large list; use Select
**Key props:** `value`, `onValueChange`, `defaultValue`
**Accessibility:** ARIA radio role, keyboard navigation (arrow keys)
**Composition example:**
```tsx
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

export function PlanSelector() {
  return (
    <RadioGroup defaultValue="monthly">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="monthly" id="monthly" />
        <Label htmlFor="monthly">Monthly Billing</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="annual" id="annual" />
        <Label htmlFor="annual">Annual Billing (20% off)</Label>
      </div>
    </RadioGroup>
  )
}
```

#### Toggle
**When to use:** Single boolean state buttons, text formatting (bold, italic), feature toggles
**When NOT:** Multiple options; use ToggleGroup. Binary choice with label; use Checkbox
**Key props:** `pressed`, `onPressedChange`, `variant`, `size`
**Accessibility:** ARIA pressed role, keyboard support (Space)
**Composition example:**
```tsx
import { Toggle } from "@/components/ui/toggle"
import { Bold, Italic, Underline } from "lucide-react"

export function TextFormatting() {
  return (
    <div className="flex gap-2">
      <Toggle><Bold className="h-4 w-4" /></Toggle>
      <Toggle><Italic className="h-4 w-4" /></Toggle>
      <Toggle><Underline className="h-4 w-4" /></Toggle>
    </div>
  )
}
```

#### ToggleGroup
**When to use:** View options (list/grid), text alignment, size selection
**When NOT:** Checkboxes; use Checkbox group. RadioGroup alternatives; use RadioGroup for clarity
**Key props:** `value`, `onValueChange`, `type` ("single" | "multiple"), `size`, `variant`
**Accessibility:** ARIA button group role, keyboard navigation
**Composition example:**
```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { List, Grid2x2, LayoutGrid } from "lucide-react"

export function ViewToggle() {
  return (
    <ToggleGroup type="single" defaultValue="grid">
      <ToggleGroupItem value="list"><List className="h-4 w-4" /></ToggleGroupItem>
      <ToggleGroupItem value="grid"><Grid2x2 className="h-4 w-4" /></ToggleGroupItem>
      <ToggleGroupItem value="compact"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
    </ToggleGroup>
  )
}
```

#### Switch
**When to use:** Boolean on/off toggle, feature activation, dark mode toggle
**When NOT:** Form acceptance; use Checkbox. Selection between options; use RadioGroup
**Key props:** `checked`, `onCheckedChange`, `disabled`
**Accessibility:** ARIA switch role, keyboard support (Space)
**Composition example:**
```tsx
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export function DarkModeToggle() {
  const [darkMode, setDarkMode] = useState(false)
  return (
    <div className="flex items-center space-x-2">
      <Switch checked={darkMode} onCheckedChange={setDarkMode} />
      <Label>Dark Mode</Label>
    </div>
  )
}
```

#### Select
**When to use:** Dropdown list of options (status, plan, category, country)
**When NOT:** Only 2-3 options; use RadioGroup. Searchable list; use Combobox. Multiple selection; use Checkbox group
**Key props:** `value`, `onValueChange`, `open`, `onOpenChange`, `disabled`
**Accessibility:** ARIA listbox role, keyboard navigation (arrow keys)
**Composition example:**
```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

export function StatusSelector() {
  return (
    <Select defaultValue="active">
      <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="active">Active</SelectItem>
        <SelectItem value="inactive">Inactive</SelectItem>
        <SelectItem value="pending">Pending</SelectItem>
      </SelectContent>
    </Select>
  )
}
```

#### Combobox
**When to use:** Searchable dropdown (user selection, team selection, country picker)
**When NOT:** Simple list; use Select. Boolean; use Checkbox. Multiple selection only; use separate component
**Key props:** Uses Command + Popover together
**Accessibility:** ARIA combobox role, keyboard search, arrow navigation
**Composition example:**
```tsx
import { Combobox } from "@/components/ui/combobox"

// Pre-built combobox or custom using Command + Popover:
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

export function UserCombobox() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">Select user...</Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search users..." />
          <CommandEmpty>No user found.</CommandEmpty>
          <CommandGroup>
            <CommandItem value="alice" onSelect={() => { setValue("alice"); setOpen(false) }}>Alice</CommandItem>
            <CommandItem value="bob" onSelect={() => { setValue("bob"); setOpen(false) }}>Bob</CommandItem>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

#### Command
**When to use:** Command palettes, command menus, searchable lists
**When NOT:** Simple navigation; use Nav. Static list; use Select
**Key props:** `value`, `onValueChange`, `filter` (search algorithm)
**Accessibility:** ARIA listbox role, keyboard search
**Composition example:**
```tsx
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"

export function CommandPalette() {
  return (
    <Command>
      <CommandInput placeholder="Type a command..." />
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandGroup heading="Navigation">
        <CommandItem>Dashboard</CommandItem>
        <CommandItem>Settings</CommandItem>
      </CommandGroup>
      <CommandGroup heading="Actions">
        <CommandItem>New Job</CommandItem>
        <CommandItem>Upload Resume</CommandItem>
      </CommandGroup>
    </Command>
  )
}
```

#### Form (React Hook Form integration)
**When to use:** Complex forms with validation, multi-field forms
**When NOT:** Single field; use Input directly. Static form; use plain HTML
**Key props:** Uses `useForm()` hook, `FormField`, `FormControl`, `FormMessage`
**Accessibility:** Built-in label associations, error messages linked via ARIA
**Composition example:**
```tsx
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useForm } from "react-hook-form"
import { z } from "zod"

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export function LoginForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl><Input {...field} type="email" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField name="password" render={({ field }) => (
          <FormItem>
            <FormLabel>Password</FormLabel>
            <FormControl><Input {...field} type="password" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit">Login</Button>
      </form>
    </Form>
  )
}
```

#### Slider
**When to use:** Numeric range input (confidence threshold, page number, volume control)
**When NOT:** Exact values; use Input. Binary; use Switch
**Key props:** `value`, `onValueChange`, `min`, `max`, `step`
**Accessibility:** ARIA slider role, keyboard support (arrow keys)
**Composition example:**
```tsx
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"

export function ConfidenceThreshold() {
  const [value, setValue] = useState([50])
  return (
    <div className="space-y-4">
      <Label>Minimum Confidence: {value[0]}%</Label>
      <Slider min={0} max={100} step={5} value={value} onValueChange={setValue} />
    </div>
  )
}
```

#### InputOTP
**When to use:** One-Time Password input, 2FA verification, code entry
**When NOT:** General text input; use Input. Password field; use Input type="password"
**Key props:** `value`, `onChange`, `maxLength`
**Accessibility:** Auto-focus next field, ARIA input role
**Composition example:**
```tsx
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

export function OTPVerification() {
  const [otp, setOtp] = useState("")
  return (
    <InputOTP maxLength={6} value={otp} onChange={setOtp}>
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  )
}
```

### 3. DATA DISPLAY COMPONENTS

#### Card
**When to use:** Container for grouped content (dashboard panels, result cards, settings sections)
**When NOT:** Single buttons or minimal spacing; use `<div>` with Tailwind. Whole page layout; use Sidebar
**Key props:** `className` for custom styling
**Accessibility:** Semantic `<div>` with proper heading structure inside
**Composition example:**
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"

export function StatsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue</CardTitle>
        <CardDescription>Total revenue this month</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">$45,231</p>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">+12% from last month</p>
      </CardFooter>
    </Card>
  )
}
```

#### Table
**When to use:** Tabular data (usage logs, audit trail, simple lists)
**When NOT:** Large datasets (100+ rows); use DataTable. Complex interactions; use DataTable
**Key props:** Semantic structure with `TableHeader`, `TableBody`, `TableRow`, `TableCell`
**Accessibility:** `<table>` semantic HTML, `<thead>` for headers
**Composition example:**
```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"

export function UsageLog() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Credits</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>2026-04-04</TableCell>
          <TableCell>Resume ranking</TableCell>
          <TableCell>-10</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}
```

#### DataTable
**When to use:** Large paginated, sortable, filterable datasets (users, resumes, payments)
**When NOT:** Simple tables; use Table. Static data; use Table
**Key props:** Uses TanStack React Table, requires column definitions
**Accessibility:** Semantic table, sortable headers, pagination controls
**Composition example:**
```tsx
import { DataTable } from "@/components/ui/data-table"
import { ColumnDef } from "@tanstack/react-table"

interface User { id: string; name: string; email: string; status: "active" | "inactive" }

const columns: ColumnDef<User>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "status", header: "Status" },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon">⋮</Button></DropdownMenuTrigger>
        <DropdownMenuContent><DropdownMenuItem>Edit</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]

export function UsersTable({ data }: { data: User[] }) {
  return <DataTable columns={columns} data={data} />
}
```

#### Pagination
**When to use:** Navigate large datasets (10 items/page, 100+ total), user-friendly page nav
**When NOT:** Single page of data; remove pagination. Infinite scroll; use scroll event handler
**Key props:** `page`, `onPageChange`, `total`, `pageSize`
**Accessibility:** Previous/Next buttons, page numbers as buttons
**Composition example:**
```tsx
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"

export function PaginationNav() {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
        <PaginationItem><PaginationLink href="#">1</PaginationLink></PaginationItem>
        <PaginationItem><PaginationLink href="#">2</PaginationLink></PaginationItem>
        <PaginationItem><PaginationLink href="#">3</PaginationLink></PaginationItem>
        <PaginationItem><PaginationEllipsis /></PaginationItem>
        <PaginationItem><PaginationNext href="#" /></PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
```

#### Badge
**When to use:** Labels, tags, status indicators (plan: Pro, status: Active, priority: High)
**When NOT:** Primary action; use Button. Toggles; use Checkbox or Switch
**Key props:** `variant` ("default" | "secondary" | "destructive" | "outline")
**Accessibility:** Semantic `<div>` or `<span>`
**Composition example:**
```tsx
import { Badge } from "@/components/ui/badge"

export function StatusBadges() {
  return (
    <div className="flex gap-2">
      <Badge>Active</Badge>
      <Badge variant="secondary">Pending</Badge>
      <Badge variant="destructive">Failed</Badge>
      <Badge variant="outline">Draft</Badge>
    </div>
  )
}
```

#### Avatar
**When to use:** User profile pictures, author images, team member avatars
**When NOT:** Brand logo; use `<img>`. Icon; use Icon component
**Key props:** `src`, `alt` (image), `fallback` (initials or default)
**Accessibility:** `<img>` alt text when using image, semantic fallback
**Composition example:**
```tsx
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

export function UserAvatar({ name, imageUrl }: { name: string; imageUrl?: string }) {
  return (
    <Avatar>
      <AvatarImage src={imageUrl} alt={name} />
      <AvatarFallback>{name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
    </Avatar>
  )
}
```

#### Alert
**When to use:** Non-dismissible warnings, info messages, system alerts, required field notices
**When NOT:** Temporary notifications; use Toast. Dismissible alerts; use AlertDialog
**Key props:** `variant` ("default" | "destructive"), custom icons
**Accessibility:** ARIA alert role, semantic heading
**Composition example:**
```tsx
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle, Info } from "lucide-react"

export function AlertExamples() {
  return (
    <>
      <Alert><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>Your API key is invalid</AlertDescription></Alert>
      <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Critical</AlertTitle><AlertDescription>Service will be down for maintenance</AlertDescription></Alert>
      <Alert><Info className="h-4 w-4" /><AlertTitle>Info</AlertTitle><AlertDescription>New features available</AlertDescription></Alert>
    </>
  )
}
```

#### Progress
**When to use:** Upload progress, file processing status, loading bar, progress indication
**When NOT:** Skeleton loading; use Skeleton. Indeterminate loading; use Spinner/Loader
**Key props:** `value` (0-100), `max` (default 100)
**Accessibility:** ARIA progressbar role, aria-valuenow
**Composition example:**
```tsx
import { Progress } from "@/components/ui/progress"
import { useState } from "react"

export function UploadProgress() {
  const [progress, setProgress] = useState(0)
  return (
    <div className="space-y-2">
      <p>Upload Progress: {progress}%</p>
      <Progress value={progress} className="w-full" />
    </div>
  )
}
```

#### Skeleton
**When to use:** Loading placeholders (before data fetches), skeleton screens
**When NOT:** Permanent UI; add real content. Animated loading; use Spinner
**Key props:** `className` for sizing and layout
**Accessibility:** No ARIA needed (temporary placeholder)
**Composition example:**
```tsx
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardHeader, CardContent } from "@/components/ui/card"

export function CardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48 mt-2" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </CardContent>
    </Card>
  )
}
```

#### Chart
**When to use:** Visualize metrics (admin dashboard stats, revenue charts, user analytics)
**When NOT:** Static data; use Table. Interactive graphs only; consider dedicated lib
**Key props:** Uses Recharts components, `ChartContainer`, `ChartLegend`, `ChartTooltip`
**Accessibility:** Text summary of data, alt text for chart image
**Composition example:**
```tsx
import { ChartContainer, ChartTooltip, ChartLegend } from "@/components/ui/chart"
import { BarChart, Bar, XAxis, YAxis } from "recharts"

const data = [{ month: "Jan", revenue: 1200 }, { month: "Feb", revenue: 1900 }]

export function RevenueChart() {
  return (
    <ChartContainer config={{}} className="h-[300px] w-full">
      <BarChart data={data}>
        <XAxis dataKey="month" />
        <YAxis />
        <ChartTooltip />
        <ChartLegend />
        <Bar dataKey="revenue" fill="#3b82f6" />
      </BarChart>
    </ChartContainer>
  )
}
```

#### Carousel
**When to use:** Image galleries, testimonial rotation, product showcases
**When NOT:** Page navigation; use Tabs. Single image; use `<img>`
**Key props:** Uses Embla Carousel library, `orientation` ("horizontal" | "vertical")
**Accessibility:** Keyboard navigation (arrow keys), ARIA carousel role
**Composition example:**
```tsx
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"

export function ImageCarousel() {
  return (
    <Carousel className="w-full max-w-sm">
      <CarouselContent>
        <CarouselItem><img src="/image1.jpg" alt="Slide 1" /></CarouselItem>
        <CarouselItem><img src="/image2.jpg" alt="Slide 2" /></CarouselItem>
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  )
}
```

### 4. DIALOG & OVERLAY COMPONENTS

#### Dialog
**When to use:** Modal forms, confirmations, alerts that require user action
**When NOT:** Context menu; use DropdownMenu. Sidebar; use Drawer or Sidebar. Alert only; use AlertDialog
**Key props:** `open`, `onOpenChange`
**Accessibility:** Focus trapped, Esc closes, backdrop click closes
**Composition example:**
```tsx
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export function CreateJobDialog() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>New Job</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Job</DialogTitle>
          <DialogDescription>Paste the job description to get started</DialogDescription>
        </DialogHeader>
        {/* Form content */}
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

#### AlertDialog
**When to use:** Destructive action confirmation (delete job, ban user, permanent action)
**When NOT:** Non-destructive actions; use Dialog. Info only; use Alert
**Key props:** `open`, `onOpenChange`
**Accessibility:** Focus on cancel button, clear destructive action labels
**Composition example:**
```tsx
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"

export function DeleteJobConfirm() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="destructive">Delete Job</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone. All resumes and results will be deleted.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

#### Drawer
**When to use:** Mobile-friendly sidebar alternatives, side panels on mobile, drawer nav
**When NOT:** Desktop UI; use Dialog. Permanent sidebar; use Sidebar
**Key props:** `open`, `onOpenChange`, `side` ("left" | "right" | "top" | "bottom")
**Accessibility:** Focus trap, Esc closes, touch-friendly
**Composition example:**
```tsx
import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer"

export function MobileMenu() {
  const isMobile = useIsMobile()
  if (!isMobile) return null

  return (
    <Drawer>
      <DrawerTrigger asChild><Button variant="ghost" size="icon">☰</Button></DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Menu</DrawerTitle>
        </DrawerHeader>
        {/* Menu items */}
      </DrawerContent>
    </Drawer>
  )
}
```

#### Popover
**When to use:** Floating UI panels (date picker, user menu, popovers, inline editing)
**When NOT:** Large modal; use Dialog. Context menu; use ContextMenu. Alert; use AlertDialog
**Key props:** `open`, `onOpenChange`, `side` ("top" | "right" | "bottom" | "left")
**Accessibility:** Click outside closes, Esc closes, focus management
**Composition example:**
```tsx
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

export function SettingsPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">⚙️</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-4">
          <h4 className="font-medium">Settings</h4>
          {/* Settings form */}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

#### Sheet
**When to use:** Fixed-position side panels, keyboard shortcuts panel, filters sidebar
**When NOT:** Modal dialog; use Dialog. Floating menu; use Popover
**Key props:** `open`, `onOpenChange`, `side` ("left" | "right" | "top" | "bottom")
**Accessibility:** Focus trap, Esc closes
**Composition example:**
```tsx
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

export function KeyboardShortcuts() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button variant="ghost">Keyboard Shortcuts (?)</Button></SheetTrigger>
      <SheetContent side="right" className="w-[400px]">
        <SheetHeader><SheetTitle>Keyboard Shortcuts</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-4">
          <div><kbd>Cmd + K</kbd> - Search</div>
          <div><kbd>Cmd + /</kbd> - Help</div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

#### Tooltip
**When to use:** Hover hints (icon explanations, disabled button reasons, keyboard shortcuts)
**When NOT:** Critical information (not keyboard-accessible). Long content; use Popover
**Key props:** `content`, `side`, `delayDuration`
**Accessibility:** Not keyboard-accessible by default; consider Popover for important info
**Composition example:**
```tsx
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"

export function HelpIcon() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><button className="text-muted-foreground">?</button></TooltipTrigger>
        <TooltipContent>This helps you do X. Press Cmd+Shift+X for more.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

#### HoverCard
**When to use:** Rich content on hover (user profile preview on mention, product preview)
**When NOT:** Simple tooltip; use Tooltip. User interaction required; use Dialog
**Key props:** `open`, `onOpenChange`, `side`
**Accessibility:** Keyboard accessible via Tab, similar to Popover
**Composition example:**
```tsx
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

export function UserHoverCard({ userId, userName }: { userId: string; userName: string }) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild><a href={`/users/${userId}`} className="cursor-pointer underline">{userName}</a></HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="flex gap-4">
          <Avatar><AvatarFallback>{userName[0]}</AvatarFallback></Avatar>
          <div><p className="font-medium">{userName}</p><p className="text-sm text-muted-foreground">Pro Member</p></div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
```

### 5. UTILITY & LAYOUT COMPONENTS

#### Separator
**When to use:** Visual dividers (between sections, menu items, form sections)
**When NOT:** Borders; use border-t/border-b. Major layout divider; use separate section
**Key props:** `orientation` ("horizontal" | "vertical"), `decorative` (ARIA)
**Accessibility:** Semantic `<hr>` when appropriate
**Composition example:**
```tsx
import { Separator } from "@/components/ui/separator"

export function FormSection() {
  return (
    <div>
      <h3>Personal Info</h3>
      <Separator className="my-4" />
      <h3>Contact Info</h3>
    </div>
  )
}
```

#### ScrollArea
**When to use:** Scrollable containers with custom scrollbars (sidebars, tables, lists)
**When NOT:** Entire page (use browser scroll). No overflow content
**Key props:** `className` for sizing
**Accessibility:** Keyboard scrolling, mouse wheel support
**Composition example:**
```tsx
import { ScrollArea } from "@/components/ui/scroll-area"

export function JobList() {
  return (
    <ScrollArea className="h-[400px] w-full border rounded-md p-4">
      {/* Long list of items */}
      {jobs.map(job => <div key={job.id}>{job.title}</div>)}
    </ScrollArea>
  )
}
```

#### AspectRatio
**When to use:** Maintain aspect ratio (16:9 for videos, 1:1 for images, 4:3 for thumbnails)
**When NOT:** Image only; let browser handle. Text content; causes layout issues
**Key props:** `ratio` (16/9, 1, 4/3, etc.)
**Accessibility:** Content inside must be accessible (e.g., img with alt)
**Composition example:**
```tsx
import { AspectRatio } from "@/components/ui/aspect-ratio"

export function VideoEmbed() {
  return (
    <AspectRatio ratio={16 / 9} className="bg-black rounded-lg overflow-hidden">
      <iframe src="https://youtube.com/embed/..." width="100%" height="100%" allowFullScreen />
    </AspectRatio>
  )
}
```

#### Collapsible
**When to use:** Expandable sections (advanced filters, FAQ, settings groups)
**When NOT:** Single action; use Button. Accordion with multiple open; use custom or Accordion
**Key props:** `open`, `onOpenChange`
**Accessibility:** ARIA button role, keyboard support (Enter/Space)
**Composition example:**
```tsx
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"

export function AdvancedFilters() {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost">Show Advanced Filters</Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 mt-2">
        <div>Filter 1</div>
        <div>Filter 2</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
```

#### Calendar & DatePicker
**When to use:** Date selection (filter by date range, select publish date, birthday input)
**When NOT:** Simple date input; use Input type="date". Complex scheduling; use dedicated component
**Key props:** Uses `react-day-picker`, `disabled`, `selected`
**Accessibility:** Keyboard navigation (arrow keys), ARIA calendar role
**Composition example:**
```tsx
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { useState } from "react"

export function DatePickerDemo() {
  const [date, setDate] = useState<Date>()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">{date ? date.toDateString() : "Pick a date"}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={date} onSelect={setDate} />
      </PopoverContent>
    </Popover>
  )
}
```

#### ResizablePanel
**When to use:** Split panels (resizable editor, draggable pane dividers)
**When NOT:** Static layout; use CSS Grid. Mobile UI; may not work well on touch
**Key props:** `defaultSize`, `minSize`, `maxSize`
**Accessibility:** Keyboard support for resize (arrow keys)
**Composition example:**
```tsx
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"

export function SplitView() {
  return (
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel defaultSize={50}><div className="p-4">Left Panel</div></ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}><div className="p-4">Right Panel</div></ResizablePanel>
    </ResizablePanelGroup>
  )
}
```

---

## Theming & Customization

### CSS Variables for Theming
shadcn/ui uses CSS variables for theming. Override in `globals.css` or your main CSS file:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.6%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.6%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 0 0% 3.6%;
    --foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%;
    --secondary-foreground: 0 0% 98%;
    --destructive: 0 72.2% 50.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --ring: 0 0% 83.3%;
  }
}
```

### The `cn()` Utility
All shadcn/ui components use the `cn()` utility to merge Tailwind classes safely:

```tsx
// From @/lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Use for conditional styling:
```tsx
<Button className={cn(
  "px-4",
  isLoading && "opacity-50 cursor-not-allowed",
  variant === "danger" && "bg-red-600"
)}>
  Click
</Button>
```

### Custom Component Variants
Never modify component source files. Wrap components in your own variants:

```tsx
import { Button as ShadcnButton, type ButtonProps } from "@/components/ui/button"

export function PrimaryButton({ children, ...props }: ButtonProps) {
  return (
    <ShadcnButton
      className={cn("bg-blue-600 hover:bg-blue-700", props.className)}
      {...props}
    >
      {children}
    </ShadcnButton>
  )
}
```

---

## shadcn/ui Blocks

"Blocks" are copy-paste page layouts (not individual components). Available at [ui.shadcn.com/blocks](https://ui.shadcn.com/blocks):

- **Dashboard Layouts:** Sidebar + header + stats cards + charts + data table (dashboard-01 through dashboard-07)
- **Authentication Pages:** Sign in, sign up, forgot password, reset password, OTP verification
- **Settings Pages:** Profile, notifications, billing, security, appearance tabs (settings-01, settings-02)
- **Marketing Sections:** Hero, features, pricing, testimonials, CTA, footer
- **Data Tables:** Sortable, filterable, paginated tables with column visibility
- **Forms:** Contact form, newsletter signup, search form, filter form
- **Cards:** Feature cards, pricing cards, testimonial cards, stat cards
- **Navigation:** Sidebar navigation, top navigation, footer navigation
- **Modals & Dialogs:** Feature announcements, confirmation dialogs, modal forms
- **Lists & Menus:** Resource lists, navigation menus, dropdown menus

Browse blocks and copy code directly into your project.

---

## Composition Patterns

### Dialog + Form Pattern
**Use case:** Creating, editing, or filtering data

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild><Button>New Item</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader><DialogTitle>Create Item</DialogTitle></DialogHeader>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField name="title" render={({ field }) => (
          <FormItem>
            <FormLabel>Title</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl><Textarea {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={isLoading}>{isLoading ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </form>
    </Form>
  </DialogContent>
</Dialog>
```

### DataTable + DropdownMenu Pattern
**Use case:** Row actions in paginated tables

```tsx
const columns: ColumnDef<User>[] = [
  { accessorKey: "name", header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "role", header: "Role" },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => editRow(row.original)}>Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-600" onClick={() => deleteRow(row.original.id)}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
```

### Tabs + Form Pattern
**Use case:** Multi-section settings or multi-step forms

```tsx
<Tabs defaultValue="general" className="w-full">
  <TabsList className="grid w-full grid-cols-3">
    <TabsTrigger value="general">General</TabsTrigger>
    <TabsTrigger value="advanced">Advanced</TabsTrigger>
    <TabsTrigger value="security">Security</TabsTrigger>
  </TabsList>

  <TabsContent value="general">
    <Card>
      <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
      <CardContent><Form {...generalForm}>General settings form</Form></CardContent>
    </Card>
  </TabsContent>

  <TabsContent value="advanced">
    <Card>
      <CardHeader><CardTitle>Advanced Settings</CardTitle></CardHeader>
      <CardContent><Form {...advancedForm}>Advanced settings form</Form></CardContent>
    </Card>
  </TabsContent>
</Tabs>
```

### Command Palette Pattern
**Use case:** Global search and command execution (Cmd+K)

```tsx
export function CommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <Command shouldFilter>
          <CommandInput placeholder="Search actions..." />
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => { navigate("/"); setOpen(false) }}>Dashboard</CommandItem>
            <CommandItem onSelect={() => { navigate("/settings"); setOpen(false) }}>Settings</CommandItem>
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => { createJob(); setOpen(false) }}>New Job</CommandItem>
            <CommandItem onSelect={() => { uploadResume(); setOpen(false) }}>Upload Resume</CommandItem>
          </CommandGroup>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
```

### Sidebar + Main Content Pattern
**Use case:** Dashboard layouts with navigation

```tsx
<div className="flex h-screen">
  <Sidebar className="w-64 border-r">
    <SidebarContent>
      <SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton asChild><Link to="/dashboard">Dashboard</Link></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton asChild><Link to="/jobs">Jobs</Link></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu>
    </SidebarContent>
  </Sidebar>
  <main className="flex-1 flex flex-col">
    <header className="border-b h-14 flex items-center px-6"><AppHeader /></header>
    <div className="flex-1 overflow-auto p-6">{/* Page content */}</div>
  </main>
</div>
```

---

## Common Mistakes to Avoid

1. **Using Dialog when you should use AlertDialog**
   - AlertDialog is for destructive confirmations (delete, ban, cancel)
   - Dialog is for informational or non-destructive modals
   - Incorrect: `<Dialog>Are you sure?</Dialog>` with destructive action
   - Correct: `<AlertDialog><AlertDialogTitle>Are you sure?</AlertDialogTitle>...</AlertDialog>`

2. **Using Select for fewer than 5 options**
   - RadioGroup provides better UX for small sets
   - Incorrect: `<Select><SelectItem>Option 1</SelectItem><SelectItem>Option 2</SelectItem></Select>`
   - Correct: `<RadioGroup><RadioGroupItem>Option 1</RadioGroupItem><RadioGroupItem>Option 2</RadioGroupItem></RadioGroup>`

3. **Using Tooltip for critical information**
   - Tooltips are not keyboard-accessible
   - Use Popover or inline text for important info
   - Incorrect: `<Tooltip><p>You must have 10 credits</p></Tooltip>` on disabled button
   - Correct: Use `<FormDescription>` or `<AlertDescription>` inline

4. **Forgetting Label associations with Input**
   - Always link labels via `htmlFor` and input `id`
   - Incorrect: `<Label>Email</Label><Input type="email" />`
   - Correct: `<Label htmlFor="email">Email</Label><Input id="email" type="email" />`

5. **Overriding component source files**
   - Never edit files in `src/components/ui/`
   - Create wrapper components instead
   - Incorrect: Edit `src/components/ui/button.tsx` directly
   - Correct: Create `src/components/CustomButton.tsx` that wraps Button

6. **Using cn() ineffectively**
   - cn() prevents Tailwind class conflicts
   - Incorrect: `className={"px-4 px-8"}` (px-4 ignored)
   - Correct: `className={cn("px-4", condition && "px-8")}`

7. **Not using DataTable for 100+ rows**
   - Table component renders all rows (performance issue)
   - Use DataTable with TanStack React Table for pagination
   - Incorrect: `<Table>{allUsers.map(u => <TableRow>...</TableRow>)}</Table>` with 1000 users
   - Correct: `<DataTable columns={columns} data={allUsers} />`

8. **Dialog without onOpenChange**
   - Always manage dialog state explicitly
   - Incorrect: `<Dialog><DialogTrigger>Open</DialogTrigger>...</Dialog>` (no state management)
   - Correct: `<Dialog open={open} onOpenChange={setOpen}>...</Dialog>`

9. **Using Breadcrumb for page flow**
   - Breadcrumbs show hierarchy, not navigation flow
   - Use Breadcrumb for location context only
   - Incorrect: Breadcrumb: Home > Step 1 > Step 2 > Step 3 (use Stepper instead)
   - Correct: Breadcrumb: Home > Admin > Users > John Doe

10. **Not testing dark mode**
    - shadcn/ui supports dark mode via CSS variables
    - Test all components in dark mode before shipping
    - Incorrect: Assuming light-mode colors work in dark mode
    - Correct: Test with `className="dark"` on parent and verify contrast

---

## Accessibility Guarantees

All shadcn/ui components are built on Radix UI, which provides:

- **Keyboard navigation:** Tab for focus, arrow keys for menu/list navigation, Enter/Space for activation
- **Screen reader support:** Proper ARIA attributes, semantic HTML, announced status
- **Focus management:** Auto-focus on dialogs, visible focus rings, trap focus in modals
- **Color contrast:** WCAG AA compliant by default
- **Mobile support:** Touch-friendly, responsive, no hover-only interactions

### Don't Break Accessibility
- Never change `role` attributes
- Never remove keyboard event handlers (onKeyDown, onKeyUp)
- Never hide focus indicators (don't remove `outline`)
- Always test with keyboard navigation (Tab, arrow keys, Enter)
- Always test with screen readers (VoiceOver on Mac, NVDA on Windows)
- Test responsive behavior on mobile devices

---

## Production Patterns

### Loading States with Buttons
```tsx
const [isLoading, setIsLoading] = useState(false)

<Button disabled={isLoading} onClick={async () => {
  setIsLoading(true)
  try {
    await submitForm()
    toast.success("Saved!")
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Error occurred")
  } finally {
    setIsLoading(false)
  }
}}>
  {isLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : null}
  {isLoading ? "Saving..." : "Save"}
</Button>
```

### Error Display in Forms
```tsx
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField name="email" render={({ field }) => (
      <FormItem>
        <FormLabel>Email</FormLabel>
        <FormControl><Input {...field} /></FormControl>
        <FormMessage /> {/* Auto-displays validation errors */}
      </FormItem>
    )} />
    {form.formState.isSubmitting && <Alert><AlertDescription>Submitting...</AlertDescription></Alert>}
  </form>
</Form>
```

### Responsive Dialog/Drawer
```tsx
import { useIsMobile } from "@/hooks/use-mobile"

export function ResponsiveDialog() {
  const isMobile = useIsMobile()

  if (isMobile) {
    return <Drawer open={open} onOpenChange={setOpen}>{/* drawer content */}</Drawer>
  }

  return <Dialog open={open} onOpenChange={setOpen}>{/* dialog content */}</Dialog>
}
```

### Optimistic UI with Toast
```tsx
const [items, setItems] = useState(initialItems)

const handleDelete = async (id: string) => {
  const previousItems = items
  setItems(prev => prev.filter(item => item.id !== id))
  toast.success("Item deleted")

  try {
    await deleteItemAPI(id)
  } catch (error) {
    setItems(previousItems)
    toast.error("Failed to delete. Changes reverted.")
  }
}
```

---

## Sources & Further Reading

- [shadcn/ui Documentation](https://ui.shadcn.com/docs) - Official docs
- [shadcn/ui Components](https://ui.shadcn.com/docs/components) - All component docs
- [shadcn/ui Blocks](https://ui.shadcn.com/blocks) - Pre-built layouts
- [Radix UI Primitives](https://www.radix-ui.com/primitives/overview/introduction) - Foundation
- [Tailwind CSS Documentation](https://tailwindcss.com/docs) - Styling
- [React Hook Form Documentation](https://react-hook-form.com/) - Form handling
- [TanStack React Table](https://tanstack.com/table/v8) - Data tables
- [Recharts Documentation](https://recharts.org/) - Charts
- [Embla Carousel](https://www.embla-carousel.com/) - Carousels
