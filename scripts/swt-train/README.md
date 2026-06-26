# SWT Autonomous-Design Training Loop

Trains the Shopify Website Team (14 agents) to design a complete, conversion-grade, honest
Shopify store **fully autonomously** by walking the **~5,040-slice possibility space**
(24 design concerns × 30 surfaces) and pinning the canonical answer + trade-offs for every
gap an AI builder hits.

## What one cycle does (every 15 min)
1. Picks the next 7 uncovered slices of the possibility map (deterministic round-robin).
2. Generates ~49 gap-FAQs via headless `claude -p` (subscription judgment — no API key).
   Each: **Gap → Solution (owner agent · gate#) → Pros → Cons+mitigation → Auto-fix**.
3. Appends them to the FAQ brain: `~/.claude/memory/patterns/good/shopify-website-faq-brain.md`
   (all 14 SWT agents auto-load it → the whole team inherits every ruling).
4. Scans the dogfood store `gpt test 1` (honesty gate) → records findings to `store-fix-queue.md`.
   Safe-class fixes are auto-applicable; ambiguous ones wait for Yash. **Never pushed live.**
5. Updates the coverage meter, appends the auto-fix ledger, git-commits state/log/queue.

## Watch / control
```bash
node scripts/swt-train-loop.mjs status     # coverage meter + last 3 cycles
tail -f scripts/swt-train/cycle.log        # live cycle log
cat scripts/swt-train/store-fix-queue.md   # store findings
touch scripts/swt-train/STOP               # graceful kill switch (stops after current cycle)
rm scripts/swt-train/STOP                  # then re-launch to resume
node scripts/swt-train-loop.mjs start &    # (re)launch the loop
```

## Tuning (env)
- `SWT_MAX_CYCLES` (60 ≈ 15h at 15-min interval)
- `SWT_INTERVAL_MS` (900000 = 15 min)
- `SWT_SLICES_PER_CYCLE` (7 → ~49 FAQs/cycle)
- `SWT_MODEL` (empty = inherit CLI default)
- `SWT_STORE_SCAN` (1; set 0 to skip the store scan)
- `CLAUDE_BIN` (resolved to the node-v20 claude install)

## Math
720 slices × ~7 FAQs ≈ **5,040** target. 60 cycles × ~49 ≈ **~3,000 in the 15h window**
(~60% of the space). Leave it running longer, or raise `SWT_SLICES_PER_CYCLE`, to complete
all 5,040. State is resumable — the slice pointer persists in `state.json`.

## Safety
- Generation is text-only (claude returns JSON; the daemon does all writes) — no unattended
  tool-use edits.
- Store arm is **read-only scan + queue** by default; nothing is `theme push`ed. mantle + Yash
  gate any live publish.
- 5 consecutive generation failures → auto-writes STOP and exits.
