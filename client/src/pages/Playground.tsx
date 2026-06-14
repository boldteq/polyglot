import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  Play, Copy, Trash2, Loader, CheckCircle, AlertCircle, Square,
  ChevronDown, RotateCcw, Clock, Sparkles, Download, Search,
  Settings2, X, ArrowDown, Terminal, ThumbsUp, ThumbsDown,
  Maximize2, Minimize2, Save, BookmarkPlus, Bookmark,
} from 'lucide-react'
import {
  getUnifiedAgents, addTraining,
  getPlaygroundHistory, savePlaygroundHistoryItem, deletePlaygroundHistoryItem, clearPlaygroundHistoryApi, apiError} from '../lib/api'
import type { PlaygroundHistoryItem } from '../lib/api'
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
  status: 'success' | 'error'
  timestamp: Date
}

interface PlaygroundSettings {
  timeoutMs: number
  customInstructions: string
  outputMode: 'markdown' | 'raw'
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

// ─── Component ──────────────────────────────────────────────────────────────

export default function Playground() {
  const { data: agents } = useApi(getUnifiedAgents, [], CacheKeys.unifiedAgents)

  // Core state — use lazy initializers so loadPersistedSession runs once, not on every render
  const [selectedAgent, setSelectedAgent] = useState<string>(() => loadPersistedSession().selectedAgent)
  const [prompt, setPrompt] = useState(() => loadPersistedSession().prompt)
  // C12: gate the first real Claude run of a session behind a cost confirm.
  const runConfirmedRef = useRef(false)
  const [pendingRun, setPendingRun] = useState<{ prompt?: string; agent?: string } | null>(null)
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState(() => loadPersistedSession().output)
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([])
  const [history, setHistory] = useState<TestResult[]>(loadPersistedHistory)
  const [settings, setSettings] = useState<PlaygroundSettings>(loadPersistedSettings)

  // UI state
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [agentFilter, setAgentFilter] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [historyFilter, setHistoryFilter] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const [showRating, setShowRating] = useState(false)
  const [ratingIssue, setRatingIssue] = useState('')
  const [ratingCorrection, setRatingCorrection] = useState('')
  const [ratingSubmitting, setRatingSubmitting] = useState(false)
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null)
  const [fullscreenOutput, setFullscreenOutput] = useState(false)
  const [focusedAgentIdx, setFocusedAgentIdx] = useState(-1)
  const [templates, setTemplates] = useState<PromptTemplate[]>(loadPersistedTemplates)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)

  // Refs
  const outputRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const agentPickerRef = useRef<HTMLDivElement>(null)
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const templateRef = useRef<HTMLDivElement>(null)
  // SSE batching: accumulate chunks in ref, flush via rAF to avoid per-chunk re-renders
  const outputAccRef = useRef('')
  const flushPendingRef = useRef(false)
  const rafIdRef = useRef<number>(0)
  // Warning guard: only show the >400KB toast once per run
  const hasWarnedLongOutputRef = useRef(false)

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

  const filteredHistory = useMemo(() => {
    if (!historyFilter.trim()) return history
    const q = historyFilter.toLowerCase()
    return history.filter(h =>
      h.agentName.toLowerCase().includes(q) ||
      h.prompt.toLowerCase().includes(q)
    )
  }, [history, historyFilter])

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

  // ─── Auto-scroll output ──────────────────────────────────────────────

  useEffect(() => {
    if (running && outputRef.current) {
      outputRef.current.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [output, running])

  // ─── Scroll detection ────────────────────────────────────────────────

  useEffect(() => {
    const el = outputRef.current
    if (!el) return
    const handleScroll = () => {
      setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 100)
    }
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [output])

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

  const runTest = useCallback(async (overridePrompt?: string, overrideAgent?: string) => {
    const testPrompt = (overridePrompt ?? prompt).trim()
    if (!testPrompt) { toast('error', 'Enter a test prompt'); return }

    // C12: first run of the session must be confirmed (spawns the real Claude
    // API and costs tokens). Subsequent runs skip the prompt.
    if (!runConfirmedRef.current) {
      setPendingRun({ prompt: overridePrompt, agent: overrideAgent })
      return
    }

    const agentToUse = overrideAgent ?? selectedAgent
    const resolvedAgent = allAgents.find(a => a.filename === agentToUse || a.name === agentToUse)
    setRunning(true)
    setOutput('')
    outputAccRef.current = ''
    flushPendingRef.current = false
    hasWarnedLongOutputRef.current = false
    setActivityLog([])
    setElapsedMs(0)
    setActiveHistoryId(null)
    setShowRating(false)
    startTimeRef.current = Date.now()
    abortRef.current = new AbortController()

    // Client-side idle watchdog. Server sends heartbeat comments every ~15s so the
    // 90s idle timer only fires if the stream is truly dead (server crash, network
    // drop, proxy buffering). The read loop below calls resetIdleTimer() each time
    // reader.read() returns bytes, including heartbeats.
    const CLIENT_IDLE_MS = 90_000
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

    try {
      const body: Record<string, unknown> = {
        agentName: agentToUse || undefined,
        prompt: testPrompt,
        timeoutMs: settings.timeoutMs,
      }
      if (settings.customInstructions.trim()) {
        body.customInstructions = settings.customInstructions.trim()
      }

      const response = await fetch('/api/playground/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      })

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
      let fullOutput = ''
      let hadError = false

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
            fullOutput = event.output || fullOutput
            setOutput(fullOutput)
          } else if (event.type === 'error') {
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

      const duration = Date.now() - startTimeRef.current
      const agentDisplay = resolvedAgent?.name || agentToUse || 'No Agent'
      // Ensure final output state is synced (flush any pending rAF)
      setOutput(outputAccRef.current)
      const newItem: TestResult = {
        id: genId(),
        agent: agentToUse || '',
        agentName: agentDisplay,
        prompt: testPrompt,
        output: fullOutput,
        duration,
        status: hadError ? 'error' : 'success',
        timestamp: new Date(),
      }
      persistResult(newItem)

    } catch (err: unknown) {
      const duration = Date.now() - startTimeRef.current
      const abortReason = abortRef.current?.signal.reason as { name?: string } | undefined
      const isIdleTimeout = err instanceof Error && err.name === 'AbortError'
        && (abortReason?.name === 'TimeoutError' || (err as Error & { cause?: { name?: string } }).cause?.name === 'TimeoutError')

      const agentDisplay = resolvedAgent?.name || agentToUse || 'No Agent'
      if (isIdleTimeout) {
        const msg = `No response from server for ${Math.round(CLIENT_IDLE_MS / 1000)}s — stream aborted. The agent may have crashed or the server is unreachable.`
        setOutput(prev => prev ? `${prev}\n\n---\nError: ${msg}` : `Error: ${msg}`)
        persistResult({
          id: genId(),
          agent: agentToUse || '',
          agentName: agentDisplay,
          prompt: testPrompt,
          output: `Error: ${msg}`,
          duration,
          status: 'error',
          timestamp: new Date(),
        })
      } else if (err instanceof Error && err.name === 'AbortError') {
        setOutput(prev => prev ? prev + '\n\n---\n*Test cancelled by user*' : 'Test cancelled.')
      } else {
        const errMsg = err instanceof Error ? err.message : String(err)
        setOutput(`Error: ${errMsg}`)
        persistResult({
          id: genId(),
          agent: agentToUse || '',
          agentName: agentDisplay,
          prompt: testPrompt,
          output: `Error: ${errMsg}`,
          duration,
          status: 'error',
          timestamp: new Date(),
        })
      }
    } finally {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      setRunning(false)
      abortRef.current = null
    }
  }, [prompt, selectedAgent, settings, allAgents, persistResult])

  const cancelRun = () => { abortRef.current?.abort() }

  // ─── Actions ──────────────────────────────────────────────────────────

  const copyOutput = () => {
    navigator.clipboard.writeText(output)
    toast('success', 'Copied to clipboard')
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

  const loadFromHistory = (item: TestResult) => {
    setSelectedAgent(item.agent)
    setPrompt(item.prompt)
    setOutput(item.output)
    setActiveHistoryId(item.id)
    setShowRating(false)
  }

  const rerunFromHistory = (item: TestResult) => {
    setSelectedAgent(item.agent)
    setPrompt(item.prompt)
    runTest(item.prompt, item.agent)
  }

  const removeHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setHistory(prev => prev.filter(h => h.id !== id))
    deletePlaygroundHistoryItem(id).catch(err => apiError('Playground history', err))
    if (activeHistoryId === id) setActiveHistoryId(null)
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem(STORAGE_KEY)
    clearPlaygroundHistoryApi().catch(err => apiError('Playground history', err))
    setActiveHistoryId(null)
  }

  const clearAll = () => {
    setOutput('')
    setPrompt('')
    setSelectedAgent('')
    setActivityLog([])
    setShowRating(false)
    setActiveHistoryId(null)
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
    setActiveHistoryId(null)
  }

  const removeTemplate = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────

  const handlePromptKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      runTest()
    }
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
      <div className="fixed inset-0 z-50 bg-bg flex flex-col">
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
              <div className="text-sm leading-relaxed"><MarkdownRenderer content={output} /></div>
            ) : (
              <pre className="text-sm text-text whitespace-pre-wrap leading-relaxed font-mono break-words">{output}</pre>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <ConfirmDialog
        open={!!pendingRun}
        title="Run this agent?"
        message={`This spawns the real Claude API${selectedAgent ? ` as "${selectedAgent}"` : ''} and costs tokens. Shown once per session.`}
        confirmLabel="Run"
        onClose={() => setPendingRun(null)}
        onConfirm={() => {
          runConfirmedRef.current = true
          const p = pendingRun
          setPendingRun(null)
          runTest(p?.prompt, p?.agent)
        }}
      />
      {/* Header */}
      <div className="px-6 py-3 border-b border-border bg-surface shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              Agent Playground
            </h1>
            <p className="text-[11px] text-text-muted mt-0.5">
              Test any agent with a prompt. Real-time streaming output.
              {history.length > 0 && (
                <span className="ml-2 text-text-secondary">
                  {successCount} passed · {errorCount} failed · avg {formatDuration(avgDuration)}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
              className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-text hover:bg-surface-2'}`}
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              onClick={clearAll}
              title="Clear editor"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-surface-2 transition-colors text-text-muted hover:text-text"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left: Input + History — 35% */}
        <div className="w-[35%] min-w-[320px] max-w-[500px] flex flex-col border-r border-border min-w-0">
          {/* Agent Picker */}
          <div className="px-5 py-3 border-b border-border shrink-0">
            <label className="text-[11px] font-medium text-text-muted block mb-1.5">Agent</label>
            <div className="relative" ref={agentPickerRef}>
              <button
                onClick={() => { setShowAgentPicker(!showAgentPicker); setAgentFilter(''); setFocusedAgentIdx(-1) }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-sm text-text hover:border-accent/40 transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {agents === null ? (
                    <>
                      <span className="w-5 h-5 rounded-full bg-surface-3 animate-pulse shrink-0" />
                      <span className="w-24 h-3 rounded bg-surface-3 animate-pulse" />
                    </>
                  ) : currentAgent ? (
                    <>
                      <AgentIcon name={currentAgent.name} uid={`pg-${currentAgent.name}`} size={20} global={currentAgent.scope === 'global'} />
                      <span className="font-medium truncate">{currentAgent.name}</span>
                      <span className="text-[10px] text-text-muted shrink-0">({currentAgent.model})</span>
                    </>
                  ) : (
                    <>
                      <Terminal className="w-4 h-4 text-text-muted shrink-0" />
                      <span className="text-text-muted">No agent (raw prompt)</span>
                    </>
                  )}
                </span>
                <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${showAgentPicker ? 'rotate-180' : ''}`} />
              </button>

              {showAgentPicker && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-2xl z-20 max-h-[350px] flex flex-col overflow-hidden">
                  <div className="p-2 border-b border-border shrink-0">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                      <input
                        value={agentFilter}
                        onChange={e => { setAgentFilter(e.target.value); setFocusedAgentIdx(-1) }}
                        onKeyDown={handleAgentPickerKeyDown}
                        placeholder="Search agents..."
                        className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {/* No Agent option */}
                    <button
                      onClick={() => { setSelectedAgent(''); setShowAgentPicker(false); setAgentFilter(''); setActiveHistoryId(null) }}
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
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted px-3 pt-2 pb-1">
                          Global ({filteredGlobal.length})
                        </p>
                        {filteredGlobal.map((agent, gi) => {
                          const listIdx = 1 + gi
                          return (
                            <button
                              key={`g-${agent.filename}`}
                              onClick={() => { setSelectedAgent(agent.filename || agent.name); setShowAgentPicker(false); setAgentFilter(''); setActiveHistoryId(null) }}
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
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted px-3 pt-2 pb-1">
                          Project ({filteredProject.length})
                        </p>
                        {filteredProject.map((agent, pi) => {
                          const listIdx = 1 + filteredGlobal.length + pi
                          return (
                            <button
                              key={`p-${agent.filename}-${agent.projectName}`}
                              onClick={() => { setSelectedAgent(agent.filename || agent.name); setShowAgentPicker(false); setAgentFilter(''); setActiveHistoryId(null) }}
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

            {/* Agent description */}
            {currentAgent?.description && (
              <p className="text-[11px] text-text-muted mt-1.5 px-0.5 line-clamp-2">{currentAgent.description}</p>
            )}
          </div>

          {/* Prompt Input */}
          <div className="flex flex-col px-5 py-3 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium text-text-muted">Test Prompt</label>
              <div className="relative" ref={templateRef}>
                <div className="flex items-center gap-1">
                  {prompt.trim() && (
                    <button
                      onClick={() => setShowSaveTemplate(true)}
                      className="text-[10px] text-text-muted hover:text-accent transition-colors flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-surface-2"
                      title="Save as template"
                    >
                      <Save className="w-3 h-3" />
                    </button>
                  )}
                  {templates.length > 0 && (
                    <button
                      onClick={() => setShowTemplates(!showTemplates)}
                      className="text-[10px] text-text-muted hover:text-accent transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface-2"
                      title="Load template"
                    >
                      <Bookmark className="w-3 h-3" />
                      Templates ({templates.length})
                    </button>
                  )}
                </div>

                {/* Save template form */}
                {showSaveTemplate && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded-xl shadow-2xl z-20 p-3 space-y-2">
                    <p className="text-[11px] font-medium text-text">Save as template</p>
                    <input
                      value={templateName}
                      onChange={e => setTemplateName(e.target.value)}
                      placeholder="Template name..."
                      className="w-full bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent/50"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') saveTemplate(); if (e.key === 'Escape') setShowSaveTemplate(false) }}
                    />
                    <div className="flex gap-1.5">
                      <button onClick={saveTemplate} disabled={!templateName.trim()} className="px-2.5 py-1 text-[10px] font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-colors">Save</button>
                      <button onClick={() => setShowSaveTemplate(false)} className="px-2.5 py-1 text-[10px] text-text-muted hover:text-text rounded-lg hover:bg-surface-2 transition-colors">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Templates dropdown */}
                {showTemplates && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-surface border border-border rounded-xl shadow-2xl z-20 max-h-[250px] overflow-y-auto">
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
            <textarea
              value={prompt}
              onChange={e => { setPrompt(e.target.value); setActiveHistoryId(null) }}
              placeholder={currentAgent
                ? `Test "${currentAgent.name}" with a prompt...\n\ne.g. Write a Shopify App Store listing for Pinzo`
                : 'Enter a raw prompt to test without any agent...'
              }
              className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text resize-y focus:outline-none focus:border-accent/50 transition-colors placeholder:text-text-muted font-mono min-h-[100px] max-h-[200px]"
              onKeyDown={handlePromptKeyDown}
            />
            <div className="flex items-center justify-between mt-2.5">
              <p className="text-[10px] text-text-muted">
                {prompt.length > 0 && <span className="text-text-secondary">{prompt.length} chars</span>}
                {prompt.length > 0 && ' · '}
                <kbd className="px-1 py-0.5 rounded bg-surface-2 border border-border text-[9px] font-mono">⌘Enter</kbd> to run
                {settings.customInstructions && (
                  <span className="ml-2 text-amber">· custom instructions active</span>
                )}
              </p>
              <div className="flex gap-2">
                {running ? (
                  <button
                    onClick={cancelRun}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red/90 text-white rounded-xl text-xs font-medium hover:bg-red transition-colors"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    Stop ({formatDuration(elapsedMs)})
                  </button>
                ) : (
                  <button
                    onClick={() => runTest()}
                    disabled={!prompt.trim()}
                    className="flex items-center gap-2 px-5 py-2 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Play className="w-4 h-4" /> Run Test
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* History — gets remaining space */}
          <div className="border-t border-border flex-1 flex flex-col min-h-[200px]">
            <div className="px-5 py-2 flex items-center justify-between shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                History ({history.length})
              </p>
              <div className="flex items-center gap-1.5">
                {history.length > 3 && (
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
                    <input
                      value={historyFilter}
                      onChange={e => setHistoryFilter(e.target.value)}
                      placeholder="Filter..."
                      className="w-28 bg-surface-2 border border-border rounded-md pl-6 pr-2 py-1 text-[10px] focus:outline-none focus:border-accent/50"
                    />
                  </div>
                )}
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-[10px] text-text-muted hover:text-red transition-colors px-1"
                    title="Clear all history"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-2">
              {filteredHistory.length === 0 ? (
                <p className="text-[11px] text-text-muted text-center py-3">
                  {history.length === 0 ? 'No tests run yet.' : 'No matches.'}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {filteredHistory.map(item => (
                    <div
                      key={item.id}
                      onClick={() => loadFromHistory(item)}
                      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer ${
                        activeHistoryId === item.id ? 'bg-accent-muted/40 border-l-2 border-l-accent' : ''
                      }`}
                    >
                      {item.status === 'success'
                        ? <CheckCircle className="w-3.5 h-3.5 text-green shrink-0" />
                        : <AlertCircle className="w-3.5 h-3.5 text-red shrink-0" />
                      }
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[11px] font-medium truncate">{item.agentName}</p>
                          <span className="text-[9px] text-text-muted">{formatTime(item.timestamp)}</span>
                        </div>
                        <p className="text-[10px] text-text-muted truncate">{item.prompt}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-text-muted">{formatDuration(item.duration)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); exportItem(item) }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent transition-all"
                          title="Export this test"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); rerunFromHistory(item) }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent transition-all"
                          title="Re-run this test"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => removeHistoryItem(e, item.id)}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-red transition-all"
                          title="Remove from history"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Output — 65% */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Progress bar while running */}
          {running && (
            <div className="absolute top-0 left-0 right-0 h-0.5 z-10">
              <div className="h-full bg-gradient-to-r from-accent via-purple to-accent animate-pulse rounded-full" />
            </div>
          )}

          {/* Output header */}
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-border shrink-0">
            <p className="text-xs font-medium text-text-muted flex items-center gap-1.5">
              {running ? (
                <>
                  <Loader className="w-3.5 h-3.5 animate-spin text-purple" />
                  <span>
                    {output ? 'Streaming' : 'Thinking'}... <span className="text-text-secondary font-mono">{formatDuration(elapsedMs)}</span>
                    {!output && activityLog.length > 0 && (
                      <span className="text-text-muted ml-1">({activityLog.length} activities)</span>
                    )}
                  </span>
                </>
              ) : output ? (
                <>
                  {output.startsWith('Error:') ? (
                    <><AlertCircle className="w-3.5 h-3.5 text-red" /> Error</>
                  ) : (
                    <><CheckCircle className="w-3.5 h-3.5 text-green" /> Output</>
                  )}
                  {history[0] && (
                    <span className="text-text-muted font-mono ml-1">({formatDuration(history[0].duration)})</span>
                  )}
                </>
              ) : (
                <><Terminal className="w-3.5 h-3.5" /> Output</>
              )}
            </p>
            <div className="flex items-center gap-1">
              {output && !running && (
                <>
                  <button
                    onClick={() => runTest()}
                    disabled={!prompt.trim()}
                    className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text px-2 py-1 rounded-lg hover:bg-surface-2 transition-colors"
                    title="Re-run test"
                  >
                    <RotateCcw className="w-3 h-3" /> Re-run
                  </button>
                  <button
                    onClick={copyOutput}
                    className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text px-2 py-1 rounded-lg hover:bg-surface-2 transition-colors"
                    title="Copy output"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                  <button
                    onClick={() => exportItem()}
                    className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text px-2 py-1 rounded-lg hover:bg-surface-2 transition-colors"
                    title="Export as Markdown"
                  >
                    <Download className="w-3 h-3" /> Export
                  </button>
                  <button
                    onClick={() => setFullscreenOutput(true)}
                    className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text px-2 py-1 rounded-lg hover:bg-surface-2 transition-colors"
                    title="Fullscreen"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setSettings(s => ({ ...s, outputMode: s.outputMode === 'markdown' ? 'raw' : 'markdown' }))}
                    className="text-[11px] text-text-muted hover:text-text px-2 py-1 rounded-lg hover:bg-surface-2 transition-colors"
                    title="Toggle output format"
                  >
                    {settings.outputMode === 'markdown' ? 'Raw' : 'Rendered'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Output content */}
          <div ref={outputRef} className="flex-1 overflow-y-auto p-5">
            {output ? (
              settings.outputMode === 'markdown' ? (
                <div className="text-sm leading-relaxed">
                  <MarkdownRenderer content={output} />
                  {running && (
                    <span className="inline-block w-0.5 h-4 bg-purple animate-pulse ml-0.5 align-middle rounded-full" />
                  )}
                </div>
              ) : (
                <pre className="text-sm text-text whitespace-pre-wrap leading-relaxed font-mono break-words">
                  {output}
                  {running && (
                    <span className="inline-block w-0.5 h-4 bg-purple animate-pulse ml-0.5 align-middle rounded-full" />
                  )}
                </pre>
              )
            ) : running ? (
              <div className="h-full flex flex-col">
                {/* Activity header */}
                <div className="flex items-center gap-2 mb-4">
                  <Loader className="w-4 h-4 animate-spin text-purple shrink-0" />
                  <p className="text-sm font-medium text-text-secondary">
                    Agent is thinking... <span className="font-mono text-text-muted text-xs">{formatDuration(elapsedMs)}</span>
                  </p>
                </div>

                {/* Activity log */}
                {activityLog.length > 0 ? (
                  <div className="flex-1 overflow-y-auto space-y-1 font-mono">
                    {activityLog.map((entry, i) => (
                      <div
                        key={`activity-${i}-${entry.time}`}
                        className={`text-[11px] leading-relaxed px-3 py-1.5 rounded-lg ${
                          i === activityLog.length - 1
                            ? 'bg-purple-muted/30 text-purple border border-purple/20'
                            : 'text-text-muted'
                        }`}
                      >
                        <span className="text-text-muted/50 mr-2 select-none text-[10px]">+{(entry.time / 1000).toFixed(1)}s</span>
                        {entry.message}
                      </div>
                    ))}
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-muted">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple animate-pulse" />
                      Waiting for next activity...
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <div className="w-14 h-14 rounded-2xl bg-purple-muted flex items-center justify-center mb-3 animate-pulse">
                      <Sparkles className="w-6 h-6 text-purple" />
                    </div>
                    <p className="text-xs text-text-muted max-w-[280px]">
                      Initializing agent process... Activity will appear here as the agent works.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-purple-muted flex items-center justify-center mb-3">
                  <Play className="w-6 h-6 text-purple" />
                </div>
                <p className="text-sm font-medium text-text-secondary mb-1">No output yet</p>
                <p className="text-xs text-text-muted max-w-[280px]">
                  Select an agent, write a test prompt, and click Run Test to see real-time streaming output.
                </p>
              </div>
            )}
          </div>

          {/* Rating UI — shown for ALL outputs, not just agent-selected */}
          {output && !running && (
            <div className="border-t border-border bg-surface px-5 py-3">
              {!showRating ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted">Rate this output:</span>
                  <button
                    onClick={async () => {
                      try {
                        await addTraining(selectedAgent || 'playground', '', 'Output is correct — positive example')
                        toast('success', 'Positive signal saved')
                      } catch {
                        toast('success', 'Positive signal noted')
                      }
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-text-secondary hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
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
                <div className="space-y-2">
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
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent/50"
                    autoFocus
                  />
                  <input
                    value={ratingCorrection}
                    onChange={e => setRatingCorrection(e.target.value)}
                    placeholder="What should it do instead?"
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent/50"
                  />
                  <button
                    onClick={async () => {
                      if (!ratingIssue.trim() || !ratingCorrection.trim()) return
                      setRatingSubmitting(true)
                      try {
                        const agentKey = selectedAgent || 'playground'
                        await addTraining(agentKey, ratingIssue.trim(), ratingCorrection.trim())
                        toast('success', 'Correction saved — will be applied on next run')
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
                    className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-colors"
                  >
                    {ratingSubmitting ? 'Saving...' : 'Save Correction'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Scroll to bottom — offset when rating visible */}
          {showScrollBottom && output && (
            <div className={`absolute ${output && !running ? 'bottom-20' : 'bottom-4'} right-4`}>
              <button
                onClick={() => outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' })}
                className="p-2 rounded-full bg-surface border border-border shadow-lg hover:bg-surface-2 transition-all text-text-muted hover:text-text"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Settings slide-out panel */}
        <div
          className={`absolute right-0 top-0 h-full w-[320px] bg-surface border-l border-border shadow-2xl z-30 transform transition-transform duration-200 ${
            showSettings ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="p-5 space-y-4 h-full overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-accent" />
                Settings
              </p>
              <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-text-muted block mb-1.5">Timeout</label>
                <select
                  value={settings.timeoutMs}
                  onChange={e => setSettings(s => ({ ...s, timeoutMs: Number(e.target.value) }))}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-accent/50"
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
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-accent/50"
                >
                  <option value="markdown">Markdown (rendered)</option>
                  <option value="raw">Raw text</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-muted block mb-1.5">
                  Custom instructions override
                  <span className="font-normal text-text-muted/70 ml-1">(replaces agent system prompt)</span>
                </label>
                <textarea
                  value={settings.customInstructions}
                  onChange={e => setSettings(s => ({ ...s, customInstructions: e.target.value }))}
                  placeholder="Leave empty to use agent's default instructions..."
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-xs font-mono resize-none focus:outline-none focus:border-accent/50 h-32"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
