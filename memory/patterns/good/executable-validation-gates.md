# Executable Validation Gates — Factory Protocol

**Locked:** 2026-04-11
**Hardened:** 2026-04-22 (MUST enforcement + multi-model readiness)
**Owner:** Every agent runs its gate before declaring done. Koda's gate is the master because it's the biggest.

---

## Enforcement Level — MUST, not SHOULD

Every gate below is **MANDATORY**. Non-negotiable. The wording "runs it before" = hard gate, not suggestion.

**Binding rules (apply to every agent, every stack, every PR):**

1. **No PR merges** without its owning agent's gate in a `PASS` state in the gate report.
2. **No deploy** without Bolt preflight returning exit 0.
3. **Sage review is mandatory** on any PR where the producing agent ran on:
   - `claude-haiku-4-5-20251001` (any agent routed to CHEAP tier)
   - Any non-Anthropic provider (Ollama, local models, future providers)
   - An agent whose `agent_runs.composite_score` for the last 20 runs is < 70
4. **Pre-dispatch score gate:** before any dispatch, Roster queries `agents.composite_score`; if < 50, the dispatch is **blocked** and escalated to Cadence. (Requires Polyglot SDK implementation — see handoff note in `polyglot-sdk-spec.md`.)
5. **CI/CD workflows** in every project MUST include: `tsc --noEmit`, `eslint --max-warnings=0`, `vitest run --coverage` with threshold `lines ≥ 70`. Projects missing any of the three are non-compliant and must be brought into compliance before any Haiku/Ollama routing is enabled for that project.

**Why this section exists:** validation-gates.md was previously aspirational — gates existed as scripts but nothing technically enforced they ran. With multi-model routing (Haiku, Ollama autocomplete), a weaker model's output could ship if gates stayed optional. This section makes them binding.

---

## Koda's Definition of Done (all blocking, per Yash 2026-04-11)

A feature is NOT done until ALL of these pass:

```bash
#!/usr/bin/env bash
# scripts/koda-done-gate.sh
# Place this in every Boldteq project root. Every Koda feature runs it before PR open.
set -e
set -o pipefail

PROJECT_ROOT="${1:-$(pwd)}"
cd "$PROJECT_ROOT"

echo "=== KODA DONE-GATE: $(basename $PROJECT_ROOT) ==="

# Gate 1: TypeScript strict
echo "→ Gate 1/5: TypeScript strict"
pnpm tsc --noEmit || { echo "FAIL: tsc --noEmit"; exit 1; }

# Gate 2: ESLint clean
echo "→ Gate 2/5: ESLint"
pnpm eslint . --max-warnings=0 || { echo "FAIL: eslint"; exit 1; }

# Gate 3: Unit tests + coverage ≥70% on touched files
echo "→ Gate 3/5: Vitest + coverage"
pnpm vitest run --coverage --reporter=default
# Parse coverage-summary.json for touched-file coverage
node -e '
  const fs = require("fs");
  const cov = JSON.parse(fs.readFileSync("coverage/coverage-summary.json"));
  const { execSync } = require("child_process");
  const touched = execSync("git diff --name-only origin/main...HEAD")
    .toString().split("\n")
    .filter(f => f.match(/\.(ts|tsx)$/) && !f.match(/\.test\.|\.spec\./));
  let fail = false;
  for (const f of touched) {
    const key = Object.keys(cov).find(k => k.endsWith(f));
    if (!key) continue;
    const pct = cov[key].lines.pct;
    if (pct < 70) {
      console.error(`FAIL: ${f} coverage ${pct}% < 70%`);
      fail = true;
    }
  }
  if (fail) process.exit(1);
' || exit 1

# Gate 4: Playwright E2E for the feature's happy path
echo "→ Gate 4/5: Playwright E2E"
pnpm playwright test --reporter=line || { echo "FAIL: playwright"; exit 1; }

# Gate 5: Lighthouse ≥90 on affected routes
echo "→ Gate 5/5: Lighthouse"
# Spin up preview build
pnpm build
pnpm start &
SERVER_PID=$!
sleep 5

# Run Lighthouse on affected routes (detected from git diff)
AFFECTED_ROUTES=$(git diff --name-only origin/main...HEAD | \
  grep -E '^app/.*(page|layout)\.tsx$' | \
  sed -E 's|^app/||; s|/page\.tsx$||; s|/layout\.tsx$||; s|^|/|' | \
  sort -u)

FAIL=0
for route in $AFFECTED_ROUTES; do
  URL="http://localhost:3000${route}"
  echo "  Lighthouse: $URL"
  npx lighthouse "$URL" \
    --only-categories=performance,accessibility,best-practices,seo \
    --chrome-flags="--headless=new" \
    --output=json \
    --output-path=./lighthouse-${route//\//_}.json \
    --quiet || { FAIL=1; continue; }

  # Check all 4 scores ≥0.90
  node -e "
    const r = require('./lighthouse-${route//\//_}.json');
    const scores = {
      perf: r.categories.performance.score,
      a11y: r.categories.accessibility.score,
      bp: r.categories['best-practices'].score,
      seo: r.categories.seo.score,
    };
    for (const [k, v] of Object.entries(scores)) {
      if (v < 0.9) { console.error('FAIL: ${route} ' + k + ' = ' + v); process.exit(1); }
    }
  " || FAIL=1
done

kill $SERVER_PID 2>/dev/null || true

[ "$FAIL" = "0" ] || { echo "FAIL: lighthouse"; exit 1; }

echo ""
echo "=== KODA DONE-GATE: PASS (all 5 gates green) ==="
exit 0
```

