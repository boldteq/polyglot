// Design Library — read-only API over the premium ecom component library so the
// workspace can BROWSE + visually PREVIEW components. Mirrors the memory.js
// dir-scan + lens.js path-traversal-guard + workspace.js TTL-cache patterns.
// Source of truth (read-only): ~/.claude/memory/design/ecom/component-library-premium
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

const router = express.Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const LIB_DIR = path.join(CLAUDE_DIR, 'memory', 'design', 'ecom', 'component-library-premium');
const COMPONENTS_DIR = path.join(LIB_DIR, 'components');
const TEMPLATES_DIR = path.join(LIB_DIR, 'templates');
const THUMBS_DIR = path.join(LIB_DIR, '.thumbs'); // pre-captured PNG previews (scripts/dl-capture-thumbs.mjs)
const TAXONOMY_FILE = path.join(LIB_DIR, '_section-taxonomy.json');
const REGISTRY_FILE = path.join(LIB_DIR, '_registry.json');
const REGISTRY_TEMPLATES_FILE = path.join(LIB_DIR, '_registry-templates.json');
const SHOTS_DIR = path.resolve(process.cwd(), '.research', 'pagepilot', 'shots');

// Stable, append-only registry numbers. Existing numbers are frozen forever; a new
// entry gets the next number (max+1) so a design can always be referenced by number.
// Components use a bare "#N" sequence; templates use a separate "T#N" sequence.
let registryByPath = {};         // component path → N  (populated by assignRegistryNumbers)
let templateRegistryByPath = {}; // template path → N  (populated by assignTemplateNumbers)
let componentUsage = {};         // component path → [{number,title,path,pageType}] templates that use it

// ── TTL cache (design assets rarely change → 5 min) ──────────────────────────
const _cache = new Map(); // key → { at, val }
const TTL_MS = 5 * 60_000;
function cached(key, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.val;
  const val = fn();
  _cache.set(key, { at: Date.now(), val });
  return val;
}

