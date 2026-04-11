# Mira — Structured Bug & Learning Ingestion Schema

**Owner:** Mira (knowledge extraction)
**Purpose:** Every bug, every regression, every "that didn't work" gets stored in a machine-parseable format so the next agent can avoid it automatically.
**Locked:** 2026-04-11

---

## Where it lives

```
~/.claude/memory/
  lessons/
    bugs.jsonl              ← append-only, one JSON object per line
    patterns-emerged.md     ← Mira's weekly synthesis from bugs.jsonl
    agents/
      <agent>-lessons.jsonl ← per-agent lesson file
```

`bugs.jsonl` is the source of truth. Everything else is derived.

---

## Bug entry schema (JSON, one per line in bugs.jsonl)

```json
{
  "id": "BUG-2026-04-11-001",
  "date": "2026-04-11T14:23:00Z",
  "project": "rankora",
  "stack": "A-lovable",
  "agent_that_shipped": "koda",
  "agent_that_caught": "luna",
  "severity": "P1|P2|P3|P4",
  "category": "auth|billing|db|ui|perf|seo|deploy|copy|a11y|security|data|config|dep",
  "symptom": "one-sentence user-observable description",
  "root_cause": "one-paragraph technical explanation",
  "file": "path/to/file.ts",
  "line": 42,
  "commit_broken": "abc123",
  "commit_fixed": "def456",
  "fix_summary": "one-sentence fix",
  "detection_method": "test|user-report|sentry|manual|sage-audit",
  "time_to_detect_hours": 2.5,
  "time_to_fix_hours": 0.5,
  "would_have_been_caught_by": ["unit-test", "sage-audit", "type-check"],
  "lesson": "one-sentence generalizable rule to never repeat this",
  "antipattern_tag": "supabase-ssr-cookie-missing",
  "add_to": ["patterns/avoid/antipatterns.md", "stacks/saas-nextjs-supabase-railway.md"],
  "related_bugs": ["BUG-2026-04-08-003"]
}
```

### Required fields
`id`, `date`, `project`, `severity`, `category`, `symptom`, `root_cause`, `fix_summary`, `lesson`

### Optional but encouraged
Everything else. The more filled in, the more patterns Mira can extract.

---

## Severity rubric

| Sev | Meaning | Examples |
|---|---|---|
| **P1** | Production down, data loss, auth broken, payment broken | Supabase RLS bypass, Dodo webhook dropped, 500 on home |
| **P2** | Core feature broken for some users | Dashboard empty state wrong, Stripe trial not ending, email not sending |
| **P3** | Non-core feature broken, workaround exists | Dark mode toggle broken, tooltip misaligned |
| **P4** | Cosmetic, non-urgent | Typo, 2px spacing, icon wrong color |

---

## Categories (locked — do not invent new ones)

`auth` `billing` `db` `ui` `perf` `seo` `deploy` `copy` `a11y` `security` `data` `config` `dep` `infra` `observability` `test`

If a bug doesn't fit, use the closest and add `"category_notes"` as a free-text field.

---

## How agents append (pseudocode)

```python
# When any agent (Luna, Sage, Vex, Hawk, user) catches a bug:
entry = {
  "id": f"BUG-{today}-{next_seq}",
  "date": now_iso(),
  "project": current_project,
  "severity": classify(),
  "category": classify(),
  "symptom": one_sentence(),
  "root_cause": paragraph(),
  "fix_summary": one_sentence(),
  "lesson": one_sentence(),
  # ...fill what you know
}
append_jsonl("~/.claude/memory/lessons/bugs.jsonl", entry)
```

No bug ships without a bugs.jsonl entry. Vex and Luna enforce this.

---

## How Mira uses it

On `/train` or weekly sweep, Mira runs:

1. **Cluster by `antipattern_tag`** — if ≥3 bugs share a tag, promote to `patterns/avoid/antipatterns.md` as a named entry.
2. **Cluster by `agent_that_shipped`** — if one agent accounts for >40% of P1/P2 bugs, flag for retraining in next audit cycle.
3. **Cluster by `file`** — if one file appears in ≥3 bugs, flag as "fragile — needs refactor" for Arya.
4. **Compute MTTR per category** — track whether time-to-fix is improving.
5. **Extract lessons** — dedupe `lesson` field, append unique ones to relevant stack/pattern files listed in `add_to`.

---

## Anti-duplicate rule

Before appending a bug, Mira greps `bugs.jsonl` for matching `root_cause` substring. If found, increment `"occurrences"` on the existing entry instead of creating a new one. This surfaces recurring bugs (the most valuable lessons).

---

## Learning extraction template

For every new unique `antipattern_tag`, Mira auto-drafts an entry for `patterns/avoid/antipatterns.md`:

```markdown
### <tag>

**First seen:** <date> in <project>
**Times hit:** <occurrences>
**Category:** <category>
**Symptom:** <symptom>
**Root cause:** <root_cause>
**Fix:** <fix_summary>
**Rule:** <lesson>
**Would have been prevented by:** <would_have_been_caught_by>

**Don't do:**
\`\`\`<lang>
// broken pattern
\`\`\`

**Do:**
\`\`\`<lang>
// correct pattern
\`\`\`
```

---

## Agent lesson files

Per-agent lessons (e.g., `lessons/agents/koda-lessons.jsonl`) are subsets of bugs.jsonl filtered by `agent_that_shipped`. Each agent loads its own lesson file in its first-load manifest on next dispatch, so it literally re-reads its own past mistakes before starting.

---

## Weekly sweep checklist (Mira)

Every Sunday night or on `/train`:

1. Read `bugs.jsonl` (append-only, so just read new entries since last sweep).
2. Cluster + dedupe.
3. Update `patterns/avoid/antipatterns.md` with any new ≥3-occurrence tags.
4. Update per-agent `<agent>-lessons.jsonl` files.
5. Write summary to `lessons/patterns-emerged.md` — "top 5 lessons this week".
6. If any agent >40% P1/P2 share → flag in `agents/performance-summary.md` for next audit.
7. Commit all memory changes with `git -C ~/.claude/memory commit -am "mira sweep YYYY-MM-DD"`.

---

## Delta

- **Before:** Bugs lived in ad-hoc prose notes, rarely re-read, never clustered.
- **After:** Every bug is structured, clustered, and fed back to the agent that caused it on its next run.
- **Expected impact:** 50%+ reduction in recurring bug categories by week 8.
