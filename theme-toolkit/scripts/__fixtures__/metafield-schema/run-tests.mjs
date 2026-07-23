// check-metafield-schema had 14 of its 15 BLOCKING checks unproven (QA-1's worst offender).
//
// This gate is lattice's dry-run before metafields are pushed to a live store — a bad namespace,
// dangling metaobject ref or non-RE2 regex only surfaces as an Admin API rejection mid-publish
// otherwise. Every one of those blockers could stop a client build, and none had ever been shown to
// fire. An unproven blocker is indistinguishable from an absent one.
//
// Each case here plants exactly one defect and asserts the specific id, so a rule that silently stops
// matching is caught. Hermetic: temp dirs, no theme, no network.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-metafield-schema.mjs')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

function run(schema, env = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mfs-'))
  fs.mkdirSync(path.join(d, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs', 'metafield-schema.json'),
    typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2))
  const reportDir = path.join(d, 'gate-reports')
  const r = spawnSync(process.execPath, [GATE], { cwd: d, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: reportDir, ...env } })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'metafield-schema.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(d, { recursive: true, force: true })
  return { code: r.status, ids: new Set((rep?.blockers || []).map((b) => b.id)), rep }
}
const expectBlock = (name, schema, id, env) => {
  const { code, ids } = run(schema, env)
  if (code === 1 && ids.has(id)) ok(`${name} → ${id}`)
  else bad(`${name}: expected exit 1 + ${id}, got exit ${code} + [${[...ids].join(', ') || 'none'}]`)
}

// a minimal schema that must PASS, so every case below differs by exactly one planted defect
const GOOD = {
  namespaces: { 'cravin.pantry': { hero_note: { type: 'single_line_text_field', storefront: true } } },
  metaobject_definitions: [
    { type: 'location_card', display_name_key: 'title', field_definitions: [{ key: 'title', type: 'single_line_text_field' }] },
  ],
}

console.log('check-metafield-schema — every BLOCKING rule, planted one at a time')
{
  const { code, ids } = run(GOOD)
  code === 0 ? ok('the clean schema passes (no false blocks)') : bad(`clean schema blocked: [${[...ids].join(', ')}]`)
}

console.log('\n── namespaces ──')
expectBlock('reserved root "custom"', { ...GOOD, namespaces: { custom: { a: { type: 'boolean' } } } }, 'schema.forbidden-namespace')
expectBlock('reserved root "app"', { ...GOOD, namespaces: { app: { a: { type: 'boolean' } } } }, 'schema.forbidden-namespace')
expectBlock('no dot in the namespace', { ...GOOD, namespaces: { cravin: { a: { type: 'boolean' } } } }, 'schema.bad-namespace')
expectBlock('uppercase in the namespace', { ...GOOD, namespaces: { 'Cravin.Pantry': { a: { type: 'boolean' } } } }, 'schema.bad-namespace')

console.log('\n── field definitions ──')
expectBlock('field def is not an object', { ...GOOD, namespaces: { 'cravin.pantry': { k: 'nope' } } }, 'schema.bad-field')
expectBlock('unknown metafield type', { ...GOOD, namespaces: { 'cravin.pantry': { k: { type: 'text' } } } }, 'schema.bad-type')
expectBlock('metaobject_reference with no metaobject_type',
  { ...GOOD, namespaces: { 'cravin.pantry': { k: { type: 'metaobject_reference' } } } }, 'schema.metaobject-ref-no-type')
expectBlock('metaobject_reference pointing at an undefined type',
  { ...GOOD, namespaces: { 'cravin.pantry': { k: { type: 'metaobject_reference', metaobject_type: 'ghost' } } } }, 'schema.dangling-metaobject-ref')

console.log('\n── validation / regex (RE2 is stricter than JS — this is why it matters) ──')
expectBlock('validation is not an object',
  { ...GOOD, namespaces: { 'cravin.pantry': { k: { type: 'single_line_text_field', validation: 'x' } } } }, 'schema.bad-validation')