// Path-traversal guard (lens.js idiom): resolved path must stay inside `root`.
function safeResolve(root, rel) {
  if (!rel || typeof rel !== 'string' || rel.includes('\0')) return null;
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

// ── .md parsers (ground-truthed against real component files) ────────────────
// Header = everything before the first `^## ` line; bold `**Key:** value` pairs,
// `·`-separated, one or more per line.
function parseHeader(raw) {
  const idx = raw.search(/^## /m);
  const head = idx === -1 ? raw : raw.slice(0, idx);
  const lines = head.split('\n');
  const title = (lines[0] || '').replace(/^#\s*/, '').trim();
  const meta = {};
  for (const line of lines.slice(1)) {
    for (const seg of line.split(/\s+·\s+/)) {
      const m = seg.match(/^\*\*([^:*]+):\*\*\s*(.*)$/);
      if (m) meta[m[1].trim().toLowerCase()] = m[2].trim();
    }
  }
  return { title, meta };
}

// Base HTML/CSS/JS = the FIRST fence of each lang BEFORE `## Variants` (variant
// deltas after it are partial snippets that must not be concatenated).
function extractBlocks(raw) {
  const vIdx = raw.search(/^## Variants/m);
  const body = vIdx === -1 ? raw : raw.slice(0, vIdx);
  const grab = (lang) => {
    const m = body.match(new RegExp('```' + lang + '\\r?\\n([\\s\\S]*?)```'));
    return m ? m[1].replace(/\s+$/, '') : null;
  };
  return { html: grab('html'), css: grab('css'), js: grab('js') };
}

function extractSection(raw, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
  const m = raw.match(new RegExp('^## ' + esc + '\\s*\\n([\\s\\S]*?)(?=^## |\\Z)', 'm'));
  return m ? m[1].trim() : null;
}

function firstSentence(s, cap = 150) {
  if (!s) return '';
  const dot = s.search(/\.\s/);
  const out = dot > 20 && dot < cap ? s.slice(0, dot + 1) : s.slice(0, cap);
  return out.trim();
}

// ── Preview substitution (placeholder images + Liquid → demo) ────────────────
function placeholderDataUri(label) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#e9eef0"/><stop offset="1" stop-color="#d3dadd"/></linearGradient></defs>' +
    '<rect width="800" height="600" fill="url(#g)"/>' +
    '<text x="50%" y="50%" font-family="system-ui,sans-serif" font-size="34" fill="#9aa6ac" ' +
    'text-anchor="middle" dominant-baseline="middle">' + label + '</text></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function substituteForPreview(html) {
  if (!html) return '';
  const isReal = (v) => /^(https?:|data:|\/)/i.test(v);
  let out = html;
  // <img src="bare-or-relative"> → SVG placeholder
  out = out.replace(/(<img\b[^>]*?\bsrc=)(["'])(.*?)\2/gi, (m, pre, q, val) =>
    isReal(val) ? m : `${pre}${q}${placeholderDataUri('demo')}${q}`);
  // <source srcset="..."> and inline url() backgrounds
  out = out.replace(/(\bsrcset=)(["'])(.*?)\2/gi, (m, pre, q, val) =>
    isReal(val) ? m : `${pre}${q}${placeholderDataUri('demo')}${q}`);
  out = out.replace(/url\((["']?)([^'")]+)\1\)/gi, (m, q, val) =>
    isReal(val) ? m : `url(${q}${placeholderDataUri('demo')}${q})`);
  // Liquid bindings → demo values, then strip control tags
  out = out
    .replace(/\{\{\s*product\.title[^}]*\}\}/gi, 'Demo Product')
    .replace(/\{\{[^}]*\|\s*money[^}]*\}\}/gi, '$24.00')
    .replace(/\{\{\s*product\.price[^}]*\}\}/gi, '$24.00')
    .replace(/\{\{[^}]*\}\}/g, 'Demo')
    .replace(/\{%[^%]*%\}/g, '');
  return out;
}

const DEMO_TOKENS =
  ':root{--brand-accent:#2f5d34;--brand-accent-ink:#ffffff;--brand-text:#1a1f1c;' +
  '--brand-text-subdued:#5d6862;--brand-band:#f4f1ea;--brand-bg:#ffffff;--blocks-radius:14px;}';

// Honor the viewer's OS reduce-motion preference inside the preview iframe (iframes
// evaluate this media query independently against the user's system setting).
const REDUCE_MOTION_CSS =
  '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;' +
  'animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}';

// Component JS runs in a sandboxed (no-same-origin) iframe where Web Storage
// access throws. Stub localStorage/sessionStorage with an in-memory shim so a
// component's progressive-enhancement JS can't throw an uncaught error in preview.
const STORAGE_SHIM =
  '<script>(function(){try{var m={};var s={getItem:function(k){return k in m?m[k]:null},' +
  'setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},' +
  'key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}};' +
  'try{Object.defineProperty(window,"localStorage",{configurable:true,value:s})}catch(e){}' +
  'try{Object.defineProperty(window,"sessionStorage",{configurable:true,value:s})}catch(e){}}catch(e){}})();</script>';

// ── Index (taxonomy → families → categories → component metadata) ────────────
function buildIndex() {
  const tax = JSON.parse(fs.readFileSync(TAXONOMY_FILE, 'utf8'));
  const families = [];
  let componentCount = 0;
  let categoryCount = 0;
  for (const [id, fam] of Object.entries(tax.families || {})) {
    const categories = [];
    for (const cat of fam.categories || []) {
      const catDir = path.join(COMPONENTS_DIR, cat);
      if (!fs.existsSync(catDir)) continue;
      const files = fs.readdirSync(catDir).filter(
        (f) => f.endsWith('.md') && !f.startsWith('_') && !/^index-/i.test(f) && f.toLowerCase() !== 'readme.md',
      );
      const components = files.sort().map((f) => {
        const raw = fs.readFileSync(path.join(catDir, f), 'utf8');
        const { title, meta } = parseHeader(raw);
        return {
          slug: f.replace(/\.md$/, ''),
          path: `${cat}/${f}`,
          title: title || f.replace(/\.md$/, ''),
          concept: meta['concept'] || '',
          conversionJob: firstSentence(meta['conversion job'] || meta['use when'] || ''),
          source: (meta['source'] || '').split(' — ')[0].trim(),
          hasJs: /^## JS\b/m.test(raw),
        };
      });
      if (!components.length) continue;
      componentCount += components.length;
      categoryCount += 1;
      categories.push({ id: cat, label: cat.replace(/-/g, ' '), count: components.length, components });
    }
    families.push({
      id, label: fam.label, order: fam.order || 99, purpose: fam.purpose || '',
      useWhen: fam.use_when || '', categories,
    });
  }
  families.sort((a, b) => a.order - b.order);
  assignRegistryNumbers(families); // stamp `number` on each component (#1, #2, …)
  let screenshots = 0;
  try { screenshots = fs.readdirSync(SHOTS_DIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).length; } catch { /* none */ }
  let templates = 0;
  try { templates = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.md') && !f.startsWith('_') && !/^index/i.test(f) && f.toLowerCase() !== 'readme.md').length; } catch { /* none */ }
  return {
    families,
    counts: { components: componentCount, categories: categoryCount, families: families.length, screenshots, templates },
  };
}

// Assign a stable, append-only registry number to every component and persist it.
// Numbers follow first-seen catalog order (#1 = first displayed component) and are
// NEVER reassigned; a new component gets the next number. Stamps `c.number` on each
// meta and refreshes the module-level `registryByPath` lookup (used by /component).
function assignRegistryNumbers(families) {
  let reg = { version: 1, next: 1, byPath: {} };
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.byPath && typeof parsed.next === 'number') reg = parsed;
  } catch { /* no registry yet → start fresh */ }

  let dirty = false;
  for (const fam of families) {
    for (const cat of fam.categories) {
      for (const c of cat.components) {
        if (reg.byPath[c.path] == null) { reg.byPath[c.path] = reg.next++; dirty = true; }
        c.number = reg.byPath[c.path];
      }
    }
  }

  registryByPath = reg.byPath;
  if (dirty) {
    try {
      fs.writeFileSync(REGISTRY_FILE + '.tmp', JSON.stringify(reg, null, 2));
      fs.renameSync(REGISTRY_FILE + '.tmp', REGISTRY_FILE);
    } catch { /* read-only FS → keep in-memory numbers, UI still works */ }
  }
}

