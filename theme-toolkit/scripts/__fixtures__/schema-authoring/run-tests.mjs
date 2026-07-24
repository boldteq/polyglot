#!/usr/bin/env node
// Self-test for check-schema-authoring.mjs (#47) — the merchant-admin authoring enforcer.
//   (a) clean          well-authored sections → exit 0, no 'warn'-tier findings
//   (b) broken         every blocking + heuristic check fires
//   (c) invalid-json   an unparseable {% schema %} blocks (and does not crash the gate)
//   (d) base-collision a custom section named like a vendored base section
//   (e) fp-guards      the shapes an earlier draft flagged and must NOT flag
//   (f) generated      GENERATED files are not hand-authored → skipped, but scanned still counts
//   (g) scope          an unresolvable BASE_REF warn-skips with scanned:0 (never a green "pass")
//   (h) empty-scope    a RESOLVED scope covering 0 sections declares *.n-a-empty-scope for gate #45
//   (i) vendor-css     a modified stock section is not judged on the base theme's untouched CSS
//   (j) crash          an unexpected failure exits 2 with a crash blocker, never a green pass
//
// A fixture dir is not a git repo, so cases run with SCHEMA_SCAN_ALL=1 (documented fixture opt-in).
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-schema-authoring.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function run(dir, extraEnv = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-'))
  const env = { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__no_such_base__', SCHEMA_SCAN_ALL: '1', SCHEMA_BASE_FILES: '', ...extraEnv }
  const r = spawnSync('node', [GATE], { cwd: path.join(HERE, dir), env, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'schema-authoring.json'), 'utf-8')) } catch { /* gate died before writing */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  const blockers = rep?.blockers || []
  const warnings = rep?.warnings || []
  return {
    code: r.status,
    stderr: r.stderr,
    report: rep,
    blockerIds: new Set(blockers.map(b => b.id)),
    warnIds: new Set(warnings.map(w => w.id)),
    allIds: new Set([...blockers, ...warnings].map(f => f.id)),
    warnings,
  }
}
const has = (set, id, label) => (set.has(id) ? pass(label || id) : fail(`missing ${id} (saw ${[...set].join(', ') || 'none'})`))
const hasnt = (set, id, label) => (!set.has(id) ? pass(label || `no ${id}`) : fail(`false positive: ${id}`))

console.log('case (a) clean (t: keys, link_list nav, guarded image, scheme-wrapped) → expect exit 0')
{
  const { code, allIds, warnings, report } = run('clean')
  code === 0 ? pass('exit 0 (pass)') : fail(`expected 0 got ${code}; ${[...allIds].join(', ')}`)
  report?.evidence?.scanned === 2 ? pass('evidence.scanned = 2 (a real count, not a masked skip)') : fail(`scanned=${report?.evidence?.scanned}`)
  // A chrome section (site-header) legitimately has no heading trio — the check must not shout at it.
  const hard = warnings.filter(w => w.severity === 'warn')
  hard.length === 0 ? pass('no warn-tier findings on well-authored code') : fail(`warn-tier FPs: ${hard.map(w => w.id).join(', ')}`)
  const trio = warnings.find(w => w.id === 'schema.missing-title-trio')
  trio && trio.severity === 'advise' ? pass('chrome section downgrades missing-title-trio to advise') : fail(`expected an advise-tier missing-title-trio, got ${trio ? trio.severity : 'nothing'}`)
}

console.log('case (b) broken (the real cravinbyandy defect shapes) → expect exit 1')
{
  const { code, blockerIds, warnIds, allIds, report } = run('broken')
  code === 1 ? pass('exit 1 (block)') : fail(`expected 1 got ${code}`)
  report?.evidence?.scanned === 4 ? pass('evidence.scanned = 4') : fail(`scanned=${report?.evidence?.scanned}`)
  for (const id of [
    'schema.label-not-translated',   // STD-ADMIN-01
    'schema.filename-as-text',       // STD-ADMIN-02
    'schema.dev-note-in-info',       // STD-ADMIN-03
    'schema.micro-syntax',           // STD-ADMIN-04
    'schema.nav-not-linklist',       // STD-NAV-01
    'schema.image-no-empty-state',   // STD-IMG-02
    'schema.no-color-scheme',        // STD-TOKEN-05
    'schema.pii-default',            // STD-NAME-04
  ]) has(blockerIds, id, `blocker: ${id}`)
  for (const id of [
    'schema.numbered-settings',        // STD-ADMIN-07
    'schema.option-value-mismatch',    // STD-ADMIN-08
    'schema.jargon-label',             // STD-ADMIN-09
    'schema.name-content-specific',    // STD-NAME-01
    'schema.duplicate-default-heading',// STD-NAME-02
    'schema.missing-title-trio',       // STD-DYN-01
    'schema.alignment-not-dynamic',    // STD-DYN-03
  ]) has(warnIds, id, `warning: ${id}`)
  // severity is a table, not a per-call decision: a heuristic must never land in blockers[]
  ;[...warnIds].every(id => !blockerIds.has(id)) ? pass('no check id straddles both tiers') : fail('a check id emitted as both blocker and warning')
  allIds.has('schema-authoring.crash') ? fail('gate crashed') : pass('no crash')
}

