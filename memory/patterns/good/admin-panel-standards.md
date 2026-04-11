# Admin Panel Standards — Production-Grade Implementation

Every Boldteq SaaS must ship with a comprehensive admin panel. This standard consolidates patterns from Stripe, Shopify, Vercel, Linear, and the project, combined with SOC 2, GDPR, and security best practices.

**Status:** [PRIMARY PATTERN] — 5+ projects, high usage, proven across multiple stacks
**Knowledge Version:** v2 — Updated 2026-04-05 with comprehensive research findings
**Usage Metric:** 18

---

## Part 1: Architecture & Information Hierarchy

### Admin Panel Structure

Single-page application at `/admin` with sidebar navigation and tab-based content. Each tab is isolated with its own error boundary so one tab crashing doesn't kill the whole admin.

```
Admin.tsx (state: activeSection)
├── AdminHeader (top nav: org logo, Cmd+K palette, account menu)
├── AdminSidebar (left nav: grouped sections, active indicator, collapsible sub-items)
├── AdminErrorBoundary key={activeSection}
│   └── sectionComponents[activeSection] (dynamic render)
```

### Sidebar Navigation Structure (2-Level Maximum)

**Modern pattern (2025):**
- **Level 1:** Top-level sections (Dashboard, Users, Billing, Settings, System)
- **Level 2:** Sub-items within sections (e.g., under Settings: Configuration, Feature Flags, SEO, Audit Logs)
- **Keyboard:** Cmd+K or Ctrl+K opens command palette for jump navigation

**Group sidebar items by function:**
```
OVERVIEW
  └─ Dashboard

USERS & BILLING
  ├─ Users
  └─ Billing & Plans
      ├─ Plans
      ├─ Payments
      ├─ Subscriptions
      └─ Wallet/Credits (if applicable)

CONFIGURATION
  ├─ Platform Settings
  │   ├─ Config
  │   └─ Feature Flags
  ├─ Email Settings
  ├─ SEO
  ├─ AI Prompts
  └─ Changelog

SYSTEM
  ├─ Integrations
  ├─ Webhooks & API Keys
  ├─ Usage Logs
  ├─ Audit Logs
  ├─ System Errors
  └─ Email Templates
```

**Sidebar styling guidelines:**
- Grouped sections with uppercase muted headers (`text-xs uppercase tracking-wider opacity-60`)
- Active item has primary background color + icon/text highlight
- Hover state: subtle translate-x shift + accent background
- Collapsible sub-menus: expand/collapse on click, remember state
- Staggered fade-in animation per group (100ms stagger)

### Section Component Map (TypeScript)

```typescript
type AdminSection =
  | 'dashboard'
  | 'users'
  | 'billing'
  | 'plans'
  | 'config'
  | 'feature-flags'
  | 'email-settings'
  | 'seo'
  | 'ai-prompts'
  | 'changelog'
  | 'integrations'
  | 'webhooks'
  | 'api-keys'
  | 'usage-logs'
  | 'audit-logs'
  | 'system-errors'
  | 'email-templates';

const sectionComponents: Record<AdminSection, React.ComponentType> = {
  dashboard: DashboardTab,
  users: UsersTab,
  billing: BillingTab,
  plans: PlansTab,
  config: PlatformConfigTab,
  'feature-flags': FeatureFlagsTab,
  'email-settings': EmailSettingsTab,
  seo: SeoTab,
  'ai-prompts': AIPromptsTab,
  changelog: ChangelogTab,
  integrations: IntegrationsTab,
  webhooks: WebhooksTab,
  'api-keys': ApiKeysTab,
  'usage-logs': UsageLogsTab,
  'audit-logs': AuditLogsTab,
  'system-errors': SystemErrorLogsTab,
  'email-templates': EmailTemplatesTab,
};
```

### Desktop-First Responsive Strategy

**Desktop (1200px+):**
- Sticky sidebar (250px wide, no collapse on scroll)
- Main content full-width
- Tables show 6-8 columns by default
- Modals centered, 600px wide

**Tablet (768px-1199px):**
- Sidebar collapses on scroll (hamburger menu)
- Main content full-width
- Tables show 4-5 columns, hide non-essential columns
- Modals full-width except 40px padding

**Mobile (<768px):**
- Sidebar behind drawer (swipe left or hamburger)
- Full-width content
- Tables stack to cards (key field + value pairs)
- Modals full-height
- Action buttons: 48px minimum (touch-friendly)

---

## Part 2: Mandatory Admin Tabs (Enhanced)

### 1. Dashboard — Overview Tab

**Purpose:** At-a-glance platform health and key metrics.

**Layout Pattern (Progressive Disclosure):**
- High-level KPIs in large cards (top row)
- Charts/trends below (date range picker)
- Recent activity / alerts lower
- Don't overwhelm with 20+ widgets — focus on 4-6 key metrics

**Required KPIs (customize by product):**
- Total active users (with 7d/30d growth %)
- Monthly recurring revenue (MRR) if subscription-based, or total revenue
- Key product metric (jobs ranked for the project, orders for e-commerce, messages for chat)
- System health (uptime %, error rate, latency p95)

**Required charts:**
- User signups over time (30-day rolling window)
- Revenue/usage trend (30-day rolling)
- Critical alerts or issues count
- All charts must have date range picker (last 7/30/90 days, custom)

**Data pattern:**
- Dashboard data comes from edge function or RPC aggregating from multiple tables
- Real-time updates: use Supabase real-time subscriptions for status indicators (uptime, error rates)
- Batch updates acceptable for historical trends (daily snapshots)

**Implementation note:**
- Skeleton loaders while data loads
- Empty state if no data (explains why — "only 2 days of data available")

### 2. Users Tab — User Lifecycle Management

**Purpose:** Complete user administration (CRUD, roles, activity, compliance).

**Table structure:**
- **Server-side pagination:** 25 items/page by default, configurable to 50/100
- **Columns:** Email (searchable), Name (sortable), Role (filterable badge), Plan (filterable badge), Status (Active/Inactive/Suspended badge), Created Date (sortable), Last Login (sortable), Actions (always visible menu: "•••")
- **Search:** Full-text search on email + name (debounce 300ms)
- **Filters:** Role (dropdown), Status (dropdown), Plan (dropdown), Date range (created/last login)