// ── Templates (full-page recipes: header meta + ordered section→component map) ─
// A template .md is NOT renderable HTML — it's a composition spec. We surface its
// metadata + the section list, linking each mapped section to its component's #N.
function normPageType(s) {
  const m = (s || '').match(/[A-Za-z]+/);
  const t = m ? m[0].toUpperCase() : '';
  return t || 'OTHER';
}

function parseTemplate(raw) {
  const hIdx = raw.search(/^## /m);
  const head = hIdx === -1 ? raw : raw.slice(0, hIdx);
  const lines = head.split('\n');
  // Title minus the "# Template — " prefix and the redundant trailing page-type
  // token (it's shown as its own badge, e.g. "Beauty/Skincare 1 LANDING" → "…1").
  const title = (lines[0] || '')
    .replace(/^#\s*/, '')
    .replace(/^Template\s*[—-]\s*/i, '')
    .replace(/\s+(LANDING|PDP|HOMEPAGE|HOME\s*PAGE)\s*$/i, '')
    .trim();
  const meta = {};
  for (const line of lines.slice(1)) {
    const m = line.match(/^\*\*([^:*]+):\*\*\s*(.*)$/);
    if (m) meta[m[1].trim().toLowerCase()] = m[2].trim();
  }
  // First prose paragraph in the header (not a heading, not a **Key:** line).
  let description = '';
  for (const line of lines.slice(1)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || /^\*\*[^:*]+:\*\*/.test(t)) { if (description) break; continue; }
    description += (description ? ' ' : '') + t;
  }
  description = description.replace(/\s+/g, ' ').slice(0, 320).trim();
  const slug = (meta['slug'] || '').replace(/`/g, '').trim();
  // Section → component mapping table. Templates use THREE heading variants
  // ("Ordered section list", "Ordered section map", "Section order → …"), THREE
  // component-path cell formats (plain `x`, "variant-of `x`", "[x](../components/x)"),
  // and 5- or 6-column tables — handle all of them.
  const sections = [];
  const sIdx = raw.search(/^##.*(ordered section|section order)/mi);
  if (sIdx !== -1) {
    for (const ln of raw.slice(sIdx).split('\n')) {
      if (!/^\s*\|/.test(ln)) { if (sections.length) break; else continue; }
      const cells = ln.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length < 5 || !/^\d+$/.test(cells[0])) continue; // skip header/sep/non-numbered rows
      const pm = cells[2].match(/([\w-]+\/[\w.-]+\.md)/); // first "<category>/<file>.md" in any format
      const componentPath = pm ? pm[1] : cells[2].replace(/`/g, '').trim();
      sections.push({
        index: Number(cells[0]),
        section: cells[1],
        componentPath,
        componentNumber: registryByPath[componentPath] ?? null,
        concept: cells[3] || '',
        rung: cells[4] || '',
        status: cells[5] || '',
      });
    }
  }
  // Page type: prefer the explicit field; else infer from the slug / raw title
  // (e.g. "…-pdp" slug or "… PDP …" title) so nothing falls back to "OTHER".
  let pageType = normPageType(meta['page type']);
  if (!['LANDING', 'PDP', 'HOMEPAGE'].includes(pageType)) {
    const hay = (slug + ' ' + (lines[0] || '')).toLowerCase();
    if (/\bpdp\b/.test(hay)) pageType = 'PDP';
    else if (/home\s*-?page|homepage/.test(hay)) pageType = 'HOMEPAGE';
    else if (/\blanding\b/.test(hay)) pageType = 'LANDING';
  }
  return {
    title: title || '(untitled template)',
    slug,
    url: (meta['url'] || '').match(/https?:\/\/\S+/)?.[0] || '',
    niche: (meta['niche'] || '').split(/\s+[—(]/)[0].trim(),
    pageType,
    description,
    sections,
  };
}

