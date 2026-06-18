import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, X, Loader2 } from 'lucide-react'

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  /** Q74: Require user to type this exact string before confirming (for destructive ops) */
  typeNameToConfirm?: string
  children?: ReactNode
}

export default function ConfirmDialog({
  open, onClose, onConfirm, title, message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, loading = false, typeNameToConfirm, children,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const confirmInputId = useId()
  const [typedName, setTypedName] = useState('')
  const canConfirm = !typeNameToConfirm || typedName === typeNameToConfirm

  useEffect(() => {
    if (!open) { setTypedName(''); return }
    // Restore focus to whatever was focused before the dialog opened, on close.
    const prevFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const t = setTimeout(() => confirmRef.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'Enter' && !loading && canConfirm) {
        e.preventDefault()
        Promise.resolve(onConfirm()).catch(() => {})
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      prevFocused?.focus()
    }
  }, [open, onClose, onConfirm, loading, canConfirm])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md mx-4 rounded-2xl bg-surface border border-border shadow-pop"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-start gap-3">
            {danger && (
              <div className="w-8 h-8 rounded-full bg-red-muted ring-1 ring-red/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-red" />
              </div>
            )}
            <div>
              <h2 id={titleId} className="text-sm font-bold leading-tight">{title}</h2>
              {message && <p className="text-xs text-text-muted mt-1 leading-relaxed">{message}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded hover:bg-surface-2 text-text-muted shrink-0 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {(children || typeNameToConfirm) && (
          <div className="px-5 py-3 border-b border-border bg-surface-2/40 space-y-3">
            {children}
            {typeNameToConfirm && (
              <div>
                <label htmlFor={confirmInputId} className="block text-[11px] text-text-muted mb-1.5">
                  Type <span className="font-mono font-bold text-text">{typeNameToConfirm}</span> to confirm:
                </label>
                <input
                  id={confirmInputId}
                  autoFocus
                  value={typedName}
                  onChange={e => setTypedName(e.target.value)}
                  placeholder={typeNameToConfirm}
                  aria-invalid={typedName.length > 0 && !canConfirm}
                  className={`input font-mono ${typedName.length > 0 && !canConfirm ? 'border-red/50 focus:border-red/60' : ''}`}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-surface-2/30 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-surface border border-border text-text-muted hover:text-text disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={() => { if (canConfirm) Promise.resolve(onConfirm()).catch(() => {}) }}
            disabled={loading || !canConfirm}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
              danger ? 'bg-red hover:bg-red/90' : 'bg-accent hover:bg-accent/90'
            }`}
          >
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
