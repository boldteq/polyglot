#!/usr/bin/env node
// changes-from-video — turn a client's 3–5 min explainer video (screen-recording + voice) into a
// high-accuracy, correctly-routed CHANGES.md for the Shopify Website Team.
//
// WHY HIGH-ACCURACY (not transcript-only): "make THIS bigger / move THAT up" is unresolvable from words
// alone. Accuracy comes from (1) MULTIMODAL — timestamped transcript + the video frame at that second, so
// Claude resolves deixis against what's on screen; (2) a verbatim quote + timestamp on every item;
// (3) confidence + ambiguity → a "Needs Clarification" bucket, never an invented acceptance;
// (4) an adversarial self-verify pass (did the client actually ask this? is the acceptance invented?);
// (5) dedup of the repetition a 5-min video contains; (6) deterministic owner routing (+ human escalation
// for legal/price/claims). Items are PROPOSED until Atrium/client confirms.
//
// Local + subscription-only: ffmpeg + whisper.cpp transcribe ON-MACHINE (no API key; client footage never
// leaves the computer); extraction/verify reuse the headless `claude -p` vision contract (lib/vision-read).
//
// Usage: node toolkit/scripts/changes-from-video.mjs --video <file> --client "<name>" --project <slug>
//          [--preview-url <live store URL>]   (--out <dir> default docs/design/changes-intake/<slug>)
// Exit:  0 ok · 2 preflight/deps error. (The generated CHANGES.md is PROPOSED — confirm before publish.)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { visionRead, claudeAvailable } from './lib/vision-read.mjs'
import { llmJudge } from './lib/llm-judge.mjs'
import { binaryStatus, missingDeps, extractAudio, extractFrameAt, transcribeAudio } from './lib/transcribe.mjs'
import { routeOwner } from './lib/change-router.mjs'
import { resolveSurface } from './reference-ingest.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const cwd = process.cwd()

// ── PURE helpers (exported for the hermetic fixture) ─────────────────────────

// group timestamped segments into ~windowSec windows → [{ t0, t1, text, segments }]
export function windowTranscript(segments, { windowSec = 75 } = {}) {
  const wins = []
  let cur = null
  for (const seg of segments || []) {
    if (!cur || seg.start >= cur.t0 + windowSec) {
      if (cur) wins.push(cur)
      cur = { t0: seg.start, t1: seg.end, text: '', segments: [] }
    }
    cur.t1 = seg.end
    cur.text += (cur.text ? ' ' : '') + seg.text
    cur.segments.push(seg)
  }
  if (cur) wins.push(cur)
  return wins
}

// deterministic dedup: same surface + the change's first-6 CONTENT words (filler stripped) → one item (a
// 5-min video repeats asks, differing only by "please"/"the"/etc.). Keeps the EARLIEST timestamp as
// primary, accumulates every quote/timestamp, max confidence. (Semantic near-dups are the Claude pass's job.)
const DEDUP_STOP = new Set(['the', 'a', 'an', 'and', 'please', 'to', 'of', 'just', 'like', 'so'])
const dedupKey = (it) =>
  `${String(it.surface || '').toLowerCase()}::${String(it.change || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((w) => w && !DEDUP_STOP.has(w)).slice(0, 6).join(' ')}`

export function mergeDuplicates(items) {
  const byKey = new Map()
  for (const it of items || []) {
    const k = dedupKey(it)
    const ex = byKey.get(k)
    if (!ex) {
      byKey.set(k, { ...it, quotes: it.quote ? [it.quote] : [], timestamps: it.timestamp != null ? [it.timestamp] : [] })
    } else {
      if (it.timestamp != null) { ex.timestamps.push(it.timestamp); if (ex.timestamp == null || it.timestamp < ex.timestamp) ex.timestamp = it.timestamp }
      if (it.quote) ex.quotes.push(it.quote)
      ex.confidence = Math.max(ex.confidence ?? 0, it.confidence ?? 0)
      if (it.acceptance && (!ex.acceptance || String(it.acceptance).length > String(ex.acceptance).length)) ex.acceptance = it.acceptance
      if (it.ambiguity && !ex.ambiguity) ex.ambiguity = it.ambiguity
    }
  }
  return [...byKey.values()]
}