function buildTemplateIndex() {
  cached('dl:index', buildIndex); // ensure component numbers are loaded for mapping
  let files = [];
  try {
    files = fs.readdirSync(TEMPLATES_DIR).filter(
      (f) => f.endsWith('.md') && !f.startsWith('_') && !/^index/i.test(f) && f.toLowerCase() !== 'readme.md',
    );
  } catch { files = []; }
  const parsed = files.sort().map((f) => {
    const t = parseTemplate(fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8'));
    const meta = { path: f, slug: t.slug || f.replace(/\.md$/, ''), title: t.title, url: t.url, niche: t.niche, pageType: t.pageType, sectionCount: t.sections.length, description: t.description };
    return { meta, sections: t.sections };
  });
  const templates = parsed.map((p) => p.meta);
  assignTemplateNumbers(templates);
  // Reverse index: which templates use each component (dedup per template so a
  // section appearing 4× in one page still counts as "used in 1 template").
  const usage = {};
  for (const { meta, sections } of parsed) {
    const seen = new Set();
    for (const s of sections) {
      if (!s.componentPath || seen.has(s.componentPath)) continue;
      seen.add(s.componentPath);
      (usage[s.componentPath] = usage[s.componentPath] || []).push({ number: meta.number, title: meta.title, path: meta.path, pageType: meta.pageType });
    }
  }
  for (const k of Object.keys(usage)) usage[k].sort((a, b) => a.number - b.number);
  componentUsage = usage;
  const byType = {};
  for (const t of templates) byType[t.pageType] = (byType[t.pageType] || 0) + 1;
  return { templates, counts: { templates: templates.length, byType } };
}

// Stable, append-only "T#N" numbers for templates (separate sequence from components).
function assignTemplateNumbers(templates) {
  let reg = { version: 1, next: 1, byPath: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(REGISTRY_TEMPLATES_FILE, 'utf8'));
    if (parsed && parsed.byPath && typeof parsed.next === 'number') reg = parsed;
  } catch { /* none yet */ }
  let dirty = false;
  for (const t of templates) {
    if (reg.byPath[t.path] == null) { reg.byPath[t.path] = reg.next++; dirty = true; }
    t.number = reg.byPath[t.path];
  }
  templateRegistryByPath = reg.byPath;
  if (dirty) {
    try {
      fs.writeFileSync(REGISTRY_TEMPLATES_FILE + '.tmp', JSON.stringify(reg, null, 2));
      fs.renameSync(REGISTRY_TEMPLATES_FILE + '.tmp', REGISTRY_TEMPLATES_FILE);
    } catch { /* read-only FS → keep in-memory numbers */ }
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────
router.get('/design-library/index', (req, res) => {
  try {
    res.set('Cache-Control', 'private, max-age=120').json(cached('dl:index', buildIndex));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read component library', detail: err.message });
  }
});

router.get('/design-library/component', (req, res) => {
  const rel = typeof req.query.path === 'string' ? req.query.path : '';
  const abs = safeResolve(COMPONENTS_DIR, rel);
  if (!abs || !abs.endsWith('.md')) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Component not found' });
  try {
    cached('dl:templates', buildTemplateIndex); // ensure the reverse usage map is built
    const data = cached('dl:cmp:' + rel, () => {
      const raw = fs.readFileSync(abs, 'utf8');
      const { title, meta } = parseHeader(raw);
      const { html, css, js } = extractBlocks(raw);
      return {
        path: rel, title,
        number: registryByPath[rel] ?? null,
        usedIn: componentUsage[rel] || [],
        meta: {
          category: meta['category'] || '',
          concept: meta['concept'] || '',
          sectionFamily: meta['section family'] || '',
          useWhen: meta['use when'] || '',
          conversionJob: meta['conversion job'] || '',
          source: meta['source'] || '',
          layout: extractSection(raw, 'Layout'),
          bindings: extractSection(raw, 'Design-system bindings'),
          honesty: extractSection(raw, 'Schema contract'),
        },
        html, css, js, hasJs: !!js, demo: true,
      };
    });
    res.set('Cache-Control', 'private, max-age=300').json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read component', detail: err.message });
  }
});

// Full HTML document for an <iframe src=…> preview (placeholder/demo data baked in).
router.get('/design-library/preview', (req, res) => {
  const rel = typeof req.query.path === 'string' ? req.query.path : '';
  const abs = safeResolve(COMPONENTS_DIR, rel);
  if (!abs || !abs.endsWith('.md') || !fs.existsSync(abs)) return res.status(404).send('Not found');
  // `?static=1` (used by grid cards) renders HTML+CSS only — no component JS — so the
  // 200+ grid iframes don't run carousels/countdowns/timers (CPU + motion). Drawers omit it → interactive.
  const isStatic = req.query.static === '1';
  try {
    const doc = cached('dl:prev:' + rel + (isStatic ? ':s' : ''), () => {
      const raw = fs.readFileSync(abs, 'utf8');
      const { html, css, js } = extractBlocks(raw);
      const body = substituteForPreview(html || '<p style="padding:2rem;color:#9aa6ac;font:14px system-ui">No HTML block.</p>');
      return (
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' + STORAGE_SHIM +
        '<style>' + DEMO_TOKENS + REDUCE_MOTION_CSS + ' *,*::before,*::after{box-sizing:border-box} html,body{margin:0}' +
        ' body{font-family:system-ui,-apple-system,sans-serif;color:#1a1f1c;background:#fff}</style>' +
        '<style>' + (css || '') + '</style></head><body>' + body +
        (!isStatic && js ? '<script>try{\n' + js + '\n}catch(e){}</script>' : '') + '</body></html>'
      );
    });
    res.type('html').set('Cache-Control', 'private, max-age=300').send(doc);
  } catch (err) {
    res.status(500).send('Failed to render preview');
  }
});

router.get('/design-library/shots', (req, res) => {
  try {
    const list = cached('dl:shots', () => {
      let files = [];
      try { files = fs.readdirSync(SHOTS_DIR); } catch { files = []; }
      return files
        .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
        .sort()
        .map((f) => {
          const base = f.replace(/\.(png|jpe?g|webp)$/i, '');
          return {
            file: f,
            viewport: /mobile/i.test(base) ? 'mobile' : 'desktop',
            label: base.replace(/^pagepilot-/, '').replace(/-(desktop|mobile)$/i, '').replace(/-/g, ' '),
          };
        });
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list screenshots' });
  }
});

// Pre-captured PNG thumbnail for a card (crisp + zero iframes). 404 if not yet
// captured → the frontend falls back to the live static iframe preview.
router.get('/design-library/thumb', (req, res) => {
  const kind = req.query.kind === 'template' ? 'templates' : 'components';
  const rel = typeof req.query.path === 'string' ? req.query.path : '';
  if (!rel || rel.includes('\0')) return res.status(400).end();
  const abs = safeResolve(path.join(THUMBS_DIR, kind), rel.replace(/\//g, '__') + '.png');
  if (!abs || !abs.endsWith('.png') || !fs.existsSync(abs)) return res.status(404).end();
  res.type('png').set('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(abs).pipe(res);
});

router.get('/design-library/shot', (req, res) => {
  const file = typeof req.query.file === 'string' ? req.query.file : '';
  const abs = safeResolve(SHOTS_DIR, file);
  if (!abs || !/\.(png|jpe?g|webp)$/i.test(abs)) return res.status(403).end();
  if (!fs.existsSync(abs)) return res.status(404).end();
  res.type(path.extname(abs).slice(1));
  res.set('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(abs).pipe(res);
});

router.get('/design-library/templates', (req, res) => {
  try {
    res.set('Cache-Control', 'private, max-age=120').json(cached('dl:templates', buildTemplateIndex));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read templates', detail: err.message });
  }
});

// Composed full-page preview: stack the mapped components' HTML/CSS/JS in section
// order into ONE document (a full page literally IS its sections stacked).
router.get('/design-library/template-preview', (req, res) => {
  const rel = typeof req.query.path === 'string' ? req.query.path : '';
  const abs = safeResolve(TEMPLATES_DIR, rel);
  if (!abs || !abs.endsWith('.md') || !fs.existsSync(abs)) return res.status(404).send('Not found');
  const isStatic = req.query.static === '1'; // grid cards → no JS (perf + motion); drawer → interactive
  try {
    const doc = cached('dl:tplprev:' + rel + (isStatic ? ':s' : ''), () => {
      const t = parseTemplate(fs.readFileSync(abs, 'utf8'));
      const css = [];
      const bodies = [];
      const scripts = [];
      for (const s of t.sections) {
        const cAbs = safeResolve(COMPONENTS_DIR, s.componentPath);
        if (!cAbs || !cAbs.endsWith('.md') || !fs.existsSync(cAbs)) continue;
        const blk = extractBlocks(fs.readFileSync(cAbs, 'utf8'));
        // Scope each section's CSS to its own data-tpl-section wrapper so global
        // resets (body, h2, a, etc.) in one section don't cascade into adjacent ones.
        if (blk.css) css.push('@scope ([data-tpl-section="' + s.index + '"]) {\n' + blk.css + '\n}');
        if (blk.html) bodies.push('<section data-tpl-section="' + s.index + '">' + substituteForPreview(blk.html) + '</section>');
        // Each section's JS goes in its OWN <script> + IIFE so a syntax error or a
        // top-level name collision in one section can't break the others.
        if (!isStatic && blk.js) scripts.push('<script>(function(){try{\n' + blk.js + '\n}catch(e){}})();</script>');
      }
      const body = bodies.length ? bodies.join('\n') : '<p style="padding:2rem;color:#9aa6ac;font:14px system-ui">No renderable sections.</p>';
      return (
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' + STORAGE_SHIM +
        '<style>' + DEMO_TOKENS + REDUCE_MOTION_CSS + ' *,*::before,*::after{box-sizing:border-box} html,body{margin:0}' +
        ' body{font-family:system-ui,-apple-system,sans-serif;color:#1a1f1c;background:#fff}</style>' +
        '<style>' + css.join('\n') + '</style></head><body>' + body + scripts.join('\n') + '</body></html>'
      );
    });
    res.type('html').set('Cache-Control', 'private, max-age=300').send(doc);
  } catch (err) {
    res.status(500).send('Failed to render template preview');
  }
});

router.get('/design-library/template', (req, res) => {
  const rel = typeof req.query.path === 'string' ? req.query.path : '';
  const abs = safeResolve(TEMPLATES_DIR, rel);
  if (!abs || !abs.endsWith('.md')) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Template not found' });
  try {
    const data = cached('dl:tmpl:' + rel, () => {
      cached('dl:templates', buildTemplateIndex); // ensure component + template #N maps
      const t = parseTemplate(fs.readFileSync(abs, 'utf8'));
      return { path: rel, number: templateRegistryByPath[rel] ?? null, ...t };
    });
    res.set('Cache-Control', 'private, max-age=300').json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read template', detail: err.message });
  }
});

module.exports = router;
