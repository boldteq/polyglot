#!/usr/bin/env bash
# Boldteq Shopify Mastery pack installer.
# Idempotent: safe to run repeatedly. Installs nothing it cannot verify, changes no
# existing file, and prints the steps a shell cannot perform.
set -uo pipefail

PACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$PACK_DIR/../.." && pwd)"
SKILLS=(shopify-liquid shopify-custom-data shopify-dev)

ok()   { printf '  \033[32mok\033[0m    %s\n' "$1"; }
warn() { printf '  \033[33mwarn\033[0m  %s\n' "$1"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

step "1. Prerequisites"
command -v node >/dev/null 2>&1 && ok "node $(node -v)" || { warn "node not found - stop here"; exit 1; }
command -v npx  >/dev/null 2>&1 && ok "npx present"      || { warn "npx not found - stop here"; exit 1; }
if command -v shopify >/dev/null 2>&1; then
  ok "shopify cli $(shopify version 2>/dev/null | head -1)"
else
  warn "shopify cli missing. The Liquid LSP plugin needs it:  npm install -g @shopify/cli"
fi

step "2. Shopify agent skills (theme-relevant subset only)"
for s in "${SKILLS[@]}"; do
  if npx --yes skill install "$s" >/dev/null 2>&1; then
    ok "$s"
  else
    warn "$s failed - run manually:  npx skill install $s"
  fi
done

step "3. Shopify Dev MCP reachability"
if npx --yes @shopify/dev-mcp@latest --help >/dev/null 2>&1; then
  ok "@shopify/dev-mcp resolves"
else
  warn "could not resolve @shopify/dev-mcp - check network, then retry"
fi

step "4. .mcp.json"
if [ -f "$REPO_ROOT/.mcp.json" ] && grep -q '"shopify-dev"' "$REPO_ROOT/.mcp.json" 2>/dev/null; then
  ok "shopify-dev server already present"
else
  warn "shopify-dev server NOT in .mcp.json - apply the patch in README.md section 'Tier 0.1'"
  warn "while there, replace the absolute /Users/... path in boldteq-memory with ./src/intelligence/mcp-server.mjs"
fi

step "5. CLAUDE.md"
if [ -f "$REPO_ROOT/CLAUDE.md" ] && grep -q 'shopify-mastery' "$REPO_ROOT/CLAUDE.md" 2>/dev/null; then
  ok "Shopify rule block already present"
else
  warn "CLAUDE.md has no Shopify rule block - append the block in README.md section 'The CLAUDE.md patch'"
fi

step "6. Pack integrity"
for j in sources.json taste-rubric.json; do
  node -e "JSON.parse(require('fs').readFileSync('$PACK_DIR/$j','utf8'))" 2>/dev/null \
    && ok "$j is valid JSON" || warn "$j is malformed"
done
for f in rules/01-platform-truth-2026.md rules/02-liquid-and-css-standard.md rules/03-quality-bar.md \
         rules/04-design-taste.md rules/05-ai-tells.md rules/06-dogfood-protocol.md; do
  [ -s "$PACK_DIR/$f" ] && ok "$f" || warn "$f missing or empty"
done

step "7. Provenance cross-check (every rubric sourceId must resolve)"
node -e '
  const fs = require("fs"), d = process.argv[1];
  const src = JSON.parse(fs.readFileSync(d + "/sources.json", "utf8"));
  const rub = JSON.parse(fs.readFileSync(d + "/taste-rubric.json", "utf8"));
  const ids = new Set((src.sources || []).map(s => s.id));
  const refs = new Set();
  (function walk(n) {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === "object") {
      for (const [k, v] of Object.entries(n)) {
        if (k === "sourceIds" && Array.isArray(v)) v.forEach(x => refs.add(x));
        else walk(v);
      }
    }
  })(rub);
  const bad = [...refs].filter(r => !ids.has(r));
  const pol = rub.evidencePolicy || {};
  const vocab = pol.actionVocabulary || ["reject", "warn", "note"];
  const rank = { note: 0, warn: 1, reject: 2 };
  const policyBreaks = (rub.checks || []).filter(c =>
    !c.tag || !c.action || !vocab.includes(c.action) ||
    !pol[c.tag] || rank[c.action] > rank[pol[c.tag].maxAction]
  ).map(c => c.id + ":" + c.tag + "->" + c.action);
  const dupes = (src.sources || []).map(s => s.id)
    .filter((v, i, a) => a.indexOf(v) !== i);
  const untriaged = (src.sources || [])
    .filter(s => !s.licenceClass || !s.evidenceRating).map(s => s.id);
  console.log(JSON.stringify({
    sources: ids.size, rejected: (src.rejected || []).length,
    checks: (rub.checks || []).length,
    refs: refs.size, unresolved: bad, dupes, untriaged, policyBreaks
  }));
  process.exit(bad.length || dupes.length || untriaged.length || policyBreaks.length ? 1 : 0);
' "$PACK_DIR" 2>/dev/null \
  && ok "sourceIds resolve; no dupes; every source triaged; no check exceeds its tag maxAction" \
  || warn "provenance cross-check FAILED - rerun the node block above to see which ids"

step "Remaining steps must be run inside Claude Code, not a shell"
cat <<'CLAUDE_STEPS'
  /plugin marketplace add Shopify/liquid-skills
  /plugin install liquid-lsp@liquid-skills
  /plugin install liquid-skills@liquid-skills

  optional, only after measuring overlap with shopify-dev MCP:
  /plugin marketplace add Shopify/shopify-ai-toolkit
  /plugin install shopify-plugin@shopify-ai-toolkit
CLAUDE_STEPS
printf '\n'