// split by confidence/ambiguity: ambiguous or below-threshold → needsClarification (NEVER invent a
// checklist item). Escalate items (owner=human) are REAL asks → they stay accepted with assignee human.
export function bucketByConfidence(items, { min = 0.55 } = {}) {
  const accepted = []
  const needsClarification = []
  for (const it of items || []) {
    const conf = typeof it.confidence === 'number' ? it.confidence : 0
    if (it.ambiguity || conf < min || !it.change) needsClarification.push(it)
    else accepted.push(it)
  }
  return { accepted, needsClarification }
}

const mmss = (t) => (t == null ? '' : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`)
const q = (s) => String(s || '').replace(/"/g, "'").replace(/\s+/g, ' ').trim().slice(0, 160)

// STRICT-form CHANGES.md (front-matter + `## Items` + `## Needs Clarification` + `## Waivers`). At intake
// every item is `- [ ]` with empty evidence → check-changes-list exits 1 (unchecked, BY DESIGN), never 2.
export function serializeChangesMd({ client, project, requestedAt, requestedBy = '', video = '', accepted = [], needsClarification = [] }) {
  const L = []
  L.push('---')
  L.push(`client: ${client || '(unknown)'}`)
  L.push(`project: ${project || 'changes'}`)
  L.push(`requestedAt: ${requestedAt}`)
  L.push(`requestedBy: ${requestedBy || client || '(client via video)'}`)
  L.push('status: in-progress')
  L.push('---')
  L.push('')
  L.push(`# Changes Request — ${project || 'changes'} (from client video)`)
  L.push('')
  L.push('## Items')
  L.push('')
  accepted.forEach((it, i) => {
    L.push(`- [ ] ${i + 1}. ${String(it.change).trim()}`)
    L.push(`      - assignee: ${it.owner || 'atrium'}`)
    L.push(`      - acceptance: ${it.acceptance || 'confirm the requested change is applied and renders correctly on the target surface'}`)
    L.push(`      - source: video @ ${mmss(it.timestamp)}${it.quote ? ` — "${q(it.quote)}"` : ''}`)
    if (it.escalate) L.push(`      - note: ESCALATE — ${it.escalateReason || 'needs a human decision (legal / pricing / claim)'}`)
  })
  if (!accepted.length) L.push('_(no high-confidence items — see Needs Clarification below; re-record or clarify with the client)_')
  L.push('')
  L.push('## Needs Clarification')
  L.push('')
  if (needsClarification.length) {
    for (const it of needsClarification) {
      L.push(`- ${String(it.change || '(unclear ask)').trim()} — _video @ ${mmss(it.timestamp)}${it.quote ? `, "${q(it.quote)}"` : ''}_ — ${it.ambiguity || 'low confidence — confirm with client'}`)
    }
  } else {
    L.push('_None._')
  }
  L.push('')
  L.push('## Waivers')
  L.push('')
  L.push('_None._')
  L.push('')
  L.push('## Notes')
  L.push('')
  L.push(`Auto-extracted from \`${video || 'client video'}\` on ${requestedAt}. Items are PROPOSED until Atrium/client confirms — do not treat as authoritative or publish until reviewed.`)
  L.push('')
  return L.join('\n')
}

// self-contained review page: each item with timestamp + verbatim quote + keyframe + owner + confidence.
export function serializeReviewHtml({ client, project, video, requestedAt, accepted = [], needsClarification = [] }) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const row = (it, n) => `<tr>
    <td class="n">${n ?? ''}</td>
    <td class="t">${esc(mmss(it.timestamp))}</td>
    <td><div class="chg">${esc(it.change)}</div><div class="quote">“${esc(q(it.quote))}”</div></td>
    <td>${esc(it.surface || '')}</td>
    <td><span class="owner ${it.escalate ? 'esc' : ''}">${esc(it.owner || '')}</span></td>
    <td class="conf">${it.confidence != null ? Math.round(it.confidence * 100) + '%' : ''}</td>
    <td>${it.frameRel ? `<img src="${esc(it.frameRel)}" alt="frame @ ${esc(mmss(it.timestamp))}">` : ''}</td>
  </tr>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Changes from video — ${esc(project || '')}</title>
<style>
  :root{--bg:#fbfbfd;--fg:#1d1d22;--mut:#6b6b78;--line:#e6e6ee;--card:#fff;--accent:#4f46e5;--warn:#b4530a;--esc:#b21f2d}
  @media(prefers-color-scheme:dark){:root{--bg:#151518;--fg:#ececf2;--mut:#9a9aa8;--line:#2a2a32;--card:#1d1d22}}
  *{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--fg)}
  .wrap{max-width:1100px;margin:0 auto;padding:32px 20px 64px}
  h1{font-size:22px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 24px;font-size:13px}
  .banner{background:color-mix(in srgb,var(--accent) 8%,transparent);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:10px;padding:10px 14px;font-size:13px;color:var(--fg);margin:0 0 24px}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:28px 0 10px}
  .scroll{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--card)}
  table{border-collapse:collapse;width:100%;min-width:760px}
  th,td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:top;font-size:13px}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);font-weight:600}
  tr:last-child td{border-bottom:none}
  .n{color:var(--mut);font-variant-numeric:tabular-nums}.t{font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--accent);font-weight:600}
  .chg{font-weight:600}.quote{color:var(--mut);font-style:italic;margin-top:3px;font-size:12px}
  .owner{display:inline-block;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);font-size:12px;font-weight:600}
  .owner.esc{background:color-mix(in srgb,var(--esc) 14%,transparent);color:var(--esc)}
  .conf{font-variant-numeric:tabular-nums;color:var(--mut)}
  img{width:180px;max-width:100%;border-radius:8px;border:1px solid var(--line);display:block}
  .nc li{margin:6px 0;color:var(--warn)}
  .empty{color:var(--mut);padding:14px}
</style></head><body><div class="wrap">
  <h1>Changes from video — ${esc(project || '')}</h1>
  <p class="sub">${esc(client || '')} · <code>${esc(video || '')}</code> · ${esc(requestedAt || '')}</p>
  <div class="banner"><b>Proposed, not authoritative.</b> Confirm each item against its timestamp &amp; quote before it enters the build. Ambiguous asks are quarantined below — nothing was invented.</div>
  <h2>Proposed changes (${accepted.length})</h2>
  <div class="scroll"><table>
    <thead><tr><th>#</th><th>Time</th><th>Change &amp; what the client said</th><th>Surface</th><th>Owner</th><th>Conf.</th><th>Frame</th></tr></thead>
    <tbody>${accepted.length ? accepted.map((it, i) => row(it, i + 1)).join('') : '<tr><td colspan="7" class="empty">No high-confidence items.</td></tr>'}</tbody>
  </table></div>
  <h2>Needs clarification (${needsClarification.length})</h2>
  ${needsClarification.length ? `<ul class="nc">${needsClarification.map((it) => `<li><b>${esc(mmss(it.timestamp))}</b> — ${esc(it.change || '(unclear)')} — <i>“${esc(q(it.quote))}”</i> — ${esc(it.ambiguity || 'low confidence')}</li>`).join('')}</ul>` : '<p class="empty">None — every ask was confident and unambiguous.</p>'}
</div></body></html>`
}