### How Koda uses it

1. Implement feature on branch `koda/<feature-slug>`
2. Commit work
3. Run `./scripts/koda-done-gate.sh`
4. If all pass → push, open draft PR, handoff to Sage
5. If any fail → enter auto-fix loop (max 5 retries), fix first failure, rerun gate
6. If still failing after 5 → escalate to Rex with the escalation payload

---

## Sage gate (security + GDPR + a11y audit)

```bash
#!/usr/bin/env bash
# scripts/sage-audit.sh
set -e
cd "${1:-$(pwd)}"

echo "=== SAGE AUDIT ==="

# 1. Secret scan
echo "→ Secret scan"
npx gitleaks detect --source . --no-git --verbose || { echo "FAIL: secrets found"; exit 1; }

# 2. Dependency vulnerabilities (only critical/high)
echo "→ Dependency audit"
pnpm audit --audit-level=high || { echo "FAIL: high/critical vulns"; exit 1; }

# 3. RLS audit — every Supabase table referenced in code must have policies
echo "→ RLS audit"
node scripts/sage-rls-audit.mjs || { echo "FAIL: RLS gap detected"; exit 1; }

# 4. axe-core a11y on key routes
echo "→ a11y (axe-core)"
pnpm playwright test tests/a11y --reporter=line || { echo "FAIL: a11y violations"; exit 1; }

# 5. OWASP headers check
echo "→ Security headers"
node scripts/sage-headers-check.mjs || { echo "FAIL: missing security headers"; exit 1; }

# 6. GDPR check — any table with PII must have deletion endpoint
echo "→ GDPR deletion check"
node scripts/sage-gdpr-check.mjs || { echo "FAIL: missing GDPR deletion"; exit 1; }

echo "=== SAGE AUDIT: PASS ==="
```

Sage auto-dispatches to Koda on Critical findings (per Yash 2026-04-11): the failing check code + fix hint are written to `.sage-findings.json`, Koda reads it, enters its own auto-fix loop, re-runs Sage when done.

---

## Luna gate (testing completeness)

Luna's gate is subsumed by Koda's gates 3 and 4 above. Luna's additional job is to WRITE the tests, not re-run them. Luna's done-gate:

```bash
#!/usr/bin/env bash
# scripts/luna-check.sh
# Luna checks that every touched file has corresponding tests
set -e

AFFECTED=$(git diff --name-only origin/main...HEAD | grep -E '\.(ts|tsx)$' | grep -v -E '\.test\.|\.spec\.|/test/|/tests/')

MISSING=()
for f in $AFFECTED; do
  base=$(echo "$f" | sed -E 's/\.(ts|tsx)$//')
  if [ ! -f "${base}.test.ts" ] && [ ! -f "${base}.test.tsx" ] && [ ! -f "${base}.spec.ts" ]; then
    MISSING+=("$f")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "FAIL: missing tests for:"
  printf '  %s\n' "${MISSING[@]}"
  exit 1
fi

echo "LUNA CHECK: PASS (all touched files tested)"
```