console.log('case (c) invalid-json → schema.invalid-json blocks, gate survives')
{
  const { code, blockerIds } = run('invalid-json')
  has(blockerIds, 'schema.invalid-json')
  code === 1 ? pass('exit 1 (block, not a crash exit 2)') : fail(`expected 1 got ${code}`)
}

console.log('case (d) base-collision → a custom section named like the vendored base section')
{
  // The base corpus is DERIVED (sections not in scope), never a hardcoded Dawn list — SCHEMA_BASE_FILES
  // is how a non-git fixture expresses "this file is the vendored base".
  const { warnIds, report } = run('base-collision', { SCHEMA_BASE_FILES: 'sections/header.liquid' })
  has(warnIds, 'schema.name-collides-with-base')
  report?.evidence?.scanned === 1 ? pass('the declared base file is excluded from the scan') : fail(`scanned=${report?.evidence?.scanned}`)
  // ...and with no base corpus the same tree must NOT invent a collision
  const none = run('base-collision')
  hasnt(none.allIds, 'schema.name-collides-with-base', 'no collision invented when nothing is vendored')
}

console.log('case (e) fp-guards → the shapes an earlier draft flagged must NOT flag')
{
  const { blockerIds, allIds } = run('fp-guards')
  hasnt(allIds, 'schema.filename-as-text', '"Fallback heading" is copy, not an asset filename')
  hasnt(allIds, 'schema.dev-note-in-info', '"Do not upload files over 2MB." is merchant guidance, not a dev note')
  hasnt(allIds, 'schema.option-value-mismatch', '"Ticker (Poppins)" → "poppins" is a parenthetical short code')
  hasnt(allIds, 'schema.name-content-specific', '"FAQ Accordion" is a role name')
  hasnt(allIds, 'schema.pii-default', '"View Menu" on a button_label is not a person')
  hasnt(allIds, 'schema.pii-default', '"+91 0000000000" is a placeholder, not a real number')
  hasnt(allIds, 'schema.jargon-label', 'plain labels are not jargon')
  hasnt(allIds, 'schema.duplicate-default-heading', 'a shared heading_size="large" is a style default, not duplicate copy')
  blockerIds.size === 1 && blockerIds.has('schema.label-not-translated')
    ? pass('the ONLY blocker is the raw-label one this fixture deliberately ships')
    : fail(`unexpected blockers: ${[...blockerIds].join(', ')}`)
}

console.log('case (f) generated files are not hand-authored (mirrors #8/#3)')
{
  const { code, allIds, report } = run('generated')
  code === 0 ? pass('exit 0 — the generated section is skipped') : fail(`expected 0 got ${code}; ${[...allIds].join(', ')}`)
  report?.evidence?.scanned === 1 ? pass('scanned = 1 (the generated file is excluded, the hand-authored one is not)') : fail(`scanned=${report?.evidence?.scanned}`)
}

console.log('case (g) unresolvable base ref → warn-skip with scanned:0, never a silent green pass')
{
  const { code, warnIds, report } = run('clean', { SCHEMA_SCAN_ALL: '' })
  has(warnIds, 'schema.scope-unresolved')
  code === 0 ? pass('exit 0 (skip, dev grade)') : fail(`expected 0 got ${code}`)
  report?.evidence?.scanned === 0 && report?.evidence?.scope === 'unresolved'
    ? pass('scanned:0 + scope:unresolved — gate #45 can see this is a skip, not a pass')
    : fail(`evidence did not declare the skip: ${JSON.stringify(report?.evidence)}`)
}

