import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  X, Send, Sparkles, Copy, Check, RefreshCw,
  History, Plus, Trash2, FileCode, CheckCircle, Bot, Download, Paperclip,
  ArrowDown, Pencil, Search, MessageSquare, Square,
} from 'lucide-react'
import type { AiMessage, AiSession, AppContext } from '../lib/api'
import {
  streamAiChat, getAiHistory, getAiSession,
  saveAiSession, deleteAiSession, getAiContext, applyAiFile, apiError,
  getActiveAiRun, cancelAiRun } from '../lib/api'
import { toast } from './Toast'
import { confirmDialog } from '../lib/confirm'
import { writeToClipboard } from '../lib/clipboard'
import { MarkdownRenderer } from './MarkdownRenderer'
import AgentMentionPicker from './AgentMentionPicker'

interface Props {
  open: boolean
  onClose: () => void
}

interface FileSuggestion {
  path: string
  content: string
  applied?: boolean
}

// Tracks the in-flight AI chat run across a page refresh so we can re-attach to
// a background generation on reload. Stored as { runId, sessionId }. Mirrors the
// playground's ACTIVE_RUN_KEY pattern.
const AI_ACTIVE_RUN_KEY = 'polyglot.ai.activeRun'

// Stable run id with random suffix — avoids collisions on same-ms sends, and is
// the key the backend registry uses to find this generation on reattach.
const genRunId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildContextPrompt(ctx: AppContext): string {
  let out = `## App Overview\n`
  out += `\n**Global CLAUDE.md:** ${ctx.globalClaudeMd.path}\n`
  out += `**Global agents directory:** ${ctx.globalAgentsDir}\n`
  if (ctx.globalAgents.length > 0) {
    out += `\n**Global Agents:**\n`
    for (const a of ctx.globalAgents) {
      out += `- ${a.name}: ${a.description || 'no description'} → ${a.path}\n`
    }
  }
  if (ctx.projects.length > 0) {
    out += `\n**Projects:**\n`
    for (const p of ctx.projects) {
      out += `\n### ${p.name}\n`
      out += `- Path: ${p.path}\n`
      out += `- Agents dir: ${p.agentsDir}\n`
      out += `- Commands dir: ${p.commandsDir}\n`
      out += `- Rules dir: ${p.rulesDir}\n`
      if (p.agents.length > 0) out += `- Agents: ${p.agents.map(a => a.name).join(', ')}\n`
      if (p.commands.length > 0) out += `- Commands: ${p.commands.map(c => c.name).join(', ')}\n`
      if (p.rules.length > 0) out += `- Rules: ${p.rules.map(r => r.name).join(', ')}\n`
    }
  }
  return out
}

function buildSystemPrompt(contextPrompt: string): string {
  return `You are an expert AI assistant with full access to the user's Polyglot — a management dashboard for Claude Code agents, commands, rules, and CLAUDE.md files.

Your role: help the user create, improve, and manage all their Claude Code configurations.

CRITICAL — When writing any file, use the EXACT absolute paths from the context below:
- To create a global agent: use path like {globalAgentsDir}/agent-name.md
- To create a project agent: use path like {project.agentsDir}/agent-name.md
- To create a project command: use path like {project.commandsDir}/command-name.md
- To create a project rule: use path like {project.rulesDir}/rule-name.md
- File names must be lowercase, hyphen-separated (e.g. code-review.md)

Always output files using this exact format:
<file path="/the/exact/absolute/path/to/file.md">
file content here
</file>

For agents, always include frontmatter:
---
name: Agent Display Name
description: One line description
model: sonnet
---

Be practical and direct. Show complete files, never diffs.

${contextPrompt}`
}

function parseFileSuggestions(content: string): FileSuggestion[] {
  const results: FileSuggestion[] = []
  const regex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g
  let match
  while ((match = regex.exec(content)) !== null) {
    const path = match[1].trim()
    const body = match[2].trim()
    // Drop malformed suggestions (empty path or empty body) instead of silently
    // surfacing a broken file card — warn so the dropped suggestion is traceable.
    if (!path || !body) {
      console.warn('[ai-assistant] dropped malformed <file> suggestion', { path, hasBody: !!body })
      continue
    }
    results.push({ path, content: body })
  }
  return results
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString()
}

