// Minimal dependency-free JSON-Schema (draft-ish subset) validator. Supports ONLY the keywords this
// toolkit actually uses: type (incl. union arrays + integer/number distinction), required, properties,
// additionalProperties:false, items, enum, minimum, maximum, minItems, minLength. Returns
// [{ path, message }] (empty array = valid). PURE — no I/O. Deliberately small + auditable; add a
// keyword only when a gate needs it. Used by check-discovery (#13 goals) + check-handoff-contract
// (#41 sign-off). Node 20 ESM.

const typeOf = (v) => {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'number' && Number.isInteger(v)) return 'integer'
  return typeof v // 'number' | 'string' | 'boolean' | 'object' | 'undefined'
}

// 'number' accepts any finite number (incl. integers); 'integer' only whole numbers.
const matchesType = (v, t) => {
  if (t === 'number') return typeof v === 'number' && Number.isFinite(v)
  if (t === 'integer') return Number.isInteger(v)
  return typeOf(v) === t
}

export function validate(value, schema, path = '') {
  const errs = []
  if (!schema || typeof schema !== 'object') return errs
  const at = path || '(root)'

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some(t => matchesType(value, t))) {
      errs.push({ path: at, message: `expected ${types.join('|')}, got ${typeOf(value)}` })
      return errs // type mismatch → don't cascade into sub-keywords (avoids noise)
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some(e => e === value)) {
    errs.push({ path: at, message: `must be one of ${JSON.stringify(schema.enum)}` })
  }
  if (typeof value === 'number') {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) errs.push({ path: at, message: `must be ≥ ${schema.minimum}` })
    if (Number.isFinite(schema.maximum) && value > schema.maximum) errs.push({ path: at, message: `must be ≤ ${schema.maximum}` })
  }
  if (typeof value === 'string' && Number.isFinite(schema.minLength) && value.length < schema.minLength) {
    errs.push({ path: at, message: `must be ≥ ${schema.minLength} char(s)` })
  }
  if (Array.isArray(value)) {
    if (Number.isFinite(schema.minItems) && value.length < schema.minItems) errs.push({ path: at, message: `must have ≥ ${schema.minItems} item(s)` })
    if (schema.items) value.forEach((it, i) => errs.push(...validate(it, schema.items, `${path}[${i}]`)))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const req of schema.required || []) {
      if (!(req in value)) errs.push({ path: path ? `${path}.${req}` : req, message: 'required property missing' })
    }
    if (schema.properties) {
      for (const [k, sub] of Object.entries(schema.properties)) {
        if (k in value) errs.push(...validate(value[k], sub, path ? `${path}.${k}` : k))
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties))
      for (const k of Object.keys(value)) {
        if (!allowed.has(k)) errs.push({ path: path ? `${path}.${k}` : k, message: 'unexpected property (additionalProperties:false)' })
      }
    }
  }
  return errs
}