console.log('case (h) a resolved-but-empty scope declares itself instead of passing green on nothing')
{
  // A CSS-only or template-only sprint changes no sections. pass:true + scanned:0 with no marker is
  // what gate #45 blocks as integrity.vacuous-pass, so the gate must say "examined nothing" out loud.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-empty-'))
  const git = (...a) => spawnSync('git', a, { cwd: d, stdio: ['ignore', 'ignore', 'ignore'] })
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })
  fs.cpSync(path.join(HERE, 'clean', 'sections'), path.join(d, 'sections'), { recursive: true })
  git('init', '-q', '.')
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'base')
  git('tag', 'base')
  fs.writeFileSync(path.join(d, 'README.md'), 'docs only\n')
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'docs')
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-'))
  const env = { ...process.env, REPORT_DIR: reportDir, BASE_REF: 'base' }
  delete env.SCHEMA_SCAN_ALL
  delete env.SCHEMA_BASE_FILES
  const r = spawnSync('node', [GATE], { cwd: d, env, encoding: 'utf-8' })
  const rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'schema-authoring.json'), 'utf-8'))
  const warnIds = new Set(rep.warnings.map(w => w.id))
  r.status === 0 ? pass('exit 0 — an empty scope is not a defect, it is an absence of signal') : fail(`expected 0 got ${r.status}`)
  rep.evidence.scope === 'git' ? pass('the scope RESOLVED (this is not the unresolvable-base path)') : fail(`scope=${rep.evidence.scope}`)
  has(warnIds, 'schema.n-a-empty-scope', 'warn: schema.n-a-empty-scope — "examined nothing" is stated, not implied')
  fs.rmSync(reportDir, { recursive: true, force: true })
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('case (i) a modified STOCK section is not blamed for the theme base\'s own CSS')
{
  // sections/image-banner.liquid gets edited; assets/section-image-banner.css is untouched vendored
  // Dawn and carries text-align. Reading it would put a finding on a file the build never opened.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-vendorcss-'))
  const git = (...a) => spawnSync('git', a, { cwd: d, stdio: ['ignore', 'ignore', 'ignore'] })
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })
  fs.mkdirSync(path.join(d, 'assets'), { recursive: true })
  const liquid = (heading) => `<div class="banner color-{{ section.settings.color_scheme }}">${heading}</div>\n{% schema %}\n${JSON.stringify({ name: 't:sections.image-banner.name', settings: [{ type: 'text', id: 'heading', label: 't:x' }, { type: 'text', id: 'description', label: 't:y' }, { type: 'color_scheme', id: 'color_scheme', default: 'scheme-1', label: 't:z' }] }, null, 2)}\n{% endschema %}\n`
  fs.writeFileSync(path.join(d, 'sections', 'image-banner.liquid'), liquid('{{ section.settings.heading }}'))
  fs.writeFileSync(path.join(d, 'assets', 'section-image-banner.css'), '.banner__box { text-align: center; }\n')
  git('init', '-q', '.')
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'import dawn')
  git('tag', 'base')
  fs.writeFileSync(path.join(d, 'sections', 'image-banner.liquid'), liquid('{{ section.settings.heading }}<p>{{ section.settings.description }}</p>'))
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'tweak the banner')
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-'))
  const env = { ...process.env, REPORT_DIR: reportDir, BASE_REF: 'base' }
  delete env.SCHEMA_SCAN_ALL
  delete env.SCHEMA_BASE_FILES
  spawnSync('node', [GATE], { cwd: d, env, encoding: 'utf-8' })
  const rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'schema-authoring.json'), 'utf-8'))
  const ids = new Set([...rep.blockers, ...rep.warnings].map(f => f.id))
  rep.evidence.scanned === 1 ? pass('the modified stock section IS in scope') : fail(`scanned=${rep.evidence.scanned}`)
  hasnt(ids, 'schema.alignment-not-dynamic', 'vendored assets/section-image-banner.css is not read against the build')

  // ...and the same CSS DOES count once the build owns it
  fs.appendFileSync(path.join(d, 'assets', 'section-image-banner.css'), '.banner__text { text-align: left; }\n')
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'restyle the banner')
  spawnSync('node', [GATE], { cwd: d, env, encoding: 'utf-8' })
  const rep2 = JSON.parse(fs.readFileSync(path.join(reportDir, 'schema-authoring.json'), 'utf-8'))
  const ids2 = new Set([...rep2.blockers, ...rep2.warnings].map(f => f.id))
  has(ids2, 'schema.alignment-not-dynamic', 'the same CSS counts once this build has modified it')
  fs.rmSync(reportDir, { recursive: true, force: true })
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('case (j) an unexpected failure exits 2 with a crash report, never a green pass')
{
  // `sections` present as a FILE where a directory is expected — readdirSync throws ENOTDIR.
  const { code, allIds } = run('crash')
  code === 2 ? pass('exit 2 (env error)') : fail(`expected 2 got ${code}`)
  has(allIds, 'schema-authoring.crash', 'blocker: schema-authoring.crash')
}

