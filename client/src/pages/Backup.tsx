import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import {
  CloudUpload,
  GitBranch,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Download,
  History,
  Archive,
  Link as LinkIcon,
  Unplug,
  Eye,
  Clock,
  FileText,
  Loader,
  ChevronRight,
  Info,
  ShieldCheck,
  Plus,
  ExternalLink,
  Wrench,
  Terminal,
  ShieldAlert,
} from 'lucide-react'
import {
  getBackupStatus,
  connectBackup,
  disconnectBackup,
  runBackupNow,
  listBackupCommits,
  previewBackupRestore,
  applyBackupRestore,
  listBackupSnapshots,
  restoreBackupSnapshot,
  verifyBackupRemote,
  createBackupRemote,
  retryBackupPush,
  getBackupLogs,
  type BackupStatus,
  type BackupCommit,
  type BackupDiffFile,
  type BackupSnapshot,
  type BackupDiagnosis,
  type BackupFixAction,
  type BackupLogLine,
} from '../lib/api'
import { useApi } from '../hooks/useApi'
import { toast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { statusPill } from '../lib/colors'

type Tab = 'overview' | 'cloud' | 'snapshots' | 'logs'

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  const now = Date.now()
  const sec = Math.floor((now - then) / 1000)
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function BackupPage() {
  const { data: status, refetch: refetchStatus, loading } = useApi(getBackupStatus)
  const [tab, setTab] = useState<Tab>('overview')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        <Loader className="w-5 h-5 animate-spin mr-2" />
        Loading backup status...
      </div>
    )
  }

  if (!status) {
    return (
      <div className="text-red">Failed to load backup status</div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[13px] text-text-muted">
            Protect your agents, memory, and config against data loss
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={refetchStatus}
              className="btn-secondary btn-sm"
              title="Refresh status"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
            <HealthChip status={status} />
          </div>
        </div>

        {/* Tab bar */}
        <div className="segmented mt-4" role="tablist" aria-label="Backup sections">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
            <CloudUpload className="w-3.5 h-3.5" /> Overview
          </TabButton>
          <TabButton active={tab === 'cloud'} onClick={() => setTab('cloud')}>
            <History className="w-3.5 h-3.5" /> Cloud History
          </TabButton>
          <TabButton active={tab === 'snapshots'} onClick={() => setTab('snapshots')}>
            <Archive className="w-3.5 h-3.5" /> Local Snapshots
          </TabButton>
          <TabButton active={tab === 'logs'} onClick={() => setTab('logs')}>
            <Terminal className="w-3.5 h-3.5" /> Logs
          </TabButton>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pt-5">
        {tab === 'overview' && <OverviewTab status={status} onRefresh={refetchStatus} />}
        {tab === 'cloud' && <CloudHistoryTab status={status} onRefresh={refetchStatus} />}
        {tab === 'snapshots' && <SnapshotsTab onRefresh={refetchStatus} />}
        {tab === 'logs' && <LogsTab />}
      </div>
    </div>
  )
}

// ── Health chip ──────────────────────────────────────────────────────────────

