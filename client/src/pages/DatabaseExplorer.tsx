import { useState, useEffect } from 'react'
import {
  Database, Table, Play, ChevronLeft, ChevronRight, HardDrive, Search,
  Pencil, X, Check, Trash2, RotateCcw, History, Download, Shield, ChevronDown,
} from 'lucide-react'
import {
  getDbTables, getDbTable, runDbQuery, getDbStats,
  updateDbRow, deleteDbRow, getDbChanges, revertDbChange,
} from '../lib/api'
import type {
  DbTableInfo, DbTableData, DbQueryResult, DbStats, DbChangeEntry,
} from '../lib/api'
import { toast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

type View = 'tables' | 'query' | 'history' | 'info'

export default function DatabaseExplorer() {
  const [tables, setTables] = useState<DbTableInfo[]>([])
  const [stats, setStats] = useState<DbStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTable, setActiveTable] = useState<string | null>(null)
  const [tableData, setTableData] = useState<DbTableData | null>(null)
  const [tableLoading, setTableLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const [view, setView] = useState<View>('tables')
  const [sql, setSql] = useState('SELECT * FROM agents WHERE status = \'active\' LIMIT 20')
  const [queryResult, setQueryResult] = useState<DbQueryResult | null>(null)
  const [queryLoading, setQueryLoading] = useState(false)
  const [tableSearch, setTableSearch] = useState('')
  const [changes, setChanges] = useState<DbChangeEntry[]>([])
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null)
  const [editPk, setEditPk] = useState<string | null>(null)
  const [revertId, setRevertId] = useState<number | null>(null)
  const [reverting, setReverting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ pkCol: string; pkValue: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const limit = 50

  useEffect(() => {
    Promise.all([getDbTables(), getDbStats()])
      .then(([t, s]) => { setTables(t); setStats(s) })
      .catch(() => toast('error', 'Failed to load database info'))
      .finally(() => setLoading(false))
  }, [])

  const loadTable = (name: string, off = 0) => {
    setActiveTable(name)
    setOffset(off)
    setTableLoading(true)
    setView('tables')
    setEditingRow(null)
    setEditPk(null)
    getDbTable(name, limit, off)
      .then(setTableData)
      .catch(() => toast('error', 'Failed to load table'))
      .finally(() => setTableLoading(false))
  }

  const refreshTable = () => {
    if (activeTable) loadTable(activeTable, offset)
  }

  const handleQuery = () => {
    if (!sql.trim()) return
    setQueryLoading(true)
    setQueryResult(null)
    runDbQuery(sql.trim())
      .then(r => { setQueryResult(r); setView('query'); setActiveTable(null) })
      .catch(err => toast('error', err.message))
      .finally(() => setQueryLoading(false))
  }

  const loadChanges = () => {
    setView('history')
    getDbChanges(undefined, 200)
      .then(setChanges)
      .catch(() => toast('error', 'Failed to load changes'))
  }

  const handleRevert = async () => {
    if (revertId === null) return
    setReverting(true)
    try {
      await revertDbChange(revertId)
      toast('success', 'Change reverted')
      setRevertId(null)
      loadChanges()
      if (activeTable) refreshTable()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Revert failed')
    } finally {
      setReverting(false)
    }
  }

  const handleEdit = (row: Record<string, unknown>, pkCol: string) => {
    setEditingRow({ ...row })
    setEditPk(row[pkCol] as string)
  }

  const handleSaveEdit = async () => {
    if (!activeTable || !editPk || !editingRow) return
    try {
      await updateDbRow(activeTable, editPk, editingRow)
      toast('success', 'Row updated')
      setEditingRow(null)
      setEditPk(null)
      refreshTable()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Update failed')
    }
  }

  const handleDelete = (pkCol: string, pkValue: string) => {
    if (!activeTable) return
    setPendingDelete({ pkCol, pkValue })
  }

  const doDelete = async () => {
    if (!activeTable || !pendingDelete) return
    setDeleting(true)
    try {
      await deleteDbRow(activeTable, pendingDelete.pkValue)
      toast('success', 'Row deleted')
      setPendingDelete(null)
      refreshTable()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const totalRows = tables.reduce((s, t) => s + t.rowCount, 0)
  const filteredTables = tableSearch
    ? tables.filter(t => t.name.toLowerCase().includes(tableSearch.toLowerCase()))
    : tables

  const activeTableInfo = activeTable ? tables.find(t => t.name === activeTable) : null
  const pkCol = activeTableInfo?.columns.find(c => c.pk)?.name || null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* Stats bar */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-lg border border-border text-xs">
          <Database className="w-3.5 h-3.5 text-accent" />
          <span className="font-semibold">{stats?.tableCount}</span>
          <span className="text-text-muted">tables</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-lg border border-border text-xs">
          <Table className="w-3.5 h-3.5 text-blue" />
          <span className="font-semibold">{totalRows.toLocaleString()}</span>
          <span className="text-text-muted">rows</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-lg border border-border text-xs">
          <HardDrive className="w-3.5 h-3.5 text-green" />
          <span className="font-semibold">{stats?.sizeMb} MB</span>
        </div>
        <button
          onClick={loadChanges}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            view === 'history'
              ? 'bg-amber/15 text-amber border border-amber/30'
              : 'bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-2'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Change History
        </button>
        <a
          href="/api/db/export"
          download
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export JSON
        </a>
        <button
          onClick={() => setView(view === 'info' ? 'tables' : 'info')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            view === 'info'
              ? 'bg-green/15 text-green border border-green/30'
              : 'bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-2'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Backup & Recovery
        </button>
      </div>

      <div className="flex gap-4 min-h-[500px]">
        {/* Left: table list */}
        <div className="w-52 shrink-0 space-y-2">
          <div className="relative">
            <label htmlFor="table-search" className="sr-only">Filter tables</label>
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              id="table-search"
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              placeholder="Filter tables..."
              className="input pl-8 text-xs py-1.5"
            />
          </div>
          <div className="space-y-0.5 max-h-[520px] overflow-y-auto">
            {filteredTables.map(t => (
              <button
                key={t.name}
                onClick={() => loadTable(t.name)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-all ${
                  activeTable === t.name
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'hover:bg-surface-2 text-text-secondary border border-transparent'
                }`}
              >
                <span className="font-medium truncate">{t.name}</span>
                <span className={`text-[10px] font-mono shrink-0 ml-1 ${t.rowCount > 0 ? 'text-text-muted' : 'text-text-muted/40'}`}>
                  {t.rowCount}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: data view */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Query input */}
          <div className="flex gap-2">
            <textarea
              value={sql}
              onChange={e => setSql(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleQuery() }}
              placeholder="SELECT * FROM agents WHERE status = 'active'"
              rows={2}
              className="input flex-1 text-xs font-mono resize-y"
            />
            <button
              onClick={handleQuery}
              disabled={queryLoading || !sql.trim()}
              className="btn-primary btn-md self-start shrink-0"
            >
              {queryLoading ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              Run
            </button>
          </div>

          {/* Content area */}
          {view === 'info' ? (
            <BackupRecoveryInfo dbPath={stats?.path || ''} />
          ) : view === 'history' ? (
            <ChangeHistoryView changes={changes} onRevert={setRevertId} />
          ) : view === 'query' && queryResult ? (
            <QueryResultView result={queryResult} />
          ) : tableData && pkCol ? (
            <TableDataView
              data={tableData}
              loading={tableLoading}
              pkCol={pkCol}
              editingRow={editingRow}
              editPk={editPk}
              onEdit={handleEdit}
              onEditChange={(col, val) => setEditingRow(prev => prev ? { ...prev, [col]: val } : null)}
              onEditSave={handleSaveEdit}
              onEditCancel={() => { setEditingRow(null); setEditPk(null) }}
              onDelete={handleDelete}
              onPageChange={off => loadTable(activeTable!, off)}
              offset={offset}
              limit={limit}
            />
          ) : tableData ? (
            <TableDataView
              data={tableData}
              loading={tableLoading}
              pkCol={null}
              editingRow={null}
              editPk={null}
              onEdit={() => {}}
              onEditChange={() => {}}
              onEditSave={() => {}}
              onEditCancel={() => {}}
              onDelete={() => {}}
              onPageChange={off => loadTable(activeTable!, off)}
              offset={offset}
              limit={limit}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-text-muted text-sm">
              Select a table or run a query
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        danger
        open={revertId !== null}
        loading={reverting}
        title="Revert this change?"
        message="The row will be restored to its previous state. This overwrites the current values and cannot be undone except by reverting again."
        confirmLabel="Revert"
        onConfirm={handleRevert}
        onClose={() => setRevertId(null)}
      />

      <ConfirmDialog
        danger
        open={pendingDelete !== null}
        loading={deleting}
        title="Delete this row?"
        message={pendingDelete ? `Deletes the row where ${pendingDelete.pkCol} = ${pendingDelete.pkValue}. You can revert it later from Change History.` : ''}
        confirmLabel="Delete row"
        onConfirm={doDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}

// ── Change History View ──────────────────────────────────────────────────────

function ChangeHistoryView({ changes, onRevert }: { changes: DbChangeEntry[]; onRevert: (id: number) => void }) {
  if (changes.length === 0) {
    return (
      <div className="card p-8 text-center text-text-muted text-xs">
        No changes recorded yet. Edits and deletes will appear here with revert capability.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-text-muted font-semibold ">{changes.length} changes</p>
      <div className="space-y-1.5 max-h-[460px] overflow-y-auto">
        {changes.map(c => (
          <div
            key={c.id}
            className={`bg-surface border rounded-lg px-3 py-2.5 text-xs ${
              c.reverted ? 'border-border/50 opacity-50' : 'border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                  c.action === 'delete' ? 'bg-red/15 text-red' :
                  c.action === 'revert' ? 'bg-blue/15 text-blue' :
                  'bg-amber/15 text-amber'
                }`}>
                  {c.action}
                </span>
                <span className="font-semibold text-text">{c.tableName}</span>
                <span className="text-text-muted font-mono">{c.rowKey}</span>
              </div>
              <div className="flex items-center gap-2">
                {c.actor && <span className="text-[10px] text-text-muted">by {c.actor}</span>}
                <span className="text-[10px] text-text-muted">{new Date(c.changedAt).toLocaleString()}</span>
                {!c.reverted && c.action !== 'revert' && c.oldData && (
                  <button
                    onClick={() => onRevert(c.id)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue/10 text-blue hover:bg-blue/20 transition-colors"
                  >
                    <RotateCcw className="w-2.5 h-2.5" /> Revert
                  </button>
                )}
                {c.reverted && (
                  <span className="text-[10px] text-text-muted italic">reverted</span>
                )}
              </div>
            </div>
            {c.oldData && (
              <div className="text-[10px] text-text-muted font-mono bg-surface-2 rounded px-2 py-1 mt-1 max-h-20 overflow-hidden">
                {Object.entries(c.oldData).filter(([, v]) => v !== null).slice(0, 5).map(([k, v]) => (
                  <span key={k} className="mr-3">{k}: <span className="text-text-secondary">{String(v).slice(0, 40)}</span></span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Table Data View ──────────────────────────────────────────────────────────

function TableDataView({ data, loading, pkCol, editingRow, editPk, onEdit, onEditChange, onEditSave, onEditCancel, onDelete, onPageChange, offset, limit }: {
  data: DbTableData
  loading: boolean
  pkCol: string | null
  editingRow: Record<string, unknown> | null
  editPk: string | null
  onEdit: (row: Record<string, unknown>, pkCol: string) => void
  onEditChange: (col: string, val: string | null) => void
  onEditSave: () => void
  onEditCancel: () => void
  onDelete: (pkCol: string, pkValue: string) => void
  onPageChange: (offset: number) => void
  offset: number
  limit: number
}) {
  const totalPages = Math.ceil(data.total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold">{data.table}</h3>
          <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded-full">
            {data.total.toLocaleString()} rows
          </span>
        </div>
        {data.total > limit && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => onPageChange(Math.max(0, offset - limit))} disabled={offset === 0} aria-label="Previous page" className="p-1 rounded hover:bg-surface-2 disabled:opacity-30 text-text-muted">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-text-muted font-medium">{currentPage}/{totalPages}</span>
            <button onClick={() => onPageChange(offset + limit)} disabled={offset + limit >= data.total} aria-label="Next page" className="p-1 rounded hover:bg-surface-2 disabled:opacity-30 text-text-muted">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data.rows.length === 0 ? (
        <div className="card p-8 text-center text-text-muted text-xs">No rows</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-2/50">
                  {pkCol && <th className="w-16 px-2 py-2 text-left text-text-muted"></th>}
                  {data.columns.map(col => (
                    <th key={col} className="text-left px-3 py-2 font-semibold text-text-muted whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => {
                  const isEditing = pkCol && editPk === String(row[pkCol])
                  return (
                    <tr key={i} className={`group border-b border-border/50 transition-colors ${isEditing ? 'bg-accent/5' : 'hover:bg-surface-2/30'}`}>
                      {pkCol && (
                        <td className="px-2 py-1.5">
                          {isEditing ? (
                            <div className="flex items-center gap-0.5">
                              <button onClick={onEditSave} className="p-1 rounded text-green hover:bg-green/10" title="Save" aria-label="Save row">
                                <Check className="w-3 h-3" />
                              </button>
                              <button onClick={onEditCancel} className="p-1 rounded text-text-muted hover:bg-surface-2" title="Cancel" aria-label="Cancel edit">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                              <button onClick={() => onEdit(row, pkCol)} className="p-1 rounded text-text-muted hover:text-accent hover:bg-accent/10" title="Edit" aria-label="Edit row">
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button onClick={() => onDelete(pkCol, String(row[pkCol]))} className="p-1 rounded text-text-muted hover:text-red hover:bg-red/10" title="Delete" aria-label="Delete row">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                      {data.columns.map(col => {
                        const val = isEditing ? editingRow?.[col] : row[col]
                        if (isEditing && col !== pkCol) {
                          const strVal = val === null ? '' : String(val)
                          const isLong = strVal.length > 60
                          return (
                            <td key={col} className="px-1 py-1">
                              {isLong ? (
                                <textarea
                                  value={strVal}
                                  onChange={e => onEditChange(col, e.target.value || null)}
                                  rows={2}
                                  className="w-full bg-surface-2 border border-accent/30 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent resize-none min-w-[120px]"
                                />
                              ) : (
                                <input
                                  value={strVal}
                                  onChange={e => onEditChange(col, e.target.value || null)}
                                  className="w-full bg-surface-2 border border-accent/30 rounded px-2 py-1 text-xs focus:outline-none focus:border-accent min-w-[80px]"
                                />
                              )}
                            </td>
                          )
                        }
                        const display = val === null ? 'NULL' : String(val)
                        const isNull = val === null
                        const isJson = typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))
                        const isLong = display.length > 60
                        return (
                          <td
                            key={col}
                            className={`px-3 py-2 whitespace-nowrap max-w-[250px] overflow-hidden text-ellipsis ${
                              isNull ? 'text-text-muted/40 italic' : isJson ? 'font-mono text-[10px] text-blue' : 'text-text'
                            }`}
                            title={isLong ? display : undefined}
                          >
                            {isLong ? display.slice(0, 60) + '...' : display}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Query Result View ────────────────────────────────────────────────────────

function QueryResultView({ result }: { result: DbQueryResult }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-green bg-green/10 px-2 py-0.5 rounded-full font-semibold">
          {result.total} row{result.total !== 1 ? 's' : ''} in {result.duration}ms
        </span>
        {result.total > 500 && (
          <span className="text-[10px] text-amber">Showing first 500</span>
        )}
      </div>
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                {result.columns.map(col => (
                  <th key={col} className="text-left px-3 py-2 font-semibold text-text-muted whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-surface-2/30 transition-colors">
                  {result.columns.map(col => {
                    const val = row[col]
                    const display = val === null ? 'NULL' : String(val)
                    const isNull = val === null
                    const isJson = typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))
                    return (
                      <td
                        key={col}
                        className={`px-3 py-2 whitespace-nowrap max-w-[250px] overflow-hidden text-ellipsis ${
                          isNull ? 'text-text-muted/40 italic' : isJson ? 'font-mono text-[10px] text-blue' : 'text-text'
                        }`}
                        title={display.length > 60 ? display : undefined}
                      >
                        {display.length > 60 ? display.slice(0, 60) + '...' : display}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Backup & Recovery Info Panel ─────────────────────────────────────────────

function BackupRecoveryInfo({ dbPath }: { dbPath: string }) {
  const [openSection, setOpenSection] = useState<string | null>('overview')

  const toggle = (id: string) => setOpenSection(openSection === id ? null : id)

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => toggle(id)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-2/50 hover:bg-surface-2 transition-colors text-left"
      >
        <span className="text-sm font-semibold">{title}</span>
        <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${openSection === id ? 'rotate-180' : ''}`} />
      </button>
      {openSection === id && <div className="px-4 py-3 space-y-3 text-xs">{children}</div>}
    </div>
  )

  const Code = ({ children }: { children: string }) => (
    <pre className="bg-surface-2 border border-border rounded-lg px-3 py-2 font-mono text-[11px] text-text-secondary overflow-x-auto whitespace-pre-wrap select-all">{children}</pre>
  )

  const projectRoot = dbPath.replace('/data/polyglot.db', '')

  return (
    <div className="space-y-3 max-w-2xl">
      <Section id="overview" title="How Your Data Is Protected">
        <div className="space-y-2 text-text-secondary leading-relaxed">
          <p>Your data has <span className="font-semibold text-text">3 layers of protection</span>:</p>
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-green font-bold shrink-0">1.</span>
              <p><span className="font-semibold text-text">SQLite WAL mode</span> — crash-safe writes. Even if the server crashes mid-write, the database won't corrupt.</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green font-bold shrink-0">2.</span>
              <p><span className="font-semibold text-text">Auto-backup every 6 hours</span> — full JSON export saved to <code className="text-accent bg-accent/10 px-1 rounded">~/.claude/backups/polyglot-db-backup.json</code></p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green font-bold shrink-0">3.</span>
              <p><span className="font-semibold text-text">GitHub sync</span> — the backup file is inside <code className="text-accent bg-accent/10 px-1 rounded">~/.claude/</code> which auto-syncs to GitHub.</p>
            </div>
          </div>
          <p className="mt-2">Every edit/delete in the Database tab is logged in <span className="font-semibold text-text">Change History</span> with one-click revert.</p>
        </div>
      </Section>

      <Section id="files" title="File Locations">
        <div className="space-y-2">
          <div>
            <span className="text-[10px] text-text-muted font-semibold">Database</span>
            <Code>{dbPath}</Code>
          </div>
          <div>
            <span className="text-[10px] text-text-muted font-semibold">Auto-backup (JSON)</span>
            <Code>{'~/.claude/backups/polyglot-db-backup.json'}</Code>
          </div>
          <div>
            <span className="text-[10px] text-text-muted font-semibold">Original data (migrated)</span>
            <Code>{projectRoot + '/*.json.migrated'}</Code>
          </div>
        </div>
      </Section>

      <Section id="export" title="Manual Export & Backup">
        <p className="text-text-secondary mb-2">Download the full database as JSON (all tables, all rows):</p>
        <a
          href="/api/db/export"
          download
          className="btn-primary btn-md"
        >
          <Download className="w-3.5 h-3.5" />
          Download Full Export
        </a>
        <p className="text-text-muted mt-3">Or via terminal:</p>
        <Code>{'curl -o polyglot-backup.json http://localhost:3847/api/db/export'}</Code>
      </Section>

      <Section id="recovery" title="Recovery Steps">
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-text mb-1">If database is corrupted or deleted:</p>
            <p className="text-text-secondary mb-2">Restart the server. It auto-recreates the database and reimports from .migrated files.</p>
            <Code>{`# Stop the server\nkill $(lsof -ti:3847)\n\n# Delete corrupted database\nrm -f "${dbPath}" "${dbPath}-wal" "${dbPath}-shm"\n\n# Restart — auto-recreates and reimports\ncd "${projectRoot}"\nnode src/server.js`}</Code>
          </div>

          <div>
            <p className="font-semibold text-text mb-1">If .migrated files are also gone:</p>
            <p className="text-text-secondary mb-2">Restore from the auto-backup or GitHub:</p>
            <Code>{`# Check backup exists\nls -la ~/.claude/backups/polyglot-db-backup.json\n\n# Or pull from GitHub\ncd ~/.claude && git pull`}</Code>
          </div>

          <div>
            <p className="font-semibold text-text mb-1">Check database integrity:</p>
            <Code>{`sqlite3 "${dbPath}" "PRAGMA integrity_check;"\n# Should return: ok`}</Code>
          </div>

          <div>
            <p className="font-semibold text-text mb-1">View all table row counts:</p>
            <Code>{`sqlite3 "${dbPath}" ".mode column" ".headers on" \\
  "SELECT name as 'table', (SELECT COUNT(*) FROM [sqlite_master] sm2 WHERE sm2.name = sqlite_master.name) FROM sqlite_master WHERE type='table' ORDER BY name;"`}</Code>
          </div>
        </div>
      </Section>

      <Section id="queries" title="Useful Queries">
        <p className="text-text-secondary mb-2">Paste these into the query box above and hit Run:</p>
        <div className="space-y-2">
          <div>
            <p className="text-text-muted font-semibold text-[10px] mb-0.5">All active agents</p>
            <Code>{"SELECT id, title, department, status, level FROM agents WHERE status = 'active' ORDER BY level DESC"}</Code>
          </div>
          <div>
            <p className="text-text-muted font-semibold text-[10px] mb-0.5">Recent runs</p>
            <Code>{'SELECT agentName, status, duration, estimatedCost, timestamp FROM agent_runs ORDER BY timestamp DESC LIMIT 20'}</Code>
          </div>
          <div>
            <p className="text-text-muted font-semibold text-[10px] mb-0.5">Cost by agent</p>
            <Code>{'SELECT agentName, COUNT(*) as runs, ROUND(SUM(estimatedCost), 4) as totalCost, ROUND(AVG(duration)) as avgMs FROM agent_runs GROUP BY agentName ORDER BY runs DESC'}</Code>
          </div>
          <div>
            <p className="text-text-muted font-semibold text-[10px] mb-0.5">Recent changes (audit trail)</p>
            <Code>{'SELECT tableName, rowKey, action, changedAt, reverted FROM db_change_log ORDER BY changedAt DESC LIMIT 20'}</Code>
          </div>
        </div>
      </Section>
    </div>
  )
}
