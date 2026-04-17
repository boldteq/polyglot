# Resend Transactional Email Patterns

**Created:** 2026-04-18, v1.0.
**Owned by:** `postmark` agent (hired Cohort 5).
**Loaded by:** postmark + any Pod A/B/C backend agent integrating Resend.

---

## Why Resend (not SendGrid / Postmark / Mailgun)

Resend is the standard transactional email provider for ALL Boldteq projects (decision locked 2026-04-18 in HR scale-up plan):
- React Email native support (use React components as email templates)
- Excellent Next.js 16 + Supabase integration story
- Webhook events for delivery, bounce, complaint
- $20/mo for 50K emails — sufficient for early-stage SaaS
- Full domain authentication (SPF + DKIM + DMARC)

Forbidden: SendGrid (deprecated for Boldteq), Postmark (the agent name conflict is intentional — agent `postmark` owns Resend integration, not the company), AWS SES (too low-level for our scale), Mailgun (legacy).

---

## Stack-A integration (Next.js 16 + Supabase + Railway)

### Setup steps
1. Add to `package.json`: `resend`, `@react-email/components`, `react-email` (dev)
2. Env var: `RESEND_API_KEY` (from Resend dashboard, server-only — NEVER `NEXT_PUBLIC_`)
3. Domain auth: Add Resend's MX, TXT (SPF), DKIM records to project's DNS in Cloudflare/Railway
4. Create `lib/email/resend.ts`:
   ```ts
   import { Resend } from 'resend'
   if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY required')
   export const resend = new Resend(process.env.RESEND_API_KEY)
   ```
5. Create `app/emails/` directory with React Email templates (one component per email type)

### Pattern: send a transactional email
```ts
// In a Server Action or API route
import { resend } from '@/lib/email/resend'
import { WelcomeEmail } from '@/app/emails/welcome'

const { data, error } = await resend.emails.send({
  from: 'Boldteq <hello@updates.boldteq.com>',
  to: [user.email],
  subject: 'Welcome to Boldteq',
  react: WelcomeEmail({ userName: user.name }),
  tags: [{ name: 'category', value: 'welcome' }, { name: 'app', value: 'rankora' }]
})
if (error) {
  await reportToSentry(error, { context: 'resend.send.welcome' })
  throw new Error('Email send failed')
}
return data
```

### Pattern: webhook handler for delivery events
- Endpoint: `app/api/webhooks/resend/route.ts`
- Verify signature with `RESEND_WEBHOOK_SECRET` env var
- Update DB: `email_events` table with run_id, event_type (sent/delivered/bounced/complained/opened/clicked)
- Trigger downstream: BullMQ job to update user record on hard bounce (mark email_invalid)

---

## Domain authentication (mandatory checklist)

Every Boldteq project sending emails via Resend MUST pass:
- [ ] **SPF** — Resend's `_spf.resend.com` included in domain TXT
- [ ] **DKIM** — Resend's CNAME records added (resend._domainkey)
- [ ] **DMARC** — `v=DMARC1; p=quarantine; rua=mailto:dmarc@boldteq.com` (start with quarantine, move to reject after 30 days)
- [ ] **Reply-to set** — Either a real human inbox or a help@ alias (NOT noreply@ — kills deliverability)
- [ ] **Subdomain pattern** — Send from `updates.<project>.com` not `<project>.com` (protects root domain reputation)
- [ ] **Resend dashboard** shows domain status = "Verified" (green check)

If any checklist item fails, deliverability drops 30-50%. postmark blocks deploy until fixed.

---

## Template library structure

Every Boldteq project gets these baseline templates:

| Template | When sent | React component |
|---|---|---|
| Welcome | Day 0 — user signup | `WelcomeEmail` |
| Email verification | At signup, before access | `VerifyEmail` |
| Password reset | User requests reset | `ResetPassword` |
| Magic link | Passwordless login | `MagicLink` |
| Receipt / Invoice | Successful payment | `Receipt` |
| Subscription renewed | Annual/monthly recharge | `SubscriptionRenewed` |
| Subscription failed | Payment failure | `SubscriptionFailed` (URGENT — high deliverability) |
| Trial ending | 3 days before trial end | `TrialEnding` |
| Generic notification | Configurable | `Notification` (props: title, body, ctaUrl, ctaText) |

CRO-driven sequences (welcome series, nurture, win-back) are NOT in the baseline — those belong to `sequence` agent under CRO Lead.

---

## Bounce + complaint handling

Resend webhooks fire `email.bounced` and `email.complained` events. postmark's standard handler:

```ts
// On hard bounce: mark user as email-invalid, prevent future sends
if (event.type === 'email.bounced' && event.data.bounce_type === 'hard') {
  await supabase
    .from('users')
    .update({ email_status: 'invalid', email_invalid_reason: 'hard_bounce' })
    .eq('email', event.data.to)
  return
}
// On complaint: mark user as email-suppressed (CAN-SPAM compliance)
if (event.type === 'email.complained') {
  await supabase
    .from('users')
    .update({ email_status: 'suppressed', email_suppressed_reason: 'spam_complaint' })
    .eq('email', event.data.to)
  // Also trigger user-experience flow: show in-app banner explaining suppression
}
```

Soft bounces are retried by Resend (3 attempts over 24h). No app-side action.

---

## Anti-patterns (NEVER do these)

1. **Never use `NEXT_PUBLIC_RESEND_API_KEY`** — leaks API key to client, $$$ abuse risk.
2. **Never send from `noreply@`** — kills deliverability, makes user support harder.
3. **Never send transactional + marketing from same domain** — segment to `updates.<>` (transactional) and `marketing.<>` (marketing) for reputation isolation.
4. **Never skip DMARC.** Without it, spoofers can send "from" your domain. Reputation tanks.
5. **Never hard-fail a request because email send failed.** Email is async. Log to Sentry, retry via BullMQ, but let the request succeed.
6. **Never send to a user with `email_status='invalid' or 'suppressed'`.** Costs money + reputation. Check before send.
7. **Never put user-specific data in the email subject line.** Resend's per-email open-tracking treats different subjects as different campaigns; degrades aggregate metrics.
8. **Never send marketing emails from postmark agent.** postmark is TRANSACTIONAL only. Marketing sequences belong to `sequence` agent under CRO Lead.
9. **Never bypass tags.** Every send must include category + app tags. Used for cost attribution and bounce/complaint isolation.
10. **Never test sends to real users from dev.** Use Resend's `sandbox` recipient (test@resend.dev) or Mailtrap during dev.

---

## Verification (postmark's deploy gate)

Before postmark approves Resend integration on any project:
- [ ] `pnpm tsc --noEmit && pnpm lint && pnpm build` all pass
- [ ] DNS auth verified in Resend dashboard (SPF, DKIM, DMARC green)
- [ ] One end-to-end test send completed (sandbox recipient)
- [ ] Webhook endpoint receives + processes a test event
- [ ] At least 9 baseline templates exist (Welcome through Notification)
- [ ] Bounce + complaint handlers wired
- [ ] No `console.log` in email-related code
- [ ] No hardcoded API key
- [ ] All emails have `tags` array
- [ ] Reply-to is a real inbox (not noreply@)
