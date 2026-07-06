import { Check, ChevronRight } from 'lucide-react'
import { PHASES, phaseForStep } from '../../lib/workspacePhases'

// The build as a 7-phase journey: Intake › Discovery › Design › Build › QA ›
// Publish › Monitor. Completed phases get a check, the current one is highlighted,
// the rest are muted — so "where am I / how does this work" is obvious at a glance.
// Replaces the unlabeled 18-segment bar in the hero.
export default function PhaseJourney({ current, total = 18 }: { current: number; total?: number }) {
  const active = phaseForStep(current)
  const activeIdx = PHASES.findIndex((p) => p.id === active.id)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 flex-wrap">
        {PHASES.map((p, i) => {
          const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending'
          return (
            <div key={p.id} className="flex items-center">
              <span
                title={`Phase: ${p.label} (steps ${p.from}${p.to !== p.from ? `–${p.to}` : ''})`}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                  state === 'active'
                    ? 'bg-accent text-white shadow-soft'
                    : state === 'done'
                      ? 'bg-accent/10 text-accent'
                      : 'bg-surface-2 text-text-muted'
                }`}
              >
                {state === 'done' && <Check className="w-3 h-3 shrink-0" />}
                {p.label}
              </span>
              {i < PHASES.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0 mx-0.5" />}
            </div>
          )
        })}
      </div>
      <div className="text-[11px] text-text-muted">
        Step {current}/{total} · <span className="text-text-secondary font-medium capitalize">{active.label}</span> phase
      </div>
    </div>
  )
}
