---
name: NOW Line + Anchored Label Pattern
description: Red horizontal line across calendar timeline + Rust pill with "NOW · H:MM AM/PM" anchored at the line. Pill offset = line topPx - 9 to center the pill on the line.
type: pattern
stack: A
source: InkOS Calendar Sprint 1-6 (DayChairGrid), 2026-04-23
usage_metric: 0
knowledge_version: v1
---

## Context

InkOS brand rule: **the "NOW" sweep bar is the only motion on the dashboard.** It's a signature. But for calendar views (day grid across chairs), a static NOW line is needed to anchor "where are we in the day."

The line alone is too subtle — eyes glance past a 2px line. Adding a small labeled pill at the line makes it unmistakable without violating the motion rule (pill is static, line is static in calendar views).

## Pattern

### Geometry

```
   ┌─────────────────────────────────────┐
   │  10:00 AM                           │
   │  ─────────────────────────          │
   │                                     │
   │  11:00 AM                           │
   ╞══[NOW · 11:23 AM]═══════════════════╡  ← Rust 2px line
   │                                     │
   │  12:00 PM                           │
   └─────────────────────────────────────┘
```

- **Line:** 2px Rust, horizontal, full grid width, `position: absolute`, top = computed.
- **Pill:** Rust background, Bone text, 10px padding-x, 2px padding-y, rounded-full, `position: absolute`, anchored at the same top offset minus 9px (centers pill on line).

### Implementation

```tsx
// components/calendar/DayChairGrid.tsx
function NowIndicator({ dayStart, dayEnd, pxPerMinute }: {
  dayStart: Date;
  dayEnd: Date;
  pxPerMinute: number;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // GUARD: avoid arming in SSR/test — see antipattern in memory
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV === 'test') return;

    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Hide if outside the displayed day window
  if (now < dayStart || now > dayEnd) return null;

  const minutesFromStart = (now.getTime() - dayStart.getTime()) / 60_000;
  const topPx = minutesFromStart * pxPerMinute;

  const timeLabel = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <>
      {/* Line */}
      <div
        role="presentation"
        className="absolute left-0 right-0 h-0.5 bg-rust pointer-events-none z-10"
        style={{ top: `${topPx}px` }}
      />
      {/* Label pill */}
      <div
        role="time"
        aria-label={`Current time: ${timeLabel}`}
        className="absolute left-2 rounded-full bg-rust px-2 py-0.5 text-xs font-semibold text-bone tabular-nums pointer-events-none z-10 shadow-soft"
        style={{ top: `${topPx - 9}px` }}
      >
        NOW · {timeLabel}
      </div>
    </>
  );
}
```

### Offset math — why `topPx - 9`

- Line is 2px tall, centered on `topPx`.
- Pill is ~20px tall (`py-0.5` + `text-xs`).
- To center pill on line: `pillTop = lineTop - (pillHeight / 2 - lineHeight / 2) = topPx - 9`.
- Adjust if you change pill padding or text size. Measure in browser devtools; pixel-perfect.

### Accessibility

- Line: `role="presentation"` — it's decorative.
- Pill: `role="time"` approximation via `aria-label`. Screen readers announce "Current time: 11:23 AM" as a live-region-free timestamp.
- `pointer-events-none` on both — must not intercept click-to-create-booking gestures on the grid.

### Typography rules applied

- `tabular-nums` on the time — `1:00 AM` and `11:00 AM` have the same digit width.
- `font-semibold` not `font-bold` — Inter 600 looks crisper at 12px than 700.
- `text-xs` (12px) — matches `caption` token in the brand board.

## Why

- **Line alone is too quiet.** Users miss 2px horizontal rules on a dense grid.
- **Pill alone is ambiguous.** No line = pill floats, user doesn't know which slot is "now."
- **Combined, they're unmistakable** and still match the brand's stillness rule.
- **Minute-tick interval, not second.** Second-tick wastes renders, distracts the eye. Minute-tick is sufficient.
- **Hide when outside window.** Yesterday's or tomorrow's calendar should not show "NOW" — that view isn't about now.

## When to use

- Calendar day/week grids (InkOS, any scheduling product).
- Timeline views (project gantt, activity log, log streaming).
- Any dense vertical axis where "where am I in this axis" matters.

## When NOT to use

- Summary dashboards — the dashboard NOW sweep bar is animated and serves this purpose.
- Print views — no live cursor.
- Views where "current time" is irrelevant (historical reports, archived data).

## Source

- `components/calendar/DayChairGrid.tsx`
- Brand board v1.0: "Motion" section (only motion on dashboard is the NOW sweep; calendar NOW is static)
- InkOS Calendar Sprint 1-6, 2026-04-23.
