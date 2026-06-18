import { useEffect, useRef, useState } from 'react'
import { CheckCircle, AlertCircle, Undo2, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warn'

export interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
}

export interface ToastMessage {
  id: number
  type: ToastType
  message: string
  action?: ToastAction
  duration?: number
}

export interface ToastOptions {
  action?: ToastAction
  /** Override auto-dismiss duration (ms). Default 4000, action toasts default 6000. */
  duration?: number
}

let _nextId = 1
const _listeners: Array<(t: ToastMessage) => void> = []
const _recentMessages = new Map<string, number>() // message → timestamp for dedup
const DEDUP_WINDOW_MS = 1500
const MAX_TOASTS = 20

export function toast(type: ToastType, message: string, opts: ToastOptions = {}) {
  // Deduplicate identical messages within DEDUP_WINDOW_MS
  const dedupKey = `${type}:${message}`
  const lastSent = _recentMessages.get(dedupKey)
  if (lastSent && Date.now() - lastSent < DEDUP_WINDOW_MS) return _nextId
  _recentMessages.set(dedupKey, Date.now())
  // Clean old dedup entries to prevent memory growth
  if (_recentMessages.size > 200) {
    const cutoff = Date.now() - DEDUP_WINDOW_MS * 2
    for (const [k, v] of _recentMessages) { if (v < cutoff) _recentMessages.delete(k) }
  }
  const msg: ToastMessage = {
    id: _nextId++,
    type,
    message,
    action: opts.action,
    duration: Math.max(1000, opts.duration ?? (opts.action ? 6000 : 4000)),
  }
  _listeners.forEach(fn => fn(msg))
  return msg.id
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = (id: number) => {
    setToasts(prev => prev.filter(x => x.id !== id))
    const t = timersRef.current.get(id)
    if (t) clearTimeout(t)
    timersRef.current.delete(id)
  }

  useEffect(() => {
    const handler = (t: ToastMessage) => {
      setToasts(prev => {
        // Evict oldest toast when over limit
        const next = prev.length >= MAX_TOASTS ? prev.slice(-(MAX_TOASTS - 1)) : prev
        return [...next, t]
      })
      const timer = setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id))
        timersRef.current.delete(t.id)
      }, t.duration ?? 4000)
      timersRef.current.set(t.id, timer)
    }
    _listeners.push(handler)
    return () => {
      const idx = _listeners.indexOf(handler)
      if (idx >= 0) _listeners.splice(idx, 1)
      timersRef.current.forEach(clearTimeout)
      timersRef.current.clear()
    }
  }, [])

  const handleAction = async (t: ToastMessage) => {
    if (!t.action) return
    dismiss(t.id)
    try {
      await t.action.onClick()
    } catch (e) {
      // The action handler is responsible for its own error toast; log for diagnostics.
      console.error('[toast-action]', e instanceof Error ? e.message : e)
    }
  }

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-24 right-6 z-[100] flex flex-col gap-2 pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.type === 'success' || t.type === 'warn' ? 'status' : 'alert'}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-card text-sm font-medium pointer-events-auto transition-all ${
            t.type === 'success'
              ? 'bg-green-muted border border-green/30 text-green'
              : t.type === 'warn'
              ? 'bg-amber-muted border border-amber/30 text-amber'
              : 'bg-red-muted border border-red/30 text-red'
          }`}
        >
          {t.type === 'success'
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{t.message}</span>
          {t.action && (
            <button
              onClick={() => handleAction(t)}
              aria-label={t.action.label}
              className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-current/10 hover:bg-current/20 text-current font-semibold text-[12px] transition-colors"
            >
              <Undo2 className="w-3 h-3" />
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
