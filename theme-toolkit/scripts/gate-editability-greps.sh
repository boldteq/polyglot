#!/usr/bin/env bash
# Gate 3 (static layer / onyx Audit 7-D) — merchant-editability zero-hardcode grep suite.
#
# Transcribed from ~/.claude/memory/patterns/good/merchant-editability-qa-checklist.md §1
# (checks 1.1–1.5 with their allowlist pipelines). Diff-scoped: only files added/modified
# vs the pinned `base` tag count — vanilla theme files are exempt.
#
# Env:  REPORT_DIR (default: gate-reports)
# Out:  $REPORT_DIR/editability.json (schema via lib/report.mjs)
# Exit: 0 = pass · 1 = block (unallowlisted hit, or base tag missing) · 2 = env error (not a git repo)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="${REPORT_DIR:-gate-reports}"
START_MS="$(node -e 'process.stdout.write(String(Date.now()))')"

TSV="$(mktemp)"
trap 'rm -f "$TSV"' EXIT

# write_report <pass:true|false> <blockers-json> <evidence-json> [warnings-json]
write_report() {
  GATE_PASS="$1" GATE_BLOCKERS="$2" GATE_EVIDENCE="$3" GATE_WARNINGS="${4:-[]}" \
  GATE_START_MS="$START_MS" REPORT_LIB="$SCRIPT_DIR/lib/report.mjs" REPORT_DIR="$REPORT_DIR" \
  node --input-type=module - <<'NODE'
import { pathToFileURL } from 'node:url'
const { writeReport } = await import(pathToFileURL(process.env.REPORT_LIB).href)
const { file, report } = writeReport('editability', 3, {
  pass: process.env.GATE_PASS === 'true',
  blockers: JSON.parse(process.env.GATE_BLOCKERS || '[]'),
  warnings: JSON.parse(process.env.GATE_WARNINGS || '[]'),
  evidence: JSON.parse(process.env.GATE_EVIDENCE || '{}'),
  duration_ms: Date.now() - Number(process.env.GATE_START_MS || Date.now()),
}, process.env.REPORT_DIR)
console.log(`report: ${file} (pass=${report.pass}, blockers=${report.blockers.length})`)
NODE
}

# collect <check-id> — stdin lines "file:line:matched" → TSV rows for lib/jsonify-hits.mjs
collect() {
  local check="$1" hit f rest ln txt
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    f="${hit%%:*}"; rest="${hit#*:}"
    ln="${rest%%:*}"; txt="${rest#*:}"
    txt="${txt//$'\t'/ }"
    printf '%s\t%s\t%s\t%s\n' "$check" "$f" "$ln" "$txt" >>"$TSV"
  done
}

# ── env guard ─────────────────────────────────────────────────────────────
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  write_report false '[]' '{"skipped":"env","reason":"not a git repository — run from the theme repo root"}'
  echo "ENV-ERROR: not a git repository" >&2
  exit 2
fi

# ── scoping (§1) — the grep suite runs on the BUILD DIFF, not the whole repo ──
BASE=base   # annotated git tag mantle creates at the vendored-theme bootstrap commit
if ! git rev-parse -q --verify "$BASE" >/dev/null; then
  write_report false \
    '[{"id":"editability.base-tag-missing","page":"(repo)","detail":"no `base` git tag — mantle bootstrap incomplete; grep suite cannot diff-scope","evidence":"git rev-parse -q --verify base → not found"}]' \
    '{"base":"base"}'
  echo "BLOCK: no base tag — mantle bootstrap incomplete" >&2
  exit 1
fi

FILES=$(git diff --name-only "$BASE"...HEAD -- sections/ snippets/ assets/ layout/ templates/)
if [ -z "$FILES" ]; then
  write_report true '[]' '{"base":"base","files_in_scope":0,"note":"no theme files changed vs base"}' '[{"id":"editability.n-a-empty-scope","page":".","detail":"no theme files changed vs base — nothing was scanned for merchant editability","evidence":""}]'
  echo "PASS: no theme files changed vs base"
  exit 0
fi

