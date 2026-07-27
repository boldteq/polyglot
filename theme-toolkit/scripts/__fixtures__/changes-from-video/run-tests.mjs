// Hermetic fixture for changes-from-video. Tests the PURE pipeline logic — no ffmpeg/whisper/claude, no
// network. The integration steps (transcription, multimodal extraction, self-verify) are exercised only in
// a real end-to-end run; here we prove the deterministic core: windowing, dedup, confidence bucketing,
// owner routing + escalation, whisper-JSON parsing, and that the serialized CHANGES.md is SCHEMA-valid with
// ambiguous asks kept OUT of the checklist.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { windowTranscript, mergeDuplicates, bucketByConfidence, serializeChangesMd, serializeReviewHtml } from '../../changes-from-video.mjs'
import { routeOwner, inferOwner, escalateReason } from '../../lib/change-router.mjs'
import { parseWhisperJson } from '../../lib/transcribe.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))
const truthy = (v, m) => (v ? ok(m) : bad(m))

console.log('case (a) windowTranscript — groups segments into ~windowSec windows')
{
  const segs = [
    { start: 0, end: 3, text: 'move the hero up' },
    { start: 5, end: 8, text: 'and make it bigger' },
    { start: 80, end: 84, text: 'change the footer color' },
  ]
  const w = windowTranscript(segs, { windowSec: 75 })
  eq(w.length, 2, 'two windows (0–8s, 80–84s)')
  eq(w[0].text, 'move the hero up and make it bigger', 'window 0 concatenates its segments')
  eq(windowTranscript([]), [], 'no segments → no windows')
}

console.log('case (b) mergeDuplicates — same surface+ask collapses, earliest timestamp kept')
{
  const merged = mergeDuplicates([
    { surface: 'home', change: 'make the hero bigger', timestamp: 12, confidence: 0.7, quote: 'bigger hero' },
    { surface: 'home', change: 'make the hero bigger please', timestamp: 5, confidence: 0.9, quote: 'much bigger' },
    { surface: 'product', change: 'add a size chart', timestamp: 40, confidence: 0.8 },
  ])
  eq(merged.length, 2, 'two hero-asks merge, size-chart stays separate')
  const hero = merged.find((m) => m.surface === 'home')
  eq(hero.timestamp, 5, 'earliest timestamp becomes primary')
  eq(hero.confidence, 0.9, 'max confidence kept')
  truthy(hero.quotes.length === 2, 'both quotes accumulated')
}

console.log('case (c) bucketByConfidence — ambiguous/low-conf → needsClarification, never the checklist')
{
  const { accepted, needsClarification } = bucketByConfidence([
    { change: 'change the button text to Shop Now', confidence: 0.9 },
    { change: 'do something with this bit', confidence: 0.3 },
    { change: 'maybe move it?', confidence: 0.8, ambiguity: 'unclear which section' },
  ])
  eq(accepted.map((i) => i.change), ['change the button text to Shop Now'], 'only the confident, unambiguous ask is accepted')
  eq(needsClarification.length, 2, 'low-confidence AND ambiguous both quarantined')
}

console.log('case (d) routeOwner — nature→owner, escalation wins, unknown→atrium')
{
  eq(routeOwner('rewrite the hero headline copy').owner, 'ink', 'copy → ink')
  eq(routeOwner('change the brand color to navy').owner, 'drape', 'visual design → drape')
  eq(routeOwner('add a testimonials section').owner, 'loom', 'section/build → loom')
  eq(routeOwner('upload these new product photos').owner, 'porter', 'store data/images → porter')
  eq(routeOwner('integrate Klaviyo email capture').owner, 'conduit', 'app/integration → conduit')
  eq(routeOwner('add a meta description for SEO').owner, 'beacon', 'SEO → beacon')
  const esc = routeOwner('change the refund policy to 30 days')
  truthy(esc.owner === 'human' && esc.escalate, 'legal/policy → human (escalate)')
  truthy(routeOwner('drop the price to $19').escalate, 'pricing → escalate')
  truthy(!!escalateReason('add a clinical efficacy claim'), 'claims trigger escalation')
  eq(routeOwner('do the thing we discussed').owner, 'atrium', 'unknown nature → atrium (triage)')
  eq(routeOwner('make the hero bigger', 'loom').owner, 'loom', 'valid model proposal is kept')
  eq(routeOwner('make the hero bigger', 'nonsense').owner, inferOwner('make the hero bigger'), 'invalid proposal → inferred')
}

