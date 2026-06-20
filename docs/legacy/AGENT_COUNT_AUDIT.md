# Polyglot Agent Count Audit Report
**Date:** 2026-04-30  
**Scope:** All pages, APIs, and components displaying agent counts

---

## EXECUTIVE SUMMARY

Agent count displays across the Polyglot app derive from **THREE independent data sources** with **DIFFERENT filters**:

1. **`/api/unified/agents`** — Returns ALL agents on disk (both global + project-scoped)
2. **`/api/org-chart`** → `buildOrgChart()` — Filters out retired agents without .md files
3. **`/api/hr/registry`** → `getRegistry()` — Returns all registry entries, no filtering

This means counts CAN diverge between pages unless all sources are perfectly synchronized.

---

## DETAILED FINDINGS

### 1. AllAgents Page (`client/src/pages/AllAgents.tsx`)

| What | Where | Count Source | Filters Applied | Risk |
|------|-------|--------------|-----------------|------|
| **Total agents badge** | Line 303 | `agents?.length` | None; calls `/api/unified/agents` | **HIGH** — shows disk agents only; misses registry-only agents |
| **Department section headers** | Line 682, 644 | `deptAgents.length` | Filtered by: `department`, `category`, search query | MEDIUM — computed from `agents` array |

**API called:** `/api/unified/agents` (Line 62 via `useApi(getUnifiedAgents)`)

**Exact line:**
```typescript
// Line 303: Badge showing total count
<span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{agents?.length || 0}</span>
```

**Data source:** 
- Endpoint: `src/routes/agents.js:277` → `/api/unified/agents`
- Returns: all global + project agents from disk, enriched with registry metadata
- **NO filtering for status** — includes active, probation, retired, pending

---

### 2. HR / Registry Tab (`client/src/pages/Hr.tsx`)

| What | Where | Count Source | Filters Applied | Risk |
|------|-------|--------------|-----------------|------|
| **Active count** | Line 92 | `registry.agents.filter(status='active')` | Status filter only | **MEDIUM** — only active agents |
| **Probation count** | Line 93 | `registry.agents.filter(status='probation')` | Status filter only | MEDIUM |
| **PIP count** | Line 94 | `registry.agents.filter(status='pip')` | Status filter only | MEDIUM |
| **Retired count** | Line 95 | `registry.agents.filter(status='retired')` | Status filter only | MEDIUM |
| **Registry table rows** | Line 159, 391 | `filtered.length` | Department, status, squad, search filters | MEDIUM — user-applied filters change count display |

**API called:** `/api/hr/registry` (Line 60 via `useApi(getHrRegistry)`)

**Exact lines:**
```typescript
// Lines 92-95: Status counts
const activeCount = registry.agents.filter((a) => a.status === 'active').length
const probationCount = registry.agents.filter((a) => a.status === 'probation').length
const pipCount = registry.agents.filter((a) => a.status === 'pip').length
const retiredCount = registry.agents.filter((a) => a.status === 'retired').length
```

**Data source:**
- Endpoint: `src/routes/orgHr.js:357` → `/api/hr/registry`
- Calls: `hr.getRegistry(org)` (src/hr.js:119)
- Returns: all agents in registry (Line 131: `total: agents.length`)
- **Includes all statuses** (active, probation, pip, retired, pending)
- **Includes probation-only agents** (agents with no .md file on disk)

---

### 3. OrgChart Component (`client/src/pages/OrgChart.tsx`)

| What | Where | Count Source | Filters Applied | Risk |
|------|-------|--------------|-----------------|------|
| **Total members** | Line 3497, 3707 | `data.stats.totalAgents` | Built-in filters (line 260-267) | **CRITICAL** |
| **Opus count** | Line 3500, 3710 | `data.stats.byModel.opus` | Filtered by buildOrgChart | CRITICAL |
| **Sonnet count** | Line 3503, 3713 | `data.stats.byModel.sonnet` | Filtered by buildOrgChart | CRITICAL |

