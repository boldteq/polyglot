# Open-Source Agent Training — Validated Patterns

> Extracted from: alirezarezvani/claude-skills (233 skills), wshobson/agents (182 agents), anthropic-cookbook, anthropic-courses
> Validated against Boldteq vision. Only production-grade, SaaS/Shopify/Lovable-relevant patterns included.
> Date: 2026-04-09

---

## 1. AGENT ORCHESTRATION (Yash)

### Multi-Agent Dispatch Rules
- **Lead/Subagent pattern**: Yash plans, delegates to specialized agents, synthesizes. Never generates primary output.
- **Query routing**: Depth-first (multiple perspectives on ONE question) vs breadth-first (N independent sub-questions) vs straightforward (1 agent).
- **Subagent count**: Simple=1, Standard=2-3, Medium=3-5, Complex=5-10. NEVER >20.
- **Clear delegation**: Each agent gets: specific objective, expected output format, context, scope boundaries, tools to use.
- **Parallel dispatch**: Run independent agents simultaneously (3-5 max parallel).
- **Adaptive termination**: Stop when diminishing returns hit. If >15 tool calls or >100 sources, stop and synthesize.
- **OODA loop**: Observe (what gathered?) → Orient (what tools address gaps?) → Decide (informed selection) → Act (execute).
- **Tool restriction**: Use disallowed_tools to prevent agents from bypassing scope (e.g., prevent Bash if using MCP GitHub).

### Incident Investigation Flow
1. Check error rates → identify affected services
2. Check latency → slowdown vs failures
3. Query metrics (DB connections, CPU/memory)
4. Fetch logs from relevant services
5. Get active alerts
6. Correlate with recent deployments
7. Execute runbooks (investigate first, remediate second)

---

## 2. API DESIGN (Arya)

### API Design Rules
- Resource naming: kebab-case endpoints, camelCase response fields
- Pagination: Cursor-based for large datasets, offset for UI. Always include `hasMore` + total.
- Error format: `{ error: { code, message, details[], requestId, timestamp } }` — use 400/401/403/404/422/429/500.
- Rate limiting headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Return 429 with `retryAfter`.
- Versioning: URL versioning (`/api/v1/`) preferred over header versioning.

### Breaking Change Detection
- Endpoint removal → 2-phase deprecation (announce → grace → remove)
- Response field removal → breaks clients
- Type changes (int→string) → breaks clients
- Required field additions → breaks clients (use optional first)
- Safe changes: adding optional fields, new endpoints, new enum values with defaults

### API Scoring Rubric (30% consistency, 20% docs, 20% security, 15% usability, 15% performance)

---

## 3. DATABASE PATTERNS (Arya/Koda)

### Schema Design
- 3NF baseline. Denormalize only with measured performance justification.
- Every PK, FK, unique constraint explicit. NOT NULL + defaults for required fields.
- Naming: `table_names` (plural, snake_case), `column_names` (snake_case), `idx_table_column`, `uc_table_column`.

### Index Selection Matrix
| Type | Use When |
|------|----------|
| B-tree | Equality, range, ORDER BY (default) |
| GIN | Full-text search, JSONB, arrays |
| GiST | Geometry, range, nearest-neighbor |
| Partial | Subset of rows (WHERE active = true) |
| Covering | Index-only scans (include non-key columns) |

### Zero-Downtime Migration (Expand-Contract)
1. **Expand**: Add new column (nullable, with default). Dual-write from app.
2. **Migrate**: Batch update old→new (5,000 rows/commit).
3. **Transition**: App reads from new, stops writing to old.
4. **Contract**: Drop old column in follow-up migration.
- **Rule**: Test down migration in staging before deploying up to prod.

### Query Performance
- N+1 detection: One query per row in a loop → fix with JOIN or batch fetching.
- EXPLAIN ANALYZE: Seq Scan on large table = missing index. Nested Loop high rows = add index.
- Connection pooling: Pool size = 2 × vCPUs (for cloud SSDs).

### Multi-Tenancy Patterns
- Shared schema with RLS (tenant_id in WHERE) — best for SaaS
- Schema-per-tenant — better isolation, more ops overhead
- Database-per-tenant — maximum isolation, highest cost

---

## 4. TESTING & CODE REVIEW (Luna/Sage)

