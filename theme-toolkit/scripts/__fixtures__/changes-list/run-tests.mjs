#!/usr/bin/env node
// Self-test for check-changes-list.mjs dual-mode (2026-06-21). Proves STRICT (YAML) mode is
// unchanged AND the new PROSE mode runs on real autonomous CHANGES.md while still enforcing
// substance (every item checked + cites a real artifact + shippable status). Hermetic: temp files.
// Run: node scripts/__fixtures__/changes-list/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-changes-list.mjs');
let failures = 0;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1; };

function run(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-'));
  const f = path.join(dir, 'CHANGES.md');
  fs.writeFileSync(f, body);
  const r = spawnSync(process.execPath, [GATE, f], { encoding: 'utf-8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return r.status;
}

const STRICT_GOOD = `---
client: Acme
project: Acme Theme
requestedAt: 2026-06-21
requestedBy: yash
status: shipped
---

## Items
- [x] 1. Hero CTA
  - assignee: loom
  - acceptance: gate-reports/functional.json
  - evidence: commit abc1234 + docs/design/design-spec.md
`;
const STRICT_UNCHECKED = STRICT_GOOD.replace('- [x] 1. Hero CTA', '- [ ] 1. Hero CTA');

const PROSE_GOOD = `# CHANGES — Meridian store
**Status:** 🟢 DEPLOYED LIVE 2026-06-19

## Build pass
- [x] **B1** Fixed cart drawer AJAX. _Files: sections/sticky-atc.liquid, templates/index.json._
- [x] **B2** Price anchoring. Verification: theme check 0 errors; templates/index.json valid.
`;
const PROSE_UNCHECKED = PROSE_GOOD + '- [ ] **B3** Substantiate the claims (not done)\n';
const PROSE_NO_EVIDENCE = `# CHANGES — Test
**Status:** shipped

- [x] **C** did a thing with no artifact reference at all
`;
const PROSE_NO_STATUS = `# CHANGES — Test (no status line)

- [x] **D** thing. _Files: sections/d.liquid_
`;

console.log('check-changes-list — STRICT (YAML) mode unchanged');
run(STRICT_GOOD) === 0 ? ok('strict all-checked+evidence → exit 0') : bad(`strict good → ${run(STRICT_GOOD)}`);
run(STRICT_UNCHECKED) === 1 ? ok('strict unchecked → exit 1') : bad(`strict unchecked → ${run(STRICT_UNCHECKED)}`);

console.log('check-changes-list — PROSE mode (real autonomous format)');
run(PROSE_GOOD) === 0 ? ok('prose all-checked + inline _Files:_/theme-check evidence → exit 0') : bad(`prose good → ${run(PROSE_GOOD)} (should be 0)`);
run(PROSE_UNCHECKED) === 1 ? ok('prose with an unchecked item → exit 1 (catches the gpt-test-1 bypass)') : bad(`prose unchecked → ${run(PROSE_UNCHECKED)} (should be 1)`);
run(PROSE_NO_EVIDENCE) === 1 ? ok('prose checked-but-no-artifact → exit 1') : bad(`prose no-evidence → ${run(PROSE_NO_EVIDENCE)} (should be 1)`);
run(PROSE_NO_STATUS) === 2 ? ok('prose with no derivable status → exit 2') : bad(`prose no-status → ${run(PROSE_NO_STATUS)} (should be 2)`);

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
