# Projects & Rules

## What Makes a Project

Polyglot discovers a directory as a project when it contains at least one of:
- `CLAUDE.md` file
- `.claude/` directory
- `package.json` file
- `pubspec.yaml` file

> **Info:** Hidden directories (starting with `.`) and `node_modules` are skipped automatically. A project folder named `.myapp` will never be discovered.

---

## Adding a New Project

### Step 1: Add the parent directory in Settings

1. Open `http://localhost:3847`
2. Click **Settings**
3. Add: `/Users/yashbaldha/Desktop/Boldteq App`
4. Save

Polyglot scans all subdirectories of configured paths. If your project is inside that folder, it appears automatically.

### Step 2: Create project `CLAUDE.md`

The project-level `CLAUDE.md` at the project root is read by Claude Code whenever that project is open. It supplements the global `~/.claude/CLAUDE.md` with project-specific context.

> **Caution:** `CLAUDE.md` must be named exactly in all caps and placed at the project root — not inside `.claude/` or any subdirectory. Claude Code will not find it otherwise.

**Required sections:**

```markdown
# [Project Name] — [Type: Shopify App / SaaS / API]

## Stack (Exact Versions)
- Framework: [name + version — be exact, not "React 18"]
- UI: [library + version]
- Auth: [how auth works]
- Database: [ORM + DB engine]
- Language: TypeScript strict mode — zero plain .js files
- Node: [minimum version]

## Folder Structure
\`\`\`
[actual top-level directories and key files]
\`\`\`

## Architecture Rules
1. [Rule — be explicit, e.g. "authenticate.admin(request) before every Shopify API call"]
2. ...

## Quality Gates
- npm run typecheck — zero errors
- [project-specific checks]
```

**Stack B (Shopify App) template:**

```markdown
# AppName — Shopify App

## Stack (Exact Versions)
- Framework: React Router 7 (`@shopify/shopify-app-react-router` v1) — NOT Remix
- UI: Shopify Polaris v13 — ONLY Polaris components for admin UI, never raw HTML
- Auth: `shopify.server.ts` → `authenticate.admin(request)` — before every Shopify API call
- Database: Prisma v6 + SQLite (dev) / PostgreSQL (prod)
- Language: TypeScript everywhere
- Node: ≥20

## Architecture Rules
1. Auth first — `authenticate.admin(request)` before any Shopify API usage
2. Loaders/actions only — Shopify API calls ONLY in loaders/actions, never in components
3. Polaris only — ONLY Polaris v13 components inside `app.*` routes
4. DB scoping — every DB query must include `where: { shop: session.shop }`
5. Webhooks — handle idempotently, always return 200

## Quality Gates
- npm run typecheck — zero tolerance for errors
- Every admin route has `authenticate.admin` in both loader and action
- Every DB query has `where: { shop: session.shop }`
- Every list view has EmptyState
- Every form mutation has Toast feedback
```

**Stack A (SaaS) template:**

```markdown
# AppName — SaaS

## Stack (Exact Versions)
- Framework: Next.js 14+ App Router
- UI: Tailwind CSS + shadcn/ui
- Auth: Supabase Auth — `createServerClient` server-side, `createBrowserClient` client-side
- Database: Supabase (PostgreSQL) with RLS
- Billing: Stripe subscriptions + webhooks
- Language: TypeScript strict mode
- Deploy: Vercel

## Architecture Rules
1. Server Components by default — `"use client"` only for interactivity or hooks
2. Auth — `getUser()` not `getSession()` on server
3. RLS enabled on ALL tables — default deny
4. API routes — Zod validation on every mutation
5. Error handling — never expose raw Supabase/Stripe errors to client

## Quality Gates
- npm run typecheck — zero errors
- All API routes validate input with Zod
- All mutations have error handling
- Mobile responsive — test at 375px
```

### Step 3: Create the `.claude/` structure

```
YourProject/
  .claude/
    CLAUDE.md        ← project instructions (or at project root)
    agents/          ← project-specific agents (optional)
    commands/        ← slash commands for this project
    rules/           ← hard guardrails (always active)
    settings.json    ← Claude Code permissions config
```

```bash
mkdir -p "/Users/yashbaldha/Desktop/Boldteq App/NewApp/.claude/commands"
mkdir -p "/Users/yashbaldha/Desktop/Boldteq App/NewApp/.claude/agents"
mkdir -p "/Users/yashbaldha/Desktop/Boldteq App/NewApp/.claude/rules"
```