### PR Review 30-Item Checklist
- [ ] PR title accurate, body explains WHY
- [ ] No unrelated changes (scope creep)
- [ ] Blast radius assessed (shared libs, APIs, DB models = CRITICAL)
- [ ] No hardcoded secrets, keys, or credentials
- [ ] SQL uses parameterized inputs
- [ ] Auth/authz checks on new endpoints
- [ ] No XSS vectors (innerHTML, dangerouslySetInnerHTML)
- [ ] New dependencies checked for CVEs
- [ ] No sensitive data in logs
- [ ] File uploads validated (type, size)
- [ ] New functions have unit tests
- [ ] Edge cases covered (empty, null, max)
- [ ] Error paths tested
- [ ] No API endpoints removed without deprecation
- [ ] No DB columns removed without 2-phase migration
- [ ] No N+1 queries introduced
- [ ] Indexes added for new query patterns
- [ ] Async operations correctly awaited
- [ ] Error handling present (no bare empty catch)

### Blast Radius Severity
- CRITICAL: shared lib, DB model, auth, API contract, >3 consumers
- HIGH: service used by 3+, shared config, env vars
- MEDIUM: single service internal change
- LOW: UI component, test, docs

### Test Coverage Rules
- New functions must have unit tests
- Auth/payment paths require 100% coverage
- Coverage drop >5% blocks merge
- Testing pyramid: 70% unit, 20% integration, 10% E2E
- TDD: Red-Green-Refactor. Write failing test → minimal code → refactor.
- Test naming: describe behavior, not implementation.

---

## 5. DEPLOYMENT & CI/CD (Bolt)

