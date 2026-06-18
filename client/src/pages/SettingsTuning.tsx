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
} from 'lucide-react'
import {
  getAppConfig,
  getConfigSchemas,
  getConfigAudit,
  updateAppConfigKey,
  updateDispatchPolicy,
  type AppConfigResponse,
  type ConfigSchemaEntry,
  type DispatchPolicy,
  type ConfigAuditEntry,
} from '../lib/api'
import { toast } from '../components/Toast'

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
    try {
      const res = await getConfigAudit({ key, limit: 20 })
      setAuditRows(res.items)
    } catch (err) {
      console.error('[tuning] audit fetch failed:', err)
      setAuditRows([])
    }
  }

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
    </div>
  )
}

function ConfigRow({
  fullKey, leaf, value, schema, category, saving, onSave, onAudit, auditOpen, auditRows,
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
        {auditOpen && (
          <div className="mt-3 ml-1 pl-3 border-l border-border space-y-1">
            {auditRows.length === 0 ? (
              <div className="text-[10px] text-text-muted">No history.</div>
            ) : auditRows.map((row) => (
              <div key={row.id} className="text-[10px] font-mono text-text-muted flex items-center gap-2">
                <span>{new Date(row.changedAt).toLocaleString()}</span>
                <span className="text-text">{formatValue(row.before)} → {formatValue(row.after)}</span>
                <span className="text-text-muted/70">{row.source}</span>
              </div>
            ))}
          </div>
        )}
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
              className="input w-auto text-xs py-1.5"
            >
              {schema.options!.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : (
            <input
              type={schema.type === 'number' ? 'number' : 'text'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
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
      {auditOpen && (
        <div className="mt-3 ml-1 pl-3 border-l border-border space-y-1">
          {auditRows.length === 0 ? (
            <div className="text-[10px] text-text-muted">No history.</div>
          ) : auditRows.map((row) => (
            <div key={row.id} className="text-[10px] font-mono text-text-muted flex items-center gap-2">
              <span>{new Date(row.changedAt).toLocaleString()}</span>
              <span className="text-text">{formatValue(row.before)} → {formatValue(row.after)}</span>
              <span className="text-text-muted/70">{row.source}</span>
            </div>
          ))}
        </div>
      )}
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
