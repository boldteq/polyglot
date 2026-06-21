#!/usr/bin/env node
// Self-test for check-art-direction.mjs (gate #24, WS-C). Proves: SKIP when no contract / no
// art_direction declared; PASS when a hero renders responsive sources (<picture> or image_tag);
// WARN-ONLY by default but BLOCK under ART_DIRECTION_ENFORCE=1 when a declared-art_direction hero
// renders a single non-responsive image (the gpt-test-1 M2 defect, deterministically). Hermetic: temp dirs.
// Run: node scripts/__fixtures__/art-direction/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-art-direction.mjs')
let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

const AD_CONTRACT = JSON.stringify({ imagery: { art_direction: { hero: { desktop_aspect: '16:9', mobile_aspect: '4:5', scrim: 'linear-gradient-bottom' } } } })

function build({ contract, hero }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-'))
  if (contract) { fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true }); fs.writeFileSync(path.join(d, 'docs', 'design', 'design-system.json'), contract) }
  if (hero) { fs.mkdirSync(path.join(d, 'sections'), { recursive: true }); fs.writeFileSync(path.join(d, 'sections', 'hero-banner.liquid'), hero) }
  return d
}
function run(dir, env = {}) {
  const r = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf-8', env: { ...process.env, BASE_REF: '__no_base__', REPORT_DIR: path.join(dir, 'gate-reports'), ...env } })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(dir, 'gate-reports', 'art-direction.json'), 'utf-8')) } catch {}
  return { code: r.status, ids: new Set([...(rep?.blockers || []), ...(rep?.warnings || [])].map(x => x.id)), blockerIds: new Set((rep?.blockers || []).map(x => x.id)) }
}
const E = { ART_DIRECTION_ENFORCE: '1' }
const PICTURE_HERO = `<section class="hero"><picture><source media="(max-width:768px)" srcset="m.jpg"><source media="(min-width:769px)" srcset="d.jpg"><img src="d.jpg"></picture><h1>Hi</h1></section>{% schema %}{}{% endschema %}`
const IMAGETAG_HERO = `<section class="hero">{{ section.settings.image | image_tag: widths: '375,768,1440' }}<h1>Hi</h1></section>{% schema %}{}{% endschema %}`
const SINGLE_IMG_HERO = `<section class="hero"><img src="{{ section.settings.image | image_url: width: 2000 }}"><h1>Hi</h1></section>{% schema %}{}{% endschema %}`

console.log('check-art-direction — gate #24 (warn-first → BLOCK under ENFORCE)')
{ const d = build({ contract: null, hero: PICTURE_HERO }); const r = run(d, E); r.code === 0 && r.ids.has('art-direction.n-a-no-contract') ? ok('no design-system.json → SKIP/PASS') : bad(`no-contract: code ${r.code} ids ${[...r.ids]}`); fs.rmSync(d, { recursive: true, force: true }) }
{ const d = build({ contract: JSON.stringify({ imagery: {} }), hero: SINGLE_IMG_HERO }); const r = run(d, E); r.code === 0 && r.ids.has('art-direction.n-a-not-declared') ? ok('contract without art_direction → SKIP/PASS') : bad(`not-declared: code ${r.code} ids ${[...r.ids]}`); fs.rmSync(d, { recursive: true, force: true }) }
{ const d = build({ contract: AD_CONTRACT, hero: PICTURE_HERO }); const r = run(d, E); r.code === 0 && !r.blockerIds.has('art-direction.no-responsive-source') ? ok('<picture> hero → PASS') : bad(`picture: code ${r.code} blockers ${[...r.blockerIds]}`); fs.rmSync(d, { recursive: true, force: true }) }
{ const d = build({ contract: AD_CONTRACT, hero: IMAGETAG_HERO }); const r = run(d, E); r.code === 0 && !r.blockerIds.has('art-direction.no-responsive-source') ? ok('image_tag widths hero → PASS (responsive)') : bad(`image_tag: code ${r.code} blockers ${[...r.blockerIds]}`); fs.rmSync(d, { recursive: true, force: true }) }
{ const d = build({ contract: AD_CONTRACT, hero: SINGLE_IMG_HERO }); const r = run(d, E); r.code === 1 && r.blockerIds.has('art-direction.no-responsive-source') ? ok('single non-responsive img + ENFORCE → BLOCK') : bad(`single-img enforce: code ${r.code} blockers ${[...r.blockerIds]}`); fs.rmSync(d, { recursive: true, force: true }) }
{ const d = build({ contract: AD_CONTRACT, hero: SINGLE_IMG_HERO }); const r = run(d); r.code === 0 && r.ids.has('art-direction.no-responsive-source') && r.ids.has('art-direction.warn-only') ? ok('single non-responsive img, warn-only default → exit 0 + warning') : bad(`single-img warn-only: code ${r.code} ids ${[...r.ids]}`); fs.rmSync(d, { recursive: true, force: true }) }

console.log('check-art-direction — #7 responsive-coverage matrix (distinct crops need <picture>)')
{ // image_tag (resolution-only) + DISTINCT crops declared → crop-coverage WARN (not a blocker), exit 0 even under ENFORCE
  const d = build({ contract: AD_CONTRACT, hero: IMAGETAG_HERO }); const r = run(d, E)
  r.code === 0 && r.ids.has('art-direction.crop-coverage') && !r.blockerIds.has('art-direction.crop-coverage') ? ok('distinct crops + resolution-srcset → crop-coverage WARN') : bad(`crop-coverage: code ${r.code} ids ${[...r.ids]}`); fs.rmSync(d, { recursive: true, force: true })
}
{ // <picture> with <source media> + distinct crops → NO crop-coverage finding (genuine art-direction)
  const d = build({ contract: AD_CONTRACT, hero: PICTURE_HERO }); const r = run(d, E)
  !r.ids.has('art-direction.crop-coverage') ? ok('<picture> source media → no crop-coverage finding') : bad(`picture wrongly flagged: ids ${[...r.ids]}`); fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
