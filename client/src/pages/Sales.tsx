import { useState, useRef, useCallback, useMemo } from 'react'
import { Handshake, Send, Copy, Check, Square, ShieldCheck, MessageSquareText, History, AlertTriangle } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import { toast } from '../components/Toast'
import { useApi } from '../hooks/useApi'
import { getUnifiedAgents } from '../lib/api'
import { CacheKeys } from '../lib/cacheKeys'
import { formatAgentDisplay } from '../lib/agentDisplay'

// Sway is the dedicated Shopify-website sales closer. This panel turns a pasted client
// chat into the next high-converting reply by dispatching the `sway` agent through the
// existing /api/playground/run streaming pipeline (no new backend). The 7 situations map
// to Sway's golden sales cases (src/intelligence/eval/golden/sales-*.json).
const SITUATIONS = [
  { id: 'discovery_qualification', label: 'Discovery & qualify', hint: 'Surface pain, budget, timeline, decision-maker.' },
  { id: 'objection_price', label: 'Price objection', hint: 'Reframe price as value; defend premium.' },
  { id: 'competitive_defense', label: 'Competitor', hint: 'They are comparing / leaning to a cheaper option.' },
  { id: 'trust_risk_reversal', label: 'Trust / risk', hint: 'Lower perceived risk; guarantee/process clarity.' },
  { id: 'proof_deployment', label: 'Proof', hint: 'Show evidence — past builds, process, results.' },
  { id: 'honesty_no_fabrication', label: 'Honesty check', hint: 'Answer hard questions without fabricating.' },
  { id: 'close', label: 'Close', hint: 'Ask for the commitment; make next step frictionless.' },
] as const

type SituationId = typeof SITUATIONS[number]['id']

function buildPrompt(chat: string, situation: typeof SITUATIONS[number]): string {
  return [
    'Here is the client conversation so far (most recent message last):',
    '',
    chat.trim(),
    '',
    `Situation: ${situation.label} — ${situation.hint}`,
    '',
    'Draft Sway\'s next reply: the single highest-converting message to send this client next.',
    'Mirror their energy, apply the right psychological lever, and move toward the close.',
    'HARD RULE: honest claims only — no fabricated stats, no guaranteed results, no fake urgency.',
    'Return only the reply text, ready to paste.',
  ].join('\n')
}

const RECENTS_KEY = 'sales.recents.v1'
interface RecentDraft { id: string; chat: string; situation: SituationId; reply: string; ts: number }

