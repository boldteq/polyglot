---
name: Detail Drawer Action Pattern (4 primary + 2 secondary)
description: Standard layout for entity detail drawers — 4-action primary row, 2-action secondary row, delegation via caller props, inline AlertDialog for destructive action.
type: pattern
stack: A
source: InkOS Calendar Sprint 1-6, 2026-04-23
usage_metric: 0
knowledge_version: v1
---

## Context

Detail drawers in InkOS (booking, client, consent, invoice) need consistent action ergonomics. Early drawers shipped with 7+ mixed-priority buttons, which made the primary workflow ambiguous. Sprint 1-6 locked in a canonical shape.

## Pattern

### Structure

```
┌─────────────────────────────────────────────┐
│  [Drawer header: title + close]             │
├─────────────────────────────────────────────┤
│  [Drawer body: scrollable content]          │
├─────────────────────────────────────────────┤
│  Primary row:                               │
│    [Edit] [Reschedule] [Message] [Cancel]   │
│  Secondary row:                             │
│    [Open full page]  [Extend deadline*]     │
└─────────────────────────────────────────────┘
```

*Extend deadline only renders if booking has an active deposit deadline.

### Delegation contract (critical)

```tsx
// components/appointments/AppointmentDetailDrawer.tsx
type Props = {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (booking: Booking) => void;        // caller opens edit sheet
  onReschedule: (booking: Booking) => void;  // caller opens reschedule flow
};
```

Edit and Reschedule **never** render their own UI — they call back to the parent (`CalendarPageClient`) which owns the state machine for which sheet/dialog is open. This keeps the drawer dumb and the parent authoritative.

### Message button: router push, not handler

```tsx
<Button
  variant="outline"
  onClick={() => router.push(`/messages?to=${booking.client_id}`)}
>
  <MessageSquare className="size-4" /> Message
</Button>
```

Cross-feature navigation is URL-driven, not event-driven. The messages route reads the query param and prefills the compose pane.

### Cancel: inline AlertDialog → PATCH + invalidate

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Cancel</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
      <AlertDialogDescription>
        The client will be notified. This action can be undone within 24 hours.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Keep booking</AlertDialogCancel>
      <AlertDialogAction
        onClick={async () => {
          await fetch(`/api/bookings/${booking.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'cancelled' }),
          });
          queryClient.invalidateQueries({ queryKey: ['bookings'] });
          onOpenChange(false);
        }}
      >
        Cancel booking
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- `AlertDialog` is inline (inside the drawer) — no separate modal state to manage.
- PATCH first, invalidate second, close third. Order matters for optimistic-UI correctness.
- Rust `destructive` variant on trigger, never on primary.

### Secondary row conditional

```tsx
<div className="flex gap-2 text-sm text-stone">
  <Link href={`/bookings/${booking.id}`} className="underline-offset-4 hover:underline">
    Open full page
  </Link>
  {booking.deposit_deadline_at && booking.status === 'hold' && (
    <>
      <span>·</span>
      <button onClick={() => onExtendDeadline(booking)}>Extend deadline</button>
    </>
  )}
</div>
```

## Why

- **4 primary actions is the attention ceiling.** More than 4 and users scan, pick wrong, or miss the important one.
- **Delegation keeps drawers stateless.** The drawer never knows which sheet is open — parent owns that. Makes testing + re-use trivial.
- **Inline AlertDialog avoids state leak.** The "confirm cancel" modal closes with the drawer if the user dismisses everything — no orphan modal over empty canvas.
- **Router push for cross-feature.** `onMessage` handler inside drawer would couple the drawer to messaging implementation. URL param keeps it decoupled.
- **Secondary row is non-obvious, on-purpose.** Power-user actions sit in quieter typography (Stone, 14px underline) so they don't compete with the primary row.

## Copy rules

- Primary button verbs: `Edit`, `Reschedule`, `Message`, `Cancel`. Never `Click to edit`, never `Submit`.
- AlertDialog question: `{action} this {entity}?` — short, literal.
- Dismiss button: `Keep {entity}` — affirms the non-destructive path.
- Destructive confirm: `{action} {entity}` — matches the trigger verb.

## When to apply

Any authenticated-app detail drawer in Stack A:
- Bookings, Clients, Invoices, Consent forms, Payroll entries, Inventory items.
- Copy the file skeleton from `AppointmentDetailDrawer.tsx`.
- Swap the entity type, keep the 4+2 shape.

## When NOT to apply

- Public-facing views (`/book/[slug]`, `/consent/[token]`) — no drawers, full-page flows only.
- Admin platform tables — use row-inline actions, not drawer.
- Bulk-action surfaces — use toolbar, not drawer per item.

## Source

- `components/appointments/AppointmentDetailDrawer.tsx`
- `app/(app)/calendar/_components/CalendarPageClient.tsx`
- InkOS Calendar Sprint 1-6, 2026-04-23.