**`settings.json` — required for permissions:**

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(npx prisma *)",
      "Bash(node *)"
    ],
    "deny": []
  }
}
```

> **Tip:** Add `"Bash(npx supabase *)"` for SaaS apps. The `permissions.allow` list controls which shell commands Claude Code can run without asking — add any command Claude needs to run automatically during builds.

### Step 4: Install the SDK

Add to `package.json` `dependencies`:

```json
"@boldteq/agents": "file:../polyglot/sdk"
```

Then:

```bash
cd "/Users/yashbaldha/Desktop/Boldteq App/NewApp"
npm install
```

Verify:

```bash
node -e "const { isOnline } = require('@boldteq/agents'); isOnline().then(r => console.log('SDK online:', r))"
# Expected: SDK online: true
```

Or use the Polyglot **Setup** page → Install button to do this automatically.

### Step 5: Verify in Polyglot

1. Open `http://localhost:3847`
2. Check the project appears in the sidebar or Dashboard
3. Click the project → confirm agents, commands, and rules count correctly

---

## Rules System

### What Rules Are

Rules are hard constraints that Claude must follow in every action within a project. They are always active — Claude reads them automatically before every task.

> **Info:** Rules are different from CLAUDE.md guidance. CLAUDE.md says "prefer X". Rules say "never do Y". Write rules as imperatives for non-negotiable standards.

**Rules vs CLAUDE.md vs Commands:**

| | Rules | CLAUDE.md | Commands |
|--|-------|-----------|----------|
| **Active** | Always — Claude reads automatically | Always — loaded at session start | Only when you type `/name` |
| **Purpose** | Hard guardrails Claude must never break | General guidance, stack info, patterns | Repeatable workflow shortcuts |
| **Tone** | Strict constraint ("Never do X") | Guidance ("Prefer X over Y") | Instructions ("Do X, then Y, then Z") |
| **Location** | `.claude/rules/*.md` | `CLAUDE.md` at root or `.claude/CLAUDE.md` | `.claude/commands/*.md` |

### Where Rules Live

```
YourProject/.claude/rules/
  no-direct-push.md
  zod-validation.md
  no-any.md
  prisma-migrations.md
  no-mock-db.md
```

One rule per file. The filename is the rule name. Plain markdown content — no frontmatter needed.

### Example Rules — Full Content

**`no-direct-push.md`**
```markdown
Never commit or push directly to the main branch.

Always create a feature branch:
- Branch name format: feature/[short-description] or fix/[short-description]
- Example: git checkout -b feature/csv-import

Open a pull request for all changes. Never use git push origin main.
```

**`zod-validation.md`**
```markdown
All API routes must validate request input with Zod schemas. Never trust raw request data.

Required pattern:
\`\`\`typescript
const schema = z.object({ ... })
const result = schema.safeParse(await request.json())
if (!result.success) return Response.json({ error: result.error.flatten() }, { status: 400 })
\`\`\`

Never access `request.json()` fields directly without validation.
Never use `schema.parse()` — always `schema.safeParse()` with explicit error handling.
```

**`no-mock-db.md`**
```markdown
Never mock the database in tests. Always use a real test database with seed data.

Never use: jest.mock('prisma'), vi.mock('@/lib/db'), or any database stub.
Always use: a dedicated test database with DATABASE_URL_TEST in .env.test.

Mocked DB tests give false confidence. Real DB tests catch actual query bugs.
```

**`prisma-migrations.md`**
```markdown
Never modify schema.prisma and apply changes manually in production.

All schema changes must go through:
1. Edit prisma/schema.prisma
2. Run: npx prisma migrate dev --name [descriptive-name]
3. Run: npx prisma generate
4. Commit both the schema change and the migration file

Never run npx prisma db push in production — use migrate deploy.
Never run npx prisma migrate reset without explicit user confirmation — this deletes all data.
```

> **Caution:** `prisma migrate reset` destroys all data in the target database. Always confirm with the user before running it, even in development.

**`no-any.md`**
```markdown
Never use TypeScript `any` type. No exceptions.

Alternatives:
- Use specific types or interfaces
- Use generics for flexible typing
- Use `unknown` with type guards for truly unknown data
- Use `Parameters<typeof fn>[0]` to infer parameter types

Also forbidden: `as any`, `@ts-ignore`, `@ts-expect-error` (unless the comment explains exactly why and when it will be fixed).
```

### Managing Rules in Polyglot

- **All Rules page:** `http://localhost:3847/rules` — view all rules across all projects
- **Project detail page:** Click a project in the sidebar → **Rules** tab — create, edit, delete rules for that project
- Rules are stored as `.md` files. Editing via UI writes directly to the file system.

