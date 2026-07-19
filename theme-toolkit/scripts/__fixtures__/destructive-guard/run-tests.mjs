// Hermetic fixture for the destructive-fix guard (audit H2). Builds a throwaway git theme, simulates
// a "fix" that DELETES a section / strips a schema / gently edits, and asserts detectDestructive +
// revertDestructive behave: destructive edits are caught and reverted; a benign edit is not flagged.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { snapshotTheme, detectDestructive, revertDestructive } from '../../lib/fix-guard.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })

function makeRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'destr-'))
  fs.mkdirSync(path.join(tmp, 'sections'), { recursive: true })
  const sec = (name, body) => fs.writeFileSync(path.join(tmp, 'sections', name), body)
  sec('hero.liquid', `<div class="hero">{{ section.settings.h }}</div>\n{% schema %}\n{"name":"Hero","settings":[{"type":"text","id":"h","default":"Hi"}]}\n{% endschema %}\n`)
  sec('reviews.liquid', `<div class="reviews">stuff</div>\n{% schema %}\n{"name":"Reviews","settings":[]}\n{% endschema %}\n`)
  git(['init'], tmp); git(['add', '-A'], tmp)
  git(['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-m', 'init'], tmp)
  return tmp
}

console.log('case (a) a fix that DELETES a section → destructive + reverted (restored)')
{
  const tmp = makeRepo(); const before = snapshotTheme(tmp)
  fs.rmSync(path.join(tmp, 'sections', 'reviews.liquid')) // the "cheap fix"
  const g = detectDestructive(tmp, before)
  g.destructive ? ok('deletion detected as destructive') : bad('missed deletion')
  const rev = revertDestructive(tmp, g.culprits, before)
  rev.reverted && fs.existsSync(path.join(tmp, 'sections', 'reviews.liquid')) ? ok('deleted section restored by revert') : bad('revert did not restore the section')
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('case (b) a fix that STRIPS the {% schema %} → destructive')
{
  const tmp = makeRepo(); const before = snapshotTheme(tmp)
  fs.writeFileSync(path.join(tmp, 'sections', 'hero.liquid'), `<div class="hero">gutted</div>\n`) // schema removed
  const g = detectDestructive(tmp, before)
  g.destructive && g.reasons.some(r => /schema/.test(r)) ? ok('schema-strip detected as destructive') : bad(`missed schema strip (reasons: ${g.reasons.join('; ')})`)
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('case (c) a benign in-place edit (keep file + schema) → NOT destructive')
{
  const tmp = makeRepo(); const before = snapshotTheme(tmp)
  fs.writeFileSync(path.join(tmp, 'sections', 'hero.liquid'), `<div class="hero" style="color:var(--ds-fg)">{{ section.settings.h }}</div>\n{% schema %}\n{"name":"Hero","settings":[{"type":"text","id":"h","default":"Hi"}]}\n{% endschema %}\n`)
  const g = detectDestructive(tmp, before)
  !g.destructive ? ok('benign edit not flagged') : bad(`false-positive on benign edit (reasons: ${g.reasons.join('; ')})`)
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