console.log('case (e) parseWhisperJson — whisper.cpp offsets(ms)→seconds, empty text dropped')
{
  const j = { transcription: [
    { offsets: { from: 0, to: 3200 }, text: ' Move the hero up.' },
    { offsets: { from: 3200, to: 3300 }, text: '   ' },
    { offsets: { from: 3300, to: 7000 }, text: 'Make it bigger.' },
  ] }
  const segs = parseWhisperJson(j)
  eq(segs.length, 2, 'blank segment dropped')
  eq(segs[0], { start: 0, end: 3.2, text: 'Move the hero up.' }, 'ms→s, text trimmed')
}

console.log('case (f) serializeChangesMd — ambiguous asks stay OUT of the ## Items block')
{
  const md = serializeChangesMd({
    client: 'Acme', project: 'acme-refresh', requestedAt: '2026-07-27', video: 'walkthrough.mp4',
    accepted: [{ change: 'MAKE_HERO_BIGGER', owner: 'drape', acceptance: 'hero is full-width', timestamp: 12, quote: 'bigger hero', confidence: 0.9 }],
    needsClarification: [{ change: 'AMBIGUOUS_ASK', timestamp: 40, quote: 'do that thing', ambiguity: 'unclear' }],
  })
  const itemsBlock = md.slice(md.indexOf('## Items'), md.indexOf('## Needs Clarification'))
  truthy(itemsBlock.includes('MAKE_HERO_BIGGER'), 'accepted item is in the checklist')
  truthy(!itemsBlock.includes('AMBIGUOUS_ASK'), 'ambiguous ask is NOT in the checklist')
  truthy(md.includes('## Needs Clarification') && md.includes('AMBIGUOUS_ASK'), 'ambiguous ask is in Needs Clarification')
  truthy(md.includes('assignee: drape') && md.includes('acceptance:'), 'assignee + acceptance sub-lines present')
  truthy(md.startsWith('---\nclient: Acme'), 'STRICT front-matter present')
}

console.log('case (g) serializeReviewHtml — self-contained, carries change + quote + owner')
{
  const html = serializeReviewHtml({ client: 'Acme', project: 'p', video: 'v.mp4', requestedAt: '2026-07-27', accepted: [{ change: 'MAKE_HERO_BIGGER', owner: 'drape', timestamp: 12, quote: 'bigger', confidence: 0.9 }], needsClarification: [] })
  truthy(html.startsWith('<!doctype html>') && html.includes('MAKE_HERO_BIGGER') && html.includes('drape'), 'renders the item')
}

console.log('case (h) end-to-end — serialized CHANGES.md is SCHEMA-valid (exit 1 unchecked, never 2)')
{
  const HERE = path.dirname(fileURLToPath(import.meta.url))
  const validator = path.resolve(HERE, '../../../../scripts/check-changes-list.mjs')
  if (!fs.existsSync(validator)) { ok('validator not present in this layout — skipped (integration-only)') }
  else {
    const md = serializeChangesMd({
      client: 'Acme', project: 'acme-refresh', requestedAt: '2026-07-27', video: 'walkthrough.mp4',
      accepted: [
        { change: 'Make the hero full-width', owner: 'drape', acceptance: 'sections/hero.liquid renders edge-to-edge', timestamp: 12, quote: 'full width hero', confidence: 0.9 },
        { change: 'Add a size chart to the PDP', owner: 'loom', acceptance: 'product template shows a size-chart block', timestamp: 40, quote: 'size chart', confidence: 0.85 },
      ],
      needsClarification: [{ change: 'do that thing', timestamp: 60, quote: 'that', ambiguity: 'unclear' }],
    })
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfv-'))
    const f = path.join(dir, 'CHANGES.md')
    fs.writeFileSync(f, md)
    const r = spawnSync('node', [validator, f], { encoding: 'utf-8' })
    fs.rmSync(dir, { recursive: true, force: true })
    truthy(r.status !== 2, `NOT a schema error (exit ${r.status}, want != 2)`)
    truthy(r.status === 1, 'exit 1 = unchecked at intake (by design)')
    truthy(/STRICT mode/.test(r.stdout || ''), 'validated in STRICT mode (front-matter recognized)')
  }
}

console.log(failures ? `\nchanges-from-video: ${failures} FAILED` : '\nchanges-from-video: ALL CASES PASS')
process.exit(failures ? 1 : 0)
