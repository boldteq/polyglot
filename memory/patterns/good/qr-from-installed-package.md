---
name: QR Code from Already-Installed Package
description: Before adding any QR library to package.json, grep existing deps. InkOS had qrcode@1.5.4 already. Generate data URL via QRCode.toDataURL with brand colors at 2x retina size.
type: pattern
stack: A
source: InkOS Calendar Sprint 1-6 (BookingLinkQR), 2026-04-23
usage_metric: 0
knowledge_version: v1
---

## Context

Koda's first instinct when asked to add a QR code was to install `react-qr-code` or `qrcode.react`. That would have been the third QR package in `node_modules` because `qrcode@1.5.4` was already there (pulled in by another feature).

**The pattern is "grep before install" — not "QR specifically."**

## Pattern

### 1. Before adding any dependency, grep package.json

```bash
grep -E "qr|auth|pdf|image|chart" package.json
```

Common categories where duplicate installs happen:
- QR / barcode generation
- Image manipulation (sharp, jimp, image-size)
- PDF generation (pdf-lib, pdfkit, jspdf)
- Date libraries (date-fns, dayjs, moment)
- Validation (zod, yup, joi)
- Auth helpers (jose, jsonwebtoken)

If a package exists, use it. Don't introduce a second one.

### 2. Component pattern for InkOS QR

`components/calendar/BookingLinkQR.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';

const BRAND_ONYX = '#0F0F0F';
const BRAND_BONE = '#F7F7F5';

export function BookingLinkQR({ studioSlug }: { studioSlug: string }) {
  const { data: url } = useQuery({
    queryKey: ['studio-public-url', studioSlug],
    queryFn: () => `${window.location.origin}/book/${studioSlug}`,
    staleTime: Infinity,
  });

  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;

    QRCode.toDataURL(url, {
      width: 256,         // 2x for retina (renders at 128px display)
      margin: 2,
      color: {
        dark:  BRAND_ONYX,
        light: BRAND_BONE,
      },
    }).then(setDataUrl).catch(() => setDataUrl(null));
  }, [url]);

  if (!dataUrl) return null;

  return (
    <div className="hidden sm:block rounded-md border bg-bone p-4 shadow-card">
      <img src={dataUrl} alt={`Public booking QR for ${studioSlug}`} className="size-32" />
      <p className="mt-2 text-xs text-stone text-center">Scan to book</p>
    </div>
  );
}
```

### 3. Key decisions

- **`useQuery` for the URL**, even though it's synchronous. Keeps cache semantics consistent across server/client renders and respects React Query's data-fetching lifecycle.
- **`useEffect` for the QR generation.** `QRCode.toDataURL` is async and must not run server-side (no canvas).
- **2x retina size.** Request 256px, render at 128px (`size-32`). Crisp on all displays.
- **Brand colors baked in.** Onyx foreground, Bone background. Never pure black/white.
- **`hidden sm:block`.** QR codes are desk-workflow. On mobile the user doesn't need to scan their own screen.
- **Alt text mentions the entity.** Accessibility + SEO.

## Why

- **Duplicate packages add 200-500KB to the bundle** for no reason. `qrcode` + `qrcode.react` + `react-qr-code` can all coexist in a poorly audited repo.
- **Consistent rendering.** If two features use two different QR libs, edge cases differ (error correction levels, margin handling, Unicode support). One lib = one set of bugs.
- **Brand-colored QR is trivial** with `qrcode`'s `color` option. No reason to hand-roll SVG.
- **Server-side cannot run qrcode's canvas path.** Effect + client component is correct.

## Adapted pattern for other features

Same logic applies to:

| Ask | Check first for |
|-----|----------------|
| PDF export | `pdf-lib`, `pdfkit`, `jspdf` |
| Image compression | `sharp`, `jimp` |
| Charts | `recharts`, `chart.js`, `victory` |
| Rich text | `tiptap`, `lexical`, `slate` |
| Calendars | `date-fns`, `dayjs`, `@internationalized/date` |
| Icons | `lucide-react`, `react-icons`, `@heroicons/react` |

**Rule:** One package per category per repo. If you need features the installed one lacks, evaluate whether to extend/wrap, migrate everything to a second lib (costly), or accept the limitation.

## Source

- `components/calendar/BookingLinkQR.tsx`
- `package.json` — `qrcode@1.5.4`
- InkOS Calendar Sprint 1-6, 2026-04-23.