### When to Add a Rule

- Claude repeatedly does something wrong in this project → add a rule stopping it
- A standard is non-negotiable (security, data integrity, billing) → encode it as a rule
- A pattern from CLAUDE.md keeps getting ignored → promote it to a rule

> **Tip:** Rules load at session start. If Claude ignored a rule in the current session, open a new chat window and verify the rule file exists at `.claude/rules/` with a `.md` extension.

---

## Project Detail Page

**How to access:** Sidebar → click the project name

**What it shows:**
- Project path (absolute)
- CLAUDE.md status (found / not found)
- Agents tab — project-specific agents with edit/create/delete
- Commands tab — slash commands with edit/create/delete
- Rules tab — guardrails with edit/create/delete

Creating or editing any of these via the UI writes directly to the project's `.claude/` directory.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List all discovered projects |
| `GET` | `/api/projects/:id/claude-md` | Get project CLAUDE.md content |
| `PUT` | `/api/projects/:id/claude-md` | Update project CLAUDE.md |
| `GET` | `/api/projects/:id/agents` | List project agents |
| `GET` | `/api/projects/:id/agents/:name` | Get one project agent |
| `PUT` | `/api/projects/:id/agents/:name` | Create or update project agent |
| `DELETE` | `/api/projects/:id/agents/:name` | Delete project agent |
| `GET` | `/api/projects/:id/commands` | List project commands |
| `GET` | `/api/projects/:id/commands/:name` | Get one command |
| `PUT` | `/api/projects/:id/commands/:name` | Create or update command |
| `DELETE` | `/api/projects/:id/commands/:name` | Delete command |
| `GET` | `/api/projects/:id/rules` | List project rules |
| `GET` | `/api/projects/:id/rules/:name` | Get one rule |
| `PUT` | `/api/projects/:id/rules/:name` | Create or update rule |
| `DELETE` | `/api/projects/:id/rules/:name` | Delete rule |
| `GET` | `/api/unified/rules` | All rules across all projects |
| `GET` | `/api/unified/commands` | All commands across all projects |
| `GET` | `/api/config` | Current config (project dirs, settings) |
| `POST` | `/api/config/project-dirs` | Update project discovery directories |
| `POST` | `/api/setup/install-sdk` | Install SDK into a project |
| `GET` | `/api/setup/status` | Full setup health check |

> **Info:** `:id` is the base64-encoded project path.

---

## Pre-Build Checklist

```
[ ] CLAUDE.md at project root
    [ ] Stack versions exact (not "React 18" — "React 18.3.1")
    [ ] Architecture rules listed (5–10 rules)
    [ ] Quality gates explicit
    [ ] Folder structure shown

[ ] .claude/ directory exists with:
    [ ] settings.json with appropriate permissions
    [ ] commands/ directory
    [ ] rules/ directory

[ ] Minimum slash commands created:
    [ ] /feature
    [ ] /fix
    [ ] /review

[ ] SDK installed:
    [ ] @boldteq/agents in package.json
    [ ] npm install completed
    [ ] isOnline() returns true

[ ] Polyglot shows project:
    [ ] Appears in sidebar
    [ ] Commands count matches files created
    [ ] CLAUDE.md detected

[ ] Global CLAUDE.md updated:
    [ ] Row added to Active Projects table
```

---

## Troubleshooting

**Project not discovered by Polyglot**
- Confirm parent directory is in Settings
- Confirm project has `CLAUDE.md`, `.claude/`, or `package.json`
- Confirm project folder doesn't start with `.` or isn't named `node_modules`

**Project CLAUDE.md not read by Claude Code**
- File must be named exactly `CLAUDE.md` (all caps) at the project root
- Open a new Claude Code chat window — CLAUDE.md loads at session start
- Test: ask "What are my architecture rules?" — Claude should answer from CLAUDE.md

**SDK install fails**
- Confirm `polyglot/sdk/` directory exists: `ls "/Users/yashbaldha/Desktop/Boldteq App/polyglot/sdk/"`
- Confirm the relative path in `package.json` is correct for the project's location
- Run `npm install` manually and check the error output

**Rules not being enforced**
- Rules must be in `.claude/rules/` with `.md` extension
- Open a new Claude Code session — rules load at session start
- Rule content must be clear and imperative ("Never do X", not "Try to avoid X")

**Project shows in Polyglot but command/rule count is 0**
- Check that `.claude/commands/` and `.claude/rules/` directories exist
- Check that files have `.md` extension
- Reload the project page in Polyglot (navigate away and back)
