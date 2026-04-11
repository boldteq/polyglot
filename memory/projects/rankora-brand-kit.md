# Rankora — Brand Kit v1

**Created:** 2026-04-11 (Sync Pass 3, Tier 1 #1b)
**Product:** Rankora — AI-powered resume ranking for recruiters and hiring managers
**Stack:** Next.js 16.2.3 (App Router) + React 19 + Supabase SSR + pgvector + Dodo Payments + OpenAI GPT-4o + Railway + BullMQ
**Anchored to:** `~/Desktop/Boldteq App/Rankora` (377-line CLAUDE.md, 8 migrations, `src/integrations/supabase/{browser,server,middleware}.ts`, Sentry + PostHog wired, legacy Lovable in prod until 2026-05-19 cutover)
**Loaded by:** Quill (copy), Vega (visual), Zeph (SEO), Echo (launch), Sage (brand gate)

---

## 1. Positioning

**One-liner:** Rank 200 resumes against a job description in 90 seconds, not 8 hours.

**Longer positioning:** Rankora reads every resume in your pipeline against the job description you already wrote, scores each one on relevance, surfaces the top candidates, and tells you *why* they ranked where they did. Paste the JD, drop the resumes, get a ranked shortlist with evidence — not a black-box score. Built for in-house recruiters and hiring managers who want their first-round screening to take a coffee break, not a workday.

**Category:** HR Tech → Recruiting → Resume screening / ATS augmentation
**Primary ICP:** In-house recruiters and hiring managers at 20–500-person companies who receive 50–500 resumes per open role and don't have a paid ATS screening module (or hate the one they have).
**Secondary ICP:** Boutique recruiting agencies (3–20 recruiters) juggling multiple pipelines.
**Tertiary ICP:** Founders doing first-five hires who don't have a recruiter yet.
**Not our ICP:** Enterprise with Workday/Greenhouse screening already deployed; job seekers (we are B2B only).

**Job-to-be-done:** "I just opened 147 applicants in my ATS. I need to get to 10 callable candidates by end of day without missing a great one."

**What Rankora is NOT** (protect scope):
- Not an ATS. We don't replace Greenhouse or Lever — we sit next to them.
- Not a sourcing tool. We don't find candidates.
- Not a job board. We don't post jobs.
- Not an interview scheduler.
- Not a bias-free guarantee. We surface evidence, humans still decide (important for legal positioning — see section 8).

---

## 2. Voice & Tone

**Voice DNA (three words):** *Sharp. Evidence-first. Respectful of the stakes.*

Rankora talks like a senior recruiter who's seen 10,000 resumes, has strong opinions, and always shows their work. Confident but never flippant — hiring is high stakes for both sides. Every claim Rankora makes is backed by a specific line from the resume and a specific clause in the JD. Never "AI magic". Always "here's why".

**Tone by surface:**

| Surface | Tone | Example |
|---|---|---|
| Landing headline | Confident, concrete | "Rank 200 resumes in 90 seconds. See why each one placed." |
| In-app scoring output | Evidence-first | "Ranked #3 of 147 · Match 87% · 'Led migration from MySQL to Postgres (2023)' aligns with JD req: 'Postgres at scale'" |
| Error states | Honest, non-blaming | "We couldn't parse page 2 of this PDF. Re-upload or paste the text below." |
| Empty states | Helpful, pointed | "No JD yet. Paste it here and we'll start ranking as resumes come in." |
| Upgrade prompts | Value-framed, not guilt | "You've ranked 50 resumes this month on Free. Pro unlocks unlimited + bulk import." |
| Support emails | First-person, respectful | "Hey — this is Yash from Rankora. Looked at your account. Here's what happened:" |
| Transactional emails | Terse, useful | Subject: "Your 147 resumes are ranked." Body: one link, one CTA. |
| Marketing emails | 150 words max, one insight, one CTA | Never newsletter-style. |

**Forbidden phrases** (Quill + Sage brand gate blocks these):
- "AI-powered" (say what the AI actually does instead), "unlock potential", "talent acquisition" (recruiters say "hiring"), "synergy", "world-class", "best-in-class", "cutting-edge", "revolutionize hiring", "reimagine recruiting".
- "Bias-free" or "unbiased" — legally dangerous, never claim this. Use "evidence-based" or "explainable".
- "Replace recruiters" / "replace humans" — Rankora augments, never replaces. This is both brand and legal.
- "Candidates" in merchant-facing admin should usually be "resumes" unless referring to a specific person's profile view. "147 resumes ranked" not "147 candidates ranked" — scores are about the document, not the human.

**Preferred constructions:**
- "Ranked #3 of 147" > "High match"
- "87% match · 4 of 5 required skills" > "Strong fit"
- "Evidence: [exact quote]" > "Based on experience"
- "90 seconds for 200 resumes" > "Lightning fast"
- "Free plan: 50 ranks/month" > "Generous free tier"

**Critical brand rule — "show the evidence":** Every score Rankora displays must be accompanied by at least one specific quote from the resume and one specific clause from the JD. This is not just UX — it's the core brand promise. "Evidence-first" is on every screen, every email, every marketing asset.

**Reading level target:** Grade 8–9. Recruiters read fast, skim faster.

---

## 3. Visual Identity

**Palette:**
- **Brand primary:** `#0B1220` (near-black navy — serious, executive)
- **Brand accent:** `#3B82F6` (Rankora blue — clarity, "ranked")
- **Evidence highlight:** `#FACC15` (warm yellow — the "highlighter pen" feel when quoting resume text)
- **Success:** `#10B981`
- **Warning:** `#F59E0B`
- **Critical:** `#EF4444`
- **Neutral scale:** Tailwind slate (50–950)

**Rule:** The yellow highlight is a brand asset, not just a color. It only ever appears on quoted evidence text (resume snippets + JD clauses). Don't use it for CTAs, don't use it for warnings, don't decorate with it. Scarcity = recognition.

**Typography:**
- **Sans (UI + marketing):** Inter, variable axis, strict weight scale: 400 body / 500 labels / 600 headings / 700 hero only
- **Mono (resume quotes + scores):** JetBrains Mono — all ranking scores and evidence quotes render in mono to reinforce "this is data, not opinion"
- **Display (hero only):** Inter 700, tight tracking (-0.02em)

**Iconography:**
- Lucide React (matches Stack A standard, already in codebase per `CLAUDE.md` line count of 377)
- Never Heroicons, never FontAwesome, never emoji-as-icons

**Logo:**
- Wordmark: "rankora" lowercase, Inter Semibold, `#0B1220`
- Mark: stacked horizontal bars of descending width (rank visualization), accent-blue on the top bar
- Minimum clearspace: 1x bar-height on all sides

**UI composition rules:**
- Every ranked resume renders as a card with: rank number (mono, large), match % (mono), one-line summary (sans), "Show evidence" disclosure (expands to quotes with yellow highlights)
- Tables use zebra stripes only when >10 rows
- No gradients anywhere except the landing hero (single subtle slate-950 → slate-900)
- Dark mode is first-class, not an afterthought — recruiters work late

---

## 4. Terminology Glossary

| Concept | Term | NOT |
|---|---|---|
| A person who applied | **applicant** (when referring to the human) / **resume** (when referring to the document being ranked) | "candidate" (reserve for shortlisted), "lead" |
| Someone Rankora ranked highly | **top match** or **shortlisted** | "best candidate", "winner" |
| The job description | **JD** (in-app, short) / **job description** (in marketing) | "role doc", "spec" |
| Rankora's score | **match score** or just **score** | "AI score", "relevance", "fit score" |
| The quoted evidence | **evidence** | "snippets", "highlights", "reasons" |
| The recruiter | **recruiter** (primary) / **hiring manager** (when distinguishing) | "user", "customer" (in-app) |
| The employer org | **team** (in-app) / **workspace** (in settings) | "company", "account" |
| Failed parsing | **couldn't read** or **parse failed** | "error", "invalid" |
| Bulk ingest | **import resumes** | "upload batch", "pipeline sync" |
| Plans | **Free / Pro / Team** (per rankora-nextjs-rebuild.md memory file) | Any renamed variants |
| Per-rank unit | **rank** (noun + verb: "50 ranks/month", "rank these 147") | "scan", "check", "analysis" |

**Locale rule:** English-only for v1. Localization is a post-cutover v1.2 decision.

---

## 5. Messaging Pillars

Every Rankora asset maps to exactly one pillar. Zeph, Quill, Echo all load this section.

1. **"See the evidence, not the score"** — The yellow-highlighted quote from the resume is the hero. Competitors show a score. Rankora shows *why*. This is the #1 pillar and every hero section leads with it.
2. **"90 seconds, not 8 hours"** — Raw speed. 200 resumes ranked in under two minutes. Recruiters reclaim their afternoon.
3. **"Augment, don't replace"** — Rankora surfaces and explains. Humans decide. Legally and ethically load-bearing — never compromise this.
4. **"Works with your ATS, not against it"** — Paste-in or upload, export to CSV or Greenhouse/Lever. We don't want to be your ATS.

---

## 6. Landing Page Copy Seeds

**Hero headline (A/B/C for Quill to test at first sprint):**
- A: Rank 200 resumes in 90 seconds. See the evidence behind every score.
- B: Stop reading 147 resumes. Start reading the top 10.
- C: Evidence-first resume ranking for recruiters who still want the final say.

**Subheadline:**
Paste the job description. Drop the resumes. Rankora scores each one against every requirement and shows you the exact quotes behind the match. You decide who to call.

**Three-feature strip:**
1. **Every score, explained.** Tap any resume and see the quotes Rankora matched to each JD requirement. Yellow highlight, receipts attached.
2. **90 seconds for 200 resumes.** Ingest PDF, DOCX, or pasted text. Rank runs async on BullMQ — you'll get a push/email when it's done.
3. **Lives alongside your ATS.** Export shortlists to CSV, Greenhouse, or Lever. Rankora augments; your ATS stays the source of truth.

**Primary CTA:** `Start ranking free`
**Secondary CTA:** `See a sample ranking`

**Sample-ranking permalink copy** (first landing page asset):
> "Here's a real JD and 15 real resumes, ranked. Click any row to see the evidence. No signup."

---

## 7. Brand Gate Checklist (Sage runs before Bolt ships)

- [ ] Voice passes Hemingway Grade 8–9 check
- [ ] Zero forbidden phrases (section 2)
- [ ] Zero "bias-free" / "unbiased" / "replace recruiter" claims
- [ ] Every score shown comes with at least one evidence quote
- [ ] Yellow highlight used ONLY on evidence quotes, nowhere else
- [ ] Mono font used for scores + resume quotes
- [ ] Terminology matches glossary (section 4)
- [ ] Maps to exactly one messaging pillar (section 5)
- [ ] Dark mode renders correctly (first-class, not post-hoc)
- [ ] "Humans decide" disclaimer present on any marketing asset making efficacy claims

---

## 8. Legal & Ethical Guardrails (Brand-enforced, Sage-blocked)

Rankora touches hiring. Bad brand copy here = lawsuit risk. These are hard rules, not style preferences.

1. **Never claim "bias-free", "unbiased", or "fair".** Use "evidence-based", "explainable", "transparent".
2. **Never claim Rankora "selects" or "hires" candidates.** Rankora *ranks*; recruiters *select*.
3. **Never make accuracy claims without a citation.** "87% match" is the system's output for one resume vs one JD. It is NOT "87% accurate at predicting hires" — we have no data to support that and never will without a longitudinal study.
4. **EEOC / EU AI Act posture (even informal):** Rankora is a decision-support tool, not an automated decision system. Messaging must preserve human-in-the-loop. When EU AI Act enforcement bites (active 2026), this positioning protects us.
5. **Sensitive attributes in resumes** (name, photo, age, address, pronouns, graduation years) must never appear in Rankora's evidence quotes in marketing screenshots. Use redacted sample data only.

Sage's brand gate **fails any asset** that violates any of these five.

---

## 9. What's Still Unknown (fill during first landing page sprint)

- Sample data set for the "See a sample ranking" permalink (need real anonymized JD + 15 resumes — Pulse's job to source)
- Whether to support Lever AND Greenhouse for v1 or start Greenhouse-only (product decision for Orbit)
- Pricing page copy tone (aggressive usage caps vs flat seats) — waits for Ledger's Tier 2 pricing model artifact
- Product Hunt hunter + launch date — Echo owns post-rebuild

---

## 10. Version Log

- **v1 — 2026-04-11** — First brand kit, anchored to real Rankora codebase: Next 16.2.3 pre-staged rebuild, 377-line CLAUDE.md, 8 Supabase migrations, Dodo Payments, Sentry + PostHog wired. Legacy Lovable in prod, cutover 2026-05-19. No prior brand artifacts to reconcile.
