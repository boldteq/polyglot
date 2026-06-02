// Budget checker for agent bodies.
// Invoked by the PUT handler before atomic write; mirrors the budgets defined
// in scripts/compactor/compact.mjs. Per-agent frontmatter overrides
// (compactor.budget_lines / compactor.budget_chars / compactor.allow_oversize)
// take precedence. If the frontmatter omits a value, we fall back to per-agent
// `budget_lines` + `budget_chars` columns on the `agents` SQLite table; if
// those are NULL we fall back to `app_config.defaults.budget_*` and only then
// to the hardcoded constants below.

const FALLBACK_DEFAULTS = {
  _default: { lines: 400, chars: 16000 },
  yash: { lines: 700, chars: 28000 },
  arya: { lines: 700, chars: 28000 },
  vex: { lines: 300, chars: 12000 },
  zeph: { lines: 300, chars: 12000 },
};

// Lazy-resolve to avoid a circular require at module-load.
function getDb() { return require('../db'); }
function getConfigService() { return require('../lib/configService'); }

const WARN_FACTOR = 0.9;  // warn >=90%
const HARD_FACTOR = 1.1;  // reject >=110%

function resolveBudget(agentId, frontmatter) {
  const fm = frontmatter?.compactor || {};
  // 1. Frontmatter overrides — author-controlled per-file.
  if (Number.isFinite(fm.budget_lines) && Number.isFinite(fm.budget_chars)) {
    return {
      lines: fm.budget_lines,
      chars: fm.budget_chars,
      allowOversize: Boolean(fm.allow_oversize),
      source: 'frontmatter',
    };
  }

  // 2. Per-agent SQLite columns.
  let dbLines, dbChars;
  try {
    const row = getDb().getDb().prepare(`SELECT budget_lines, budget_chars FROM agents WHERE id = ?`).get(agentId);
    if (row) {
      dbLines = row.budget_lines;
      dbChars = row.budget_chars;
    }
  } catch {
    // best-effort
  }

  // 3. App config defaults.
  let cfgLines, cfgChars;
  try {
    const cfg = getConfigService();
    cfgLines = cfg.getConfig('defaults.budget_lines');
    cfgChars = cfg.getConfig('defaults.budget_chars');
  } catch {
    // best-effort
  }

  // 4. Hardcoded fallback (per-agent map + global).
  const fallback = FALLBACK_DEFAULTS[agentId] || FALLBACK_DEFAULTS._default;

  return {
    lines: Number.isFinite(fm.budget_lines) ? fm.budget_lines
      : Number.isFinite(dbLines) ? dbLines
      : Number.isFinite(cfgLines) ? cfgLines
      : fallback.lines,
    chars: Number.isFinite(fm.budget_chars) ? fm.budget_chars
      : Number.isFinite(dbChars) ? dbChars
      : Number.isFinite(cfgChars) ? cfgChars
      : fallback.chars,
    allowOversize: Boolean(fm.allow_oversize),
    source: Number.isFinite(fm.budget_lines) ? 'frontmatter'
      : Number.isFinite(dbLines) ? 'db'
      : Number.isFinite(cfgLines) ? 'config'
      : 'fallback',
  };
}

function splitFrontmatter(content) {
  // Lightweight split — avoids requiring gray-matter at the hot path.
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { frontmatterText: '', body: content, hasFrontmatter: false };
  return { frontmatterText: m[1], body: m[2], hasFrontmatter: true };
}

function tryParseFrontmatter(frontmatterText) {
  // Minimal YAML extraction: we only need the `compactor:` subtree. Avoid
  // pulling a full YAML parser into the hot path; the PUT handler can pass
  // a pre-parsed frontmatter object instead if available.
  const out = { compactor: {} };
  const lines = frontmatterText.split('\n');
  let inCompactor = false;
  for (const line of lines) {
    if (/^compactor:\s*$/.test(line)) { inCompactor = true; continue; }
    if (inCompactor) {
      if (/^\S/.test(line)) { inCompactor = false; continue; }
      const kv = line.match(/^\s+([a-z_]+):\s*(.+?)\s*$/i);
      if (kv) {
        const k = kv[1];
        let v = kv[2];
        if (v === 'true') v = true;
        else if (v === 'false') v = false;
        else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
        else v = v.replace(/^['"]|['"]$/g, '');
        out.compactor[k] = v;
      }
    }
  }
  return out;
}

function checkBudget({ agentId, content, frontmatter }) {
  const { body, frontmatterText } = splitFrontmatter(content);
  const fm = frontmatter || tryParseFrontmatter(frontmatterText);
  const budget = resolveBudget(agentId, fm);
  const bodyLines = body.split('\n').length;
  const bodyChars = body.length;

  const violations = [];
  const warnings = [];

  if (bodyLines > budget.lines * HARD_FACTOR) {
    violations.push({ kind: 'lines', actual: bodyLines, budget: budget.lines, limit: Math.round(budget.lines * HARD_FACTOR) });
  } else if (bodyLines > budget.lines * WARN_FACTOR) {
    warnings.push({ kind: 'lines', actual: bodyLines, budget: budget.lines });
  }

  if (bodyChars > budget.chars * HARD_FACTOR) {
    violations.push({ kind: 'chars', actual: bodyChars, budget: budget.chars, limit: Math.round(budget.chars * HARD_FACTOR) });
  } else if (bodyChars > budget.chars * WARN_FACTOR) {
    warnings.push({ kind: 'chars', actual: bodyChars, budget: budget.chars });
  }

  return {
    ok: violations.length === 0 || budget.allowOversize,
    budget,
    actual: { lines: bodyLines, chars: bodyChars },
    violations,
    warnings,
    allowOversize: budget.allowOversize,
    suggestion: violations.length > 0
      ? `node scripts/compactor/compact.mjs ${agentId} --staging`
      : null,
  };
}

module.exports = { checkBudget, resolveBudget, DEFAULTS: FALLBACK_DEFAULTS };
