import { useState } from 'react'
import {
  CheckCircle, XCircle, RefreshCw, Package, Bot, Zap,
  AlertTriangle, Info, ChevronDown, ChevronRight,
  Folder, Settings, Cpu, Shield, Camera, Monitor,
} from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { toast } from '../components/Toast'
import { getConfig } from '../lib/api'
import { PageShell } from '../components/PageShell'

interface SetupStatus {
  pm2Status: string
  launchAgentInstalled: boolean
  agentCount: number
  sdkExists: boolean
  port: number
}

interface SetupProject {
  name: string
  path: string
  hasSdk: boolean
  hasPackageEntry: boolean
  hasScreenshotScript: boolean
  hasPlaywright: boolean
  hasBrowser: boolean
}

const getSetupStatus = () =>
  fetch('/api/setup/status').then((r) => r.json() as Promise<SetupStatus>)
const getSetupProjects = () =>
  fetch('/api/setup/projects').then((r) => r.json() as Promise<SetupProject[]>)

// ─── Reusable Components ────────────────────────────────────────────────────

function StatusBadge({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const cls = ok
    ? 'bg-green-muted text-green border-green/20'
    : warn
    ? 'bg-amber-muted text-amber border-amber/20'
    : 'bg-red-muted text-red border-red/20'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cls}`}>
      {ok ? <CheckCircle className="w-3 h-3" /> : warn ? <AlertTriangle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  )
}

function StatusCard({
  icon: Icon, title, status, statusLabel, detail, note, action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  status: 'ok' | 'warn' | 'error'
  statusLabel: string
  detail?: string
  note?: string
  action?: React.ReactNode
}) {
  const colors = {
    ok:    { bg: 'bg-green-muted',  text: 'text-green',  dot: 'bg-green',  ring: 'border-green/20' },
    warn:  { bg: 'bg-amber-muted',  text: 'text-amber',  dot: 'bg-amber',  ring: 'border-amber/20' },
    error: { bg: 'bg-red-muted',    text: 'text-red',    dot: 'bg-red',    ring: 'border-red/20'   },
  }
  const c = colors[status]
  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${c.bg} ${c.text} shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-4 mb-1">
          <p className="text-sm font-semibold">{title}</p>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${c.bg} ${c.text} ${c.ring} shrink-0`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
            {statusLabel}
          </span>
        </div>
        {detail && <p className="text-xs text-text-muted font-mono">{detail}</p>}
        {note && <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{note}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}

function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <div className="relative group">
      <pre className="bg-bg border border-border rounded-lg px-4 py-3.5 text-xs font-mono text-text-secondary overflow-x-auto leading-relaxed whitespace-pre-wrap">
        <code>{code}</code>
      </pre>
      <button onClick={copy} className="absolute top-2 right-2 px-2 py-1 text-[10px] font-medium bg-surface border border-border rounded text-text-muted hover:text-text transition-colors opacity-0 group-hover:opacity-100">
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <span className="absolute bottom-2 right-2 text-[10px] text-text-muted/40 font-mono">{lang}</span>
    </div>
  )
}

