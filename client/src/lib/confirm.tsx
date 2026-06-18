import { useEffect, useState, type ReactNode } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'

// Global, imperative confirmation dialog — mirrors the toast() pattern so any
// destructive action can be gated with a single line:
//
//   if (await confirmDialog({ title: 'Delete schedule?', message: '…', danger: true, confirmLabel: 'Delete' })) {
//     doDelete()
//   }
//
// Returns a Promise<boolean> (true = confirmed, false = cancelled/dismissed).
// Reuses the styled <ConfirmDialog> so confirmations look identical everywhere
// instead of the inconsistent native window.confirm().

export interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** Require the user to type this exact string before confirming (extra-destructive ops). */
  typeNameToConfirm?: string
}

interface ConfirmRequest extends ConfirmOptions {
  id: number
  resolve: (ok: boolean) => void
}

let _nextId = 1
const _listeners: Array<(r: ConfirmRequest) => void> = []

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // Fallback: if the host isn't mounted (shouldn't happen — it's in App), fail
    // safe to the native confirm so an action is never silently un-gated.
    if (_listeners.length === 0) {
      const text = [opts.title, typeof opts.message === 'string' ? opts.message : '']
        .filter(Boolean).join('\n\n')
      resolve(window.confirm(text))
      return
    }
    const req: ConfirmRequest = { ...opts, id: _nextId++, resolve }
    _listeners.forEach((fn) => fn(req))
  })
}

/** Convenience for the most common case: a danger delete confirmation. */
export function confirmDelete(opts: Omit<ConfirmOptions, 'danger'> & { confirmLabel?: string }): Promise<boolean> {
  return confirmDialog({ danger: true, confirmLabel: 'Delete', ...opts })
}

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null)

  useEffect(() => {
    const handler = (r: ConfirmRequest) => {
      // Single dialog at a time — if one is already open, resolve it as cancelled
      // before showing the new request (prevents an orphaned pending promise).
      setReq((prev) => { prev?.resolve(false); return r })
    }
    _listeners.push(handler)
    return () => {
      const i = _listeners.indexOf(handler)
      if (i >= 0) _listeners.splice(i, 1)
    }
  }, [])

  const settle = (ok: boolean) => {
    setReq((cur) => { cur?.resolve(ok); return null })
  }

  return (
    <ConfirmDialog
      open={!!req}
      title={req?.title || ''}
      message={req?.message}
      confirmLabel={req?.confirmLabel || 'Confirm'}
      cancelLabel={req?.cancelLabel || 'Cancel'}
      danger={req?.danger}
      typeNameToConfirm={req?.typeNameToConfirm}
      onClose={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  )
}
