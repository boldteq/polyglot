#!/usr/bin/env bash
# Phase 5 — Static→Dynamic refactor guard.
# Greps backend src for literals that should be sourced from app_config:
# the hardcoded 'sonnet'/'engineer' defaults, 0.9/0.7 health thresholds in
# non-config files, and direct registry.json file reads in dispatch code.
#
# Exits non-zero if any banned pattern is found. Run from repo root:
#   bash scripts/check-no-static.sh

set -euo pipefail

cd "$(dirname "$0")/.."

FAIL=0

# 1. Forbidden literal model/tier strings in backend source — exempted in
#    seed-app-config.mjs (initial values) and configFallback.js (DR fallback).
BAD_LITERAL=$(grep -rn "'sonnet'\|'engineer'" \
  src/routes src/lib src/org.js src/hr.js src/experience.js src/compactor 2>/dev/null \
  | grep -v "configFallback\|seed-app-config\|registry-import" \
  | grep -v "// allowed:" \
  || true)
if [ -n "$BAD_LITERAL" ]; then
  echo "❌ Forbidden literal 'sonnet' or 'engineer' in backend source — must go via configService:"
  echo "$BAD_LITERAL"
  FAIL=1
fi

# 2. Direct registry.json fs reads in dispatch — must use org.loadRegistry().
BAD_REGISTRY=$(grep -rn "REGISTRY_PATH\|registry\.json" src/routes/dispatch.js 2>/dev/null || true)
if [ -n "$BAD_REGISTRY" ]; then
  echo "❌ Direct registry.json reference in dispatch.js — use org.loadRegistry():"
  echo "$BAD_REGISTRY"
  FAIL=1
fi

# 3. Hardcoded 90 / 70 health thresholds in backend (must read from config).
BAD_THRESH=$(grep -rEn ">= 90\b|>= 70\b" \
  src/routes src/lib src/hr.js src/experience.js 2>/dev/null \
  | grep -v "configFallback\|seed-app-config" \
  | grep -v "// allowed:" \
  || true)
if [ -n "$BAD_THRESH" ]; then
  echo "⚠️  Possible hardcoded health threshold (90 or 70) in backend — verify it reads from app_config:"
  echo "$BAD_THRESH"
  # Warn only — many `>= 90` matches are legitimate (e.g. percent thresholds
  # in seed defaults). Set FAIL=1 if you want this to be hard-blocking.
fi

if [ $FAIL -eq 0 ]; then
  echo "✅ no-static guard: clean."
else
  exit 1
fi
