---
name: InkOS Clients v2 Deep Fix (11 Issues)
description: Complete fix pass for QA-found issues in clients list, profile, tags, and bulk actions
type: project
---

## Summary

Deep fix pass completed for 11 client-facing bugs in InkOS clients v2 UI. All fixes implemented, verified (typecheck/lint/build ✓), and pushed to main as commit `f2d94bc`.

## The 11 Fixes

### 1. Contact Icon Tooltip — Correct Channel Value
**Root**: ClientsTable passed `email ?? phone` to tooltip regardless of which method was preferred.
**Fix**: Created `getContactValue(method, email, phone)` helper that dispatches on method before selecting value. Phone method → phone value, email method → email value.
**Location**: components/clients/ClientsTable.tsx:45-56 (helper), line 253 (usage).

### 2. HTML Leaking into Allergies Textarea
**Root**: TipTap-stored HTML (e.g., `<p>latex</p>`) from rich-text notes was seeded directly into plain textarea in ClientDialog.
**Fix**: Created lightweight `htmlToPlainText()` helper in lib/utils.ts (lines 80-101). Strips tags, decodes HTML entities, collapses whitespace. Used in:
- ClientDialog.tsx:224 when hydrating allergies field
- NoteCard.tsx:112 when rendering note body
**Why minimal**: Avoids adding sanitizer dependency; regex-based approach sufficient for internal use.

### 3. Allergy Alert Strip on Client Profile
**Root**: Profile didn't show allergy text despite being safety-critical.
**Fix**: 
- New helper `fetchPinnedAllergiesBody()` in lib/clients/health.ts:40-64 fetches body of pinned allergies note.
- Server-side in layout.tsx:82, added parallel fetch to SSR bundle.
- ClientProfileHero renders compact Rust-tinted strip (lines 307-324) with icon, "Allergies & medical" label, and first 240 chars of plain text.
**Key detail**: Rust @ 8% bg + 20% border, with Stethoscope icon — visual hierarchy matches critical importance.

### 4. Tags Popover — Inline Creation (No Stale Reload)
**Root**: Empty library state only offered "Manage tags" link; user had to leave and return.
**Fix**:
- Added `TAG_COLOR_ROTATION` array (7 colors, cycles for successive creates).
- New `createAndApply()` function in ClientTagEditor.tsx:99-149:
  - Creates tag via POST `/api/client-tags`
  - Checks for case-insensitive duplicates (avoids round-trip)
  - Auto-applies to current client via bulk-tag endpoint
  - Calls `router.refresh()` for optimistic update
- Inline "Create tag" input in empty-library state (lines 197-223).
- "Create 'X'" button in CommandEmpty (line 244-255) and footer (line 279-293).
**Color rotation logic**: `pickTagColor(existingCount % ROTATION.length)` → first tag purple, next blue, next emerald, etc.

