// Fetch + decode every PagePilot share page in pages.mjs into the grounding cache.
//
//   node scripts/pagepilot/fetch-all.mjs          # idempotent: overwrites raw JSON
//   node scripts/pagepilot/fetch-all.mjs --force   # also re-fetch even if cached payload exists
//
// Output (Polyglot/.research/pagepilot/):
//   raw/<slug>.json       normalized clean page (order + sections + blocks + colorPreset)
//   raw/<slug>.turbo.txt  original turbo-stream payload (provenance / re-decode without re-fetch)
//   _manifest.json        [{slug,id,name,fetchedAt,sectionCount,blockCount,decodeOk,note}]
//
// Deterministic: the workflow asserts _manifest.json.every(decodeOk) before dispatching agents.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PAGES, dataUrl } from './pages.mjs';
import { decodeTurboStream, extractPage, normalizePage } from './decode.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const OUT = resolve(REPO, '.research', 'pagepilot');
const RAW = resolve(OUT, 'raw');
const FORCE = process.argv.includes('--force');

async function fetchData(id) {
  const res = await fetch(dataUrl(id), { headers: { Accept: 'text/x-script,*/*' } });
  const ct = res.headers.get('content-type') || '';
  const body = await res.text();
  return { status: res.status, ct, body };
}

async function run() {
  await mkdir(RAW, { recursive: true });
  const manifest = [];

  for (const p of PAGES) {
    const turboPath = resolve(RAW, `${p.slug}.turbo.txt`);
    const jsonPath = resolve(RAW, `${p.slug}.json`);
    const entry = { slug: p.slug, id: p.id, name: p.name, fetchedAt: new Date().toISOString(), sectionCount: 0, blockCount: 0, decodeOk: false, note: '' };

    try {
      let payload;
      if (!FORCE && existsSync(turboPath)) {
        payload = await readFile(turboPath, 'utf8');
        entry.note = 'used cached payload';
      } else {
        const { status, ct, body } = await fetchData(p.id);
        if (status !== 200) { entry.note = `HTTP ${status}`; manifest.push(entry); console.log(`✗ ${p.slug}: HTTP ${status}`); continue; }
        if (!/x-script|json|text/.test(ct)) entry.note = `unexpected content-type ${ct}`;
        payload = body;
        await writeFile(turboPath, payload);
      }

      const root = decodeTurboStream(payload);
      const page = extractPage(root);
      if (!page) { entry.note = (entry.note ? entry.note + '; ' : '') + 'page object not found (shape drift)'; manifest.push(entry); console.log(`✗ ${p.slug}: page object not found`); continue; }

      const normalized = normalizePage(page);
      const out = { slug: p.slug, shareUrl: `https://app.pagepilot.ai/share/${p.id}`, nicheGuess: p.niche, fetchedAt: entry.fetchedAt, ...normalized };
      await writeFile(jsonPath, JSON.stringify(out, null, 2));

      entry.sectionCount = normalized.sectionCount;
      entry.blockCount = normalized.blockCount;
      entry.decodeOk = normalized.sectionCount > 0;
      manifest.push(entry);
      console.log(`✓ ${p.slug.padEnd(20)} "${normalized.name}"  sections=${normalized.sectionCount} blocks=${normalized.blockCount}`);
    } catch (err) {
      entry.note = `decode error: ${err.message}`;
      manifest.push(entry);
      console.log(`✗ ${p.slug}: ${err.message}`);
    }
  }

  await writeFile(resolve(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2));
  const ok = manifest.filter((m) => m.decodeOk).length;
  console.log(`\n${ok}/${manifest.length} pages decoded OK → ${OUT}`);
  if (ok !== manifest.length) process.exitCode = 1;
}

run();
