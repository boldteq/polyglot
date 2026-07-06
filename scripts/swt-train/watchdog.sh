#!/bin/bash
# SWT daemon watchdog — respawns the training daemon if it dies (OOM/crash), so a multi-hour
# unattended run can't stop silently. Exits cleanly when the STOP file is present (intentional stop).
ROOT="/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot"
export PATH="/Users/yashbaldha/.nvm/versions/node/v20.20.1/bin:$PATH"
cd "$ROOT" || exit 1
STOP="scripts/swt-train/STOP"
while true; do
  sleep 120
  [ -f "$STOP" ] && exit 0
  if ! pgrep -f "swt-train-loop.mjs start" >/dev/null; then
    SWT_MODE=topup SWT_INTERVAL_MS=90000 SWT_MAX_CYCLES=200 SWT_MAX_FAILURES=20 SWT_GEN_TIMEOUT_MS=1200000 SWT_REINDEX=0 \
      nohup node scripts/swt-train-loop.mjs start >> scripts/swt-train/daemon.out 2>&1 &
    echo "[watchdog $(date '+%Y-%m-%dT%H:%M:%S')] daemon was down — respawned (PID $!)" >> scripts/swt-train/daemon.out
  fi
done
