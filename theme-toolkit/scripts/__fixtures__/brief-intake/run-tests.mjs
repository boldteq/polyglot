#!/usr/bin/env node
// Self-test for brief-intake.mjs (A1/A3/A4 upfront project brief).
//   parseBrief / missingFields / renderBrief round-trip + the --check CLI exits.
// Run (Node 20): node scripts/__fixtures__/brief-intake/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseBrief, missingFields, renderBrief, QUESTIONS } from '../../brief-intake.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.resolve(HERE, '..', '..', 'brief-intake.mjs')
let f = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); f += 1 }

const COMPLETE = `# Project Brief — acme
niche: supplements
brand_direction: premium-minimal
primary_goal: maximize-aov
content_source: real-assets

## references
- Ritual
- AG1

## must_have_pages
- home
- product
- cart

## constraints
- theme_base: dawn
`

console.log('parseBrief — scalars + list blocks')
{
  const p = parseBrief(COMPLETE)
  p.niche === 'supplements' ? pass('niche scalar') : fail(`niche=${p.niche}`)
  p.content_source === 'real-assets' ? pass('content_source scalar') : fail(`content_source=${p.content_source}`)
  JSON.stringify(p.references) === JSON.stringify(['Ritual', 'AG1']) ? pass('references list') : fail(`references=${JSON.stringify(p.references)}`)
  JSON.stringify(p.must_have_pages) === JSON.stringify(['home', 'product', 'cart']) ? pass('must_have_pages list') : fail(`got ${JSON.stringify(p.must_have_pages)}`)
}

console.log('missingFields — required completeness')
{
  missingFields(parseBrief(COMPLETE)).length === 0 ? pass('complete → no missing') : fail('complete brief flagged missing')
  const partial = parseBrief('niche: TBD\nbrand_direction: bold-playful\n')
  const miss = missingFields(partial)
  miss.includes('niche') ? pass('niche:TBD counts as missing') : fail(`niche not flagged (${miss})`)
  miss.includes('primary_goal') && miss.includes('content_source') ? pass('absent required flagged') : fail(`missing set wrong: ${miss}`)
  !miss.includes('brand_direction') ? pass('a filled scalar is not flagged') : fail('brand_direction wrongly flagged')
  const empty = missingFields(parseBrief(''))
  empty.length === 4 ? pass('empty brief → all 4 required missing') : fail(`empty missing=${JSON.stringify(empty)}`)
}

console.log('renderBrief — round-trips through parseBrief')
{
  const md = renderBrief({ niche: 'beauty', brand_direction: 'editorial-luxe', primary_goal: 'build-trust', content_source: 'mixed', references: ['Glossier'], must_have_pages: ['home', 'product'] }, 'lumi')
  const p = parseBrief(md)
  missingFields(p).length === 0 ? pass('rendered brief is complete') : fail(`rendered brief missing ${missingFields(p)}`)
  p.niche === 'beauty' && p.references[0] === 'Glossier' ? pass('values survive render→parse') : fail(`round-trip lost values: ${JSON.stringify(p)}`)
}

console.log('QUESTIONS — recommended-first popup set')
{
  QUESTIONS.filter(q => q.required).length === 4 ? pass('4 required questions') : fail(`required count = ${QUESTIONS.filter(q => q.required).length}`)
  QUESTIONS.every(q => q.field && q.question && q.header) ? pass('every question maps to a brief field + has a header') : fail('a question is malformed')
}

console.log('CLI --check — exit codes')
{
  const runIn = (setup) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-'))
    setup(dir)
    const r = spawnSync('node', [SCRIPT, '--check'], { cwd: dir, encoding: 'utf-8' })
    fs.rmSync(dir, { recursive: true, force: true })
    return r.status
  }
  runIn(() => {}) === 1 ? pass('no docs/brief.md → exit 1') : fail('missing brief did not exit 1')
  runIn((d) => { fs.mkdirSync(path.join(d, 'docs')); fs.writeFileSync(path.join(d, 'docs', 'brief.md'), COMPLETE) }) === 0 ? pass('complete brief → exit 0') : fail('complete brief did not exit 0')
  runIn((d) => { fs.mkdirSync(path.join(d, 'docs')); fs.writeFileSync(path.join(d, 'docs', 'brief.md'), 'niche: pet\n') }) === 1 ? pass('incomplete brief → exit 1') : fail('incomplete brief did not exit 1')
}

console.log(f === 0 ? '\nALL CASES PASS' : `\n${f} ASSERTION(S) FAILED`)
process.exit(f ? 1 : 0)