expectBlock('lookahead (?=) — valid JS, rejected by RE2',
  { ...GOOD, namespaces: { 'cravin.pantry': { k: { type: 'single_line_text_field', validation: { regex: '^(?=.*a).+$' } } } } }, 'schema.non-re2-regex')
expectBlock('lookbehind (?<=) — valid JS, rejected by RE2',
  { ...GOOD, namespaces: { 'cravin.pantry': { k: { type: 'single_line_text_field', validation: { regex: '(?<=x)y' } } } } }, 'schema.non-re2-regex')
expectBlock('backreference \\1 — valid JS, rejected by RE2',
  { ...GOOD, namespaces: { 'cravin.pantry': { k: { type: 'single_line_text_field', validation: { regex: '(a)\\1' } } } } }, 'schema.non-re2-regex')
expectBlock('regex that does not compile at all',
  { ...GOOD, namespaces: { 'cravin.pantry': { k: { type: 'single_line_text_field', validation: { regex: '([unclosed' } } } } }, 'schema.bad-regex')

console.log('\n── metaobject definitions ──')
expectBlock('metaobject_definitions is not an array',
  { ...GOOD, metaobject_definitions: { type: 'x' } }, 'schema.metaobjects-not-array')
expectBlock('metaobject with no type',
  { ...GOOD, metaobject_definitions: [{ display_name_key: 't', field_definitions: [{ key: 't', type: 'single_line_text_field' }] }] },
  'schema.metaobject-no-type')
expectBlock('metaobject with no display_name_key',
  { ...GOOD, metaobject_definitions: [{ type: 'card', field_definitions: [{ key: 't', type: 'single_line_text_field' }] }] },
  'schema.metaobject-no-display-key')
expectBlock('display_name_key naming a field that does not exist',
  { ...GOOD, metaobject_definitions: [{ type: 'card', display_name_key: 'missing', field_definitions: [{ key: 't', type: 'single_line_text_field' }] }] },
  'schema.display-key-dangling')
expectBlock('metaobject FIELD with a bad type',
  { ...GOOD, metaobject_definitions: [{ type: 'card', display_name_key: 't', field_definitions: [{ key: 't', type: 'nonsense' }] }] },
  'schema.bad-type')

console.log('\n── file-level ──')
expectBlock('unparseable JSON', '{ "namespaces": { ', 'schema.invalid-json')

console.log('\n── completeness (#33) is advisory unless explicitly enforced ──')
{
  // no sections/ in the temp dir → not applicable, must not fire either way
  const { code } = run(GOOD, { SCHEMA_REQUIRE_COMPLETE: '1' })
  code === 0 ? ok('no theme present → completeness check correctly skips') : bad(`completeness fired without a theme (exit ${code})`)
}

console.log('\n── no false blocks on legitimate shapes ──')
{
  const listType = { ...GOOD, namespaces: { 'cravin.pantry': { k: { type: 'list.product_reference', storefront: true } } } }
  run(listType).code === 0 ? ok('list.<type> accepted') : bad('list.<type> falsely blocked')
  const validRe = { ...GOOD, namespaces: { 'cravin.pantry': { k: { type: 'single_line_text_field', storefront: true, validation: { regex: '^[a-z0-9-]+$' } } } } }
  run(validRe).code === 0 ? ok('an RE2-safe regex is accepted') : bad('a valid regex was falsely blocked')
  const wired = { ...GOOD, metaobject_definitions: [{ type: 'location_card', display_name_key: 'title', field_definitions: [{ key: 'title', type: 'single_line_text_field' }, { key: 'ref', type: 'metaobject_reference', metaobject_type: 'location_card' }] }] }
  run(wired).code === 0 ? ok('a self-referential metaobject ref that IS defined is accepted') : bad('a valid metaobject ref was falsely blocked')
}

console.log(failures === 0 ? '\nmetafield-schema: ALL CASES PASS' : `\nmetafield-schema: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