// ── integration (not hermetically tested — needs ffmpeg/whisper/claude) ──────

function die(msg, code = 2) { console.error(`changes-from-video: ${msg}`); process.exit(code) }

function parseArgs(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--video') o.video = argv[++i]
    else if (a === '--client') o.client = argv[++i]
    else if (a === '--project') o.project = argv[++i]
    else if (a === '--preview-url') o.previewUrl = argv[++i]
    else if (a === '--out') o.out = argv[++i]
    else if (a === '--window') o.window = Number(argv[++i])
  }
  return o
}

// one multimodal extraction over a transcript window + its frame. Reuses the vision-read contract; falls
// back to text-only (llm-judge) if the frame/claude is unavailable. → candidate item array.
async function extractWindow(win, framePath) {
  const shape = { items: [{ change: '<imperative, specific>', surface: '<page/section the client is on>', acceptance: '<how to verify done>', owner: '<loom|drape|ink|conduit|lattice|beacon|porter|human>', confidence: 0.0, quote: '<the client\'s own words>', ambiguity: '<why unclear, or empty>' }] }
  const instruction = [
    'You are extracting the DISCRETE change requests a client is making in a screen-recording walkthrough of their Shopify store.',
    `What the client SAID during this ~${Math.round(win.t1 - win.t0)}s window (verbatim transcript): """${win.text}"""`,
    'The image is the store frame at this moment — use it to resolve deictic references ("this", "that", "here", "the button") to the actual on-screen element/section.',
    'Return ONE item per DISTINCT change the client actually asked for. Do NOT invent changes, acceptance criteria, or owners you cannot support from the transcript + frame.',
    'For each item: `change` = an imperative instruction; `surface` = the page/section; `acceptance` = a concrete way to verify it is done; `owner` = who should do it (copy→ink, visual design→drape, Liquid/section/layout→loom, apps/data→conduit, metafields→lattice, SEO→beacon, store products/images→porter, legal/pricing/claims→human); `confidence` 0–1; `quote` = the client\'s own words; `ambiguity` = why it is unclear (empty string if fully clear).',
    'If the window contains NO actionable change request (chit-chat, greeting), return { "items": [] }.',
  ].join('\n\n')
  const validate = (o) => (o && Array.isArray(o.items) ? true : 'no items array')

  if (framePath && fs.existsSync(framePath) && claudeAvailable()) {
    const r = await visionRead({ imagePath: framePath, instruction, shape, validate })
    if (r.ok) return (r.data.items || []).map((it) => ({ ...it, timestamp: win.t0 }))
  }
  // text-only fallback (no frame or no vision): deixis unresolved → lower confidence, flag it.
  const v = llmJudge({ prompt: `${instruction}\n\n(NO frame available — you cannot see the screen; lower confidence and set ambiguity for any "this/that/here" reference.)\n\nReturn ONLY JSON: ${JSON.stringify(shape)}` })
  if (v && Array.isArray(v.items)) return v.items.map((it) => ({ ...it, timestamp: win.t0, confidence: Math.min(it.confidence ?? 0.4, 0.5) }))
  return []
}

