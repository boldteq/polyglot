// Gate status pill — pass / fail / missing / warn. Used in the Gates tab (P1)
// and anywhere a single gate's state is shown.

type GateStatus = 'pass' | 'fail' | 'missing' | 'warn'

const STYLE: Record<GateStatus, string> = {
  pass: 'bg-green/15 text-green',
  fail: 'bg-red/15 text-red',
  warn: 'bg-amber/15 text-amber',
  missing: 'bg-text-muted/10 text-text-muted',
}
const LABEL: Record<GateStatus, string> = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', missing: 'no report' }

export default function GateStatusBadge({ status }: { status: GateStatus }) {
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${STYLE[status]}`}>{LABEL[status]}</span>
}
