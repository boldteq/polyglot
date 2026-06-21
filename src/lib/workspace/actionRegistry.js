'use strict';

// The ALLOWLIST of management actions the Workspace cockpit may run against a
// build. THIS registry IS the security boundary: the action runner can only
// spawn an entry that appears here, with the FIXED `args` defined here — never a
// command or argument from the client. P1 = `tier:'safe'` only (read-only OR
// writes only to <build>/gate-reports/ — never theme code, never the store).
//
// Each script must live in theme-toolkit/scripts/ (the runner enforces dir
// containment too). Deploy/store/expensive tiers are reserved for a later,
// separately-gated phase (P4) and are intentionally absent here.

const path = require('path');

const TOOLKIT_DIR = path.resolve(process.cwd(), 'theme-toolkit', 'scripts');

// tier: 'safe' = read-only or writes only to gate-reports/. (future: 'deploy' |
// 'store' | 'expensive' — gated separately, not in P1)
const ACTIONS = [
  {
    id: 'gates:static', label: 'Run static gates', tier: 'safe',
    script: 'theme-gates.mjs', args: ['--static-only'],
    description: 'Runs the full static QA gate suite. Writes only to gate-reports/.',
    confirm: { title: 'Run static gates?', message: 'Runs the static gate suite against this build and overwrites its gate-reports/. Does NOT touch theme code or the store. Takes ~10–30s.', confirmLabel: 'Run gates' },
  },
  {
    id: 'gates:verify', label: 'Verify gate freshness', tier: 'safe',
    script: 'theme-gates.mjs', args: ['--verify'],
    description: 'Checks whether a prior gate run is fresh + passing (the publish precondition). Read-only.',
    confirm: { title: 'Verify gate freshness?', message: 'Reads the latest gate run and reports whether it is fresh and passing. Read-only — changes nothing.', confirmLabel: 'Verify' },
  },
  {
    id: 'check:discovery', label: 'Check discovery', tier: 'safe',
    script: 'check-discovery.mjs', args: [],
    description: 'Validates business-discovery completeness (goals/brand-direction). Writes only to gate-reports/.',
    confirm: { title: 'Check discovery?', message: 'Validates discovery artifacts and writes a report to gate-reports/. Does not touch theme code or the store.', confirmLabel: 'Run check' },
  },
  {
    id: 'check:design-system', label: 'Check design system', tier: 'safe',
    script: 'check-design-system.mjs', args: [],
    description: 'Validates docs/design/design-system.json is well-formed + complete. Writes only to gate-reports/.',
    confirm: { title: 'Check design system?', message: 'Validates the locked design system and writes a report to gate-reports/. Read-only on theme code.', confirmLabel: 'Run check' },
  },
  {
    id: 'check:reuse-map', label: 'Check section reuse', tier: 'safe',
    script: 'check-reuse-map.mjs', args: [],
    description: 'Validates the section-reuse map / reuse ratio. Writes only to gate-reports/.',
    confirm: { title: 'Check section reuse?', message: 'Validates the section-reuse map and writes a report to gate-reports/. Read-only on theme code.', confirmLabel: 'Run check' },
  },
  {
    id: 'check:consistency', label: 'Check consistency', tier: 'safe',
    script: 'check-consistency.mjs', args: [],
    description: 'Audits design-system consistency across sections. Writes only to gate-reports/.',
    confirm: { title: 'Check consistency?', message: 'Audits design-system consistency and writes a report to gate-reports/. Read-only on theme code.', confirmLabel: 'Run check' },
  },
  {
    id: 'check:honesty', label: 'Check honesty', tier: 'safe',
    script: 'check-honesty.mjs', args: [],
    description: 'Audits copy claims (no fabricated stats / fake urgency). Writes only to gate-reports/.',
    confirm: { title: 'Check honesty?', message: 'Audits copy claims and writes a report to gate-reports/. Read-only on theme code.', confirmLabel: 'Run check' },
  },
  {
    id: 'store:preflight', label: 'Store preflight', tier: 'safe',
    script: 'porter-preflight.mjs', args: [],
    requiresEnv: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ADMIN_API_TOKEN'],
    description: 'Validates store access + required Admin API scopes. Read-only — never writes to the store.',
    confirm: { title: 'Run store preflight?', message: 'Checks store access + scopes using the configured Admin API token. Read-only — writes nothing to the store.', confirmLabel: 'Run preflight' },
  },
  {
    id: 'build-state:show', label: 'Show build state', tier: 'safe',
    script: 'build-state.mjs', args: ['show'],
    description: 'Renders the maestro build-state (surface-by-surface verdicts). Read-only.',
    confirm: { title: 'Show build state?', message: 'Prints the current build-state. Read-only — changes nothing.', confirmLabel: 'Show' },
  },
];

const byId = new Map(ACTIONS.map((a) => [a.id, a]));

function getAction(id) { return byId.get(id) || null; }

// Public (client-safe) view — never leaks script paths/args; includes whether
// the entry's required env is satisfied so the UI can disable + explain.
function listActions() {
  return ACTIONS.map((a) => ({
    id: a.id, label: a.label, tier: a.tier, description: a.description,
    confirm: a.confirm,
    requiresEnv: a.requiresEnv || [],
    available: (a.requiresEnv || []).every((k) => !!process.env[k]),
    unavailableReason: (a.requiresEnv || []).some((k) => !process.env[k])
      ? `Needs env: ${(a.requiresEnv || []).filter((k) => !process.env[k]).join(', ')}`
      : null,
  }));
}

module.exports = { ACTIONS, getAction, listActions, TOOLKIT_DIR };