function formatTimestamp(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface SaveAgentState {
  content: string
  suggestedName: string
  key: string
}

// ─── Starter Prompts ────────────────────────────────────────────────────────

const STARTER_CATEGORIES = [
  {
    icon: '🤖',
    label: 'Agents',
    prompts: [
      'Show me all my agents and what they do',
      'Create a new global agent for code review',
    ],
  },
  {
    icon: '⚡',
    label: 'Commands',
    prompts: [
      'Write a /test command that runs tests intelligently',
      'What commands should every project have?',
    ],
  },
  {
    icon: '📋',
    label: 'Rules & Config',
    prompts: [
      'What rules should I add for a TypeScript project?',
      'Improve my global CLAUDE.md with better structure',
    ],
  },
]

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AiAssistant({ open, onClose }: Props) {
  // Core state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [messageTimestamps, setMessageTimestamps] = useState<Record<number, Date>>({})
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState('')
  // Progress signals for the loading indicator — user was seeing 3 minutes of
  // silent dots while Claude's first-token latency ticked away. Now the
  // indicator shows elapsed time + a phase label that flips the moment chunks
  // start arriving, and holds a Stop button inline (used to be buried in the
  // input row).
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)
  const [lastChunkAt, setLastChunkAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState<number>(() => Date.now())
  const streamAbortRef = useRef<AbortController | null>(null)
  // The in-flight run's id. Drives Stop→server-cancel and lets us re-attach to a
  // background generation after a page refresh.
  const activeRunIdRef = useRef<string | null>(null)
  // True once the page is unloading (refresh/navigate/close). On unload the
  // in-flight fetch rejects with a GENERIC network error (not an AbortError), so
  // we must NOT treat that as a real terminal — otherwise we'd wipe the reattach
  // marker and the reloaded page couldn't reconnect to the still-running gen.
  const unloadingRef = useRef(false)

  // 1Hz tick so the elapsed timer on the loading indicator updates without
  // hammering the whole tree. Only ticks while loading.
  useEffect(() => {
    if (!loading) return
    setNowTick(Date.now())
    const id = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [loading])

  // UI state
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<AiSession[]>([])
  const [historySearch, setHistorySearch] = useState('')
  const [contextPrompt, setContextPrompt] = useState('')
  const [appCtx, setAppCtx] = useState<AppContext | null>(null)
  const [appliedFiles, setAppliedFiles] = useState<Record<string, boolean>>({})
  const [applyingFile, setApplyingFile] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')

  // Save agent modal
  const [saveAgentModal, setSaveAgentModal] = useState<SaveAgentState | null>(null)
  const [saveAgentScope, setSaveAgentScope] = useState<string>('global')
  const [saveAgentName, setSaveAgentName] = useState('')
  const [savingAgent, setSavingAgent] = useState(false)

  // File attachment
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollInstantRef = useRef(false)

  // ─── Filtered history ───────────────────────────────────────────────────

  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return history
    const q = historySearch.toLowerCase()
    return history.filter(s => s.title.toLowerCase().includes(q))
  }, [history, historySearch])

  // ─── Load data ──────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    try {
      const data = await getAiHistory()
      setHistory(data)
    } catch (err) { apiError('AI assistant', err) }
  }, [])

  const loadContext = useCallback(async () => {
    if (contextPrompt) return
    try {
      const ctx = await getAiContext()
      setAppCtx(ctx)
      setContextPrompt(buildContextPrompt(ctx))
    } catch (err) { apiError('AI assistant', err) }
  }, [contextPrompt])

  // ─── Persist to localStorage (always — even without sessionId) ──────────

  useEffect(() => {
    if (messages.length > 0) {
      if (sessionId) localStorage.setItem('polyglot:active-session', sessionId)
      localStorage.setItem('polyglot:active-messages', JSON.stringify(messages))
    }
  }, [messages, sessionId])

  // ─── Save on page unload (captures mid-stream state) ──────────────────

  const messagesRef = useRef(messages)
  const streamingTextRef = useRef(streamingText)
  const sessionIdRef = useRef(sessionId)
  messagesRef.current = messages
  streamingTextRef.current = streamingText
  sessionIdRef.current = sessionId

  // Mark the page as unloading so an in-flight run's network-error-on-unload
  // isn't mistaken for a real terminal (which would wipe the reattach marker and
  // stop the reloaded page reconnecting to the still-running generation).
  useEffect(() => {
    const onHide = () => { unloadingRef.current = true }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('beforeunload', onHide)
    return () => { window.removeEventListener('pagehide', onHide); window.removeEventListener('beforeunload', onHide) }
  }, [])

  useEffect(() => {
    const handleBeforeUnload = () => {
      const msgs = messagesRef.current
      const streaming = streamingTextRef.current
      const sid = sessionIdRef.current

      if (msgs.length === 0) return

      // If streaming, append partial response as assistant message
      let toSave = msgs
      if (streaming) {
        toSave = [...msgs, { role: 'assistant' as const, content: streaming + '\n\n*(response interrupted)*' }]
      }

      localStorage.setItem('polyglot:active-messages', JSON.stringify(toSave))
      if (sid) localStorage.setItem('polyglot:active-session', sid)

      // Fire-and-forget server save via sendBeacon
      const title = toSave[0].content.slice(0, 60) + (toSave[0].content.length > 60 ? '…' : '')
      const body = JSON.stringify({ id: sid || undefined, title, messages: toSave })
      navigator.sendBeacon('/api/ai/history', new Blob([body], { type: 'application/json' }))
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // ─── Restore on open ───────────────────────────────────────────────────

  const hasOpenedRef = useRef(false)
  const restoredRef = useRef(false)
  useEffect(() => {
    if (!open) return

    // First open — restore session from localStorage synchronously (no re-render lag)
    if (!restoredRef.current && messages.length === 0) {
      restoredRef.current = true
      const savedId = localStorage.getItem('polyglot:active-session')
      const savedMsgs = localStorage.getItem('polyglot:active-messages')

      if (savedMsgs) {
        try {
          const parsed = JSON.parse(savedMsgs) as AiMessage[]
          if (parsed.length > 0) {
            scrollInstantRef.current = true
            if (savedId) setSessionId(savedId)
            setMessages(parsed)
            if (savedId) getAiSession(savedId).catch(err => apiError('AI assistant', err))
          }
        } catch (err) { apiError('AI assistant', err) }
      } else if (savedId) {
        getAiSession(savedId)
          .then(session => {
            scrollInstantRef.current = true
            setSessionId(session.id)
            setMessages(session.messages)
            localStorage.setItem('polyglot:active-messages', JSON.stringify(session.messages))
          })
          .catch(() => localStorage.removeItem('polyglot:active-session'))
      }
    }

    // Defer heavy data loading until after the transition completes (200ms)
    if (!hasOpenedRef.current) {
      hasOpenedRef.current = true
      setTimeout(() => {
        loadHistory()
        loadContext()
      }, 220)
    } else {
      // Subsequent opens — refresh history in background
      loadHistory()
    }

    // Focus input after transition
    setTimeout(() => {
      if (messages.length > 0) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
      }
      inputRef.current?.focus()
    }, 210)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ─── Auto-scroll ────────────────────────────────────────────────────────

  useEffect(() => {
    const behavior = scrollInstantRef.current ? 'instant' : 'smooth'
    scrollInstantRef.current = false
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [messages, streamingText])

  // ─── Scroll detection ──────────────────────────────────────────────────

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100)
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [open])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // ─── Focus restore on close (a11y) ──────────────────────────────────────
  // The open effect already moves focus into the panel; capture the trigger on
  // open and return focus to it when the panel closes so keyboard users aren't
  // dropped at the top of the page.
  const triggerFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) {
      triggerFocusRef.current = document.activeElement as HTMLElement | null
    } else if (triggerFocusRef.current) {
      triggerFocusRef.current.focus?.()
      triggerFocusRef.current = null
    }
  }, [open])

  // ─── Auto-resize textarea ──────────────────────────────────────────────

  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px'
  }, [input])

  // ─── Persist session ──────────────────────────────────────────────────

  const persistSession = useCallback(async (msgs: AiMessage[], currentId: string | null) => {
    if (msgs.length === 0) return currentId
    const title = msgs[0].content.slice(0, 60) + (msgs[0].content.length > 60 ? '…' : '')
    const result = await saveAiSession({ id: currentId || undefined, title, messages: msgs })
    loadHistory()
    return result.id
  }, [loadHistory])

  // ─── File upload ────────────────────────────────────────────────────────

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      setAttachedFile({ name: file.name, content })
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ─── Send message ─────────────────────────────────────────────────────

  const sendMessage = async (overrideMessages?: AiMessage[]) => {
    const text = input.trim()
    const msgsToSend = overrideMessages || messages

    if (!overrideMessages && !text && !attachedFile) return
    if (loading) return

    let newMessages: AiMessage[]
    if (overrideMessages) {
      newMessages = overrideMessages
    } else {
      const userContent = attachedFile
        ? `${text ? text + '\n\n' : ''}📎 **${attachedFile.name}**\n\`\`\`\n${attachedFile.content}\n\`\`\``
        : text
      newMessages = [...msgsToSend, { role: 'user' as const, content: userContent }]
    }

    setMessages(newMessages)
    setInput('')
    setAttachedFile(null)
    setLoading(true)
    setStreamingText('')
    setError('')
    setEditingIdx(null)
    setRunStartedAt(Date.now())
    setLastChunkAt(null)

    // Track timestamp for the new user message
    setMessageTimestamps(prev => ({ ...prev, [newMessages.length - 1]: new Date() }))

    // Persist immediately so refresh doesn't lose the user message
    localStorage.setItem('polyglot:active-messages', JSON.stringify(newMessages))
    let currentSessionId = sessionId
    try {
      const savedId = await persistSession(newMessages, currentSessionId)
      if (savedId && !currentSessionId) {
        currentSessionId = savedId
        setSessionId(savedId)
        localStorage.setItem('polyglot:active-session', savedId)
      }
    } catch (err) { apiError('AI assistant', err) }

    streamAbortRef.current = new AbortController()

    // Mint a run id and persist the reattach marker so a page refresh mid-stream
    // can reconnect to the still-running background generation. The marker is
    // cleared ONLY on a real terminal AND when we're not unloading (see finally).
    const runId = genRunId()
    activeRunIdRef.current = runId
    try { localStorage.setItem(AI_ACTIVE_RUN_KEY, JSON.stringify({ runId, sessionId: currentSessionId })) } catch { /* quota */ }
    // Did this run reach a terminal state HERE (a real done/error EVENT), vs. the
    // stream being aborted by a navigation/refresh (which leaves the run running
    // in the background)? Only a true terminal clears the reattach marker.
    let reachedTerminal = false

    try {
      const sys = buildSystemPrompt(contextPrompt)
      const content = await streamAiChat(
        newMessages,
        sys,
        (chunk) => { setStreamingText(prev => prev + chunk); setLastChunkAt(Date.now()) },
        streamAbortRef.current.signal,
        runId,
        currentSessionId,
      )
      reachedTerminal = true // streamAiChat resolves only on a real `done` event
      setStreamingText('')
      const finalMessages: AiMessage[] = [...newMessages, { role: 'assistant', content }]
      setMessages(finalMessages)
      setMessageTimestamps(prev => ({ ...prev, [finalMessages.length - 1]: new Date() }))
      await persistSession(finalMessages, currentSessionId)
    } catch (err) {
      setStreamingText('')
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled — persist what we have so far
        const partial = streamingTextRef.current
        if (partial) {
          const partialMessages: AiMessage[] = [...newMessages, { role: 'assistant', content: partial }]
          setMessages(partialMessages)
          await persistSession(partialMessages, currentSessionId).catch(err => apiError('AI assistant', err))
        }
      } else {
        // A network error during page unload is NOT a real terminal — the run
        // keeps generating server-side so the reloaded page can re-attach. Only
        // a genuine in-session failure (not unloading) is a terminal error.
        if (!unloadingRef.current) {
          reachedTerminal = true
          setError(err instanceof Error ? err.message : 'Failed to get response')
        }
      }
    } finally {
      setLoading(false)
      setRunStartedAt(null)
      setLastChunkAt(null)
      streamAbortRef.current = null
      // Clear the reattach marker ONLY on a REAL terminal AND when we're not
      // unloading. A refresh/navigate leaves it so the reloaded page reconnects.
      if (reachedTerminal && !unloadingRef.current) {
        activeRunIdRef.current = null
        try { localStorage.removeItem(AI_ACTIVE_RUN_KEY) } catch { /* ignore */ }
      }
    }
  }

  // Stop = explicit cancel: force-kill the server-side process, abort the local
  // stream, and drop the reattach marker (a refresh does NOT stop the run; only
  // this does).
  const cancelStream = () => {
    const runId = activeRunIdRef.current
    if (runId) cancelAiRun(runId).catch(() => { /* best-effort; stream ends anyway */ })
    activeRunIdRef.current = null
    try { localStorage.removeItem(AI_ACTIVE_RUN_KEY) } catch { /* ignore */ }
    streamAbortRef.current?.abort()
  }

  // Re-attach to a generation that was still running on the server (e.g. after a
  // page refresh). The session messages are already restored by the open effect;
  // here we stream the rest of the live answer into the in-flight assistant
  // bubble and commit it on done. The work never stopped — we reconnect a viewer.
  const reattachRun = useCallback(async (runId: string, sid: string | null) => {
    if (loading || streamAbortRef.current) return
    activeRunIdRef.current = runId
    setLoading(true)
    setStreamingText('')
    setError('')
    streamAbortRef.current = new AbortController()
    toast('success', 'Reconnected — your chat kept running')
    let reachedTerminal = false
    let acc = ''
    try {
      const resp = await fetch(`/api/ai/run/${encodeURIComponent(runId)}/stream`, { signal: streamAbortRef.current.signal })
      if (!resp.body) throw new Error('No reattach stream')
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const processLine = (line: string) => {
        const t = line.trim()
        if (!t.startsWith('data: ')) return
        try {
          const e = JSON.parse(t.slice(6))
          if (e.type === 'chunk') { acc += e.content; setStreamingText(acc) }
          else if (e.type === 'done') { reachedTerminal = true; if (typeof e.content === 'string' && e.content) acc = e.content }
          else if (e.type === 'error') {
            reachedTerminal = true
            // run_not_found = the run finished + was evicted; the persisted
            // session already holds the answer, so don't surface a scary error.
            if (e.code !== 'run_not_found') setError(e.error || 'Run failed')
          }
        } catch { /* ignore malformed */ }
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n')
        buffer = parts.pop() ?? ''
        for (const l of parts) processLine(l)
      }
      if (buffer.trim()) for (const l of buffer.split('\n')) processLine(l)
    } catch {
      /* aborted or network drop — the run keeps going server-side */
    } finally {
      setLoading(false)
      streamAbortRef.current = null
      setStreamingText('')
      // Commit the completed assistant turn into the conversation + persist it,
      // but only on a real terminal that produced text.
      if (reachedTerminal && acc) {
        const base = messagesRef.current
        const finalMessages: AiMessage[] = [...base, { role: 'assistant', content: acc }]
        setMessages(finalMessages)
        setMessageTimestamps(prev => ({ ...prev, [finalMessages.length - 1]: new Date() }))
        persistSession(finalMessages, sid).catch(err => apiError('AI assistant', err))
      }
      // Drop the marker only on a real terminal AND when not unloading. A 2nd
      // refresh mid-reattach leaves it so the next reload reconnects again.
      if (reachedTerminal && !unloadingRef.current) {
        activeRunIdRef.current = null
        try { localStorage.removeItem(AI_ACTIVE_RUN_KEY) } catch { /* ignore */ }
      }
    }
  }, [loading, persistSession])

  // ─── Reattach on open (survive refresh/navigation) ────────────────────
  // One-shot: when the panel first opens, check for a marker left by an
  // interrupted send. If the run is still generating server-side, reconnect a
  // viewer and keep streaming. THIS is the "survive refresh" payoff — the run
  // never stopped; the session messages are restored by the open effect above.
  const reattachCheckedRef = useRef(false)
  useEffect(() => {
    if (!open || reattachCheckedRef.current) return
    reattachCheckedRef.current = true
    let raw: string | null = null
    try { raw = localStorage.getItem(AI_ACTIVE_RUN_KEY) } catch { return }
    if (!raw) return
    let saved: { runId?: string; sessionId?: string | null } | null = null
    try { saved = JSON.parse(raw) } catch { try { localStorage.removeItem(AI_ACTIVE_RUN_KEY) } catch { /* */ }; return }
    if (!saved?.runId) { try { localStorage.removeItem(AI_ACTIVE_RUN_KEY) } catch { /* */ }; return }
    const { runId } = saved
    const sid = saved.sessionId ?? null
    // Defer slightly so the open effect's synchronous message restore lands first
    // (the reattach commits the assistant turn on top of those restored messages).
    const t = setTimeout(() => {
      if (sid) {
        // Verify the run is still active for this session before reconnecting.
        getActiveAiRun(sid).then(info => {
          if (info.active && info.runId === runId) {
            reattachRun(runId, sid)
          } else {
            // Finished while we were away — the result is in the persisted
            // session (already restored). Just drop the marker.
            try { localStorage.removeItem(AI_ACTIVE_RUN_KEY) } catch { /* */ }
          }
        }).catch(() => { try { localStorage.removeItem(AI_ACTIVE_RUN_KEY) } catch { /* */ } })
      } else {
        // Brand-new chat whose session id wasn't persisted before the refresh —
        // reattach by runId directly; the stream endpoint replies run_not_found
        // (handled gracefully) if it already finished + was evicted.
        reattachRun(runId, null)
      }
    }, 260)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reattachRun])

  // ─── Regenerate last response ─────────────────────────────────────────

  const regenerateLastResponse = () => {
    if (loading || messages.length < 2) return
    const lastUserIdx = messages.length - (messages[messages.length - 1].role === 'assistant' ? 2 : 1)
    if (lastUserIdx < 0) return
    const truncated = messages.slice(0, lastUserIdx + 1)
    sendMessage(truncated)
  }

  // ─── Edit user message ────────────────────────────────────────────────

  const startEditing = (idx: number) => {
    if (loading) return
    setEditingIdx(idx)
    setEditText(messages[idx].content)
  }

  const submitEdit = () => {
    if (editingIdx === null || !editText.trim()) return
    const newMessages = messages.slice(0, editingIdx)
    newMessages.push({ role: 'user', content: editText.trim() })
    setEditingIdx(null)
    setEditText('')
    sendMessage(newMessages)
  }

  const cancelEdit = () => {
    setEditingIdx(null)
    setEditText('')
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ─── Global keyboard shortcuts ────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'o') {
        e.preventDefault()
        newChat()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ─── Session management ───────────────────────────────────────────────

  const openSession = async (id: string) => {
    try {
      const session = await getAiSession(id)
      scrollInstantRef.current = true
      setSessionId(session.id)
      setMessages(session.messages)
      setShowHistory(false)
      setError('')
      setAppliedFiles({})
      setHistorySearch('')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to load session')
    }
  }

  const exportChat = () => {
    if (messages.length === 0) return
    const title = messages[0].content.slice(0, 60).replace(/[^a-z0-9 ]/gi, '').trim() || 'chat'
    const md = messages.map(m =>
      `## ${m.role === 'user' ? 'You' : 'Claude'}\n\n${m.content}`
    ).join('\n\n---\n\n')
    const blob = new Blob([`# ${title}\n\n${md}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const newChat = () => {
    setSessionId(null)
    setMessages([])
    setMessageTimestamps({})
    setInput('')
    setError('')
    setStreamingText('')
    setShowHistory(false)
    setAppliedFiles({})
    setHistorySearch('')
    setEditingIdx(null)
    localStorage.removeItem('polyglot:active-session')
    localStorage.removeItem('polyglot:active-messages')
    // Abandon any in-flight reattach intent — a fresh chat must not reconnect to
    // a previous run on the next reload.
    activeRunIdRef.current = null
    try { localStorage.removeItem(AI_ACTIVE_RUN_KEY) } catch { /* ignore */ }
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const removeSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const ok = await confirmDialog({
      title: 'Delete chat?',
      message: 'This conversation will be permanently deleted. This can’t be undone.',
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await deleteAiSession(id)
      loadHistory()
      if (sessionId === id) newChat()
      toast('success', 'Chat deleted')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete session')
    }
  }

  // ─── Save agent ───────────────────────────────────────────────────────

  const openSaveAgent = (suggestion: FileSuggestion, key: string) => {
    const nameMatch = suggestion.content.match(/^---[\s\S]*?^name:\s*(.+)$/m)
    const suggestedName = nameMatch
      ? nameMatch[1].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '')
      : suggestion.path.split('/').pop()?.replace('.md', '') || 'my-agent'
    setSaveAgentModal({ content: suggestion.content, suggestedName, key })
    setSaveAgentName(suggestedName)
    setSaveAgentScope('global')
  }

  const handleSaveAgent = async () => {
    if (!saveAgentModal || !saveAgentName.trim() || !appCtx) return
    const slug = saveAgentName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '')
    if (!slug) { toast('error', 'Invalid agent name'); return }

    let filePath: string
    if (saveAgentScope === 'global') {
      filePath = `${appCtx.globalAgentsDir}/${slug}.md`
    } else {
      const project = appCtx.projects.find(p => p.path === saveAgentScope)
      if (!project) { toast('error', 'Project not found'); return }
      filePath = `${project.agentsDir}/${slug}.md`
    }

    setSavingAgent(true)
    try {
      await applyAiFile(filePath, saveAgentModal.content)
      setAppliedFiles(prev => ({ ...prev, [saveAgentModal.key]: true }))
      toast('success', `Agent saved to ${saveAgentScope === 'global' ? 'Global' : appCtx.projects.find(p => p.path === saveAgentScope)?.name}`)
      window.dispatchEvent(new Event('polyglot:file-applied'))
      setSaveAgentModal(null)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save agent')
    } finally {
      setSavingAgent(false)
    }
  }

  // ─── Apply file ───────────────────────────────────────────────────────

  const handleApplyFile = async (suggestion: FileSuggestion, key: string) => {
    setApplyingFile(key)
    try {
      await applyAiFile(suggestion.path, suggestion.content)
      setAppliedFiles(prev => ({ ...prev, [key]: true }))
      toast('success', `Applied ${suggestion.path.split('/').pop()}`)
      window.dispatchEvent(new Event('polyglot:file-applied'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply file')
    } finally {
      setApplyingFile(null)
    }
  }

  // ─── Copy ─────────────────────────────────────────────────────────────

  const copyText = async (text: string, idx: number) => {
    if (!(await writeToClipboard(text))) return
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  // ─── Render assistant message ─────────────────────────────────────────

  const renderAssistantMessage = (msg: AiMessage, idx: number) => {
    const suggestions = parseFileSuggestions(msg.content)
    const displayContent = msg.content.replace(
      /<file path="[^"]+">[\s\S]*?<\/file>/g, ''
    ).trim()
    const ts = messageTimestamps[idx]
    const isLast = idx === messages.length - 1

    return (
      <div key={idx} className="group flex gap-3 justify-start chat-fade-in">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple to-accent flex items-center justify-center shrink-0 mt-0.5 shadow-soft">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>

        <div className="max-w-[88%] min-w-0 space-y-2">
          {/* Name + timestamp */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-text">Claude</span>
            {ts && <span className="text-[10px] text-text-muted">{formatTimestamp(ts)}</span>}
          </div>

          {/* Content */}
          {displayContent && (
            <div className="bg-surface-2 rounded-2xl rounded-tl-md px-4 py-3">
              <MarkdownRenderer content={displayContent} />
              {/* Action bar */}
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50 opacity-60 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => copyText(msg.content, idx)}
                  className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text transition-colors"
                  title="Copy message"
                >
                  {copiedIdx === idx ? <Check className="w-3.5 h-3.5 text-green" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedIdx === idx ? 'Copied' : 'Copy'}
                </button>
                {isLast && !loading && (
                  <button
                    onClick={regenerateLastResponse}
                    className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text transition-colors"
                    title="Regenerate response"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate
                  </button>
                )}
              </div>
            </div>
          )}

          {/* File suggestions */}
          {suggestions.map((s, si) => {
            const key = `${idx}-${si}`
            const applied = appliedFiles[key]
            const applying = applyingFile === key
            const fileName = s.path.split('/').pop()
            const isAgent = /^---[\s\S]*?^name:/m.test(s.content)
            const existingAgentPaths = appCtx
              ? [
                  ...appCtx.globalAgents.map(a => a.path),
                  ...appCtx.projects.flatMap(p => p.agents.map(a => a.path)),
                ]
              : []
            const agentExists = isAgent && existingAgentPaths.some(p =>
              p === s.path || p.endsWith('/' + fileName)
            )
            const showSaveAgent = isAgent && !agentExists && !applied
            const showApply = !isAgent || agentExists
            return (
              <div key={key} className="bg-surface border border-border rounded-xl overflow-hidden shadow-soft">
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-surface-2 border-b border-border">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="text-[11px] font-mono text-text-secondary truncate">{fileName}</span>
                    {isAgent && (
                      <span className="text-[10px] bg-purple-muted text-text px-1.5 py-0.5 rounded-full font-medium shrink-0">agent</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {showSaveAgent && (
                      <button
                        onClick={() => openSaveAgent(s, key)}
                        className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-medium bg-purple-muted text-purple hover:opacity-80 transition-all"
                      >
                        <Bot className="w-3 h-3" />
                        Save as Agent
                      </button>
                    )}
                    {(showApply || applied) && (
                      <button
                        onClick={() => handleApplyFile(s, key)}
                        disabled={applied || applying}
                        className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${
                          applied
                            ? 'bg-green-muted text-text cursor-default'
                            : 'bg-accent text-white hover:bg-accent-hover disabled:opacity-50'
                        }`}
                      >
                        {applying ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : applied ? (
                          <><CheckCircle className="w-3 h-3" /> Applied</>
                        ) : (
                          'Apply to file'
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <pre className="px-3.5 py-2.5 text-[11px] font-mono text-text-secondary overflow-x-auto max-h-40 whitespace-pre-wrap break-words leading-relaxed">
                  {s.content.slice(0, 800)}{s.content.length > 800 ? '\n…' : ''}
                </pre>
                <div className="px-3.5 pb-2">
                  <p className="text-[10px] font-mono text-text-muted truncate">{s.path}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── Render user message ──────────────────────────────────────────────

  const renderUserMessage = (msg: AiMessage, idx: number) => {
    const ts = messageTimestamps[idx]
    const isEditing = editingIdx === idx

    if (isEditing) {
      return (
        <div key={idx} className="flex justify-end chat-fade-in">
          <div className="max-w-[85%] w-full space-y-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full bg-surface-2 border border-accent/50 rounded-xl px-3.5 py-2.5 text-sm text-text resize-none focus:outline-none focus:ring-2 focus:ring-accent/30"
              rows={Math.min(editText.split('\n').length + 1, 8)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit() }
                if (e.key === 'Escape') cancelEdit()
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 text-xs text-text-muted hover:text-text rounded-lg hover:bg-surface-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitEdit}
                disabled={!editText.trim()}
                className="btn-primary btn-sm"
              >
                Save & Submit
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div key={idx} className="group flex justify-end chat-fade-in">
        <div className="max-w-[85%] space-y-1">
          {ts && (
            <div className="flex items-center justify-end gap-2">
              <span className="text-[10px] text-text-muted">{formatTimestamp(ts)}</span>
            </div>
          )}
          <div className="relative bg-accent text-white rounded-2xl rounded-br-md px-4 py-2.5">
            <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed break-words">
              {msg.content}
            </pre>
            {!loading && (
              <button
                onClick={() => startEditing(idx)}
                aria-label="Edit message"
                className="absolute -left-8 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-2 opacity-60 group-hover:opacity-100 transition-all"
                title="Edit message"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div
      className={`fixed inset-0 z-50 flex ${open ? '' : 'pointer-events-none'}`}
      style={{ visibility: open ? 'visible' : 'hidden', transition: open ? 'visibility 0s' : 'visibility 0s 0.2s' }}
    >
      {/* Backdrop */}
      <div
        className="flex-1"
        style={{ background: 'rgba(0,0,0,0.25)', opacity: open ? 1 : 0, transition: 'opacity 0.2s ease' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="w-[520px] bg-surface border-l border-border flex flex-col shadow-pop h-full will-change-transform"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple to-accent flex items-center justify-center shadow-soft">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">Claude AI</p>
              <p className="text-[10px] text-text-muted">
                {messages.length > 0
                  ? `${messages.length} messages`
                  : 'Full app context loaded'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={newChat}
              title="New chat"
              aria-label="New chat"
              className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={exportChat}
              disabled={messages.length === 0}
              title="Export as Markdown"
              aria-label="Export chat as Markdown"
              className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setShowHistory(!showHistory); setHistorySearch('') }}
              title="Chat history"
              aria-label="Chat history"
              aria-pressed={showHistory}
              className={`p-2 rounded-lg transition-colors ${showHistory ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-text hover:bg-surface-2'}`}
            >
              <History className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close assistant"
              title="Close"
              className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── History Panel ───────────────────────────────────────────── */}
        {showHistory && (
          <div className="border-b border-border bg-surface flex-shrink-0 max-h-80 flex flex-col">
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <input
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Search conversations..."
                  className="input pl-8 text-xs"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              <p className="text-[10px] font-semibold text-text-muted px-1 mb-1.5">
                {filteredHistory.length} conversation{filteredHistory.length !== 1 ? 's' : ''}
              </p>
              {filteredHistory.length === 0 ? (
                <p className="text-xs text-text-muted py-4 text-center">
                  {historySearch ? 'No matches found.' : 'No saved chats yet.'}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {filteredHistory.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => openSession(s.id)}
                      className={`group/item flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        sessionId === s.id
                          ? 'bg-accent-muted text-accent'
                          : 'hover:bg-surface-2 text-text-secondary hover:text-text'
                      }`}
                    >
                      <div className="min-w-0 flex-1 flex items-start gap-2">
                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium truncate">{s.title}</p>
                          <p className="text-[10px] text-text-muted mt-0.5">
                            {formatTime(s.updatedAt)} · {s.messageCount ?? s.messages?.length ?? 0} msgs
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => removeSession(e, s.id)}
                        aria-label="Delete conversation"
                        className="p-1.5 rounded-md opacity-60 group-hover/item:opacity-100 text-text-muted hover:text-red hover:bg-red-muted transition-all"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Messages ────────────────────────────────────────────────── */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-5 relative">
          {/* Empty state */}
          {messages.length === 0 && !loading && (
            <div className="pt-6 pb-4">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple to-accent flex items-center justify-center mx-auto mb-4 shadow-card">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-base font-bold text-text mb-1">How can I help?</h2>
                <p className="text-xs text-text-muted max-w-xs mx-auto">
                  Full access to your agents, commands, rules, and CLAUDE.md files.
                </p>
              </div>
              <div className="space-y-4 max-w-sm mx-auto">
                {STARTER_CATEGORIES.map((cat) => (
                  <div key={cat.label}>
                    <p className="text-[10px] font-semibold text-text-muted mb-1.5 px-1">
                      {cat.icon} {cat.label}
                    </p>
                    <div className="space-y-1">
                      {cat.prompts.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => { setInput(prompt); inputRef.current?.focus() }}
                          className="w-full text-left text-xs px-3.5 py-2.5 rounded-xl bg-surface-2 text-text-secondary hover:bg-accent-muted hover:text-accent transition-all border border-transparent hover:border-accent/20"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, idx) => {
            if (msg.role === 'assistant') return renderAssistantMessage(msg, idx)
            return renderUserMessage(msg, idx)
          })}

          {/* Streaming / Loading */}
          {loading && (() => {
            const elapsedMs = runStartedAt ? nowTick - runStartedAt : 0
            const elapsedS = Math.max(0, Math.floor(elapsedMs / 1000))
            const streaming = !!streamingText
            const sinceLastChunkS = lastChunkAt ? Math.floor((nowTick - lastChunkAt) / 1000) : null
            const stalled = streaming && sinceLastChunkS !== null && sinceLastChunkS > 6
            const label = streaming
              ? (stalled ? `streaming · idle ${sinceLastChunkS}s` : 'streaming')
              : (elapsedS < 5 ? 'waiting for Claude…' : elapsedS < 20 ? `thinking · ${elapsedS}s` : `still thinking · ${elapsedS}s`)
            const fmtElapsed = elapsedS >= 60 ? `${Math.floor(elapsedS/60)}m ${elapsedS%60}s` : `${elapsedS}s`
            return (
              <div className="flex gap-3 justify-start chat-fade-in">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple to-accent flex items-center justify-center shrink-0 mt-0.5 shadow-soft">
                  <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
                </div>
                <div className="max-w-[88%] min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-text">Claude</span>
                    <span className="text-[10px] text-text-muted">{label}</span>
                    <span className="text-[10px] text-text-muted tabular-nums" title="elapsed since send">· {fmtElapsed}</span>
                    <button
                      onClick={cancelStream}
                      className="ml-auto text-[10px] text-red/80 hover:text-red inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-red/10 transition-colors"
                      title="Stop generating"
                    >
                      <Square className="w-2.5 h-2.5" /> Stop
                    </button>
                  </div>
                  {streaming ? (
                    <div className="bg-surface-2 rounded-2xl rounded-tl-md px-4 py-3">
                      <MarkdownRenderer content={streamingText} />
                      <span className="inline-block w-0.5 h-4 bg-purple animate-pulse ml-0.5 align-middle rounded-full" />
                    </div>
                  ) : (
                    <div className="bg-surface-2 rounded-2xl rounded-tl-md px-4 py-3.5">
                      <div className="flex gap-1.5 items-center">
                        <span className="w-2 h-2 rounded-full bg-purple/60 animate-bounce [animation-delay:0ms]" />
                        <span className="w-2 h-2 rounded-full bg-purple/60 animate-bounce [animation-delay:150ms]" />
                        <span className="w-2 h-2 rounded-full bg-purple/60 animate-bounce [animation-delay:300ms]" />
                        {elapsedS >= 10 && (
                          <span className="text-[10px] text-text-muted ml-2">Claude's first-token latency is high on cold starts — usually 20–60s.</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-muted border border-red/20 rounded-xl px-4 py-3 chat-fade-in">
              <X className="w-4 h-4 text-red shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red font-medium">Error</p>
                <p className="text-xs text-red/80 mt-0.5">{error}</p>
              </div>
              <button onClick={() => setError('')} className="text-red/60 hover:text-red transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Scroll to bottom button ─────────────────────────────────── */}
        {showScrollBottom && (
          <div className="absolute bottom-[140px] right-[40px] z-10">
            <button
              onClick={scrollToBottom}
              aria-label="Scroll to bottom"
              className="p-2 rounded-full bg-surface border border-border shadow-card hover:bg-surface-2 transition-all text-text-muted hover:text-text"
              title="Scroll to bottom"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Input Area ──────────────────────────────────────────────── */}
        <div className="px-4 py-3 border-t border-border shrink-0 bg-surface">
          {/* Quick actions bar */}
          {messages.length > 0 && !loading && (
            <div className="flex items-center gap-2 mb-2.5">
              <button
                onClick={newChat}
                className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text px-2 py-1 rounded-md hover:bg-surface-2 transition-colors"
              >
                <Plus className="w-3 h-3" />
                New chat
              </button>
              {messages.length >= 2 && messages[messages.length - 1].role === 'assistant' && (
                <button
                  onClick={regenerateLastResponse}
                  className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text px-2 py-1 rounded-md hover:bg-surface-2 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerate
                </button>
              )}
            </div>
          )}

          {/* Attached file preview */}
          {attachedFile && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-surface-2 border border-border rounded-xl">
              <Paperclip className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="text-xs font-mono text-text-secondary flex-1 truncate">{attachedFile.name}</span>
              <span className="text-[10px] text-text-muted">{(attachedFile.content.length / 1024).toFixed(1)}KB</span>
              <button onClick={() => setAttachedFile(null)} aria-label="Remove attached file" title="Remove" className="p-0.5 text-text-muted hover:text-red transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Input row */}
          <div className="relative bg-surface-2 border border-border rounded-2xl focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/10 transition-all">
            <AgentMentionPicker value={input} onChange={setInput} inputRef={inputRef} />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={loading ? 'Claude is thinking...' : 'Message Claude…  type @ to mention an agent'}
              rows={1}
              disabled={loading}
              className="w-full bg-transparent px-4 pt-3 pb-1.5 text-sm text-text resize-none focus:outline-none placeholder:text-text-muted disabled:opacity-60 max-h-40"
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt,.ts,.tsx,.js,.jsx,.json,.css,.scss,.py,.go,.rs,.rb,.java,.html,.yaml,.yml,.toml,.sh,.env"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  title="Attach file"
                  aria-label="Attach file"
                  className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent-muted disabled:opacity-30 transition-colors"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                {loading ? (
                  <button
                    onClick={cancelStream}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red/90 text-white rounded-xl hover:bg-red transition-colors text-xs font-medium"
                    title="Stop generating"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() && !attachedFile}
                    className="p-2 bg-accent text-white rounded-xl hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Send message (Enter)"
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Footer hint */}
          <p className="text-[10px] text-text-muted mt-1.5 text-center">
            Enter to send · Shift+Enter new line · ⌘⇧O new chat
          </p>
        </div>
      </div>
    </div>

    {/* ── Save as Agent Modal ──────────────────────────────────────────── */}
    {saveAgentModal && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setSaveAgentModal(null)} aria-hidden="true" />
        <div className="relative bg-surface border border-border rounded-2xl p-6 w-[420px] shadow-pop chat-fade-in" role="dialog" aria-modal="true" aria-labelledby="save-agent-title">
          <h3 id="save-agent-title" className="text-base font-semibold mb-4 flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple" />
            Save Agent to Library
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1.5">Agent file name</label>
              <input
                value={saveAgentName}
                onChange={e => setSaveAgentName(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, ''))}
                placeholder="agent-name"
                className="input font-mono"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1.5">Save to</label>
              <select
                value={saveAgentScope}
                onChange={e => setSaveAgentScope(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/10 transition-all"
              >
                <option value="global">Global (~/.claude/agents/)</option>
                {appCtx?.projects.map(p => (
                  <option key={p.path} value={p.path}>{p.name} (project)</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button
              onClick={() => setSaveAgentModal(null)}
              className="flex-1 px-4 py-2.5 text-sm text-text-secondary hover:text-text rounded-xl hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAgent}
              disabled={!saveAgentName.trim() || savingAgent}
              className="flex-1 px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-purple to-accent text-white rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-soft"
            >
              {savingAgent ? 'Saving...' : 'Save Agent'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
