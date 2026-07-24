// vision-read — the shared "actually LOOK at the screenshot" primitive.
//
// THE GAP THIS CLOSES (2026-07-24): reference-capture resolved a pasted image's archetype from TEXT
// only — the filename, the --must-have hints, the section name. It never looked at the pixels. So the
// system could not READ a screenshot Yash sent; it asked him to describe it. Yash's ask was "screenshot
// reading should be amazing and high accurate" — reading means vision, not string-matching a filename.
//
// This wraps the same headless `claude -p` vision call the reference-match judge uses (subscription
// vision, no API key): hand it an image + a JSON schema of what to extract, get back validated JSON.
// It is the one place the model is told to Read an image and return structure, so every caller
// (reference-capture archetype resolution, the accuracy harness) reads the same way.
//
// Degrades honestly: CLI missing / timeout / unparseable → { ok:false, reason }. A vision read that
// could not happen must never masquerade as a confident answer — the caller falls back to text signals
// and SAYS the read was skipped, it does not invent an archetype.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const MODEL = process.env.VISION_READ_MODEL || process.env.LENS_JUDGE_MODEL || ''
const TIMEOUT_MS = Number(process.env.VISION_READ_TIMEOUT_MS || 120000)

export function claudeAvailable() {
  try { return !spawnSync(CLAUDE_BIN, ['--version'], { encoding: 'utf-8' }).error } catch { return false }
}

// Read `imagePath` with the model and return the JSON it writes, validated by `validate(obj)->true|string`.
// `instruction` describes WHAT to extract; `shape` is a literal example of the JSON to emit.
// → { ok:true, data } | { ok:false, reason }
export async function visionRead({ imagePath, instruction, shape, validate }) {
  if (!fs.existsSync(imagePath)) return { ok: false, reason: `image not found: ${imagePath}` }
  if (!claudeAvailable()) return { ok: false, reason: `claude CLI not found (${CLAUDE_BIN}) — vision read skipped` }

  // The model writes to a file (not stdout) — the exact contract the reference-match judge uses, so a
  // chatty preamble can't corrupt the JSON.
  const outPath = path.join(os.tmpdir(), `vision-read-${process.pid}-${Date.now()}.json`)
  const prompt = [
    'You are reading ONE screenshot and returning a precise structured description of it. Be literal about what is VISIBLY present — never guess at behaviour you cannot see in a still frame.',
    `IMAGE = ${imagePath}`,
    'Read the image.',
    instruction,
    `Write ONLY a JSON file to EXACTLY this path: ${outPath}`,
    `JSON shape: ${JSON.stringify(shape)}`,
    'Do not print anything else.',
  ].join('\n\n')

  const args = ['-p', prompt, '--no-session-persistence', '--allowedTools', 'Read,Write']
  if (MODEL) args.push('--model', MODEL)

  const ran = await new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, args, { cwd: os.tmpdir(), stdio: ['ignore', 'ignore', 'pipe'] })
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* */ } resolve({ ok: false, reason: `vision read timed out after ${TIMEOUT_MS}ms` }) }, TIMEOUT_MS)
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, reason: e.message }) })
    child.on('close', () => { clearTimeout(timer); resolve({ ok: true }) })
  })
  if (!ran.ok) { try { fs.rmSync(outPath, { force: true }) } catch { /* */ } return ran }

  let data
  try { data = JSON.parse(fs.readFileSync(outPath, 'utf-8')) } catch { return { ok: false, reason: 'vision read produced no parseable JSON' } }
  finally { try { fs.rmSync(outPath, { force: true }) } catch { /* */ } }

  if (typeof validate === 'function') {
    const v = validate(data)
    if (v !== true) return { ok: false, reason: `vision read failed validation: ${v}`, data }
  }
  return { ok: true, data }
}

// The specific read reference-capture + the accuracy harness both use: given a reference/design image,
// name the component ARCHETYPE and the visible structural SIGNALS. `archetypes` is the allowed set (from
// reference-archetype-signals.md) so the model can't return one the rest of the pipeline doesn't know.
export async function readArchetype(imagePath, archetypes) {
  const list = archetypes.join(', ')
  return visionRead({
    imagePath,
    instruction: [
      `This is a REFERENCE design of ONE section a client wants built. Identify its component archetype from EXACTLY this vocabulary: ${list}.`,
      'Anchor the read in the structural signals actually visible in the frame — e.g. pagination DOTS ⇒ slideshow (more than one slide); side ARROWS on a track ⇒ carousel; a FILTER/sort row above a product grid ⇒ collection-grid; CHEVRONS on stacked rows ⇒ accordion; TABS ⇒ tabbed; a single full-bleed image with text ⇒ image-banner/image-with-text.',
      'List the concrete signals you can SEE (dots, arrows, chevrons, tabs, filter row, star ratings, price, add-to-cart, columns count). Report ONLY what is visible; do not infer auto-rotate or hover behaviour from a still frame. Give a confidence 0-100.',
    ].join(' '),
    shape: { archetype: '<one of the vocabulary>', signals: ['<visible signal>'], confidence: 0, note: '<one line on what made you choose it>' },
    validate: (o) => {
      if (!o || typeof o !== 'object') return 'not an object'
      if (!archetypes.includes(o.archetype)) return `archetype "${o.archetype}" not in vocabulary`
      if (!Array.isArray(o.signals)) return 'signals is not an array'
      if (typeof o.confidence !== 'number') return 'confidence is not a number'
      return true
    },
  })
}
