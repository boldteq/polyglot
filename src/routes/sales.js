// Sales Desk API — reads Sway's deal/corpus files from ~/.claude/memory/sales and
// scores a drafted reply against the matching sales golden case (the "auto-scoring loop":
// the Sales Desk situation IS the task_type). Filesystem-read pattern mirrors agents.js;
// the judge is reached via a dynamic ESM import (same bridge as learning.js / health.js).
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

const SALES_DIR = path.join(os.homedir(), '.claude', 'memory', 'sales', 'shopify-website');
const DEALS_DIR = path.join(SALES_DIR, 'deals');
const CORPUS_DIR = path.join(SALES_DIR, 'client-chat-corpus');
const RUNS_LOG = path.join(__dirname, '..', '..', 'data', 'intel', 'eval-runs.jsonl');
// Dedicated, richer sales-desk score log (reply + reasoning + per-dimension scores).
// Kept SEPARATE from the shared eval/calibration corpus (RUNS_LOG) so the drill-in
// view never pollutes governor/calibration reads.
const SALES_SCORES_LOG = path.join(__dirname, '..', '..', 'data', 'intel', 'sales-scores.jsonl');
// Server-backed draft history (replaces fragile per-browser localStorage) — durable + cross-device.
const SALES_DRAFTS_LOG = path.join(__dirname, '..', '..', 'data', 'intel', 'sales-drafts.jsonl');
function readDrafts() {
  if (!fs.existsSync(SALES_DRAFTS_LOG)) return [];
  const out = [];
  for (const l of fs.readFileSync(SALES_DRAFTS_LOG, 'utf-8').trim().split('\n').filter(Boolean)) {
    try { out.push(JSON.parse(l)); } catch { /* skip */ }
  }
  return out;
}
function writeDrafts(arr) {
  if (!fs.existsSync(path.dirname(SALES_DRAFTS_LOG))) fs.mkdirSync(path.dirname(SALES_DRAFTS_LOG), { recursive: true });
  fs.writeFileSync(SALES_DRAFTS_LOG, arr.map(d => JSON.stringify(d)).join('\n') + (arr.length ? '\n' : ''));
}

const VALID_OUTCOMES = ['WON', 'LOST', 'OPEN'];
function normalizeOutcome(o) {
  const s = String(o || '').trim().toUpperCase();
  if (s.startsWith('WON') || s.startsWith('CLOSED-WON') || s === 'SIGNED') return 'WON';
  if (s.startsWith('LOST') || s.startsWith('CLOSED-LOST') || s === 'DEAD') return 'LOST';
  return 'OPEN';
}
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || `deal-${Date.now().toString(36)}`;
}
function uniqueDealSlug(base) {
  let slug = base, i = 2;
  while (fs.existsSync(path.join(DEALS_DIR, `${slug}.md`))) slug = `${base}-${i++}`;
  return slug;
}
function buildDealMd({ title, niche, stage, outcome }) {
  return [
    `# Deal — ${title}`, '',
    `**Niche:** ${niche || '—'}`,
    `**Stage:** ${stage || '—'}`,
    `**Outcome:** ${normalizeOutcome(outcome)}`, '',
    `_Created from the Sales Desk on ${new Date().toISOString().slice(0, 10)}._`, '',
  ].join('\n');
}

// Sales Desk situation id → golden case id (the 7 situations map 1:1 to sales-*.json).
const SITUATION_TO_CASE = {
  discovery_qualification: 'sales-discovery-qualification',
  objection_price: 'sales-objection-price',
  competitive_defense: 'sales-competitive-defense',
  trust_risk_reversal: 'sales-trust-risk-reversal',
  proof_deployment: 'sales-proof-deployment',
  honesty_no_fabrication: 'sales-honesty-no-fabrication',
  close: 'sales-close-calibrated',
};

function field(body, re) { const m = body.match(re); return m ? m[1].trim() : null; }

