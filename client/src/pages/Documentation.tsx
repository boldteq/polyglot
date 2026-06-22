import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  BookOpen, Copy, Check, ChevronRight, Hash, Terminal,
  Info, Lightbulb, AlertTriangle, ArrowRight, Search, X,
} from 'lucide-react'
import { writeToClipboard } from '../lib/clipboard'

interface DocMeta {
  slug: string
  filename: string
  title: string
  description: string
}

interface DocSearchMatch { heading: string; anchor: string; snippet: string }
interface DocSearchResult { slug: string; title: string; hitCount: number; matches: DocSearchMatch[] }

// ─── Markdown Tokenizer ───────────────────────────────────────────────────────

type HeadingToken = { type: 'h1' | 'h2' | 'h3' | 'h4'; id: string; text: string }

type Token =
  | HeadingToken
  | { type: 'hr' }
  | { type: 'code'; lang: string; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'ul'; items: string[]; depth: number }
  | { type: 'ol'; items: string[]; start: number }
  | { type: 'paragraph'; text: string }
  | { type: 'callout'; variant: 'info' | 'tip' | 'caution'; text: string }
  | { type: 'step'; number: number; title: string }
  | { type: 'blank' }

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
}

function tokenize(md: string): Token[] {
  const tokens: Token[] = []
  const lines = md.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Blank
    if (line.trim() === '') { i++; continue }

    // Headings
    const hm = line.match(/^(#{1,4})\s+(.+)$/)
    if (hm) {
      const level = hm[1].length
      const rawText = hm[2].replace(/\s+#+\s*$/, '')
      const type = (['h1', 'h2', 'h3', 'h4'] as const)[level - 1]

      // Detect step pattern: "### Step 1: Title" or "### 1. Title"
      const stepMatch = rawText.match(/^(?:Step\s+)?(\d+)[.:]\s*(.+)$/i)
      if (level >= 3 && stepMatch) {
        tokens.push({ type: 'step', number: parseInt(stepMatch[1], 10), title: stepMatch[2] })
        i++; continue
      }

      tokens.push({ type, id: slugify(rawText), text: rawText })
      i++; continue
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}\s*$/)) {
      tokens.push({ type: 'hr' })
      i++; continue
    }

    // Blockquote / callout (> **Info:** text, > **Tip:** text, > **Caution:** text)
    if (line.match(/^>\s/)) {
      const blockLines: string[] = []
      while (i < lines.length && (lines[i].match(/^>\s/) || lines[i].match(/^>$/))) {
        blockLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const fullText = blockLines.join('\n').trim()
      // Detect callout variant
      const calloutMatch = fullText.match(/^\*\*(Info|Tip|Caution|Warning|Note)[:.]?\*\*\s*([\s\S]*)$/i)
      if (calloutMatch) {
        const label = calloutMatch[1].toLowerCase()
        const variant = (label === 'tip' ? 'tip' : label === 'caution' || label === 'warning' ? 'caution' : 'info') as 'info' | 'tip' | 'caution'
        tokens.push({ type: 'callout', variant, text: calloutMatch[2].trim() })
      } else {
        tokens.push({ type: 'callout', variant: 'info', text: fullText })
      }
      continue
    }

    // Fenced code block
    if (line.match(/^```/)) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      tokens.push({ type: 'code', lang, text: codeLines.join('\n') })
      continue
    }

    // Table
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      if (tableLines.length >= 2) {
        const parseRow = (r: string) =>
          r.split('|').slice(1, -1).map(c => c.trim()).filter((_, idx, arr) => idx < arr.length)
        const headers = parseRow(tableLines[0])
        const rows: string[][] = []
        for (let j = 2; j < tableLines.length; j++) {
          rows.push(parseRow(tableLines[j]))
        }
        tokens.push({ type: 'table', headers, rows })
      }
      continue
    }

    // Unordered list
    if (line.match(/^(\s*)[-*+]\s/)) {
      const items: string[] = []
      const depth = line.match(/^(\s*)/)?.[1].length ?? 0
      while (i < lines.length && lines[i].match(/^(\s*)[-*+]\s/)) {
        items.push(lines[i].replace(/^(\s*)[-*+]\s/, ''))
        i++
      }
      tokens.push({ type: 'ul', items, depth })
      continue
    }

    // Ordered list
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = []
      const start = parseInt(line.match(/^(\d+)/)?.[1] ?? '1', 10)
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      tokens.push({ type: 'ol', items, start })
      continue
    }

    // Paragraph
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,4}\s/) &&
      !lines[i].match(/^```/) &&
      !lines[i].trimStart().startsWith('|') &&
      !lines[i].match(/^(\s*)[-*+]\s/) &&
      !lines[i].match(/^\d+\.\s/) &&
      !lines[i].match(/^[-*_]{3,}\s*$/) &&
      !lines[i].match(/^>\s/)
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      tokens.push({ type: 'paragraph', text: paraLines.join('\n') })
    }
  }

  return tokens
}

// ─── Inline Renderer ─────────────────────────────────────────────────────────

function InlineText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let i = 0
  let buf = ''
  let key = 0

  const flush = () => {
    if (buf) { parts.push(buf); buf = '' }
  }

  while (i < text.length) {
    // Bold **text**
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        flush()
        parts.push(<strong key={key++} className="font-semibold text-text">{text.slice(i + 2, end)}</strong>)
        i = end + 2; continue
      }
    }
    // Italic *text*
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1) {
        flush()
        parts.push(<em key={key++} className="italic text-text-secondary">{text.slice(i + 1, end)}</em>)
        i = end + 1; continue
      }
    }
    // Inline code `code`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        flush()
        parts.push(
          <code key={key++} className="font-mono text-[0.85em] text-accent bg-accent/8 px-1.5 py-0.5 rounded-md border border-accent/15">
            {text.slice(i + 1, end)}
          </code>
        )
        i = end + 1; continue
      }
    }
    // Link [text](url)
    if (text[i] === '[') {
      const cb = text.indexOf(']', i)
      if (cb !== -1 && text[cb + 1] === '(') {
        const cp = text.indexOf(')', cb + 2)
        if (cp !== -1) {
          flush()
          const linkText = text.slice(i + 1, cb)
          const url = text.slice(cb + 2, cp)
          const isExternal = url.startsWith('http')
          parts.push(
            <a key={key++} href={url} className="text-accent hover:text-accent-hover font-medium underline decoration-accent/30 underline-offset-2 hover:decoration-accent/60 transition-colors"
              target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined}>
              {linkText}
            </a>
          )
          i = cp + 1; continue
        }
      }
    }
    buf += text[i]
    i++
  }
  flush()
  return <>{parts}</>
}

