---
name: Smart Linking Suggestion (Server-Verified)
description: Suggest linking a new booking to a nearby existing booking (same client, ±7d). Client sends link_booking_id; server inherits project_id + increments session_number. Never trust client to set linked fields directly.
type: pattern
stack: A
source: InkOS Calendar Sprint 1-6 (SmartBookingSheet), 2026-04-23
usage_metric: 0
knowledge_version: v1
---

## Context

Multi-session tattoos (sleeves, back pieces) span weeks. Each session is its own booking, but they share a `project_id` and an incrementing `session_number` (Session 1 of 4, Session 2 of 4, etc.).

Asking receptionists to remember the project_id is brittle. Detecting the likely sibling booking at create-time is the correct answer.

## Pattern

### 1. Client-side: detect candidate

On client select (inside `SmartBookingSheet`):

```tsx
const { data: recentBookings } = useQuery({
  queryKey: ['bookings', 'recent', clientId],
  queryFn: () => fetch(
    `/api/bookings?client_id=${clientId}&from=${new Date(Date.now() - 7 * 86400_000).toISOString()}`
  ).then(r => r.json()),
  enabled: Boolean(clientId),
});

// Candidate: nearest non-cancelled booking within ±7 days of new booking's date
const candidate = useMemo(() => {
  if (!recentBookings || !newBookingDate) return null;
  const target = new Date(newBookingDate).getTime();
  return recentBookings
    .filter((b: Booking) => b.status !== 'cancelled')
    .map((b: Booking) => ({
      booking: b,
      delta: Math.abs(new Date(b.start_at).getTime() - target),
    }))
    .filter(x => x.delta <= 7 * 86400_000)
    .sort((a, b) => a.delta - b.delta)[0]?.booking ?? null;
}, [recentBookings, newBookingDate]);
```

### 2. Render inline Sparkles banner

```tsx
{candidate && (
  <div className="rounded-md border border-stone/20 bg-accent p-3 text-sm">
    <div className="flex items-center gap-2 text-onyx">
      <Sparkles className="size-4 text-rust" />
      <span>
        Link to <strong>{candidate.project_name}</strong> · Session {candidate.session_number}?
      </span>
    </div>
    <div className="mt-2 flex gap-2">
      <Button size="sm" onClick={() => setLinkBookingId(candidate.id)}>
        Yes, link
      </Button>
      <Button size="sm" variant="outline" onClick={() => setLinkBookingId(null)}>
        No, new project
      </Button>
    </div>
  </div>
)}
```

### 3. Client sends `link_booking_id`, server owns the inheritance

```tsx
// Client POST body
{
  client_id, service_id, artist_id, start_at, duration_min,
  link_booking_id: linkBookingId, // optional UUID of referenced booking
}
```

```ts
// app/api/bookings/route.ts — server handler (trusted logic)
const body = CreateBookingSchema.parse(await req.json());

let project_id: string | null = null;
let session_number = 1;

if (body.link_booking_id) {
  // Verify referenced booking exists AND belongs to the same studio AND same client
  const { data: ref } = await supabase
    .from('bookings')
    .select('project_id, session_number, studio_id, client_id')
    .eq('id', body.link_booking_id)
    .single();

  if (!ref || ref.studio_id !== studioId || ref.client_id !== body.client_id) {
    throw new Error('Invalid link_booking_id');
  }

  project_id     = ref.project_id;
  session_number = (ref.session_number ?? 1) + 1;
}

const { data: created } = await supabase
  .from('bookings')
  .insert({
    studio_id: studioId,
    client_id: body.client_id,
    service_id: body.service_id,
    artist_id: body.artist_id,
    start_at: body.start_at,
    duration_min: body.duration_min,
    project_id,       // server-derived
    session_number,   // server-derived
  })
  .select()
  .single();
```

## Why

- **Client can't be trusted with `project_id` or `session_number`.** A malicious client could set `session_number: 99` or link to another studio's project. Server re-reads the reference row and derives both fields server-side.
- **`link_booking_id` is a pointer, not a payload.** The client says *"inherit from this booking"* — not *"write these values."*
- **Cross-studio leak prevention.** Always verify `ref.studio_id === studioId` before inheriting. Missing this check = tenant data leak.
- **Client verification also needed.** `ref.client_id === body.client_id` prevents linking a Session 2 for Alice to Bob's booking.
- **Non-cancelled filter matters.** Cancelled bookings shouldn't suggest sessions. A receptionist seeing "Session 2 of <cancelled Session 1>" is confusing.
- **±7 day window is heuristic, tunable.** Adjust per product. For tattoo multi-session: 7 days is the common healing gap. For fitness PT: 48 hours might be better.

## Copy rules

- `Link to {project_name} · Session {N}?` — question mark signals suggestion, not decision.
- `Yes, link` / `No, new project` — pill buttons, not full-width.
- Sparkles icon in Rust (the only time Rust decorates an accent banner — earned because it's literally the AI/smart moment).

## When to use

- Any Stack A product with multi-session/multi-entity sequences:
  - Tattoo sessions → project
  - Coaching packages → program
  - Project milestones → project
  - Invoice installments → invoice group

## When NOT to use

- Single-session entities (haircuts, piercings) — no sequencing.
- High-volume write paths where the extra query is hot (use a materialized view or pre-compute).
- When clients never repeat within the window.

## Source

- `components/calendar/SmartBookingSheet.tsx` — candidate detection + banner
- `app/api/bookings/route.ts` — server-side inheritance
- InkOS Calendar Sprint 1-6, 2026-04-23.