### 5. Archive Filter Bug — Shows 4 When 1 Archived
**Root**: Query param `archived='any'` (the API's "no filter" value) was used when showing archive view.
**Fix**: One-line change in lib/clients/list-query.ts:122 — `'any'` → `'true'`.
**Why**: 'any' means "ignore the filter" (returns both archived and active). 'true' means "only archived_at IS NOT NULL".

### 6. Archive Row Colors — Dark Background Fixed
**Root**: CSS tokens `--color-archive-bg: oklch(14% 0.02 85)` (near-black) were written for dark mode but applied universally.
**Fix**: 
- Light mode (default): Bone tint `oklch(95% 0.005 85)` bg + `oklch(88% 0.01 85)` border (app/globals.css:431-433).
- Dark mode override: Original near-black values in `:root.dark` block (lines 1059-1061).
- Selection contrast: Selected state uses lighter Bone (`oklch(92% 0.008 85)`) so checkbox remains visible.
- Visual quietness: Added `filter: grayscale(20%)` + `opacity: 0.75` to make archived rows feel archived (not disabled, just quiet).
**Location**: app/globals.css lines 427-433, 1059-1061, 1616-1624.

### 7. Back to Active — Selection Clears (No Flicker)
**Root**: Bulk action bar didn't vanish instantly when switching back to active view.
**Fix**: Added explicit `setSelectedIds([])` call *first* in ArchivedBanner onExit (ClientsPageClient.tsx:533) so bar disappears before view re-renders.
**Why matters**: User sees one smooth transition instead of flicker where bar stays for one frame.

### 8. Archive View Bulk Actions — Only Restore
**Root**: BulkActionsBar rendered Edit/Archive/Tags/Export (all irrelevant or no-op in archive view).
**Fix**: 
- Added `mode?: 'active' | 'archived'` prop to BulkActionsBar (line 39).
- When `mode='archived'`: show only Restore + Clear selection (lines 196-209, 1616-1624).
- When `mode='active'`: show Edit, Add tag, Remove tag, Export, Archive (lines 211-366).
- New `handleRestore()` function (lines 68-88) calls `/api/clients/[id]/restore` for each selected ID.
- Pass `mode={filters.showArchived ? 'archived' : 'active'}` from ClientsPageClient (line 545).

### 9. Health Alert Dots on List — Batch Fetch (No N+1)
**Root**: Dots only rendered on profile (per-client fetch), not on list rows. No batch endpoint existed.
**Fix**:
- **New endpoint**: GET `/api/clients/health-summaries?ids=uuid1,uuid2,...` (app/api/clients/health-summaries/route.ts).
  - Validates comma-separated UUIDs (max 50), rate-limited, RLS-scoped to studio.
  - Calls `fetchClientHealthSummariesForIds()` and returns JSON record.
- **SSR**: page.tsx now fetches summaries for initial client set in parallel (lines 56-65), passes as `initialHealthSummaries` prop.
- **Client-side**: ClientsPageClient seeded with initial summaries (line 182), then useEffect (lines 302-333) batch-fetches missing summaries whenever client list changes (with AbortController cleanup).
- **Wired**: BulkActionsBar/ClientRow receive `healthSummaries` map to render HealthAlertBadge dots.
**Result**: Initial paint has dots (no flash), infinite scroll fetches incrementally, zero N+1 queries.

### 10. Bulk Edit Dropdowns — `__no_change__` Display
**Root**: SelectValue rendered raw `__no_change__` string instead of a user-friendly label.
**Fix**:
- Custom SelectTrigger render in BulkEditDialog (lines 168-172, 192-196).
- When `value === NO_CHANGE`, show italic Stone `"— Leave unchanged —"` instead of `<SelectValue />`.
- SelectItem also renders italic text for NO_CHANGE option.
**Why italic + Stone**: Signals to user this is an intentional default, not a broken state (restrained editorial tone).

### 11. Empty State Copy Polish
**Root**: Minor UX — empty states didn't set clear expectations.
**Fix**: 
- **Empty studio** (no clients ever): "Add your first client" CTA + "CSV import lands next sprint" message (sets expectation, not a broken link).
- **Filtered zero** (clients exist, filters exclude all): "No clients match these filters" + "Clear filters" CTA (already correct).
**Location**: ClientsPageClient.tsx lines 600-605.
**Why separate logic**: The first message invites action (import feature coming); the second explains the filter. Both needed for good UX.

## New Code Artifacts

### lib/utils.ts — `htmlToPlainText()`
```typescript
export function htmlToPlainText(input: string | null | undefined): string {
  if (!input) return ''
  const withoutTags = input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  const decoded = withoutTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    // ... entity decoding
  return decoded.replace(/\s+/g, ' ').trim()
}
```
Used by: ClientDialog, NoteCard, ClientProfileHero.

### lib/clients/health.ts — `fetchPinnedAllergiesBody()`
Fetches and returns the body text of the pinned allergies note for a client.
Used by: layout.tsx SSR, passed to ClientProfileHero.

### app/api/clients/health-summaries/route.ts (NEW)
Batch-fetch endpoint for client health summaries. Validates up to 50 comma-separated UUIDs.
Called by: ClientsPageClient useEffect on list changes, initial SSR.

### components/clients/ClientTagEditor.tsx — `createAndApply()` + color rotation
Inline tag creation with POST `/api/client-tags` + auto-apply via bulk-tag. Color cycles through 7 shades.

## Verification Checklist

✅ **Builds**: `pnpm build` → all routes compiled, zero errors.
✅ **Types**: `pnpm typecheck` → no violations.
✅ **Lint**: `pnpm lint` → no violations.
✅ **Grep verification**: All 11 fixes confirmed present by symbol search.
✅ **Commit**: f2d94bc pushed to main.

## Architecture Lessons

1. **Archive state as first-class citizen**: Not just a boolean flag on rows. Needs mode switching on every component that changes behavior (BulkActionsBar, empty states, CSS).

2. **Batch health fetches hybrid model**: SSR initial load + client-side incremental is best for both fast first paint and infinite scroll. One request per batch, not one per row.

3. **HTML stripping minimal**: No need for full sanitizer in this context. Regex + entity decode is safe enough for internal rendering.

4. **Tag creation optimistic**: `router.refresh()` after POST ensures the library updates without page reload, keeping the flow fast. Color rotation cycles smoothly.

5. **Selective button rendering for mode**: BulkActionsBar is cleaner with a `mode` prop that gates entire button groups rather than individual disabled states.

6. **CSS token override patterns**: Light mode as root default, dark mode in `:root.dark`. Avoids color-scheme flicker when theme toggles.

## Non-Goals (Deferred)

- CSV import UI (referenced in copy as "next sprint" — scaffolding only).
- Full rich-text rendering in NoteCard (htmlToPlainText sufficient for v1; DOMPurify + renderer tracked for v2).
- Admin "Delete permanently" for archived clients (would require strong confirmation UX; restore+rearchive + eventual purge is safer).
- Undo for bulk restore (single toast restore sufficient for v1).

## Agents Engaged

- **Koda**: All React/Next.js component + API handler code.
- **Dato**: None (no schema changes, no migrations).
- **Vega**: Archive row CSS tokens + selection contrast review.
- **Quill**: Empty state copy ("CSV import lands next sprint").
- **Sage**: Code review gate (typecheck/lint/build verification).

All verified and clean on final merge.
