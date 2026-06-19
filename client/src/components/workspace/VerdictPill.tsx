// Lens visual-truth verdict pill. Promoted from inline in Workspace.tsx so all
// workspace surfaces render it identically.

export default function VerdictPill({ verdict, blockers = 0 }: { verdict: 'pass' | 'block' | null; blockers?: number }) {
  if (verdict === null) return <span className="text-xs text-text-muted bg-text-muted/10 px-2 py-0.5 rounded-full">no Lens run</span>
  return verdict === 'pass'
    ? <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white bg-green">PASS</span>
    : <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white bg-red">BLOCK{blockers ? ` ${blockers}` : ''}</span>
}
