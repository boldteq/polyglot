// Phase 5 — Admin tuning page. Single surface for editing every app_config
// value, plus the dispatch policy. Backed by /api/app-config endpoints. All
// edits broadcast a `config:update` SSE event so every other open page picks
// up the new value within a second — no reload needed.

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import {
  History,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  getAppConfig,
  getConfigSchemas,
  getConfigAudit,
  updateAppConfigKey,
  updateDispatchPolicy,
  upsertModel,
  upsertPod,
  deletePod,
  replaceModelPolicy,
  type AppConfigResponse,
  type ConfigSchemaEntry,
  type DispatchPolicy,
  type ConfigAuditEntry,
  type ModelDef,
  type PodDef,
  type ModelPolicyRow,
} from '../lib/api'
import { toast } from '../components/Toast'
import { confirmDialog } from '../lib/confirm'

const CATEGORY_LABELS: Record<string, string> = {
  health: 'Health Thresholds',
  time: 'Time Windows',
  api_limits: 'API Limits',
  ui_caps: 'UI Display Caps',
  defaults: 'Default Values',
  database: 'Database Governance',
}

const CATEGORY_ORDER = ['health', 'time', 'api_limits', 'ui_caps', 'defaults', 'database']

export default function SettingsTuning() {
  const [data, setData] = useState<AppConfigResponse | null>(null)
  const [schemas, setSchemas] = useState<Record<string, ConfigSchemaEntry>>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [openAudit, setOpenAudit] = useState<string | null>(null)
  const [auditRows, setAuditRows] = useState<ConfigAuditEntry[]>([])
  const [auditError, setAuditError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([getAppConfig(), getConfigSchemas()])
      .then(([cfg, schemaResp]) => {
        setData(cfg)
        setSchemas(schemaResp.keys)
      })
      .catch((err) => {
        toast('error', err instanceof Error ? err.message : 'Failed to load config')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSave = useCallback(async (key: string, value: unknown, category: string) => {
    setSavingKey(key)
    try {
      await updateAppConfigKey(key, value, category)
      toast('success', `${key} = ${typeof value === 'object' ? JSON.stringify(value) : value}`)
      // Refetch — SSE will broadcast to other tabs automatically.
      const fresh = await getAppConfig()
      setData(fresh)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingKey(null)
    }
  }, [])

  const handleSaveDispatch = useCallback(async (next: DispatchPolicy) => {
    setSavingKey('dispatch_policy')
    try {
      await updateDispatchPolicy(next)
      toast('success', 'Dispatch policy saved')
      const fresh = await getAppConfig()
      setData(fresh)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingKey(null)
    }
  }, [])

  const openAuditFor = async (key: string) => {
    if (openAudit === key) { setOpenAudit(null); return }
    setOpenAudit(key)
    setAuditError(null)
    setAuditRows([])
    try {
      const res = await getConfigAudit({ key, limit: 20 })
      setAuditRows(res.items)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load history'
      setAuditError(msg)
      toast('error', `History: ${msg}`)
    }
  }

  // Models/Pods/Model-policy mutations all refetch the whole config so the SSE
  // broadcast + local state stay in sync. Mirrors handleSave's refetch pattern.
  const refresh = useCallback(async () => {
    const fresh = await getAppConfig()
    setData(fresh)
  }, [])

  const handleSaveModel = useCallback(async (m: { id: string; displayName: string; tier: string; costPenalty: number; enabled: number }) => {
    try {
      await upsertModel(m)
      toast('success', `Model ${m.id} saved`)
      await refresh()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed')
    }
  }, [refresh])

  const handleUpsertPod = useCallback(async (p: PodDef) => {
    try {
      await upsertPod(p)
      toast('success', `Pod ${p.id} saved`)
      await refresh()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed')
    }
  }, [refresh])

  const handleDeletePod = useCallback(async (id: string) => {
    const ok = await confirmDialog({ title: 'Delete pod?', message: `Remove pod "${id}"? Agents referencing it keep their prefix but lose the grouping.`, danger: true, confirmLabel: 'Delete' })
    if (!ok) return
    try {
      await deletePod(id)
      toast('success', `Pod ${id} deleted`)
      await refresh()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Delete failed')
    }
  }, [refresh])

  const handleSaveModelPolicy = useCallback(async (rows: ModelPolicyRow[]) => {
    try {
      // Atomic full-replace. Strip the read-only id; map enabled boolean→number.
      await replaceModelPolicy(rows.map(r => ({ pattern: r.pattern, model: r.model, tier: r.tier, agents: r.agents, priority: r.priority, enabled: r.enabled ? 1 : 0 })))
      toast('success', 'Model policy saved')
      await refresh()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed')
    }
  }, [refresh])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading config...
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      {data.fallbackActive && (
        <div className="bg-amber/10 border border-amber/30 rounded-xl p-3 flex items-center gap-2 text-xs text-amber">
          <AlertTriangle className="w-4 h-4" />
          Fallback config in use — backend could not read app_config from SQLite. Values reflect hardcoded defaults.
        </div>
      )}

      <p className="text-[13px] text-text-muted">Live-tune health thresholds, time windows, API limits, UI caps, defaults & dispatch policy. Changes propagate via SSE.</p>

      {CATEGORY_ORDER.map((category) => {
        const groupConfig = (data.config as unknown as Record<string, Record<string, unknown>>)[category]
        if (!groupConfig) return null
        const groupKeys = Object.entries(groupConfig).filter(([leaf]) => schemas[`${category}.${leaf}`])
        if (groupKeys.length === 0) return null
        return (
          <section key={category} className="card overflow-hidden">
            <header className="px-5 py-3 border-b border-border">
              <h2 className="text-sm font-bold">{CATEGORY_LABELS[category]}</h2>
            </header>
            <div className="divide-y divide-border/50">
              {groupKeys.map(([leaf, value]) => {
                const fullKey = `${category}.${leaf}`
                const schema = schemas[fullKey]
                return (
                  <ConfigRow
                    key={fullKey}
                    fullKey={fullKey}
                    leaf={leaf}
                    value={value}
                    schema={schema}
                    category={category}
                    saving={savingKey === fullKey}
                    onSave={handleSave}
                    onAudit={openAuditFor}
                    auditOpen={openAudit === fullKey}
                    auditRows={openAudit === fullKey ? auditRows : []}
                    auditError={openAudit === fullKey ? auditError : null}
                  />
                )
              })}
            </div>
          </section>
        )
      })}

      <DispatchPolicySection
        policy={data.dispatchPolicy}
        onSave={handleSaveDispatch}
        saving={savingKey === 'dispatch_policy'}
      />

      <ModelsSection models={data.models} onSave={handleSaveModel} />

      <PodsSection pods={data.pods} onSave={handleUpsertPod} onDelete={handleDeletePod} />

      <ModelPolicySection rows={data.modelPolicy} onSave={handleSaveModelPolicy} />
    </div>
  )
}

function ConfigRow({
  fullKey, leaf, value, schema, category, saving, onSave, onAudit, auditOpen, auditRows, auditError,
}: {
  fullKey: string
  leaf: string
  value: unknown
  schema: ConfigSchemaEntry
  category: string
  saving: boolean
  onSave: (key: string, value: unknown, category: string) => void
  onAudit: (key: string) => void
  auditOpen: boolean
  auditRows: ConfigAuditEntry[]
  auditError: string | null
}) {
  const [draft, setDraft] = useState<string>(String(value ?? ''))
  useEffect(() => { setDraft(String(value ?? '')) }, [value])

  const dirty = draft !== String(value ?? '')

  const parseDraft = (): unknown => {
    if (schema.type === 'number') return Number(draft)
    if (schema.type === 'boolean') return draft === 'true'
    return draft
  }

  // Boolean keys render an inline toggle that saves immediately on click.
  if (schema.type === 'boolean') {
    const on = value === true
    return (
      <div className="px-5 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{schema.label}</div>
            <div className="text-[10px] text-text-muted font-mono">{leaf}</div>
            {schema.description && <div className="text-[10px] text-text-muted mt-0.5">{schema.description}</div>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${schema.label} toggle`}
              disabled={saving}
              onClick={() => onSave(fullKey, !on, category)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-accent' : 'bg-surface-2 border border-border'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
            <span className="text-[11px] font-mono w-7 text-text-muted">{on ? 'on' : 'off'}</span>
            <button
              onClick={() => onAudit(fullKey)}
              className="p-1.5 text-text-muted hover:text-text rounded-lg transition-colors"
              title="History"
              aria-label="View change history"
            >
              <History className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <AuditTrail open={auditOpen} error={auditError} rows={auditRows} />
      </div>
    )
  }

  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{schema.label}</div>
          <div className="text-[10px] text-text-muted font-mono">{leaf}</div>
        </div>
        <div className="flex items-center gap-2">
          {schema.type === 'enum' ? (
            <select
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={schema.label}
              className="input w-auto text-xs py-1.5"
            >
              {schema.options!.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : (
            <input
              type={schema.type === 'number' ? 'number' : 'text'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={schema.label}
              min={schema.min}
              max={schema.max}
              step={schema.step}
              className="input w-24 text-xs py-1.5 font-mono text-right"
            />
          )}
          <button
            onClick={() => onSave(fullKey, parseDraft(), category)}
            disabled={!dirty || saving}
            className="btn-primary btn-sm"
          >
            {saving ? '...' : 'Save'}
          </button>
          <button
            onClick={() => onAudit(fullKey)}
            className="p-1.5 text-text-muted hover:text-text rounded-lg transition-colors"
            title="History"
            aria-label="View change history"
          >
            <History className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <AuditTrail open={auditOpen} error={auditError} rows={auditRows} />
    </div>
  )
}

// Audit dropdown — three visually distinct states (error / empty / rows) so a
// fetch failure is never mistaken for "no history" (error-handling.md rule).
function AuditTrail({ open, error, rows }: { open: boolean; error: string | null; rows: ConfigAuditEntry[] }) {
  if (!open) return null
  return (
    <div className="mt-3 ml-1 pl-3 border-l border-border space-y-1">
      {error ? (
        <div className="text-[10px] text-red flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-[10px] text-text-muted">No history.</div>
      ) : rows.map((row) => (
        <div key={row.id} className="text-[10px] font-mono text-text-muted flex items-center gap-2">
          <span>{new Date(row.changedAt).toLocaleString()}</span>
          <span className="text-text">{formatValue(row.before)} → {formatValue(row.after)}</span>
          <span className="text-text-muted/70">{row.source}</span>
        </div>
      ))}
    </div>
  )
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const DispatchPolicySection = memo(function DispatchPolicySection({
  policy, onSave, saving,
}: {
  policy: DispatchPolicy
  onSave: (next: DispatchPolicy) => void
  saving: boolean
}) {
  const [draft, setDraft] = useState<DispatchPolicy>(policy)
  useEffect(() => { setDraft(policy) }, [policy])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(policy), [draft, policy])

  const weightKeys: Array<keyof DispatchPolicy> = ['skill_weight', 'load_weight', 'success_weight', 'cost_weight_normal', 'cost_weight_downgrade']

  return (
    <section className="card overflow-hidden">
      <header className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-bold">Dispatch Policy</h2>
        <p className="text-[10px] text-text-muted">Weights used to rank candidate agents for each task.</p>
      </header>
      <div className="px-5 py-4 space-y-3">
        {weightKeys.map((k) => (
          <div key={k} className="flex items-center gap-3">
            <label className="text-xs font-medium w-44 text-text-muted">{k}</label>
            <input
              type="range"
              aria-label={`${k} weight`}
              min={0}
              max={1}
              step={0.05}
              value={Number(draft[k])}
              onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="text-xs font-mono w-10 text-right">{Number(draft[k]).toFixed(2)}</span>
          </div>
        ))}
        <div className="border-t border-border/50 pt-3 space-y-2">
          <div className="text-[10px] text-text-muted font-bold">Priority Boost</div>
          {(['p0', 'p1', 'p2', 'p3'] as const).map((p) => (
            <div key={p} className="flex items-center gap-3">
              <label className="text-xs font-medium w-44 text-text-muted">{p}</label>
              <input
                type="range"
                aria-label={`${p} priority boost`}
                min={-0.5}
                max={0.5}
                step={0.05}
                value={draft.priority_boost[p]}
                onChange={(e) => setDraft({ ...draft, priority_boost: { ...draft.priority_boost, [p]: Number(e.target.value) } })}
                className="flex-1"
              />
              <span className="text-xs font-mono w-10 text-right">{draft.priority_boost[p].toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={() => onSave(draft)}
            disabled={!dirty || saving}
            className="btn-primary btn-sm"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Save Policy
          </button>
          {dirty && (
            <button
              onClick={() => setDraft(policy)}
              className="btn-ghost btn-sm"
            >
              Revert
            </button>
          )}
        </div>
      </div>
    </section>
  )
})

// ── Models ──────────────────────────────────────────────────────────────
// Read shape is snake_case (display_name/cost_penalty/enabled:number); the
// write API wants camelCase (displayName/costPenalty). No delete endpoint
// exists — disable a model instead of removing it.
const ModelsSection = memo(function ModelsSection({ models, onSave }: {
  models: ModelDef[]
  onSave: (m: { id: string; displayName: string; tier: string; costPenalty: number; enabled: number }) => void
}) {
  const [adding, setAdding] = useState(false)
  return (
    <section className="card overflow-hidden">
      <header className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold">Models</h2>
          <p className="text-[10px] text-text-muted">Models available to the dispatcher. Disable a model instead of deleting it.</p>
        </div>
        <button onClick={() => setAdding(a => !a)} className="btn-secondary btn-sm"><Plus className="w-3.5 h-3.5" /> Add</button>
      </header>
      <div className="divide-y divide-border/50">
        {adding && (
          <ModelRow
            key="__new__"
            model={{ id: '', display_name: '', tier: 'engineer', cost_penalty: 0.3, enabled: 1 }}
            isNew
            onSave={(m) => { onSave(m); setAdding(false) }}
            onCancel={() => setAdding(false)}
          />
        )}
        {models.length === 0 && !adding && <div className="px-5 py-4 text-xs text-text-muted">No models configured.</div>}
        {models.map(m => <ModelRow key={m.id} model={m} onSave={onSave} />)}
      </div>
    </section>
  )
})

function ModelRow({ model, isNew = false, onSave, onCancel }: {
  model: ModelDef
  isNew?: boolean
  onSave: (m: { id: string; displayName: string; tier: string; costPenalty: number; enabled: number }) => void
  onCancel?: () => void
}) {
  const [id, setId] = useState(model.id)
  const [displayName, setDisplayName] = useState(model.display_name)
  const [tier, setTier] = useState(model.tier)
  const [costPenalty, setCostPenalty] = useState(String(model.cost_penalty))
  const [enabled, setEnabled] = useState(model.enabled === 1)

  useEffect(() => {
    if (isNew) return
    setDisplayName(model.display_name); setTier(model.tier); setCostPenalty(String(model.cost_penalty)); setEnabled(model.enabled === 1)
  }, [model, isNew])

  const valid = id.trim() !== '' && displayName.trim() !== '' && tier.trim() !== '' && !Number.isNaN(Number(costPenalty))
  const dirty = isNew
    ? valid
    : (displayName !== model.display_name || tier !== model.tier || Number(costPenalty) !== model.cost_penalty || enabled !== (model.enabled === 1))

  const save = () => onSave({ id: id.trim(), displayName: displayName.trim(), tier: tier.trim(), costPenalty: Number(costPenalty), enabled: enabled ? 1 : 0 })

  return (
    <div className="px-5 py-3 flex items-center gap-2 flex-wrap">
      {isNew
        ? <input value={id} onChange={e => setId(e.target.value)} placeholder="model id (e.g. claude-opus-4-8)" aria-label="Model id" className="input text-xs py-1.5 font-mono w-56" />
        : <span className="text-xs font-mono w-56 truncate" title={model.id}>{model.id}</span>}
      <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display name" aria-label="Model display name" className="input text-xs py-1.5 w-32" />
      <input value={tier} onChange={e => setTier(e.target.value)} placeholder="tier" aria-label="Model tier" className="input text-xs py-1.5 w-28" />
      <input type="number" step={0.05} min={0} value={costPenalty} onChange={e => setCostPenalty(e.target.value)} title="cost penalty" className="input text-xs py-1.5 w-20 font-mono text-right" />
      <button type="button" role="switch" aria-checked={enabled} aria-label="Model enabled" onClick={() => setEnabled(v => !v)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-accent' : 'bg-surface-2 border border-border'}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
      </button>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={save} disabled={!dirty || !valid} className="btn-primary btn-sm">Save</button>
        {isNew && onCancel && <button onClick={onCancel} className="btn-ghost btn-sm">Cancel</button>}
      </div>
    </div>
  )
}

// ── Pods ────────────────────────────────────────────────────────────────
const PodsSection = memo(function PodsSection({ pods, onSave, onDelete }: {
  pods: PodDef[]
  onSave: (p: PodDef) => void
  onDelete: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  return (
    <section className="card overflow-hidden">
      <header className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold">Pods</h2>
          <p className="text-[10px] text-text-muted">Agent-prefix groupings used by the dispatcher.</p>
        </div>
        <button onClick={() => setAdding(a => !a)} className="btn-secondary btn-sm"><Plus className="w-3.5 h-3.5" /> Add</button>
      </header>
      <div className="divide-y divide-border/50">
        {adding && <PodRow key="__new__" pod={{ id: '', prefix: '', department: '', description: '' }} isNew onSave={(p) => { onSave(p); setAdding(false) }} onCancel={() => setAdding(false)} />}
        {pods.length === 0 && !adding && <div className="px-5 py-4 text-xs text-text-muted">No pods configured.</div>}
        {pods.map(p => <PodRow key={p.id} pod={p} onSave={onSave} onDelete={onDelete} />)}
      </div>
    </section>
  )
})

function PodRow({ pod, isNew = false, onSave, onDelete, onCancel }: {
  pod: PodDef
  isNew?: boolean
  onSave: (p: PodDef) => void
  onDelete?: (id: string) => void
  onCancel?: () => void
}) {
  const [id, setId] = useState(pod.id)
  const [prefix, setPrefix] = useState(pod.prefix)
  const [department, setDepartment] = useState(pod.department ?? '')
  const [description, setDescription] = useState(pod.description ?? '')

  useEffect(() => {
    if (isNew) return
    setPrefix(pod.prefix); setDepartment(pod.department ?? ''); setDescription(pod.description ?? '')
  }, [pod, isNew])

  const valid = id.trim() !== '' && prefix.trim() !== ''
  const dirty = isNew
    ? valid
    : (prefix !== pod.prefix || department !== (pod.department ?? '') || description !== (pod.description ?? ''))

  const save = () => onSave({ id: id.trim(), prefix: prefix.trim(), department: department.trim() || null, description: description.trim() || null })

  return (
    <div className="px-5 py-3 flex items-center gap-2 flex-wrap">
      {isNew
        ? <input value={id} onChange={e => setId(e.target.value)} placeholder="pod id" aria-label="Pod id" className="input text-xs py-1.5 font-mono w-32" />
        : <span className="text-xs font-mono w-32 truncate" title={pod.id}>{pod.id}</span>}
      <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="prefix" aria-label="Pod prefix" className="input text-xs py-1.5 w-24 font-mono" />
      <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="department" aria-label="Pod department" className="input text-xs py-1.5 w-36" />
      <input value={description} onChange={e => setDescription(e.target.value)} placeholder="description" aria-label="Pod description" className="input text-xs py-1.5 flex-1 min-w-[8rem]" />
      <div className="ml-auto flex items-center gap-2">
        <button onClick={save} disabled={!dirty || !valid} className="btn-primary btn-sm">Save</button>
        {isNew
          ? (onCancel && <button onClick={onCancel} className="btn-ghost btn-sm">Cancel</button>)
          : (onDelete && <button onClick={() => onDelete(pod.id)} className="p-1.5 text-text-muted hover:text-red rounded-lg" title="Delete pod" aria-label="Delete pod"><Trash2 className="w-3.5 h-3.5" /></button>)}
      </div>
    </div>
  )
}

// ── Model Policy ────────────────────────────────────────────────────────
// Atomic full-replace: edit the whole list locally, save all rows at once.
const ModelPolicySection = memo(function ModelPolicySection({ rows, onSave }: {
  rows: ModelPolicyRow[]
  onSave: (rows: ModelPolicyRow[]) => void
}) {
  const [draft, setDraft] = useState<ModelPolicyRow[]>(rows)
  useEffect(() => { setDraft(rows) }, [rows])
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(rows), [draft, rows])

  const update = (i: number, patch: Partial<ModelPolicyRow>) => setDraft(d => d.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const remove = (i: number) => setDraft(d => d.filter((_, idx) => idx !== i))
  const add = () => setDraft(d => [...d, { id: -Date.now(), pattern: '', model: '', tier: '', agents: [], priority: 0, enabled: true }])

  return (
    <section className="card overflow-hidden">
      <header className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold">Model Policy</h2>
          <p className="text-[10px] text-text-muted">Pattern → model routing rules. Saved atomically as a full replace.</p>
        </div>
        <button onClick={add} className="btn-secondary btn-sm"><Plus className="w-3.5 h-3.5" /> Add Rule</button>
      </header>
      <div className="divide-y divide-border/50">
        {draft.length === 0 && <div className="px-5 py-4 text-xs text-text-muted">No policy rules.</div>}
        {draft.map((r, i) => (
          <div key={r.id} className="px-5 py-3 flex items-center gap-2 flex-wrap">
            <input value={r.pattern} onChange={e => update(i, { pattern: e.target.value })} placeholder="pattern" aria-label="Agent-name pattern" className="input text-xs py-1.5 w-40 font-mono" />
            <input value={r.model} onChange={e => update(i, { model: e.target.value })} placeholder="model" aria-label="Model" className="input text-xs py-1.5 w-44 font-mono" />
            <input value={r.tier} onChange={e => update(i, { tier: e.target.value })} placeholder="tier" aria-label="Tier" className="input text-xs py-1.5 w-24" />
            <input value={r.agents.join(', ')} onChange={e => update(i, { agents: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="agents (comma-sep)" aria-label="Agents (comma-separated)" className="input text-xs py-1.5 w-40" />
            <input type="number" value={String(r.priority)} onChange={e => update(i, { priority: Number(e.target.value) })} title="priority" className="input text-xs py-1.5 w-16 font-mono text-right" />
            <button type="button" role="switch" aria-checked={r.enabled} aria-label="Rule enabled" onClick={() => update(i, { enabled: !r.enabled })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${r.enabled ? 'bg-accent' : 'bg-surface-2 border border-border'}`}>
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${r.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
            <button onClick={() => remove(i)} className="ml-auto p-1.5 text-text-muted hover:text-red rounded-lg" title="Remove rule" aria-label="Remove rule"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      <div className="px-5 py-3 border-t border-border flex items-center gap-2">
        <button onClick={() => onSave(draft)} disabled={!dirty} className="btn-primary btn-sm"><CheckCircle2 className="w-3.5 h-3.5" /> Save Policy</button>
        {dirty && <button onClick={() => setDraft(rows)} className="btn-ghost btn-sm">Revert</button>}
      </div>
    </section>
  )
})
