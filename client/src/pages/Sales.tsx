import { useState, useRef, useCallback, useMemo, useEffect, type ReactNode, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Handshake, Send, Copy, Check, Square, ShieldCheck, MessageSquareText, History, AlertTriangle, FolderKanban, Inbox, BarChart3, Trophy, RefreshCw, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { PageShell, TabNav, FilterBar } from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import { SkeletonCards } from '../components/Skeleton'
import { toast } from '../components/Toast'
import { confirmDialog } from '../lib/confirm'
import { statusPill } from '../lib/colors'
import { useApi } from '../hooks/useApi'
import { getUnifiedAgents, getSalesDeals, getSalesCorpus, getSalesScores, scoreSalesReply, ingestSalesChat, createSalesDeal, updateSalesDealOutcome, deleteSalesDeal, getSalesDrafts, createSalesDraft, clearSalesDrafts, deleteSalesDraft, deleteSalesCorpusFile } from '../lib/api'
import type { SalesScoreResult, SalesOutcome, SalesDraft } from '../lib/api'
import { CacheKeys } from '../lib/cacheKeys'
import { formatAgentDisplay } from '../lib/agentDisplay'

// Sway is the dedicated Shopify-website sales closer. This Sales Desk turns a pasted client
// chat into the next high-converting reply by dispatching the `sway` agent through the
// existing /api/playground/run streaming pipeline, then AUTO-SCORES the draft against the
// matching sales golden case (the situation IS the task_type). Deals / Corpus / Scores tabs
// read Sway's files from ~/.claude/memory/sales via /api/sales/*.
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

const EXAMPLES: { label: string; situation: SituationId; text: string }[] = [
  { label: 'Price pushback', situation: 'objection_price', text: 'Client: Honestly your quote is way more than the other agency we spoke to.' },
  { label: 'Cold inquiry', situation: 'discovery_qualification', text: "Client: Hi — we need a new Shopify store but aren't sure where to start. What do you offer?" },
  { label: 'Cheaper competitor', situation: 'competitive_defense', text: "Client: We're also looking at a $500 freelancer. Why should we pay more?" },
  { label: 'Ready to start', situation: 'close', text: 'Client: This looks great — what are the next steps to get going?' },
]

const HONESTY_FLAGS: { re: RegExp; why: string }[] = [
  { re: /\bguarantee(d|s)?\b/i, why: '“guarantee” — Sway never promises guaranteed results.' },
  { re: /\b100%\b|\bevery (client|customer|time)\b/i, why: 'absolute claim (100% / every) — avoid unprovable absolutes.' },
  { re: /\b#1\b|\bnumber one\b|\bbest (in|on) the\b/i, why: 'unsubstantiated superlative — only claim what is proven.' },
  { re: /limited time|act now|only \d+ (spots?|left)|expires? (today|soon)|don'?t miss/i, why: 'fake urgency — avoid manufactured scarcity.' },
  { re: /\brisk[- ]?free\b/i, why: '“risk-free” — describe the actual guarantee/terms instead.' },
  { re: /money[- ]?back|full refund/i, why: '“money-back / refund” — not offered; de-risk with milestone payment only.' },
]

type TabId = 'draft' | 'deals' | 'corpus' | 'scores'
const DIM_LABEL: Record<string, string> = { correctness: 'Correct', completeness: 'Complete', brand_fit: 'Brand fit', conversion: 'Conversion', safety: 'Safety' }
// Golden-case id → friendly situation label (mirrors SITUATION_TO_CASE on the server).
const CASE_LABEL: Record<string, string> = {
  'sales-discovery-qualification': 'Discovery & qualify',
  'sales-objection-price': 'Price objection',
  'sales-competitive-defense': 'Competitor',
  'sales-trust-risk-reversal': 'Trust / risk',
  'sales-proof-deployment': 'Proof',
  'sales-honesty-no-fabrication': 'Honesty check',
  'sales-close-calibrated': 'Close',
}

// Scores come back as 0–1 floats from the judge; the desk shows them as % only.
const pct = (n: number) => `${Math.round((n ?? 0) * 100)}%`           // 0.818 → "82%"
const dimBar = (v: number) => (v < 0.5 ? 'bg-red' : v < 0.7 ? 'bg-amber' : 'bg-green')
const dimText = (v: number) => (v < 0.5 ? 'text-red' : v < 0.7 ? 'text-amber' : 'text-text')

// Compact metric card — one consistent style for every stat strip on the page.
function MetricCard({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className="card p-3 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${color || 'text-text'}`}>{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
    </div>
  )
}

// Distinct loading / error / empty / data states for the file-backed tabs
// (deals · corpus · scores) — satisfies error-handling.md: a failed fetch shows
// an error card with Retry, never the empty state.
function DataState({ loading, error, isEmpty, empty, onRetry, children }: {
  loading: boolean; error: string | null; isEmpty: boolean; empty: ReactNode; onRetry: () => void; children: ReactNode
}) {
  if (loading) return <SkeletonCards count={4} className="h-16" />
  if (error) return (
    <div className="card p-4 flex items-start gap-2.5 border-l-2 border-l-red">
      <AlertTriangle className="w-4 h-4 text-red shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text">Couldn't load this data</div>
        <div className="text-xs text-text-muted mt-0.5 truncate">{error}</div>
      </div>
      <button onClick={onRetry} className="btn-secondary btn-sm flex items-center gap-1.5 shrink-0"><RefreshCw className="w-3.5 h-3.5" /> Retry</button>
    </div>
  )
  if (isEmpty) return <>{empty}</>
  return <>{children}</>
}

export default function Sales() {
  const { data: agents } = useApi(getUnifiedAgents, [], CacheKeys.unifiedAgents)
  const sway = (agents || []).find(a => a.filename === 'sway.md' || /sway/i.test(a.name || ''))
  const swayDisplay = sway ? formatAgentDisplay({ name: sway.name, description: sway.description, org: sway.org }) : null

  // Tab state lives in the URL (?tab=) so refresh/back/deep-link survive — repo convention.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: TabId = (['draft', 'deals', 'corpus', 'scores'] as const).includes(tabParam as TabId) ? (tabParam as TabId) : 'draft'
  const setTab = useCallback((id: TabId) => {
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('tab', id); return p }, { replace: true })
  }, [setSearchParams])
  const [chat, setChat] = useState('')
  const [situation, setSituation] = useState<SituationId>('objection_price')
  const [reply, setReply] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [copied, setCopied] = useState(false)
  const [score, setScore] = useState<SalesScoreResult | null>(null)
  const [scoring, setScoring] = useState(false)
  const [announce, setAnnounce] = useState('') // sr-only live-region text for AT
  const abortRef = useRef<AbortController | null>(null)
  const replyRef = useRef<HTMLDivElement>(null)
  // Deal idempotency: track slug of the deal created for the current reply so that
  // clicking Won → Lost → Open updates the SAME record rather than creating 3 deals.
  const [loggedDealSlug, setLoggedDealSlug] = useState<string | null>(null)
  const [loggedOutcome, setLoggedOutcome] = useState<SalesOutcome | null>(null)
  // Separate loading flags — the new-deal form and reply-card outcome buttons must not block each other.
  const [savingOutcome, setSavingOutcome] = useState(false)
  const [savingNewDeal, setSavingNewDeal] = useState(false)
  // Tracks whether the most recent draft was aborted by the user (shows "(stopped early)" indicator).
  const [stopped, setStopped] = useState(false)

  // Library data (loaded for the tab counts + tabs)
  const { data: dealsData, loading: dealsLoading, error: dealsError, refetch: refetchDeals } = useApi(getSalesDeals, [], 'sales-deals')
  const { data: corpusData, loading: corpusLoading, error: corpusError, refetch: refetchCorpus } = useApi(getSalesCorpus, [], 'sales-corpus')
  const { data: scoresData, loading: scoresLoading, error: scoresError, refetch: refetchScores } = useApi(getSalesScores, [], 'sales-scores')
  const { data: draftsData, refetch: refetchDrafts } = useApi(getSalesDrafts, [], 'sales-drafts')
  const deals = dealsData?.deals ?? []
  const corpus = corpusData?.chats ?? []
  const scores = scoresData?.scores ?? []
  const recents = draftsData?.drafts ?? []
  const winLoss = useMemo(() => ({
    won: deals.filter(d => d.outcome === 'WON').length,
    lost: deals.filter(d => d.outcome === 'LOST').length,
    open: deals.filter(d => d.outcome !== 'WON' && d.outcome !== 'LOST').length,
  }), [deals])
  // Score filter state lives here (above passRate) so filteredScores can drive the metric cards.
  const [scoreFilter, setScoreFilter] = useState<'all' | 'pass' | 'fail'>('all')
  const [scoreSearch, setScoreSearch] = useState('')
  const [expandedScore, setExpandedScore] = useState<string | null>(null)
  const filteredScores = useMemo(() => scores.filter(s => {
    if (scoreFilter === 'pass' && !s.pass) return false
    if (scoreFilter === 'fail' && s.pass) return false
    if (scoreSearch.trim()) {
      const q = scoreSearch.toLowerCase()
      return (CASE_LABEL[s.case] || s.case).toLowerCase().includes(q) || (s.reply || '').toLowerCase().includes(q)
    }
    return true
  }), [scores, scoreFilter, scoreSearch])
  // Metrics always reflect the currently-filtered view so pass rate / avg score match what's on screen.
  const displaySet = filteredScores
  const passRate = displaySet.length ? Math.round((displaySet.filter(s => s.pass).length / displaySet.length) * 100) : null
  const avgScore = displaySet.length ? pct(displaySet.reduce((a, s) => a + (s.overall ?? 0), 0) / displaySet.length) : '—'

  // Server-backed draft history (durable, cross-device — replaces localStorage).
  const loadRecent = useCallback(async (d: SalesDraft) => {
    if ((chat || reply) && !(await confirmDialog({ title: 'Load this draft?', message: 'This replaces the current chat and reply in the composer.', confirmLabel: 'Load' }))) return
    setChat(d.chat); setSituation(d.situation as SituationId); setReply(d.reply); setScore(null); setCopied(false); setStopped(false)
  }, [chat, reply])
  const clearRecents = useCallback(async () => {
    if (!(await confirmDialog({ title: 'Clear recent drafts?', message: 'This permanently removes every saved draft.', confirmLabel: 'Clear', danger: true }))) return
    try { await clearSalesDrafts(); refetchDrafts(); toast('success', 'All drafts cleared') } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not clear drafts') }
  }, [refetchDrafts])
  const deleteOneDraft = useCallback(async (id: string) => {
    try { await deleteSalesDraft(id); refetchDrafts() } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not delete draft') }
  }, [refetchDrafts])

  const stop = useCallback(() => { abortRef.current?.abort(); setStreaming(false) }, [])
  const clearComposer = useCallback(async () => {
    if ((chat || reply) && !(await confirmDialog({ title: 'Clear the composer?', message: 'This clears the pasted chat and the drafted reply.', confirmLabel: 'Clear' }))) return
    setChat(''); setReply(''); setScore(null); setCopied(false); setStopped(false)
  }, [chat, reply])

  const runScore = useCallback(async (text: string, sit: SituationId) => {
    setScoring(true); setScore(null)
    try { const r = await scoreSalesReply(text, sit); setScore(r); setAnnounce(`Quality score ${pct(r.overall)}, ${r.pass ? 'pass' : 'fail'}`) }
    catch (err) { console.error('[sales] reply scoring failed:', err instanceof Error ? err.message : err) /* best-effort; the reply still stands */ }
    finally { setScoring(false); refetchScores() }
  }, [refetchScores])

  const draft = useCallback(async () => {
    if (!chat.trim()) { toast('error', 'Paste the client chat first'); return }
    const sit = SITUATIONS.find(s => s.id === situation)!
    setReply(''); setStreaming(true); setCopied(false); setScore(null); setStopped(false)
    setLoggedDealSlug(null); setLoggedOutcome(null)
    setAnnounce('Sway is drafting the reply…')
    if (typeof window !== 'undefined' && window.innerWidth < 768) replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      let done = false
      let streamErr: Error | null = null
      reading: for (;;) {
        const { value, done: readerDone } = await reader.read()
        if (readerDone) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          const t = line.trim()
          if (!t.startsWith('data: ')) continue
          // Parse ONLY inside the try; never let it swallow a terminal error event.
          let ev: { type: string; content?: string; output?: string; error?: string }
          try { ev = JSON.parse(t.slice(6)) } catch { continue }
          if (ev.type === 'chunk' && ev.content) { full += ev.content; setReply(r => r + ev.content) }
          else if (ev.type === 'done') { if (ev.output) { full = ev.output; setReply(ev.output) } done = true; break reading }
          else if (ev.type === 'error') { streamErr = new Error(ev.error || 'Sway run failed'); break reading }
        }
      }
      if (streamErr) throw streamErr
      if (done && full.trim()) {
        // Only persist + score a CLEANLY-finished reply — never a partial/aborted one.
        setAnnounce('Draft complete — scoring…')
        createSalesDraft({ chat, situation, reply: full }).then(() => refetchDrafts()).catch(e => console.error('[sales] draft save failed:', e instanceof Error ? e.message : e))
        runScore(full, situation) // auto-score the draft against its golden case
      } else if (done && !full.trim()) {
        setAnnounce('Sway returned an empty reply')
        toast('error', 'Sway returned an empty reply — try again')
      } else if (!done) {
        // Stream ended without a `done` event — network cut, server crash, or timeout.
        if (full.trim()) {
          setAnnounce('Stream ended early — reply may be incomplete')
          toast('warn', 'Stream ended early — reply may be incomplete')
        } else {
          setAnnounce('Draft failed — connection lost')
          toast('error', 'Connection lost — no reply received. Try again.')
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') { setStopped(true); setAnnounce('Draft stopped') }
      else { setAnnounce('Draft failed'); toast('error', err instanceof Error ? err.message : 'Dispatch failed') }
    } finally {
      setStreaming(false); abortRef.current = null
    }
  }, [chat, situation, refetchDrafts, runScore])

  const copyReply = useCallback(async () => {
    // Honesty guardrail: a flagged reply requires explicit acknowledgement before it leaves the desk.
    const violations = HONESTY_FLAGS.filter(f => f.re.test(reply))
    if (violations.length > 0) {
      const ok = await confirmDialog({
        title: 'Copy a flagged reply?',
        message: `Honesty check flagged ${violations.length} issue${violations.length > 1 ? 's' : ''}: ${violations.map(f => f.why).join(' ')} Copy it anyway?`,
        confirmLabel: 'Copy anyway', danger: true,
      })
      if (!ok) return
    }
    try { await navigator.clipboard.writeText(reply); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { toast('error', 'Copy failed') }
  }, [reply])

  const flags = useMemo(() => (reply && !streaming ? HONESTY_FLAGS.filter(f => f.re.test(reply)).map(f => f.why) : []), [reply, streaming])

  // Roving-focus arrow-key nav for the Situation radiogroup (WCAG radio pattern).
  const onSituationKey = useCallback((e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
    e.preventDefault()
    const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1
    const next = (idx + dir + SITUATIONS.length) % SITUATIONS.length
    setSituation(SITUATIONS[next].id)
    const btn = e.currentTarget.parentElement?.children?.[next]
    if (btn instanceof HTMLElement) btn.focus()
  }, [])

  // Reset deal form + score filters when switching tabs — prevents stale state on return
  useEffect(() => {
    setShowNewDeal(false)
    setScoreFilter('all')
    setScoreSearch('')
    setExpandedScore(null)
  }, [tab])

  // Escape closes the expanded score drill-in
  useEffect(() => {
    const onKey = (e: Event) => { if ((e as Event & { key: string }).key === 'Escape') setExpandedScore(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Corpus ingest box
  const [ingestText, setIngestText] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const doIngest = useCallback(async () => {
    if (!ingestText.trim()) { toast('error', 'Paste the finished chat first'); return }
    setIngesting(true)
    try { const r = await ingestSalesChat(ingestText); setIngestText(''); refetchCorpus(); toast('success', `Saved ${r.file}. ${r.next}`) }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Ingest failed') }
    finally { setIngesting(false) }
  }, [ingestText, refetchCorpus])

  // Deals — new deal form state
  const [newDealTitle, setNewDealTitle] = useState('')
  const [showNewDeal, setShowNewDeal] = useState(false)
  const dealTitleFromChat = useCallback(() => {
    const firstLine = chat.split('\n').map(l => l.trim()).find(Boolean) || ''
    const t = firstLine.replace(/^client:\s*/i, '').slice(0, 60)
    return t || `${SITUATIONS.find(s => s.id === situation)?.label ?? 'Deal'} — ${new Date().toLocaleDateString()}`
  }, [chat, situation])
  const logOutcome = useCallback(async (outcome: SalesOutcome) => {
    setSavingOutcome(true)
    try {
      if (loggedDealSlug) {
        await updateSalesDealOutcome(loggedDealSlug, outcome)
      } else {
        const r = await createSalesDeal({ title: dealTitleFromChat(), outcome })
        setLoggedDealSlug(r.deal.slug)
      }
      setLoggedOutcome(outcome); refetchDeals(); toast('success', `Deal logged as ${outcome}`)
    }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not log deal') }
    finally { setSavingOutcome(false) }
  }, [loggedDealSlug, dealTitleFromChat, refetchDeals])
  const createNewDeal = useCallback(async () => {
    if (!newDealTitle.trim()) { toast('error', 'Enter a deal title'); return }
    setSavingNewDeal(true)
    try { await createSalesDeal({ title: newDealTitle.trim(), outcome: 'OPEN' }); setNewDealTitle(''); setShowNewDeal(false); refetchDeals(); toast('success', 'Deal created') }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not create deal') }
    finally { setSavingNewDeal(false) }
  }, [newDealTitle, refetchDeals])
  const setOutcome = useCallback(async (slug: string, outcome: SalesOutcome) => {
    try { await updateSalesDealOutcome(slug, outcome); refetchDeals() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not update outcome') }
  }, [refetchDeals])
  const deleteOneDeal = useCallback(async (slug: string) => {
    const ok = await confirmDialog({ title: 'Delete this deal?', message: 'This permanently removes the deal file.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    try { await deleteSalesDeal(slug); refetchDeals() } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not delete deal') }
  }, [refetchDeals])
  const deleteOneCorpus = useCallback(async (file: string) => {
    const ok = await confirmDialog({ title: 'Delete this chat?', message: `Remove "${file}" from the corpus?`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    try { await deleteSalesCorpusFile(file); refetchCorpus() } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not delete corpus file') }
  }, [refetchCorpus])

  const tabs = [
    { id: 'draft', label: 'Draft' },
    { id: 'deals', label: 'Deals', count: deals.length },
    { id: 'corpus', label: 'Corpus', count: corpus.length },
    { id: 'scores', label: 'Scores', count: scores.length },
  ]

  return (
    <PageShell
      title="Sales Desk"
      subtitle={swayDisplay?.fullDisplay || 'Sway — your Shopify website-build closer'}
      actions={tab !== 'draft' ? (
        <button
          onClick={() => { if (tab === 'deals') refetchDeals(); else if (tab === 'corpus') refetchCorpus(); else refetchScores() }}
          className="btn-secondary btn-sm flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      ) : undefined}
    >
      <TabNav tabs={tabs} active={tab} onChange={(id) => setTab(id as TabId)} />
      <div aria-live="polite" aria-atomic="true" className="sr-only">{announce}</div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm">
      {tab === 'draft' && (<>
        <div className="card p-3 mb-4 flex items-start gap-2.5 border-l-2 border-l-accent">
          <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <p className="text-sm text-text-secondary">
            Sway drafts the next reply from the client's own words — honest claims only, then auto-scores it against the matching golden case.
            <span className="text-text-muted"> No fabricated stats, guaranteed results, money-back, or fake urgency.</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Composer */}
          <div className="card p-4 flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquareText className="w-4 h-4 text-accent" aria-hidden="true" /> Draft the next reply
            </h2>
            <div>
              <span id="situation-label" className="text-xs font-medium text-text-muted mb-1.5 block">Situation</span>
              <div role="radiogroup" aria-labelledby="situation-label" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                {SITUATIONS.map((s, i) => (
                  <button key={s.id} role="radio" aria-checked={situation === s.id} tabIndex={situation === s.id ? 0 : -1}
                    onClick={() => setSituation(s.id)} onKeyDown={e => onSituationKey(e, i)} title={s.hint}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${situation === s.id ? 'bg-accent text-white border-accent' : 'bg-surface-2/50 border-border text-text-secondary hover:bg-surface-2 hover:text-text'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-1.5">{SITUATIONS.find(s => s.id === situation)!.hint}</p>
            </div>
            <textarea value={chat} onChange={e => setChat(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !streaming) { e.preventDefault(); draft() } }}
              aria-label="Client chat to draft a reply for"
              placeholder="Paste the client chat here — the whole thread, most recent message last…"
              className="w-full h-40 md:h-56 px-3 py-2 text-sm rounded-xl border border-border bg-surface-2/40 resize-y focus:outline-none focus:ring-2 focus:ring-accent/40" />
            {!chat && !streaming && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-text-muted">Try an example:</span>
                {EXAMPLES.map((ex, i) => (
                  <button key={i} onClick={() => { setChat(ex.text); setSituation(ex.situation) }}
                    className="px-2.5 py-1.5 min-h-[28px] text-xs rounded-md border border-border-subtle bg-surface-2/40 text-text-secondary hover:border-accent/30 hover:text-text transition-colors">
                    {ex.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {!streaming ? (
                <button onClick={draft} className="btn-primary btn-md w-full sm:w-auto flex items-center justify-center gap-1.5" title="Draft (⌘/Ctrl + Enter)">
                  <Send className="w-3.5 h-3.5" /> Draft reply with Sway <kbd className="ml-1 text-[10px] font-mono opacity-70 hidden md:inline">⌘↵</kbd>
                </button>
              ) : (
                <button onClick={stop} className="btn-secondary btn-md w-full sm:w-auto flex items-center justify-center gap-1.5"><Square className="w-3.5 h-3.5" /> Stop</button>
              )}
              {(chat || reply) && !streaming && (<button onClick={clearComposer} className="btn-ghost btn-md text-text-muted">Clear</button>)}
              <span className="ml-auto text-xs text-text-muted">{chat.length.toLocaleString()} chars</span>
            </div>
          </div>

          {/* Reply */}
          <div ref={replyRef} className="card p-4 flex flex-col gap-3 min-h-[20rem]">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Handshake className="w-4 h-4 text-accent" aria-hidden="true" /> Sway's reply</h2>
              {reply && !streaming && (
                <button onClick={copyReply} className="btn-ghost btn-sm flex items-center gap-1.5">
                  {copied ? <Check className="w-3.5 h-3.5 text-green" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
            {reply ? (
              <div className="text-sm text-text whitespace-pre-wrap leading-relaxed flex-1">{reply}{streaming && <span className="inline-block w-1.5 h-4 bg-accent/70 ml-0.5 animate-pulse align-middle" />}{stopped && !streaming && <span className="ml-1.5 text-[11px] text-text-muted italic not-italic">(stopped early)</span>}</div>
            ) : streaming ? (
              <div className="flex-1 flex items-center justify-center text-sm text-text-muted"><span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin mr-2" /> Sway is drafting…</div>
            ) : (
              <EmptyState card icon={Handshake} title="No reply yet" description="Paste a client chat, pick the situation, and Sway drafts the next high-converting message." />
            )}
            {flags.length > 0 && (
              <div className="rounded-lg border border-amber/30 bg-amber/5 p-2.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber"><AlertTriangle className="w-3.5 h-3.5" /> Honesty check — review before sending</div>
                {flags.map((f, i) => <div key={i} className="text-xs text-text-secondary pl-5">{f}</div>)}
              </div>
            )}
            {/* Auto-score — scorecard */}
            {(scoring || score) && (
              <div className={`rounded-lg border p-3 ${score ? (score.pass ? 'border-green/30 bg-green/5' : 'border-red/30 bg-red/5') : 'border-border-subtle bg-surface-2/30'}`}>
                {scoring ? (
                  <div className="flex items-center gap-2 text-xs text-text-muted"><span className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" /> Auto-scoring vs the golden case…</div>
                ) : score && (<>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted"><BarChart3 className="w-3.5 h-3.5 text-accent" /> Quality score</div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-semibold tabular-nums leading-none">{pct(score.overall)}</span>
                      <span className={`pill ${statusPill(score.pass ? 'success' : 'error')}`}>{score.pass ? 'PASS' : 'FAIL'}</span>
                    </div>
                  </div>
                  {(() => {
                    const crit = Object.entries(score.scores ?? {}).filter(([d, v]) => (d === 'safety' || d === 'correctness') && v < 0.5).map(([d]) => DIM_LABEL[d] || d)
                    const forced = !score.pass && score.overall >= 0.7 && crit.length > 0
                    return <div className="text-[11px] text-text-muted mt-1">Pass ≥ 70%{forced ? ` · Auto-failed: ${crit.join(', ')} < 50%` : ''}</div>
                  })()}
                  <div className="mt-2.5 space-y-1.5">
                    {Object.entries(score.scores ?? {}).map(([dim, v]) => (
                      <div key={dim} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-[11px] text-text-secondary">{DIM_LABEL[dim] || dim}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden"
                          role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}
                          aria-label={`${DIM_LABEL[dim] || dim} ${pct(v)}${v < 0.5 ? ' — below threshold' : ''}`}>
                          <div className={`h-full rounded-full ${dimBar(v)}`} style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
                        </div>
                        <span className={`w-12 shrink-0 flex items-center justify-end gap-0.5 text-[11px] font-medium tabular-nums ${dimText(v)}`}>
                          {v < 0.5 && <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />}{pct(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {(score.failures?.length ?? 0) > 0 && <div className="text-[11px] text-red mt-2 pt-2 border-t border-red/15">{score.failures?.join(' · ')}</div>}
                  {score.reasoning && (
                    <details className="mt-2 pt-2 border-t border-border-subtle">
                      <summary className="text-[11px] text-text-muted cursor-pointer hover:text-text">Why this score</summary>
                      <p className="text-[11px] text-text-secondary leading-relaxed mt-1 whitespace-pre-wrap">{score.reasoning}</p>
                    </details>
                  )}
                </>)}
              </div>
            )}
            {reply && !streaming && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-subtle">
                <span className="text-[11px] text-text-muted">{loggedOutcome ? 'Outcome:' : 'Log this deal:'}</span>
                {(['WON', 'LOST', 'OPEN'] as const).map(o => {
                  const active = loggedOutcome === o
                  return (
                    <button key={o} disabled={savingOutcome} onClick={() => logOutcome(o)} aria-pressed={active}
                      className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors disabled:opacity-50 ${
                        active
                          ? (o === 'WON' ? 'bg-green-muted text-green border-green/40 font-medium' : o === 'LOST' ? 'bg-red-muted text-red border-red/40 font-medium' : 'bg-accent-muted text-accent border-accent/40 font-medium')
                          : (o === 'WON' ? 'border-green/40 text-green hover:bg-green-muted' : o === 'LOST' ? 'border-red/40 text-red hover:bg-red-muted' : 'border-border text-text-secondary hover:bg-surface-2')
                      }`}>
                      {o === 'WON' ? 'Won' : o === 'LOST' ? 'Lost' : 'Open'}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {recents.length > 0 && (
          <div className="card p-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><History className="w-4 h-4 text-accent" aria-hidden="true" /> Recent drafts {recents.length > 0 && <span className="pill bg-surface-2 text-text-secondary border border-border-subtle">{recents.length}</span>}</h2>
              <button onClick={clearRecents} className="btn-ghost btn-sm text-text-muted">Clear</button>
            </div>
            <div className="space-y-1.5">
              {recents.map(d => (
                <div key={d.id} className="flex items-stretch gap-1 rounded-lg border border-border-subtle bg-surface-2/30 hover:border-accent/30 hover:bg-surface-2/60 transition-colors">
                  <button onClick={() => loadRecent(d)} className="flex-1 min-w-0 text-left px-3 py-2">
                    <div className="flex items-center gap-2 text-xs"><span className="font-medium text-text">{(SITUATIONS.find(s => s.id === d.situation)?.label ?? d.situation) || 'Draft'}</span><span className="text-text-muted">· {new Date(d.at).toLocaleDateString()}</span></div>
                    <div className="text-xs text-text-muted truncate mt-0.5">{d.reply.slice(0, 120)}</div>
                  </button>
                  <button onClick={() => deleteOneDraft(d.id)} aria-label="Delete draft" className="px-2 text-text-muted hover:text-red shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </>)}

      {tab === 'deals' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Won" value={winLoss.won} color="text-green" />
            <MetricCard label="Lost" value={winLoss.lost} color="text-red" />
            <MetricCard label="Open" value={winLoss.open} color="text-accent" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">Track which conversations closed — Won / Lost feeds Sway's learning loop.</span>
            <button onClick={() => setShowNewDeal(v => !v)} className="btn-secondary btn-sm flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> New deal</button>
          </div>
          {showNewDeal && (
            <div className="card p-3 flex flex-wrap items-center gap-2">
              <input value={newDealTitle} onChange={e => setNewDealTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createNewDeal() }}
                aria-label="New deal title" placeholder="Deal title (e.g. Acme — Shopify rebuild)" className="input flex-1 min-w-[12rem]" />
              <button onClick={createNewDeal} disabled={savingNewDeal} className="btn-primary btn-sm">{savingNewDeal ? 'Creating…' : 'Create'}</button>
              <button onClick={() => { setShowNewDeal(false); setNewDealTitle('') }} className="btn-ghost btn-sm text-text-muted">Cancel</button>
            </div>
          )}
          <DataState
            loading={dealsLoading} error={dealsError} isEmpty={deals.length === 0} onRetry={refetchDeals}
            empty={<EmptyState card icon={FolderKanban} title="No deals yet" description="Log a deal from a draft (the Won / Lost buttons under Sway's reply) or create one here to start tracking your pipeline." action={{ label: 'New deal', onClick: () => setShowNewDeal(true) }} />}
          >
            <div className="card divide-y divide-border-subtle">
              {deals.map(d => (
                <div key={d.slug} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text truncate">{d.title}</div>
                    <div className="text-xs text-text-muted">{[d.niche, d.stage].filter(Boolean).join(' · ') || d.slug}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(['WON', 'LOST', 'OPEN'] as const).map(o => {
                      const active = d.outcome === o
                      return (
                        <button key={o} onClick={() => setOutcome(d.slug, o)} aria-pressed={active}
                          className={`px-2 py-0.5 text-[11px] rounded-md border transition-colors ${active ? (o === 'WON' ? 'bg-green-muted text-green border-green/40' : o === 'LOST' ? 'bg-red-muted text-red border-red/40' : 'bg-accent-muted text-accent border-accent/40') : 'border-border-subtle text-text-muted hover:text-text hover:border-border'}`}>
                          {o === 'WON' ? 'Won' : o === 'LOST' ? 'Lost' : 'Open'}
                        </button>
                      )
                    })}
                    <button onClick={() => deleteOneDeal(d.slug)} aria-label="Delete deal" className="ml-1 p-1 text-text-muted hover:text-red transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </DataState>
        </div>
      )}

      {tab === 'corpus' && (
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold mb-2"><Inbox className="w-4 h-4 text-accent" aria-hidden="true" /> Ingest a finished chat</h2>
            <p className="text-xs text-text-muted mb-2">Paste a won/lost client chat. It's saved to the corpus — then run <code className="text-accent">/sway-ingest &lt;file&gt;</code> to extract + capture the lessons.</p>
            <textarea value={ingestText} onChange={e => setIngestText(e.target.value)} aria-label="Finished client chat to ingest into the corpus" placeholder="Paste the finished client chat…" className="w-full h-32 px-3 py-2 text-sm rounded-xl border border-border bg-surface-2/40 resize-y focus:outline-none focus:ring-2 focus:ring-accent/40" />
            <div className="mt-2"><button onClick={doIngest} disabled={ingesting} className="btn-primary btn-sm">{ingesting ? 'Saving…' : 'Save to corpus'}</button></div>
          </div>
          <DataState
            loading={corpusLoading} error={corpusError} isEmpty={corpus.length === 0} onRetry={refetchCorpus}
            empty={<EmptyState card icon={Inbox} title="No ingested chats yet" description="Finished chats you save here become Sway's learning corpus." />}
          >
            <div className="card divide-y divide-border-subtle">
              {corpus.map(c => (
                <div key={c.file} className="p-3 flex items-center gap-3 text-sm">
                  <span className="flex-1 min-w-0 text-text truncate">{c.file}</span>
                  <span className="text-xs text-text-muted shrink-0">{new Date(c.addedAt).toLocaleDateString()}</span>
                  <button onClick={() => deleteOneCorpus(c.file)} aria-label="Delete corpus file" className="p-1 text-text-muted hover:text-red transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </DataState>
        </div>
      )}

      {tab === 'scores' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Pass rate" value={passRate === null ? '—' : `${passRate}%`} color="text-accent" />
            <MetricCard label="Avg score" value={avgScore} color="text-text" />
            <MetricCard label="Replies scored" value={displaySet.length} color="text-text" />
          </div>
          <p className="text-[11px] text-text-muted -mt-1">Pass ≥ 70% overall · Safety or Correctness below 50% auto-fails regardless of the overall score.</p>
          {scores.length > 0 && (
            <FilterBar
              search={{ value: scoreSearch, onChange: setScoreSearch, placeholder: 'Search situation or reply…' }}
              filters={[{ label: 'Result', value: scoreFilter, onChange: (v) => setScoreFilter(v as 'all' | 'pass' | 'fail'), options: [{ label: 'All', value: 'all' }, { label: 'Pass', value: 'pass' }, { label: 'Fail', value: 'fail' }] }]}
            />
          )}
          <DataState
            loading={scoresLoading} error={scoresError} isEmpty={scores.length === 0} onRetry={refetchScores}
            empty={<EmptyState card icon={Trophy} title="No scores yet" description="Every reply you draft is auto-scored against its sales golden case — they'll show up here." action={{ label: 'Draft a reply', onClick: () => setTab('draft') }} />}
          >
            {filteredScores.length === 0 ? (
              <EmptyState card icon={Trophy} title="No matches" description="No scores match this filter." />
            ) : (
              <div className="card divide-y divide-border-subtle">
                {filteredScores.map((s) => {
                  const key = `${s.at}-${s.case}`
                  const open = expandedScore === key
                  const hasDetail = !!(s.reply || s.reasoning || (s.scores && Object.keys(s.scores).length))
                  return (
                    <div key={key}>
                      <button onClick={() => hasDetail && setExpandedScore(open ? null : key)}
                        aria-expanded={hasDetail ? open : undefined}
                        className={`w-full text-left p-3 flex items-center gap-3 text-sm ${hasDetail ? 'hover:bg-surface-2/40 cursor-pointer' : 'cursor-default'}`}>
                        <span className={`pill ${statusPill(s.pass ? 'success' : 'error')}`}>{s.pass ? 'PASS' : 'FAIL'}</span>
                        <span className="flex-1 min-w-0 truncate text-text-secondary">{CASE_LABEL[s.case] || s.case}</span>
                        <span className="font-medium text-text tabular-nums">{pct(s.overall)}</span>
                        <span className="text-xs text-text-muted hidden sm:inline">{new Date(s.at).toLocaleDateString()}</span>
                        {hasDetail && <ChevronDown className={`w-3.5 h-3.5 text-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />}
                      </button>
                      {open && hasDetail && (
                        <div className="px-3 pb-3 space-y-2 bg-surface-2/20">
                          {s.scores && Object.keys(s.scores).length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              {Object.entries(s.scores).map(([dim, v]) => (
                                <div key={dim} className="flex items-center gap-2">
                                  <span className="w-20 shrink-0 text-[11px] text-text-secondary">{DIM_LABEL[dim] || dim}</span>
                                  <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${DIM_LABEL[dim] || dim} ${pct(v)}`}>
                                    <div className={`h-full rounded-full ${dimBar(v)}`} style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
                                  </div>
                                  <span className={`w-9 shrink-0 text-right text-[11px] font-medium tabular-nums ${dimText(v)}`}>{pct(v)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {s.failures && s.failures.length > 0 && <div className="text-[11px] text-red">{s.failures.join(' · ')}</div>}
                          {s.reasoning && <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap">{s.reasoning}</p>}
                          {s.reply && (
                            <div className="rounded-lg border border-border-subtle bg-surface p-2.5">
                              <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">Reply</div>
                              <div className="text-xs text-text whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{s.reply}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </DataState>
        </div>
      )}
      </div>
    </PageShell>
  )
}
