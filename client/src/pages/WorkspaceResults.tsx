import { TrendingUp } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import EmptyState from '../components/EmptyState'

// P2 placeholder. The 30/90d results loop (orbit baseline + per-surface lift vs
// lift_target) renders here once builds produce docs/results/baseline.md. None
// of the current builds have it yet (honest empty state, not a fake dashboard).
export default function WorkspaceResults() {
  return (
    <PageShell title="Results" subtitle="30/90-day conversion results loop — orbit + catalyst">
      <EmptyState
        icon={TrendingUp}
        title="No results baselines yet"
        description="This view shows per-surface lift vs target from docs/results/baseline.md, written by orbit at T+48h / 30d / 90d. No current build has published one. Full Results view ships in P2."
      />
    </PageShell>
  )
}
