import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  GraduationCap, ArrowLeft, Plus, Trash2, ChefHat, Clock, X, Edit2,
} from 'lucide-react'
import { getTraining, addTraining, deleteTraining, bakeTraining, updateTraining } from '../lib/api'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { ErrorState } from '../components/ErrorState'
import { toast } from '../components/Toast'
import type { TrainingCorrection } from '../types'

export default function TrainingView() {
  const { name } = useParams()
  const navigate = useNavigate()
  const { data: corrections, loading, error, refetch } = useApi(() => getTraining(name!), [name], CacheKeys.training(name!))

  const [adding, setAdding] = useState(false)
  const [issue, setIssue] = useState('')
  const [correction, setCorrection] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [baking, setBaking] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editIssue, setEditIssue] = useState('')
  const [editCorrection, setEditCorrection] = useState('')

  const active = (corrections || []).filter(c => c.status === 'active')
  const archived = (corrections || []).filter(c => c.status !== 'active')

  const handleAdd = async () => {
    if (!issue.trim() || !correction.trim()) return
    setSubmitting(true)
    try {
      await addTraining(name!, issue.trim(), correction.trim())
      setIssue('')
      setCorrection('')
      setAdding(false)
      refetch()
      toast('success', 'Correction added')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this correction?')) return
    try {
      await deleteTraining(name!, id)
      refetch()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleBake = async () => {
    if (!confirm(`Bake ${active.length} correction(s) permanently into the agent's system prompt? This cannot be undone.`)) return
    setBaking(true)
    try {
      const result = await bakeTraining(name!)
      refetch()
      toast('success', `${result.baked} corrections baked into agent prompt`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to bake')
    } finally {
      setBaking(false)
    }
  }

  const startEdit = (c: TrainingCorrection) => {
    setEditingId(c.id)
    setEditIssue(c.issue)
    setEditCorrection(c.correction)
  }

  const handleUpdate = async () => {
    if (!editingId || !editIssue.trim() || !editCorrection.trim()) return
    try {
      await updateTraining(name!, editingId, { issue: editIssue.trim(), correction: editCorrection.trim() })
      setEditingId(null)
      refetch()
      toast('success', 'Correction updated')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to update')
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            <GraduationCap className="w-6 h-6 text-accent" />
            Training — {name}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {active.length} active correction{active.length !== 1 ? 's' : ''} will be injected into the next run
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Correction
          </button>
          {active.length >= 3 && (
            <button
              onClick={handleBake}
              disabled={baking}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber/10 text-amber border border-amber/30 rounded-lg hover:bg-amber/20 disabled:opacity-40 transition-colors"
            >
              <ChefHat className="w-4 h-4" />
              {baking ? 'Baking...' : `Bake ${active.length} into Prompt`}
            </button>
          )}
        </div>
      </div>

      {/* Bake explanation */}
      {active.length >= 5 && (
        <div className="bg-amber/5 border border-amber/20 rounded-xl p-4 mb-6">
          <p className="text-xs text-amber font-medium mb-1">Consolidation recommended</p>
          <p className="text-xs text-text-secondary">
            You have {active.length} active corrections. Baking them into the agent's prompt will make them permanent
            and reduce runtime injection overhead.
          </p>
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="bg-surface border border-accent/30 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold">New Correction</p>
            <button onClick={() => setAdding(false)} className="text-text-muted hover:text-text">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">What was wrong?</label>
              <input
                value={issue}
                onChange={e => setIssue(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
                placeholder="e.g., Used bullet points instead of a table for competitor analysis"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">What should it do instead?</label>
              <textarea
                value={correction}
                onChange={e => setCorrection(e.target.value)}
                rows={3}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
                placeholder="e.g., Always use a markdown table with columns: Name, Pricing, Key Feature, Weakness"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={submitting || !issue.trim() || !correction.trim()}
              className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-colors"
            >
              {submitting ? 'Adding...' : 'Add Correction'}
            </button>
          </div>
        </div>
      )}

      {/* Active corrections */}
      {active.length === 0 && !adding ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <GraduationCap className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">No corrections yet</p>
          <p className="text-text-muted text-sm mt-1">
            Run the agent in Playground, rate the output, and corrections will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map(c => (
            <div key={c.id} className="group bg-surface border border-border rounded-xl p-4 hover:border-accent/30 transition-all">
              {editingId === c.id ? (
                <div className="space-y-3">
                  <input
                    value={editIssue}
                    onChange={e => setEditIssue(e.target.value)}
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
                  />
                  <textarea
                    value={editCorrection}
                    onChange={e => setEditCorrection(e.target.value)}
                    rows={2}
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleUpdate} className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-text-secondary hover:text-text transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-red/80 mb-1">Issue: {c.issue}</p>
                      <p className="text-sm text-text">Correction: {c.correction}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-3">
                      <button
                        onClick={() => startEdit(c)}
                        className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-accent-muted transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1.5 rounded-md text-text-muted hover:text-red hover:bg-red-muted transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="flex items-center gap-1 text-[11px] text-text-muted">
                      <Clock className="w-3 h-3" />
                      {new Date(c.timestamp).toLocaleString()}
                    </span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                      active
                    </span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Archived corrections */}
      {archived.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Archived ({archived.length})
          </h2>
          <div className="space-y-2 opacity-60">
            {archived.map(c => (
              <div key={c.id} className="bg-surface border border-border rounded-lg p-3">
                <p className="text-xs text-text-muted">Issue: {c.issue}</p>
                <p className="text-xs text-text-secondary">Correction: {c.correction}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
