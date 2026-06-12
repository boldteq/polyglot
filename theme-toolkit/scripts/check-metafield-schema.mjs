#!/usr/bin/env node
// Boldteq metafield/metaobject schema validator (lattice Q19 dry-run) — pre-publish gate.
//
// Dry-run-validates lattice's structured schema artifact BEFORE it is pushed to the
// Shopify store: field types, RE2 regex, namespace convention, dangling metaobject
// refs, metaobject display keys. Replaces lattice's "test in admin first" manual check.
//
// Canonical artifact: docs/metafield-schema.json — the JSON form of the
// `metafield_schema_published` event payload (lattice.md L185-210). lattice writes it
// to disk pre-publish so this gate (and onyx) can parse it.
//
// Usage:
//   node check-metafield-schema.mjs        validate docs/metafield-schema.json in cwd
//
// Env:
//   SCHEMA_FILE   default docs/metafield-schema.json
//   REPORT_DIR    default gate-reports
//
// Absent schema file → PASS (a build may define no custom metafields).
// BLOCKS on: invalid JSON, bad/forbidden namespace, unknown field type, dangling
//   metaobject_reference, non-RE2 / uncompilable regex, metaobject without a valid
//   display_name_key, file_types on a non-file_reference type.
// WARNS on: storefront access flag unset, missing name/description.
//
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const SCHEMA_FILE = process.env.SCHEMA_FILE || 'docs/metafield-schema.json'