function HealthChip({ status }: { status: BackupStatus }) {
  if (!status.configured) {
    return (
      <span className={`pill gap-2 px-3 py-1.5 text-xs font-semibold ${statusPill('warning')}`}>
        <AlertTriangle className="w-3.5 h-3.5" />
        Not Configured
      </span>
    )
  }
  if (!status.enabled) {
    return (
      <span className={`pill gap-2 px-3 py-1.5 text-xs font-semibold ${statusPill('neutral')}`}>
        <Unplug className="w-3.5 h-3.5" />
        Paused
      </span>
    )
  }
  if (status.pendingQueue > 0) {
    return (
      <span className={`pill gap-2 px-3 py-1.5 text-xs font-semibold ${statusPill('warning')}`}>
        <RefreshCw className="w-3.5 h-3.5" />
        {status.pendingQueue} Queued
      </span>
    )
  }
  if (status.lastBackupStatus === 'error') {
    return (
      <span className={`pill gap-2 px-3 py-1.5 text-xs font-semibold ${statusPill('error')}`}>
        <X className="w-3.5 h-3.5" />
        Error
      </span>
    )
  }
  if (typeof status.pendingChanges === 'number' && status.pendingChanges > 0) {
    return (
      <span
        className={`pill gap-2 px-3 py-1.5 text-xs font-semibold ${statusPill('info')}`}
        title={
          status.pendingChangesSample.length > 0
            ? `Recent: ${status.pendingChangesSample.join(', ')}${status.pendingChangesScanLimited ? ' (scan capped at 20K files)' : ''}`
            : undefined
        }
      >
        <RefreshCw className="w-3.5 h-3.5" />
        {status.pendingChanges}{status.pendingChangesScanLimited ? '+' : ''} Pending
      </span>
    )
  }
  return (
    <span className={`pill gap-2 px-3 py-1.5 text-xs font-semibold ${statusPill('success')}`}>
      <Check className="w-3.5 h-3.5" />
      Protected
    </span>
  )
}

function TabButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`flex items-center gap-1.5 ${active ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}`}
    >
      {children}
    </button>
  )
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ status, onRefresh }: { status: BackupStatus; onRefresh: () => void }) {
  const [connecting, setConnecting] = useState(false)
  const [running, setRunning] = useState(false)
  const [repoUrl, setRepoUrl] = useState('')
  const [token, setToken] = useState('')
  const [showConnectForm, setShowConnectForm] = useState(!status.configured)
  const [confirmPause, setConfirmPause] = useState(false)
  const [pausing, setPausing] = useState(false)

  useEffect(() => {
    const handler = () => setShowConnectForm(true)
    window.addEventListener('backup:open-connect-form', handler)
    return () => window.removeEventListener('backup:open-connect-form', handler)
  }, [])

  const handleConnect = async () => {
    if (!repoUrl.trim() || !token.trim()) {
      toast('error', 'Repo URL and token are required')
      return
    }
    setConnecting(true)
    try {
      const res = await connectBackup(repoUrl.trim(), token.trim())
      if (!res.ok) {
        // If verify failed because repo doesn't exist and we can create it — do so automatically
        const diag = res.diagnosis as { code?: string; canCreate?: boolean } | undefined
        if (res.stage === 'verify' && diag?.code === 'REPO_NOT_FOUND' && diag?.canCreate) {
          toast('success', 'Repo does not exist — creating it now')
          const create = await createBackupRemote(true)
          if (create.ok) {
            // Retry the full connect now that the repo exists
            const res2 = await connectBackup(repoUrl.trim(), token.trim())
            if (res2.ok) {
              toast('success', 'Backup connected & repo created')
              setRepoUrl(''); setToken(''); setShowConnectForm(false); onRefresh()
              return
            }
            toast('error', res2.error || 'Connect failed after create')
            return
          }
          toast('error', create.error || 'Repo creation failed')
          return
        }
        toast('error', res.error || 'Connection failed')
        return
      }
      toast('success', 'Backup connected successfully')
      setRepoUrl('')
      setToken('')
      setShowConnectForm(false)
      onRefresh()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setPausing(true)
    try {
      await disconnectBackup()
      toast('success', 'Backup paused')
      setConfirmPause(false)
      onRefresh()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setPausing(false)
    }
  }

  const handleBackupNow = useCallback(async () => {
    setRunning(true)
    try {
      const res = await runBackupNow()
      if (!res.ok) {
        toast('error', res.diagnosis?.title || res.error || 'Backup failed')
        return
      }
      if (res.committed) {
        toast('success', res.pushed ? 'Backup pushed to GitHub' : 'Committed locally (push queued)')
      } else {
        toast('success', 'No changes to back up')
      }
      onRefresh()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Backup failed')
    } finally {
      setRunning(false)
    }
  }, [onRefresh])

  const handleVerify = async () => {
    const res = await verifyBackupRemote()
    if (res.ok) {
      toast('success', `Verified: ${res.repo?.owner}/${res.repo?.name} · ${res.user}${res.isPrivate ? ' · private' : ''}`)
    } else {
      toast('error', `${res.code}: ${res.detail}`)
    }
    onRefresh()
  }

  // Keyboard: B = Backup Now, R = Refresh, V = Verify
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); handleBackupNow() }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); onRefresh() }
      else if (e.key === 'v' || e.key === 'V') { e.preventDefault(); if (status.configured) handleVerify() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)

  }, [handleBackupNow, onRefresh, status.configured])

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Connect flow */}
      {showConnectForm && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-gradient-to-r from-accent/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <GitBranch className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-bold">Connect GitHub Repository</h3>
            </div>
          </div>
          <div className="px-5 py-5 space-y-4">
            <div className="bg-accent/5 border border-accent/20 rounded-lg px-4 py-3 text-xs text-text-secondary space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1.5">
                  <p className="font-semibold text-text">Setup steps:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
                    <li>Go to <a href="https://github.com/new" target="_blank" rel="noopener noreferrer" className="text-accent underline">github.com/new</a> → create a <strong>private</strong> repo (e.g. <code className="text-[10px] bg-surface-2 px-1 rounded">polyglot-backup</code>)</li>
                    <li>Copy the HTTPS clone URL</li>
                    <li>Go to <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer" className="text-accent underline">Settings → Developer → Tokens</a> → create a fine-grained PAT with <strong>Repo: Read + Write</strong> access</li>
                    <li>Paste both below</li>
                  </ol>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-text-muted block mb-1.5">
                Repository URL
              </label>
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/yash/polyglot-backup.git"
                className="input"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-text-muted block mb-1.5">
                Personal Access Token
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="input font-mono"
              />
              <p className="text-[10px] text-text-muted mt-1.5">
                Token is encrypted with a machine-local key before storage. It never leaves your machine in plain text.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleConnect}
                disabled={connecting || !repoUrl.trim() || !token.trim()}
                className="btn-primary btn-md"
              >
                {connecting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Connecting & testing...
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-4 h-4" />
                    Connect & Backup Now
                  </>
                )}
              </button>
              {status.configured && (
                <button
                  onClick={() => setShowConnectForm(false)}
                  className="btn-ghost btn-md"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status cards */}
      {status.configured && !showConnectForm && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <StatCard
              icon={GitBranch}
              label="Repository"
              value={(
                <a
                  href={`https://github.com/${status.repoOwner}/${status.repoName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`https://github.com/${status.repoOwner}/${status.repoName}`}
                  className="text-accent hover:underline inline-flex items-center gap-1.5 text-[12px] font-mono"
                >
                  {status.repoOwner}/{status.repoName}
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
              )}
              sublabel={status.healthy ? 'verified · writable' : undefined}
            />
            <StatCard
              icon={Clock}
              label="Last Backup"
              value={formatRelativeTime(status.lastBackupAt)}
              sublabel={
                typeof status.pendingChanges === 'number' && status.pendingChanges > 0
                  ? `${status.pendingChanges}${status.pendingChangesScanLimited ? '+' : ''} file${status.pendingChanges === 1 ? '' : 's'} changed since`
                  : status.lastBackupStatus || undefined
              }
            />
            <StatCard
              icon={Check}
              label="Total Commits"
              value={String(status.commitCount)}
              sublabel={status.lastCommitSha ? `${status.lastCommitSha.slice(0, 7)}` : undefined}
            />
            <StatCard
              icon={Archive}
              label="Local Snapshots"
              value={`${status.snapshotCount} / ${status.maxSnapshots}`}
              sublabel="auto-rotate oldest"
            />
            {/* Pending Changes — files modified since last backup, span full width to surface clearly */}
            <div className="md:col-span-2">
              <StatCard
                icon={RefreshCw}
                label="Pending Changes"
                value={
                  status.pendingChanges == null
                    ? '—'
                    : `${status.pendingChanges}${status.pendingChangesScanLimited ? '+' : ''} file${status.pendingChanges === 1 ? '' : 's'}`
                }
                sublabel={
                  status.pendingChanges == null
                    ? 'no prior backup yet'
                    : status.pendingChanges === 0
                    ? 'in sync with last backup'
                    : status.pendingChangesSample.length > 0
                    ? `recent: ${status.pendingChangesSample.slice(0, 3).join(', ')}${status.pendingChangesSample.length > 3 ? '…' : ''}`
                    : 'awaiting next backup'
                }
              />
            </div>
          </div>

          {/* Actionable diagnosis card — replaces raw error banner */}
          {(status.lastBackupDiagnosis || status.lastFailedPush?.diagnosis) && (
            <DiagnosisCard
              diagnosis={(status.lastBackupDiagnosis || status.lastFailedPush?.diagnosis)!}
              pendingQueue={status.pendingQueue}
              onRefresh={onRefresh}
            />
          )}

          {/* Generic push queue (no structured diagnosis) */}
          {status.pendingQueue > 0 && !status.lastFailedPush?.diagnosis && !status.lastBackupDiagnosis && (
            <div className="bg-amber-muted border border-amber/20 rounded-xl px-4 py-3 flex items-start gap-3">
              <RefreshCw className="w-4 h-4 text-amber shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber">
                  {status.pendingQueue} commit{status.pendingQueue > 1 ? 's' : ''} waiting to push
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Your data is committed locally and will retry automatically.
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleBackupNow}
              disabled={running}
              title="Backup Now (B)"
              className="btn-primary btn-md"
            >
              {running ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" /> Backing up...
                </>
              ) : (
                <>
                  <CloudUpload className="w-4 h-4" /> Backup Now
                </>
              )}
            </button>
            <button
              onClick={onRefresh}
              title="Refresh (R)"
              className="btn-secondary btn-md"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={handleVerify}
              title="Verify remote via GitHub API (V)"
              className="btn-secondary btn-md"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Verify
            </button>
            <button
              onClick={() => setShowConnectForm(true)}
              className="btn-secondary btn-md"
            >
              <LinkIcon className="w-3.5 h-3.5" /> Change Repo
            </button>
            {status.enabled && (
              <button
                onClick={() => setConfirmPause(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red hover:bg-red-muted rounded-lg transition-colors ml-auto"
              >
                <Unplug className="w-3.5 h-3.5" /> Pause Auto-Backup
              </button>
            )}
          </div>

          {/* What's included */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-sm font-bold">What's Backed Up</h3>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-2">
              {status.includePaths.map((p) => (
                <div
                  key={p}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2/60 text-[11px] font-mono"
                >
                  <Check className="w-3 h-3 text-green shrink-0" />
                  {p}
                </div>
              ))}
            </div>
            <div className="px-5 pb-4 pt-1 text-[10px] text-text-muted flex items-center justify-between gap-3 flex-wrap">
              <span>5-sec debounce · 15-min safety-net · auto-retry push with backoff · AES-256-GCM encrypted token</span>
              <span className="text-text-muted/70 font-mono">
                <kbd className="px-1 py-0.5 bg-surface-2 rounded">B</kbd> backup ·
                <kbd className="px-1 py-0.5 bg-surface-2 rounded ml-1">R</kbd> refresh ·
                <kbd className="px-1 py-0.5 bg-surface-2 rounded ml-1">V</kbd> verify
              </span>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmPause}
        loading={pausing}
        title="Pause auto-backup?"
        message="Your data stays backed up, but new changes won't be pushed until you reconnect."
        confirmLabel="Pause Auto-Backup"
        onConfirm={handleDisconnect}
        onClose={() => setConfirmPause(false)}
      />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: typeof GitBranch
  label: string
  value: React.ReactNode
  sublabel?: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-text-muted" />
        <span className="text-[10px] text-text-muted font-semibold">{label}</span>
      </div>
      <div className="text-sm font-bold break-words">{value}</div>
      {sublabel && (
        <div className="text-[10px] text-text-muted mt-0.5 font-mono">{sublabel}</div>
      )}
    </div>
  )
}

// ── Cloud History Tab ────────────────────────────────────────────────────────

function CloudHistoryTab({ status, onRefresh }: { status: BackupStatus; onRefresh: () => void }) {
  const { data: commits, loading, refetch } = useApi(useCallback(() => listBackupCommits(100), []))
  const [previewSha, setPreviewSha] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<{ totalFiles: number; changes: BackupDiffFile[]; truncated?: boolean } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [confirmApply, setConfirmApply] = useState(false)

  const handlePreview = async (commitSha: string) => {
    setPreviewSha(commitSha)
    setPreviewData(null)
    setPreviewLoading(true)
    try {
      const res = await previewBackupRestore(commitSha)
      if (res.ok) {
        setPreviewData({ totalFiles: res.totalFiles, changes: res.changes, truncated: res.truncated })
      } else {
        toast('error', res.error || 'Preview failed')
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setPreviewLoading(false)
    }
  }

  const doApply = async () => {
    if (!previewSha) return
    setApplying(true)
    try {
      // Create a safety backup first
      await runBackupNow()
      const res = await applyBackupRestore(previewSha)
      if (res.ok) {
        toast('success', `Restored to ${previewSha.slice(0, 7)}`)
        setConfirmApply(false)
        setPreviewSha(null)
        setPreviewData(null)
        onRefresh()
      } else {
        toast('error', res.error || 'Restore failed')
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setApplying(false)
    }
  }

  if (!status.configured) {
    return (
      <div className="card p-12 text-center">
        <CloudUpload className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-50" />
        <p className="text-sm font-medium text-text-muted">Connect a GitHub repo first</p>
        <p className="text-xs text-text-muted mt-1">Go to the Overview tab to set up cloud backup.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">Commit History</h2>
        <button
          onClick={() => { refetch(); onRefresh() }}
          className="btn-secondary btn-sm"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-text-muted">
          <Loader className="w-4 h-4 animate-spin mr-2" /> Loading commits...
        </div>
      ) : !commits || commits.length === 0 ? (
        <EmptyState
          icon={History}
          title="No commits yet"
          description="Run a backup from the Overview tab to create the first one."
          card
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-border/50">
            {commits.map((commit, idx) => (
              <CommitRow
                key={commit.hash}
                commit={commit}
                isLatest={idx === 0}
                onPreview={() => handlePreview(commit.hash)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Restore preview modal */}
      {previewSha && (
        <RestorePreviewModal
          commitSha={previewSha}
          data={previewData}
          loading={previewLoading}
          applying={applying}
          onClose={() => { setPreviewSha(null); setPreviewData(null) }}
          onApply={() => setConfirmApply(true)}
        />
      )}

      <ConfirmDialog
        danger
        open={confirmApply}
        loading={applying}
        title="Restore ~/.claude/ to this commit?"
        message={
          previewSha
            ? `This will overwrite current files in ~/.claude/ with the state from commit ${previewSha.slice(0, 7)}. A fresh backup is created first, but local changes since then will be replaced.`
            : undefined
        }
        confirmLabel="Restore"
        onConfirm={doApply}
        onClose={() => setConfirmApply(false)}
      />
    </div>
  )
}

const CommitRow = memo(function CommitRow({ commit, isLatest, onPreview }: {
  commit: BackupCommit
  isLatest: boolean
  onPreview: () => void
}) {
  const relTime = useMemo(() => formatRelativeTime(commit.date), [commit.date])

  return (
    <div className="group flex items-center gap-3 px-5 py-3 hover:bg-surface-2/40 transition-colors">
      <div className={`w-2 h-2 rounded-full shrink-0 ${isLatest ? 'bg-accent' : 'bg-border'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold truncate">{commit.message}</span>
          {isLatest && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold shrink-0">LATEST</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-muted">
          <span className="font-mono">{commit.shortHash}</span>
          <span>·</span>
          <span>{relTime}</span>
        </div>
      </div>
      <button
        onClick={onPreview}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Eye className="w-3 h-3" />
        Preview Restore
      </button>
    </div>
  )
})

function RestorePreviewModal({
  commitSha,
  data,
  loading,
  applying,
  onClose,
  onApply,
}: {
  commitSha: string
  data: { totalFiles: number; changes: BackupDiffFile[]; truncated?: boolean } | null
  loading: boolean
  applying: boolean
  onClose: () => void
  onApply: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !applying) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applying, onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => !applying && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-title"
        className="w-full max-w-2xl bg-surface rounded-2xl border border-border shadow-pop overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <Download className="w-5 h-5 text-accent" />
            </div>
            <div className="min-w-0">
              <h3 id="restore-title" className="text-base font-bold">Restore Preview</h3>
              <p className="text-xs text-text-muted font-mono mt-0.5">
                Commit {commitSha.slice(0, 7)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={applying}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-text-muted">
              <Loader className="w-4 h-4 animate-spin mr-2" /> Computing diff...
            </div>
          ) : !data ? (
            <div className="px-5 py-8 text-center text-text-muted text-sm">
              No preview data
            </div>
          ) : data.totalFiles === 0 ? (
            <div className="px-5 py-8 text-center">
              <Check className="w-8 h-8 text-green mx-auto mb-2" />
              <p className="text-sm font-medium">No changes</p>
              <p className="text-xs text-text-muted mt-1">
                Your current files match this commit exactly.
              </p>
            </div>
          ) : (
            <div>
              <div className="px-5 py-3 bg-accent/5 border-b border-border">
                <p className="text-xs">
                  <span className="font-bold text-accent">{data.totalFiles}</span> file{data.totalFiles !== 1 ? 's' : ''} will change if you restore this commit.
                  {data.truncated && (
                    <span className="text-text-muted ml-1">(showing first 500)</span>
                  )}
                </p>
              </div>
              <div className="divide-y divide-border/50">
                {data.changes.map((file) => (
                  <div key={file.file} className="px-5 py-2 flex items-center gap-3 text-xs">
                    <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="flex-1 truncate font-mono">{file.file}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {file.insertions > 0 && (
                        <span className="text-green font-bold">+{file.insertions}</span>
                      )}
                      {file.deletions > 0 && (
                        <span className="text-red font-bold">-{file.deletions}</span>
                      )}
                      {file.binary && (
                        <span className="text-amber text-[10px]">binary</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border bg-surface-2/30 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={applying}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-text-secondary hover:text-text hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            disabled={applying || !data || data.totalFiles === 0}
            className="btn-primary btn-md"
          >
            {applying ? (
              <>
                <Loader className="w-3.5 h-3.5 animate-spin" /> Restoring...
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" /> Apply Restore
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Snapshots Tab ────────────────────────────────────────────────────────────

function SnapshotsTab({ onRefresh }: { onRefresh: () => void }) {
  const { data: snapshots, loading, refetch } = useApi(listBackupSnapshots)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState<string | null>(null)

  const handleRestore = async () => {
    if (confirmName === null) return
    const name = confirmName
    setRestoring(name)
    try {
      const res = await restoreBackupSnapshot(name)
      if (res.ok) {
        toast('success', `Restored: ${res.restoredTo}`)
        setConfirmName(null)
        onRefresh()
      } else {
        toast('error', res.error || 'Restore failed')
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold">Local Snapshots</h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            Pre-edit backups created before automated agents (Tutor, Hira, Forge) modify your files.
          </p>
        </div>
        <button
          onClick={refetch}
          className="btn-secondary btn-sm"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-text-muted">
          <Loader className="w-4 h-4 animate-spin mr-2" /> Loading snapshots...
        </div>
      ) : !snapshots || snapshots.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="No snapshots yet"
          description="Snapshots are created automatically when Tutor, Hira, or Forge edit files."
          card
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-border/50">
            {snapshots.map((snap) => (
              <SnapshotRow
                key={snap.name}
                snap={snap}
                restoring={restoring === snap.name}
                onRestore={() => setConfirmName(snap.name)}
              />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        danger
        open={confirmName !== null}
        loading={restoring !== null}
        title="Restore this snapshot?"
        message={
          confirmName !== null
            ? `This will overwrite the current file ${snapshots?.find(s => s.name === confirmName)?.relPath ?? ''} with the snapshot contents. The current version will be lost.`
            : undefined
        }
        confirmLabel="Restore"
        onConfirm={handleRestore}
        onClose={() => setConfirmName(null)}
      />
    </div>
  )
}

// ── Diagnosis Card — actionable error with Fix It buttons ───────────────────

const ACTION_CONFIG: Record<BackupFixAction, { label: string; icon: typeof Wrench; tone: 'accent' | 'danger' | 'neutral' }> = {
  create_remote: { label: 'Create Repo on GitHub', icon: Plus, tone: 'accent' },
  change_repo: { label: 'Change Repo URL', icon: LinkIcon, tone: 'neutral' },
  reconnect: { label: 'Reconnect with New Token', icon: LinkIcon, tone: 'accent' },
  retry_push: { label: 'Retry Push', icon: RefreshCw, tone: 'accent' },
  verify_remote: { label: 'Verify Remote', icon: ShieldCheck, tone: 'neutral' },
}

function DiagnosisCard({
  diagnosis,
  pendingQueue,
  onRefresh,
}: {
  diagnosis: BackupDiagnosis
  pendingQueue: number
  onRefresh: () => void
}) {
  const [busy, setBusy] = useState<BackupFixAction | null>(null)

  const isWarning = diagnosis.code === 'NETWORK' || diagnosis.code === 'NON_FAST_FORWARD'
  const color = isWarning ? 'amber' : 'red'
  const Icon = isWarning ? AlertTriangle : ShieldAlert

  const runAction = async (action: BackupFixAction) => {
    setBusy(action)
    try {
      switch (action) {
        case 'retry_push': {
          const res = await retryBackupPush()
          if (res.ok) {
            toast('success', 'Push succeeded — all commits uploaded')
            onRefresh()
          } else {
            toast('error', res.diagnosis?.title || res.error || 'Retry failed')
          }
          break
        }
        case 'verify_remote': {
          const res = await verifyBackupRemote()
          if (res.ok) {
            toast('success', `Verified: ${res.repo?.owner}/${res.repo?.name} (${res.user})`)
          } else {
            toast('error', `${res.code}: ${res.detail}`)
          }
          onRefresh()
          break
        }
        case 'create_remote': {
          const verify = await verifyBackupRemote()
          if (verify.ok) {
            toast('success', 'Repo already exists and is accessible')
            onRefresh()
            break
          }
          if (verify.code !== 'REPO_NOT_FOUND') {
            toast('error', `Cannot create: ${verify.detail}`)
            break
          }
          if (!verify.canCreate) {
            toast('error', 'Token cannot create this repo — owner mismatch or missing scope')
            break
          }
          const create = await createBackupRemote(true)
          if (create.ok) {
            toast('success', create.alreadyExists ? 'Repo already existed' : 'Repo created — retrying push')
            await retryBackupPush()
            onRefresh()
          } else {
            toast('error', create.error || 'Create failed')
          }
          break
        }
        case 'change_repo':
        case 'reconnect': {
          // Scroll to connect form — open it via custom event
          window.dispatchEvent(new CustomEvent('backup:open-connect-form'))
          break
        }
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3.5 space-y-3 ${
        color === 'red'
          ? 'bg-red-muted border-red/20'
          : 'bg-amber-muted border-amber/20'
      }`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${color === 'red' ? 'text-red' : 'text-amber'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-xs font-bold ${color === 'red' ? 'text-red' : 'text-amber'}`}>
              {diagnosis.title}
            </p>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
              color === 'red' ? 'bg-red-muted text-red' : 'bg-amber-muted text-amber'
            }`}>
              {diagnosis.code}
            </span>
            {pendingQueue > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-2 text-text-muted font-mono">
                {pendingQueue} queued
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">{diagnosis.detail}</p>
          <p className="text-[11px] text-text-muted mt-1.5 leading-relaxed">
            <span className="font-semibold text-text-secondary">Fix: </span>
            {diagnosis.fix}
          </p>
        </div>
      </div>
      {diagnosis.actions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pl-7">
          {diagnosis.actions.map((action) => {
            const cfg = ACTION_CONFIG[action]
            if (!cfg) return null
            const ActionIcon = cfg.icon
            const isBusy = busy === action
            const base = 'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50'
            const tone =
              cfg.tone === 'accent'
                ? 'bg-accent text-white hover:bg-accent-hover'
                : cfg.tone === 'danger'
                  ? 'bg-red-muted text-red hover:bg-red/20'
                  : 'bg-surface-2 text-text hover:bg-surface-3'
            return (
              <button
                key={action}
                onClick={() => runAction(action)}
                disabled={!!busy}
                className={`${base} ${tone}`}
              >
                {isBusy ? <Loader className="w-3 h-3 animate-spin" /> : <ActionIcon className="w-3 h-3" />}
                {cfg.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Logs Tab — tails backup.log for debugging ───────────────────────────────

function LogsTab() {
  const { data: logs, loading, refetch } = useApi(useCallback(() => getBackupLogs(300), []))
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold">Backup Logs</h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            Live tail of <code className="text-[10px] bg-surface-2 px-1 rounded">~/.claude/.backups/backup.log</code>
          </p>
        </div>
        <button
          onClick={refetch}
          className="btn-secondary btn-sm"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {loading && !logs ? (
        <div className="flex items-center justify-center py-12 text-text-muted">
          <Loader className="w-4 h-4 animate-spin mr-2" /> Loading logs...
        </div>
      ) : !logs || logs.length === 0 ? (
        <EmptyState
          icon={Terminal}
          title="No logs yet"
          description="Run a backup to generate the first entries."
          card
        />
      ) : (
        <div
          ref={scrollRef}
          className="bg-[#0a0a0b] rounded-2xl border border-border font-mono text-[11px] leading-relaxed overflow-auto max-h-[65vh] p-4"
        >
          {logs.map((line, i) => (
            <LogLineView key={i} line={line} />
          ))}
        </div>
      )}
    </div>
  )
}

function LogLineView({ line }: { line: BackupLogLine }) {
  const color =
    line.level === 'error' ? 'text-red' :
    line.level === 'warn' ? 'text-amber' :
    line.level === 'info' ? 'text-green' : 'text-text-muted'
  const time = line.t ? new Date(line.t).toLocaleTimeString() : ''
  const meta = Object.entries(line)
    .filter(([k]) => !['t', 'level', 'event'].includes(k))
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' ')
  return (
    <div className="flex items-start gap-3 py-0.5">
      <span className="text-text-muted/60 shrink-0">{time}</span>
      <span className={`font-bold shrink-0 ${color}`}>{line.level.toUpperCase().padEnd(5)}</span>
      <span className="text-text shrink-0">{line.event}</span>
      {meta && <span className="text-text-muted/80 truncate">{meta}</span>}
    </div>
  )
}

function SnapshotRow({ snap, restoring, onRestore }: {
  snap: BackupSnapshot
  restoring: boolean
  onRestore: () => void
}) {
  return (
    <div className="group flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/40 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-accent/5 flex items-center justify-center shrink-0">
        <FileText className="w-3.5 h-3.5 text-text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold truncate font-mono">{snap.relPath}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-2 text-text-muted shrink-0">
            {snap.agent}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-muted">
          <span>{formatRelativeTime(snap.mtime)}</span>
          <span>·</span>
          <span>{formatBytes(snap.size)}</span>
        </div>
      </div>
      <button
        onClick={onRestore}
        disabled={restoring}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
      >
        {restoring ? (
          <Loader className="w-3 h-3 animate-spin" />
        ) : (
          <>
            <ChevronRight className="w-3 h-3" />
            Restore
          </>
        )}
      </button>
    </div>
  )
}