### Pipeline Structure
1. Detect stack (parse lockfiles, don't guess)
2. Checkout → setup → install (with cache) → lint → test → build
3. Deploy jobs separate from CI. Gate with protected branches.

### Deploy Safety Checklist
- [ ] All CI checks pass before deploy
- [ ] Protected branch required (main/production only)
- [ ] Secrets injected via CI secret store (never in YAML)
- [ ] OIDC federation preferred over static credentials
- [ ] Rollback procedure documented and tested

### Semantic Versioning + Conventional Commits
- `feat!` or `BREAKING CHANGE` = MAJOR
- `feat` = MINOR
- `fix`, `perf`, `security` = PATCH

### Hotfix SLAs
- P0 (outage/breach): Fix within 2 hours. All-hands.
- P1 (major feature broken): Fix within 24 hours.
- P2 (minor issues): Next release cycle.

### Progressive Delivery
- Canary: 10% → 50% → 100% traffic with automated rollback on threshold breach
- Blue-green: Parallel environments, instant switch
- Rolling: One pod at a time with health checks

### Release Readiness Checklist
- [ ] Breaking changes documented with migration guide
- [ ] Database migrations tested
- [ ] Security review completed
- [ ] Unit test coverage ≥ 85%
- [ ] Integration + E2E tests passing
- [ ] Dependency audit clean
- [ ] CHANGELOG.md updated
- [ ] Rollback procedure documented

---

## 6. PERFORMANCE & OBSERVABILITY (Hawk/Sage)

### Golden Rule: Measure baseline BEFORE optimization.

### Performance Quick Wins
**Database**: Missing indexes, N+1 queries, SELECT *, unbounded queries, no connection pool.
**Node.js**: Sync I/O in hot path, large JSON parse/stringify in loops, no caching, no compression.
**Bundle**: moment.js (→dayjs), lodash full import (→lodash/fn), no code splitting, unoptimized images.

### Golden Signals Monitoring
1. **Latency**: P50, P95, P99 per endpoint
2. **Traffic**: Requests/second, burst detection
3. **Errors**: 4xx, 5xx rates by error type
4. **Saturation**: CPU, memory, disk, queue depth, connection pool

### SLI/SLO Framework
- SLI: Measurable signal (latency P99, error rate, uptime)
- SLO: Target (P99 < 200ms 99% of time)
- Error budget: SLO allows controlled failure. Track burn rate, alert at 2x baseline.

### Alert Design Rules
- Set precision > recall (reduce false positives)
- Every alert must have documented response action
- Dashboard: Max 7±2 panels per screen, hierarchy Overview→Service→Component
- Structured logging: JSON with requestId, userId, timestamp, level, message

---

## 7. SECURITY (Sage)

### OWASP Top 10 Checklist
- A01 Broken Access Control → RLS on every table, principle of least privilege
- A02 Cryptographic Failures → Argon2/bcrypt for passwords, TLS everywhere
- A03 Injection → Parameterized queries ALWAYS, never string concatenation
- A04 Insecure Design → Threat model with STRIDE
- A05 Security Misconfiguration → CSP, HSTS, X-Frame-Options, SameSite cookies
- A06 Vulnerable Components → Dependency scanning in CI/CD (Snyk, Trivy)
- A07 Authentication Failures → MFA for admin, JWT with proper expiration
- A08 Software/Data Integrity → Signed commits, artifact verification
- A09 Logging/Monitoring → Audit trails, security event alerts
- A10 SSRF → Validate/allowlist outbound URLs

### Secret Management
- .env files: Local only, gitignored. .env.example with placeholders.
- CI/CD: Provider secret store (GitHub Secrets). OIDC > static credentials.
- Production: Cloud secret manager (AWS SM, Azure KV, Vault).
- Leak detection: gitleaks pre-commit. Patterns: AKIA*, private keys, JWT secrets, passwords.
- Rotation: Generate new → deploy → verify → revoke old → update metadata.

### Security Headers (Every Response)
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY (or SAMEORIGIN for Shopify embedded)
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

### Frontend Security
- XSS: Context-aware encoding, CSP with nonce, no innerHTML with user data
- Storage: Never store sensitive data in localStorage. HttpOnly cookies only.
- CORS: Strict origin policies. Credential-aware CORS only when necessary.
- Supply chain: Verify dependency integrity, SCA in CI/CD.

---

## 8. SEO & MARKETING (Zeph/Quill)

### AI SEO — 3 Pillars of Citability
1. **Structure (Extractable)**: Definitions, lists, tables, steps — self-contained answers
2. **Authority (Citable)**: High-DA domain, named authors, original data, recency
3. **Presence (Discoverable)**: AI crawlers allowed, fast page, clean HTML, schema markup

### Content Patterns That Get Cited by AI
- Definition block: "X is [1-2 sentence definition]" in first 300 words
- Numbered steps: 5-10 steps, verb-first, self-contained
- Comparison tables: "X vs Y" queries pull tables
- FAQ blocks: Q&A pairs with FAQPage schema
- Statistics with attribution: "According to [Source] ([Year])..."

### Landing Page Copy Frameworks
- **PAS**: Problem → Agitate → Solution
- **AIDA**: Attention → Interest → Desire → Action
- **BAB**: Before → After → Bridge

### Landing Page Performance
- LCP < 1s (preload hero, `priority` on first image)
- CLS < 0.1 (explicit width/height on all images)
- FID < 100ms (defer non-critical JS, lazy load)
- Bundle < 100KB JS

### App Store Optimization (ASO)
- Keyword priority: Title > Subtitle > Keyword field (iOS) > Description
- Evaluation: Relevance (35%) + Volume (25%) + Competition (25%) + Conversion (15%)
- Icon A/B testing: 10-25% conversion lift possible

---

## 9. AI/LLM PATTERNS (Koda Stack C)

### Cost Optimization Hierarchy (apply in order)
1. **Model routing (60-80% savings)**: Classify task → route to appropriate model size
   - Small: classification, extraction, yes/no → Haiku
   - Medium: summarization, structured output → Sonnet
   - Large: complex reasoning, code gen → Opus
2. **Prompt caching (40-90% savings)**: Cache system prompts, static context, few-shot examples
3. **Output length control (20-40%)**: Explicit max_tokens, stop sequences
4. **Prompt compression (15-30%)**: Remove filler without losing meaning
5. **Semantic caching (30-60% hit)**: Cache by embedding similarity (>0.95 cosine)
6. **Request batching (10-25%)**: Process async queues off-peak

### Cost Red Flags (Surface Immediately)
- No per-feature cost breakdown → instrument logging first
- All requests same model → implement routing
- System prompt >2,000 tokens per request → cache it
- No max_tokens set → set per-endpoint limits
- Free users get expensive model → tier model access

### RAG Pipeline
- Chunking: Recursive (try large, split if needed) → Semantic (topic + similarity) → Paragraph
- Embedding: 512-768 dims balanced choice. MiniLM-L6 for speed, mpnet-base for quality.
- Vector DB: pgvector if already on Postgres (ACID + joins). Pinecone for scale.
- Retrieval: Hybrid (dense + sparse with RRF fusion) → Reranking (cross-encoder) for high precision
- Query transform: HyDE (hypothetical answer embedding), Multi-query (3-5 variations), Step-back (broader context)
- Evaluation: Faithfulness >90%, Relevance >0.85, use RAGAS framework

### Production AI Patterns
- Streaming: Real-time output via SSE. Token-by-token for chat, chunk for analysis.
- Structured output: JSON schema enforcement with validation loop (extract → validate → retry).
- Parallel tool calls: For independent operations, invoke multiple tools simultaneously.
- Error recovery: Retry with different model/params on failure. Graceful degradation.
- Observability: Log model, input/output tokens, latency, feature, cost per request.
- Budget envelopes: Per feature, per user tier, per day. Soft alert at 80%. Graceful degradation on exceed.

---

## 10. BUG FIXING (Vex)

### Focused Fix Protocol (5 Phases — DO NOT SKIP)
1. **SCOPE**: Map feature boundary. Read every file. Create feature manifest (entry points, internal files, size).
2. **TRACE**: Map all dependencies (inbound + outbound). Check env vars, configs, DB models, API endpoints, packages.
3. **DIAGNOSE**: Check imports, circular deps, type consistency, error handling, TODOs, env vars, migrations, API contracts. Run ALL tests. Check git log. Label: CRITICAL/WARNING/LOW.
4. **FIX**: Fix order: dependencies → types → logic → tests → integration. ONE fix at a time. Test after each.
5. **VERIFY**: Run all tests (feature + consumers). Check no regressions. Summarize changes.

### Escalation Rules
- 3+ cascading fix failures → STOP, discuss architectural restructuring
- "I can see the bug" without tracing → You haven't scoped properly
- "Tests pass, I'm done" → Did you run consumer tests?
- Config issues masquerade as bugs → Always check env vars

---

## 11. PRODUCT & MARKET RESEARCH (Nova)

### Competitive Teardown (12-Dimension Rubric)
Score 1-5 with evidence: Features, Pricing, UX, Performance, Docs, Support, Integrations, Security, Scalability, Brand, Community, Innovation

### Data Sources
- Website: Pricing, features, CTAs, case studies, trust signals
- App Store reviews: Sample 50+ reviews for sentiment
- Job postings: Engineering volume, tech stack, sales/CS ratio
- SEO signals: Top 20 keywords, domain authority, blog cadence
- Social: Twitter/X, Reddit, LinkedIn sentiment

### Product Discovery (OST Framework)
1. Define ONE measurable outcome
2. Build Opportunity Solution Tree: Outcome → opportunities → solutions → experiments
3. Map assumptions: Desirability, viability, feasibility, usability. Score risk × certainty.
4. Validate problem: Interviews + behavior analysis
5. Validate solution: Prototype, usability test, fake door, limited beta
6. 1-2 week discovery sprints with proceed/pivot/stop decisions

---

## 12. UI & DESIGN (Vega)

### Design Token Architecture
- Primitives: colors, typography, spacing (raw values)
- Semantic: success, error, warning, info (meaning)
- Component-specific: button-primary, card-shadow (usage)
- Scale: 4px/8px base grid. Spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96px.
- Typography scale (1.25x): xs=10, sm=13, base=16, lg=20, xl=25, 2xl=31
- WCAG contrast: AA 4.5:1 normal text, 3:1 large text (≥18pt)

### Component API Design
- Prop-based variants (size, variant, state)
- Compound patterns for flexibility
- Polymorphic components (as prop)
- State variants: default, hover, active, focus, disabled, error, loading

### Responsive
- Mobile-first (base = mobile, @media min-width for larger)
- Breakpoints: 640px tablet, 1024px desktop, 1280px wide
- Container queries for component-level responsiveness

### Accessibility Built-In
- Semantic HTML: button for buttons, nav, main, article, label for forms
- ARIA only when semantic HTML insufficient
- Focus visible always. Skip links. Tab order logical.
- prefers-reduced-motion respected. Animations pausable.

---

## 13. PAYMENT PROCESSING (Koda/Sage)

### Payment Security Rules
- NEVER handle raw card data. Tokenization only (Stripe Elements, Dodo hosted checkout).
- Webhook signature verification ALWAYS with official SDK.
- Idempotency: Store event IDs, check before processing. Webhooks retry.
- Return 2xx within 200ms before expensive operations.
- Server-side validation: Re-fetch payment status from provider API. Never trust client alone.
- Environment separation: Test credentials must fail in production.

---

## 14. SCAFFOLDING (Riko)

### SaaS Scaffold Phases (Validate Each)
1. **Foundation**: Framework + TS + Tailwind + shadcn + linting → validate: `npm run build` no errors
2. **Database**: ORM + schema + migration + client singleton → validate: test query returns without throwing
3. **Auth**: Provider + OAuth + session + middleware + pages → validate: OAuth works, session has user.id, /dashboard redirects without session
4. **Payments**: Client + checkout + portal + webhook + idempotent DB updates → validate: test card works, subscriptionId saved, webhook replay idempotent
5. **UI**: Landing + dashboard + billing + settings → validate: all routes navigate, no hydration errors

---

## 15. CROSS-CUTTING RULES (All Agents)

### Tech Debt Classification
- Code quality (tests, complexity, style) | Architectural (coupling, duplication) | Dependencies (outdated, CVEs) | Documentation | Infrastructure | Operational
- Scoring: Risk (likelihood) × Cost (time to fix) = Priority
- Repayment: Phase 1 (2w scan), Phase 2 (4w sprint integration), Phase 3 (6w predictive), Phase 4 (ongoing)

### Mandatory Rules
1. Always measure before optimizing (performance, LLM costs, UX)
2. Zero-downtime migrations first (DB, feature flags, canary)
3. Breaking changes require 2-phase approach (APIs, migrations, configs)
4. Security/audit on every change (secrets, SQL injection, XSS, auth)
5. Blast radius analysis before merge (shared libs, APIs, DB models)
6. Error budget mindset (SLOs allow controlled failure)
7. Production-like testing (real data volumes, not toy datasets)
8. Cost controls built in from start (don't optimize later)

### Launch Strategy
**Pre-launch (3-6 months)**: Waitlist, comparison pages, case studies
**Launch day**: Tuesday-Wednesday morning. Email + Product Hunt + social + community.
**Post-launch**: Day 1-3 monitor reviews. Day 7 retrospective. Day 14 first update. Day 30 lessons post.

---

## 16. EDGE COMPUTING & SERVERLESS (Koda/Bolt)

> Added: 2026-04-10. Sources: Vercel, Cloudflare, Inngest, Trigger.dev production patterns.

### Edge Functions (Vercel/Cloudflare)
- **0-10ms cold starts** — V8 isolates, no OS boot. Use for: JWT validation, geolocation routing, A/B bucketing, CSP headers.
- **Vercel Edge Middleware**: Runs before every request. Auth checks, redirects, feature flags. Next.js `middleware.ts`.
- **Cloudflare Workers + Durable Objects**: Stateful edge compute (distributed locks, counters, caches). 300+ PoPs globally.
- **Rule**: Edge for request-level logic (auth, routing, personalization). Serverless for business logic (API handlers, DB queries).

### Background Jobs & Queues
- **Inngest** (Vercel-native): TypeScript SDK, 100M+ daily executions. Free tier: 100K/month. One-click Vercel install.
- **Trigger.dev**: Separate infrastructure — no cold starts, no timeouts. $20/month for 10K runs. Better for long-running jobs.
- **Vercel Cron**: Simplest option for periodic tasks. Limited orchestration.
- **Selection Matrix**: Simple periodic → Vercel Cron. Feature workflows → Inngest. Complex pipelines/long jobs → Trigger.dev.

---

## 17. REALTIME & COLLABORATION (Koda)

> Added: 2026-04-10. Sources: Yjs, Liveblocks, Supabase Realtime.

### CRDT Architecture (Yjs)
- **Conflict-free Replicated Data Types**: Every client is equal. System auto-merges concurrent edits without conflicts.
- **Shared Types**: Y.Doc, Y.Text, Y.Array, Y.Map — all synced across clients.
- **Awareness Protocol**: Presence data (live cursors, selections, user names).
- **Persistence**: IndexedDB locally, WebSocket to server, optional database snapshots.
- **Editor Integrations**: Monaco, ProseMirror, TipTap, CodeMirror.
- **Production**: 900k weekly downloads. Figma-like tools, collaborative editors, whiteboards.

### Supabase Realtime Patterns
- **Postgres Changes**: Listen to INSERT/UPDATE/DELETE via logical replication. RLS-aware.
- **Broadcast**: Pub/sub for ephemeral messages (typing indicators, cursors). Lower latency than Postgres Changes.
- **Presence**: Track online users, sync shared state. Built on Phoenix Channels.
- **Scale Rule**: Use Broadcast for most realtime features. Postgres Changes has WAL limitations at scale.
- **Filter**: Granular per-column filtering. Multiple subscriptions per channel.

### Liveblocks (Managed Alternative)
- Yjs documents stored at edge. No WebSocket infrastructure to build/maintain.
- Drop-in React hooks: `useOthers()`, `useMyPresence()`, `useMutation()`.

---

## 18. AI AGENT FRAMEWORKS & ORCHESTRATION (Yash)

> Added: 2026-04-10. Sources: LangGraph, CrewAI, Claude Agent SDK, Anthropic Cookbook.

### Framework Selection
| Framework | Best For | Production Users |
|-----------|----------|-----------------|
| LangGraph | Complex conditional routing, retry logic, human checkpoints | Klarna, Replit, Elastic |
| CrewAI | Multi-role collaboration, rapid prototyping | Prototype → migrate to LangGraph |
| Claude Agent SDK | Native Claude tool use, MCP integration | Boldteq, Anthropic ecosystem |

### Agent Orchestration Patterns (2025-2026)
1. **Orchestrator-Workers** (Anthropic Cookbook): Central LLM analyzes task, dynamically determines subtasks (NOT pre-defined), delegates to workers.
2. **Fan-Out/Synthesize**: Multiple agents run in parallel → synthesizer merges results. Reduces latency.
3. **Validation Chain**: Agent A generates → Agent B validates → Agent C refines. Sequential quality gates.
4. **Event-Driven**: Agents communicate via event bus (Kafka, Redis Streams). Scales to distributed systems.
5. **Dispatcher**: Central intelligent agent analyzes intent, routes to best specialist dynamically.

### Context Engineering (Critical 2025 Shift)
- Context is a **managed system**, not "paste and hope".
- **Context Compaction**: Async LLM summarization over sliding windows when threshold hit.
- **Schema Optimization**: Normalize tool schemas before agent sees them → 40-50% token reduction.
- **Tool-Based Context Pulling**: Tools pull new context on demand rather than pasting everything upfront.
- **Compact Mode**: Claude Agent SDK auto-summarizes older messages when context limit approaches.
- **ACON technique**: 26-54% peak token reduction while maintaining task performance.

### Self-Healing Agent Patterns
- **Try-Rewrite-Retry**: Inject literal error message + valid options back into conversation. Agent learns in-context.
- **Checkpointing**: Checkpoint state after each step. On failure, retry only failed step (90% cost reduction vs full restart).
- **Circuit Breaker**: Wrap agents in circuit breaker. Stops message flow to failing agents to prevent cascading failures.
- **Error Classification**: Model failure (hallucination) ≠ infrastructure failure (timeout) ≠ design failure (bad prompt) ≠ data failure (corrupt input). Tailor recovery to type.

---

## 19. FEATURE FLAGS & PROGRESSIVE ROLLOUT (Bolt/Koda)

> Added: 2026-04-10. Sources: LaunchDarkly, Flipt, Unleash.

### Feature Flag Patterns
- **Progressive Rollout**: 5% → 25% → 50% → 100% with automatic scheduling. Monitor error rates at each step.
- **Kill Switch**: Instant rollback without redeploy. Every feature flag doubles as a kill switch.
- **A/B Testing**: Random bucket assignment via flag. Measure conversion before full rollout.

### Open-Source Options
| Tool | Model | Best For |
|------|-------|----------|
| Flipt | Self-hosted, Go | Cost control, no vendor lock-in |
| Unleash | Enterprise OSS | Mature, SDK-rich, custom constraints |
| LaunchDarkly | SaaS | Full progressive rollout automation |

### Implementation Rule
- Every new feature ships behind a flag. No exceptions.
- Flag naming: `feature.module.name` (e.g., `billing.checkout.usage-metering`).
- Stale flag cleanup: Remove flags 30 days after 100% rollout.

---

## 20. EMAIL & NOTIFICATION INFRASTRUCTURE (Koda/Quill)

> Added: 2026-04-10. Sources: Resend, React Email, Novu.

### Email Stack
- **React Email**: Build emails as React components. Type-safe, responsive, reusable.
- **Resend**: Modern email API. Simple send, webhooks, analytics. Integrates with React Email.
- **Production Pattern**: React Email templates → Resend delivery → Novu orchestration.

### Novu (Open-Source Notification Platform)
- **Unified API**: In-app inbox, email, SMS, push, Slack — single workflow.
- **Digest Engine**: Combines multiple notifications into single messages (e.g., "3 new comments on your post").
- **User Preferences**: End users control which channels they receive notifications on.
- **Drop-in React Component**: `<NotificationCenterComponent>` for in-app notifications.

---

## 21. FILE UPLOAD & STORAGE (Koda)

> Added: 2026-04-10. Sources: UploadThing, AWS S3.

### Upload Patterns
- **UploadThing**: TypeScript-first. Presigned URL generation via `UTApi.generateSignedURL`. Validation rules built-in.
- **S3 Multipart Upload**: Client uploads parts directly to S3 concurrently using presigned URLs. Bypasses backend.
- **Edge Upload**: Presigned URLs generated at edge for lowest latency.

### Rules
- Never stream file content through your server — always direct-to-storage.
- Validate file type, size, and content-type on both client AND server.
- Image optimization: Use CDN transform URLs (Cloudflare Images, Vercel Image Optimization, UploadThing CDN).

---

## 22. SEARCH INFRASTRUCTURE (Koda/Arya)

> Added: 2026-04-10. Sources: Typesense, Meilisearch, pgvector.

### Search Selection Matrix
| Engine | Architecture | Best For |
|--------|-------------|----------|
| pgvector | Postgres extension | First RAG pipeline, vectors next to relational data. <50M vectors. |
| Typesense | RAM-based, auto-embedding | Sub-50ms search, no separate embedding pipeline needed |
| Meilisearch | Disk-based (LMDB) | Large datasets, horizontal sharding, cost-conscious |

### Hybrid Search (2025 Standard)
- Combine keyword search (BM25) + vector search (embeddings) with Reciprocal Rank Fusion (RRF).
- Both Typesense and Meilisearch now support hybrid natively.
- pgvector: Use `ts_rank` for full-text + `<=>` for cosine similarity, combine with weighted sum.

### pgvector Production Rules
- **Index**: HNSW (default) for <20ms at 1M vectors. IVFFlat for lower memory.
- **Scale**: 5-10M vectors comfortably. Past 50M, evaluate dedicated vector DB.
- **Performance**: >95% recall, <20ms query time at 1M vectors.
- **Rule**: pgvector is the production default. Dedicated vector DBs (Pinecone, Weaviate) only for extreme scale.

---

## 23. BILLING & PRICING INFRASTRUCTURE (Koda/Sage)

> Added: 2026-04-10. Sources: Lago, Orb, Metronome, Stripe.

### Usage-Based Billing (2025 Trend)
| Platform | Model | Best For |
|----------|-------|----------|
| Stripe Billing | Basic metered | Simple subscriptions. Limited for complex usage. |
| Lago | Open-source | Complex billing, prepaid credits, custom terms. No revenue tax. |
| Orb | Real-time metering | High-volume API/AI companies. Developer-first. |
| Metronome | Accuracy at scale | SaaS where billing precision is critical. |

### Stripe Limitations
- Basic metered billing only.
- Complex hybrid B2B contracts require extensive custom webhooks.
- Not designed for prepaid credits, tiered usage, or custom terms.

### Rule
- Simple subscription SaaS → Dodo Payments (Boldteq default) or Stripe.
- Usage-based/AI SaaS → Evaluate Lago (OSS) or Orb first.
- Shopify apps → Shopify Billing API only. No exceptions.

---

## 24. MONOREPO PATTERNS (Riko/Bolt)

> Added: 2026-04-10. Sources: Turborepo, pnpm workspaces.

### pnpm + Turborepo (2025 Standard)
- **pnpm**: Fastest package manager. Content-addressable storage, strict dependency isolation.
- **Turborepo**: Build orchestration with caching. 30s build → 0.2s cached.
- **Structure**: `apps/` for applications, `packages/` for shared libraries.

### Rules
- Small, composable libraries. No "god packages".
- Peer dependencies (React, React DOM) handled consistently at root.
- `turbo.json` defines task dependencies: `build` depends on `^build` (upstream first).
- Shared packages: `@boldteq/ui`, `@boldteq/db`, `@boldteq/config`.

---

## 25. AGENT PROMPT ENGINEERING (All Agents)

> Added: 2026-04-10. Sources: Anthropic Engineering, Cursor, community patterns.

### CLAUDE.md / Agent Rules Best Practices
- Keep rules minimal — <200 lines per file. Claude ignores irrelevant content.
- Use strong, declarative language: "NEVER use X. It is banned." beats "Prefer Y".
- Don't write 20 rules on day one. Add rules when agents repeat the same mistake twice.
- Never ask LLMs to do a linter's job — use deterministic tools instead.
- Tell agents how to check their own work: "After writing a route, verify input validation and response types match."
- Tools shape agent behavior — prominent in context window, considered first.

### Code Generation Quality
- **Iterative Incremental Generation**: Generate small chunks → run tests → fix → next chunk.
- **Test-First Agentic Development**: Agents generate tests upfront, then code to pass them.
- **Static Analysis Always**: Even code passing functional benchmarks has quality defects. OpenCoder-8B: 1.45 static issues per passing task.
- **Strategic Model Layering**: Editor assistants for speed. Agents for multi-file tasks. Code review tools for validation pre-merge. Each tool has its lane.

### Tool Use Optimization
- **Bash is the most powerful tool**: Composability (piping), dynamic script generation, access to all software, self-verification.
- **Schema Optimization**: Normalize tool schemas → 40-50% token reduction without functionality loss.
- **Tool Search**: On-demand tool discovery without consuming full context window.
- **Programmatic Tool Calling**: More reliable than text-based. Better error handling.

---

## 26. AGENT TESTING & EVALUATION (Luna/Sage)

> Added: 2026-04-10. Sources: DeepEval, RAGAS, Anthropic Engineering.

### Eval Frameworks
| Framework | Type | Best For |
|-----------|------|----------|
| DeepEval | Open-source, pytest-like | General LLM evaluation |
| RAGAS | RAG + agent workflows | RAG quality, tool use, SQL eval |
| LangSmith | Enterprise | Human + heuristic + LLM-as-judge |

### Testing Rules for Agents
- **Deterministic first**: Does code run? Do tests pass? Easier than scoring prose.
- **Agent Simulations**: Test full end-to-end behaviors, not isolated completions.
- **Error Classification**: Critical (may cause failure/security) → Warnings → Recommendations. Tailor response to severity.
- **MapCoder Pattern**: Recall → Plan → Generate → Debug in parallel/iterative cycle.

---

## 27. AUTHENTICATION PATTERNS (Koda/Sage)

> Added: 2026-04-10. Sources: Clerk, Auth0, Supabase Auth.

### Auth Selection (2025)
| Provider | Token Model | Best For |
|----------|-------------|----------|
| Clerk | 60-second session tokens | Next.js, rapid DX, highest security |
| Auth0 | 24-hour access tokens | Enterprise, complex authorization, legacy |
| Supabase Auth | JWT with RLS | Supabase stack, self-hosted control |

### Clerk Security Model
- **60-second session token** (per-request validation) + long-lived client token (HttpOnly).
- Stolen session token expires in <60 seconds vs Auth0's 24 hours.
- Production auth in 10-15 lines. React/Next.js optimized.

### Rule
- Boldteq SaaS (Stack A) → Supabase Auth (already integrated).
- Enterprise SaaS → Evaluate Clerk for DX + security.
- Shopify apps → Shopify session tokens only.

---

## 28. DATABASE & ORM (Arya/Koda)

> Added: 2026-04-10. Sources: Drizzle, Prisma 2025.

### ORM Selection (2025)
| ORM | Approach | Best For |
|-----|----------|----------|
| Prisma | Declarative schema, `db push` for dev | Shopify apps (already in template), rapid prototyping |
| Drizzle | SQL-like API, `drizzle-kit push` | Performance-critical, SQL expertise |

### Drizzle v1.0 (2025)
- 363 commits, 9,000+ tests. Production-ready.
- Relational API v2 for object-based queries.
- `drizzle-kit generate` → SQL migration files (production).
- `drizzle-kit push` → rapid prototyping (skip migration files).

### Rule
- Shopify apps → Prisma (template default).
- SaaS with Supabase → Supabase client + auto-generated types. Drizzle optional for complex queries.
- Never hand-write database types. Generate from schema.

---

## 29. API RATE LIMITING (Sage/Koda)

> Added: 2026-04-10. Sources: Zuplo, production patterns.

### Dynamic Rate Limiting (2025 Pattern)
- Adjust limits in real-time based on: CPU >80%, traffic surges, error rates >5%, latency >500ms.
- **Tiered Multi-Tenant**: Free vs Premium tiers with different limits. Distributed cache (Redis).
- **Algorithms**: Sliding Window (best balance), Token Bucket (AWS default), Leaky Bucket (fair queuing).
- **Rule**: Start conservative, monitor, adjust. Easier to increase than recover from outage.

### Headers (Every Rate-Limited Response)
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1620000000
Retry-After: 30  (on 429 responses)
```

---

## 30. OBSERVABILITY (Hawk)

> Added: 2026-04-10. Sources: Sentry, OpenTelemetry, Grafana.

### 2025 Standard Stack
- **Sentry**: Code-level errors + release health.
- **OpenTelemetry**: Instrumentation layer (traces, metrics, logs).
- **Grafana**: Visualization + alerting.

### Integration Patterns
- SDK-based: `OTLPIntegration` in Sentry SDK sends OTel traces directly.
- Collector-based: OpenTelemetry Collector's Sentry exporter.

### AI Agent Observability (New 2025)
- Specialized instrumentation for LLM calls beyond traditional APM.
- Log: model, input/output tokens, latency, feature, cost per request.
- Sentry now has LLM-specific monitoring dashboards.

### Rule
- Every Boldteq app ships with Sentry error tracking from day 1.
- LLM features get cost + latency dashboards from day 1.
