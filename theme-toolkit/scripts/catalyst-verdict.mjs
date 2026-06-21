#!/usr/bin/env node
// catalyst-verdict — the post-publish CRO accountability decision (parallel to verdict's
// SaaS SCALE/PIVOT/KILL). Reads orbit's measured results (docs/results/<label>.json +
// baseline.json) → computes live lift vs the dossier lift_target → emits an OWNED verdict:
//   SCALE-CRO            — live lift ≥ 60% of target (the build converts; pour traffic in)
//   PIVOT-surface        — 30–60% of target (the build helped but a surface underperforms)
//   KILL-CRO-investment  — < 30% of target (CRO isn't the bottleneck — traffic/PMF is)
//   HOLD-INSUFFICIENT    — orbit flagged the sample INSUFFICIENT (no verdict on noise)
//
// Pure: reads JSON, writes docs/results/verdict-<label>.json, prints one line. Never a gate
// (exit 0). Real numbers come from orbit-measure (live store + analytics, the dogfood); this
// script is fully fixture-testable. Contract: ecom-conversion-results-loop.md §2/§3.
//
// Usage: RESULTS_LABEL=d30 node catalyst-verdict.mjs   (label ∈ d30 | d90; default d30)
//        --dir <repo>  --results-dir <docs/results>

import fs from 'node:fs';
import path from 'node:path';

const GOOD_BAR = 0.60; // live lift must reach ≥60% of the dossier target to SCALE
const PIVOT_FLOOR = 0.30;

function parseArgs(argv) {
  const o = { dir: process.cwd(), resultsDir: null, label: process.env.RESULTS_LABEL || 'd30' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') o.dir = argv[++i];
    else if (a === '--results-dir') o.resultsDir = argv[++i];
    else if (a === '--label') o.label = argv[++i];
  }
  return o;
}

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }

// live lift = (current − baseline) / baseline, expressed as a fraction (0.18 = +18%).
function liftPct(current, baseline) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return null;
  return (current - baseline) / baseline;
}

function decide({ ratio, confidence }) {
  if (confidence === 'INSUFFICIENT') {
    return { verdict: 'HOLD-INSUFFICIENT', reason: 'sample below the verdict threshold — report leading indicators (ATC rate, bounce) + extend the window; a low-traffic store has a traffic problem before a CVR problem.' };
  }
  if (ratio == null) return { verdict: 'HOLD-INSUFFICIENT', reason: 'no comparable baseline/current CVR to compute lift.' };
  if (ratio >= GOOD_BAR) return { verdict: 'SCALE-CRO', reason: `live lift reached ${(ratio * 100).toFixed(0)}% of the dossier target (≥${GOOD_BAR * 100}%) — the build converts; scale traffic.` };
  if (ratio >= PIVOT_FLOOR) return { verdict: 'PIVOT-surface', reason: `live lift is ${(ratio * 100).toFixed(0)}% of target (${PIVOT_FLOOR * 100}–${GOOD_BAR * 100}%) — iterate the weakest surface (lowest per-surface lift), then re-measure.` };
  return { verdict: 'KILL-CRO-investment', reason: `live lift is ${(ratio * 100).toFixed(0)}% of target (<${PIVOT_FLOOR * 100}%) — CRO is not the bottleneck; route to echo (traffic quality) / product-market fit, stop pouring CRO effort.` };
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const resultsDir = o.resultsDir || path.join(o.dir, 'docs', 'results');
  const cur = readJson(path.join(resultsDir, `${o.label}.json`));
  const base = readJson(path.join(resultsDir, 'baseline.json'));

  if (!cur) {
    console.error(`catalyst-verdict: no ${o.label}.json in ${resultsDir} — run orbit-measure first.`);
    process.exit(2);
  }

  // Headline = sitewide CVR. lift_target is carried per-surface from the dossier (orbit copies it in).
  const targetPct = Number(cur.lift_target?.sitewide_cvr ?? cur.lift_target?.cvr ?? cur.lift_target);
  const curCvr = Number(cur.kpis?.cvr ?? cur.kpis?.sitewide_cvr);
  const baseCvr = Number((base?.kpis?.cvr ?? base?.kpis?.sitewide_cvr) ?? cur.baseline?.cvr);
  const live = liftPct(curCvr, baseCvr);
  const ratio = (live != null && Number.isFinite(targetPct) && targetPct !== 0) ? live / targetPct : null;
  const confidence = cur.confidence || base?.confidence || 'DIRECTIONAL';

  const { verdict, reason } = decide({ ratio, confidence });

  // Per-surface lift (so PIVOT-surface can name the weakest one).
  const perSurface = {};
  for (const k of ['cvr', 'pdp_cvr', 'atc_rate', 'cart_abandon', 'aov', 'bounce']) {
    const c = Number(cur.kpis?.[k]); const b = Number(base?.kpis?.[k]);
    const l = liftPct(c, b);
    if (l != null) perSurface[k] = Number((l * 100).toFixed(1));
  }

  const out = {
    label: o.label,
    verdict,
    reason,
    ratio: ratio != null ? Number(ratio.toFixed(3)) : null,
    live_lift_pct: live != null ? Number((live * 100).toFixed(1)) : null,
    lift_target_pct: Number.isFinite(targetPct) ? Number((targetPct * 100).toFixed(1)) : null,
    confidence,
    per_surface_lift_pct: perSurface,
    good_bar: GOOD_BAR,
    measured_at: cur.measured_at || null,
  };

  fs.mkdirSync(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, `verdict-${o.label}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`catalyst-verdict: ${verdict} (${o.label}) — ${reason} → ${outPath}`);
  process.exit(0);
}

main();
