'use strict';

// Dispatch-time policy gate (Pillar 5). ONE enforcement point that hard-checks a
// dispatch decision before a task is assigned, and yields a structured verdict the
// caller logs to policy_audit. Turns governance from "50 doc rules agents may
// ignore" into enforced middleware.
//
// PURE + injectable: takes a pre-computed modelViolation (caller reads it from the
// DB) so the gate itself does no I/O and unit-tests trivially. Fails OPEN by design
// — a caller that hits an error should allow + log, never block on a gate bug.
//
//   evaluateDispatch(ctx, policy) -> { allow, blocked, mode, violations[], context }
//
// Severity:
//   'block' — deterministic, high-confidence (inactive agent, model-tier mismatch
//             under block mode, budget hard-cap breached on a non-exempt task).
//   'warn'  — heuristic / advisory (capability gap on a fuzzy skill score, model
//             mismatch under advisory mode). Logged + surfaced, does NOT block.
//   allow = (mode === 'audit') ? true : no 'block' violations.

const DEFAULTS = {
  mode: 'enforce',          // 'enforce' (block on 'block' violations) | 'audit' (log only)
  capabilityFloor: 0.15,    // min ABSOLUTE (raw) skill score for the chosen agent
  capabilityBlock: false,   // hard-block on a capability gap? default warn-only (heuristic)
  budgetHardCapPct: 150,    // monthly-burn % that hard-blocks non-exempt dispatches
};

function evaluateDispatch(ctx = {}, policy = {}) {
  const {
    agentId = null, status = 'active', model = null, tier = null,
    rawSkill = null, skillScore = null, taskType = null, priority = 'p2',
    budget = {}, modelViolation = null,
  } = ctx;
  const cfg = { ...DEFAULTS, ...policy };

  const violations = [];
  const add = (code, severity, detail, extra = {}) => violations.push({ code, severity, detail, ...extra });

  // 1) Agent must be active (defensive — eligibility usually filters this already).
  if (status && status !== 'active') {
    add('inactive_agent', 'block', `agent status is "${status}", not active`, { status });
  }

  // 2) Capability veto (Roster). Uses the ABSOLUTE skill match — the normalized
  //    score is always 1.0 for the top pick, so it can't reveal a global gap.
  if (typeof rawSkill === 'number' && rawSkill < cfg.capabilityFloor) {
    add('capability_gap', cfg.capabilityBlock ? 'block' : 'warn',
      `best-match skill ${rawSkill.toFixed(3)} below floor ${cfg.capabilityFloor} — no agent is well-qualified`,
      { rawSkill, floor: cfg.capabilityFloor });
  }

  // 3) Budget hard cap — cost circuit-breaker. Only when burn is computable and the
  //    task isn't on the exempt list (billing/auth/deploy/security stay unblocked).
  const burnPct = budget && typeof budget.burnPct === 'number' ? budget.burnPct : null;
  if (burnPct != null && burnPct >= cfg.budgetHardCapPct && !budget.exemptTask) {
    add('budget_exceeded', 'block',
      `monthly burn ${burnPct}% ≥ hard cap ${cfg.budgetHardCapPct}% and task not exempt`,
      { burnPct, cap: cfg.budgetHardCapPct });
  }

  // 4) Model-routing — agent must run on its assigned tier. Respects the model-
  //    routing config's own enforcementMode (block vs advisory/warn).
  if (modelViolation) {
    const sev = modelViolation.mode === 'block' ? 'block' : 'warn';
    add('model_routing', sev,
      `agent "${agentId}" model "${modelViolation.actual}" ≠ required tier "${modelViolation.expected}"`,
      { expected: modelViolation.expected, actual: modelViolation.actual, tier: modelViolation.tier });
  }

  const blocking = violations.filter((v) => v.severity === 'block');
  const allow = cfg.mode === 'audit' ? true : blocking.length === 0;

  return {
    allow,
    blocked: !allow,
    mode: cfg.mode,
    violations,
    context: {
      agentId, taskType, priority, model, tier,
      rawSkill, skillScore,
      burnPct, exemptTask: !!(budget && budget.exemptTask),
    },
  };
}

module.exports = { evaluateDispatch, DEFAULTS };