// adversarial self-verify: refute the item against the transcript window. Fail-open (null → keep). A
// refuted/invented item is DOWNGRADED to needs-clarification (flag ambiguity), never silently dropped.
function selfVerify(item, windowText) {
  const v = llmJudge({
    prompt: [
      'You are auditing whether an extracted change request is faithful to what a client actually said. Be skeptical.',
      `Client transcript window: """${windowText}"""`,
      `Extracted change: "${item.change}"  |  acceptance: "${item.acceptance || ''}"`,
      'Did the client actually ask for THIS change in the transcript? Is the acceptance faithful to their words (not invented)?',
      'Return ONLY JSON: {"faithful": true/false, "invented": true/false, "confidence": 0.0-1.0, "reason": "<short>"}',
    ].join('\n\n'),
  })
  if (!v) return item // no opinion → keep as-is (fail-open)
  const faithful = v.faithful !== false && v.invented !== true
  return {
    ...item,
    confidence: typeof v.confidence === 'number' ? Math.min(item.confidence ?? 0.5, v.confidence) : item.confidence,
    ambiguity: faithful ? item.ambiguity : `self-verify: ${v.reason || 'not clearly supported by the transcript'}`,
  }
}

function today() {
  // deterministic-friendly: allow override so callers/tests don't depend on the clock.
  return process.env.CFV_DATE || new Date().toISOString().slice(0, 10)
}