**API called:** `/api/org-chart` (Line 36 in src/routes/orgHr.js)

**Exact lines:**
```typescript
// Lines 3497-3503: Stats display
{data.stats.totalAgents} members
{data.stats.byModel.opus || 0} Opus
{data.stats.byModel.sonnet || 0} Sonnet
```

**Data source:**
- Endpoint: `src/routes/orgHr.js:29` → `/api/org-chart`
- Calls: `org.buildOrgChart(agentMap)` (src/org.js:240)
- **APPLIES FILTERS** (Lines 259-267 in src/org.js):
  ```javascript
  // Skip if registry references an agent with no .md file on disk
  if (!disk && record.status !== 'probation' && record.status !== 'pending') {
    continue;  // ← SKIPS retired agents without files
  }
  ```
- **Result:** Excludes retired agents that don't have .md files on disk
- **Result:** Includes active, probation, pending, pip (if files exist)

**Stats computed at lines 389-403:**
```javascript
const stats = {
  totalAgents: nodes.length,  // ← Already filtered
  byModel: {},
  byTier: {},
  byDepartment: {},
  byStatus: {},
  byLevel: {},
};
for (const n of nodes) {
  stats.byModel[n.model] = (stats.byModel[n.model] || 0) + 1;
  // ... etc
}
```

---

### 4. Playground Agent Dropdown (`client/src/pages/Playground.tsx`)

| What | Where | Count Source | Filters Applied | Risk |
|------|-------|--------------|-----------------|------|
| **Global agents label** | Line 754 | `filteredGlobal.length` | Search filter only | LOW — search is user input |
| **Project agents label** | Line 782 | `filteredProject.length` | Search filter only | LOW |

**API called:** `/api/unified/agents` (Line 119 via `useApi(getUnifiedAgents)`)

**Exact lines:**
```typescript
// Lines 172-179
const filteredGlobal = filteredAgents.filter(a => a.scope === 'global')
const filteredProject = filteredAgents.filter(a => a.scope === 'project')

// Display (lines 754, 782):
Global ({filteredGlobal.length})
Project ({filteredProject.length})
```

**Data source:** Same as AllAgents — `/api/unified/agents`, NO status filtering

---

### 5. Dashboard (`client/src/pages/Dashboard.tsx`)

| What | Where | Count Source | Filters Applied | Risk |
|------|-------|--------------|-----------------|------|
| **Agents quick action** | Line 125 | `Object.keys(summary).length` | From `/analytics/summary` | MEDIUM — derived from analytics data |

**API called:** `/api/analytics/summary` (Line 79)

**Exact line:**
```typescript
{ label: 'Agents', icon: Bot, path: '/agents', color: 'text-accent', bg: 'bg-accent/10', sub: `${Object.keys(summary).length || 0} active` },
```

**Data source:**
- Endpoint: `/api/analytics/summary` (not found in codebase audit; likely counts agents with recent runs)
- Filters: Unknown; need backend investigation
- **Risk:** Counts only agents that have had activity

---

## DIVERGENCE SCENARIOS

