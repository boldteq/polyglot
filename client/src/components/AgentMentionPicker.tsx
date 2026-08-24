import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Bot } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { getUnifiedAgents } from '../lib/api'
import type { UnifiedAgent } from '../types'
import { formatAgentDisplay } from '../lib/agentDisplay'

// AgentMentionPicker — reusable "@" autocomplete for any textarea in the app.
// Sits inside the same relative-positioned container as the textarea (parent
// must be `position: relative`) and floats a small picker above the input when
// the caret is on an `@…` token. Selecting an agent replaces the token with
// `@agent-name` and inserts a trailing space.
//
// Zero backend cost — reads from the shared `getUnifiedAgents` SWR cache the
// rest of the app already fetches.

interface Props {
  value: string
  onChange: (next: string) => void
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>
  /** Show the picker even if the user hasn't started typing an @-token — useful
   * for a dedicated "insert agent" button. Not used yet. */
  forceOpen?: boolean
  /** Called after an agent is selected. Consumers can also just re-read
   * `value`; this fires with the picked agent for analytics/downstream. */
  onPick?: (agent: UnifiedAgent) => void
  /** Where the popup should anchor. Defaults to above the textarea. */
  anchor?: 'above' | 'below'
  className?: string
}

// Parse the current token from `value` up to `caret`. Returns the @-token
// (without the @) if the caret is inside one — otherwise null. A token ends
// at whitespace / newline / a second @.
function extractToken(value: string, caret: number): { start: number; end: number; query: string } | null {
  // Walk left from caret to find an @ that's word-boundary-preceded.
  let i = caret - 1
  while (i >= 0) {
    const ch = value[i]
    if (ch === '@') {
      // Preceding char must be start-of-string, whitespace, or newline.
      if (i === 0 || /\s/.test(value[i - 1])) {
        // Walk right from @ to find the end (whitespace or end).
        let j = i + 1
        while (j < value.length && !/\s/.test(value[j]) && value[j] !== '@') j++
        // Caret must sit within [i+1..j].
        if (caret >= i + 1 && caret <= j) return { start: i, end: j, query: value.slice(i + 1, caret) }
        return null
      }
      return null
    }
    if (/\s/.test(ch)) return null
    i--
  }
  return null
}

export default function AgentMentionPicker({ value, onChange, inputRef, forceOpen, onPick, anchor = 'above', className }: Props) {
  const { data: agents } = useApi(getUnifiedAgents, [], CacheKeys.unifiedAgents)
  const [caret, setCaret] = useState<number>(0)
  const [activeIdx, setActiveIdx] = useState(0)
  const [suppress, setSuppress] = useState(false) // Esc temporarily closes for the current token
  const suppressTokenStartRef = useRef<number | null>(null)

  // Track caret position — fires on select, keyup, and focus changes.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const handler = () => setCaret(el.selectionStart ?? 0)
    el.addEventListener('keyup', handler)
    el.addEventListener('click', handler)
    el.addEventListener('focus', handler)
    return () => {
      el.removeEventListener('keyup', handler)
      el.removeEventListener('click', handler)
      el.removeEventListener('focus', handler)
    }
  }, [inputRef])

  const token = useMemo(() => extractToken(value, caret), [value, caret])

  // Reset Esc-suppression when the user moves to a new @-token.
  useEffect(() => {
    if (!token) { setSuppress(false); suppressTokenStartRef.current = null; return }
    if (suppressTokenStartRef.current !== token.start) {
      setSuppress(false)
      suppressTokenStartRef.current = token.start
    }
  }, [token])

  const open = (forceOpen || !!token) && !suppress

  const query = (token?.query || '').toLowerCase()
  const results = useMemo(() => {
    if (!agents || !open) return []
    const q = query.trim()
    const scored = agents.map((a) => {
      const name = (a.name || '').toLowerCase()
      const desc = (a.description || '').toLowerCase()
      let score = 0
      if (!q) score = 1
      else if (name === q) score = 100
      else if (name.startsWith(q)) score = 80
      else if (name.includes(q)) score = 40
      else if (desc.includes(q)) score = 10
      return { a, score }
    })
    return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map((x) => x.a)
  }, [agents, open, query])

  useEffect(() => { setActiveIdx(0) }, [query])

  const insertPick = useCallback((agent: UnifiedAgent) => {
    if (!token) return
    const before = value.slice(0, token.start)
    const after = value.slice(token.end)
    const insertion = `@${agent.name}`
    const trailing = after.startsWith(' ') ? '' : ' '
    const next = before + insertion + trailing + after
    onChange(next)
    onPick?.(agent)
    // Move caret past the inserted mention on next tick.
    const nextCaret = (before + insertion + trailing).length
    window.requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      try { (el as HTMLTextAreaElement).setSelectionRange(nextCaret, nextCaret) } catch { /* ignore */ }
    })
  }, [token, value, onChange, onPick, inputRef])

  // Intercept ArrowUp/Down/Enter/Escape while the picker is open.
  useEffect(() => {
    const el = inputRef.current
    if (!el || !open || results.length === 0) return
    const handler = (evt: Event) => {
      const e = evt as unknown as globalThis.KeyboardEvent
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(results.length - 1, i + 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)) }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertPick(results[activeIdx])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setSuppress(true)
      }
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [open, results, activeIdx, insertPick, inputRef])

  if (!open || results.length === 0) return null

  const anchorCls = anchor === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'

  return (
    <div
      className={`absolute left-2 right-2 ${anchorCls} z-50 bg-surface border border-border rounded-xl shadow-pop overflow-hidden max-w-md ${className || ''}`}
      role="listbox"
      aria-label="Agent mention picker"
    >
      <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border-subtle uppercase tracking-wide">
        {query ? `${results.length} agents matching “${query}”` : 'Pick an agent'}
      </div>
      <div className="max-h-64 overflow-y-auto">
        {results.map((a, i) => {
          const d = formatAgentDisplay({ name: a.name, title: a.org?.title, description: a.description, id: a.filename })
          return (
            <button
              key={a.filename}
              type="button"
              role="option"
              aria-selected={i === activeIdx}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => insertPick(a)}
              className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ${i === activeIdx ? 'bg-accent/10' : 'hover:bg-surface-2/60'}`}
            >
              <Bot className="w-3.5 h-3.5 text-text-muted shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">
                  {d.emoji && <span className="mr-1">{d.emoji}</span>}{d.realName}
                  {d.role && <span className="text-text-muted font-normal"> — {d.role}</span>}
                </div>
                {d.tagline && (
                  <div className="text-[10px] text-text-muted truncate">{d.tagline}</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
      <div className="px-3 py-1.5 border-t border-border-subtle text-[9px] text-text-muted flex items-center gap-3">
        <span><kbd className="bg-surface-2 px-1 rounded font-mono">↑↓</kbd> nav</span>
        <span><kbd className="bg-surface-2 px-1 rounded font-mono">↵</kbd> insert</span>
        <span><kbd className="bg-surface-2 px-1 rounded font-mono">esc</kbd> dismiss</span>
      </div>
    </div>
  )
}