// ── STD-DYN-02 conditional render (2026-07-23) ───────────────────────────────────────────────
// "Abhi koi bhi section properly conditionally render nahi ho raha hai." An unguarded text output
// leaves an empty element holding its spacing the moment a merchant clears the field, which teaches
// them not to touch it — a setting nobody dares clear is not really editable. The `clean` fixture
// itself was violating this when the check landed, which is why it needs its own case.
console.log('case (k) STD-DYN-02 — unguarded text output is flagged, guarded output is not')
{
  const { warnIds } = run('broken')
  has(warnIds, 'schema.unconditional-render', 'unguarded {{ settings.x }} → schema.unconditional-render')
}
{
  const { warnIds } = run('clean')
  hasnt(warnIds, 'schema.unconditional-render', 'a {% if x != blank %} guard clears the check')
}
{
  // All four guard forms in one section: {% if %}, {% unless %}, a `default:` filter (which
  // substitutes rather than emitting an empty element), and non-text settings (image/url), which
  // render inside markup that needs no guard.
  const { warnIds, code } = run('dyn02-guards')
  hasnt(warnIds, 'schema.unconditional-render', 'if / unless / default: / non-text settings all count as guarded')
  code === 0 ? pass('dyn02-guards is otherwise clean (exit 0)') : fail(`dyn02-guards should pass, got ${code}`)
}

// ── S2 admin-panel structure (2026-07-23) ────────────────────────────────────────────────────────
// The "admin panel options not properly structured" complaint, grounded in shopify.dev. Each new id is
// exercised by a broken shape here AND proven silent on the correct shape below — a false BLOCK on a
// well-structured schema is as damaging as a missed one.
console.log('case (l) S2 admin-panel structure — every new check fires on the broken shape')
{
  const { code, blockerIds, warnIds, allIds, report } = run('admin-structure')
  code === 1 ? pass('exit 1 (visible_if-invalid blocks)') : fail(`expected 1 got ${code}`)
  report?.evidence?.scanned === 5 ? pass('evidence.scanned = 5') : fail(`scanned=${report?.evidence?.scanned}`)
  has(blockerIds, 'schema.visible_if-invalid', 'blocker: schema.visible_if-invalid (undeclared setting id)')
  has(blockerIds, 'schema.duplicate-setting-id', 'blocker: schema.duplicate-setting-id (Shopify validate_theme MISSES this — coverage.md 7/9)')
  for (const id of [
    'schema.no-conditional-settings',  // a gating checkbox + dependents, no visible_if
    'schema.blocks-no-limit',          // typed blocks, no max_blocks / limit
    'schema.preset-missing',           // configurable non-chrome section, no preset
    'schema.enabled-on-misuse',        // both enabled_on + disabled_on
  ]) has(warnIds, id, `warning: ${id}`)
  ;[...warnIds].every(id => !blockerIds.has(id)) ? pass('no S2 check id straddles both tiers') : fail('an S2 id emitted as both blocker and warning')
  allIds.has('schema-authoring.crash') ? fail('gate crashed') : pass('no crash')
}

console.log('case (m) S2 admin-panel structure — the correct pattern of each does NOT fire')
{
  const { code, allIds, report } = run('admin-structure-clean')
  code === 0 ? pass('exit 0 (no blockers on the well-structured admin panel)') : fail(`expected 0 got ${code}; ${[...allIds].join(', ')}`)
  report?.evidence?.scanned === 5 ? pass('evidence.scanned = 5') : fail(`scanned=${report?.evidence?.scanned}`)
  hasnt(allIds, 'schema.visible_if-invalid', 'a valid section.settings.show_button reference does not block')
  hasnt(allIds, 'schema.no-conditional-settings', 'dependents that carry visible_if clear the check')
  hasnt(allIds, 'schema.blocks-no-limit', 'a section-level max_blocks bounds the layout')
  hasnt(allIds, 'schema.preset-missing', 'a preset present (and a group-only footer is exempt) clears the check')
  hasnt(allIds, 'schema.enabled-on-misuse', 'a single, well-formed enabled_on is not a misuse')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
