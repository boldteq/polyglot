import path from 'node:path'; import os from 'node:os'; import fs from 'node:fs'
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'
import { mechanicBindingGaps } from '../../check-conversion-signoff.mjs'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-conversion-signoff.mjs')
let f = 0; const pass = m => console.log('  PASS  '+m); const fail = m => { console.log('  FAIL  '+m); f++ }
function run(dir, env={}) { const rd=fs.mkdtempSync(path.join(os.tmpdir(),'cro-')); const r=spawnSync('node',[GATE],{cwd:path.join(HERE,dir),env:{...process.env,REPORT_DIR:rd,...env},encoding:'utf-8'}); let rep=null; try{rep=JSON.parse(fs.readFileSync(path.join(rd,'conversion-signoff.json'),'utf-8'))}catch{} fs.rmSync(rd,{recursive:true,force:true}); return {code:r.status,ids:new Set((rep?.blockers||[]).map(b=>b.id))} }
console.log('case (a) valid signoff (0.10×2.5=0.25, signed, 5 brands) → expect exit 0')
{ const {code}=run('valid',{DS_REQUIRE_SCOPE:'1'}); code===0?pass('exit 0'):fail(`expected 0 got ${code}`) }
console.log('case (b) wrong lift_target (0.40 ≠ 0.25) → expect exit 1 + cro.lift-target-wrong')
{ const {code,ids}=run('wrong-lift',{DS_REQUIRE_SCOPE:'1'}); code===1?pass('exit 1'):fail(`expected 1 got ${code}`); ids.has('cro.lift-target-wrong')?pass('blocker: cro.lift-target-wrong'):fail(`missing (saw ${[...ids].join(', ')})`) }
console.log('case (c) missing signoff + publish-grade → expect exit 1 + cro.signoff-missing')
{ const {code,ids}=run('valid/docs',{DS_REQUIRE_SCOPE:'1'}); /* valid/docs has no catalyst-signoff.json at its cwd root */ code===1?pass('exit 1'):fail(`expected 1 got ${code}`); ids.has('cro.signoff-missing')?pass('blocker: cro.signoff-missing'):fail(`missing (saw ${[...ids].join(', ')})`) }
console.log('case (e) H2: an otherwise-valid signoff with a non-sha signoff_sha → exit 1 + cro.bad-signoff-sha')
{ const {code,ids}=run('bad-sha',{DS_REQUIRE_SCOPE:'1'}); code===1?pass('exit 1'):fail(`expected 1 got ${code}`); ids.has('cro.bad-signoff-sha')?pass('blocker: cro.bad-signoff-sha'):fail(`missing (saw ${[...ids].join(', ')})`) }
console.log('case (d) #26 mechanicBindingGaps — declared mechanic missing its render marker')
{ const gaps = mechanicBindingGaps(['free-ship-bar','sticky-atc'], 'theme with a free-shipping bar in cart'); gaps.length===1 && gaps[0]==='sticky-atc' ? pass('free-ship bound, sticky-atc unbound → 1 gap') : fail(`got ${JSON.stringify(gaps)}`) }
{ const gaps = mechanicBindingGaps(['reviews'], 'snippet loads judge.me widget'); gaps.length===0 ? pass('reviews marker present → no gap') : fail(`got ${JSON.stringify(gaps)}`) }
{ const gaps = mechanicBindingGaps(['totally-unknown-mechanic'], ''); gaps.length===0 ? pass('unknown mechanic → skipped (no false gap)') : fail(`got ${JSON.stringify(gaps)}`) }
console.log(f===0?'\nALL CASES PASS':`\n${f} FAILED`); process.exit(f?1:0)
