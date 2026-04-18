# SaaS Information Architecture — Strict Separation Rules

**Created:** 2026-04-18, v1.0.
**Authority:** Vega (enforces on every design review). pod-a-frontend, pod-b-frontend, pod-c-frontend, pixel ALL load this.
**Reason:** Current SaaS builds show the same page in multiple places (sidebar + settings menu). That's amateur-hour IA. Every Boldteq product MUST pass this separation audit before Bolt deploys.

---

## The 4 navigation surfaces (and what belongs where)

Every Boldteq SaaS has exactly **4 navigation surfaces**. Each has a strict, non-overlapping scope. A page appears in EXACTLY ONE surface. No duplication.

### Surface 1 — Sidebar (primary workspace operations)
**What belongs:** The things a user DOES every day inside this workspace.
- Dashboard / Overview (landing page after login)
- Core domain objects (Resumes, Jobs, Orders, Campaigns, Stores, Projects — whatever the product's nouns are)
- Analytics / Reports (about workspace data)
- Integrations status (read-only health of connected apps)
- Domain-specific workflows (e.g., "Screen candidates", "Run audit", "Build chart")

**What DOES NOT belong here:**
- ❌ Settings (that's Surface 2)
- ❌ Account management (that's Surface 3)
- ❌ Billing (that's Surface 2 or Surface 3 depending on billing model)
- ❌ "Users" or "Team" management (that's Surface 2)
- ❌ Help / docs (that's Surface 4)
- ❌ Notifications center (that's Surface 4)

### Surface 2 — Settings (workspace configuration)
**URL pattern:** `/settings/*` or `/w/<workspace>/settings/*`
**Entry point:** Gear icon in top bar OR last link in sidebar (NEVER both).
**What belongs:** Things about THIS WORKSPACE that you configure occasionally, not daily.

Standard tabs (in this order):
1. **General** — workspace name, logo, default timezone, locale
2. **Team** — members, roles, invites, permissions
3. **Billing** — plan, invoices, payment method (ONLY if workspace-scoped billing; else see Surface 3)
4. **Integrations** — connected apps + API keys + webhooks (configuring; health is Surface 1)
5. **Appearance** — theme override, brand colors (if multi-tenant white-label)
6. **Advanced** — data export, workspace deletion, danger zone

### Surface 3 — Account menu (user-scoped, cross-workspace)
**Entry point:** Top-right avatar dropdown. Always.
**What belongs:** Things about THE USER, not the workspace.

Menu items (in this order):
1. **Profile** — name, email, avatar, personal timezone
2. **Security** — password, 2FA, active sessions, API tokens (user-scoped)
3. **Notifications** — email prefs, notification channels (user-scoped)
4. **Billing** — ONLY if user-scoped billing (per-seat across workspaces)
5. **Divider**
6. **Workspace switcher** (see § Agency/Multi-tenant pattern below)
7. **Divider**
8. **Help & Docs** (links to Surface 4)
9. **Sign out**

### Surface 4 — Global utilities (top bar, non-menu)
- Search (Cmd+K) — global across workspace
- Notifications bell — dropdown with unread count
- Help (?) — help center + chat
- Workspace switcher — when present, top-LEFT not top-right (see pattern below)

---

## The No-Duplication Rule (enforce on every review)

A single concept MUST NOT appear in two surfaces. Common mistakes:

| Concept | WRONG (duplicates) | RIGHT |
|---|---|---|
| Team members | Sidebar "Users" AND Settings > Team | Only Settings > Team |
| Billing | Sidebar "Billing" AND Settings > Billing AND Account > Billing | Only ONE — usually Settings > Billing (workspace-scoped) |
| API keys | Sidebar "Developers" AND Settings > Integrations | Only Settings > Integrations (workspace keys) or Account > Security (user tokens) — pick by scope |
| Profile | Settings > Profile AND Account > Profile | Only Account > Profile (user-scoped) |
| Audit logs | Sidebar "Logs" AND Settings > Audit | Only Settings > Advanced > Audit logs (workspace data, not daily-use) |
| Notifications center | Top bar bell AND sidebar "Inbox" | Only top bar bell |

**Audit script** (Vega runs this before approval):
```bash
# Find duplicated route targets in sidebar vs settings vs account menu
grep -rE 'href="/[a-z-]+' app/components/sidebar.tsx app/components/settings-nav.tsx app/components/user-menu.tsx \
  | awk -F'"' '{print $2}' | sort | uniq -c | awk '$1 > 1'
# Expect: empty output (no duplicates)
```

---

## Decision tree: where does X live?

When building a new page, run this check:

```
Is it a daily-use workflow action? → Sidebar
  ↓ no
Is it configuring the workspace? → Settings
  ↓ no
Is it about the individual user (cross-workspace)? → Account menu
  ↓ no
Is it a global utility (search/notif/help)? → Top bar
  ↓ no
Reconsider — it probably doesn't belong in navigation at all. Inline link from the relevant page.
```

If unsure, the default is **Settings**. Sidebars stay lean.

---

## Sidebar composition rules

- **Max items:** 7 primary + divider + 2-3 secondary (e.g., Integrations health, Admin panel link)
- **No nesting > 1 level.** If you have submenus, reconsider grouping.
- **Dashboard / Overview is ALWAYS the first item.**
- **Active state:** `bg-accent text-accent-foreground` (Stack A) or `<PolarisNavigationSectionItem selected>` (Stack B)
- **Group by noun, not verb.** "Resumes" not "Screen Candidates". The action is implicit from the page you land on.

### Stack A sidebar reference (shadcn/ui)
```tsx
<Sidebar>
  <SidebarHeader>
    <WorkspaceSwitcher />   {/* only if multi-tenant/agency mode */}
  </SidebarHeader>
  <SidebarContent>
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem href="/">Dashboard</SidebarMenuItem>
        <SidebarMenuItem href="/resumes">Resumes</SidebarMenuItem>
        <SidebarMenuItem href="/jobs">Jobs</SidebarMenuItem>
        <SidebarMenuItem href="/analytics">Analytics</SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
    <SidebarSeparator />
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem href="/integrations">Integrations</SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  </SidebarContent>
  <SidebarFooter>
    <SidebarMenuItem href="/settings">Settings</SidebarMenuItem>
    <UserMenu />
  </SidebarFooter>
</Sidebar>
```

---

## Agency / Multi-tenant workspace switcher

### When you need it
Boldteq products run in 3 modes:

| Mode | Single workspace | Multi-tenant | Agency |
|---|---|---|---|
| Who uses | Solo user, one workspace | Users in teams with workspaces | Boldteq partners managing N client workspaces |
| Switcher needed? | NO | YES (switch between their workspaces) | YES (switch between client workspaces + agency admin view) |
| Default for new Boldteq product | — | — | Multi-tenant unless product-specific reason |

Rex/Arya set `saas_mode: 'single' | 'multi-tenant' | 'agency'` in the project CLAUDE.md. Pod frontends read this and scaffold the right shell.

### Workspace switcher placement
**Top-LEFT of the sidebar header.** NOT in the account menu. Reasons:
1. Workspace context defines everything on screen — it must be visually anchored with the rest of workspace UX (sidebar)
2. Account menu is for user-level actions that span workspaces — switcher changes workspace context, it's not a user action
3. Every major SaaS with this pattern places it top-left: Linear, Notion, Slack, Shopify Partners

### Switcher component pattern (Stack A)

```tsx
<WorkspaceSwitcher>
  <SwitcherTrigger>
    <WorkspaceAvatar src={current.logo} />
    <span>{current.name}</span>
    <ChevronsUpDown size={14} />
  </SwitcherTrigger>
  <SwitcherDropdown>
    <SwitcherHeader>Switch workspace</SwitcherHeader>
    {workspaces.map(w => (
      <SwitcherItem key={w.id} onSelect={() => switchTo(w.id)}>
        <WorkspaceAvatar src={w.logo} />
        <span>{w.name}</span>
        {w.id === current.id && <CheckIcon />}
      </SwitcherItem>
    ))}
    <SwitcherDivider />
    <SwitcherItem href="/workspaces/new" icon={<PlusIcon />}>
      Create workspace
    </SwitcherItem>
    {mode === 'agency' && (
      <SwitcherItem href="/agency" icon={<BuildingIcon />}>
        Agency admin
      </SwitcherItem>
    )}
  </SwitcherDropdown>
</WorkspaceSwitcher>
```

### URL structure (REQUIRED for multi-tenant/agency)
- `/w/<workspace-slug>/...` — every workspace-scoped URL
- `/account/...` — user-scoped (Profile, Security)
- `/agency/...` — agency-owner-only (ONLY in agency mode)
- `/` → redirect to last visited workspace OR workspace picker if multiple

Routing middleware (Stack A Next.js):
```ts
// middleware.ts — every request
// 1. Authenticate user
// 2. Resolve workspace slug from URL
// 3. Verify user has access to that workspace (membership check)
// 4. Inject workspace context into RSC via headers/cookies
// 5. 404 if no access
```

### Agency mode — extra surface: Agency admin area
**URL:** `/agency/*`
**Access:** Only agency owner + agency team roles. Regular workspace members CANNOT see.
**Pages:**
- `/agency` — overview (total clients, revenue, active users)
- `/agency/clients` — list of client workspaces, ability to impersonate, onboard new
- `/agency/billing` — consolidated billing (all client subscriptions Boldteq manages)
- `/agency/team` — agency team members (not end-client users)
- `/agency/white-label` — branding applied across client workspaces
- `/agency/reports` — cross-client analytics (with client privacy controls)

Agency admin is **NOT a workspace.** It's a meta-workspace that manages other workspaces. The switcher includes "Agency admin" as a special top-level entry (see § switcher component).

---

## Data model implications (for Dato / pod-X-db)

Multi-tenant + agency modes require:

```sql
-- Core tables
workspaces (id, slug, name, logo_url, owner_user_id, agency_id NULL, plan, created_at)
workspace_members (workspace_id, user_id, role enum('owner','admin','member','viewer'), invited_by, joined_at)
agencies (id, name, owner_user_id, created_at)
agency_clients (agency_id, workspace_id, onboarded_at, is_managed_billing bool)

-- On every workspace-scoped table, mandatory column:
-- workspace_id uuid REFERENCES workspaces(id) NOT NULL
-- + index on workspace_id
-- + RLS policy: "members of workspace_id can read/write"
```

RLS policy template (Stack A Supabase):
```sql
CREATE POLICY "workspace_members_all" ON <table>
FOR ALL TO authenticated
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid()
  )
);
```

Agency admin bypass (carefully scoped):
```sql
CREATE POLICY "agency_owner_read" ON <table>
FOR SELECT TO authenticated
USING (
  workspace_id IN (
    SELECT ac.workspace_id FROM agency_clients ac
    JOIN agencies a ON a.id = ac.agency_id
    WHERE a.owner_user_id = auth.uid() AND ac.is_managed_billing = true
  )
);
```

---

## Anti-patterns (NEVER do these)

1. **Never put the same concept in sidebar + settings.** Duplication = user confusion = support tickets.
2. **Never put workspace switcher in account menu.** It belongs top-LEFT sidebar header.
3. **Never collapse Settings > Team into the sidebar as "Users".** Team management is configuration, not daily work.
4. **Never put billing in sidebar.** It's not a daily-use workflow; it's configuration.
5. **Never put workspace-scoped features under `/account/`.** Account = user-global.
6. **Never omit the workspace slug from URLs in multi-tenant mode.** `/dashboard` is ambiguous; `/w/acme/dashboard` is not.
7. **Never let an agency owner see a client workspace's data without explicit impersonation.** Privacy + legal.
8. **Never show "Agency admin" in the switcher to non-agency users.** Role-scope the menu.
9. **Never ship more than 7 primary sidebar items.** If you need more, reconsider grouping.
10. **Never nest sidebar items more than 1 level.** Shallow navigation > deep hierarchy.
11. **Never skip RLS on workspace-scoped tables.** P0 tenant leakage risk.
12. **Never ship without the audit script passing** (no duplicates in sidebar/settings/account nav).

---

## Verification (Vega blocks deploy on any fail)

```bash
# 1. No duplicate href across nav surfaces
./scripts/audit-nav-duplicates.sh   # exits 1 on duplicates

# 2. Workspace slug in all workspace routes
grep -rE 'href="/[a-z]' app/ | grep -v '/w/' | grep -v '/account' | grep -v '/agency'
# Expect: only landing / auth / /api routes

# 3. RLS on every workspace-scoped table
psql $DATABASE_URL -f scripts/audit-rls.sql
# Expect: zero rows returned (all tables with workspace_id have policies)

# 4. Settings nav items match the standard 6 tabs (General, Team, Billing, Integrations, Appearance, Advanced)
grep -oE 'href="/settings/[a-z]+"' app/components/settings-nav.tsx | sort -u
# Compare against standard list
```

---

## Migration path (for existing products — Rankora, CROBOT)

Rankora/CROBOT are Stack A (Vite origin). Both likely have duplication (Yash's exact feedback). Migration:

1. Audit current navigation with `./scripts/audit-nav-duplicates.sh`
2. List duplications in a migration doc
3. For each duplication: pick the correct surface (per decision tree), remove from the other
4. Add workspace switcher if multi-tenant/agency mode applies (Rankora: likely yes; CROBOT: likely yes)
5. Reshape URL structure to `/w/<slug>/...`
6. Add RLS policies on any currently-leaky tables
7. Deploy behind feature flag; dogfood for 1 week
8. Remove old routes

Assign: koda (Stack A backend), pod-a-frontend (once hired in Cohort 3), dato (RLS), sage (review). Vega approves final shell.