// ─── Code Block ──────────────────────────────────────────────────────────────

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!(await writeToClipboard(text))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="my-6 rounded-xl border border-border bg-surface shadow-soft overflow-hidden group">
      <div className="flex items-center justify-between pl-3.5 pr-2 h-9 bg-surface-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[11px] font-mono text-text-muted tracking-wide">
            {lang || 'code'}
          </span>
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] font-medium text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
          aria-label={copied ? 'Copied to clipboard' : 'Copy code'}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto bg-surface text-[13px] font-mono text-text-secondary leading-[1.7]">
        <code>{text}</code>
      </pre>
    </div>
  )
}

// ─── Callout Box ─────────────────────────────────────────────────────────────

function Callout({ variant, text }: { variant: 'info' | 'tip' | 'caution'; text: string }) {
  const config = {
    info: {
      icon: Info,
      label: 'Note',
      border: 'border-accent/20',
      bg: 'bg-accent/[0.05]',
      accent: 'before:bg-accent',
      chip: 'bg-accent/10 text-accent',
      labelColor: 'text-accent',
    },
    tip: {
      icon: Lightbulb,
      label: 'Tip',
      border: 'border-green/20',
      bg: 'bg-green/[0.05]',
      accent: 'before:bg-green',
      chip: 'bg-green/10 text-green',
      labelColor: 'text-green',
    },
    caution: {
      icon: AlertTriangle,
      label: 'Caution',
      border: 'border-amber/20',
      bg: 'bg-amber/[0.05]',
      accent: 'before:bg-amber',
      chip: 'bg-amber/10 text-amber',
      labelColor: 'text-amber',
    },
  }[variant]

  const Icon = config.icon

  return (
    <div
      className={`relative my-6 rounded-xl border ${config.border} ${config.bg} pl-5 pr-4 py-3.5 overflow-hidden
        before:absolute before:inset-y-0 before:left-0 before:w-1 ${config.accent}`}
    >
      <div className="flex gap-3">
        <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${config.chip}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className={`text-[12px] font-semibold mb-1 ${config.labelColor}`}>{config.label}</p>
          <div className="text-[14px] text-text-secondary leading-[1.65]">
            <InlineText text={text} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepIndicator({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-3.5 mt-9 mb-3 scroll-mt-20" id={slugify(`step-${number}-${title}`)}>
      <div className="w-8 h-8 rounded-full bg-accent/10 text-accent text-[13px] font-bold flex items-center justify-center shrink-0 ring-1 ring-accent/20">
        {number}
      </div>
      <h3 className="text-lg font-semibold text-text tracking-tight">
        <InlineText text={title} />
      </h3>
    </div>
  )
}

// ─── Token Renderer ───────────────────────────────────────────────────────────

function RenderTokens({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((token, idx) => {
        switch (token.type) {
          case 'h1':
            return (
              <h1 key={idx} id={token.id} className="text-[28px] font-bold text-text mt-2 mb-3 tracking-tight scroll-mt-20">
                <InlineText text={token.text} />
              </h1>
            )
          case 'h2':
            return (
              <h2 key={idx} id={token.id} className="text-[21px] font-semibold text-text mt-12 mb-4 pb-2.5 border-b border-border-subtle tracking-tight scroll-mt-20">
                <InlineText text={token.text} />
              </h2>
            )
          case 'h3':
            return (
              <h3 key={idx} id={token.id} className="text-[17px] font-semibold text-text mt-8 mb-2.5 tracking-tight scroll-mt-20">
                <InlineText text={token.text} />
              </h3>
            )
          case 'h4':
            return (
              <h4 key={idx} id={token.id} className="text-[14px] font-semibold text-text-secondary mt-6 mb-2 scroll-mt-20">
                <InlineText text={token.text} />
              </h4>
            )
          case 'hr':
            return <hr key={idx} className="my-10 border-border-subtle" />
          case 'code':
            return <CodeBlock key={idx} lang={token.lang} text={token.text} />
          case 'callout':
            return <Callout key={idx} variant={token.variant} text={token.text} />
          case 'step':
            return <StepIndicator key={idx} number={token.number} title={token.title} />
          case 'table':
            return (
              <div key={idx} className="my-6 rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-2 border-b border-border-subtle">
                        {token.headers.map((h, hi) => (
                          <th key={hi} className="px-4 py-2.5 text-left text-[11px] font-semibold text-text-muted">
                            <InlineText text={h} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {token.rows.map((row, ri) => (
                        <tr key={ri} className="border-b border-border-subtle last:border-0 hover:bg-surface-2/60 transition-colors">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-4 py-2.5 text-[13px] text-text-secondary leading-relaxed align-top">
                              <InlineText text={cell} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          case 'ul':
            return (
              <ul key={idx} className="my-4 space-y-2">
                {token.items.map((item, ii) => (
                  <li key={ii} className="flex items-start gap-3 text-[15px] text-text-secondary leading-[1.7]">
                    <span className="mt-[0.6em] w-1.5 h-1.5 rounded-full bg-accent/50 shrink-0" />
                    <span className="flex-1"><InlineText text={item} /></span>
                  </li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={idx} className="my-4 space-y-2.5">
                {token.items.map((item, ii) => (
                  <li key={ii} className="flex items-start gap-3 text-[15px] text-text-secondary leading-[1.7]">
                    <span className="mt-px w-[22px] h-[22px] rounded-md bg-accent/8 text-accent text-[11px] font-bold flex items-center justify-center shrink-0 ring-1 ring-accent/15">
                      {token.start + ii}
                    </span>
                    <span className="flex-1 pt-px"><InlineText text={item} /></span>
                  </li>
                ))}
              </ol>
            )
          case 'paragraph':
            return (
              <p key={idx} className="my-4 text-[15px] text-text-secondary leading-[1.75]">
                <InlineText text={token.text} />
              </p>
            )
          default:
            return null
        }
      })}
    </>
  )
}

// ─── Table of Contents ────────────────────────────────────────────────────────

function TableOfContents({ tokens, activeId }: { tokens: Token[]; activeId: string }) {
  const headings = tokens.filter(t =>
    t.type === 'h2' || t.type === 'h3' || t.type === 'step'
  )

  if (headings.length === 0) return null

  return (
    <nav className="border-l border-border-subtle">
      {headings.map((h, i) => {
        if (h.type === 'step') {
          const id = slugify(`step-${h.number}-${h.title}`)
          const active = id === activeId
          return (
            <a
              key={i}
              href={`#${id}`}
              aria-current={active ? 'location' : undefined}
              className={`flex items-center gap-2 py-1.5 pl-4 -ml-px border-l transition-colors truncate ${
                active
                  ? 'border-accent text-accent font-medium'
                  : 'border-transparent text-text-muted hover:text-accent hover:border-accent'
              }`}
            >
              <span className="truncate">{h.title}</span>
            </a>
          )
        }
        const heading = h as HeadingToken
        const active = heading.id === activeId
        return (
          <a
            key={i}
            href={`#${heading.id}`}
            aria-current={active ? 'location' : undefined}
            className={`block py-1.5 -ml-px border-l transition-colors truncate ${
              heading.type === 'h3' ? 'pl-7 text-[12px]' : 'pl-4 text-[12px]'
            } ${
              active
                ? 'border-accent text-accent font-medium'
                : `border-transparent hover:border-accent hover:text-accent ${
                    heading.type === 'h3' ? 'text-text-muted' : 'font-medium text-text-secondary'
                  }`
            }`}
          >
            {heading.text}
          </a>
        )
      })}
    </nav>
  )
}

// ─── Doc sidebar labels ──────────────────────────────────────────────────────

const DOC_META: Record<string, { emoji: string; short: string; section: string }> = {
  '00-overview':       { emoji: '📌', short: 'Overview',            section: 'Getting Started' },
  '01-setup':          { emoji: '⚙️', short: 'Setup & Install',    section: 'Getting Started' },
  '02-agents':         { emoji: '🤖', short: 'Agents',             section: 'Core Concepts' },
  '03-sdk':            { emoji: '📦', short: 'SDK Reference',      section: 'Core Concepts' },
  '04-slash-commands': { emoji: '⌨️', short: 'Slash Commands',     section: 'Core Concepts' },
  '05-orchestration':  { emoji: '🔗', short: 'Orchestration',      section: 'Advanced' },
  '06-new-project':    { emoji: '🚀', short: 'Projects & Rules',   section: 'Advanced' },
  '07-troubleshooting':{ emoji: '🔧', short: 'Troubleshooting',    section: 'Reference' },
  '08-system-guide':   { emoji: '📖', short: 'System Guide',       section: 'Reference' },
  '09-faq':            { emoji: '❓', short: 'FAQ',                 section: 'Getting Started' },
  '10-start-here':     { emoji: '👋', short: 'Start Here',         section: '👋 Start Here' },
  '11-how-it-learns':  { emoji: '🧠', short: 'How It Learns',      section: '👋 Start Here' },
  '12-whats-new':      { emoji: '✨', short: "What's New",         section: '👋 Start Here' },
}

// Sidebar section order (the plain-English "Start Here" track first).
const SECTION_ORDER = ['👋 Start Here', 'Getting Started', 'Core Concepts', 'Advanced', 'Reference', 'Other']
const DEFAULT_DOC = '10-start-here'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Documentation() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [docs, setDocs] = useState<DocMeta[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [docsLoading, setDocsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DocSearchResult[]>([])

  useEffect(() => {
    fetch('/api/docs')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: DocMeta[]) => {
        setDocs(d)
        setDocsLoading(false)
        if (!slug && d.length > 0) {
          const start = d.find((x) => x.slug === DEFAULT_DOC)?.slug || d[0].slug
          navigate(`/docs/${start}`, { replace: true })
        }
      })
      .catch(() => setDocsLoading(false))
  }, [])

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    setContent('')
    fetch(`/api/docs/${slug}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: { content: string }) => {
        setContent(d.content || '')
        setLoading(false)
        // Scroll to top on doc change
        window.scrollTo(0, 0)
      })
      .catch(() => setLoading(false))
  }, [slug])

  // Debounced full-text search across all docs.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/docs/search?q=${encodeURIComponent(q)}`)
        .then(r => (r.ok ? r.json() : { results: [] }))
        .then((d: { results: DocSearchResult[] }) => setResults(d.results || []))
        .catch(() => setResults([]))
    }, 200)
    return () => clearTimeout(t)
  }, [query])
  const searching = query.trim().length >= 2

  const tokens = useMemo(() => (content ? tokenize(content) : []), [content])
  const [activeHeading, setActiveHeading] = useState('')

  // Ordered list of section anchors rendered in the reading column (h2/h3/step).
  const headingIds = useMemo(() => {
    const ids: string[] = []
    for (const t of tokens) {
      if (t.type === 'step') ids.push(slugify(`step-${t.number}-${t.title}`))
      else if (t.type === 'h2' || t.type === 'h3') ids.push(t.id)
    }
    return ids
  }, [tokens])

  // Scroll-spy: highlight the section nearest the top of the reading viewport.
  useEffect(() => {
    if (headingIds.length === 0) { setActiveHeading(''); return }
    const els = headingIds
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (els.length === 0) return

    const visible = new Set<string>()
    const pick = () => {
      // Prefer the topmost currently-visible heading; fall back to the last one above the fold.
      let chosen = els[0]?.id ?? ''
      for (const el of els) {
        if (visible.has(el.id)) { chosen = el.id; break }
        if (el.getBoundingClientRect().top < 120) chosen = el.id
      }
      setActiveHeading(chosen)
    }

    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id)
          else visible.delete(e.target.id)
        }
        pick()
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    )
    els.forEach(el => obs.observe(el))
    pick()
    return () => obs.disconnect()
  }, [headingIds])

  // After content renders, scroll to the #section if the URL has a hash (deep-link
  // from a search result). Runs on content OR hash change so same-doc jumps work too.
  useEffect(() => {
    if (!content) return
    const hash = decodeURIComponent(location.hash.replace(/^#/, ''))
    if (!hash) return
    const t = setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    return () => clearTimeout(t)
  }, [content, location.hash])

  const currentDoc = useMemo(() => {
    if (!slug) return null
    const meta = DOC_META[slug]
    const docMeta = docs.find(d => d.slug === slug)
    return {
      title: meta?.short || docMeta?.title || 'Documentation',
      section: meta?.section || 'Docs',
      emoji: meta?.emoji || '📄',
    }
  }, [slug, docs])

  // Group docs by section
  const sections = useMemo(() => {
    const groups: Record<string, DocMeta[]> = {}
    docs.forEach(d => {
      const section = DOC_META[d.slug]?.section || 'Other'
      if (!groups[section]) groups[section] = []
      groups[section].push(d)
    })
    return groups
  }, [docs])

  // Next/Prev navigation
  const currentIdx = docs.findIndex(d => d.slug === slug)
  const prevDoc = currentIdx > 0 ? docs[currentIdx - 1] : null
  const nextDoc = currentIdx < docs.length - 1 ? docs[currentIdx + 1] : null

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* ── Left sidebar ── */}
      <aside className="w-[260px] min-w-[260px] border-r border-sidebar-border flex flex-col overflow-hidden bg-sidebar">
        <div className="px-4 pt-4 pb-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-8 h-8 rounded-lg bg-accent/10 ring-1 ring-accent/15 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-text leading-tight">Documentation</p>
              <p className="text-[11px] text-text-muted leading-tight">{docs.length} guides</p>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
              placeholder="Search docs…"
              aria-label="Search documentation"
              className="input pl-8 pr-7 h-9 text-[13px]"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <nav aria-label="Documentation sidebar" className="flex-1 overflow-y-auto py-3">
          {docsLoading ? (
            <div className="px-3 space-y-1.5 mt-1">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-8 bg-surface-2 rounded-md animate-pulse" />
              ))}
            </div>
          ) : searching ? (
            results.length === 0 ? (
              <p className="px-4 py-4 text-[12px] text-text-muted">No matches for “{query.trim()}”</p>
            ) : (
              <div className="px-2 space-y-3">
                {results.map((doc) => (
                  <div key={doc.slug}>
                    <button
                      onClick={() => navigate(`/docs/${doc.slug}`)}
                      className="w-full text-left px-2 h-8 rounded-md text-[13px] font-semibold text-text hover:bg-sidebar-accent flex items-center gap-2 transition-colors"
                    >
                      <span className="shrink-0 w-4 text-center text-[13px]">{DOC_META[doc.slug]?.emoji || '📄'}</span>
                      <span className="truncate flex-1">{DOC_META[doc.slug]?.short || doc.title}</span>
                      <span className="text-[10px] font-medium text-text-muted bg-surface-2 px-1.5 py-0.5 rounded-full shrink-0">{doc.hitCount}</span>
                    </button>
                    <div className="mt-0.5 ml-3.5 border-l border-border-subtle">
                      {doc.matches.map((m, mi) => (
                        <button
                          key={mi}
                          onClick={() => navigate(`/docs/${doc.slug}${m.anchor ? '#' + m.anchor : ''}`)}
                          className="w-full text-left pl-3 pr-2 py-1 text-[11px] text-text-secondary hover:text-accent hover:bg-sidebar-accent rounded-md truncate transition-colors"
                          title={m.heading}
                        >
                          {m.snippet}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : Object.entries(sections)
            .sort((a, b) => ((SECTION_ORDER.indexOf(a[0]) + 1) || 999) - ((SECTION_ORDER.indexOf(b[0]) + 1) || 999))
            .map(([section, sectionDocs]) => (
            <div key={section} className="mb-4">
              <p className="px-4 mb-1 h-7 flex items-center text-xs font-medium text-text-muted select-none">
                {section}
              </p>
              <div className="space-y-0.5 px-2">
                {sectionDocs.map(doc => {
                  const meta = DOC_META[doc.slug]
                  const isActive = slug === doc.slug
                  return (
                    <button
                      key={doc.slug}
                      onClick={() => navigate(`/docs/${doc.slug}`)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full text-left px-2 h-8 rounded-md text-[13px] flex items-center gap-2.5 transition-colors ${
                        isActive
                          ? 'bg-gradient-to-r from-accent to-[var(--color-brand-dark)] text-white font-medium'
                          : 'text-text-secondary hover:text-text hover:bg-sidebar-accent'
                      }`}
                    >
                      <span className="shrink-0 w-4 text-center text-[13px]">
                        {meta?.emoji || '📄'}
                      </span>
                      <span className="truncate">{meta?.short || doc.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {/* Breadcrumb */}
          <div className="sticky top-0 z-10 bg-bg/80 backdrop-blur-md border-b border-border-subtle px-8 h-12 flex items-center">
            <div className="flex items-center gap-1.5 text-[12px] w-full max-w-3xl mx-auto">
              <span className="text-text-muted">Docs</span>
              {currentDoc && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted/50" />
                  <span className="text-text-muted">{currentDoc.section}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted/50" />
                  <span className="font-medium text-text truncate">{currentDoc.title}</span>
                </>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="max-w-3xl mx-auto px-8 py-8 pb-16">
            {loading ? (
              <div className="space-y-4 mt-4">
                <div className="h-9 bg-surface-2 rounded-xl w-2/3 animate-pulse" />
                <div className="h-4 bg-surface-2 rounded w-full animate-pulse mt-3" />
                <div className="h-4 bg-surface-2 rounded w-5/6 animate-pulse" />
                <div className="h-4 bg-surface-2 rounded w-4/5 animate-pulse" />
                <div className="h-40 bg-surface-2 rounded-xl w-full animate-pulse mt-6" />
              </div>
            ) : tokens.length > 0 ? (
              <>
                {/* Doc header — calm eyebrow above the doc's own H1 title (Stripe/Linear pattern) */}
                {currentDoc && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-accent mb-3">
                    <span className="text-[13px]">{currentDoc.emoji}</span>
                    <span>{currentDoc.section}</span>
                  </div>
                )}
                <RenderTokens tokens={tokens} />
              </>
            ) : !slug ? (
              <div className="text-center py-20">
                <BookOpen className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <p className="text-lg font-medium text-text mb-1">Polyglot Documentation</p>
                <p className="text-text-secondary text-sm">Select a guide from the sidebar to get started</p>
              </div>
            ) : null}

            {/* Next / Prev navigation */}
            {!loading && tokens.length > 0 && (prevDoc || nextDoc) && (
              <div className="mt-14 pt-6 border-t border-border-subtle">
                <div className="flex items-stretch gap-4">
                  {prevDoc ? (
                    <button
                      onClick={() => navigate(`/docs/${prevDoc.slug}`)}
                      className="flex-1 group text-left p-4 card card-hover hover:border-accent/40"
                    >
                      <p className="text-[11px] font-medium text-text-muted mb-1">Previous</p>
                      <p className="text-sm font-medium text-text group-hover:text-accent transition-colors">
                        {DOC_META[prevDoc.slug]?.emoji} {DOC_META[prevDoc.slug]?.short || prevDoc.title}
                      </p>
                    </button>
                  ) : <div className="flex-1" />}
                  {nextDoc && (
                    <button
                      onClick={() => navigate(`/docs/${nextDoc.slug}`)}
                      className="flex-1 group text-right p-4 card card-hover hover:border-accent/40"
                    >
                      <p className="text-[11px] font-medium text-text-muted mb-1">Next</p>
                      <p className="text-sm font-medium text-text group-hover:text-accent transition-colors flex items-center justify-end gap-2">
                        {DOC_META[nextDoc.slug]?.emoji} {DOC_META[nextDoc.slug]?.short || nextDoc.title}
                        <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
                      </p>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ── Right: Table of Contents ── */}
        {tokens.length > 0 && (
          <aside className="hidden xl:block w-[232px] min-w-[232px] border-l border-border-subtle overflow-y-auto">
            <div className="px-5 py-6 sticky top-0">
              <p className="text-xs font-medium text-text-muted mb-3 flex items-center gap-1.5">
                <Hash className="w-3 h-3" />
                On this page
              </p>
              <TableOfContents tokens={tokens} activeId={activeHeading} />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