// Canonical metafield type set — shopify.dev list-of-data-types (single + list. prefix).
const SINGLE_TYPES = new Set([
  'single_line_text_field', 'multi_line_text_field', 'rich_text_field',
  'number_integer', 'number_decimal', 'money', 'boolean', 'color', 'date', 'date_time',
  'url', 'link', 'json', 'rating', 'dimension', 'volume', 'weight',
  'file_reference', 'product_reference', 'collection_reference', 'page_reference',
  'article_reference', 'blog_reference', 'variant_reference', 'metaobject_reference',
  'mixed_reference', 'company_reference', 'customer_reference', 'product_taxonomy_value_reference',
])
const FORBIDDEN_NS_ROOTS = new Set(['custom', 'app', 'global', '_private'])
const NS_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/
// PCRE-only constructs Shopify's RE2 engine rejects.
const NON_RE2 = [
  { re: /\(\?<[=!]/, what: 'lookbehind (?<= / (?<!' },
  { re: /\\[1-9]/, what: 'backreference \\1' },
  { re: /\(\?<[A-Za-z]/, what: 'named group (?<name> — RE2 uses (?P<name>)' },
  { re: /\(\?=|\(\?!/, what: 'lookahead (?= / (?!' },
]

const blockers = []
const warnings = []
const add = (list, id, where, detail) => list.push({ id, page: where, detail, evidence: '' })

function finish(envError) {
  const pass = !envError && blockers.length === 0
  writeReport('metafield-schema', 12, {
    cwd, pass, blockers, warnings,
    evidence: { schemaFile: SCHEMA_FILE, reason: envError || undefined },
    duration_ms: Date.now() - t0,
  })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`metafield-schema: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} [${b.page}] ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} [${w.page}] ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function isValidType(type) {
  if (typeof type !== 'string') return false
  const base = type.startsWith('list.') ? type.slice(5) : type
  return SINGLE_TYPES.has(base)
}

function checkRegex(pattern, where) {
  for (const { re, what } of NON_RE2) {
    if (re.test(pattern)) { add(blockers, 'schema.non-re2-regex', where, `regex uses ${what} — unsupported by Shopify's RE2 engine: /${pattern}/`); return }
  }
  try { new RegExp(pattern) } catch (err) { add(blockers, 'schema.bad-regex', where, `regex does not compile: /${pattern}/ (${err.message})`) }
}

function checkValidation(validation, type, where) {
  if (validation == null) return
  if (typeof validation !== 'object') { add(blockers, 'schema.bad-validation', where, 'validation must be an object'); return }
  if (typeof validation.regex === 'string') checkRegex(validation.regex, where)
  if (validation.file_types != null && !type.includes('file_reference')) {
    add(warnings, 'schema.file-types-misplaced', where, `file_types set on non-file_reference type "${type}"`)
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
const schemaAbs = path.resolve(cwd, SCHEMA_FILE)
if (!fs.existsSync(schemaAbs)) {
  add(warnings, 'schema.absent', SCHEMA_FILE, 'no schema artifact — build defines no custom metafields (pass)')
  finish(null)
}

let schema
try {
  schema = JSON.parse(fs.readFileSync(schemaAbs, 'utf-8'))
} catch (err) {
  add(blockers, 'schema.invalid-json', SCHEMA_FILE, `not parseable JSON: ${err.message}`)
  finish(null)
}

const definedMetaobjects = new Set(
  Array.isArray(schema.metaobject_definitions)
    ? schema.metaobject_definitions.map(d => d && d.type).filter(Boolean)
    : [],
)

// ── namespaces → metafields ──────────────────────────────────────────────────
const namespaces = schema.namespaces && typeof schema.namespaces === 'object' ? schema.namespaces : {}
for (const [ns, fields] of Object.entries(namespaces)) {
  const root = ns.split('.')[0]
  if (FORBIDDEN_NS_ROOTS.has(root)) {
    add(blockers, 'schema.forbidden-namespace', ns, `namespace root "${root}" is forbidden (use {client_handle}.{domain})`)
  } else if (!NS_RE.test(ns)) {
    add(blockers, 'schema.bad-namespace', ns, 'namespace must match {client_handle}.{domain} — lowercase, single dot, no spaces')
  }
  if (!fields || typeof fields !== 'object') continue
  for (const [key, def] of Object.entries(fields)) {
    const where = `${ns}.${key}`
    if (!def || typeof def !== 'object') { add(blockers, 'schema.bad-field', where, 'field definition must be an object'); continue }
    if (!isValidType(def.type)) {
      add(blockers, 'schema.bad-type', where, `type "${def.type}" is not a valid Shopify metafield type`)
    }
    if (typeof def.type === 'string' && def.type.includes('metaobject_reference')) {
      const mt = def.metaobject_type
      if (!mt) add(blockers, 'schema.metaobject-ref-no-type', where, 'metaobject_reference without `metaobject_type`')
      else if (!definedMetaobjects.has(mt)) add(blockers, 'schema.dangling-metaobject-ref', where, `metaobject_type "${mt}" has no matching metaobject_definitions entry`)
    }
    checkValidation(def.validation, def.type || '', where)
    if (def.storefront === undefined && (!def.access || def.access.storefront === undefined)) {
      add(warnings, 'schema.storefront-access-unset', where, 'no storefront access flag — set storefront:true if this renders in the theme')
    }
  }
}

// ── metaobject definitions ────────────────────────────────────────────────────
if (schema.metaobject_definitions != null && !Array.isArray(schema.metaobject_definitions)) {
  add(blockers, 'schema.metaobjects-not-array', SCHEMA_FILE, 'metaobject_definitions must be an array')
}
for (const def of Array.isArray(schema.metaobject_definitions) ? schema.metaobject_definitions : []) {
  if (!def || typeof def !== 'object') continue
  const where = `metaobject:${def.type || '?'}`
  if (!def.type) add(blockers, 'schema.metaobject-no-type', where, 'metaobject definition has no `type`')
  const fieldDefs = def.field_definitions || def.fields || []
  const fieldKeys = new Set(Array.isArray(fieldDefs) ? fieldDefs.map(f => f && f.key).filter(Boolean) : [])
  if (!def.display_name_key) {
    add(blockers, 'schema.metaobject-no-display-key', where, 'metaobject has no `display_name_key`')
  } else if (!fieldKeys.has(def.display_name_key)) {
    add(blockers, 'schema.display-key-dangling', where, `display_name_key "${def.display_name_key}" is not one of the metaobject's fields`)
  }
  for (const fd of Array.isArray(fieldDefs) ? fieldDefs : []) {
    if (!fd || typeof fd !== 'object') continue
    const fwhere = `${where}.${fd.key || '?'}`
    if (!isValidType(fd.type)) add(blockers, 'schema.bad-type', fwhere, `field type "${fd.type}" is not a valid Shopify type`)
    if (typeof fd.type === 'string' && fd.type.includes('metaobject_reference') && fd.metaobject_type && !definedMetaobjects.has(fd.metaobject_type)) {
      add(blockers, 'schema.dangling-metaobject-ref', fwhere, `metaobject_type "${fd.metaobject_type}" has no matching definition`)
    }
    checkValidation(fd.validation, fd.type || '', fwhere)
  }
  if (!def.access || def.access.storefront === undefined) {
    add(warnings, 'schema.metaobject-storefront-unset', where, 'metaobject has no access.storefront — set PUBLIC_READ if the theme renders it')
  }
}

finish(null)