function findChangesValidator() {
  for (const p of [path.resolve(HERE, '../../scripts/check-changes-list.mjs'), path.resolve(cwd, 'scripts/check-changes-list.mjs'), path.resolve(HERE, 'check-changes-list.mjs')]) {
    if (fs.existsSync(p)) return p
  }
  return null
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  if (!o.video) die('missing --video <file>')
  if (!o.project) die('missing --project <slug>')
  const gaps = missingDeps()
  if (gaps) die(`missing dependencies for local transcription: ${gaps}`)
  if (!claudeAvailable()) die('claude CLI not found — the change extraction needs a logged-in `claude` (subscription, no API key)')

  const slug = String(o.project).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const outDir = path.resolve(cwd, o.out || `docs/design/changes-intake/${slug}`)
  const framesDir = path.join(outDir, 'frames')
  fs.mkdirSync(framesDir, { recursive: true })

  console.log(`changes-from-video: ${o.video}  →  ${path.relative(cwd, outDir)}/`)
  const status = binaryStatus()
  console.log(`  deps: ffmpeg ✓ · whisper=${status.whisper} · model=${path.basename(status.model)}`)

  // 1) transcribe (local)
  const wav = extractAudio(o.video)
  console.log('  transcribing (whisper.cpp, on-machine)…')
  const segments = transcribeAudio(wav)
  console.log(`  transcript: ${segments.length} segments, ${mmss(segments.at(-1)?.end || 0)} long`)

  // 2) window + per-window multimodal extraction
  const windows = windowTranscript(segments, { windowSec: o.window || 75 })
  console.log(`  ${windows.length} windows → extracting changes…`)
  let candidates = []
  for (let i = 0; i < windows.length; i += 1) {
    const win = windows[i]
    const mid = (win.t0 + win.t1) / 2
    const frameRel = `frames/win-${String(i).padStart(2, '0')}.png`
    let framePath = null
    try { framePath = extractFrameAt(o.video, mid, path.join(outDir, frameRel)) } catch { /* frame optional */ }
    const items = await extractWindow(win, framePath)
    for (const it of items) candidates.push({ ...it, frameRel: framePath ? frameRel : undefined, windowText: win.text })
    process.stdout.write(`\r  window ${i + 1}/${windows.length} — ${candidates.length} candidate(s)   `)
  }
  process.stdout.write('\n')

  // 3) merge duplicates, 4) self-verify, 5) route owner
  let items = mergeDuplicates(candidates)
  items = items.map((it) => selfVerify(it, it.windowText || ''))
  items = items.map((it) => {
    const r = routeOwner(it.change, it.owner)
    const acc = resolveSurface(it.surface || 'home', { templateExists: (p) => fs.existsSync(path.resolve(cwd, p)) })
    return { ...it, owner: r.owner, escalate: r.escalate, escalateReason: r.escalate ? r.reason : undefined, surface: acc.surface }
  })

  // 6) bucket
  const { accepted, needsClarification } = bucketByConfidence(items)

  // 7) emit — durable artifact + proposed CHANGES.md + review.html
  const requestedAt = today()
  const meta = { client: o.client, project: o.project, video: o.video, previewUrl: o.previewUrl, requestedAt }
  const changesMd = serializeChangesMd({ ...meta, requestedBy: o.client, accepted, needsClarification })
  const reviewHtml = serializeReviewHtml({ ...meta, accepted, needsClarification })
  const intake = { ...meta, generatedAt: new Date().toISOString(), windows: windows.length, accepted, needsClarification, transcript: segments }

  fs.writeFileSync(path.join(outDir, 'intake.json'), JSON.stringify(intake, null, 2) + '\n')
  fs.writeFileSync(path.join(outDir, 'CHANGES.md'), changesMd)
  fs.writeFileSync(path.join(outDir, 'review.html'), reviewHtml)
  try { fs.rmSync(path.dirname(wav), { recursive: true, force: true }) } catch { /* */ }

  console.log(`  → ${accepted.length} proposed item(s), ${needsClarification.length} need clarification`)
  console.log(`  → ${path.relative(cwd, outDir)}/CHANGES.md · review.html · intake.json`)

  // 8) validate the proposed CHANGES.md is SCHEMA-valid (exit 1 = unchecked-at-intake is by design; 2 = bug)
  const validator = findChangesValidator()
  if (validator) {
    const r = spawnSync('node', [validator, path.join(outDir, 'CHANGES.md')], { encoding: 'utf-8' })
    if (r.status === 2) console.error(`  ⚠️ CHANGES.md SCHEMA error (exit 2) — this is a bug, not intake state:\n${(r.stderr || '').trim()}`)
    else console.log(`  ✓ CHANGES.md schema-valid (validator exit ${r.status}${r.status === 1 ? ' = unchecked at intake, expected' : ''})`)
  }
  console.log('  PROPOSED — confirm each item (review.html or the Polyglot UI) before it enters the build.')
}

if (isMain(import.meta.url)) {
  main().catch((e) => die(`unexpected failure: ${e.message}`))
}
