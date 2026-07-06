#!/bin/bash
# Periodic semantic reindex — runs every 90 min so the vector index stays reasonably fresh now that
# per-cycle reindex is OFF (SWT_REINDEX=0). The per-agent packs (the primary training channel) still
# update every cycle; this keeps memory_search ~90 min fresh without the 6 GB/hr full-rewrite cost.
# Does a final reindex + exits once the STOP file appears (run finished).
ROOT="/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot"
export PATH="/Users/yashbaldha/.nvm/versions/node/v20.20.1/bin:$PATH"
cd "$ROOT" || exit 1
STOP="scripts/swt-train/STOP"
while true; do
  sleep 5400
  node src/intelligence/reindex.mjs >> scripts/swt-train/reindex.log 2>&1
  [ -f "$STOP" ] && exit 0
done