**Inline actions (in "•••" menu):**
- Edit (modal form to update name, email, role, plan, notes)
- View Activity (drawer showing user's jobs/resumes, usage, payments, login history)
- Change Role (dropdown: admin/user/support, with audit log)
- Change Plan (dropdown of available plans)
- Adjust Credits (if credit-based system, modal to add/remove)
- Ban / Suspend (with confirmation and reason text field)
- Impersonate (if implemented, see Security section for requirements)
- GDPR Data Export (downloads user's account data + activity as JSON, SOC 2 compliant)
- Delete Account (type-to-confirm "DELETE [email]" before red button enabled)

**Bulk actions:**
- Select multiple users (checkboxes in table header + per row)
- Bulk actions toolbar: Ban, Change Plan, Delete, Export CSV, Send Email
- Confirmation modal required for destructive actions

**Audit logging:**
- Every action logs to `admin_audit_logs` via `logAuditAction()` helper
- Format: who (admin email), what (action), whom (user email), when (timestamp), details (old → new values)

**Important:** Search and filters happen server-side for datasets >5000 rows. Client-side only for <1000 rows.

### 3. Billing & Plans Tab

**Purpose:** Manage subscription plans, payment history, and refunds.

**Sub-tabs:**

#### Plans
- CRUD for subscription plans: name, price, billing period (monthly/annual), features list, description
- Dodo Payments sync: "Sync to Dodo" button creates/updates products in Dodo backend
- Columns: Plan name, Price, Billing period, Active (toggle), Dodo Product ID, Last synced

#### Payments
- **Server-side paginated table:** Payment ID, User email, Amount, Credits purchased, Status (Pending/Paid/Failed), Date
- **Filters:** Status, Date range, User email search
- **Columns:** Payment ID, User email, Amount ($), Credits, Status (badge), Created date, Actions (View Details, Refund, Resend Receipt)
- **Actions:**
  - View details (modal: line items, payment method, tax, total)
  - Refund (modal: full/partial refund, reason text field, confirm → processes instantly)
  - Resend receipt (sends payment receipt email)

#### Subscriptions
- Current subscriptions table: User email, Plan name, Status (Active/Past Due/Paused/Cancelled), Next billing date, Amount/period, Actions
- **Actions:** Change Plan, Pause, Resume, Cancel
- **Status indicators:** Use color + icon + text (🟢 Active, ⚠️ Past Due, ⏸️ Paused, ❌ Cancelled)

#### Wallet/Credits (if applicable)
- Current credit balance by user (table: Email, Credits balance, Last added date)
- **Actions:** Add credits (modal: amount, reason) / Adjust credits (for corrections)
- Audit trail: shows all credit transactions (adds, deductions, refunds)

### 4. Platform Config Tab

**Purpose:** Runtime configuration without code changes.

**Key-value store UI:**
- Editable form with config pairs stored in `platform_config` table
- Common configs for the project:
  - `max_resumes_per_job` (int)
  - `max_file_size_mb` (int)
  - `resume_retention_days` (int)
  - `email_ingestion_enabled` (boolean toggle)
  - `booking_demo_url` (text, external link)
  - `maintenance_mode_enabled` (boolean toggle)
  - `rate_limit_requests_per_minute` (int)
  - `support_email` (email)

**UI pattern:**
```
┌─────────────────────────────────────────────┐
│ max_resumes_per_job: [50__________] | Save  │
│ max_file_size_mb: [25_________] | Save      │
│ resume_retention_days: [365________] | Save │
│ email_ingestion_enabled: [Toggle ON]        │
│ booking_demo_url: [https://...] | Save      │
│ maintenance_mode_enabled: [Toggle OFF]      │
│ (⚠️ When ON, all users see maintenance page)│
│ rate_limit: [100] req/min | Save            │
│ support_email: [support@] | Save            │
└─────────────────────────────────────────────┘
```

**Validation:** Client-side type checking (number, boolean, URL), server-side validation
**Audit logging:** Every change logged with admin email, old value, new value

### 5. Feature Flags Tab

**Purpose:** Enable/disable features without redeploying.

**Table columns:** Flag name, Enabled (toggle), Category (system/features/limits/AI/general), Description, Created date, Modified date, [View Details]

**Flag detail modal:**
- Name, description, category
- Enabled toggle
- Variations (if flag supports multiple values)
- Targeting rules (simple): Percentage rollout (0-100%), or environment-based (staging vs production)
- Complex rules (future): Conditions (email matches pattern, user in segment)
- Change history: timestamped list of who changed what when
- Rollback button: revert to previous state

**Hook for frontend:**
```typescript
const useFeatureFlag = (flagName: string, defaultValue = false) => {
  const { data: flag } = useQuery(['feature-flags', flagName], async () => {
    const response = await supabase
      .from('feature_flags')
      .select('*')
      .eq('name', flagName)
      .single();
    return response.data?.enabled ?? defaultValue;
  });
  return flag;
};

// Usage
const showNewDashboard = useFeatureFlag('new-dashboard', false);
if (showNewDashboard) <NewDashboard /> else <OldDashboard />
```

### 6. SEO Settings Tab

**Purpose:** Manage meta tags, sitemap, structured data from admin.

**Sub-tabs:**

#### Global SEO
- Default title tag template
- Default meta description
- Default OG image (URL)
- Favicon URL
- Site-wide keywords (comma-separated)
- Save button with success toast

#### Per-Page Overrides
- Table: Page path (sortable), Title, Description, OG image, Last modified
- Actions: Edit (modal form), Delete (confirmation)
- Modal form: path (must start with /), title, description, og_image, keywords

#### Social Meta Tags
- Twitter card type (summary/summary_large_image)
- Twitter creator handle
- LinkedIn company page URL
- Facebook app ID
- Same for all pages or per-page overrides

#### Robots.txt
- Text area: display current robots.txt content
- Edit button: open text editor modal
- Preview button: shows what crawlers will see
- Save → publishes to `/public/robots.txt`

#### Sitemap Configuration
- Auto-generate from routes: toggle
- Include product pages: toggle
- Include blog: toggle
- Last update strategy: daily/weekly/monthly
- Preview link: click to view generated sitemap.xml
- Submit to Google Search Console link

#### Structured Data (JSON-LD)
- Organization schema (name, logo, sameAs)
- BreadcrumbList schema (auto-generated from pages)
- ArticleSchema (if blog)
- ProductSchema (if e-commerce)
- FAQSchema (for FAQs)
- Save as JSON, previewed in modal

### 7. AI Prompts Tab (Product-Specific)

**Purpose:** Customize AI behavior without code changes.

For the project:
- Resume scoring prompt (system prompt for GPT-4o)
- JD analysis prompt (system prompt for JD parsing)
- Each prompt: large textarea, placeholder text with example structure, Save/Reset to Default buttons, Usage count (how many times used)

```
Prompt Name: Resume Scoring
Template: (system prompt for resume analysis)
[Large textarea]
[Save] [Reset] [View usage: 4.2K invocations this month]
```

### 8. Changelog Tab

**Purpose:** Publish product updates visible to users.

**CRUD interface:**
- List of changelog entries: Title, Version, Published status (badge), Published date, Actions (Edit, Delete, Preview)
- Create New button: modal form
- **Form fields:**
  - Title (text field, max 100 chars)
  - Version (text field, e.g., "1.2.0")
  - Body (markdown editor with preview)
  - Published status (toggle)
  - Published date (datepicker, auto-filled if toggle ON)
- **Actions on entry:** Edit, Delete (confirmation), Preview public page

**Frontend connection:**
- Public `/changelog` page reads from `changelog_entries` table, shows published entries newest first
- Format: Version # | Title | Formatted markdown body | Published date

### 9. Email Settings Tab

**Purpose:** Configure email sending (from address, provider, templates).

**Settings:**
- Email provider: Resend (dropdown)
- From email address: text field
- From name: text field
- Reply-to email: text field
- Support email: text field (for users to contact)
- Unsubscribe link: automatically included in all emails (toggle)
- Save button

**Email templates (Sub-tab):**
- List: Template name (Welcome, Password Reset, Payment Confirmation, etc.), Last modified, Actions (Edit, Preview)
- Edit template modal: Template name, subject line, body (markdown), variables (show available: {user_email}, {user_name}, etc.)
- Preview: sends test email to admin's email
- Reset to default: confirms before reverting

### 10. Webhooks & API Keys Tab (NEW)

**Purpose:** Manage integrations and API access.

**Sub-tabs:**

#### Webhooks
- Table: Event type, Endpoint URL, Status (active/inactive toggle), Created date, Last triggered, Next retry
- Create webhook button: modal form
- **Form:** Event type (dropdown: user.created, job.completed, payment.succeeded), Endpoint URL, Auth method (none, API key, OAuth), Retry policy (max attempts, backoff)
- **Actions:** Edit, Test (send sample payload), Delete, View logs (modal: recent payloads, status codes, timestamps)
- **Logs pattern:**
  - Each webhook invocation logged: timestamp, event, payload, status code, response
  - Retry count (if failed)
  - Table with date range filter

#### API Keys
- Table: Key name, Key (masked: shows first 4 and last 4 chars), Created date, Last used date, Scopes (badge list)
- Create key button: modal form
- **Form:** Key name, Scopes (multi-select: read_users, read_jobs, write_jobs, etc.), Expiration (never/30/60/90 days)
- **Actions:** Rotate (generates new key, old key deprecated), Revoke (deletes), View usage (modal: API calls using this key, timestamps)
- **Security:** Keys shown only once on creation. Copy to clipboard + download warning.

### 11. Email Templates Tab (NEW)

**Purpose:** Customize transactional emails without code.

**Template list:**
- Built-in templates: Welcome, Password Reset, Email Confirmation, Invoice, Trial Expiring, Subscription Confirmation, Refund Confirmation
- Columns: Template name, Subject, Last modified, Actions (Edit, Preview, Reset to default)

**Edit template modal:**
- Template name (read-only)
- Subject line (text field with variables help text)
- Body (markdown editor)
- Available variables: {user_name}, {user_email}, {action_url}, {expiration_date}, etc.
- Preview button: show formatted email with sample values
- HTML preview: show how it renders in email clients

**Reset to default:** Confirm dialog, reverts subject + body to original, saves immediately

### 12. Integrations Tab

**Purpose:** Third-party service connections.

**Table:**
- Service name (Slack, Zapier, IFTTT, etc.), Status (connected/not connected), Last synced, Actions
- Actions: Connect, Disconnect, Configure, View logs

**Connect flow:**
- Modal with OAuth authorization button or API key input
- Successful connection → show verification badge
- Disconnect: confirmation → revokes tokens/keys

### 13. Usage Logs Tab

**Purpose:** Track resource consumption per user.

**Table (server-side paginated):**
- Columns: User email, Action (resume ranked, job created, etc.), Credits used, Timestamp (sortable)
- **Filters:** Date range, User email search, Action type (dropdown)
- **CSV export:** Exports all matching rows (respects filters)

**Performance pattern:**
- Keyset/cursor pagination for large datasets (1M+ rows)
- Debounced search (300ms)
- No total row count for huge datasets, show "~1.2M results" approximation

### 14. Audit Logs Tab — SOC 2 / GDPR Compliance

**Purpose:** Track all admin actions for accountability and compliance.

**Critical requirement:** Every entry must include WHO, WHAT, WHEN, WHERE, OUTCOME.

**Table (immutable, append-only):**
- Columns: Timestamp (sortable, UTC), Admin email, Action (sortable dropdown), Resource type, Resource ID, Details, Status (Success/Failed), IP address (optional)
- **Filters:**
  - Date range (sortable: today, last 7d, last 30d, custom)
  - Admin email (search)
  - Action type (dropdown: user.created, user.deleted, role.changed, credit.adjusted, feature_flag.toggled, etc.)
  - Resource type (dropdown: user, job, payment, feature_flag, etc.)
  - Status (toggle: show successes, failures, both)
- **CSV export:** Full audit trail (respects filters)
- **No delete capability:** Once logged, cannot be deleted (compliance requirement)

**Example audit log entry:**
```
Timestamp: 2026-04-05 14:23:45 UTC
Admin: alice@company.com
Action: User Role Changed
Resource: User (alice@example.com)
Details: Role changed from "user" to "admin"
Status: Success
IP: 203.0.113.42
```

**Retention policy:**
- Minimum 12 months (SOC 2 requirement)
- Recommended 24 months
- After retention period, can archive to external storage (S3, Datadog, Splunk) but must be immutable

**Real-time streaming (for SOC 2):**
- Additionally stream audit logs to external SIEM (Datadog, Splunk, CloudWatch) via webhook
- This ensures auditors can access logs independently of application database

**Helper function:**
```typescript
export async function logAuditAction(
  action: string,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>,
  status: 'success' | 'failed' = 'success',
  errorMessage?: string
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('admin_audit_logs').insert({
    admin_user_id: user.id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details: {
      ...details,
      error: errorMessage,
    },
    status,
    ip_address: getClientIp(), // from request headers
  });

  if (error) console.error('Audit log failed:', error);

  // Also stream to external SIEM
  if (process.env.SIEM_WEBHOOK_URL) {
    fetch(process.env.SIEM_WEBHOOK_URL, {
      method: 'POST',
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        admin_id: user.id,
        action,
        entity: { type: entityType, id: entityId },
        details,
        status,
      }),
    }).catch(err => console.error('SIEM stream failed:', err));
  }
}

// Usage in admin tabs:
await logAuditAction('user.ban', 'user', userId, { reason });
await logAuditAction('plan.upgrade', 'subscription', subscriptionId, { old_plan: 'free', new_plan: 'pro' });
await logAuditAction('feature_flag.toggle', 'feature_flag', flagId, { old_value: false, new_value: true });
```

### 15. System Errors Tab

**Purpose:** Monitor application errors.

**Table:**
- Columns: Error message (truncated, click for full text), Count, Severity (badge), Last occurrence (timestamp, sortable), Status (Open/Resolved toggle)
- **Filters:** Severity, Date range, Resolution status

**Error detail modal:**
- Full error message, stack trace, count, first occurrence, last occurrence
- Affected users (if available): count or list
- Resolution actions: Mark as Resolved, Delete (archive)

---

## Part 3: Security & Compliance (MANDATORY)

### RBAC Implementation (3-Layer Model)

**Layer 1: Page-Level Access**
```typescript
function AdminRoute({ children }) {
  const { user, profile } = useAuth();
  if (!user) return <Navigate to="/auth" />;
  if (!profile?.role.startsWith('admin')) return <Navigate to="/dashboard" />;
  return children;
}
```

**Layer 2: Operation-Level Access**
```typescript
async function updateUserRole(userId: string, newRole: string) {
  const { data: { user: admin } } = await supabase.auth.getUser();
  const adminProfile = await getProfile(admin.id);

  // Only admins can change roles
  if (adminProfile.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  // Cannot grant yourself admin
  if (userId === admin.id && newRole === 'admin') {
    throw new Error('Cannot escalate own privileges');
  }

  // Log the change
  await logAuditAction('user_role_changed', 'user', userId, {
    new_role: newRole,
    old_role: (await getProfile(userId)).role,
  });

  // Execute
  return supabase.from('profiles')
    .update({ role: newRole })
    .eq('id', userId);
}
```

**Layer 3: Row-Level Security (RLS)**
```sql
-- Only admins can access admin tables
CREATE POLICY "admin_audit_logs_access" ON admin_audit_logs
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

-- Users can only view own profile
CREATE POLICY "users_view_own_profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id OR auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
```

**Recommended role structure:**
- `admin` — Full CRUD on all resources, user management, audit logs, billing adjustments
- `support_agent` — Can view users, adjust credits, view audit logs (read-only)
- `finance_manager` — Can view payments, subscriptions, refunds, cannot delete users
- `user` — Read own profile, cannot access admin

### SOC 2 Compliance Requirements Checklist

**Logging (MANDATORY):**
- ✅ Every high-risk action logged: user creation, deletion, role changes, credential resets, payment refunds, API key generation
- ✅ Log contains: WHO (user email + ID), WHAT (specific action), WHEN (ISO 8601 UTC timestamp), WHERE (resource ID), OUTCOME (success/failed)
- ✅ Retention: minimum 12 months (recommend 24)
- ✅ Immutable: logs cannot be deleted or edited once created
- ✅ External streaming: logs also sent to SIEM (Datadog, Splunk, CloudWatch) in real-time

**Access Control (MANDATORY):**
- ✅ RBAC with least privilege (no user has more access than needed)
- ✅ MFA required for admin accounts
- ✅ Regular access reviews (quarterly minimum, document in admin panel)
- ✅ Remove access within 30 days of employee departure

**Monitoring & Alerting (MANDATORY):**
- ✅ Alert on failed login attempts (5+ failures in 15 min)
- ✅ Alert when admin account created
- ✅ Alert when user added to admin group
- ✅ Alert when permissions elevated outside change management
- ✅ Alert on suspicious patterns (bulk deletions, access from unusual IP, etc.)

**Implementation:** Set up alerts in your SIEM tool. Don't just log — actively monitor.

### GDPR Compliance Workflow

**Right of Access (Article 15):**
Admin action → `[View Activity]` drawer or dedicated export feature:
- Click "Export User Data" → generates JSON/CSV of all user's data
- Includes: account info, activity, uploaded files, payment history, all personal data
- Downloads immediately or emails (confirm with user first)
- Response time: target 5-7 days (GDPR allows 30)

**Right to Erasure (Article 17):**
Admin action → `[Delete Account]` with multi-step confirmation:
1. Click Delete
2. Modal: "Deleting alice@example.com will permanently remove their account, all jobs, resumes, and activity logs. Type the email to confirm."
3. User types email in text field
4. Red Delete button becomes enabled
5. On confirm → log deletion, delete from DB, schedule backups to purge after 30 days
6. Send user confirmation email: "Your account has been deleted. Backups will be purged 2026-05-05."

**Data Processing Records (Article 30):**
Document in admin panel under Settings → Compliance:
- What data types stored (emails, files, usage logs, IPs)
- How long retained (account data: until deletion, logs: 12 months, backups: 30 days post-deletion)
- Who accesses (admins, support agents, automated processes)
- Why retained (account management, compliance, fraud prevention)
- Third-party processors (payment processor, email provider, storage provider, SIEM)

**Consent Management:**
If tracking user consent (marketing emails, analytics, cookies):
- Admin panel shows user's consents with dates
- Admin can withdraw consent on behalf of user
- Audit log: "Marketing consent withdrawn by admin@company.com on 2026-04-05"

### Data PII Masking Rules

**When to show full PII:**
- ✅ Admin explicitly viewing user detail (clicked into user)
- ✅ Admin exporting user data (full export for GDPR request)
- ✅ Support agent in impersonation mode (clear warning banner)

**When to mask:**
- ❌ Audit logs (show "alice••••••••••••4321" not full email)
- ❌ Usage logs export (if contains user identifiers)
- ❌ CSV export of activity (show name not email, unless explicitly requested)
- ❌ Payment history (show "••••••••••••1234" for card, not full number)

**Implementation:**
```typescript
function maskPII(email: string, show = false): string {
  if (show) return email;
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}••••••••••••••${local.slice(-2)}@${domain}`;
}

function maskCard(cardNumber: string, show = false): string {
  if (show) return cardNumber;
  return `••••••••••••${cardNumber.slice(-4)}`;
}
```

### Admin Session Security

**Session timeout:**
- Admin sessions expire after 30 minutes of inactivity
- Re-authentication required to perform sensitive actions (delete user, refund payment)
- Logout on browser tab close (optional, stricter)

**MFA Requirement:**
- All admin accounts require MFA (authenticator app or security key)
- MFA re-verification required for sensitive operations
- Can't disable MFA on admin account

**IP Whitelisting (Optional, Enterprise):**
- Admin access restricted to known office IPs or VPN
- Automatic 15-minute cooldown after failed IP check
- Admin notified of new IP login attempt

**Implementation:**
```typescript
async function sensitiveAction(action: () => Promise<void>) {
  const { data: { user } } = await supabase.auth.getUser();
  const lastAuthTime = localStorage.getItem('lastAuthTime');
  const now = Date.now();

  // Require re-auth if >10 minutes since last auth
  if (!lastAuthTime || now - parseInt(lastAuthTime) > 10 * 60 * 1000) {
    // Show MFA re-auth dialog
    const verified = await showMfaVerification();
    if (!verified) throw new Error('MFA verification failed');
    localStorage.setItem('lastAuthTime', now.toString());
  }

  await action();
}
```

### Impersonation Security (If Implemented)

**Requirements:**
1. Only MFA-enabled admins with "support" role can impersonate
2. User receives email notification: "admin@company.com logged in as you on 2026-04-05 at 14:23 UTC. Duration: [time]. Actions taken: [list]"
3. Session expires after 30 minutes or when admin logs out
4. Clear UI banner while impersonating: "⚠️ You are viewing as alice@example.com [Exit impersonation]"
5. Audit trail: every impersonation logged with start time, end time, actions taken
6. Restricted actions: Cannot change user's password, enable MFA, or delete account during impersonation

**Implementation:**
```typescript
// Start impersonation
async function startImpersonation(userIdToImpersonate: string) {
  const { data: { user: admin } } = await supabase.auth.getUser();
  const adminProfile = await getProfile(admin.id);

  if (adminProfile.role !== 'support') throw new Error('Not authorized');
  if (!adminProfile.mfa_enabled) throw new Error('MFA required');

  const impersonationId = generateId();
  await supabase.from('impersonation_sessions').insert({
    id: impersonationId,
    admin_id: admin.id,
    user_id: userIdToImpersonate,
    started_at: new Date(),
    expires_at: new Date(Date.now() + 30 * 60 * 1000),
  });

  // Notify user
  await sendEmail(userIdToImpersonate, {
    template: 'impersonation_notification',
    data: { admin_email: admin.email, timestamp: new Date() },
  });

  // Log
  await logAuditAction('impersonation_started', 'impersonation', impersonationId, {
    admin_id: admin.id,
    user_id: userIdToImpersonate,
  });

  return impersonationId;
}

// End impersonation and log actions
async function endImpersonation(impersonationId: string) {
  const session = await supabase.from('impersonation_sessions')
    .select('*')
    .eq('id', impersonationId)
    .single();

  await logAuditAction('impersonation_ended', 'impersonation', impersonationId, {
    actions_taken: session.actions_log,
    duration_minutes: Math.round((Date.now() - session.started_at) / 60000),
  });

  await supabase.from('impersonation_sessions')
    .delete()
    .eq('id', impersonationId);
}
```

### Rate Limiting Admin Endpoints

**Apply to sensitive operations:**
- User creation/deletion: max 100 per hour per admin
- Bulk operations: max 10 per hour per admin
- Payment refunds: max 50 per hour per admin
- Login attempts: max 5 failures per 15 minutes per IP

**Implementation:**
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const adminRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 h'),
});

export async function deleteUser(userId: string) {
  const { data: { user: admin } } = await supabase.auth.getUser();
  const { success } = await adminRateLimit.limit(admin.id);
  if (!success) throw new Error('Rate limit exceeded');

  // proceed with deletion
}
```

---

## Part 4: Data Tables & Performance

### Server-Side Pagination Pattern

**For datasets >5000 rows, always use server-side pagination.**

**TanStack Table (React Table) implementation:**
```typescript
import { useReactTable, getCoreRowModel, getPaginationRowModel } from '@tanstack/react-table';

function UsersTable() {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  const { data: users, isLoading } = useQuery(
    ['users', pagination],
    async () => {
      const offset = pagination.pageIndex * pagination.pageSize;
      const { data, count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + pagination.pageSize - 1);

      return { rows: data, pageCount: Math.ceil(count / pagination.pageSize) };
    }
  );

  const table = useReactTable({
    data: users?.rows || [],
    columns,
    pageCount: users?.pageCount,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true, // Tell React Table that pagination is server-side
  });

  return (
    <div>
      <table>
        {/* render rows */}
      </table>
      <div className="flex gap-2">
        <button onClick={() => table.setPageIndex(0)}>First</button>
        <button disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Prev</button>
        <span>{table.getState().pagination.pageIndex + 1} / {table.getPageCount()}</span>
        <button disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</button>
        <button onClick={() => table.setPageIndex(table.getPageCount() - 1)}>Last</button>
      </div>
    </div>
  );
}
```

### Search Patterns

**Client-side search (<1000 rows):**
- Filter in memory after loading all data
- Instant feedback as user types

**Server-side search (>5000 rows):**
- Use PostgreSQL full-text search (FTS) or `ILIKE`
- Debounce 300ms (wait 300ms after user stops typing before querying)
- Show "Searching..." state while loading

```typescript
function UsersTable() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: users, isLoading } = useQuery(
    ['users-search', debouncedSearch],
    async () => {
      if (!debouncedSearch) return [];

      return supabase
        .from('profiles')
        .select('*')
        .or(`email.ilike.%${debouncedSearch}%,name.ilike.%${debouncedSearch}%`)
        .limit(100);
    },
    { enabled: !!debouncedSearch }
  );

  return (
    <>
      <input
        placeholder="Search by email or name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {isLoading && <span>Searching...</span>}
      {/* render results */}
    </>
  );
}
```

### Virtualization for 100K+ Rows

**Use `react-window` or `react-virtual` for virtualized lists:**
```typescript
import { useVirtual } from '@tanstack/react-virtual';

function VirtualizedUsersTable({ users }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtual({
    size: users.length,
    parentRef,
    size: 50, // height of each row in pixels
  });

  return (
    <div ref={parentRef} style={{ height: 600, overflow: 'auto' }}>
      <table style={{ height: virtualizer.getTotalSize() }}>
        <tbody>
          {virtualizer.getVirtualItems().map(virtualItem => (
            <tr key={virtualItem.index} style={{ transform: `translateY(${virtualItem.start}px)` }}>
              <td>{users[virtualItem.index].email}</td>
              <td>{users[virtualItem.index].name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

This renders only visible rows (e.g., 12 rows in 600px container) instead of all 100K rows.

### Column Filtering & Sorting

**Server-side sorting:**
```typescript
const [sortBy, setSortBy] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null);

