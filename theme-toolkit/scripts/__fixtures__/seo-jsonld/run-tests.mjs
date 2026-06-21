#!/usr/bin/env node
// Self-test for #29 — schemaGapsFor (recommended JSON-LD per page-type in gate-seo).
// Run (Node 20): node scripts/__fixtures__/seo-jsonld/run-tests.mjs · Exit 0 = all pass.

import { schemaGapsFor } from '../../gate-seo.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('schemaGapsFor — per page-type structured data')
eq(schemaGapsFor('article', ['BlogPosting']), [], 'article with BlogPosting → no gap')
eq(schemaGapsFor('article', ['Article']), [], 'article with Article → no gap')
eq(schemaGapsFor('article', ['WebPage']), ['Article/BlogPosting'], 'article without Article → gap')
eq(schemaGapsFor('pdp', ['Product']), ['BreadcrumbList'], 'pdp without BreadcrumbList → gap')
eq(schemaGapsFor('pdp', ['Product', 'BreadcrumbList']), [], 'pdp with BreadcrumbList → no gap')
eq(schemaGapsFor('collection', []), ['BreadcrumbList'], 'collection without BreadcrumbList → gap')
eq(schemaGapsFor('home', []), [], 'home has no per-type breadcrumb/article requirement here')
eq(schemaGapsFor('article', null), ['Article/BlogPosting'], 'null types → gap (no throw)')

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
