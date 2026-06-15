import { useState } from 'react'
import {
  Inbox, Check, X, Pencil, Loader2, AlertCircle, RefreshCw,
  Lightbulb, Bug, GitBranch, MessageSquareWarning, Sparkles, BookOpen,
  type LucideIcon,
} from 'lucide-react'
import {
  getLearningInbox, approveCandidate, rejectCandidate, editCandidate, getLearningStatus,
  type LearningCandidate, type LearningType, type InboxCounts, type LearningDigestStatus,
} from '../lib/api'
import { useCachedApi } from '../hooks/useCachedApi'
import { CacheKeys } from '../lib/cacheKeys'
import { toast } from '../components/Toast'

type Tab = 'pending' | 'auto'
interface InboxData { items: LearningCandidate[]; counts: InboxCounts }

const TYPE_META: Record<LearningType, { label: string; Icon: LucideIcon; cls: string }> = {
  lesson:   { label: 'Lesson',   Icon: Lightbulb,            cls: 'bg-blue-500/10 text-blue-400 border-blue-500/25' },
  bug:      { label: 'Bug',      Icon: Bug,                  cls: 'bg-red-500/10 text-red-400 border-red-500/25' },
  decision: { label: 'Decision', Icon: GitBranch,            cls: 'bg-purple-500/10 text-purple-400 border-purple-500/25' },
  feedback: { label: 'Feedback', Icon: MessageSquareWarning, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/25' },
  golden:   { label: 'Golden',   Icon: Sparkles,             cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  const s = Math.round(Math.abs(diff) / 1000)
  if (s < 60) return 'just now'
  const v = s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`
  return diff < 0 ? `in ${v}` : `${v} ago`
}

export default function LearningInbox() {
  const [tab, setTab] = useState<Tab>('pending')
  const status: string = tab === 'pending' ? 'pending' : 'auto'
  const { data, loading, refreshing, error, refetch, setData } =
    useCachedApi<InboxData>(CacheKeys.learningInbox(status), () => getLearningInbox(status))
  const { data: digestStatus } = useCachedApi<LearningDigestStatus>(CacheKeys.learningStatus, getLearningStatus)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const items = data?.items ?? []
  const counts = data?.counts ?? { pending: 0, approved: 0, rejected: 0, auto: 0 }

  // Optimistically drop a reviewed card + decrement the pending count.
  const dropItem = (id: string) => {
    setData((prev) => {
      if (!prev) return { items: [], counts: { pending: 0, approved: 0, rejected: 0, auto: 0 } }
      return {
        items: prev.items.filter((i) => i.id !== id),
        counts: { ...prev.counts, pending: Math.max(0, prev.counts.pending - 1) },
      }
    })
  }

  const handleApprove = async (c: LearningCandidate) => {
    setBusyId(c.id)
    dropItem(c.id)
    try {
      const r = await approveCandidate(c.id)
      toast('success', c.type === 'feedback' ? 'Added to feedback.md' : `Saved to memory (${r.capturedRef})`)
    } catch (err) {
      refetch() // roll back the optimistic drop
      toast('error', err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setBusyId(null)
    }
  }

  const handleReject = async (c: LearningCandidate) => {
    setBusyId(c.id)
    dropItem(c.id)
    try {
      await rejectCandidate(c.id)
    } catch (err) {
      refetch()
      toast('error', err instanceof Error ? err.message : 'Reject failed')
    } finally {
      setBusyId(null)
    }
  }

  // Group pending candidates by their source session/project.
  const groups = new Map<string, { project: string; createdAt: string; items: LearningCandidate[] }>()
  for (const it of items) {
    const key = it.sessionId || 'unknown'
    const g = groups.get(key) || { project: it.project || 'Unknown project', createdAt: it.createdAt, items: [] }
    g.items.push(it)
    groups.set(key, g)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Inbox className="w-4.5 h-4.5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Learning Inbox</h1>
            <p className="text-[13px] text-text-secondary">Lessons your AI team found in your VS Code projects — approve to save them to memory.</p>
            {digestStatus?.lastRunAt && (
              <p className="text-[11px] text-text-muted mt-0.5">
                Last digest {relTime(digestStatus.lastRunAt)}
                {digestStatus.lastRunStatus && <> · <span className={digestStatus.lastRunStatus === 'success' ? 'text-emerald-400' : 'text-red-400'}>{digestStatus.lastRunStatus}</span></>}
                {digestStatus.lastRunSummary && ` · ${digestStatus.lastRunSummary}`}
                {digestStatus.nextRunAt && ` · next ${relTime(digestStatus.nextRunAt)}`}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={refetch}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary border border-border rounded-lg hover:bg-surface-2 hover:text-text transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Explainer */}
      <div className="flex items-start gap-2 text-[12px] text-text-muted bg-surface-2/40 border border-border rounded-lg px-3 py-2 mb-4">
        <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Each night, the <strong>Learning digest</strong> reviews the day's projects. High-confidence lessons save automatically;
          everything else — and any <strong>feedback corrections</strong> — waits here for one click. Nothing reaches your
          <code className="px-1">feedback.md</code> without your approval.
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {(['pending', 'auto'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-accent text-text' : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {t === 'pending' ? 'Pending review' : 'Auto-captured'}
            <span className="ml-1.5 text-[10px] bg-surface-2 text-text-muted px-1.5 py-0.5 rounded-full">
              {t === 'pending' ? counts.pending : counts.auto}
            </span>
          </button>
        ))}
      </div>

      {/* States: loading → error → empty → list (3 visually distinct) */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-surface-2/50 border border-border animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <div className="text-sm text-text">Couldn't load the inbox</div>
          <div className="text-xs text-text-muted max-w-sm">{error}</div>
          <button onClick={refetch} className="mt-1 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center">
            <Check className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="text-sm font-medium text-text">{tab === 'pending' ? 'Inbox zero' : 'Nothing auto-captured yet'}</div>
          <div className="text-xs text-text-muted max-w-xs">
            {tab === 'pending'
              ? 'No learnings waiting for review. New ones appear here after the nightly digest.'
              : 'High-confidence lessons captured automatically will show up here.'}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([key, g]) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-[13px] font-medium text-text">{g.project}</span>
                <span className="text-[11px] text-text-muted">· {g.items.length} item{g.items.length > 1 ? 's' : ''} · {relTime(g.createdAt)}</span>
              </div>
              <div className="space-y-2.5">
                {g.items.map((c) => (
                  <CandidateCard
                    key={c.id}
                    c={c}
                    readOnly={tab === 'auto'}
                    busy={busyId === c.id}
                    editing={editId === c.id}
                    onEdit={() => setEditId(c.id)}
                    onCancelEdit={() => setEditId(null)}
                    onSaved={() => { setEditId(null); refetch() }}
                    onApprove={() => handleApprove(c)}
                    onReject={() => handleReject(c)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface CardProps {
  c: LearningCandidate
  readOnly: boolean
  busy: boolean
  editing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSaved: () => void
  onApprove: () => void
  onReject: () => void
}

function CandidateCard({ c, readOnly, busy, editing, onEdit, onCancelEdit, onSaved, onApprove, onReject }: CardProps) {
  const meta = TYPE_META[c.type] ?? TYPE_META.lesson
  const { Icon } = meta
  const pct = Math.round((c.confidence ?? 0) * 100)
  const entries = Object.entries(c.payload || {}).filter(([, v]) => v && String(v).trim())

  if (editing) return <EditCard c={c} onCancel={onCancelEdit} onSaved={onSaved} />

  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${meta.cls}`}>
              <Icon className="w-3 h-3" /> {meta.label}
            </span>
            <span className={`text-[10px] ${pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-text-muted' : 'text-text-muted/60'}`}>
              {pct}% confident
            </span>
            {c.capturedRef && <span className="text-[10px] text-text-muted truncate">· {c.capturedRef}</span>}
          </div>
          <div className="text-[13px] font-medium text-text mb-1">{c.title}</div>
          <div className="space-y-0.5">
            {entries.slice(0, 5).map(([k, v]) => (
              <div key={k} className="text-[12px] text-text-secondary">
                <span className="text-text-muted">{k}:</span> {String(v).slice(0, 220)}
              </div>
            ))}
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onApprove} disabled={busy} title="Approve → save to memory"
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
            </button>
            <button onClick={onEdit} disabled={busy} title="Edit before saving"
              className="p-1.5 text-text-muted border border-border rounded-lg hover:bg-surface-2 hover:text-text transition-colors disabled:opacity-50">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onReject} disabled={busy} title="Reject"
              className="p-1.5 text-text-muted border border-border rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-50">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function EditCard({ c, onCancel, onSaved }: { c: LearningCandidate; onCancel: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(c.title)
  const [fields, setFields] = useState<Record<string, string>>({ ...c.payload })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await editCandidate(c.id, { title, payload: fields })
      toast('success', 'Updated')
      onSaved()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-surface p-3.5 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full text-[13px] font-medium bg-surface-2/50 border border-border rounded-lg px-2.5 py-1.5 text-text focus:outline-none focus:border-accent"
        placeholder="Title"
      />
      {Object.keys(fields).map((k) => (
        <div key={k}>
          <label className="text-[10px] text-text-muted uppercase tracking-wide">{k}</label>
          <textarea
            value={fields[k]}
            onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))}
            rows={2}
            className="w-full text-[12px] bg-surface-2/50 border border-border rounded-lg px-2.5 py-1.5 text-text-secondary focus:outline-none focus:border-accent resize-y"
          />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
        </button>
        <button onClick={onCancel} disabled={saving}
          className="px-2.5 py-1 text-[11px] text-text-muted border border-border rounded-lg hover:bg-surface-2 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
