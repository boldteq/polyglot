// Data-driven rule engine — the scalable enforcement substrate.
//
// One PURE evaluator for declarative rules so ENFORCING a guideline becomes appending a JSON
// line, not coding a gate. Generalizes the 4 rule types that lived hardcoded in
// check-client-overrides.mjs into 6, shared by check-rule-pack.mjs (team-wide + auto-grown rules)
// AND check-client-overrides.mjs (per-store rules). No fs, no deps — the caller builds the corpus.
//
// Rule shape (in a JSON array):
//   { "id":"no-cheap", "type":"forbid-text", "pattern":"\\bcheap\\b",
//     "severity":"block", "message":"never say 'cheap'", "owner":"ink", "source":"..." }
//
// type ∈ forbid-text · forbid-section-pattern · require-section · require-pattern ·
//        forbid-css-pattern · pin-design-system
// severity ∈ 'block' (default) | 'warn'   →  finding.severity 'blocker' | 'warning'
//
// corpus = {
//   sections:  [{ file, basename, text }],   // sections/*.liquid
//   templates: [{ file, basename, text }],   // templates/*.json
//   css:       [{ file, basename, text }],   // assets/*.css + inline <style>
//   ds:        object|null,                   // design-system.json (for pin-design-system)
// }

export const RULE_TYPES = [
  'forbid-text', 'forbid-section-pattern', 'require-section',
  'require-pattern', 'forbid-css-pattern', 'pin-design-system',
]

function safeRe(pattern, flags = 'i') {
  try { return new RegExp(pattern, flags) } catch { return null }
}
const sev = (rule) => (rule.severity === 'warn' ? 'warning' : 'blocker')
const getField = (obj, dotted) => String(dotted).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
const why = (rule) => {
  const m = rule.message || rule.decision || ''
  return m ? ` — ${m}` : ''
}
const sourceTag = (rule) => (rule.source ? ` [${rule.source}]` : '')

// Evaluate ONE rule against the corpus → array of findings (may be empty).
// finding = { id, page, detail, evidence, severity }
export function evaluateRule(rule, corpus) {
  if (!rule || typeof rule !== 'object' || !rule.type) return []
  const out = []
  const id = rule.id ? `rule.${rule.id}` : `rule.${rule.type}`
  const sections = corpus.sections || []
  const templates = corpus.templates || []
  const css = corpus.css || []
  const textCorpus = [...sections, ...templates]

  if (!RULE_TYPES.includes(rule.type)) {
    return [{ id: 'rule.unknown-type', page: rule.source || '(rule-pack)', detail: `rule "${rule.id || rule.type}" has unknown type "${rule.type}" — not enforced (valid: ${RULE_TYPES.join(', ')})`, evidence: rule.type, severity: 'warning' }]
  }

  switch (rule.type) {
    case 'forbid-text': {
      const re = safeRe(rule.pattern)
      if (!re) return [badPattern(rule)]
      const hits = []
      for (const f of textCorpus) { const m = re.exec(f.text); if (m) hits.push(`${f.basename} ("${String(m[0]).slice(0, 28)}")`) }
      if (hits.length) out.push({ id, page: hits[0].split(' (')[0], detail: `forbidden text /${rule.pattern}/ appears in ${hits.slice(0, 4).join(', ')}${hits.length > 4 ? ` +${hits.length - 4} more` : ''}${why(rule)}${sourceTag(rule)}`, evidence: hits.slice(0, 6).join(', '), severity: sev(rule) })
      break
    }
    case 'forbid-section-pattern': {
      const re = safeRe(rule.pattern)
      if (!re) return [badPattern(rule)]
      const scope = rule.scope ? safeRe(rule.scope) : null
      const hits = sections.filter((f) => (!scope || scope.test(f.basename)) && re.test(f.text)).map((f) => f.basename)
      if (hits.length) out.push({ id, page: hits[0], detail: `${hits.length} section(s) match forbidden pattern /${rule.pattern}/${rule.scope ? ` in scope /${rule.scope}/` : ''}: ${hits.join(', ')}${why(rule)}${sourceTag(rule)}`, evidence: hits.join(', '), severity: sev(rule) })
      break
    }
    case 'forbid-css-pattern': {
      const re = safeRe(rule.pattern)
      if (!re) return [badPattern(rule)]
      const hits = css.filter((f) => re.test(f.text)).map((f) => f.basename)
      if (hits.length) out.push({ id, page: hits[0], detail: `forbidden CSS pattern /${rule.pattern}/ in ${hits.slice(0, 4).join(', ')}${why(rule)}${sourceTag(rule)}`, evidence: hits.slice(0, 6).join(', '), severity: sev(rule) })
      break
    }
    case 'require-section': {
      const re = safeRe(rule.pattern)
      if (!re) return [badPattern(rule)]
      const present = sections.some((f) => re.test(f.basename) || re.test(f.text))
      if (!present) out.push({ id, page: '(build)', detail: `required section matching /${rule.pattern}/ is ABSENT from the build${why(rule)}${sourceTag(rule)}`, evidence: rule.pattern, severity: sev(rule) })
      break
    }
    case 'require-pattern': {
      const re = safeRe(rule.pattern)
      if (!re) return [badPattern(rule)]
      const present = textCorpus.some((f) => re.test(f.text))
      if (!present) out.push({ id, page: '(build)', detail: `required pattern /${rule.pattern}/ does not appear anywhere in the theme${why(rule)}${sourceTag(rule)}`, evidence: rule.pattern, severity: sev(rule) })
      break
    }
    case 'pin-design-system': {
      if (!corpus.ds) { out.push({ id: 'rule.no-design-system', page: '(rule-pack)', detail: `cannot enforce pin "${rule.id || rule.field}" — no design-system.json present`, evidence: rule.field, severity: 'warning' }); break }
      const actual = getField(corpus.ds, rule.field)
      if (JSON.stringify(actual) !== JSON.stringify(rule.value)) out.push({ id, page: 'design-system.json', detail: `design-system.json ${rule.field} = ${JSON.stringify(actual)} but is PINNED to ${JSON.stringify(rule.value)} — a frozen decision changed${why(rule)}${sourceTag(rule)}`, evidence: rule.field, severity: sev(rule) })
      break
    }
  }
  return out
}

function badPattern(rule) {
  return { id: 'rule.bad-pattern', page: rule.source || '(rule-pack)', detail: `rule "${rule.id || rule.type}" has an invalid regex /${rule.pattern}/ — skipped`, evidence: String(rule.pattern), severity: 'warning' }
}

// Evaluate ALL rules → { blockers, warnings } (the writeReport shape), plus `enforced` count.
export function evaluateRules(rules, corpus) {
  const blockers = []; const warnings = []
  let enforced = 0
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule || !rule.type) continue
    enforced += 1
    for (const f of evaluateRule(rule, corpus)) {
      const { severity, ...finding } = f
      if (severity === 'warning') warnings.push(finding); else blockers.push(finding)
    }
  }
  return { blockers, warnings, enforced }
}
