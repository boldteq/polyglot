// Capture the LIVE rendered HTML of each PagePilot section (by mapping decoded block IDs
// → DOM via data-block-id) so the component-card authoring agents have ground-truth markup.
//
//   node scripts/pagepilot/capture-dom.mjs            # skips pages already captured
//   node scripts/pagepilot/capture-dom.mjs --force
//
// Output (Polyglot/.research/pagepilot/dom/):
//   <slug>/<order>-<sectionType>.html   per-section rendered outerHTML (top-level blocks concatenated)
//   <slug>/_styles.txt                  inline <style> text + external stylesheet URLs (CSS strategy note)
//   _sections-index.json                [{slug,order,sectionType,name,file,blockTypes,domCoverage}]
//
// PagePilot renders Tailwind utility classes + inline styles for dynamic tokens. The captured
// HTML is grounding evidence — the authoring agents write CLEAN semantic theme-agnostic cards
// FROM it, they do not paste it verbatim.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { PAGES, shareUrl } from './pages.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const RAW = resolve(REPO, '.research', 'pagepilot', 'raw');
const DOM = resolve(REPO, '.research', 'pagepilot', 'dom');
const FORCE = process.argv.includes('--force');

async function run() {
  await mkdir(DOM, { recursive: true });
  const browser = await chromium.launch();
  const index = [];
  try {
    for (const p of PAGES) {
      const rawPath = resolve(RAW, `${p.slug}.json`);
      if (!existsSync(rawPath)) { console.log(`· ${p.slug}: no raw JSON, skip`); continue; }
      const page = JSON.parse(await readFile(rawPath, 'utf8'));
      const slugDir = resolve(DOM, p.slug);
      await mkdir(slugDir, { recursive: true });

      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
      const pg = await ctx.newPage();
      try {
        let navOk = false;
        for (let attempt = 1; attempt <= 3 && !navOk; attempt += 1) {
          try { await pg.goto(shareUrl(p.id), { waitUntil: 'domcontentloaded', timeout: 45000 }); navOk = true; }
          catch (e) { if (attempt === 3) throw e; console.log(`  ${p.slug}: goto retry ${attempt}`); await pg.waitForTimeout(2000); }
        }
        await pg.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
        await pg.waitForTimeout(4000);
        // scroll through so lazy content mounts
        await pg.evaluate(async () => { await new Promise((r) => { let y = 0; const t = setInterval(() => { window.scrollBy(0, 1000); y += 1000; if (y > document.body.scrollHeight + 1000) { clearInterval(t); window.scrollTo(0, 0); r(); } }, 100); }); }).catch(() => {});
        await pg.waitForTimeout(1500);

        // CSS strategy note
        const styles = await pg.evaluate(() => {
          const inline = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\n\n/* --- */\n\n');
          const links = Array.from(document.querySelectorAll('link[rel=stylesheet]')).map((l) => l.href);
          return { inline: inline.slice(0, 40000), links };
        });
        await writeFile(resolve(slugDir, '_styles.txt'), `EXTERNAL STYLESHEETS:\n${styles.links.join('\n')}\n\n=== INLINE <style> (truncated 40k) ===\n${styles.inline}`);

        for (const sec of page.sections) {
          const topBlockIds = (sec.blocks || []).map((b) => b.id);
          const captured = await pg.evaluate((ids) => {
            const parts = [];
            let hits = 0;
            for (const id of ids) {
              const el = document.querySelector(`[data-block-id="${id}"]`);
              if (el) { hits += 1; parts.push(el.outerHTML); }
            }
            return { html: parts.join('\n'), hits };
          }, topBlockIds);

          const file = `${String(sec.order).padStart(2, '0')}-${sec.type.replace('pagepilot_', '')}.html`;
          const blockTypes = (sec.blocks || []).map((b) => b.type);
          const header = `<!-- page=${p.slug} section#${sec.order} type=${sec.type} name="${sec.name}" domCoverage=${captured.hits}/${topBlockIds.length} -->\n`;
          await writeFile(resolve(slugDir, file), header + (captured.html || '<!-- no DOM match for this section\'s top-level blocks -->'));
          index.push({ slug: p.slug, order: sec.order, sectionType: sec.type, name: sec.name, file: `${p.slug}/${file}`, blockTypes, domCoverage: `${captured.hits}/${topBlockIds.length}` });
        }
        const cov = index.filter((i) => i.slug === p.slug);
        const full = cov.filter((i) => i.domCoverage.split('/')[0] !== '0').length;
        console.log(`✓ ${p.slug.padEnd(20)} ${cov.length} sections, ${full} with DOM match`);
      } catch (err) {
        console.log(`✗ ${p.slug}: ${err.message}`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  await writeFile(resolve(DOM, '_sections-index.json'), JSON.stringify(index, null, 2));
  console.log(`\n${index.length} sections captured → ${DOM}`);
}

run();
