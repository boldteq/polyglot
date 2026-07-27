// transcribe — the audio/video primitives for changes-from-video.mjs. LOCAL + subscription-friendly:
// ffmpeg demuxes, whisper.cpp transcribes ON-MACHINE (no API key, and the client's confidential store
// walkthrough never leaves the computer). All calls are integration-only (spawn ffmpeg/whisper-cli), so
// the hermetic fixture tests the PURE logic in change-router/changes-from-video, not these.
//
// Requires (assumed-installed, die-with-hint like reference-ingest.mjs): `ffmpeg` + a whisper.cpp binary
// (`brew install ffmpeg whisper-cpp`) + a ggml model. Binary/model overridable via env:
//   WHISPER_BIN   (default: probe whisper-cli, whisper-cpp, main)
//   WHISPER_MODEL (path to a ggml-*.bin model — REQUIRED; e.g. ~/whisper-models/ggml-small.en.bin)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const WHISPER_CANDIDATES = [process.env.WHISPER_BIN, 'whisper-cli', 'whisper-cpp', 'main'].filter(Boolean)

function which(bin, args = ['--help']) {
  try { const r = spawnSync(bin, args, { encoding: 'utf-8' }); return !r.error } catch { return false }
}

// → { ffmpeg:boolean, whisper:string|null, model:string|null }. whisper = the resolved binary name.
export function binaryStatus() {
  const ffmpeg = !!spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8' }).stdout
  const whisper = WHISPER_CANDIDATES.find((b) => which(b)) || null
  const model = process.env.WHISPER_MODEL && fs.existsSync(path.resolve(process.env.WHISPER_MODEL.replace(/^~/, os.homedir())))
    ? path.resolve(process.env.WHISPER_MODEL.replace(/^~/, os.homedir())) : null
  return { ffmpeg, whisper, model }
}

// Human-readable "what's missing" for preflight (empty string when everything is present).
export function missingDeps() {
  const s = binaryStatus()
  const gaps = []
  if (!s.ffmpeg) gaps.push('ffmpeg (brew install ffmpeg)')
  if (!s.whisper) gaps.push('whisper.cpp (brew install whisper-cpp) — set WHISPER_BIN if the binary is named differently')
  if (!s.model) gaps.push('WHISPER_MODEL=<path to ggml-small.en.bin> (download from huggingface ggerganov/whisper.cpp)')
  return gaps.join(' · ')
}

// ffmpeg: video → 16 kHz mono PCM wav (what whisper.cpp expects). Returns the wav path, throws on failure.
export function extractAudio(videoPath, outWav) {
  const src = path.resolve(String(videoPath).replace(/^~/, os.homedir()))
  if (!fs.existsSync(src)) throw new Error(`video not found: ${src}`)
  const out = outWav || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfv-audio-')), 'audio.wav')
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', out], { encoding: 'utf-8' })
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`ffmpeg audio extract failed: ${(r.stderr || '').trim()}`)
  return out
}

// ffmpeg: one PNG frame at `seconds`. Returns the png path, throws on failure. (Frame↔window aligned by
// the caller extracting at each window's midpoint — no scene-detection parsing needed.)
export function extractFrameAt(videoPath, seconds, outPng) {
  const src = path.resolve(String(videoPath).replace(/^~/, os.homedir()))
  const out = outPng || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfv-frame-')), 'frame.png')
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(seconds), '-i', src, '-frames:v', '1', out], { encoding: 'utf-8' })
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`ffmpeg frame extract at ${seconds}s failed: ${(r.stderr || '').trim()}`)
  return out
}

// PURE: normalize whisper.cpp JSON → [{ start, end, text }] (seconds). Handles the `transcription[]`
// (offsets in ms) shape and a `segments[]` fallback. Exported so the fixture can test parsing offline.
export function parseWhisperJson(json) {
  const obj = typeof json === 'string' ? JSON.parse(json) : json
  const rows = Array.isArray(obj?.transcription) ? obj.transcription : (Array.isArray(obj?.segments) ? obj.segments : [])
  const out = []
  for (const r of rows) {
    const text = String(r.text ?? '').trim()
    if (!text) continue
    const start = r.offsets?.from != null ? r.offsets.from / 1000 : (r.start != null ? Number(r.start) : null)
    const end = r.offsets?.to != null ? r.offsets.to / 1000 : (r.end != null ? Number(r.end) : null)
    out.push({ start: start ?? 0, end: end ?? (start ?? 0), text })
  }
  return out
}

// whisper.cpp: wav → [{ start, end, text }]. `bin`/`model` from binaryStatus(). Throws on failure.
export function transcribeAudio(wavPath, { bin, model } = {}) {
  const b = bin || WHISPER_CANDIDATES.find((x) => which(x))
  const m = model || (process.env.WHISPER_MODEL && path.resolve(process.env.WHISPER_MODEL.replace(/^~/, os.homedir())))
  if (!b) throw new Error('no whisper.cpp binary found (brew install whisper-cpp; or set WHISPER_BIN)')
  if (!m || !fs.existsSync(m)) throw new Error(`whisper model not found (set WHISPER_MODEL to a ggml-*.bin path)`)
  const prefix = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfv-whisper-')), 'out')
  const r = spawnSync(b, ['-m', m, '-f', wavPath, '-oj', '-of', prefix, '-np'], { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`whisper transcription failed: ${(r.stderr || r.stdout || '').trim().slice(0, 400)}`)
  const jsonPath = `${prefix}.json`
  if (!fs.existsSync(jsonPath)) throw new Error(`whisper produced no JSON at ${jsonPath}`)
  return parseWhisperJson(fs.readFileSync(jsonPath, 'utf-8'))
}
