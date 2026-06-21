#!/usr/bin/env node
// orbit-measure — the WRITER for docs/results/<label>.{json,md} (parseBaselineMd.js was an
// orphan reader; this feeds it). Pulls the 6 ecom KPIs (sitewide/PDP CVR, ATC rate,
// cart-abandon, AOV, bounce) from GA4 Data API + Shopify Analytics, attaches the dossier
// lift_target + the sample-sufficiency confidence flag (REPORTABLE/DIRECTIONAL/INSUFFICIENT
// per ecom-conversion-results-loop.md §1), and writes both a machine JSON (for
// catalyst-verdict) and a human .md (for the Workspace dashboard).
//
// GRACEFUL DEGRADE: real numbers need GA4 Data API creds + a Shopify read_orders token
// (porter's token deliberately lacks orders scope). When those env vars are absent it writes
// an HONEST scaffold (confidence:INSUFFICIENT + the missing-creds reason) so the loop still
// runs end-to-end and catalyst-verdict returns HOLD-INSUFFICIENT rather than a fake lift.
// The real pull is validated at the dogfood.
//
// Env: RESULTS_LABEL (baseline|d30|d90) · STORE · GA4_PROPERTY_ID + GA4_CREDENTIALS_JSON ·
//      SHOPIFY_ANALYTICS_TOKEN (read_orders) · DOSSIER (path to research-dossier for lift_target)
// Usage: RESULTS_LABEL=d30 STORE=acme.myshopify.com node orbit-measure.mjs --dir <repo>

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const o = { dir: process.cwd(), resultsDir: null, label: process.env.RESULTS_LABEL || 'baseline', store: process.env.STORE || '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') o.dir = argv[++i];
    else if (a === '--results-dir') o.resultsDir = argv[++i];
    else if (a === '--label') o.label = argv[++i];
    else if (a === '--store') o.store = argv[++i];
  }
  return o;
}

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }

// Read the dossier lift_target (orbit copies it into every results file so catalyst-verdict
// is self-contained). Falls back to null if no dossier.
function readLiftTarget(dir) {
  for (const rel of ['docs/research-dossier.json', 'docs/discovery/goals.json']) {
    const j = readJson(path.join(dir, rel));
    if (j) return j.lift_targets || j.lift_target || (j.conversion && { sitewide_cvr: numOrNull(j.conversion.cvr_lift_target) }) || null;
  }
  return null;
}
function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

// Pull real KPIs. Returns null when creds are absent (→ honest scaffold).
async function pullRealKpis() {
  const hasGa4 = process.env.GA4_PROPERTY_ID && process.env.GA4_CREDENTIALS_JSON;
  const hasShopify = process.env.SHOPIFY_ANALYTICS_TOKEN;
  if (!hasGa4 && !hasShopify) return null;
  // Real GA4 Data API + Shopify Analytics pull is wired at the dogfood (needs the live creds).
  // Intentionally not faking numbers here — if a caller supplies creds, implement the fetch.
  // For now, even WITH creds we surface that the live fetch is the dogfood step, never invent data.
  return { _note: 'live GA4/Shopify fetch is the dogfood step — creds present but fetch not run in this hermetic context', confidence: 'INSUFFICIENT' };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const resultsDir = o.resultsDir || path.join(o.dir, 'docs', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });

  const liftTarget = readLiftTarget(o.dir);
  const real = await pullRealKpis();

  const measured = real && real.kpis ? real : null;
  const confidence = measured ? (real.confidence || 'DIRECTIONAL') : 'INSUFFICIENT';
  const reason = measured ? null : 'no GA4 Data API creds (GA4_PROPERTY_ID + GA4_CREDENTIALS_JSON) and/or Shopify read_orders token (SHOPIFY_ANALYTICS_TOKEN) — measurement is the dogfood step; not inventing numbers.';

  const out = {
    label: o.label,
    store: o.store || null,
    measured_at: process.env.MEASURE_TS || null, // caller stamps (Date.now() unavailable in some contexts)
    kpis: measured ? measured.kpis : {},          // {cvr, pdp_cvr, atc_rate, cart_abandon, aov, bounce}
    lift_target: liftTarget,
    confidence,
    reason,
    source: measured ? 'ga4+shopify' : 'none',
  };
  const jsonPath = path.join(resultsDir, `${o.label}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(out, null, 2)}\n`);

  // Human .md (parseBaselineMd.js + the Workspace dashboard render this).
  const md = [
    `# Results — ${o.label}${o.store ? ` · ${o.store}` : ''}`,
    '',
    `**Confidence:** ${confidence}${reason ? `  ·  ${reason}` : ''}`,
    '',
    '| KPI | Value |',
    '|---|---|',
    ...['cvr', 'pdp_cvr', 'atc_rate', 'cart_abandon', 'aov', 'bounce'].map(k => `| ${k} | ${measured ? (measured.kpis?.[k] ?? '—') : '—'} |`),
    '',
    liftTarget ? `**Dossier lift_target:** ${JSON.stringify(liftTarget)}` : '_no dossier lift_target found_',
  ].join('\n');
  fs.writeFileSync(path.join(resultsDir, `${o.label}.md`), `${md}\n`);

  console.log(`orbit-measure: wrote ${o.label}.json (confidence=${confidence}) → ${jsonPath}`);
  process.exit(0);
}

main();