Exceptions (files that don't need unit tests):
- `app/**/page.tsx`, `app/**/layout.tsx` → covered by Playwright E2E
- `app/**/error.tsx`, `app/**/loading.tsx` → covered by Playwright E2E
- `components/ui/*` (shadcn primitives) → vendor code
- `*.config.ts`, `middleware.ts` → covered by integration tests

Luna's gate loops with 3 retries max, generating missing tests from the file under test.

---

## Vega gate (visual + a11y scoring)

Vega's gate is specified in the Vega section of `executable-visual-validation.md` (pixelmatch diff protocol). Summary:

1. Playwright screenshot every touched route at mobile (375px) and desktop (1440px)
2. pixelmatch diff against `tests/visual/baselines/`
3. Fail if any page diffs >0.1% pixels AND the diff is not in an intentional-change allowlist
4. axe-core scan on each screenshot → fail on any WCAG AA violation
5. Vega retries max 5 (builder class) — can adjust Tailwind classes, re-render, rediff

---

## Bolt gate (pre-deploy checklist)

```bash
#!/usr/bin/env bash
# scripts/bolt-preflight.sh
set -e

echo "=== BOLT PREFLIGHT ==="

# 1. Koda gate must have passed on the PR
[ -f .gate-reports/koda-done-gate.json ] && jq -e '.status=="pass"' .gate-reports/koda-done-gate.json || { echo "FAIL: koda gate not green"; exit 1; }

# 2. Sage audit must be green
[ -f .gate-reports/sage-audit.json ] && jq -e '.status=="pass"' .gate-reports/sage-audit.json || { echo "FAIL: sage audit not green"; exit 1; }

# 3. Env vars exist in Railway for target env
railway variables list --environment "$TARGET_ENV" > /tmp/rw-vars.txt
while read var; do
  grep -q "^$var" /tmp/rw-vars.txt || { echo "FAIL: missing env var $var"; exit 1; }
done < <(grep -v '^#' .env.example | cut -d= -f1 | grep -v '^$')

# 4. Supabase migrations applied
npx supabase db push --dry-run 2>&1 | grep -q "No schema changes" || { echo "FAIL: pending migrations"; exit 1; }

# 5. Build passes
pnpm build || { echo "FAIL: pnpm build"; exit 1; }

# 6. Smoke test the build output locally
PORT=3001 pnpm start &
SERVER=$!
sleep 5
curl -f http://localhost:3001/api/health || { kill $SERVER; echo "FAIL: health check"; exit 1; }
kill $SERVER

echo "=== BOLT PREFLIGHT: PASS (deploy authorized) ==="
```

Bolt retries 3 max. Critical failures (migration missing, env var missing) escalate immediately — no retry.

---

## Hawk gate (post-deploy monitoring window)

```bash
#!/usr/bin/env bash
# scripts/hawk-postdeploy.sh
# Runs for 30 min after every production deploy
set -e

DEPLOY_ID="$1"
DEPLOY_TS=$(date +%s)
END_TS=$((DEPLOY_TS + 30*60))

echo "=== HAWK POST-DEPLOY WATCH (30 min) ==="

while [ "$(date +%s)" -lt "$END_TS" ]; do
  # Sentry error rate
  SENTRY_RATE=$(curl -s "https://sentry.io/api/0/organizations/boldteq/stats_v2/?statsPeriod=5m&field=sum(quantity)&project=$SENTRY_PROJECT" | jq -r '.groups[0].series["sum(quantity)"] | add')

  # Railway health
  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/health")

  # Thresholds
  if [ "$SENTRY_RATE" -gt 50 ]; then
    echo "CRITICAL: Sentry rate $SENTRY_RATE in 5min"
    bolt rollback "$DEPLOY_ID" &
    break
  fi

  if [ "$HEALTH" != "200" ]; then
    echo "CRITICAL: health check $HEALTH"
    bolt rollback "$DEPLOY_ID" &
    break
  fi

  sleep 60
done

echo "=== HAWK POST-DEPLOY WATCH: COMPLETE ==="
```

If Hawk triggers rollback → Vex picks up the root cause investigation automatically.

---

## Where these scripts live

Every Boldteq project has:

```
scripts/
├── koda-done-gate.sh
├── sage-audit.sh
├── sage-rls-audit.mjs
├── sage-headers-check.mjs
├── sage-gdpr-check.mjs
├── luna-check.sh
├── vega-visual-diff.mjs
├── bolt-preflight.sh
└── hawk-postdeploy.sh
```

The Boldteq SaaS starter (`starters/boldteq-saas-starter.md`) ships with all of these pre-installed. Riko copies them into every new project during scaffold.

---

## Delta

- **Was:** "run tests and make sure it passes" prose
- **Now:** 7 executable scripts, explicit thresholds, explicit fail modes, explicit retry counts
- **Expected B1/B2 lift:** factory avg 7.9 → 9.2 (every agent now has a runnable gate)