// Sway's hard rule made actionable: flag fabrication / fake-urgency / unsubstantiated
// claims in the drafted reply so they're caught before the message is ever sent.
const HONESTY_FLAGS: { re: RegExp; why: string }[] = [
  { re: /\bguarantee(d|s)?\b/i, why: '“guarantee” — Sway never promises guaranteed results.' },
  { re: /\b100%\b|\bevery (client|customer|time)\b/i, why: 'absolute claim (100% / every) — avoid unprovable absolutes.' },
  { re: /\b#1\b|\bnumber one\b|\bbest (in|on) the\b/i, why: 'unsubstantiated superlative — only claim what is proven.' },
  { re: /limited time|act now|only \d+ (spots?|left)|expires? (today|soon)|don'?t miss/i, why: 'fake urgency — avoid manufactured scarcity.' },
  { re: /\brisk[- ]?free\b/i, why: '“risk-free” — describe the actual guarantee/terms instead.' },
]

export default function Sales() {
  const { data: agents } = useApi(getUnifiedAgents, [], CacheKeys.unifiedAgents)
  const sway = (agents || []).find(a => a.filename === 'sway.md' || /sway/i.test(a.name || ''))
  const swayDisplay = sway ? formatAgentDisplay({ name: sway.name, description: sway.description, org: sway.org }) : null

  const [chat, setChat] = useState('')
  const [situation, setSituation] = useState<SituationId>('objection_price')
  const [reply, setReply] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [recents, setRecents] = useState<RecentDraft[]>(() => {
    try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]') as RecentDraft[] } catch { return [] }
  })
  const saveRecent = useCallback((d: RecentDraft) => setRecents(prev => {
    const next = [d, ...prev].slice(0, 8)
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)) } catch { /* quota */ }
    return next
  }), [])
  const loadRecent = useCallback((d: RecentDraft) => { setChat(d.chat); setSituation(d.situation); setReply(d.reply); setCopied(false) }, [])
  const clearRecents = useCallback(() => { setRecents([]); try { localStorage.removeItem(RECENTS_KEY) } catch { /* noop */ } }, [])

  const stop = useCallback(() => { abortRef.current?.abort(); setStreaming(false) }, [])
  const clearComposer = useCallback(() => { setChat(''); setReply(''); setCopied(false) }, [])

  const draft = useCallback(async () => {
    if (!chat.trim()) { toast('error', 'Paste the client chat first'); return }
    const sit = SITUATIONS.find(s => s.id === situation)!
    setReply(''); setStreaming(true); setCopied(false)
    const ctrl = new AbortController(); abortRef.current = ctrl
    try {
      const res = await fetch('/api/playground/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName: 'sway', prompt: buildPrompt(chat, sit) }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        const msg = res.status === 429 ? 'Rate limit — try again in a moment' : `Dispatch failed (${res.status})`
        throw new Error(msg)
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let full = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          const t = line.trim()
          if (!t.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(t.slice(6)) as { type: string; content?: string; output?: string; error?: string }
            if (ev.type === 'chunk' && ev.content) { full += ev.content; setReply(r => r + ev.content) }
            else if (ev.type === 'done') { if (ev.output) { full = ev.output; setReply(ev.output) } }
            else if (ev.type === 'error') throw new Error(ev.error || 'Sway run errored')
          } catch (e) { if (e instanceof Error && /run errored|Sway/.test(e.message)) throw e }
        }
      }
      if (full.trim()) saveRecent({ id: Date.now().toString(36), chat, situation, reply: full, ts: Date.now() })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') { /* user stopped */ }
      else toast('error', err instanceof Error ? err.message : 'Dispatch failed')
    } finally {
      setStreaming(false); abortRef.current = null
    }
  }, [chat, situation, saveRecent])

  const copyReply = useCallback(async () => {
    try { await navigator.clipboard.writeText(reply); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { toast('error', 'Copy failed') }
  }, [reply])

  const flags = useMemo(() => (reply && !streaming ? HONESTY_FLAGS.filter(f => f.re.test(reply)).map(f => f.why) : []), [reply, streaming])

  return (
    <PageShell
      title="Sales"
      subtitle={swayDisplay ? `${swayDisplay.emoji} ${swayDisplay.realName} — ${swayDisplay.role}` : 'Sway — your Shopify website-build closer'}
    >
      {/* Honesty banner — Sway's hard rule, surfaced so it's never forgotten */}
      <div className="card p-3 mb-4 flex items-start gap-2.5 border-l-2 border-l-accent">
        <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <p className="text-sm text-text-secondary">
          Sway drafts the next reply from the client's own words — honest claims only.
          <span className="text-text-muted"> No fabricated stats, guaranteed results, or fake urgency.</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Composer */}
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquareText className="w-4 h-4 text-accent" /> Draft the next reply
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted mb-1.5 block">Situation</label>
            <div className="flex flex-wrap gap-1.5">
              {SITUATIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSituation(s.id)}
                  title={s.hint}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    situation === s.id
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface-2/50 border-border text-text-secondary hover:bg-surface-2 hover:text-text'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-1.5">{SITUATIONS.find(s => s.id === situation)!.hint}</p>
          </div>

          <textarea
            value={chat}
            onChange={e => setChat(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !streaming) { e.preventDefault(); draft() } }}
            placeholder="Paste the client chat here — the whole thread, most recent message last…"
            className="w-full h-56 px-3 py-2 text-sm rounded-xl border border-border bg-surface-2/40 resize-y focus:outline-none focus:ring-2 focus:ring-accent/40"
          />

          <div className="flex items-center gap-2">
            {!streaming ? (
              <button onClick={draft} className="btn-primary btn-sm flex items-center gap-1.5" title="Draft (⌘/Ctrl + Enter)">
                <Send className="w-3.5 h-3.5" /> Draft reply with Sway
                <kbd className="ml-1 text-[9px] font-mono opacity-70">⌘↵</kbd>
              </button>
            ) : (
              <button onClick={stop} className="btn-secondary btn-sm flex items-center gap-1.5">
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            )}
            {(chat || reply) && !streaming && (
              <button onClick={clearComposer} className="btn-ghost btn-sm text-text-muted">Clear</button>
            )}
            <span className="ml-auto text-xs text-text-muted">{chat.length.toLocaleString()} chars</span>
          </div>
        </div>

        {/* Reply */}
        <div className="card p-4 flex flex-col gap-3 min-h-[20rem]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Handshake className="w-4 h-4 text-accent" /> Sway's reply
            </div>
            {reply && !streaming && (
              <button onClick={copyReply} className="btn-ghost btn-sm flex items-center gap-1.5">
                {copied ? <Check className="w-3.5 h-3.5 text-green" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          {reply ? (
            <div className="text-sm text-text whitespace-pre-wrap leading-relaxed flex-1">{reply}{streaming && <span className="inline-block w-1.5 h-4 bg-accent/70 ml-0.5 animate-pulse align-middle" />}</div>
          ) : streaming ? (
            <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
              <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin mr-2" /> Sway is drafting…
            </div>
          ) : (
            <EmptyState card icon={Handshake} title="No reply yet" description="Paste a client chat, pick the situation, and Sway drafts the next high-converting message." />
          )}
          {flags.length > 0 && (
            <div className="rounded-lg border border-amber/30 bg-amber/5 p-2.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber"><AlertTriangle className="w-3.5 h-3.5" /> Honesty check — review before sending</div>
              {flags.map((f, i) => <div key={i} className="text-xs text-text-secondary pl-5">{f}</div>)}
            </div>
          )}
        </div>
      </div>

      {/* Recent drafts — persisted locally, click to reload into the composer */}
      {recents.length > 0 && (
        <div className="card p-4 mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold"><History className="w-4 h-4 text-accent" /> Recent drafts</div>
            <button onClick={clearRecents} className="btn-ghost btn-sm text-text-muted">Clear</button>
          </div>
          <div className="space-y-1.5">
            {recents.map(d => (
              <button
                key={d.id}
                onClick={() => loadRecent(d)}
                className="w-full text-left rounded-lg border border-border-subtle bg-surface-2/30 px-3 py-2 hover:border-accent/30 hover:bg-surface-2/60 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-text">{SITUATIONS.find(s => s.id === d.situation)?.label ?? d.situation}</span>
                  <span className="text-text-muted">· {new Date(d.ts).toLocaleString()}</span>
                </div>
                <div className="text-xs text-text-muted truncate mt-0.5">{d.reply.slice(0, 120)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Capabilities — the 7 sales situations Sway is trained + scored on */}
      <div className="card p-4 mt-4">
        <div className="text-sm font-semibold mb-2">What Sway closes</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SITUATIONS.map(s => (
            <div key={s.id} className="rounded-lg border border-border-subtle bg-surface-2/30 p-2.5">
              <div className="text-xs font-medium text-text">{s.label}</div>
              <div className="text-xs text-text-muted mt-0.5 leading-snug">{s.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
