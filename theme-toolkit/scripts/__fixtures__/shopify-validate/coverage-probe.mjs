#!/usr/bin/env node
// coverage-probe — characterize what Shopify's OWN validator (validate_theme) actually catches, by class.
//
// WHY: gate #49 trusts `validate_theme` to grade our Liquid. A single-file probe once passed
// `{{ x | bogus_filter }}` as VALID, so its real catch-rate was unknown. This runs one ISOLATED
// violation per minimal whole-theme and records catch/miss into coverage.md — so the gate's coverage
// boundary is measured, not assumed. Any class Shopify misses stays owned by a native gate.
//
// LIVE: needs @shopify/dev-mcp (network on first run, then cached). NOT part of the hermetic suite.
// Run: node scripts/__fixtures__/shopify-validate/coverage-probe.mjs   [--keep]

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateTheme } from '../../lib/shopify-mcp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// A minimal but VALID theme skeleton every case is dropped into, so snippet/asset/object resolution
// happens against a real theme on disk (the exact context validate_theme resolves against).
const BASE = {
  'layout/theme.liquid': '<!doctype html><html lang="en"><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>',
  'config/settings_schema.json': '[{"name":"theme_info","theme_name":"Probe","theme_version":"1.0.0","theme_author":"Boldteq","theme_documentation_url":"https://example.com","theme_support_url":"https://example.com"}]',
  'locales/en.default.json': '{"general":{"x":"x"}}',
  'snippets/real.liquid': '<span>{{ text }}</span>',
}

const section = (body, schema) => `${body}\n{% schema %}\n${schema}\n{% endschema %}\n`
const GOOD_SCHEMA = '{"name":"S","tag":"section","settings":[{"type":"text","id":"heading","label":"Heading"}]}'

// One isolated violation per case. expect: 'catch' = we WANT the validator to flag it.
const CASES = [
  { name: 'clean-control', expect: 'ok',
    file: 'sections/s.liquid', content: section('<div>{{ section.settings.heading }}</div>', GOOD_SCHEMA) },
  { name: 'unknown-filter', expect: 'catch',
    file: 'sections/s.liquid', content: section('<div>{{ section.settings.heading | totally_fake_filter }}</div>', GOOD_SCHEMA) },
  { name: 'missing-snippet', expect: 'catch',
    file: 'sections/s.liquid', content: section("<div>{% render 'no-such-snippet-xyz' %}</div>", GOOD_SCHEMA) },
  { name: 'deprecated-img_url', expect: 'catch',
    file: 'sections/s.liquid', content: section("<div>{{ product.featured_image | img_url: '300x' }}</div>", GOOD_SCHEMA) },
  { name: 'invalid-schema-json', expect: 'catch',
    file: 'sections/s.liquid', content: section('<div>x</div>', '{ "name": "S", "settings": [ { bad json, } ] }') },
  { name: 'unknown-schema-setting-type', expect: 'catch',
    file: 'sections/s.liquid', content: section('<div>x</div>', '{"name":"S","tag":"section","settings":[{"type":"not_a_real_type","id":"h","label":"H"}]}') },
  { name: 'duplicate-setting-id', expect: 'catch',
    file: 'sections/s.liquid', content: section('<div>x</div>', '{"name":"S","tag":"section","settings":[{"type":"text","id":"dup","label":"A"},{"type":"text","id":"dup","label":"B"}]}') },
  { name: 'unclosed-tag', expect: 'catch',
    file: 'sections/s.liquid', content: section('<div>{% if section.settings.heading %}no endif</div>', GOOD_SCHEMA) },
  { name: 'undefined-object', expect: 'catch',
    file: 'sections/s.liquid', content: section('<div>{{ nonexistent_global_thing.foo }}</div>', GOOD_SCHEMA) },
  { name: 'bad-render-arg-missing-comma', expect: 'catch',
    file: 'sections/s.liquid', content: section("<div>{% render 'real' text 'hi' %}</div>", GOOD_SCHEMA) },
]

