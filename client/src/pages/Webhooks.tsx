import { useState, useEffect } from 'react'
import { Globe, Plus, Trash2, Copy, Eye, EyeOff, AlertCircle, Check } from 'lucide-react'
import { getWebhooks, getWebhookSecret, createWebhook, deleteWebhook, getGlobalAgents, apiError } from '../lib/api'
import { ErrorState } from '../components/ErrorState'
import type { Webhook } from '../lib/api'
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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook?')) return
    try { await deleteWebhook(id); load() } catch (err) { apiError('Delete webhook', err) }
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(''), 2000)
  }

  const getTriggerUrl = (id: string) => `${window.location.origin}/api/webhooks/trigger/${id}`

  if (loading) return <div className="p-8 text-text-muted">Loading webhooks...</div>
  if (loadError) return <ErrorState message={loadError} onRetry={load} />

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="w-6 h-6" /> Webhooks
          </h1>
          <p className="text-text-muted text-sm mt-1">Trigger agents from external events (GitHub, Stripe, etc.)</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          <Plus className="w-4 h-4" /> New Webhook
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
          <h2 className="text-sm font-semibold">Create Webhook</h2>
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 px-3 py-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Name</label>
              <input
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent outline-none"
                placeholder="GitHub Deploy Hook"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Agent</label>
              <select
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent outline-none"
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
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-lg bg-surface-2 hover:bg-surface-2/80">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Webhook'}
            </button>
          </div>
        </div>
      )}

      {/* Webhook List */}
      <div className="space-y-3">
        {webhooks.map(w => (
          <div key={w.id} className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{w.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-medium">
                    {w.agentName || 'orchestration'}
                  </span>
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  Triggered {w.triggerCount} times &middot; Last: {timeAgo(w.lastTriggeredAt)}
                </div>
              </div>
              <button onClick={() => handleDelete(w.id)} className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Trigger URL */}
            <div className="bg-surface-2 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-text-muted uppercase font-semibold">Trigger URL</label>
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
                <label className="text-[10px] text-text-muted uppercase font-semibold">Secret (x-webhook-secret header)</label>
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
          <div className="text-center py-12 text-text-muted">
            <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No webhooks yet</p>
            <p className="text-xs mt-1">Create a webhook to trigger agents from external events</p>
          </div>
        )}
      </div>
    </div>
  )
}
