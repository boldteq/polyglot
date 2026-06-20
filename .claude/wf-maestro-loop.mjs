export const meta = {
  name: 'maestro-loop',
  description: 'Maestro Loop — per-surface draft→render→Lens→fix, carrying build-state, ≤3 rounds/surface then escalate',
  phases: [
    { title: 'Build surfaces' },
    { title: 'Summary' },
  ],
}
// The production wiring of lib/maestro-loop.mjs (algorithm proven hermetically by
// `pnpm maestro:dryrun` — 6 cases green). This is the deterministic orchestration the doctrine
// (maestro-build-protocol.md) calls for: ONE mind (this run) holds the store via docs/build-state.md
// and iterates each surface until Lens PASSes, calling specialists as CONSULTANTS (agentType).
//
// RUN (on an authed env — needs Shopify CLI + claude for Lens; the headless toolkit can't):
//   Workflow({ scriptPath: '.claude/wf-maestro-loop.mjs', args: {
//     repo: '/abs/path/to/theme-repo', previewUrl: 'http://127.0.0.1:9292',
//     surfaces: ['home','collection','pdp','cart'] } })
// PRECONDITION: `pnpm theme:dev` running (previewUrl live) + `pnpm build-state init` already run.
// First live run smoke-tests the wiring; the loop CONTROL is already proven by the dryrun harness.

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    pass: { type: 'boolean' },
    confidence: { type: 'number' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          check: { type: 'string' }, severity: { type: 'string' },
          fix_owner: { type: 'string' }, evidence: { type: 'string' },
        },
        required: ['check', 'severity'],
      },
    },
  },
  required: ['pass', 'confidence', 'findings'],
}
const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    summary: { type: 'string' },
    decisions: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'summary'],
}

const repo = args?.repo
const surfaces = Array.isArray(args?.surfaces) && args.surfaces.length ? args.surfaces : ['home', 'collection', 'pdp', 'cart', 'search', 'account']
const previewUrl = args?.previewUrl || 'http://127.0.0.1:9292'
const MAX = args?.maxRounds || 3
if (!repo) throw new Error('maestro-loop: args.repo (absolute path to the theme repo) is required')

const draftPrompt = (surface, round, findings) => `You are the surface BUILDER for the "${surface}" surface, working in the Shopify theme repo at ${repo}.
This is round ${round} of the Maestro Loop. FIRST read docs/build-state.md (the carried mind — the design-system summary + the Cross-surface decisions ledger EVERY surface must obey) and docs/design/design-system.json. Honor them exactly — your job is coherence with the rest of the store, not a fresh interpretation.
${round > 1 && findings?.length ? `The previous render FAILED Lens. Fix THESE findings (routed by owner):\n${findings.map(f => `- [${f.fix_owner || '?'}] ${f.check}: ${f.evidence || ''}`).join('\n')}` : 'Draft/refine templates/' + surface + '.json and the sections it uses.'}
Consult drape's design-spec for visual treatment and ink for honest copy (no fabricated stats/reviews, no fake urgency). Edit the Liquid/JSON in place. If you discover a decision that affects OTHER surfaces (e.g. "buttons are pill 14px/600 everywhere"), return it in decisions[] so it enters the ledger. Return ok=true when the surface is drafted.`

const seePrompt = (surface, round) => `In the Shopify theme repo at ${repo}, render + SEE the "${surface}" surface (Maestro Loop round ${round}):
1. Do NOT run \`pnpm theme:push\` — the running \`pnpm theme:dev\` preview (precondition) already hot-reloads your edits to ${previewUrl}. A mid-build push trips theme-push's publish gate (theme-gates --verify --require-full can't be fresh mid-build) and, in single-theme mode, pushes unfinished drafts to the LIVE store. Just give the preview a moment to reload.
2. Run \`THEME_PREVIEW_URL=${previewUrl} pnpm lens:surface ${surface}\` — this captures the rendered surface, has a vision judge score it against its rubric, and enforces (gate #18).
3. Record the result to the carried mind: \`pnpm build-state record ${surface} ${'${PASS|WIP}'}\` (PASS if lens:surface exited 0, else WIP).
Report the Lens verdict: pass (did lens:surface exit 0?), confidence (the judge's %), and findings[] (each: check, severity, fix_owner ∈ loom|drape|ink|porter, evidence). If it failed to run (no preview URL / CLI), return pass=false with a finding explaining the infra error.`

phase('Build surfaces')
const results = []
for (const surface of surfaces) {
  let outcome = null
  for (let round = 1; round <= MAX; round += 1) {
    const findings = outcome?.findings || []
    const draft = await agent(draftPrompt(surface, round, findings), { label: `draft:${surface}#${round}`, phase: 'Build surfaces', agentType: 'loom', schema: DRAFT_SCHEMA })
    if (!draft || draft.ok === false) { outcome = { status: 'error', rounds: round, error: draft?.summary || 'draft failed/skipped' }; break }
    if (Array.isArray(draft.decisions) && draft.decisions.length) log(`[${surface}] +${draft.decisions.length} cross-surface decision(s): ${draft.decisions.join('; ')}`)

    const v = await agent(seePrompt(surface, round), { label: `lens:${surface}#${round}`, phase: 'Build surfaces', schema: VERDICT_SCHEMA })
    if (v && v.pass) { outcome = { status: 'PASS', rounds: round, confidence: v.confidence }; log(`[${surface}] PASS round ${round} (confidence ${v.confidence}%)`); break }

    outcome = { status: 'FAIL', rounds: round, findings: (v && v.findings) || [] }
    log(`[${surface}] round ${round} FAIL — ${outcome.findings.length} finding(s); ${round < MAX ? 'redraft' : 'ESCALATE'}`)
  }
  if (!outcome) outcome = { status: 'FAIL', rounds: MAX, findings: [] }
  results.push({ surface, ...outcome })
}

phase('Summary')
const converged = results.filter(r => r.status === 'PASS').map(r => r.surface)
const escalated = results.filter(r => r.status !== 'PASS')
log(`Maestro Loop done — ${converged.length}/${results.length} surfaces cleared Lens. ${escalated.length ? `ESCALATE: ${escalated.map(r => `${r.surface}(${r.status},${r.rounds}r)`).join(', ')}` : 'all surfaces PASS.'}`)
if (escalated.length) {
  log('Escalated surfaces did not converge in ≤' + MAX + ' rounds — a human/onyx must look (do NOT publish a non-converged store). Findings are in docs/build-state.md + gate-reports/lens/.')
}
return { converged, escalated: escalated.map(r => r.surface), allPass: escalated.length === 0, surfaces: results }