function writeTheme(dir, extra) {
  for (const [rel, content] of Object.entries({ ...BASE, ...extra })) {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
}

async function main() {
  const keep = process.argv.includes('--keep')
  const results = []
  for (const c of CASES) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-cov-'))
    writeTheme(dir, { [c.file]: c.content })
    process.stderr.write(`  ${c.name.padEnd(30)} … `)
    let r
    try { r = await validateTheme(dir, [{ path: c.file, content: c.content }], { timeoutMs: 120000 }) }
    catch (e) { r = { unavailable: true, reason: e.message } }
    if (!keep) fs.rmSync(dir, { recursive: true, force: true })

    if (r.unavailable) { results.push({ ...c, status: 'UNAVAILABLE', reason: r.reason, findings: [] }); process.stderr.write(`UNAVAILABLE (${(r.reason || '').slice(0, 60)})\n`); continue }
    const errs = (r.findings || []).filter((f) => f.severity === 'error')
    const warns = (r.findings || []).filter((f) => f.severity === 'warning')
    const flagged = (r.findings || []).length > 0
    const caught = c.expect === 'catch' ? flagged : !flagged
    results.push({ ...c, status: caught ? 'AS-EXPECTED' : (c.expect === 'catch' ? 'MISS' : 'FALSE-FLAG'), errs, warns, findings: r.findings || [] })
    process.stderr.write(`${caught ? 'OK' : (c.expect === 'catch' ? 'MISS' : 'FALSE-FLAG')}  (${errs.length}E/${warns.length}W)\n`)
  }

  // Write coverage.md
  const anyUnavailable = results.some((r) => r.status === 'UNAVAILABLE')
  const catchCases = results.filter((r) => r.expect === 'catch' && r.status !== 'UNAVAILABLE')
  const caught = catchCases.filter((r) => r.status === 'AS-EXPECTED')
  const rows = results.map((r) => {
    const detail = r.status === 'UNAVAILABLE' ? (r.reason || '').slice(0, 80)
      : (r.findings.map((f) => `${f.severity}: ${f.message}`).join(' · ').slice(0, 120) || '—')
    return `| \`${r.name}\` | ${r.expect} | ${r.status} | ${detail} |`
  })
  const md = [
    '# Shopify `validate_theme` — measured coverage matrix',
    '',
    '> Generated by `coverage-probe.mjs`. One ISOLATED violation per minimal whole-theme, judged by',
    "> Shopify's own `@shopify/dev-mcp` validator. This is what gate #49 can and cannot rely on.",
    '',
    anyUnavailable ? '**⚠ Validator was UNAVAILABLE for some/all cases — matrix incomplete. Re-run online.**\n' : '',
    `**Catch-rate on known violations: ${caught.length}/${catchCases.length}**`,
    caught.length < catchCases.length
      ? `\n**MISSED classes (must stay owned by a native gate):** ${catchCases.filter((r) => r.status === 'MISS').map((r) => '`' + r.name + '`').join(', ') || 'none'}`
      : '\nEvery probed violation class is caught by Shopify.',
    '',
    '| Class | Expect | Result | Validator said |',
    '|---|---|---|---|',
    ...rows,
    '',
    '## Boundary for gate #49',
    'A `MISS` above means Shopify\'s validator does NOT flag that class — do not assume #49 covers it;',
    'the named native gate (theme-check #2 / schema-authoring #47 / editability #3) remains the owner.',
    '',
    `_Probed ${CASES.length} classes._`,
  ].filter((l) => l !== '').join('\n')
  fs.writeFileSync(path.join(HERE, 'coverage.md'), md + '\n')
  console.log(`\ncoverage.md written · catch-rate ${caught.length}/${catchCases.length}${anyUnavailable ? ' · INCOMPLETE (validator unavailable)' : ''}`)
  process.exit(anyUnavailable ? 2 : 0)
}

main()
