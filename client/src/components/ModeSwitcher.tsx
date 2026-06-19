import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, LayoutGrid, ChevronsUpDown, Check } from 'lucide-react'

// Top-left mode switcher. Flips the entire app shell between two modes:
//   • Polyglot  — agent management / observability (default, routes at /, /agents, ...)
//   • Workspace — client-project admin panel       (routes at /workspace/*)
// Each mode owns its own sidebar; this is the one control that moves between them.

type Mode = 'polyglot' | 'workspace'

const MODES: { id: Mode; label: string; icon: typeof Zap; to: string }[] = [
  { id: 'polyglot', label: 'Polyglot', icon: Zap, to: '/' },
  { id: 'workspace', label: 'Workspace', icon: LayoutGrid, to: '/workspace' },
]

export default function ModeSwitcher({ mode }: { mode: Mode }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = MODES.find((m) => m.id === mode) ?? MODES[0]
  const Icon = current.icon

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 group"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch mode"
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-soft ${mode === 'workspace' ? 'bg-violet-600' : 'bg-accent'}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-base font-bold tracking-tight flex items-center gap-1">
          {current.label}
          <ChevronsUpDown className="w-3.5 h-3.5 text-text-muted group-hover:text-text transition-colors" />
        </h1>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1.5 w-48 bg-surface border border-border rounded-xl shadow-lg py-1 z-[60]"
        >
          {MODES.map((m) => {
            const MIcon = m.icon
            return (
              <button
                key={m.id}
                role="menuitem"
                onClick={() => { setOpen(false); if (m.id !== mode) nav(m.to) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2 text-left transition-colors"
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${m.id === 'workspace' ? 'bg-violet-600' : 'bg-accent'}`}>
                  <MIcon className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="flex-1 font-medium">{m.label}</span>
                {m.id === mode && <Check className="w-4 h-4 text-accent" />}
              </button>
            )
          })}
          <div className="border-t border-border-subtle mt-1 pt-1 px-3 py-1.5">
            <p className="text-[10px] text-text-muted leading-snug">
              Polyglot manages agents. Workspace views client builds.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