# drop deletions (listed in the diff, nothing on disk to grep)
PRESENT=""
for f in $FILES; do [ -f "$f" ] && PRESENT="$PRESENT $f"; done
FILES="$(echo $PRESENT | tr ' ' '\n' | sed '/^$/d')"
if [ -z "$FILES" ]; then
  write_report true '[]' '{"base":"base","files_in_scope":0,"note":"only deletions vs base — nothing to grep"}' '[{"id":"editability.n-a-empty-scope","page":".","detail":"only deletions vs base — nothing to grep — nothing was scanned for merchant editability","evidence":""}]'
  echo "PASS: only deletions vs base"
  exit 0
fi

# ── 1.1 — Hardcoded English in render output ──────────────────────────────
# body text between tags — schema stripped first ({% schema %} defaults are legal);
# {% liquid %} code blocks stripped too: comparison operators (>= x and y <=) read
# as tag boundaries to the body grep and liquid statements never render directly.
for f in $FILES; do case "$f" in sections/*.liquid|snippets/*.liquid)
  sed -e '/{% schema %}/,/{% endschema %}/d' -e '/{%-* *liquid/,/%}/d' "$f" \
  | grep -nE '>[^<{]*[A-Za-z]{3,}( [A-Za-z]+)+[^<{]*<' \
  | grep -vE '<(script|style|path|svg|symbol|noscript)|\| ?t[ :}]' \
  | sed "s|^|$f:|" ;; esac; done | collect 1.1

# merchant-visible attribute strings (a11y text is content too)
grep -nHE '(aria-label|placeholder|title)="[A-Za-z][^"{]*"' $FILES | collect 1.1

# ── 1.2 — Image URLs not from settings ────────────────────────────────────
grep -nHE '(https?:)?//[^"'"'"' )]+\.(png|jpe?g|gif|webp|avif|svg)|cdn\.shopify\.com/s/files' $FILES \
| grep -vE 'shopifycloud|image_url|img_url|asset_url|file_url' | collect 1.2

# ── 1.3 — Hex/rgb colors where a scheme var exists (diff + lines only) ────
for f in $FILES; do case "$f" in sections/*|snippets/*|assets/*|layout/*)
  git diff "$BASE"...HEAD -- "$f" \
  | node -e 'const s=require("fs").readFileSync(0,"utf8");process.stdout.write(s.replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g," ")))' \
  | grep -nE '^\+.*(#[0-9a-fA-F]{3,8}\b|rgba?\([0-9])' \
  | grep -vE '"default"|fill[=:]|stroke[=:]|var\(--|\{\{|\{%' \
  | sed "s|^|$f:|" ;; esac; done | collect 1.3

# ── 1.4 — Literal alt text ────────────────────────────────────────────────
grep -nHE 'alt="[^"{][^"]*"' $FILES | collect 1.4

# ── 1.5 — Hardcoded hrefs ─────────────────────────────────────────────────
grep -nHE 'href="(/|https?://)[^"]*"' $FILES \
| grep -vE 'routes\.|settings\.|\{\{|shopifycloud|href="//www\.shopify\.com"|rel="(preconnect|dns-prefetch|preload|modulepreload|stylesheet)"|fonts\.(googleapis|gstatic|shopifycdn)\.com' | collect 1.5

# ── verdict ───────────────────────────────────────────────────────────────
BLOCKERS_JSON="$(node "$SCRIPT_DIR/lib/jsonify-hits.mjs" <"$TSV")"
HIT_COUNT="$(grep -c . "$TSV" || true)"
EVIDENCE="$(node -e '
const fs = require("node:fs")
const lines = fs.readFileSync(process.argv[1], "utf-8").split("\n").filter(Boolean)
const per = {}
for (const l of lines) { const c = l.split("\t")[0]; per[c] = (per[c] || 0) + 1 }
const files = process.argv[2].split(/\s+/).filter(Boolean)
process.stdout.write(JSON.stringify({ base: "base", files_in_scope: files.length, files: files.slice(0, 50), hits: lines.length, hits_per_check: per }))
' "$TSV" "$FILES")"

if [ "${HIT_COUNT:-0}" -gt 0 ]; then
  write_report false "$BLOCKERS_JSON" "$EVIDENCE"
  echo "BLOCK: $HIT_COUNT unallowlisted editability hit(s) — see $REPORT_DIR/editability.json" >&2
  exit 1
fi

write_report true '[]' "$EVIDENCE"
echo "PASS: editability greps clean"
exit 0
