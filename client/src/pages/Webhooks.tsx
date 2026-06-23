import { useState, useEffect } from 'react'
import { Globe, Plus, Trash2, Copy, Eye, EyeOff, AlertCircle, Check } from 'lucide-react'
import { getWebhooks, getWebhookSecret, createWebhook, deleteWebhook, getGlobalAgents, apiError } from '../lib/api'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import type { Webhook } from '../lib/api'
import { writeToClipboard } from '../lib/clipboard'
import type { Agent } from '../types'
import { resource } from '../lib/cacheCore'

function timeAgo(ts: string | null): string {
  if (!ts) return 'never'
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export default function WebhooksPage() {
  const webhooksRes = resource('webhooks', getWebhooks)
  const agentsRes = resource('global/agents', getGlobalAgents)

  const [webhooks, setWebhooks] = useState<Webhook[]>(() => webhooksRes.getState().data ?? [])
  const [agents, setAgents] = useState<Agent[]>(() => agentsRes.getState().data ?? [])
  const [loading, setLoading] = useState(() => webhooksRes.getState().data === null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', agentName: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    if (webhooksRes.getState().data === null) setLoading(true)
    setLoadError(null)
    Promise.all([webhooksRes.refetch(), agentsRes.refetch()])
      .then(([w, a]) => { setWebhooks(w); setAgents(a) })
      .catch(err => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load webhooks')
        apiError('Load webhooks', err)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.name || !form.agentName) { setError('Name and agent are required'); return }
    setSaving(true); setError('')
    try {
      await createWebhook(form)
      setShowForm(false)
      setForm({ name: '', agentName: '' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create webhook')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    setDeleting(true)
    try { await deleteWebhook(deleteId); setDeleteId(null); load() }
    catch (err) { apiError('Delete webhook', err) }
    finally { setDeleting(false) }
  }

  const handleRevealSecret = async (id: string) => {
    if (revealedSecrets[id]) {
      setRevealedSecrets(prev => { const next = { ...prev }; delete next[id]; return next })
      return
    }
    try {
      const { secret } = await getWebhookSecret(id)
      setRevealedSecrets(prev => ({ ...prev, [id]: secret }))
    } catch (err) { apiError('Get webhook secret', err) }
  }

  const copyToClipboard = async (text: string, label: string) => {
    if (!(await writeToClipboard(text))) return
    setCopied(label)
    setTimeout(() => setCopied(''), 2000)
  }

  const getTriggerUrl = (id: string) => `${window.location.origin}/api/webhooks/trigger/${id}`

  if (loading) return <Spinner />
  if (loadError) return <ErrorState message={loadError} onRetry={load} />

  return (
    <div className="space-y-6">
      {/* Create button — hub provides the page title */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary btn-md"
        >
          <Plus className="w-4 h-4" /> New Webhook
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold">Create Webhook</h2>
          {error && (
            <div className="flex items-center gap-2 text-red text-xs bg-red/10 px-3 py-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="webhook-name" className="block text-xs text-text-muted mb-1">Name</label>
              <input
                id="webhook-name"
                className="input"
                placeholder="GitHub Deploy Hook"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="webhook-agent" className="block text-xs text-text-muted mb-1">Agent</label>
              <select
                id="webhook-agent"
                className="input"
                value={form.agentName}
                onChange={e => setForm({ ...form, agentName: e.target.value })}
              >
                <option value="">Select agent...</option>
                {agents.map(a => (
                  <option key={a.filename} value={a.filename}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary btn-md">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary btn-md">
              {saving ? 'Creating...' : 'Create Webhook'}
            </button>
          </div>
        </div>
      )}

      {/* Webhook List */}
      <div className="space-y-3">
        {webhooks.map(w => (
          <div key={w.id} className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{w.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange/20 text-orange font-medium">
                    {w.agentName || 'orchestration'}
                  </span>
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  Triggered {w.triggerCount} times &middot; Last: {timeAgo(w.lastTriggeredAt)}
                </div>
              </div>
              <button onClick={() => setDeleteId(w.id)} aria-label="Delete webhook" title="Delete webhook" className="p-1.5 rounded-lg text-text-muted hover:text-red hover:bg-red/10 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Trigger URL */}
            <div className="bg-surface-2 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-text-muted font-semibold">Trigger URL</label>
                <button
                  onClick={() => copyToClipboard(getTriggerUrl(w.id), `url-${w.id}`)}
                  className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover"
                >
                  {copied === `url-${w.id}` ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
              <code className="block text-xs text-text-muted break-all font-mono">{getTriggerUrl(w.id)}</code>
            </div>

            {/* Secret */}
            <div className="bg-surface-2 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-text-muted font-semibold">Secret (x-webhook-secret header)</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRevealSecret(w.id)}
                    className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover"
                  >
                    {revealedSecrets[w.id] ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Reveal</>}
                  </button>
                  {revealedSecrets[w.id] && (
                    <button
                      onClick={() => copyToClipboard(revealedSecrets[w.id], `secret-${w.id}`)}
                      className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover"
                    >
                      {copied === `secret-${w.id}` ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  )}
                </div>
              </div>
              <code className="block text-xs text-text-muted break-all font-mono">
                {revealedSecrets[w.id] || w.secret}
              </code>
            </div>

            {/* Usage example */}
            <details className="text-xs">
              <summary className="text-text-muted cursor-pointer hover:text-text">Usage example (curl)</summary>
              <pre className="mt-2 bg-surface-2 rounded-lg p-3 text-[11px] text-text-muted overflow-x-auto font-mono">
{`curl -X POST \\
  ${getTriggerUrl(w.id)} \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: YOUR_SECRET" \\
  -d '{"event": "deploy", "ref": "main"}'`}
              </pre>
            </details>
          </div>
        ))}
        {webhooks.length === 0 && !showForm && (
          <EmptyState
            icon={Globe}
            title="No webhooks yet"
            description="Create a webhook to trigger agents from external events"
            action={{ label: 'New Webhook', onClick: () => setShowForm(true) }}
            card
          />
        )}
      </div>

      <ConfirmDialog
        danger
        open={deleteId !== null}
        loading={deleting}
        title="Delete webhook?"
        message={
          deleteId !== null
            ? `"${webhooks.find(w => w.id === deleteId)?.name ?? 'This webhook'}" will be permanently deleted. Its trigger URL will stop working.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  )
}
