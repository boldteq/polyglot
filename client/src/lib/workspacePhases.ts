// The 18-step Shopify-website build is really 7 phases (Boldteq's pipeline
// doctrine). The backend pipelineSpec carries step/key/title/owner/artifact; this
// adds the UI legibility layer — phase grouping + a plain-english one-liner per
// step — so "how it works / where am I" is self-evident. Phase is derived from the
// step number (fixed ranges), so this needs no backend/api.ts change.

export interface Phase { id: string; label: string; from: number; to: number }

export const PHASES: Phase[] = [
  { id: 'intake', label: 'Intake', from: 1, to: 1 },
  { id: 'discovery', label: 'Discovery', from: 2, to: 4 },
  { id: 'design', label: 'Design', from: 5, to: 8 },
  { id: 'build', label: 'Build', from: 9, to: 12 },
  { id: 'qa', label: 'QA', from: 13, to: 15 },
  { id: 'publish', label: 'Publish', from: 16, to: 17 },
  { id: 'monitor', label: 'Monitor', from: 18, to: 18 },
]

export function phaseForStep(step: number): Phase {
  return PHASES.find((p) => step >= p.from && step <= p.to) ?? PHASES[0]
}

// Plain-english "what this step does" — demystifies cryptic titles like
// "reuse-preflight" / "store-data" / "uat-publish" for a non-expert reader.
export const STEP_DESCRIPTION: Record<string, string> = {
  intake: 'Capture the client brief — brand, goals, scope — into CHANGES.md.',
  discovery: 'Research the business + competitors → goals.json (the build’s north-star).',
  'content-arch': 'Plan the sitemap and per-page content briefs.',
  'theme-base': 'Pick the theme base — Minimog (configure-rich) or Dawn (custom).',
  'reuse-preflight': 'Map which sections can be reused vs built custom (saves dev time).',
  'design-spec': 'Design the pages and lock the design-system (colors, type, spacing).',
  'copy-draft': 'Write the on-page copy (hero, PDP, cart) — honest claims only.',
  'client-review-1': 'Client reviews the design and signs off before building.',
  convert: 'Convert the approved design into Liquid sections.',
  schema: 'Define the metafields/metaobjects for dynamic content.',
  integrate: 'Wire the Liquid sections and data into a working theme.',
  'store-data': 'Write products, images, pages and metafield values to the store.',
  'qa-gates': 'Run the automated QA + SEO gate suite (must pass to publish).',
  lens: 'Vision-judge the rendered theme — catches layout/contrast bugs gates miss.',
  review: 'Final code review for quality and best practices.',
  staging: 'Push the theme to a staging slot for review.',
  'uat-publish': 'Client UAT, then flip the theme live on the store.',
  results: '48-hour launch watch + 30/90-day results (CVR/AOV) tracking.',
}

export const stepDescription = (key: string): string => STEP_DESCRIPTION[key] ?? ''

// Per-phase progress from a list of steps with a status field.
export function phaseProgress(steps: { step: number; status: string }[]): Record<string, { done: number; total: number }> {
  const out: Record<string, { done: number; total: number }> = {}
  for (const p of PHASES) {
    const inPhase = steps.filter((s) => s.step >= p.from && s.step <= p.to)
    out[p.id] = { done: inPhase.filter((s) => s.status === 'done').length, total: inPhase.length }
  }
  return out
}
