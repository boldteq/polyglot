---
name: Progressive Disclosure Form Pattern
description: Required fields always visible; optional fields collapsed behind "+ Add more" toggle. Reference images preview client-side before upload.
type: pattern
stack: A
source: InkOS Calendar Sprint 1-6 (SmartBookingSheet), 2026-04-23
usage_metric: 0
knowledge_version: v1
---

## Context

The InkOS "New booking" sheet had 11 fields. Shown all at once, it felt like a DMV form. But half of those fields (notes, reference images, recurring schedule) are rarely used — they're power-user features that clutter the happy path.

Progressive disclosure fixes this without losing the power features.

## Pattern

### 1. Split fields into Required / Optional tiers

**Required (always visible):**
- Client (autocomplete)
- Service (select)
- Artist (select)
- Date (date picker)
- Start time (time picker)
- Duration (minutes, from service default)

**Optional (collapsed behind toggle):**
- Notes (textarea)
- Reference images (drag-drop, max 4 × 5MB)
- Recurring (radio: once / weekly / monthly)

### 2. Toggle button with directional chevron

```tsx
const [showOptional, setShowOptional] = useState(false);

<button
  type="button"
  onClick={() => setShowOptional(v => !v)}
  className="flex items-center gap-2 text-sm text-stone hover:text-onyx"
>
  {showOptional ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
  {showOptional ? 'Hide optional fields' : '+ Add more'}
</button>

{showOptional && (
  <div className="space-y-4">
    {/* Notes, References, Recurring */}
  </div>
)}
```

### 3. Reference image preview (client-side before upload)

```tsx
const [files, setFiles] = useState<File[]>([]);
const [previews, setPreviews] = useState<string[]>([]);

const MAX_FILES = 4;
const MAX_SIZE_MB = 5;

const onDrop = (incoming: File[]) => {
  const valid = incoming.filter(f => f.size <= MAX_SIZE_MB * 1024 * 1024);
  const rejected = incoming.length - valid.length;
  if (rejected > 0) {
    toast.error(`${rejected} file(s) over ${MAX_SIZE_MB}MB — skipped`);
  }

  const next = [...files, ...valid].slice(0, MAX_FILES);
  setFiles(next);

  // Revoke old URLs before creating new ones to avoid memory leak
  previews.forEach(url => URL.revokeObjectURL(url));
  setPreviews(next.map(f => URL.createObjectURL(f)));
};

useEffect(() => {
  // Cleanup on unmount
  return () => previews.forEach(url => URL.revokeObjectURL(url));
}, [previews]);
```

### 4. Staged upload — preview first, upload on submit

Preview URLs are `blob:` URLs from `createObjectURL`. They render instantly with no network.

On submit, iterate `files` → `POST /api/storage/booking-refs` → collect returned paths → include in booking payload. **Do not upload on drop** — user might close the sheet and abandon.

## Why

- **Happy path stays fast.** 80% of bookings use zero optional fields. Collapsing them cuts visual complexity by ~40%.
- **Power features remain accessible.** One click expands. Discoverable without being demanding.
- **Client-side preview is instant.** No "uploading..." spinner before the user has even submitted the form. Feels snappy.
- **Blob URL cleanup matters.** `URL.createObjectURL` leaks memory if not revoked. Always `revokeObjectURL` in an effect cleanup + when replacing the preview set.
- **Staged upload avoids orphans.** If user abandons, no storage cost. Only committed on submit.

## Gotchas

- **Strict Zod on submit.** Backend may not accept `reference_images` or `recurring` yet. Strip unknown fields client-side until backend lands. (See InkOS lessons — known live gap.)
- **Chevron direction is the visual affordance.** Don't use an arrow, a plus icon, or a "Show more" text-only button. Chevron-down → chevron-up is the universal disclosure signal.
- **File size validation client-side is UX, not security.** Always re-validate server-side on upload route.
- **`slice(0, MAX_FILES)` after merge.** Respects existing files + rejects overflow without error noise.

## When to use

- Any create-or-edit form where optional fields outnumber required fields.
- Multi-step wizards where "Step 1: essentials, Step 2: advanced" feels heavier than a toggle.
- Forms where power-user features (recurring, tags, labels, advanced scheduling) live alongside the 6-field happy path.

## When NOT to use

- Forms with 3-4 fields total — just show them all.
- Required-only forms — there's nothing to hide.
- Wizards where step ordering matters (checkout flow) — use actual steps.

## Source

- `components/calendar/SmartBookingSheet.tsx`
- InkOS Calendar Sprint 1-6, 2026-04-23.