function parseDeal(file) {
  const body = fs.readFileSync(path.join(DEALS_DIR, file), 'utf-8');
  const slug = file.replace(/\.md$/, '');
  const h1 = body.match(/^#\s+(.+)$/m);
  return {
    slug,
    title: h1 ? h1[1].replace(/^Deal\s*—\s*/, '').trim() : slug,
    niche: field(body, /\*\*Niche:\*\*\s*([^\n]+)/i),
    stage: field(body, /\*\*Stage:\*\*\s*([^\n]+)/i),
    outcome: (field(body, /\*\*Outcome:\*\*\s*([^\n]+)/i) || 'OPEN').split(/\s|\(/)[0].toUpperCase(),
  };
}

// GET /api/sales/deals — list deal files (skip _README / _ACTIVE).
router.get('/sales/deals', (req, res) => {
  try {
    if (!fs.existsSync(DEALS_DIR)) return res.json({ deals: [] });
    const files = fs.readdirSync(DEALS_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
    const deals = files.map(f => { try { return parseDeal(f); } catch { return null; } }).filter(Boolean);
    res.json({ deals });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/sales/deals/:slug — full deal file content.
router.get('/sales/deals/:slug', (req, res) => {
  const slug = String(req.params.slug).replace(/[^a-z0-9-]/gi, '');
  const p = path.join(DEALS_DIR, `${slug}.md`);
  if (!slug || !fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  res.json({ slug, content: fs.readFileSync(p, 'utf-8') });
});

// POST /api/sales/deals { title, niche?, stage?, outcome? } — create a deal file (never overwrites).
router.post('/sales/deals', express.json({ limit: '64kb' }), (req, res) => {
  const { title, niche, stage, outcome } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
  try {
    if (!fs.existsSync(DEALS_DIR)) fs.mkdirSync(DEALS_DIR, { recursive: true });
    const slug = uniqueDealSlug(slugify(title));
    fs.writeFileSync(path.join(DEALS_DIR, `${slug}.md`), buildDealMd({ title: String(title).trim().slice(0, 120), niche, stage, outcome }));
    res.json({ ok: true, deal: parseDeal(`${slug}.md`) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/sales/deals/:slug { outcome } — update a deal's outcome (WON | LOST | OPEN).
router.patch('/sales/deals/:slug', express.json({ limit: '16kb' }), (req, res) => {
  const slug = String(req.params.slug).replace(/[^a-z0-9-]/gi, '');
  const p = path.join(DEALS_DIR, `${slug}.md`);
  if (!slug || !fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  const outcome = normalizeOutcome((req.body || {}).outcome);
  try {
    let body = fs.readFileSync(p, 'utf-8');
    // replacer function: `outcome` is free text a user types about a client chat, so a stray "$&" or
    // "$`" in it would expand instead of being written (the HYG-1 corruption class).
    if (/\*\*Outcome:\*\*\s*[^\n]*/i.test(body)) body = body.replace(/\*\*Outcome:\*\*\s*[^\n]*/i, () => `**Outcome:** ${outcome}`);
    else body += `\n**Outcome:** ${outcome}\n`;
    fs.writeFileSync(p, body);
    res.json({ ok: true, deal: parseDeal(`${slug}.md`) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/sales/deals/:slug — permanently remove a deal file.
router.delete('/sales/deals/:slug', (req, res) => {
  const slug = String(req.params.slug).replace(/[^a-z0-9-]/gi, '');
  const p = path.join(DEALS_DIR, `${slug}.md`);
  if (!slug || !fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  try { fs.unlinkSync(p); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/sales/corpus — ingested chats (files in the corpus, excluding scaffolding).
router.get('/sales/corpus', (req, res) => {
  try {
    if (!fs.existsSync(CORPUS_DIR)) return res.json({ chats: [] });
    const files = fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_') && f.toLowerCase() !== 'readme.md');
    const chats = files.map(f => {
      const st = fs.statSync(path.join(CORPUS_DIR, f));
      return { file: f, addedAt: st.mtime.toISOString() };
    });
    res.json({ chats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/sales/corpus/:file — permanently remove a corpus file.
router.delete('/sales/corpus/:file', (req, res) => {
  const file = String(req.params.file).replace(/[^a-z0-9._-]/gi, '');
  if (!file || !file.endsWith('.md')) return res.status(400).json({ error: 'invalid file' });
  const p = path.join(CORPUS_DIR, file);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  try { fs.unlinkSync(p); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sales/score { reply, situation } — judge the drafted reply vs the matching golden case.
router.post('/sales/score', express.json({ limit: '256kb' }), async (req, res) => {
  const { reply, situation, source } = req.body || {};
  if (!reply || !String(reply).trim()) return res.status(400).json({ error: 'reply required' });
  const caseId = SITUATION_TO_CASE[situation];
  if (!caseId) return res.status(400).json({ error: `unknown situation "${situation}"` });
  try {
    const { scoreOutput } = await import('../intelligence/eval/run-eval.mjs');
    const r = await scoreOutput(caseId, String(reply)); // judges + appends to eval-runs.jsonl
    // Sidecar: richer sales-desk record so the Scores tab can drill into reply + reasoning.
    try {
      if (!fs.existsSync(path.dirname(SALES_SCORES_LOG))) fs.mkdirSync(path.dirname(SALES_SCORES_LOG), { recursive: true });
      fs.appendFileSync(SALES_SCORES_LOG, JSON.stringify({
        at: new Date().toISOString(), kind: 'score', agent: 'sway', source: source || 'sales-desk',
        case: caseId, situation, task_type: situation, overall: r.overall, pass: r.pass,
        scores: r.scores || {}, failures: r.failures || [], reasoning: r.reasoning || '', reply: String(reply).slice(0, 4000),
      }) + '\n');
    } catch { /* sidecar is best-effort; the score still returns */ }
    res.json({ case: caseId, overall: r.overall, pass: r.pass, scores: r.scores, failures: r.failures || [], reasoning: r.reasoning });
  } catch (e) { res.status(500).json({ error: `score failed: ${e.message}` }); }
});

// GET /api/sales/scores — recent Sway score records for the win/loss + quality view.
// Prefers the rich sidecar (reply + reasoning + per-dimension scores); back-fills with
// legacy eval-runs records OLDER than the first sidecar entry (so the historical scores
// still show, with no duplicates once the sidecar takes over).
router.get('/sales/scores', (req, res) => {
  try {
    const out = [];
    let firstSidecarAt = null;
    if (fs.existsSync(SALES_SCORES_LOG)) {
      for (const l of fs.readFileSync(SALES_SCORES_LOG, 'utf-8').trim().split('\n').filter(Boolean)) {
        try {
          const r = JSON.parse(l);
          if (firstSidecarAt === null || r.at < firstSidecarAt) firstSidecarAt = r.at;
          out.push({ at: r.at, case: r.case, situation: r.situation, task_type: r.task_type, overall: r.overall, pass: r.pass, scores: r.scores || {}, failures: r.failures || [], reasoning: r.reasoning || '', reply: r.reply || '', source: r.source || 'sales-desk' });
        } catch { /* skip */ }
      }
    }
    if (fs.existsSync(RUNS_LOG)) {
      for (const l of fs.readFileSync(RUNS_LOG, 'utf-8').trim().split('\n').filter(Boolean)) {
        try {
          const r = JSON.parse(l);
          if (r.kind === 'score' && r.agent === 'sway' && (firstSidecarAt === null || r.at < firstSidecarAt)) {
            out.push({ at: r.at, case: r.case, task_type: r.task_type, overall: r.overall, pass: r.pass });
          }
        } catch { /* skip */ }
      }
    }
    out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)); // newest first
    res.json({ scores: out.slice(0, 50) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sales/ingest { chat, slug? } — save a finished chat into the corpus (then run /sway-ingest).
router.post('/sales/ingest', express.json({ limit: '512kb' }), (req, res) => {
  const { chat, slug } = req.body || {};
  if (!chat || !String(chat).trim()) return res.status(400).json({ error: 'chat required' });
  try {
    if (!fs.existsSync(CORPUS_DIR)) fs.mkdirSync(CORPUS_DIR, { recursive: true });
    let name;
    if (slug && /^[a-z0-9-]+$/i.test(slug)) {
      name = `${slug}.md`; let i = 2;
      while (fs.existsSync(path.join(CORPUS_DIR, name))) name = `${slug}-${i++}.md`; // never overwrite
    } else {
      let n = fs.readdirSync(CORPUS_DIR).filter(f => /^chat-\d+\.md$/.test(f)).length + 1;
      name = `chat-${String(n).padStart(3, '0')}.md`;
      while (fs.existsSync(path.join(CORPUS_DIR, name))) name = `chat-${String(++n).padStart(3, '0')}.md`;
    }
    fs.writeFileSync(path.join(CORPUS_DIR, name), String(chat));
    res.json({ ok: true, file: name, next: `Run /sway-ingest ${name} to extract + capture the lessons.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/sales/drafts — recent saved drafts (newest first, last 50).
router.get('/sales/drafts', (req, res) => {
  try { res.json({ drafts: readDrafts().slice(-50).reverse() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sales/drafts { chat, situation, reply } — persist a finished draft.
router.post('/sales/drafts', express.json({ limit: '256kb' }), (req, res) => {
  const { chat, situation, reply } = req.body || {};
  if (!reply || !String(reply).trim()) return res.status(400).json({ error: 'reply required' });
  try {
    const all = readDrafts();
    const draft = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(), situation: situation || '',
      chat: String(chat || '').slice(0, 8000), reply: String(reply).slice(0, 8000),
    };
    all.push(draft);
    writeDrafts(all.slice(-200)); // keep the last 200 on disk
    res.json({ ok: true, draft });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/sales/drafts — clear all.  DELETE /api/sales/drafts/:id — remove one.
router.delete('/sales/drafts', (req, res) => {
  try { writeDrafts([]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/sales/drafts/:id', (req, res) => {
  const id = String(req.params.id).replace(/[^a-z0-9]/gi, '');
  try { writeDrafts(readDrafts().filter(d => d.id !== id)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