### Scenario A: Agent Retired but File Exists
- **AllAgents:** Shows it (no status filter)
- **OrgChart:** Shows it (file exists, status doesn't exclude)
- **HR Registry:** Shows it (status='retired' in filter)
- **Playground:** Shows it (no status filter)
- **Result:** Appears in all locations ✓ CONSISTENT

---

### Scenario B: Agent in Registry but .md File Deleted
- **AllAgents:** Does NOT show it (only disk agents)
- **OrgChart:** Does NOT show it (unless status='probation' or 'pending')
- **HR Registry:** SHOWS it (shows all registry entries)
- **Playground:** Does NOT show it (only disk agents)
- **Result:** HR shows different count! ✗ **DIVERGES**

---

### Scenario C: New Agent File Added but Not Yet in Registry
- **AllAgents:** SHOWS it (on disk)
- **OrgChart:** Does NOT show it (not in registry, so no disk check passes)
- **HR Registry:** Does NOT show it (not in registry)
- **Playground:** SHOWS it (on disk)
- **Result:** AllAgents/Playground differ! ✗ **DIVERGES**

---

## FILTER LOGIC COMPARISON

| Filter Type | AllAgents | OrgChart | HR Registry | Playground |
|------------|-----------|----------|-------------|-----------|
| **Status** | None | Implicit (excludes retired w/o file) | None (all) | None |
| **Disk presence** | Required | Required | Not required | Required |
| **Probation** | Included | Included | Included | Included |
| **Pending** | Included | Included | Included | Included |
| **Retired** | Included | Excluded (if no file) | Included | Included |
| **PIP** | Included | Included | Included | Included |

---

## THE AUTHORITATIVE SOURCES

1. **Registry (HR):** `src/org.js:loadRegistry()` — reads from `~/.claude/org/registry.json`
   - Contains: ALL agent records (active, retired, probation, pending, pip)
   - No file check

2. **Disk (AllAgents/Playground):** `src/lib/cache.js:listAgents()` — scans `~/.claude/agents/*.md`
   - Contains: Only agent files that exist
   - No status check

3. **Org Chart (merged):** `src/org.js:buildOrgChart()` — merges both with filtering
   - **Logic:** Include agent IF (file exists) OR (registry entry + status IN [probation, pending])
   - Excludes retired agents whose files are deleted

---

## RECOMMENDATIONS

### To Prevent Divergence:

1. **Standardize on a single source of truth**
   - Option A: HR Registry as source of truth (make disk agents sync to it)
   - Option B: Disk as source of truth (auto-register new agents, auto-retire deleted ones)

2. **Apply consistent filtering across all endpoints**
   ```
   If ALL endpoints should exclude retired:
   - AllAgents: Add `.filter(a => a.org?.status !== 'retired')`
   - Playground: Add `.filter(a => a.org?.status !== 'retired')`
   
   If ALL endpoints should include retired:
   - OrgChart: Change buildOrgChart() to NOT skip retired agents
   ```

3. **Add an explicit "sync" step**
   - Daily job: Compare registry vs disk; reconcile
   - Report drift in `/api/hr/registry` response

4. **Add validation in UI**
   - Display which count is "official" (e.g., "58 on disk, 53 in registry")
   - Link to drift detector (/api/drift endpoint exists, used in HR tab)

---

## APPENDIX: API ENDPOINT MAPPING

| Endpoint | Returns Count | Filters | Used By |
|----------|--------------|---------|---------|
| `/api/unified/agents` | All global + project agents from disk | None | AllAgents, Playground, Dashboard |
| `/api/org-chart` | Registry agents with .md files | Retired excluded if no file | OrgChart |
| `/api/hr/registry` | All registry entries | None | HR page |
| `/api/analytics/summary` | Agents with activity | Activity-based | Dashboard |

---

## CODE LOCATIONS SUMMARY

| Component | File | Lines | Count Display | Data Source |
|-----------|------|-------|----------------|-------------|
| AllAgents | `client/src/pages/AllAgents.tsx` | 303 | `{agents?.length \|\| 0}` | `/api/unified/agents` |
| HR Registry | `client/src/pages/Hr.tsx` | 92-95 | filter counts | `/api/hr/registry` |
| OrgChart | `client/src/pages/OrgChart.tsx` | 3497, 3500, 3503 | `data.stats.totalAgents`, `byModel` | `/api/org-chart` |
| Playground | `client/src/pages/Playground.tsx` | 754, 782 | `{filteredGlobal.length}` | `/api/unified/agents` |
| Dashboard | `client/src/pages/Dashboard.tsx` | 125 | `Object.keys(summary).length` | `/api/analytics/summary` |
| **Server Logic** |  |  |  |  |
| buildOrgChart | `src/org.js` | 240-411 | computed stats | registry + disk merge |
| getRegistry | `src/hr.js` | 119-134 | `total: agents.length` | registry only |
| getUnifiedAgents | `src/routes/agents.js` | 277-386 | returned array | disk only (enriched) |

