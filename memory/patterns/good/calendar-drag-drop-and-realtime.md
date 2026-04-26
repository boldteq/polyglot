---
name: Calendar Drag-Drop + Realtime Patterns (Stack A)
description: Production-validated patterns from InkOS 10-phase calendar rebuild (2026-04-23). Custom CSS Grid + dnd-kit (alternative to paid FullCalendar resource plugin), React Query optimistic mutations with scoped concurrency, Supabase Realtime prerequisites, non-blocking SMS dispatch, WCAG-compliant drag handles.
type: pattern
category: good
stack: A
priority: high
source: InkOS, 2026-04-23
usage_metric: 0
knowledge_version: v1
---

# Calendar Drag-Drop + Realtime Patterns (Stack A)

Extracted from the 10-phase InkOS calendar rebuild (29 feature changes + 11 audit fixes + 36 tests, all gates green).

## 1. Custom CSS Grid + dnd-kit (skip paid FullCalendar resource plugin)

**Context:** Multi-resource (multi-chair, multi-artist, multi-room) Day view with drag-to-reschedule.
**Problem:** FullCalendar's resource-timeline plugin requires a paid Premium license. Most Boldteq SaaS projects don't justify the seat fees.
**Solution:** Build a custom CSS Grid (rows = time slots, columns = resources) and mount dnd-kit `DndContext` over it. `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`. Each booking card is a `useDraggable` item; each cell is a `useDroppable` target keyed by `${chairId}:${timeSlot}`.

**Reference implementation:** `components/calendar/DayChairGrid.tsx` (InkOS).

**When to use:**
- Day view with >1 resource column
- Drag-to-reschedule or drag-to-reassign semantics
- License constraint (no paid FullCalendar)
- Branding requires pixel control over time-grid styling

**When NOT to use:**
- Week or Month view — FullCalendar handles these cleanly on the free tier, keep them
- Gantt-style dependencies or complex recurrence — FullCalendar or custom SVG is better

**Branching in the same page:** `view === 'day' && hasResources ? <DayChairGrid /> : <FullCalendar />`. Any future calendar enhancement must handle both branches.

## 2. React Query optimistic mutation with `scope: { id }` for serializing concurrent mutations

**Context:** User drags booking A, then immediately drags booking B before A's server response returns. Without scoping, React Query runs them in parallel, and if both hit the same row the optimistic cache becomes inconsistent.
**Pattern:**
```ts
const mutation = useMutation({
  scope: { id: bookingId }, // serializes mutations per-booking
  mutationFn: ({ bookingId, newStart, newChairId }) => patchBooking(...),
  onMutate: async (vars) => {
    await queryClient.cancelQueries({ queryKey: ['bookings', 'calendar'] });
    const prev = queryClient.getQueryData(['bookings', 'calendar']);
    queryClient.setQueryData(['bookings', 'calendar'], optimisticUpdate);
    return { prev };
  },
  onError: (err, vars, ctx) => queryClient.setQueryData(['bookings', 'calendar'], ctx?.prev),
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['bookings', 'calendar'] }),
});
```
**Reference:** `app/(app)/calendar/_components/CalendarPageClient.tsx`.

**Why it matters:** Without `scope`, drag spam produces torn state (booking appears in two chairs, or snaps back mid-drag). With it, mutation N waits for N-1 to settle before optimistically updating.

## 3. Supabase Realtime — the 3-prerequisite checklist

Realtime silently drops updates when any of these is missing. Every new table added to a Realtime channel must satisfy ALL THREE:

1. **Table in `supabase_realtime` publication:**
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
   ```
2. **`REPLICA IDENTITY FULL`** — required so UPDATE and DELETE events carry the full old row (needed for filter correctness, otherwise client can't tell if an update should enter/leave its filter):
   ```sql
   ALTER TABLE public.bookings REPLICA IDENTITY FULL;
   ```
3. **RLS SELECT policies** — Realtime only streams rows the user can SELECT. If the policy is missing or wrong, updates arrive empty or never arrive. Test with the authenticated user in the SQL editor before debugging client code.

**Reference:** `supabase/migrations/20260429100300_calendar_realtime_publication.sql`, `hooks/calendar/use-bookings-realtime.ts` (InkOS).

**Debug order when a Realtime channel is silent:**
1. Check `pg_publication_tables` for the table
2. Check `pg_class.relreplident = 'f'` for FULL replica identity
3. Run the equivalent SELECT as the logged-in user in SQL editor
4. Only then suspect the JS client config

## 4. Non-blocking SMS / email / side-effect dispatch inside API PATCH handlers

**Context:** PATCH `/api/bookings/[id]` updates a booking, then should enqueue an SMS notification. SMS provider could be slow or down. Don't crash the mutation if the side effect fails.
**Pattern:**
```ts
// inside PATCH handler, after DB write succeeds
void dispatchBookingSms(bookingId, studioId).catch((err) => {
  logger.error({ err, bookingId }, 'sms dispatch failed (non-blocking)');
});

return NextResponse.json({ booking });
```
**Reference:** `app/api/bookings/[id]/route.ts` (InkOS).

**Rules:**
- `void` the promise explicitly so TypeScript doesn't complain about floating promises
- ALWAYS `.catch(log)` — unhandled rejections in Next route handlers can crash the Node process in dev
- Insert the `client_communications` row synchronously (so audit trail is committed), enqueue the actual send via BullMQ job
- Never `await` the side effect — client should see the mutation success immediately

## 5. `KeyboardSensor` for WCAG 2.1.1 (keyboard drag) + Enter vs Space separation

**Context:** Dragging with a mouse works, but keyboard-only users can't reschedule bookings without `KeyboardSensor`. WCAG 2.1.1 requires all functionality keyboard-operable.
**Pattern:**
```ts
import { useSensors, useSensor, PointerSensor, KeyboardSensor } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);
```

**Splitting Enter (open edit drawer) from Space (activate drag)** on a draggable card:
```tsx
function handleKeyDown(e: React.KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    openEditDrawer(booking.id);
    return;
  }
  // Delegate Space (and arrows) to dnd-kit's keyboard listener
  listeners?.onKeyDown?.(e);
}
```
**Reference:** `components/calendar/DayChairCard.tsx` (InkOS).

**Why both are needed:**
- dnd-kit's `KeyboardSensor` activates drag on Space + uses arrows for movement
- Cards are clickable to open an edit drawer (Enter should do this)
- Without separation, Enter either activates drag (no edit) or the drag handler swallows everything (no keyboard drag). Splitting in `onKeyDown` gives both.

## Cross-references

- `~/.claude/memory/projects/inkos-lessons.md` — InkOS-specific gotchas
- `~/.claude/memory/patterns/avoid/antipatterns.md` — dnd-kit `activationConstraint` shape trap, drag-handle-on-focusable trap
- `~/.claude/memory/patterns/good/supabase-database-mastery.md` — RLS and publication patterns

---
*Source: InkOS calendar rebuild, 2026-04-23. All patterns proven in 36 passing tests + production build.*