function NoteBox({ type = 'info', children }: { type?: 'info' | 'warn' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info: { bg: 'bg-accent-muted border-accent/20', icon: <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />, text: 'text-text-secondary' },
    warn: { bg: 'bg-amber-muted border-amber/20',   icon: <AlertTriangle className="w-4 h-4 text-amber shrink-0 mt-0.5" />,  text: 'text-text-secondary' },
    tip:  { bg: 'bg-green-muted border-green/20',   icon: <CheckCircle className="w-4 h-4 text-green shrink-0 mt-0.5" />,    text: 'text-text-secondary' },
  }
  const s = styles[type]
  return (
    <div className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border ${s.bg}`}>
      {s.icon}
      <p className={`text-xs leading-relaxed ${s.text}`}>{children}</p>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="p-2 bg-surface-2 rounded-lg border border-border">
        <Icon className="w-4 h-4 text-accent" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-surface hover:bg-surface-2 transition-colors text-sm font-medium text-left"
      >
        {title}
        {open ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />}
      </button>
      {open && <div className="px-5 py-4 bg-surface border-t border-border space-y-4">{children}</div>}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Setup() {
  const { data: status, loading: statusLoading, refetch: refetchStatus } = useApi(getSetupStatus)
  const { data: projects, loading: projectsLoading, refetch: refetchProjects } = useApi(getSetupProjects)
  const { data: config } = useApi(getConfig)
  const [installingPaths, setInstallingPaths] = useState<Set<string>>(new Set())

  const pm2Map: Record<string, { label: string; status: 'ok' | 'warn' | 'error'; note: string }> = {
    online:         { label: 'Running',        status: 'ok',    note: 'Polyglot is running as a background service. All agents and APIs are available.' },
    stopped:        { label: 'Stopped',        status: 'warn',  note: 'Polyglot is stopped. Run: pm2 restart polyglot' },
    errored:        { label: 'Errored',        status: 'error', note: 'Polyglot crashed. Check logs: pm2 logs polyglot' },
    not_registered: { label: 'Not Registered', status: 'warn',  note: 'pm2 is installed but Polyglot is not registered. Run: pm2 start ecosystem.config.js && pm2 save' },
    not_installed:  { label: 'Not Installed',  status: 'error', note: 'pm2 is not installed. Run: npm install -g pm2' },
    unknown:        { label: 'Unknown',        status: 'warn',  note: 'Could not determine pm2 status.' },
  }
  const pm2Info = pm2Map[status?.pm2Status ?? 'unknown'] ?? pm2Map.unknown

  async function handleInstallSdk(projectPath: string) {
    setInstallingPaths(prev => new Set(prev).add(projectPath))
    try {
      const res = await fetch('/api/setup/install-sdk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Install failed')
      toast('success', `SDK installed in ${projectPath.split('/').pop()}`)
      refetchProjects()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstallingPaths(prev => { const n = new Set(prev); n.delete(projectPath); return n })
    }
  }

  const [installingScreenshotPaths, setInstallingScreenshotPaths] = useState<Set<string>>(new Set())
  const [installedScreenshotPaths, setInstalledScreenshotPaths] = useState<Set<string>>(new Set())

  async function handleInstallScreenshot(projectPath: string) {
    setInstallingScreenshotPaths(prev => new Set(prev).add(projectPath))
    try {
      const res = await fetch('/api/setup/install-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Install failed')
      toast('success', `Screenshot tool installed in ${projectPath.split('/').pop()}`)
      setInstalledScreenshotPaths(prev => new Set(prev).add(projectPath))
      refetchProjects()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstallingScreenshotPaths(prev => { const n = new Set(prev); n.delete(projectPath); return n })
    }
  }

  const allGreen = status && status.pm2Status === 'online' && status.launchAgentInstalled && status.agentCount > 0 && status.sdkExists
  const projectsAllGood = projects?.every(p => p.hasSdk && p.hasPackageEntry)

  return (
    <PageShell title="Setup & Status" subtitle="System health, SDK setup, and background service management">
      <div className="max-w-4xl space-y-10">

      {allGreen && projectsAllGood && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-green-muted border border-green/20 rounded-xl">
          <CheckCircle className="w-4 h-4 text-green shrink-0" />
          <p className="text-xs text-green font-medium">All systems operational — Polyglot is running, all agents loaded, SDK installed in all projects.</p>
        </div>
      )}

      {/* ── Section 1: System Health ── */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <SectionHeader icon={Cpu} title="System Health" subtitle="Live status of every component." />
          <button onClick={() => { refetchStatus(); refetchProjects() }} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors mb-5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {statusLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 bg-surface border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <StatusCard
              icon={Zap}
              title="Polyglot Service (pm2)"
              status={pm2Info.status}
              statusLabel={pm2Info.label}
              detail={status ? `localhost:${status.port}` : undefined}
              note={pm2Info.note}
              action={status?.pm2Status !== 'online' ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-text-muted font-medium">Fix command:</p>
                  <CodeBlock code={
                    status?.pm2Status === 'not_installed'
                      ? 'npm install -g pm2\ncd ~/Desktop/Boldteq\\ App/polyglot\npm2 start ecosystem.config.js\npm2 save'
                      : status?.pm2Status === 'not_registered'
                      ? 'cd ~/Desktop/Boldteq\\ App/polyglot\npm2 start ecosystem.config.js\npm2 save'
                      : 'pm2 restart polyglot'
                  } />
                </div>
              ) : undefined}
            />

            <StatusCard
              icon={RefreshCw}
              title="Auto-Start on Login (LaunchAgent)"
              status={status?.launchAgentInstalled ? 'ok' : 'error'}
              statusLabel={status?.launchAgentInstalled ? 'Enabled' : 'Not Configured'}
              detail="~/Library/LaunchAgents/io.boldteq.polyglot.plist"
              note={
                status?.launchAgentInstalled
                  ? 'Polyglot starts automatically when you log into your Mac.'
                  : 'LaunchAgent not found. Polyglot will NOT start on login — must be started manually each session.'
              }
              action={!status?.launchAgentInstalled ? (
                <CodeBlock code={`launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist`} />
              ) : undefined}
            />

            <StatusCard
              icon={Bot}
              title="Global Agents"
              status={(status?.agentCount ?? 0) >= 12 ? 'ok' : (status?.agentCount ?? 0) > 0 ? 'warn' : 'error'}
              statusLabel={
                (status?.agentCount ?? 0) > 0
                  ? `${status?.agentCount} / 12 agents loaded`
                  : 'No agents found'
              }
              detail="~/.claude/agents/"
              note={
                (status?.agentCount ?? 0) >= 12
                  ? 'All 12 global agents are loaded and available in every Claude Code session.'
                  : (status?.agentCount ?? 0) > 0
                  ? `Only ${status?.agentCount} agents found. Expected 12 — some may be missing.`
                  : 'No agent files found. Agents are not available.'
              }
              action={(status?.agentCount ?? 0) < 12 ? (
                <CodeBlock code={`ls ~/.claude/agents/\n# Expected: arya.md bolt.md hawk.md koda.md luna.md\n#           mira.md nova.md quill.md yash.md riko.md sage.md vex.md`} />
              ) : undefined}
            />

            <StatusCard
              icon={Package}
              title="Agent SDK (@boldteq/agents)"
              status={status?.sdkExists ? 'ok' : 'error'}
              statusLabel={status?.sdkExists ? 'Ready' : 'Missing'}
              detail="polyglot/sdk/  (index.js + index.d.ts + package.json)"
              note={
                status?.sdkExists
                  ? 'SDK exists. Projects can install it via npm to call agents programmatically.'
                  : 'SDK folder missing at polyglot/sdk/. Check that the repo is intact.'
              }
            />
          </div>
        )}
      </section>

      {/* ── Section 2: Project SDK Status ── */}
      <section>
        <SectionHeader
          icon={Folder}
          title="Project SDK Status"
          subtitle="Whether @boldteq/agents is installed in each project. Click Install to add it automatically."
        />

        {projectsLoading ? (
          <div className="bg-surface border border-border rounded-xl p-6 animate-pulse h-40" />
        ) : !projects || projects.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-8 text-center">
            <Folder className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-secondary font-medium">No projects found</p>
            <p className="text-xs text-text-muted mt-1">Add project directories in <a href="/settings" className="text-accent hover:underline">Settings</a>.</p>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Project</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">SDK Installed</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">package.json Entry</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p, i) => {
                  const isInstalling = installingPaths.has(p.path)
                  const needsInstall = !p.hasSdk || !p.hasPackageEntry
                  return (
                    <tr key={p.path} className={`${i < projects.length - 1 ? 'border-b border-border' : ''} hover:bg-surface-2 transition-colors`}>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-[11px] text-text-muted font-mono mt-0.5">{p.path.replace(config?.home || '', '~')}</p>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge ok={p.hasSdk} label={p.hasSdk ? 'Installed' : 'Missing'} />
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge ok={p.hasPackageEntry} label={p.hasPackageEntry ? 'Yes' : 'No'} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {needsInstall && (
                          <button
                            disabled={isInstalling}
                            onClick={() => handleInstallSdk(p.path)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                          >
                            {isInstalling ? <><RefreshCw className="w-3 h-3 animate-spin" /> Installing...</> : <><Package className="w-3 h-3" /> Install SDK</>}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 3: Visual Validation Tool ── */}
      <section>
        <SectionHeader
          icon={Camera}
          title="Visual Validation Tool"
          subtitle="Auto-screenshot every page at mobile, tablet, and desktop. Agents use these to catch UI bugs and verify fixes."
        />

        {/* How it works */}
        <div className="mb-4 flex items-start gap-3 px-4 py-3 bg-accent-muted border border-accent/20 rounded-xl">
          <Monitor className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary leading-relaxed">
            <strong className="text-text">How it works:</strong> Install the script into any project. When your dev server is running, execute{' '}
            <code className="font-mono text-accent bg-surface px-1 py-0.5 rounded">node scripts/screenshot.mjs --viewport all</code>{' '}
            to capture every page. Claude reads the PNGs natively and auto-fixes visual bugs.
          </p>
        </div>

        {projectsLoading ? (
          <div className="bg-surface border border-border rounded-xl p-6 animate-pulse h-40" />
        ) : !projects || projects.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-8 text-center">
            <Folder className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-secondary font-medium">No projects found</p>
            <p className="text-xs text-text-muted mt-1">Add project directories in <a href="/settings" className="text-accent hover:underline">Settings</a>.</p>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Project</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Script</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Playwright</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Browser</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p, i) => {
                  const isInstalling = installingScreenshotPaths.has(p.path)
                  const justInstalled = installedScreenshotPaths.has(p.path)
                  const scriptReady = p.hasScreenshotScript
                  const needsBrowser = scriptReady && p.hasPlaywright && !p.hasBrowser
                  const fullyReady = scriptReady && p.hasPlaywright && p.hasBrowser
                  return (
                    <tr key={p.path} className={`${i < projects.length - 1 ? 'border-b border-border' : ''} hover:bg-surface-2 transition-colors`}>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-[11px] text-text-muted font-mono mt-0.5">{p.path.replace(config?.home || '', '~')}</p>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge ok={p.hasScreenshotScript} label={p.hasScreenshotScript ? 'Installed' : 'Missing'} />
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge ok={p.hasPlaywright} label={p.hasPlaywright ? 'Yes' : 'No'} />
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge
                          ok={p.hasBrowser}
                          warn={!p.hasBrowser && p.hasPlaywright}
                          label={p.hasBrowser ? 'Ready' : p.hasPlaywright ? 'Run install' : 'Missing'}
                        />
                      </td>
                      <td className="px-4 py-3.5 text-right min-w-[160px]">
                        {fullyReady ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-green font-medium">
                            <CheckCircle className="w-3.5 h-3.5" /> Ready
                          </span>
                        ) : !scriptReady ? (
                          <button
                            disabled={isInstalling}
                            onClick={() => handleInstallScreenshot(p.path)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                          >
                            {isInstalling
                              ? <><RefreshCw className="w-3 h-3 animate-spin" /> Installing...</>
                              : <><Camera className="w-3 h-3" /> Install Script</>
                            }
                          </button>
                        ) : needsBrowser ? (
                          <div className="text-right space-y-1">
                            <p className="text-[10px] text-text-muted">Run in project:</p>
                            <code className="text-[10px] font-mono text-amber bg-amber-muted px-2 py-1 rounded block">
                              npx playwright install chromium
                            </code>
                          </div>
                        ) : (
                          <button
                            disabled={isInstalling}
                            onClick={() => handleInstallScreenshot(p.path)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-2 text-text-secondary border border-border rounded-lg hover:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isInstalling
                              ? <><RefreshCw className="w-3 h-3 animate-spin" /> Updating...</>
                              : <><RefreshCw className="w-3 h-3" /> Update Script</>
                            }
                          </button>
                        )}
                        {justInstalled && !isInstalling && !p.hasScreenshotScript && (
                          <p className="text-[10px] text-text-muted mt-1">
                            Run: <code className="font-mono text-green">npm install && npx playwright install chromium</code>
                          </p>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Usage reference */}
        <div className="mt-4">
          <Collapsible title="Screenshot Commands Reference">
            <div className="space-y-3">
              <CodeBlock code={`# Basic — desktop screenshots of all auto-detected pages
node scripts/screenshot.mjs

# All viewports (mobile 375px, tablet 768px, desktop 1440px)
node scripts/screenshot.mjs --viewport all

# Specific routes only
node scripts/screenshot.mjs --routes /,/dashboard,/settings

# Dark mode
node scripts/screenshot.mjs --dark

# Full page scroll capture
node scripts/screenshot.mjs --full-page

# All options combined
node scripts/screenshot.mjs --viewport all --dark --full-page

# Output: .screenshots/*.png + .screenshots/manifest.json`} />
              <NoteBox type="info">
                The script auto-detects your dev server port from <code className="font-mono text-accent">vite.config.ts</code> and routes from <code className="font-mono text-accent">src/App.tsx</code> — no manual config needed. Dev server must be running first.
              </NoteBox>
              <NoteBox type="tip">
                Tell Claude: <em>"Take screenshots and fix any visual bugs"</em> — it will run the script, read the PNGs, identify issues, patch the code, and re-screenshot to verify the fix.
              </NoteBox>
            </div>
          </Collapsible>
        </div>
      </section>

      {/* ── Section 4: pm2 & LaunchAgent Reference (renumbered) ── */}
      <section>
        <SectionHeader
          icon={Settings}
          title="pm2 & LaunchAgent Reference"
          subtitle="Commands for managing Polyglot as a background service."
        />

        <div className="space-y-4">
          <Collapsible title="pm2 — All Commands" defaultOpen>
            <div className="space-y-3">
              <CodeBlock code={`# Daily use
pm2 status                    # See all running processes
pm2 restart polyglot        # Restart after code changes
pm2 logs polyglot           # Stream live logs
pm2 logs polyglot --lines 50 --nostream  # View last 50 lines

# Setup (first time or after moving files)
cd ~/Desktop/Boldteq\\ App/polyglot
pm2 start ecosystem.config.js # Register and start
pm2 save                      # Save list (survives reboots)

# Troubleshooting
pm2 stop polyglot           # Stop
pm2 delete polyglot         # Remove from pm2 entirely
pm2 kill                      # Kill pm2 daemon itself`} />
              <NoteBox type="warn">
                <strong>If pm2 shows "errored":</strong> Run <code className="font-mono text-accent">pm2 logs polyglot</code> to see the error. Most common cause: port 3847 already in use. Fix: <code className="font-mono text-accent">lsof -ti:3847 | xargs kill -9</code> then <code className="font-mono text-accent">pm2 restart polyglot</code>
              </NoteBox>
            </div>
          </Collapsible>

          <Collapsible title="LaunchAgent — macOS Auto-Start">
            <div className="space-y-3">
              <CodeBlock lang="bash" code={`# Check if installed
ls ~/Library/LaunchAgents/io.boldteq.polyglot.plist

# Load (register — run once after creating the plist)
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist

# Verify it's running
launchctl list | grep polyglot

# If broken — unload then reload
launchctl unload ~/Library/LaunchAgents/io.boldteq.polyglot.plist
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist`} />
              <NoteBox type="info">
                If you upgrade Node.js via nvm, update the node path in the plist file and reload it.
              </NoteBox>
            </div>
          </Collapsible>

          <Collapsible title="Fresh Machine Setup — Full Sequence">
            <CodeBlock code={`# 1. Install Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20 && nvm use 20

# 2. Install Claude Code
npm install -g @anthropic-ai/claude-code
claude  # authenticate

# 3. Install pm2
npm install -g pm2

# 4. Set up Polyglot
cd ~/Desktop/Boldteq\\ App/polyglot && npm install
pm2 start ecosystem.config.js
pm2 save

# 5. Load LaunchAgent (update node path in plist first)
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist

# 6. Install SDK in each project (or use the Install button above)
cd ~/Desktop/Boldteq\\ App/Pinzo && npm install`} />
          </Collapsible>
        </div>
      </section>

      {/* ── Section 4: Troubleshooting ── */}
      <section>
        <SectionHeader
          icon={Shield}
          title="Troubleshooting"
          subtitle="Common issues and exact fixes."
        />

        <div className="space-y-3">
          {[
            {
              problem: 'Port 3847 already in use (EADDRINUSE)',
              cause: 'A previous Polyglot process is still running and holding the port.',
              fix: 'lsof -ti:3847 | xargs kill -9\npm2 restart polyglot',
            },
            {
              problem: 'pm2 shows "errored" with restarts',
              cause: 'Process crashed, usually port conflict or missing dependencies.',
              fix: 'pm2 logs polyglot  # read the actual error\n# If EADDRINUSE: kill the port (above)\n# If MODULE_NOT_FOUND: npm install in polyglot/',
            },
            {
              problem: 'LaunchAgent not starting on login',
              cause: 'Plist not loaded, wrong Node.js path, or plist syntax error.',
              fix: 'launchctl list | grep polyglot  # check if registered\n# If missing:\nlaunchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist\n# If wrong node path: edit plist ProgramArguments, then reload',
            },
            {
              problem: 'callAgent() returns "Polyglot not reachable"',
              cause: 'Polyglot is not running or running on a different port.',
              fix: 'pm2 status\npm2 restart polyglot\ncurl http://localhost:3847/api/setup/status',
            },
            {
              problem: 'Agents not found (agentCount shows 0)',
              cause: '~/.claude/agents/ directory is missing or empty.',
              fix: 'ls ~/.claude/agents/\n# If missing: recreate directory and add agent .md files\n# Or use the All Agents page to create them',
            },
            {
              problem: 'Claude Code not picking up CLAUDE.md changes',
              cause: 'CLAUDE.md is loaded at session start and cached.',
              fix: 'Start a new Claude Code session — it re-reads all files on startup.',
            },
          ].map(item => (
            <div key={item.problem} className="bg-surface border border-border rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-red flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" /> {item.problem}
              </p>
              <p className="text-xs text-text-muted"><strong>Cause:</strong> {item.cause}</p>
              <div>
                <p className="text-xs text-text-muted font-medium mb-1.5">Fix:</p>
                <CodeBlock code={item.fix} />
              </div>
            </div>
          ))}
        </div>
      </section>

      </div>
    </PageShell>
  )
}
