'use strict';

// Lens calibration grade round-trip (WS-G), real HTTP + isolated temp DB:
//  - db.insertCalibrationGrade / listCalibrationGrades (+ since filter, check_id→check mapping)
//  - approve a `calibration` candidate → records grade=agree; reject → records grade=disagree
//  - grades → computeCalibration (the toolkit pure fn the weekly apply reuses) → a per-check suggestion
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-cal-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'test.db');

const express = require('express');
const db = require('./../db');
const { router } = require('./learning');

let server; let base;

before(async () => {
  db.getDb();
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  try { db.getDb().close(); } catch { /* already closed */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
});

const post = (p) => new Promise((resolve, reject) => {
  const req = http.request(base + p, { method: 'POST', agent: false, headers: { 'content-length': 0 } }, (res) => {
    let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { resolve({ status: res.statusCode, json: b ? JSON.parse(b) : {} }); } catch (e) { reject(e); } });
  });
  req.on('error', reject); req.end();
});

test('db calibration_grades — insert + list + since filter + check_id→check mapping', () => {
  db.insertCalibrationGrade({ frameKey: 'home-mobile', check: 'premium-feel', surface: 'home', lensVerdict: 'FAIL', grade: 'agree', gradedAt: '2020-01-01T00:00:00Z' });
  db.insertCalibrationGrade({ frameKey: 'home-mobile', check: 'premium-feel', surface: 'home', lensVerdict: 'FAIL', grade: 'disagree' });
  const all = db.listCalibrationGrades();
  assert.ok(all.length >= 2, 'rows inserted');
  assert.ok(all.every((r) => r.check === r.check_id), 'check_id mapped to check');
  const recent = db.listCalibrationGrades({ since: '2025-01-01T00:00:00Z' });
  assert.ok(recent.length >= 1 && recent.length < all.length, 'since filters the 2020 row out');
});

test('approve a calibration candidate → records grade=agree', async () => {
  const { id } = db.insertLearningCandidate({ type: 'calibration', title: 'cal agree', payload: { frameKey: 'pdp-mobile', check: 'hierarchy', surface: 'pdp', lensVerdict: 'FAIL' }, status: 'pending' });
  const r = await post(`/learning/inbox/${id}/approve`);
  assert.equal(r.status, 200, 'approve ok');
  const g = db.listCalibrationGrades().find((x) => x.candidateId === id);
  assert.ok(g && g.grade === 'agree' && g.check === 'hierarchy', 'agree grade recorded for the right check');
});

test('reject a calibration candidate → records grade=disagree', async () => {
  const { id } = db.insertLearningCandidate({ type: 'calibration', title: 'cal disagree', payload: { frameKey: 'pdp-desktop', check: 'spacing-rhythm', surface: 'pdp', lensVerdict: 'PASS' }, status: 'pending' });
  const r = await post(`/learning/inbox/${id}/reject`);
  assert.equal(r.status, 200, 'reject ok');
  const g = db.listCalibrationGrades().find((x) => x.candidateId === id);
  assert.ok(g && g.grade === 'disagree' && g.check === 'spacing-rhythm', 'disagree grade recorded');
});

test('grades → computeCalibration → suggestion (the weekly apply logic)', async () => {
  for (let i = 0; i < 4; i += 1) db.insertCalibrationGrade({ frameKey: `home-mobile-${i}`, check: 'motion-restraint', surface: 'home', lensVerdict: 'FAIL', grade: i < 3 ? 'disagree' : 'agree' });
  const grades = db.listCalibrationGrades({ since: '2025-01-01T00:00:00Z' });
  const mod = await import(require('node:url').pathToFileURL(path.resolve(__dirname, '..', '..', 'theme-toolkit', 'scripts', 'lens-calibrate.mjs')).href);
  const { suggestions } = mod.computeCalibration(grades);
  assert.ok(suggestions.find((s) => s.check === 'motion-restraint'), 'motion-restraint suggested (3/4 disagree)');
});