const { data: users } = useQuery(
  ['users', sortBy],
  async () => {
    let query = supabase.from('profiles').select('*');
    if (sortBy) {
      query = query.order(sortBy.field, { ascending: sortBy.direction === 'asc' });
    }
    return query;
  }
);
```

**Column filters (dropdown):**
```typescript
const [roleFilter, setRoleFilter] = useState<string | null>(null);

const { data: users } = useQuery(
  ['users', roleFilter],
  async () => {
    let query = supabase.from('profiles').select('*');
    if (roleFilter) {
      query = query.eq('role', roleFilter);
    }
    return query;
  }
);

// UI
<select value={roleFilter || ''} onChange={(e) => setRoleFilter(e.target.value || null)}>
  <option value="">All roles</option>
  <option value="admin">Admin</option>
  <option value="user">User</option>
</select>
```

### Export Patterns

**CSV export (respects current filters):**
```typescript
async function exportAsCSV() {
  const { data: users } = await supabase
    .from('profiles')
    .select('email, name, role, created_at')
    .eq('role', roleFilter); // Respects filter

  const csv = [
    ['Email', 'Name', 'Role', 'Created'].join(','),
    ...users.map(u => [u.email, u.name, u.role, u.created_at].join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'users.csv';
  a.click();
}
```

**Important:** Export includes ALL matching rows, not just current page. Use pagination on UI, but export includes full dataset.

---

## Part 5: Bulk Operations

### Async Bulk Operation Pattern

**Database schema:**
```sql
CREATE TABLE bulk_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id),
  operation_type TEXT, -- 'delete_users', 'ban_users', 'export_users'
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  total_items INT,
  processed_items INT DEFAULT 0,
  failed_items INT DEFAULT 0,
  error_message TEXT,
  filters JSONB, -- what items to operate on
  results JSONB, -- outcome data
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**UI Pattern:**
```typescript
async function doBulkDelete(selectedUserIds: string[]) {
  // Create job
  const { data: job } = await supabase.from('bulk_operations').insert({
    admin_id: user.id,
    operation_type: 'delete_users',
    total_items: selectedUserIds.length,
    filters: { user_ids: selectedUserIds },
  }).select().single();

  // Open progress modal
  showProgressModal({
    title: `Deleting ${selectedUserIds.length} users`,
    jobId: job.id,
    cancelable: true,
  });

  // Trigger edge function
  await supabase.functions.invoke('bulk-delete-users', {
    body: { job_id: job.id, user_ids: selectedUserIds },
  });

  // Poll for completion
  const pollInterval = setInterval(async () => {
    const { data: updatedJob } = await supabase
      .from('bulk_operations')
      .select('*')
      .eq('id', job.id)
      .single();

    updateProgressModal({
      processed: updatedJob.processed_items,
      failed: updatedJob.failed_items,
      status: updatedJob.status,
    });

    if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
      clearInterval(pollInterval);
      showCompletionDialog({
        succeeded: updatedJob.processed_items - updatedJob.failed_items,
        failed: updatedJob.failed_items,
      });
    }
  }, 500);
}
```

**Edge function (background job):**
```typescript
// supabase/functions/bulk-delete-users/index.ts
export async function bulkDeleteUsers(jobId: string, userIds: string[]) {
  const supabase = createServerClient();

  for (let i = 0; i < userIds.length; i += 100) {
    const batch = userIds.slice(i, i + 100);

    try {
      // Batch delete (100 at a time)
      await supabase.auth.admin.deleteUsers(batch);

      // Update progress
      await supabase
        .from('bulk_operations')
        .update({
          processed_items: i + batch.length,
        })
        .eq('id', jobId);
    } catch (error) {
      await supabase
        .from('bulk_operations')
        .update({
          failed_items: batch.length,
          error_message: error.message,
        })
        .eq('id', jobId);
    }
  }

  // Mark complete
  await supabase
    .from('bulk_operations')
    .update({ status: 'completed', completed_at: new Date() })
    .eq('id', jobId);
}
```

---

## Part 6: Error Handling & UX

### Hierarchical Error Boundaries

**App-level:**
```typescript
<ErrorBoundary fallback={<ErrorPage />}>
  <Admin />
</ErrorBoundary>
```

**Page-level (each tab isolated):**
```typescript
export function DashboardTab() {
  return (
    <ErrorBoundary fallback={<div>Dashboard error. <a href="">Refresh</a></div>}>
      <DashboardContent />
    </ErrorBoundary>
  );
}
```

**Feature-level (tables, charts):**
```typescript
function UsersTable() {
  return (
    <ErrorBoundary fallback={<div>Users table failed to load</div>}>
      <table>{/* ... */}</table>
    </ErrorBoundary>
  );
}
```

**Benefit:** If one tab crashes, others still work. If one table fails, rest of page still works.

### Graceful Degradation

**Feature unavailable ≠ Crash:**
```typescript
function SeoTab() {
  const { data: seoSettings, error } = useQuery(['seo-settings'], ...);

  if (error) {
    return (
      <Card className="border-yellow-300">
        <CardHeader>SEO Settings</CardHeader>
        <p className="text-yellow-700">
          SEO settings are temporarily unavailable.
          <button onClick={() => window.location.reload()}>Retry</button>
        </p>
      </Card>
    );
  }

  // Normal UI if loaded
  return <SeoSettingsContent data={seoSettings} />;
}
```

### Confirmation Dialogs for Dangerous Actions

**Simple destructive actions (delete, ban):**
```typescript
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogTitle>Delete User?</AlertDialogTitle>
    <AlertDialogDescription>
      This will permanently delete alice@example.com and all their data. This cannot be undone.
    </AlertDialogDescription>
    <AlertDialogAction variant="destructive" onClick={deleteUser}>
      Delete
    </AlertDialogAction>
    <AlertDialogCancel>Cancel</AlertDialogCancel>
  </AlertDialogContent>
</AlertDialog>
```

**Complex destructive actions (type-to-confirm):**
```typescript
<Dialog>
  <DialogTrigger asChild>
    <Button variant="destructive">Delete Account</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogTitle>Permanently Delete alice@example.com?</DialogTitle>
    <p>Type the email address to confirm:</p>
    <input
      type="text"
      placeholder="alice@example.com"
      value={confirmEmail}
      onChange={(e) => setConfirmEmail(e.target.value)}
    />
    <Button
      variant="destructive"
      disabled={confirmEmail !== userEmail}
      onClick={deleteAccount}
    >
      Delete Account
    </Button>
  </DialogContent>
</Dialog>
```

### Undo Pattern (30-Second Window)

**For reversible actions:**
```typescript
async function deleteUser(userId: string) {
  // Soft delete or mark for deletion
  await supabase.from('profiles')
    .update({ status: 'deleted', deleted_at: new Date() })
    .eq('id', userId);

  // Show undo toast
  toast.success(`User deleted. [Undo]`, {
    action: {
      label: 'Undo',
      onClick: async () => {
        await supabase.from('profiles')
          .update({ status: 'active', deleted_at: null })
          .eq('id', userId);
        toast.success('User restored');
      },
    },
    duration: 30_000, // 30 seconds
  });
}
```

### Dark Patterns to Avoid (20+ Common Mistakes)

1. **Missing audit logs** — No record of who deleted what when. Fail SOC 2.
2. **No confirmation dialogs** — User clicks delete twice, whole dataset gone.
3. **Hardcoded admin checks** — e.g., `if (email === 'admin@company.com') { allow }`. Impossible to manage multiple admins.
4. **No pagination** — Try to load 1M rows into a table. Browser crashes.
5. **Client-side only search** — Search by loading all data, filtering in JS. Slow + insecure.
6. **Missing loading states** — Table appears blank while loading. User thinks it's broken.
7. **No error boundaries** — One tab crash kills entire admin panel.
8. **PII exposed in URLs** — Admin URLs show user emails or IDs in plaintext query params.
9. **No rate limiting** — Attacker can bulk-create 1000 users per second.
10. **Destructive actions too easy** — Delete button same size as other buttons, no confirmation.
11. **No GDPR export workflow** — User asks for data. Admin manually emails them a file.
12. **No data retention policy** — Audit logs kept forever (storage bloat, privacy risk).
13. **Session never expires** — Admin logs in, leaves laptop at desk, anyone can access admin panel.
14. **No MFA requirement** — Admin password compromised = entire app compromised.
15. **Hover-to-reveal actions** — Edit/delete buttons only show on hover. Inaccessible to keyboard users.
16. **Color-only status indicators** — Red = error? Warning? Pending? Users with color blindness confused.
17. **No empty states** — Blank table with no message. User doesn't know if data is loading or missing.
18. **Slow performance** — Admin clicks edit, waits 5 seconds for form to load.
19. **Inconsistent design** — Different sections look different. Feels like different products.
20. **No user impersonation audit** — Admin "logs in as" user, makes purchases, no record of who did it.

---

## Part 7: Admin Notifications

**Priority routing:**
- **CRITICAL:** Payment failed, security breach, system down → immediate notification + Slack alert
- **HIGH:** User reported bug, quota exceeded → in-app notification (bell icon)
- **MEDIUM:** Daily digest of signups, churn → daily email
- **LOW:** Feature flag toggled → audit log only, no notification

**In-app notification bell:**
```typescript
function NotificationBell() {
  const { data: unreadCount } = useQuery(
    ['notifications', 'unread-count'],
    async () => {
      const { count } = await supabase
        .from('admin_notifications')
        .select('id', { count: 'exact' })
        .eq('read', false)
        .eq('priority', 'high');
      return count;
    },
    { refetchInterval: 30_000 } // Poll every 30s
  );

  return (
    <div className="relative">
      <BellIcon />
      {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
    </div>
  );
}
```

**Alert fatigue prevention:**
- Max 1 email/day of each type (don't email on every signup, batch into daily digest)
- Unsubscribe button on every notification email
- User can control notification preferences per type

---

## Part 8: Testing Strategy

**Critical paths to E2E test:**
1. Login → access admin dashboard → see user list
2. Admin changes user role → audit log created → user's permissions change
3. Admin uploads bulk users file → job created → background job processes → completion email sent
4. Admin refunds payment → payment status changed → audit logged → user notified
5. User requests data export → admin exports → PDF downloaded → audit logged

**Permission boundary tests:**
- Support agent cannot access Billing tab
- Viewer role cannot click Delete buttons (buttons disabled or hidden)
- Regular user cannot access `/admin` (redirects to dashboard)

**Bulk operation integrity tests:**
- Bulk delete 100 users → all 100 deleted → 0 remaining
- Bulk ban 50 users → all 50 banned → ban email sent to each

**What NOT to E2E test:**
- Low-risk UI changes (button color, text changes)
- Page load performance
- Every filter combination (unit test filters instead)

---

## Part 9: Database Schema (SQL)

```sql
-- Platform configuration
CREATE TABLE platform_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Feature flags
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT false,
  value JSONB,
  category TEXT DEFAULT 'general',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit logs (IMMUTABLE, append-only)
CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB,
  status TEXT DEFAULT 'success', -- 'success' or 'failed'
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_logs_created_at ON admin_audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_admin_id ON admin_audit_logs(admin_user_id);
CREATE INDEX idx_audit_logs_entity ON admin_audit_logs(entity_type, entity_id);

-- Changelog
CREATE TABLE changelog_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  version TEXT,
  published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SEO settings
CREATE TABLE seo_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path TEXT UNIQUE,
  title TEXT,
  description TEXT,
  og_image TEXT,
  structured_data JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- System error logs
CREATE TABLE system_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  stack TEXT,
  count INT DEFAULT 1,
  resolved BOOLEAN DEFAULT false,
  last_occurrence TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bulk operations
CREATE TABLE bulk_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id),
  operation_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  total_items INT,
  processed_items INT DEFAULT 0,
  failed_items INT DEFAULT 0,
  error_message TEXT,
  filters JSONB,
  results JSONB,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Webhooks
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  retry_max_attempts INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Webhook logs
CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhooks(id),
  event_type TEXT,
  payload JSONB,
  status_code INT,
  response TEXT,
  attempt INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] DEFAULT ARRAY['read'],
  active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Email templates
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  variables TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_audit_logs_read" ON admin_audit_logs
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_flags_read" ON feature_flags
  FOR SELECT
  USING (true); -- All users can read (used in app)

CREATE POLICY "feature_flags_write" ON feature_flags
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_logs_read" ON webhook_logs
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );
```

---

## Part 10: Quality Checklist — Pre-Launch Admin Panel

Every SaaS must pass this checklist before admin panel ships.

### Structure
- ✅ Sidebar with 2-level max navigation (no 3+ levels)
- ✅ Each tab isolated with error boundary
- ✅ Cmd+K command palette functional
- ✅ Mobile responsive (tables stack to cards, buttons 48px+)

### Dashboard
- ✅ 4-6 key KPIs displayed prominently
- ✅ 2+ charts with date range picker
- ✅ Data updates every 30 seconds (real-time or batch)
- ✅ Loading skeleton + empty state

### Users Tab
- ✅ Server-side paginated table (25/page)
- ✅ Search by email/name (debounced 300ms)
- ✅ Role filter working
- ✅ Edit user modal (change role, plan, credits)
- ✅ Delete user with type-to-confirm
- ✅ Bulk select + bulk actions (ban, delete, export)
- ✅ Audit logged for every action

### Billing
- ✅ Payment history with refund capability
- ✅ Subscriptions list with status indicators
- ✅ Can change plan (pro-rata calculations)
- ✅ Can add manual credits/discounts
- ✅ Invoice download + email resend

### Feature Flags
- ✅ Toggle flags on/off
- ✅ Can change values (JSON support)
- ✅ Change history visible
- ✅ Rollback capability

### SEO
- ✅ Per-page meta tag editor
- ✅ Robots.txt editor
- ✅ Sitemap preview
- ✅ Structured data editor

### Audit Logs
- ✅ Every admin action logged (role change, user delete, etc.)
- ✅ Sortable by date, filterable by admin/action/resource
- ✅ Cannot be deleted (immutable)
- ✅ Exported to external SIEM (if SOC 2 required)
- ✅ 12+ month retention

### Security
- ✅ Admin routes require `role === 'admin'` check
- ✅ RBAC implemented (3 layers: page/operation/row)
- ✅ MFA required for sensitive ops (delete user, refund payment)
- ✅ Session timeout after 30 min inactivity
- ✅ Rate limiting on sensitive endpoints
- ✅ No hardcoded secrets (env vars only)

### GDPR Compliance (if operating in EU)
- ✅ User data export feature (one-click JSON/CSV)
- ✅ User deletion workflow (type-to-confirm)
- ✅ Data retention policy documented
- ✅ PII masked in logs (don't show full email/card)

### Performance
- ✅ Tables load in <1 second (server-side pagination)
- ✅ Search debounced (300ms)
- ✅ Charts load in <2 seconds
- ✅ No page slowdown with 10K+ users
- ✅ Virtualization for huge lists (100K+ rows)

### UX
- ✅ Destructive actions have confirmation dialogs
- ✅ Loading states on all async operations
- ✅ Empty states (no blank tables)
- ✅ Error boundaries prevent page crashes
- ✅ Consistent design (shadcn/ui or design system)
- ✅ Status badges with color + icon + text
- ✅ Actions always visible (not hover-to-reveal)

### Testing
- ✅ Critical paths E2E tested (login → change user role → audit logged)
- ✅ Permission boundary tests (support agent can't access billing)
- ✅ Bulk operation integrity tested
- ✅ Error cases handled (network failure, timeout)

### Documentation
- ✅ Admin panel documented (what each tab does, where to find things)
- ✅ Security best practices documented (MFA, session timeout, etc.)
- ✅ Audit logging explained (what's logged, retention)
- ✅ GDPR workflow documented (how to handle data export, deletion)

---

## Part 11: Anti-Patterns Summary Table

| Mistake | What Goes Wrong | Prevention |
|---------|-----------------|-----------|
| No audit logs | No accountability for admin actions, fail SOC 2 | Log every action (role change, delete, refund) |
| Hardcoded admin checks | `if email === 'admin@comp.com'` breaks when you add 2nd admin | Use `role === 'admin'` column, profile lookup |
| No pagination | Load 1M rows → browser crash | Server-side pagination, limit 25/page |
| Client-side search | All data fetched to browser, slow + insecure | Server-side search with debounce |
| No confirmation dialogs | User deletes 100 users by accident | Require confirm on destructive actions |
| No loading states | Blank table → looks broken | Show skeleton loaders, "Loading..." messages |
| No error boundaries | One tab crash → whole admin down | Wrap each tab in ErrorBoundary |
| PII in URLs | Audit logs show `?user_id=alice@example.com` | Use UUID, mask PII in logs/exports |
| No rate limiting | Attacker bulk-creates 1000 accounts/sec | Rate limit sensitive endpoints (refund, delete) |
| Sessions never expire | Admin logs in, leaves desk, anyone can access | 30-min timeout + re-auth for sensitive ops |
| No MFA | Admin password stolen = app compromised | MFA required for all admin accounts |
| Color-only status | Red badge = error? warning? pending? | Use color + icon + text |
| No empty states | Blank table doesn't tell user if data loaded | Show "No users yet. [Create]" when empty |
| Hover-to-reveal actions | Keyboard users can't see edit/delete buttons | Always show actions in "•••" menu |
| No GDPR export | User asks for data, no way to export | One-click JSON/CSV export button |
| No retention policy | Audit logs kept forever (GDPR violation) | Auto-delete logs after 12-24 months |
| Slow queries | Admin clicks filter, waits 5+ seconds | Index key columns, use cursor pagination |
| Same design as rest of app | Admin panel looks like user dashboard | Use different color scheme, make clear it's admin |
| No impersonation audit | Admin logs in as user, makes purchases, no record | Log start/end time, actions taken, notify user |
| No access reviews | Old employees still have admin access | Quarterly access audit, remove unused access |

---

## Part 12: Benchmarks — What Top Companies Do

| Company | Pattern | Implementation |
|---------|---------|-----------------|
| **Stripe** | Progressive disclosure | KPIs front, drill down on demand |
| **Stripe** | Semantic color | Red ONLY for problems (disputes), green for money in |
| **Stripe** | Latency budgeting | Every card <100ms, even on slow connection |
| **Shopify** | Sidebar navigation | Left sticky nav, 8-10 main sections |
| **Shopify** | Bulk actions | Select multiple, apply action to all |
| **Vercel** | Cmd+K palette | Jump to any page without clicking |
| **Vercel** | Dark mode native | Dark is default, light is secondary |
| **Linear** | Keyboard-first | Cmd+K primary navigation, UI secondary |
| **Linear** | Opinionated workflow | Constrained states (Issue → Backlog → In Progress → Done) |
| **Linear** | Grid-based design | All elements align to 8px or 16px grid |
| **Notion** | Settings hierarchy | App settings in left nav, page settings in top-right |
| **Notion** | Real-time sync | Multiple users on same object see changes instantly |
| **Clerk** | User search | Search by email/name, not just by ID |
| **Clerk** | Bulk operations | API supports bulk user create/delete/update |
| **GitHub** | Role granularity | Custom roles with specific permission sets |
| **AWS** | Customizable nav | Hide unused regions/services, reduce cognitive load |
| **Supabase** | No-code data mgmt | Browse/edit tables inline, no SQL required |
| **LaunchDarkly** | Feature flag UI | Complex targeting rules, segments, A/B experiments |
| **Chargebee** | Refund workflows | One-click refund (full or partial), pro-rata on downgrades |
| **Retool** | Speed | Build full CRUD admin in <20 minutes |

---

## Usage Metrics

**Last Updated:** 2026-04-05
**Knowledge Version:** v2 (comprehensive research integration)
**Usage Count:** 18 retrievals across 4 projects
**Status:** PRIMARY PATTERN — in use across the project, and referenced by 3+ other projects
**Relationships:**
- Builds on: [GDPR-patterns] (good/gdpr.md), [UI-UX-standards] (good/ui-ux-production-standards.md), [Quality Framework] (good/quality-framework.md)
- Used by: the project (v1+), ProjectX (v1.2+)
- Supersedes: Original admin-panel-standards.md v1
- Source: Comprehensive market research (60+ sources), SOC 2 / GDPR compliance review, project v1 production patterns

---

## Final Checklist

Before deploying ANY admin panel:
1. ✅ Audit logs created and immutable
2. ✅ RBAC implemented with least privilege
3. ✅ MFA working for admin accounts
4. ✅ GDPR export + delete workflows in place
5. ✅ Server-side pagination on large tables
6. ✅ Error boundaries on all tabs
7. ✅ Destructive actions require confirmation
8. ✅ PII masked in logs and exports
9. ✅ Rate limiting on sensitive endpoints
10. ✅ Session timeout configured (30 min)
11. ✅ Mobile responsive (tested on iPad)
12. ✅ Performance <1s page load time
13. ✅ Design consistent (shadcn/ui or similar)
14. ✅ E2E tests for critical paths
15. ✅ Documentation for admins and compliance
