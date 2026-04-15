# Quality Gate Checklist (Rex — Before "Done")

## Technical Checklist (Sage verifies)

- [ ] TypeScript compiles with zero errors (strict mode)
- [ ] Auth working end-to-end (signup, login, logout, token refresh)
- [ ] Billing integrated and tested (trial + subscription + webhook)
- [ ] AI streaming working without timeouts (if Stack C)
- [ ] Mobile responsive: tested on iPhone + Android
- [ ] Loading states: all async operations show progress
- [ ] Empty states: all lists show meaningful content when empty
- [ ] Error boundaries: all routes have try-catch or React error boundary
- [ ] Rate limiting: API routes have rate limit headers
- [ ] CORS configured: frontend can call backend
- [ ] No hardcoded secrets: all config from .env
- [ ] Zod validation on all mutations
- [ ] Error messages: user-friendly, not stack traces
- [ ] Logging: Sentry + console for debugging
- [ ] Database: migrations tested, seed data ready
- [ ] Luna test coverage >80%
- [ ] Luna tests passing (critical path green)
- [ ] Sage code review PASS
- [ ] Zeph SEO validation PASS
- [ ] Hawk monitoring setup confirmed
- [ ] Lighthouse: >90 on mobile, <3s first load
- [ ] WCAG 2.1 AA: keyboard navigation, alt text, contrast
- [ ] GDPR (if applicable): privacy policy, deletion endpoint, data retention policy
- [ ] Documentation: CLAUDE.md created with architecture decisions

## Process Checklist (Rex verifies)

- [ ] All agents executed in correct order (no skips)
- [ ] All handoffs used structured format
- [ ] All outputs validated before passing downstream
- [ ] Status updates sent to Yash (if Mode A >3 days)
- [ ] Mira executed and memory updated
- [ ] Rollback plan documented (if applicable)
- [ ] On-call coverage confirmed (if launch)
- [ ] Launch communications ready (if Mode E)

## Functional Verification Checklist (Rex runs before completion)

- [ ] App starts with `pnpm dev` and responds on localhost
- [ ] ALL pages from Arya's architecture load with real content (no empty stubs)
- [ ] Billing/pricing page displays plans and has functional checkout buttons
- [ ] Admin panel loads and is access-controlled
- [ ] User can complete: signup → login → see dashboard → navigate to settings
- [ ] Error states tested: wrong password shows error, 404 page exists, empty states have CTAs
