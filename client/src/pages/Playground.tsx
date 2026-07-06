import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Copy, Trash2, AlertCircle,
  ChevronDown, Clock, Sparkles, Download, Search,
  Settings2, X, ArrowDown, Terminal, ThumbsUp, ThumbsDown,
  Maximize2, Minimize2, Save, BookmarkPlus, Bookmark,
  MessageSquare, Plus, Ban, Paperclip, FileText,
  Send, StopCircle, Bot, User, Zap, PanelLeft,
  MoreVertical, Pencil, Check, Loader2,
} from 'lucide-react'
import {
  getUnifiedAgents, addTraining,
  getPlaygroundHistory, savePlaygroundHistoryItem, apiError,
  getPlaygroundPreflight, getPlaygroundThreads, getPlaygroundThread, deletePlaygroundThread,
  renamePlaygroundThread, getActivePlaygroundRun, cancelPlaygroundRun,
} from '../lib/api'
import type { PlaygroundHistoryItem, PlaygroundRunStatus, PlaygroundThread, PlaygroundPreflight } from '../lib/api'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { toast } from '../components/Toast'
import AgentIcon from '../components/AgentIcon'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  STORAGE_KEY_PLAYGROUND_HISTORY,
  STORAGE_KEY_PLAYGROUND_SETTINGS,
  STORAGE_KEY_PLAYGROUND_SESSION,
  STORAGE_KEY_PLAYGROUND_TEMPLATES,
  PLAYGROUND_TIMEOUT_OPTIONS,
  PLAYGROUND_DEFAULT_TIMEOUT_MS,
} from '../lib/constants'

// ─── Types ──────────────────────────────────────────────────────────────────

interface TestResult {
  id: string
  agent: string
  agentName: string
  prompt: string
  output: string
  duration: number
  status: PlaygroundRunStatus
  timestamp: Date
  threadId?: string | null
}

// Explicit run lifecycle — replaces fragile `output.startsWith('Error:')`
// sniffing so the UI shows a distinct header/icon for each terminal outcome and
// the spinner can never get stuck.
type RunState = 'idle' | 'running' | 'success' | 'error' | 'timeout' | 'cancelled' | 'empty'

// Chat bubbles — the render source of truth for the conversation. Built from
// STRUCTURED data at every update point (run done, openThread, reply, history),
// never by string-parsing the transcript (agent output contains `---` rules that
// would break naive splitting). The in-flight turn renders from `liveUserMsg` +
// the streaming `output` buffer, then commits into `messages` on done.
interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: PlaygroundRunStatus
}

interface PlaygroundSettings {
  timeoutMs: number
  customInstructions: string
  outputMode: 'markdown' | 'raw'
  fastMode?: boolean   // run on a faster model (Sonnet) for snappy replies
}

interface PromptTemplate {
  id: string
  name: string
  prompt: string
  agentName: string
}

interface ActivityEntry {
  message: string
  time: number
}

const STORAGE_KEY = STORAGE_KEY_PLAYGROUND_HISTORY
const SETTINGS_KEY = STORAGE_KEY_PLAYGROUND_SETTINGS
const SESSION_KEY = STORAGE_KEY_PLAYGROUND_SESSION
const TEMPLATES_KEY = STORAGE_KEY_PLAYGROUND_TEMPLATES
// Tracks the in-flight run across a page refresh so we can re-attach to a
// background generation on reload. { runId, threadId, prompt }
const ACTIVE_RUN_KEY = 'polyglot.playground.activeRun'

// Stable ID with random suffix — avoids collisions on same-ms events
const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadPersistedHistory(): TestResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return parsed.map((r: TestResult) => ({ ...r, timestamp: new Date(r.timestamp) }))
  } catch { return [] }
}

const DEFAULT_SETTINGS: PlaygroundSettings = {
  timeoutMs: PLAYGROUND_DEFAULT_TIMEOUT_MS,
  customInstructions: '',
  outputMode: 'markdown',
  fastMode: false,
}

function loadPersistedSettings(): PlaygroundSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { return DEFAULT_SETTINGS }
}

function loadPersistedSession(): { selectedAgent: string; prompt: string; output: string } {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return { selectedAgent: '', prompt: '', output: '' }
    return JSON.parse(raw)
  } catch { return { selectedAgent: '', prompt: '', output: '' } }
}

function loadPersistedTemplates(): PromptTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch { return [] }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const min = Math.floor(ms / 60000)
  const sec = ((ms % 60000) / 1000).toFixed(0)
  return `${min}m ${sec}s`
}

function formatTime(date: Date): string {
  const now = new Date()
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return time
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

function toHistoryItem(r: TestResult): PlaygroundHistoryItem {
  return { ...r, timestamp: r.timestamp.toISOString() }
}

// Cold-start example prompts shown in the empty output state.
const EXAMPLE_PROMPTS = [
  'Validate this SaaS idea: an AI tool that auto-generates Shopify product descriptions.',
  'Review the security of the current branch and flag any critical issues.',
  'Write a landing-page hero headline + subhead for a developer-focused analytics tool.',
  'Design the database schema for a multi-tenant task manager with RLS.',
]

// ─── Component ──────────────────────────────────────────────────────────────

export default function Playground() {
  const navigate = useNavigate()
  const { data: agents } = useApi(getUnifiedAgents, [], CacheKeys.unifiedAgents)

  // Core state — use lazy initializers so loadPersistedSession runs once, not on every render
  const [selectedAgent, setSelectedAgent] = useState<string>(() => loadPersistedSession().selectedAgent)
  const [prompt, setPrompt] = useState(() => loadPersistedSession().prompt)
  // C12: gate the first run of a session behind a confirm (it spawns the local
  // Claude Code CLI on your subscription — see the dialog copy).
  const runConfirmedRef = useRef(false)
  const [pendingRun, setPendingRun] = useState<{ prompt?: string; agent?: string } | null>(null)
  const [running, setRunning] = useState(false)
  const [runState, setRunState] = useState<RunState>('idle')
  const [output, setOutput] = useState(() => loadPersistedSession().output)
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([])
  const [history, setHistory] = useState<TestResult[]>(loadPersistedHistory)
  const [settings, setSettings] = useState<PlaygroundSettings>(loadPersistedSettings)
  // Preflight readiness (binary/auth/node). Drives the banner + Run disable.
  const [preflight, setPreflight] = useState<PlaygroundPreflight | null>(null)
  const [preflightDismissed, setPreflightDismissed] = useState(false)
  // Multi-turn threads
  const [threads, setThreads] = useState<PlaygroundThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [threadFilter, setThreadFilter] = useState('')
  const [threadsLoading, setThreadsLoading] = useState(true)
  // Generic delete-confirmation gate — every destructive list action routes
  // through this so nothing is ever deleted on a single click (production-grade).
  const [pendingDelete, setPendingDelete] = useState<null | { title: string; message: string; confirmLabel: string; onConfirm: () => void }>(null)
  // Row actions kebab (⋮) — fixed-positioned so it never clips inside the
  // scrolling list. Holds which row is open + where to anchor the menu.
  const [rowMenu, setRowMenu] = useState<null | { id: string; kind: 'thread' | 'history'; x: number; y: number }>(null)
  // Inline rename state for a thread row.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Rendered transcript of prior turns when in a thread — the current streaming
  // turn is appended below it so the output reads as a full chat (user-chosen).
  const [transcriptPrefix, setTranscriptPrefix] = useState('')
  // Chat bubble model (render source of truth). `messages` = committed turns;
  // `liveUserMsg` = the user message of the in-flight turn (its assistant half
  // streams from `output`).
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [liveUserMsg, setLiveUserMsg] = useState('')

  // UI state
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [agentFilter, setAgentFilter] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const [showRating, setShowRating] = useState(false)
  const [ratingIssue, setRatingIssue] = useState('')
  const [ratingCorrection, setRatingCorrection] = useState('')
  const [ratingSubmitting, setRatingSubmitting] = useState(false)
  const [fullscreenOutput, setFullscreenOutput] = useState(false)
  const [focusedAgentIdx, setFocusedAgentIdx] = useState(-1)
  const [templates, setTemplates] = useState<PromptTemplate[]>(loadPersistedTemplates)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)

  // Attachments — files the agent reads via the claude CLI (cost-free, no API).
  const [attachments, setAttachments] = useState<{ name: string; content: string; encoding: 'utf8' | 'base64'; size: number }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  // Mobile rail drawer (chat-app left sidebar collapses under md).
  const [railOpen, setRailOpen] = useState(false)

  // Refs
  const outputRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  // Auto-scroll only follows new content when the user is already at the bottom.
  // Updated by the scroll listener; reset to true when a fresh run/thread starts.
  const atBottomRef = useRef(true)
  const settingsRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Time-to-first-byte watchdog: guards ONLY the gap until the fetch resolves /
  // the first byte arrives. If the playground POST is queued behind the browser's
  // 6-per-host connection cap it never reaches the server and yields zero bytes —
  // this fires fast (~22s) so the run self-heals via one transparent retry instead
  // of stalling the full 180s idle window.
  const ttfbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const agentPickerRef = useRef<HTMLDivElement>(null)
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const templateRef = useRef<HTMLDivElement>(null)
  // SSE batching: accumulate chunks in ref, flush via rAF to avoid per-chunk re-renders
  const outputAccRef = useRef('')
  const flushPendingRef = useRef(false)
  const rafIdRef = useRef<number>(0)
  // Warning guard: only show the >400KB toast once per run
  const hasWarnedLongOutputRef = useRef(false)
  // Active thread id for the in-flight run (ref so runTest closure reads latest)
  const activeThreadIdRef = useRef<string | null>(null)
  // The in-flight run's id (= its historyId). Drives Stop→server-cancel and lets
  // us re-attach to a background generation after a page refresh.
  const activeRunIdRef = useRef<string | null>(null)
  // True once the page is unloading (refresh/navigate/close). On unload the
  // in-flight fetch rejects with a generic network error (not an AbortError), so
  // we must NOT treat that as a real terminal — otherwise we'd wipe the reattach
  // marker and the reloaded page couldn't reconnect to the still-running gen.
  const unloadingRef = useRef(false)
  // Race-safety: ids deleted this session. A refreshThreads() that was already
  // in-flight when the delete fired must NOT resurrect them, so every list write
  // filters this set. Cleared only on successful server delete reconcile.
  const deletedThreadIdsRef = useRef<Set<string>>(new Set())
  // Last finished run — used to seed a thread when the user clicks "Reply".
  // Prefix (transcript so far + current "You/Agent" headers) prepended to the
  // live-streaming output when continuing a thread. (promptRef declared above.)
  const currentTurnRef = useRef('')

  // Cancel pending rAF on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => { if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current) }
  }, [])

  // ─── Computed ───────────────────────────────────────────────────────────

  const allAgents = agents || []
  const filteredAgents = useMemo(() => {
    const q = agentFilter.toLowerCase()
    return allAgents.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.filename?.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q)
    )
  }, [allAgents, agentFilter])

  const filteredGlobal = filteredAgents.filter(a => a.scope === 'global')
  const filteredProject = filteredAgents.filter(a => a.scope === 'project')
  const flatAgentList = useMemo(() => {
    const list: { key: string; value: string }[] = [{ key: '__none__', value: '' }]
    filteredGlobal.forEach(a => list.push({ key: `g-${a.filename}`, value: a.filename || a.name }))
    filteredProject.forEach(a => list.push({ key: `p-${a.filename}-${a.projectName}`, value: a.filename || a.name }))
    return list
  }, [filteredGlobal, filteredProject])

  const currentAgent = allAgents.find(a =>
    a.filename === selectedAgent || a.name === selectedAgent
  )

  // Memoize the active-thread lookup so it isn't re-found on every message render.
  const activeThread = useMemo(
    () => threads.find(t => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  )

  const filteredThreads = useMemo(() => {
    if (!threadFilter.trim()) return threads
    const q = threadFilter.toLowerCase()
    return threads.filter(t =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.agentName || '').toLowerCase().includes(q)
    )
  }, [threads, threadFilter])

  // When streaming a turn inside a thread, show the prior transcript + the live
  // current turn beneath it (full-chat view). Otherwise `output` already holds
  // what to show (a one-shot answer, or a reopened thread's full transcript).
  const displayedOutput = (running && currentTurnRef.current)
    ? currentTurnRef.current + output
    : output

  // Bubbles to render = committed `messages` (structured, never string-parsed)
  // plus the in-flight turn while running: the live user message, and — once the
  // first token arrives — the streaming assistant bubble fed by `output`. Before
  // the first token, the typing indicator row covers the assistant side.
  const renderedMessages = useMemo<ChatMsg[]>(() => {
    if (!running) return messages
    const live: ChatMsg[] = [{ id: 'live-u', role: 'user', content: liveUserMsg }]
    if (output) live.push({ id: 'live-a', role: 'assistant', content: output })
    return [...messages, ...live]
  }, [messages, running, liveUserMsg, output])

  // ─── Persist history + settings + templates (single effect) ──────────

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50)))
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
  }, [history, settings, templates])

  // Debounced session persistence
  useEffect(() => {
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current)
    sessionTimerRef.current = setTimeout(() => {
      const outputToSave = output.length < 500000 ? output : ''
      localStorage.setItem(SESSION_KEY, JSON.stringify({ selectedAgent, prompt, output: outputToSave }))
    }, 500)
    return () => { if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current) }
  }, [selectedAgent, prompt, output])

  // Load threads on mount (inline so it doesn't depend on the refreshThreads
  // callback declared further down).
  useEffect(() => {
    setThreadsLoading(true)
    getPlaygroundThreads()
      .then(list => setThreads(list.filter(t => !deletedThreadIdsRef.current.has(t.id))))
      .catch(err => apiError('Playground threads', err))
      .finally(() => setThreadsLoading(false))
  }, [])

  // Preflight readiness on mount + whenever the selected agent changes, so the
  // user gets an actionable banner instead of an 18s spin → claude_binary_missing.
  useEffect(() => {
    getPlaygroundPreflight(selectedAgent || undefined)
      .then(p => { setPreflight(p); setPreflightDismissed(false) })
      .catch(err => { console.error('[playground] preflight failed:', err?.message); setPreflight(null) })
  }, [selectedAgent])

  // Sync history from server on mount
  useEffect(() => {
    getPlaygroundHistory().then(serverItems => {
      if (!serverItems || serverItems.length === 0) return
      setHistory(prev => {
        const localIds = new Set(prev.map(h => h.id))
        const merged = [...prev]
        for (const s of serverItems) {
          if (!localIds.has(s.id)) {
            merged.push({ ...s, timestamp: new Date(s.timestamp) })
          }
        }
        merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        return merged.slice(0, 50)
      })
    }).catch(err => apiError('Playground history', err))
  }, [])

  // Hot-start: focus the prompt on mount so a user can type immediately.
  useEffect(() => {
    promptRef.current?.focus()
  }, [])

  // Hot-start: if no agent is selected yet, pre-select the most-recently-used
  // one (from history) once agents have loaded — saves a cold-start click.
  const hotStartedRef = useRef(false)
  useEffect(() => {
    if (hotStartedRef.current) return
    if (selectedAgent || !allAgents.length || !history.length) return
    const recent = history.find(h => h.agent && allAgents.some(a => a.filename === h.agent || a.name === h.agent))
    if (recent?.agent) {
      setSelectedAgent(recent.agent)
      hotStartedRef.current = true
    }
  }, [allAgents, history, selectedAgent])

  // ─── Auto-scroll output ──────────────────────────────────────────────

  // Single, scroll-aware auto-follow. Only sticks to the bottom when the user is
  // already there (atBottomRef) — scrolling up to read earlier output is never
  // yanked back. Instant ('auto') while streaming to avoid smooth-scroll jank on
  // every token; smooth on a completed/idle turn. The "jump to latest" button is
  // the way back when scrolled up.
  useEffect(() => {
    const el = outputRef.current
    if (!el || !atBottomRef.current) return
    el.scrollTo({ top: el.scrollHeight, behavior: running ? 'auto' : 'smooth' })
  }, [displayedOutput, messages.length, running])

  // Auto-grow the composer textarea between its min/max heights (render-support).
  useEffect(() => {
    const el = promptRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [prompt])

  // ─── Scroll detection ────────────────────────────────────────────────

  // Attach once on mount (not per-token). Tracks distance from bottom to drive
  // both the "jump to latest" button and the auto-follow gate (atBottomRef).
  useEffect(() => {
    const el = outputRef.current
    if (!el) return
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      atBottomRef.current = distanceFromBottom < 80
      setShowScrollBottom(distanceFromBottom > 100)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Settings panel: close on Escape or click outside; move focus in on open and
  // restore it to the trigger on close (modal-drawer a11y).
  useEffect(() => {
    if (!showSettings) return
    const trigger = document.activeElement as HTMLElement | null
    const focusTimer = setTimeout(() => {
      settingsRef.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
    }, 60)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowSettings(false) }
    const onDown = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      trigger?.focus?.()  // restore focus to whatever opened the drawer
    }
  }, [showSettings])

  // Mobile rail drawer: lock body scroll while the slide-over is open so the page
  // behind the backdrop doesn't scroll under the user's finger (mobile only — the
  // drawer is `md:static`, so this is a no-op on desktop where overflow is fine).
  useEffect(() => {
    if (!railOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [railOpen])

  // Row-actions (⋮) menu: Escape closes it + move focus to the first item on open
  // so it's fully keyboard-operable.
  useEffect(() => {
    if (!rowMenu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRowMenu(null) }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => document.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]')?.focus(), 40)
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t) }
  }, [rowMenu])

  // ─── Click outside agent picker ───────────────────────────────────────

  useEffect(() => {
    if (!showAgentPicker) return
    const handler = (e: MouseEvent) => {
      if (agentPickerRef.current && !agentPickerRef.current.contains(e.target as Node)) {
        setShowAgentPicker(false)
        setAgentFilter('')
        setFocusedAgentIdx(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAgentPicker])

  // Click outside template picker
  useEffect(() => {
    if (!showTemplates) return
    const handler = (e: MouseEvent) => {
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) {
        setShowTemplates(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTemplates])

  // ─── Elapsed timer ────────────────────────────────────────────────────

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current)
      }, 100)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [running])

  // ─── Run test ─────────────────────────────────────────────────────────

  // Persist history item to state + server with toast on failure + 1 retry
  const persistResult = useCallback((item: TestResult) => {
    setHistory(prev => [item, ...prev].slice(0, 50))
    savePlaygroundHistoryItem(toHistoryItem(item)).catch(err => {
      apiError('Save history', err)
      setTimeout(() => savePlaygroundHistoryItem(toHistoryItem(item)).catch(() => null), 2000)
    })
  }, [])

  // ─── Threads (multi-turn conversations) ───────────────────────────────
  // Always strip session-deleted ids so a stale in-flight fetch can't resurrect
  // a just-deleted thread (race-safe).
  const applyThreads = useCallback((list: PlaygroundThread[]) => {
    setThreads(list.filter(t => !deletedThreadIdsRef.current.has(t.id)))
  }, [])
  const refreshThreads = useCallback(() => {
    setThreadsLoading(true)
    getPlaygroundThreads()
      .then(applyThreads)
      .catch(err => apiError('Playground threads', err))
      .finally(() => setThreadsLoading(false))
  }, [applyThreads])

  const startNewThread = useCallback(() => {
    activeThreadIdRef.current = null
    setActiveThreadId(null)
    setOutput('')
    setPrompt('')
    setActivityLog([])
    setRunState('idle')
    setTranscriptPrefix('')
    currentTurnRef.current = ''
    setMessages([])
    setLiveUserMsg('')
  }, [])

  const openThread = useCallback((id: string) => {
    if (running) { toast('error', 'Finish the running test first'); return }
    getPlaygroundThread(id).then(thread => {
      activeThreadIdRef.current = thread.id
      setActiveThreadId(thread.id)
      // Only adopt the thread's agent if it still exists — a deleted agent would
      // leave a phantom selection where the header shows a name with no agent.
      if (thread.agentName && allAgents.some(a => a.filename === thread.agentName || a.name === thread.agentName)) {
        setSelectedAgent(thread.agentName)
      }
      // Bubbles come straight from the structured thread messages (no parsing).
      setMessages((thread.messages || []).map(m => ({
        id: m.id || genId(),
        role: m.role,
        content: m.content || '',
        status: (m.status as PlaygroundRunStatus) || 'success',
      })))
      setLiveUserMsg('')
      setTranscriptPrefix('')
      currentTurnRef.current = ''
      // Reset transient per-run UI so a prior run's state can't bleed into the
      // opened conversation (activity feed + any open rating form).
      setActivityLog([])
      setShowRating(false)
      setRatingIssue('')
      setRatingCorrection('')
      // `output` mirrors the latest answer so copy/export/fullscreen keep working.
      const lastAgent = [...(thread.messages || [])].reverse().find(m => m.role === 'assistant')
      setOutput(lastAgent?.content || '')
      setRunState(thread.messages?.some(m => m.role === 'assistant' && m.status !== 'success') ? 'error' : 'success')
      atBottomRef.current = true   // open a thread scrolled to its latest turn
    }).catch(err => apiError('Open thread', err))
  }, [running, allAgents])

  // Optimistic, race-safe delete: remove from the list instantly, mark the id so
  // any in-flight refresh can't bring it back, then sync the server. On failure,
  // un-mark + refresh so the row reappears (error recovery).
  const removeThread = useCallback((id: string) => {
    deletedThreadIdsRef.current.add(id)
    setThreads(prev => prev.filter(t => t.id !== id))
    if (activeThreadIdRef.current === id) startNewThread()
    deletePlaygroundThread(id)
      .then(() => toast('success', 'Conversation deleted'))
      .catch(err => {
        deletedThreadIdsRef.current.delete(id)
        apiError('Delete thread', err)
        refreshThreads()
      })
  }, [startNewThread, refreshThreads])

  const clearThreads = useCallback(() => {
    if (threads.length === 0) return
    const ids = threads.map(t => t.id)
    ids.forEach(id => deletedThreadIdsRef.current.add(id))
    setThreads([])
    if (activeThreadIdRef.current) startNewThread()
    Promise.all(ids.map(id => deletePlaygroundThread(id).catch(() => null)))
      .then(() => toast('success', `Deleted ${ids.length} conversation${ids.length === 1 ? '' : 's'}`))
      .catch(() => apiError('Delete threads', new Error('Some conversations failed to delete')))
  }, [threads, startNewThread])

  // Rename a conversation — inline edit, optimistic update, persisted via PATCH.
  const startRename = useCallback((id: string) => {
    const t = threads.find(x => x.id === id)
    setRenamingId(id)
    setRenameValue(t?.title || '')
  }, [threads])
  const cancelRename = useCallback(() => { setRenamingId(null); setRenameValue('') }, [])
  const commitRename = useCallback((id: string) => {
    const title = renameValue.trim()
    setRenamingId(null)
    const current = threads.find(t => t.id === id)
    if (!title || !current || title === current.title) return
    setThreads(prev => prev.map(t => t.id === id ? { ...t, title } : t)) // optimistic
    renamePlaygroundThread(id, title)
      .then(() => toast('success', 'Conversation renamed'))
      .catch(err => { apiError('Rename conversation', err); refreshThreads() })
  }, [renameValue, threads, refreshThreads])

  // Read picked files into memory (text inline, binary/image/PDF as base64).
  // The CLI reads them via temp paths — cost-free, no API.
  const TEXT_RE = /\.(md|txt|json|csv|js|jsx|ts|tsx|html|css|ya?ml|xml|log|sh|py|rb|go|rs|java|sql|env|toml|ini)$/i
  const onPickFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = '' // allow re-picking the same file
    for (const file of picked) {
      if (attachmentsRef.current.length >= 3) { toast('error', 'Up to 3 files'); break }
      if (file.size > 5 * 1024 * 1024) { toast('error', `${file.name} is over 5MB`); continue }
      const isText = file.type.startsWith('text/') || TEXT_RE.test(file.name)
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result !== 'string') return
        const content = isText ? result : (result.split(',')[1] || '') // strip "data:...;base64," prefix
        setAttachments(prev => prev.length >= 3 ? prev : [...prev, { name: file.name, content, encoding: isText ? 'utf8' : 'base64', size: file.size }])
      }
      reader.onerror = () => toast('error', `Couldn't read ${file.name}`)
      if (isText) reader.readAsText(file); else reader.readAsDataURL(file)
    }
  }, [])
  const removeAttachment = useCallback((name: string) => setAttachments(prev => prev.filter(a => a.name !== name)), [])

  const runTest = useCallback(async (overridePrompt?: string, overrideAgent?: string) => {
    const testPrompt = (overridePrompt ?? prompt).trim()
    if (!testPrompt) { toast('error', 'Enter a test prompt'); return }

    // D1: guard against concurrent runs. A second runTest while one is in flight
    // would overwrite abortRef and orphan the first stream. Bail with a toast.
    if (running || abortRef.current) { toast('error', 'A run is already in progress'); return }

    // C12: first run of the session must be confirmed (spawns the local Claude
    // Code CLI on your subscription). Subsequent runs skip the prompt.
    if (!runConfirmedRef.current) {
      setPendingRun({ prompt: overridePrompt, agent: overrideAgent })
      return
    }

    const agentToUse = overrideAgent ?? selectedAgent
    const resolvedAgent = allAgents.find(a => a.filename === agentToUse || a.name === agentToUse)
    const historyId = genId()
    // Single-system chat: EVERY message belongs to a conversation (thread). If no
    // conversation is active (a fresh "New chat"), mint one now so this and all
    // following replies append to the SAME thread — never a new flat entry.
    let threadIdForRun = activeThreadIdRef.current
    if (!threadIdForRun) {
      threadIdForRun = genId()
      activeThreadIdRef.current = threadIdForRun
      setActiveThreadId(threadIdForRun)
    }
    let resolvedThreadId: string = threadIdForRun
    // Track this run so Stop can server-cancel it, and persist it so a page
    // refresh mid-generation can RE-ATTACH to the background run on reload.
    activeRunIdRef.current = historyId
    try { localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify({ runId: historyId, threadId: threadIdForRun, prompt: testPrompt })) } catch { /* quota */ }
    // Did this run reach a terminal state HERE (vs. the stream being aborted by a
    // page navigation/refresh, which leaves the run generating in the background)?
    // Only a true terminal clears the reattach marker — see the finally block.
    let reachedTerminal = false
    // Snapshot the running transcript so copy/export/fullscreen still reflect the
    // whole conversation (the chat bubbles render from `messages`, not this).
    const existing = transcriptPrefix || output || ''
    setTranscriptPrefix(existing)
    currentTurnRef.current = `${existing ? existing + '\n\n---\n\n' : ''}### 🧑 You\n\n${testPrompt}\n\n### 🤖 Agent\n\n`
    // Do NOT reset `messages` — it accumulates the conversation. It's cleared only
    // by "New chat" (startNewThread) or by opening a different conversation.
    setLiveUserMsg(testPrompt)
    setPrompt('')                 // clear composer after sending (chat UX)
    atBottomRef.current = true    // a fresh turn always lands in view
    setRunning(true)
    setRunState('running')
    setOutput('')
    outputAccRef.current = ''
    flushPendingRef.current = false
    hasWarnedLongOutputRef.current = false
    setActivityLog([])
    setElapsedMs(0)
    setShowRating(false)
    startTimeRef.current = Date.now()
    // Stable idempotency key for THIS logical send. Reused across the transparent
    // retry below so a (rare) attempt that did reach the server replays its cached
    // result instead of spawning a second generation; same historyId ⇒ same
    // history row + same chat bubbles regardless of how many attempts ran.
    const idempotencyKey = `${historyId}:${Date.now().toString(36)}`
    let retried = false

    // Client-side idle watchdog. Server sends heartbeat comments every ~8s, so this
    // 180s timer only fires if the stream is TRULY dead (server crash, network drop,
    // or a proxy buffering the SSE so no bytes arrive). Generous so a slow first
    // token (opus can think 20–30s before any text) never aborts a live run. The
    // read loop calls resetIdleTimer() on every reader.read(), including heartbeats.
    const CLIENT_IDLE_MS = 180_000
    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        try {
          abortRef.current?.abort(new DOMException('Stream idle timeout', 'TimeoutError'))
        } catch {
          abortRef.current?.abort()
        }
      }, CLIENT_IDLE_MS)
    }
    resetIdleTimer()

    // One network+stream attempt. Returns a structured outcome and NEVER commits
    // chat bubbles / persists — the caller commits exactly once on the FINAL
    // outcome, so a transparent retry can't double-render or double-persist.
    // A "zero-byte-failure" means the POST never produced a byte (the browser
    // queued it past the 6-connection cap and it never reached the server) — the
    // only case we silently retry, since no generation was created server-side.
    type AttemptOutcome =
      | { kind: 'completed'; terminalState: RunState; fullOutput: string; hadError: boolean }
      | { kind: 'zero-byte-failure' }
      | { kind: 'aborted-by-user'; partial: string }
      | { kind: 'failed'; error: unknown; isIdleTimeout: boolean }

    const TTFB_MS = 22_000

    const attempt = async (): Promise<AttemptOutcome> => {
      // Fresh controller + per-attempt accumulators so a retry starts clean.
      abortRef.current = new AbortController()
      setRunState('running')
      let firstByte = false
      resetIdleTimer()
      // TTFB watchdog: only guards the gap until fetch() resolves. If the POST is
      // queued behind the connection cap, fetch() never resolves → abort fast so
      // we retry, instead of hanging the full 180s idle window with no bytes.
      if (ttfbTimerRef.current) clearTimeout(ttfbTimerRef.current)
      ttfbTimerRef.current = setTimeout(() => {
        if (!firstByte) {
          try { abortRef.current?.abort(new DOMException('No first byte', 'TtfbError')) }
          catch { abortRef.current?.abort() }
        }
      }, TTFB_MS)
      const clearTtfb = () => { if (ttfbTimerRef.current) { clearTimeout(ttfbTimerRef.current); ttfbTimerRef.current = null } }

      let fullOutput = ''
      let hadError = false
      // Terminal outcome captured from the SSE stream (default to 'error' so a
      // stream that ends with NO terminal event is treated as a failure, not a
      // silent success — D4). Resolved threadId comes back on start/done.
      let terminalState: RunState = 'error'

      try {
        const body: Record<string, unknown> = {
          agentName: agentToUse || undefined,
          prompt: testPrompt,
          timeoutMs: settings.timeoutMs,
          historyId,                                   // B4: shared id ⇒ no dup rows
          threadId: threadIdForRun,                    // always threaded (single-system chat)
          idempotencyKey,                              // stable across retry ⇒ no double-spawn
          model: settings.fastMode ? 'fast' : undefined, // Fast toggle → faster model
        }
        if (settings.customInstructions.trim()) {
          body.customInstructions = settings.customInstructions.trim()
        }
        if (attachmentsRef.current.length) {
          body.files = attachmentsRef.current.map(a => ({ name: a.name, content: a.content, encoding: a.encoding }))
          setAttachments([]) // consumed by this run
        }

        const response = await fetch('/api/playground/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        })
        // The request reached the server and responded — the connection is alive,
        // so this is no longer a starvation case (even if the status is an error).
        firstByte = true
        clearTtfb()

        if (!response.ok) {
          // Distinct UX for rate limiting — surface Retry-After if upstream provided one.
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After')
            const hint = retryAfter ? ` Retry in ${retryAfter}s.` : ' Wait a moment.'
            toast('error', `Rate limit hit on /playground/run.${hint}`)
            throw new Error(`429 Too Many Requests — ${hint.trim()}`)
          }
          if (response.status === 415) {
            throw new Error('Server rejected request: Content-Type must be application/json (transport bug).')
          }
          const errText = await response.text().catch(() => `HTTP ${response.status}`)
          const isClient = response.status >= 400 && response.status < 500
          throw new Error(isClient
            ? `Bad request (${response.status}): ${errText.slice(0, 200)}`
            : `Server error (${response.status}). Try again.`)
        }
        if (!response.body) throw new Error('No response body')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        // rAF-based flush: batches rapid SSE chunks into single React state updates
        const flushOutput = () => { setOutput(outputAccRef.current); flushPendingRef.current = false }

        const processLine = (line: string) => {
          const trimmed = line.trim()
          // Ignore SSE heartbeat comments (start with ':') — they're present only to
          // keep the connection alive. Bytes consumed already reset the idle timer.
          if (!trimmed.startsWith('data: ')) return
          try {
            const event = JSON.parse(trimmed.slice(6))
            if (event.type === 'start') {
              if (event.threadId) resolvedThreadId = event.threadId
              resetIdleTimer()
            } else if (event.type === 'chunk') {
              fullOutput += event.content
              outputAccRef.current = fullOutput
              if (!flushPendingRef.current) {
                flushPendingRef.current = true
                rafIdRef.current = requestAnimationFrame(flushOutput)
              }
              // Warn once when output gets very large
              if (fullOutput.length > 400_000 && !hasWarnedLongOutputRef.current) {
                hasWarnedLongOutputRef.current = true
                toast('error', 'Output is very large (>400KB) and may not be fully saved between sessions.')
              }
            } else if (event.type === 'activity') {
              const elapsed = Date.now() - startTimeRef.current
              setActivityLog(prev => [...prev.slice(-49), { message: event.message, time: elapsed }])
            } else if (event.type === 'warning') {
              const elapsed = Date.now() - startTimeRef.current
              const scope = event.scope ? `[${event.scope}] ` : ''
              setActivityLog(prev => [...prev.slice(-49), { message: `Warning: ${scope}${event.message}`, time: elapsed }])
            } else if (event.type === 'stalled') {
              const elapsed = Date.now() - startTimeRef.current
              const secs = Math.round((event.idleMs || 0) / 1000)
              setActivityLog(prev => [...prev.slice(-49), { message: `Stream stalled: no output for ${secs}s (server will terminate soon)`, time: elapsed }])
            } else if (event.type === 'done') {
              reachedTerminal = true // an actual terminal EVENT (not just a closed socket)
              fullOutput = event.output || fullOutput
              setOutput(fullOutput)
              if (event.threadId) resolvedThreadId = event.threadId
              terminalState = fullOutput.trim() ? 'success' : 'empty'
            } else if (event.type === 'error') {
              reachedTerminal = true
              // Build a structured error block. Show error line, then code/cause/tip
              // /stderrTail as labeled rows so the operator can self-diagnose.
              const lines: string[] = [`Error: ${event.error || 'Unknown error'}`]
              if (event.code) lines.push(`Code: ${event.code}`)
              if (event.cause) lines.push(`Cause: ${event.cause}`)
              if (event.tip) lines.push(`Tip: ${event.tip}`)
              if (Array.isArray(event.candidates) && event.candidates.length > 0) {
                lines.push(`Valid agent names: ${event.candidates.slice(0, 10).join(', ')}${event.candidates.length > 10 ? ', …' : ''}`)
              }
              if (event.stderrTail) {
                lines.push('--- stderr (last 500 chars) ---')
                lines.push(event.stderrTail)
              }
              const block = lines.join('\n')
              fullOutput = fullOutput ? `${fullOutput}\n\n---\n${block}` : block
              setOutput(fullOutput)
              hadError = true
              // D3: timeouts get a distinct state from generic errors.
              terminalState = (event.code === 'wall_timeout' || event.code === 'idle_timeout') ? 'timeout' : 'error'
              // CTA toast for spawn / binary-missing — link operator to /setup.
              if (event.code === 'claude_binary_missing' || (event.code && event.code.startsWith('spawn_'))) {
                toast('error', 'Claude CLI problem. Open /setup → Run Self-Test for diagnostics.')
              }
            }
          } catch (err) {
            const elapsed = Date.now() - startTimeRef.current
            setActivityLog(prev => [...prev.slice(-49), { message: 'Warning: dropped malformed server event', time: elapsed }])
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          resetIdleTimer()
          buffer += decoder.decode(value, { stream: true })
          // Guard against non-delimited giant chunks (memory protection)
          if (buffer.length > 1_000_000) {
            abortRef.current?.abort()
            toast('error', 'Server sent an unexpectedly large response — stream aborted.')
            break
          }
          const parts = buffer.split('\n')
          buffer = parts.pop() ?? ''
          for (const line of parts) processLine(line)
        }

        // Flush remaining buffer
        if (buffer.trim()) {
          for (const line of buffer.split('\n')) processLine(line)
        }
        // NOTE: reachedTerminal is set only when an actual done/error EVENT was
        // received (in processLine) — NOT merely because the socket closed. A
        // navigation/refresh closes the socket WITHOUT a terminal event, leaving
        // the reattach marker intact so the reloaded page reconnects.
        return { kind: 'completed', terminalState, fullOutput, hadError }
      } catch (err: unknown) {
        const abortReason = abortRef.current?.signal.reason as { name?: string } | undefined
        const isAbort = err instanceof Error && err.name === 'AbortError'
        const isTtfb = isAbort && abortReason?.name === 'TtfbError'
        const isIdleTimeout = isAbort
          && (abortReason?.name === 'TimeoutError' || (err as Error & { cause?: { name?: string } }).cause?.name === 'TimeoutError')
        // Zero-byte: the fetch never resolved (queued/starved → TTFB abort) or a
        // network-level failure before any response. Retryable — no server run exists.
        if (!firstByte && (isTtfb || !isAbort)) return { kind: 'zero-byte-failure' }
        if (isIdleTimeout) return { kind: 'failed', error: err, isIdleTimeout: true }
        if (isAbort) return { kind: 'aborted-by-user', partial: outputAccRef.current }
        return { kind: 'failed', error: err, isIdleTimeout: false }
      } finally {
        clearTtfb()
        if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null }
        abortRef.current = null
      }
    }

    try {
      // ── Run, with ONE transparent retry on a pure zero-byte failure ──────────
      let outcome = await attempt()
      if (outcome.kind === 'zero-byte-failure' && !retried && !unloadingRef.current) {
        retried = true
        // Nothing was committed yet — reset the per-attempt output accumulators so
        // the retry renders cleanly, then try once more on a fresh connection.
        outputAccRef.current = ''
        setOutput('')
        outcome = await attempt()
      }

      const duration = Date.now() - startTimeRef.current
      const agentDisplay = resolvedAgent?.name || agentToUse || 'No Agent'
      const statusMap: Record<RunState, PlaygroundRunStatus> = {
        idle: 'success', running: 'success', success: 'success',
        empty: 'error', error: 'error', timeout: 'timeout', cancelled: 'cancelled',
      }

      if (outcome.kind === 'completed') {
        // Ensure final output state is synced (flush any pending rAF)
        setOutput(outputAccRef.current)
        if (outcome.terminalState === 'error' && !outcome.hadError && !outcome.fullOutput.trim()) {
          // Stream closed cleanly but emitted no done/error — surface it.
          setOutput(prev => prev || 'Error: stream ended without a result.')
        }
        setRunState(outcome.terminalState)
        // Active thread stays in sync if the server created/continued one.
        if (resolvedThreadId && resolvedThreadId !== activeThreadIdRef.current) {
          activeThreadIdRef.current = resolvedThreadId
          setActiveThreadId(resolvedThreadId)
        }
        const finalTurnOutput = outputAccRef.current
        const committedAssistant = outcome.fullOutput || finalTurnOutput
        const finalStatus = statusMap[outcome.terminalState]
        persistResult({
          id: historyId,                                 // shared id ⇒ dedupe
          agent: agentToUse || '',
          agentName: agentDisplay,
          prompt: testPrompt,
          output: finalTurnOutput,
          duration,
          status: finalStatus,
          timestamp: new Date(),
          threadId: resolvedThreadId,
        })
        // Commit the turn into the chat bubble list (render source of truth).
        setMessages(prev => [
          ...prev,
          { id: `${historyId}-u`, role: 'user', content: testPrompt, status: 'success' },
          { id: `${historyId}-a`, role: 'assistant', content: committedAssistant || '(no output)', status: finalStatus },
        ])
        setLiveUserMsg('')
        if (resolvedThreadId) {
          currentTurnRef.current = ''
          refreshThreads()
          setTimeout(() => promptRef.current?.focus(), 50)
        }
      } else if (outcome.kind === 'aborted-by-user') {
        setOutput(prev => prev ? prev + '\n\n---\n*Test cancelled by user*' : 'Test cancelled.')
        setRunState('cancelled')
        const bubbleText = (outcome.partial ? `${outcome.partial}\n\n---\n` : '') + '*Cancelled by user*'
        setMessages(prev => [
          ...prev,
          { id: `${historyId}-u`, role: 'user', content: testPrompt, status: 'success' },
          { id: `${historyId}-a`, role: 'assistant', content: bubbleText, status: 'cancelled' },
        ])
        setLiveUserMsg('')
        // cancelRun() already cleared the reattach marker; leave reachedTerminal as-is.
      } else {
        // 'failed' OR an exhausted 'zero-byte-failure' (retry didn't help).
        reachedTerminal = true
        let msg: string
        let status: PlaygroundRunStatus
        if (outcome.kind === 'zero-byte-failure') {
          msg = 'Could not reach the server after an automatic retry — the live connection may be saturated. Reload the page, or open the app on http://localhost:3847 (the built server streams directly).'
          status = 'timeout'
        } else if (outcome.isIdleTimeout) {
          msg = `No bytes received for ${Math.round(CLIENT_IDLE_MS / 1000)}s — stream aborted. This usually means a dev proxy is buffering the live stream. Reload, or open the app on http://localhost:3847 (the built server streams directly).`
          status = 'timeout'
        } else {
          msg = outcome.error instanceof Error ? outcome.error.message : String(outcome.error)
          status = 'error'
        }
        setOutput(prev => prev ? `${prev}\n\n---\nError: ${msg}` : `Error: ${msg}`)
        setRunState(status)
        persistResult({
          id: historyId,
          agent: agentToUse || '',
          agentName: agentDisplay,
          prompt: testPrompt,
          output: `Error: ${msg}`,
          duration,
          status,
          timestamp: new Date(),
          threadId: resolvedThreadId,
        })
        setMessages(prev => [
          ...prev,
          { id: `${historyId}-u`, role: 'user', content: testPrompt, status: 'success' },
          { id: `${historyId}-a`, role: 'assistant', content: `Error: ${msg}`, status },
        ])
        setLiveUserMsg('')
      }
    } finally {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      if (ttfbTimerRef.current) {
        clearTimeout(ttfbTimerRef.current)
        ttfbTimerRef.current = null
      }
      setRunning(false)
      abortRef.current = null
      // Clear the reattach marker ONLY if the run actually finished here. If the
      // stream was aborted by a page refresh/navigation, the run keeps generating
      // server-side — leave the marker so the reloaded page re-attaches to it.
      if (reachedTerminal && !unloadingRef.current) {
        activeRunIdRef.current = null
        try { localStorage.removeItem(ACTIVE_RUN_KEY) } catch { /* ignore */ }
      }
    }
  }, [prompt, running, selectedAgent, settings, allAgents, persistResult, refreshThreads])

  // Stop = explicit cancel. Refresh/navigate does NOT stop a run (it keeps
  // generating in the background); only this kills the server-side process.
  const cancelRun = () => {
    const runId = activeRunIdRef.current
    if (runId) cancelPlaygroundRun(runId).catch(() => { /* best-effort; stream will end anyway */ })
    // Explicit Stop = the run is over: drop the reattach marker so a later reload
    // doesn't try to reconnect to a cancelled run.
    activeRunIdRef.current = null
    try { localStorage.removeItem(ACTIVE_RUN_KEY) } catch { /* ignore */ }
    abortRef.current?.abort()
  }

  // Re-attach to a generation that was already running on the server (e.g. after
  // a page refresh). Loads the conversation, then streams the rest of the live
  // answer and persists/reloads on completion. The work never stopped — we're
  // just reconnecting a viewer to it.
  const reattachRun = useCallback(async (runId: string, threadId: string, prompt: string) => {
    if (running || abortRef.current) return
    activeRunIdRef.current = runId
    activeThreadIdRef.current = threadId
    setActiveThreadId(threadId)
    try {
      const thread = await getPlaygroundThread(threadId)
      setMessages((thread.messages || []).map(m => ({ id: m.id || genId(), role: m.role, content: m.content || '', status: (m.status as PlaygroundRunStatus) || 'success' })))
      if (thread.agentName) setSelectedAgent(thread.agentName)
    } catch { /* brand-new thread without persisted turns yet — fine */ }
    setLiveUserMsg(prompt)
    setOutput('')
    outputAccRef.current = ''
    setRunState('running')
    setRunning(true)
    setElapsedMs(0)
    startTimeRef.current = Date.now()
    atBottomRef.current = true
    abortRef.current = new AbortController()
    toast('success', 'Reconnected — your chat kept running')
    let finished = false
    try {
      const resp = await fetch(`/api/playground/run/${encodeURIComponent(runId)}/stream`, { signal: abortRef.current.signal })
      if (!resp.body) throw new Error('No reattach stream')
      const reader = resp.body.getReader(); const dec = new TextDecoder(); let buffer = ''
      const processLine = (line: string) => {
        const t = line.trim(); if (!t.startsWith('data: ')) return
        try {
          const e = JSON.parse(t.slice(6))
          if (e.type === 'chunk') { outputAccRef.current += e.content; setOutput(outputAccRef.current) }
          else if (e.type === 'activity') { setActivityLog(prev => [...prev.slice(-49), { message: e.message, time: Date.now() - startTimeRef.current }]) }
          else if (e.type === 'done') { finished = true }
          else if (e.type === 'error') { finished = true; if (e.code !== 'run_not_found') setOutput(prev => prev || `Error: ${e.error || 'run failed'}`) }
        } catch { /* ignore malformed */ }
      }
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += dec.decode(value, { stream: true }); const parts = buffer.split('\n'); buffer = parts.pop() ?? ''; for (const l of parts) processLine(l) }
      if (buffer.trim()) for (const l of buffer.split('\n')) processLine(l)
    } catch { /* aborted or network drop — the run keeps going server-side */ } finally {
      setRunning(false); abortRef.current = null; setLiveUserMsg('')
      // Only drop the reattach marker if THIS reattach saw a real terminal AND we
      // aren't unloading. A 2nd refresh mid-reattach leaves the marker so the next
      // reload reconnects again (same guard as the primary run path).
      if (finished && !unloadingRef.current) {
        activeRunIdRef.current = null
        try { localStorage.removeItem(ACTIVE_RUN_KEY) } catch { /* ignore */ }
      }
      if (finished) {
        // The completed turn is now persisted — reload the conversation from DB.
        try {
          const thread = await getPlaygroundThread(threadId)
          setMessages((thread.messages || []).map(m => ({ id: m.id || genId(), role: m.role, content: m.content || '', status: (m.status as PlaygroundRunStatus) || 'success' })))
          const lastA = [...(thread.messages || [])].reverse().find(m => m.role === 'assistant')
          setOutput(lastA?.content || '')
          setRunState(thread.messages?.some(m => m.role === 'assistant' && m.status !== 'success') ? 'error' : 'success')
        } catch { /* ignore */ }
        refreshThreads()
      }
    }
  }, [running, refreshThreads])

  // On load, re-attach to a generation that was still running when the page was
  // last refreshed / navigated away. THIS is the "survive refresh" payoff: the
  // run never stopped server-side; we reconnect a viewer and keep streaming.
  // Mark the page as unloading so an in-flight run's network-error-on-unload
  // isn't mistaken for a real terminal (which would wipe the reattach marker).
  useEffect(() => {
    const onHide = () => { unloadingRef.current = true }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('beforeunload', onHide)
    return () => { window.removeEventListener('pagehide', onHide); window.removeEventListener('beforeunload', onHide) }
  }, [])

  const reattachCheckedRef = useRef(false)
  useEffect(() => {
    if (reattachCheckedRef.current) return
    reattachCheckedRef.current = true
    let raw: string | null = null
    try { raw = localStorage.getItem(ACTIVE_RUN_KEY) } catch { return }
    if (!raw) return
    let saved: { runId?: string; threadId?: string; prompt?: string } | null = null
    try { saved = JSON.parse(raw) } catch { try { localStorage.removeItem(ACTIVE_RUN_KEY) } catch { /* */ }; return }
    if (!saved?.runId || !saved?.threadId) { try { localStorage.removeItem(ACTIVE_RUN_KEY) } catch { /* */ }; return }
    const { runId, threadId, prompt } = saved
    getActivePlaygroundRun(threadId).then(info => {
      if (info.active && info.runId === runId) {
        reattachRun(runId, threadId, info.prompt || prompt || '')
      } else {
        // Finished while we were away — the result is persisted; just open it.
        try { localStorage.removeItem(ACTIVE_RUN_KEY) } catch { /* */ }
        openThread(threadId)
      }
    }).catch((err) => {
      // A NETWORK/API failure here is transient — KEEP the marker so a later
      // reload can retry the reconnect (only a definitive "not active" clears it).
      console.warn('[playground] active-run check failed; will retry on next load:', err?.message || err)
    })
  }, [reattachRun, openThread])

  // ─── Actions ──────────────────────────────────────────────────────────

  const copyOutput = async () => {
    // Await + catch: clipboard.writeText rejects when the browser blocks access
    // (insecure context, denied permission). Don't claim success on failure and
    // don't leak an unhandled rejection.
    try {
      await navigator.clipboard.writeText(output)
      toast('success', 'Copied to clipboard')
    } catch {
      toast('error', 'Copy failed — your browser blocked clipboard access')
    }
  }

  const exportItem = (item?: TestResult) => {
    const exportPrompt = item?.prompt || prompt
    const exportOutput = item?.output || output
    const exportAgent = item?.agentName || currentAgent?.name || 'raw-prompt'
    if (!exportOutput) return
    const blob = new Blob([`# Playground Test: ${exportAgent}\n\n**Prompt:**\n${exportPrompt}\n\n**Output:**\n${exportOutput}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `playground-${exportAgent.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40)}-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearAll = () => {
    setOutput('')
    setPrompt('')
    setSelectedAgent('')
    setActivityLog([])
    setShowRating(false)
    setRunState('idle')
    activeThreadIdRef.current = null
    setActiveThreadId(null)
    setMessages([])
    setLiveUserMsg('')
    setTranscriptPrefix('')
  }

  // ─── Templates ────────────────────────────────────────────────────────

  const saveTemplate = () => {
    if (!templateName.trim() || !prompt.trim()) return
    const tmpl: PromptTemplate = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: templateName.trim(),
      prompt: prompt.trim(),
      agentName: selectedAgent,
    }
    setTemplates(prev => [tmpl, ...prev].slice(0, 20))
    setTemplateName('')
    setShowSaveTemplate(false)
    toast('success', 'Template saved')
  }

  const loadTemplate = (tmpl: PromptTemplate) => {
    setPrompt(tmpl.prompt)
    if (tmpl.agentName) setSelectedAgent(tmpl.agentName)
    setShowTemplates(false)
  }

  const removeTemplate = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────

  const handlePromptKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    // Shift+Enter inserts a newline (chat-app convention) — let it through.
    if (e.shiftKey) return
    // Plain Enter or ⌘/Ctrl+Enter both send.
    e.preventDefault()
    runTest()
  }

  const handleAgentPickerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowAgentPicker(false)
      setAgentFilter('')
      setFocusedAgentIdx(-1)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedAgentIdx(prev => Math.min(prev + 1, flatAgentList.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedAgentIdx(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && focusedAgentIdx >= 0) {
      e.preventDefault()
      const item = flatAgentList[focusedAgentIdx]
      if (item) {
        setSelectedAgent(item.value)
        setShowAgentPicker(false)
        setAgentFilter('')
        setFocusedAgentIdx(-1)
      }
    }
  }

  // ─── Stats ────────────────────────────────────────────────────────────

  const successCount = history.filter(h => h.status === 'success').length
  const errorCount = history.filter(h => h.status === 'error').length
  const avgDuration = history.length > 0
    ? history.reduce((sum, h) => sum + h.duration, 0) / history.length
    : 0

  // ─── Render ───────────────────────────────────────────────────────────

  // Fullscreen output overlay
  if (fullscreenOutput) {
    return (
      <div className="fixed inset-0 z-50 bg-bg flex flex-col chat-fade-in">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface shrink-0">
          <p className="text-sm font-medium text-text flex items-center gap-2">
            <Terminal className="w-4 h-4 text-accent" />
            Output — {currentAgent?.name || 'Raw Prompt'}
          </p>
          <div className="flex items-center gap-1.5">
            <button onClick={copyOutput} className="flex items-center gap-1 text-xs text-text-muted hover:text-text px-2.5 py-1.5 rounded-lg hover:bg-surface-2 transition-colors">
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
            <button onClick={() => exportItem()} className="flex items-center gap-1 text-xs text-text-muted hover:text-text px-2.5 py-1.5 rounded-lg hover:bg-surface-2 transition-colors">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button onClick={() => setFullscreenOutput(false)} className="flex items-center gap-1 text-xs text-text-muted hover:text-text px-2.5 py-1.5 rounded-lg hover:bg-surface-2 transition-colors">
              <Minimize2 className="w-3.5 h-3.5" /> Exit
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            {settings.outputMode === 'markdown' ? (
              <div className="text-sm leading-relaxed"><MarkdownRenderer content={displayedOutput} /></div>
            ) : (
              <pre className="text-sm text-text whitespace-pre-wrap leading-relaxed font-mono break-words">{displayedOutput}</pre>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <ConfirmDialog
        open={!!pendingRun}
        title="Run this agent?"
        message={`Runs ${selectedAgent ? `"${selectedAgent}"` : 'this agent'} through your local Claude Code CLI — your Claude Code subscription session, NOT the metered API. Shown once per session.`}
        confirmLabel="Run"
        onClose={() => setPendingRun(null)}
        onConfirm={() => {
          runConfirmedRef.current = true
          const p = pendingRun
          setPendingRun(null)
          runTest(p?.prompt, p?.agent)
        }}
      />

      {/* Destructive-action confirmation — gates every delete / clear so nothing
          is removed on a single click. */}
      <ConfirmDialog
        open={!!pendingDelete}
        danger
        title={pendingDelete?.title || 'Delete?'}
        message={pendingDelete?.message}
        confirmLabel={pendingDelete?.confirmLabel || 'Delete'}
        cancelLabel="Cancel"
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { pendingDelete?.onConfirm(); setPendingDelete(null) }}
      />

      {/* Conversation actions menu (⋮) — fixed-positioned so it never clips inside
          the scrolling list. Labeled, click-outside dismissable. */}
      {rowMenu && (() => {
        const t = threads.find(x => x.id === rowMenu.id)
        if (!t) return null
        const close = () => setRowMenu(null)
        const itemCls = 'w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-surface-2 transition-colors'
        return (
          <>
            <div className="fixed inset-0 z-[80]" onClick={close} onContextMenu={(e) => { e.preventDefault(); close() }} />
            <div
              role="menu"
              aria-label="Conversation actions"
              className="fixed z-[81] w-44 bg-surface border border-border rounded-xl shadow-pop py-1 text-text chat-fade-in"
              style={{ top: Math.min(rowMenu.y + 4, window.innerHeight - 170), left: Math.max(8, Math.min(rowMenu.x - 176, window.innerWidth - 184)) }}
            >
              <button role="menuitem" className={itemCls} onClick={() => { close(); openThread(t.id); setRailOpen(false) }}>
                <MessageSquare className="w-4 h-4 text-text-muted" /> Open
              </button>
              <button role="menuitem" className={itemCls} onClick={() => { close(); startRename(t.id) }}>
                <Pencil className="w-4 h-4 text-text-muted" /> Rename
              </button>
              <div className="my-1 border-t border-border" />
              <button role="menuitem" className={`${itemCls} text-red`} onClick={() => {
                close()
                setPendingDelete({
                  title: 'Delete conversation?',
                  message: `“${t.title || 'Untitled'}” and its ${t.messageCount ?? 0} message${(t.messageCount ?? 0) === 1 ? '' : 's'} will be permanently deleted. This can't be undone.`,
                  confirmLabel: 'Delete',
                  onConfirm: () => removeThread(t.id),
                })
              }}>
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </>
        )
      })()}

      {/* Preflight banners — thin strip above the chat so readiness problems still
          surface without taking over the page as a header. */}
      {preflight && !preflight.okToRun && !preflightDismissed && (
        <div className="px-6 py-2.5 bg-red/10 border-b border-red/30 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-2 text-xs text-red min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-medium">Agent runs are not ready.</p>
              <p className="text-text-muted mt-0.5 break-words">
                {preflight.binary?.error || preflight.auth?.hint || 'Claude CLI / auth not available.'}
                {' '}Open <a href="/setup" className="underline hover:text-text">/setup → Run Self-Test</a> for diagnostics.
              </p>
            </div>
          </div>
          <button onClick={() => setPreflightDismissed(true)} className="text-text-muted hover:text-text shrink-0" title="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {preflight && preflight.okToRun && preflight.env?.nodeOk === false && !preflightDismissed && (
        <div className="px-6 py-2 bg-amber/10 border-b border-amber/30 flex items-center justify-between gap-3 shrink-0">
          <span className="flex items-center gap-2 text-xs text-amber">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Server is on Node {preflight.env.node} — better-sqlite3 expects Node 20. Restart under Node 20 if DB calls fail.
          </span>
          <button onClick={() => setPreflightDismissed(true)} className="text-text-muted hover:text-text shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Chat shell — left rail + center chat column + composer */}
      <div className="flex-1 flex min-h-0 relative">

        {/* ── Zone A: Left rail ─────────────────────────────────────────── */}
        {/* Mobile backdrop when the drawer is open */}
        {railOpen && (
          <div className="fixed inset-0 z-30 bg-bg/60 md:hidden" onClick={() => setRailOpen(false)} />
        )}
        <div role="complementary" aria-label="History and conversation threads" className={`fixed z-40 inset-y-0 left-0 flex flex-col w-[280px] min-w-[280px] border-r border-border bg-surface shrink-0 transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:transition-none md:shadow-none ${railOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full md:translate-x-0'}`}>
          {/* Rail header — title + New chat */}
          <div className="p-4 border-b border-border shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" /> Playground
              </h2>
              <button onClick={() => setRailOpen(false)} className="md:hidden p-1 rounded text-text-muted hover:text-text" title="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => { startNewThread(); setRailOpen(false) }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New chat
            </button>
          </div>

          {/* Agent picker (compact) */}
          <div className="px-3 py-3 border-b border-border shrink-0">
            <label className="text-[11px] font-medium text-text-muted block mb-1.5">Agent</label>
            <div className="relative" ref={agentPickerRef}>
              <button
                onClick={() => { setShowAgentPicker(!showAgentPicker); setAgentFilter(''); setFocusedAgentIdx(-1) }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm text-text hover:border-accent/40 transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {agents === null ? (
                    <>
                      <span className="w-5 h-5 rounded-full bg-surface-3 animate-pulse shrink-0" />
                      <span className="w-20 h-3 rounded bg-surface-3 animate-pulse" />
                    </>
                  ) : currentAgent ? (
                    <>
                      <AgentIcon name={currentAgent.name} uid={`pg-${currentAgent.name}`} size={20} global={currentAgent.scope === 'global'} />
                      <span className="font-medium truncate text-[13px]">{currentAgent.name}</span>
                    </>
                  ) : (
                    <>
                      <Terminal className="w-4 h-4 text-text-muted shrink-0" />
                      <span className="text-text-secondary text-[13px]">Raw prompt</span>
                    </>
                  )}
                </span>
                <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${showAgentPicker ? 'rotate-180' : ''}`} />
              </button>

              {showAgentPicker && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-pop z-50 max-h-[350px] flex flex-col overflow-hidden chat-fade-in">
                  <div className="p-2 border-b border-border shrink-0">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                      <input
                        value={agentFilter}
                        onChange={e => { setAgentFilter(e.target.value); setFocusedAgentIdx(-1) }}
                        onKeyDown={handleAgentPickerKeyDown}
                        placeholder="Search agents..."
                        className="input bg-surface-2 pl-8"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {/* No Agent option */}
                    <button
                      onClick={() => { setSelectedAgent(''); setShowAgentPicker(false); setAgentFilter('') }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-surface-2 transition-colors ${
                        !selectedAgent ? 'bg-accent-muted text-accent' : 'text-text-secondary'
                      } ${focusedAgentIdx === 0 ? 'ring-1 ring-inset ring-accent/40' : ''}`}
                    >
                      <Terminal className="w-4 h-4 text-text-muted shrink-0" />
                      <span>No Agent (raw prompt)</span>
                    </button>

                    {/* Global agents */}
                    {filteredGlobal.length > 0 && (
                      <>
                        <p className="text-[10px] font-semibold text-text-muted px-3 pt-2 pb-1">
                          Global ({filteredGlobal.length})
                        </p>
                        {filteredGlobal.map((agent, gi) => {
                          const listIdx = 1 + gi
                          return (
                            <button
                              key={`g-${agent.filename}`}
                              onClick={() => { setSelectedAgent(agent.filename || agent.name); setShowAgentPicker(false); setAgentFilter('') }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2 transition-colors ${
                                selectedAgent === agent.filename || selectedAgent === agent.name ? 'bg-accent-muted text-accent' : ''
                              } ${focusedAgentIdx === listIdx ? 'ring-1 ring-inset ring-accent/40' : ''}`}
                            >
                              <AgentIcon name={agent.name} uid={`pick-g-${agent.name}`} size={20} global />
                              <div className="text-left min-w-0 flex-1">
                                <p className="font-medium truncate text-[12px]">{formatAgentDisplay({ name: agent.name, id: agent.filename }).realName}</p>
                                <p className="text-[10px] text-text-muted truncate">{agent.description?.slice(0, 120)}</p>
                              </div>
                              <span className="text-[9px] text-text-muted shrink-0 font-mono">{agent.model}</span>
                            </button>
                          )
                        })}
                      </>
                    )}

                    {/* Project agents */}
                    {filteredProject.length > 0 && (
                      <>
                        <p className="text-[10px] font-semibold text-text-muted px-3 pt-2 pb-1">
                          Project ({filteredProject.length})
                        </p>
                        {filteredProject.map((agent, pi) => {
                          const listIdx = 1 + filteredGlobal.length + pi
                          return (
                            <button
                              key={`p-${agent.filename}-${agent.projectName}`}
                              onClick={() => { setSelectedAgent(agent.filename || agent.name); setShowAgentPicker(false); setAgentFilter('') }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2 transition-colors ${
                                selectedAgent === agent.filename || selectedAgent === agent.name ? 'bg-accent-muted text-accent' : ''
                              } ${focusedAgentIdx === listIdx ? 'ring-1 ring-inset ring-accent/40' : ''}`}
                            >
                              <AgentIcon name={agent.name} uid={`pick-p-${agent.name}`} size={20} global={false} />
                              <div className="text-left min-w-0 flex-1">
                                <p className="font-medium truncate text-[12px]">{formatAgentDisplay({ name: agent.name, id: agent.filename }).realName}</p>
                                <p className="text-[10px] text-text-muted truncate">{agent.projectName}</p>
                              </div>
                              <span className="text-[9px] text-text-muted shrink-0 font-mono">{agent.model}</span>
                            </button>
                          )
                        })}
                      </>
                    )}

                    {filteredAgents.length === 0 && agentFilter && (
                      <p className="text-xs text-text-muted text-center py-4">No agents match &quot;{agentFilter}&quot;</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Conversations list header — single system, no tabs. */}
          <div className="px-3 py-2 flex items-center justify-between gap-2 shrink-0">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted shrink-0">
              <MessageSquare className="w-3 h-3" /> Chats {threads.length > 0 && <span className="text-text-muted">({threads.length})</span>}
            </span>
            <div className="flex items-center gap-1.5">
              {threads.length > 1 && (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
                  <input
                    value={threadFilter}
                    onChange={e => setThreadFilter(e.target.value)}
                    placeholder="Search…"
                    aria-label="Search conversations"
                    className="input w-28 bg-surface-2 pl-6 pr-2 py-1 text-[10px]"
                  />
                </div>
              )}
              {threads.length > 0 && (
                <button
                  onClick={() => setPendingDelete({
                    title: 'Delete all conversations?',
                    message: `All ${threads.length} conversation${threads.length === 1 ? '' : 's'} and their messages will be permanently deleted. This can't be undone.`,
                    confirmLabel: 'Delete all',
                    onConfirm: clearThreads,
                  })}
                  className="text-[10px] font-medium text-text-muted hover:text-red transition-colors px-1.5 py-0.5 rounded hover:bg-red/10 shrink-0"
                  title="Delete all conversations"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {threadsLoading && threads.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-text-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading chats…
              </div>
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center text-center py-8 px-3">
                <MessageSquare className="w-6 h-6 text-text-muted mb-2" />
                <p className="text-[11px] text-text-muted">No chats yet.</p>
                <p className="text-[10px] text-text-muted mt-0.5">Type a message below to start your first conversation.</p>
              </div>
            ) : filteredThreads.length === 0 ? (
                <p className="text-[11px] text-text-muted text-center py-4 px-2">No conversations match “{threadFilter}”.</p>
              ) : (
                <div className="space-y-0.5">
                  {filteredThreads.map(t => {
                    const renaming = renamingId === t.id
                    return (
                    <div
                      key={t.id}
                      className={`group flex items-center gap-1 pr-1 rounded-lg transition-colors ${activeThreadId === t.id ? 'bg-accent/10 ring-1 ring-accent/30' : rowMenu?.id === t.id ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
                    >
                      {renaming ? (
                        <>
                          <MessageSquare className="w-3.5 h-3.5 text-accent shrink-0 ml-3" />
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); commitRename(t.id) }
                              else if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                            }}
                            onBlur={() => commitRename(t.id)}
                            maxLength={200}
                            aria-label="Rename conversation"
                            className="input bg-surface-2 px-1.5 py-0.5 text-[11px] flex-1 min-w-0 my-2"
                          />
                          <button
                            onClick={() => commitRename(t.id)}
                            className="p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-all shrink-0"
                            title="Save name" aria-label="Save name"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Open-area is its own button so it's not a nested interactive
                              inside an interactive row (a11y: no role=button wrapper). */}
                          <button
                            onClick={() => { openThread(t.id); setRailOpen(false) }}
                            className="flex items-center gap-2 min-w-0 flex-1 pl-3 pr-1 py-2.5 text-left rounded-lg"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-accent shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="text-[11px] font-medium truncate flex-1 text-text">{t.title || 'Untitled'}</p>
                                <span className="text-[9px] text-text-muted shrink-0">{formatTime(new Date(t.updatedAt))}</span>
                              </div>
                              <p className="text-[10px] text-text-muted truncate">{t.agentName || 'No agent'} · {t.messageCount ?? 0} message{(t.messageCount ?? 0) === 1 ? '' : 's'}</p>
                            </div>
                          </button>
                          <button
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect()
                              setRowMenu({ id: t.id, kind: 'thread', x: r.right, y: r.bottom })
                            }}
                            className={`p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-all shrink-0 ${rowMenu?.id === t.id ? 'opacity-100 bg-surface-2' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                            title="Conversation actions"
                            aria-label={`Actions for ${t.title || 'Untitled'}`}
                            aria-haspopup="menu"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )})}
                </div>
              )}
          </div>
        </div>

        {/* ── Zone B: Center chat column ────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Progress bar while running */}
          {running && (
            <div className="absolute top-0 left-0 right-0 h-0.5 z-20">
              <div className="h-full bg-gradient-to-r from-accent via-purple to-accent animate-pulse rounded-full" />
            </div>
          )}

          {/* Slim chat header */}
          <div className="px-6 py-3 border-b border-border bg-surface flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setRailOpen(true)}
                className="md:hidden p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors shrink-0"
                title="Open sidebar"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
              {/* Agent avatar — anchors the conversation to "who am I talking to". */}
              {currentAgent ? (
                <AgentIcon name={currentAgent.name} uid={`hdr-${currentAgent.name}`} size={32} global={currentAgent.scope === 'global'} className="shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <Terminal className="w-4 h-4 text-text-muted" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-sm font-semibold truncate text-text">
                    {currentAgent?.name || 'Raw prompt'}
                  </h3>
                  {currentAgent?.model && (
                    <span className="text-[10px] font-mono uppercase tracking-wide text-text-muted bg-surface-2 border border-border rounded px-1.5 py-0.5 shrink-0">{currentAgent.model}</span>
                  )}
                  {/* Auth chip — refined pill with a status dot so it reads as a badge. */}
                  {preflight?.auth?.source === 'subscription' && (
                    <span className="flex items-center gap-1.5 bg-green-muted text-text-secondary rounded-full pl-1.5 pr-2 py-0.5 text-[10px] font-medium shrink-0" title="Every run uses your Claude Code subscription session — never the metered API.">
                      <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" /> Subscription
                    </span>
                  )}
                  {preflight?.auth?.source === 'api_key' && (
                    <span className="flex items-center gap-1.5 bg-amber-muted text-amber rounded-full pl-1.5 pr-2 py-0.5 text-[10px] font-medium shrink-0" title="Runs against the metered Claude API — billed per token.">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" /> API key · metered
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-text-muted flex items-center gap-2 truncate mt-0.5">
                  {activeThreadId && (
                    <span className="flex items-center gap-1 text-accent truncate">
                      <MessageSquare className="w-3 h-3 shrink-0" /> {activeThread?.title || 'Conversation'}
                    </span>
                  )}
                  {/* Run outcome chip — distinct visual per terminal RunState. */}
                  {!running && runState === 'timeout' && (
                    <span className="flex items-center gap-1 text-amber shrink-0"><Clock className="w-3 h-3" /> Timed out</span>
                  )}
                  {!running && runState === 'cancelled' && (
                    <span className="flex items-center gap-1 text-text-muted shrink-0"><Ban className="w-3 h-3" /> Cancelled</span>
                  )}
                  {!running && runState === 'error' && (
                    <span className="flex items-center gap-1 text-red shrink-0"><AlertCircle className="w-3 h-3" /> Error</span>
                  )}
                  {!running && runState === 'empty' && (
                    <span className="flex items-center gap-1 text-amber shrink-0"><AlertCircle className="w-3 h-3" /> No output</span>
                  )}
                  {history.length > 0 && (
                    <span className="text-text-secondary shrink-0">
                      {successCount} passed · {errorCount} failed · avg {formatDuration(avgDuration)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {output && (
                <>
                  <button onClick={copyOutput} title="Copy output" aria-label="Copy output" className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => exportItem()} title="Export as Markdown" aria-label="Export as Markdown" className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSettings(s => ({ ...s, outputMode: s.outputMode === 'markdown' ? 'raw' : 'markdown' }))}
                    title="Toggle output format"
                    className="px-2 py-1.5 text-[11px] rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                  >
                    {settings.outputMode === 'markdown' ? 'Raw' : 'Rendered'}
                  </button>
                  <button onClick={() => setFullscreenOutput(true)} title="Fullscreen" aria-label="Fullscreen output" className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={() => setShowSettings(!showSettings)}
                title="Settings"
                aria-label="Settings"
                aria-pressed={showSettings}
                className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-text hover:bg-surface-2'}`}
              >
                <Settings2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  // Nothing to lose on a pristine view → clear silently; otherwise confirm.
                  if (messages.length === 0 && !output && !liveUserMsg && !prompt.trim()) { clearAll(); return }
                  setPendingDelete({
                    title: 'Clear this chat?',
                    message: 'The current conversation will be cleared from view. Saved chats in the sidebar are not affected.',
                    confirmLabel: 'Clear',
                    onConfirm: clearAll,
                  })
                }}
                title="Clear chat" aria-label="Clear chat" className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={outputRef} role="region" aria-label="Agent output" className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4 relative">
            {renderedMessages.length === 0 && !running ? (
              /* Empty state */
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-3">
                  {currentAgent ? (
                    <AgentIcon name={currentAgent.name} uid={`empty-${currentAgent.name}`} size={32} global={currentAgent.scope === 'global'} />
                  ) : (
                    <Sparkles className="w-6 h-6 text-accent" />
                  )}
                </div>
                <p className="text-sm font-medium text-text-secondary mb-1">
                  Ask {currentAgent?.name || 'an agent'} anything
                </p>
                <p className="text-xs text-text-muted max-w-[300px] mb-5">
                  Type a message below and press Enter. Real-time streaming output, no metered API cost.
                </p>
                {!prompt && (
                  <div className="w-full max-w-md">
                    <p className="text-[10px] font-semibold text-text-muted mb-2">Try an example</p>
                    <div className="grid gap-2">
                      {EXAMPLE_PROMPTS.map(ex => (
                        <button
                          key={ex}
                          onClick={() => { setPrompt(ex); promptRef.current?.focus() }}
                          className="text-left text-xs px-4 py-2.5 rounded-lg bg-surface-2 border border-border text-text-secondary hover:text-text hover:border-accent/30 hover:shadow-soft hover:-translate-y-px transition-all"
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {renderedMessages.map((m, i) => {
                  const isUser = m.role === 'user'
                  const isLastAssistant = !isUser && i === renderedMessages.length - 1
                  return (
                    <div key={m.id || `msg-${i}`} className={`flex gap-3 chat-fade-in ${isUser ? 'justify-end' : ''}`}>
                      {!isUser && (
                        <div className="w-7 h-7 rounded-lg bg-accent-muted flex items-center justify-center shrink-0 mt-0.5">
                          {currentAgent ? (
                            <AgentIcon name={currentAgent.name} uid={`bubble-${currentAgent.name}`} size={18} global={currentAgent.scope === 'global'} />
                          ) : (
                            <Bot className="w-4 h-4 text-accent" />
                          )}
                        </div>
                      )}
                      <div
                        aria-live={!isUser && isLastAssistant && running ? 'polite' : undefined}
                        aria-atomic="false"
                        className={`min-w-0 max-w-[85%] sm:max-w-[78%] ${isUser ? '' : 'lg:max-w-[760px]'} rounded-2xl px-4 py-3 ${
                        isUser
                          ? 'bg-accent text-white rounded-br-md shadow-soft'
                          : 'bg-surface-2 border border-border rounded-bl-md shadow-soft'
                      }`}>
                        {isUser ? (
                          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
                        ) : settings.outputMode === 'raw' ? (
                          <pre className="text-sm text-text whitespace-pre-wrap leading-relaxed font-mono break-words">
                            {m.content}
                            {isLastAssistant && running && <span className="inline-block w-2 h-4 ml-0.5 bg-accent animate-pulse rounded-sm align-middle" />}
                          </pre>
                        ) : (
                          <div className="text-sm prose-sm">
                            <MarkdownRenderer content={m.content} />
                            {isLastAssistant && running && <span className="inline-block w-2 h-4 ml-0.5 bg-accent animate-pulse rounded-sm" />}
                          </div>
                        )}
                      </div>
                      {isUser && (
                        <div className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="w-4 h-4 text-text-muted" />
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Typing row — running with no output yet */}
                {running && !output && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-accent-muted flex items-center justify-center shrink-0 mt-0.5">
                      {currentAgent ? (
                        <AgentIcon name={currentAgent.name} uid={`typing-${currentAgent.name}`} size={18} global={currentAgent.scope === 'global'} />
                      ) : (
                        <Bot className="w-4 h-4 text-accent" />
                      )}
                    </div>
                    <div className="max-w-[75%] rounded-2xl rounded-bl-md px-4 py-3 bg-surface-2 border border-border shadow-soft">
                      <p className="text-sm text-text-secondary flex items-center gap-1.5" aria-live="polite">
                        {/* Animated typing dots so the wait reads as "actively working". */}
                        <span className="inline-flex gap-0.5" aria-hidden>
                          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" />
                        </span>
                        <span>
                          {activityLog.length > 0 ? activityLog[activityLog.length - 1].message : 'Thinking'}
                        </span>
                        <span className="font-mono text-text-muted text-xs">{formatDuration(elapsedMs)}</span>
                      </p>
                      {activityLog.length === 0 && elapsedMs > 4000 && (
                        <p className="text-[11px] text-text-muted italic mt-1">
                          {settings.fastMode ? 'Fast mode — first words should arrive shortly.' : 'First token can take 15–25s on Opus — tip: toggle Fast for snappier replies.'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Rating bar — below the last assistant bubble when done */}
                {output && !running && (
                  <div className="flex justify-start pl-10 chat-fade-in">
                    <div className="max-w-[75%] w-full">
                      {!showRating ? (
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-text-muted">Rate this output:</span>
                          <button
                            onClick={async () => {
                              try {
                                // The training store is correction-shaped (issue→correction);
                                // record the positive as a real reinforcement entry (a blank
                                // issue is rejected 400). Honest: real save → real toast.
                                await addTraining(
                                  selectedAgent || 'playground',
                                  'Positive signal — this output was correct',
                                  'Reproduce this quality and approach in future runs.',
                                )
                                toast('success', 'Positive signal saved')
                              } catch (err) {
                                apiError('Save positive signal', err)
                              }
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-text-secondary hover:text-emerald hover:bg-emerald/10 transition-colors"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" /> Good
                          </button>
                          <button
                            onClick={() => setShowRating(true)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-text-secondary hover:text-red hover:bg-red-muted transition-colors"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" /> Needs Fix
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 bg-surface border border-border rounded-xl p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-text-secondary">Train this agent:</span>
                            <button onClick={() => setShowRating(false)} className="text-text-muted hover:text-text">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <input
                            value={ratingIssue}
                            onChange={e => setRatingIssue(e.target.value)}
                            placeholder="What was wrong?"
                            className="input bg-surface-2 py-1.5 text-xs"
                            autoFocus
                          />
                          <input
                            value={ratingCorrection}
                            onChange={e => setRatingCorrection(e.target.value)}
                            placeholder="What should it do instead?"
                            className="input bg-surface-2 py-1.5 text-xs"
                          />
                          <button
                            onClick={async () => {
                              if (!ratingIssue.trim() || !ratingCorrection.trim()) return
                              setRatingSubmitting(true)
                              try {
                                const agentKey = selectedAgent || 'playground'
                                await addTraining(agentKey, ratingIssue.trim(), ratingCorrection.trim())
                                toast('success', 'Correction saved — review it in Learning', { action: { label: 'Open Learning', onClick: () => navigate('/learning?tab=pending') } })
                                setShowRating(false)
                                setRatingIssue('')
                                setRatingCorrection('')
                              } catch (err) {
                                toast('error', err instanceof Error ? err.message : 'Failed to save')
                              } finally {
                                setRatingSubmitting(false)
                              }
                            }}
                            disabled={ratingSubmitting || !ratingIssue.trim() || !ratingCorrection.trim()}
                            className="btn-primary btn-sm"
                          >
                            {ratingSubmitting ? 'Saving...' : 'Save Correction'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />

            {/* Scroll to bottom */}
            {showScrollBottom && (
              <div className="sticky bottom-2 flex justify-end pr-1 pointer-events-none">
                <button
                  onClick={() => outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' })}
                  aria-label="Scroll to latest"
                  title="Scroll to latest"
                  className="pointer-events-auto p-2 rounded-full bg-surface border border-border shadow-card hover:bg-surface-2 transition-all text-text-muted hover:text-text"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* ── Zone C: Bottom composer ───────────────────────────────── */}
          <div className="px-6 py-4 border-t border-border bg-surface shrink-0">
            <div className="bg-surface-2 border border-border rounded-xl px-3 py-2 flex flex-col gap-2 focus-within:border-accent/50 transition-colors">
              {/* Attachment chips — inside the composer, above the input row, so the
                  input never feels bottom-heavy. */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {attachments.map(a => (
                    <span key={a.name} className="flex items-center gap-1 text-[11px] bg-surface border border-border rounded-lg pl-2 pr-1 py-1 text-text-secondary">
                      <FileText className="w-3 h-3 text-text-muted" />
                      <span className="max-w-[160px] truncate">{a.name}</span>
                      <span className="text-text-muted">{a.size > 1024 ? `${Math.round(a.size / 1024)}KB` : `${a.size}B`}</span>
                      <button onClick={() => removeAttachment(a.name)} className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-red" title="Remove" aria-label={`Remove ${a.name}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 w-full">
              {/* Left: attachments + templates */}
              <div className="flex items-center gap-1 pb-1 shrink-0">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={running || attachments.length >= 3}
                  title={attachments.length >= 3 ? 'Up to 3 files' : 'Attach files (the agent reads them — no API cost)'}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <div className="relative" ref={templateRef}>
                  <button
                    onClick={() => {
                      if (templates.length) setShowTemplates(v => !v)
                      else if (prompt.trim()) setShowSaveTemplate(true)
                      else toast('warn', 'Type a prompt first, then save it as a reusable template.')
                    }}
                    title={templates.length ? `Templates (${templates.length})` : prompt.trim() ? 'Save this prompt as a template' : 'Save as template — type a prompt first'}
                    aria-label="Templates"
                    className={`relative p-1.5 rounded-lg transition-colors ${showTemplates || showSaveTemplate ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-text hover:bg-surface'}`}
                  >
                    <Bookmark className="w-4 h-4" />
                    {templates.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-accent text-white text-[8px] font-bold flex items-center justify-center">{templates.length}</span>
                    )}
                  </button>

                  {/* Save template form */}
                  {showSaveTemplate && (
                    <div className="absolute left-0 bottom-full mb-2 w-56 bg-surface border border-border rounded-xl shadow-pop z-30 p-3 space-y-2 chat-fade-in">
                      <p className="text-[11px] font-medium text-text">Save as template</p>
                      <input
                        value={templateName}
                        onChange={e => setTemplateName(e.target.value)}
                        placeholder="Template name..."
                        className="input bg-surface-2 px-2.5 py-1.5 text-xs"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveTemplate(); if (e.key === 'Escape') setShowSaveTemplate(false) }}
                      />
                      <div className="flex gap-1.5">
                        <button onClick={saveTemplate} disabled={!templateName.trim()} className="btn-primary btn-sm">Save</button>
                        <button onClick={() => setShowSaveTemplate(false)} className="btn-ghost btn-sm">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Templates dropdown */}
                  {showTemplates && (
                    <div className="absolute left-0 bottom-full mb-2 w-64 bg-surface border border-border rounded-xl shadow-pop z-30 max-h-[250px] overflow-y-auto chat-fade-in">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                        <span className="text-[11px] font-medium text-text">Templates ({templates.length})</span>
                        {prompt.trim() && (
                          <button onClick={() => { setShowTemplates(false); setShowSaveTemplate(true) }} className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-0.5">
                            <Save className="w-3 h-3" /> Save current
                          </button>
                        )}
                      </div>
                      {templates.map(tmpl => (
                        <div
                          key={tmpl.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => loadTemplate(tmpl)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              loadTemplate(tmpl)
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 transition-colors group cursor-pointer"
                        >
                          <BookmarkPlus className="w-3.5 h-3.5 text-text-muted shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium truncate">{tmpl.name}</p>
                            <p className="text-[10px] text-text-muted truncate">{tmpl.prompt.slice(0, 60)}</p>
                          </div>
                          <button
                            onClick={(e) => removeTemplate(e, tmpl.id)}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-red transition-all shrink-0"
                            aria-label="Remove template"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Middle: textarea */}
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder={activeThreadId
                  ? 'Reply to continue…'
                  : currentAgent
                  ? `Message ${currentAgent.name}…`
                  : 'Message…'
                }
                rows={1}
                className="flex-1 bg-transparent text-sm text-text resize-none focus:outline-none placeholder:text-text-muted min-h-[40px] max-h-[200px] py-2 leading-relaxed"
              />

              {/* Right: Fast toggle + Send / Stop */}
              <div className="flex items-center gap-1.5 pb-0.5 shrink-0">
                {/* Fast toggle — replies run on the fastest model (Haiku) for snappy
                    testing; off uses the agent's own model. Placed at the composer
                    so it reads as a per-message speed control. */}
                <button
                  type="button"
                  onClick={() => setSettings(s => ({ ...s, fastMode: !s.fastMode }))}
                  disabled={running}
                  aria-pressed={settings.fastMode}
                  title={settings.fastMode ? 'Fast mode ON — replies run on the fastest model (Haiku). Click for higher quality.' : 'Fast mode OFF — uses the agent’s own model. Click for snappier replies (Haiku).'}
                  className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                    settings.fastMode
                      ? 'bg-accent text-white border-accent'
                      : 'text-text-secondary border-border hover:text-text hover:bg-surface'
                  }`}
                >
                  <Zap className={`w-3.5 h-3.5 ${settings.fastMode ? 'fill-current' : ''}`} />
                  <span className="hidden sm:inline">Fast</span>
                </button>
                {running ? (
                  <button
                    onClick={cancelRun}
                    title="Stop generating"
                    aria-label="Stop run"
                    className="p-2 rounded-lg bg-red text-white hover:bg-red/90 transition-colors"
                  >
                    <StopCircle className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={() => runTest()}
                    disabled={!prompt.trim() || (preflight ? !preflight.okToRun : false)}
                    title={preflight && !preflight.okToRun ? 'Agent runs are not ready — see the banner above' : `${activeThreadId ? 'Send' : 'Run'}  ·  ⏎`}
                    aria-label={activeThreadId ? 'Send message' : 'Run agent'}
                    className="p-2 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                )}
              </div>
              </div>
            </div>

            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onPickFiles} />

            {/* Minimal meta — deliberately does NOT echo the Fast toggle (the pill
                already shows its on/off state in place), so clicking Fast only
                recolors the pill and never adds/removes a row below the composer.
                Only genuinely transient info shows here. */}
            {(prompt.length > 200 || settings.customInstructions || pendingRun) && (
              <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-text-muted">
                <span className="flex items-center gap-2">
                  {prompt.length > 200 && <span className="text-text-secondary">{prompt.length.toLocaleString()} chars</span>}
                  {settings.customInstructions && <span className="text-amber">Custom instructions on</span>}
                </span>
                {pendingRun && <span className="text-accent font-medium">Confirm to run</span>}
              </div>
            )}
          </div>
        </div>

        {/* Settings drawer — a fixed viewport sheet (overlays everything cleanly,
            never overlaps the chat header or participates in page scroll). */}
        {showSettings && (
          <div
            className="fixed inset-0 z-[70] bg-bg/50 backdrop-blur-[1px] transition-opacity"
            onClick={() => setShowSettings(false)}
            aria-hidden
          />
        )}
        <div
          ref={settingsRef}
          role="dialog"
          aria-modal="true"
          aria-label="Playground settings"
          className={`fixed inset-y-0 right-0 z-[71] w-full sm:w-[360px] max-w-[92vw] bg-surface border-l border-border shadow-pop flex flex-col transition-transform duration-200 will-change-transform ${
            showSettings ? 'translate-x-0' : 'translate-x-full pointer-events-none'
          }`}
        >
          {/* Pinned header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <p className="text-sm font-semibold text-text flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-accent" />
              Settings
            </p>
            <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors" aria-label="Close settings">
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-text-muted block mb-1.5">Timeout</label>
                <select
                  value={settings.timeoutMs}
                  onChange={e => setSettings(s => ({ ...s, timeoutMs: Number(e.target.value) }))}
                  aria-label="Run timeout"
                  className="input bg-surface-2 py-2.5 text-xs"
                >
                  {PLAYGROUND_TIMEOUT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-muted block mb-1.5">Output format</label>
                <select
                  value={settings.outputMode}
                  onChange={e => setSettings(s => ({ ...s, outputMode: e.target.value as 'markdown' | 'raw' }))}
                  aria-label="Output format"
                  className="input bg-surface-2 py-2.5 text-xs"
                >
                  <option value="markdown">Markdown (rendered)</option>
                  <option value="raw">Raw text</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-muted block mb-1.5">
                  Custom instructions override
                  <span className="font-normal text-text-muted ml-1">(replaces agent system prompt)</span>
                </label>
                <textarea
                  value={settings.customInstructions}
                  onChange={e => setSettings(s => ({ ...s, customInstructions: e.target.value }))}
                  placeholder="Leave empty to use agent's default instructions..."
                  className="input bg-surface-2 py-2.5 text-xs font-mono resize-none h-32"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
