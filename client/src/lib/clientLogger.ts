// Frontend unified logger — every error/warn from the React app routes
// through here, gets deduped + batched, and is POSTed to /api/logs/client-error
// so the Logs page sees it. No third-party SDK; uses the existing endpoint.

type Severity = 'error' | 'warn' | 'info'
type Category =
  | 'render'   // React error boundary
  | 'api'      // fetch/request failure
  | 'sse'      // EventSource drop / parse failure
  | 'form'     // user-facing validation failure
  | 'runtime'  // window.error / unhandledrejection
  | 'console'  // captured console.error/warn
  | 'manual'   // explicit logger.* call

interface ClientLogPayload {
  severity: Severity
  category: Category
  message: string
  stack?: string
  meta?: Record<string, unknown>
  route?: string
  status?: number
}

const DEDUP_WINDOW_MS = 30_000
const FLUSH_INTERVAL_MS = 5_000
const MAX_QUEUE = 50

const recent = new Map<string, number>() // dedup key → ts
const queue: ClientLogPayload[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function dedupKey(p: ClientLogPayload): string {
  return `${p.severity}|${p.category}|${(p.message || '').slice(0, 120)}`
}

function enqueue(p: ClientLogPayload) {
  const key = dedupKey(p)
  const now = Date.now()
  const last = recent.get(key)
  if (last && now - last < DEDUP_WINDOW_MS) return
  recent.set(key, now)
  if (queue.length >= MAX_QUEUE) queue.shift()
  queue.push(p)
  scheduleFlush()
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS)
}

async function flush() {
  flushTimer = null
  const batch = queue.splice(0, queue.length)
  if (batch.length === 0) return
  // Send sequentially — endpoint is rate-limited write tier
  for (const p of batch) {
    try {
      await fetch('/api/logs/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: p.message,
          stack: p.stack,
          context: {
            category: p.category,
            severity: p.severity,
            route: p.route,
            status: p.status,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            location: typeof window !== 'undefined' ? window.location.pathname : undefined,
            ...(p.meta || {}),
          },
        }),
      })
    } catch {
      // network blip — drop on the floor (next event will retry implicit)
    }
  }
}

export const clientLogger = {
  error(messageOrError: string | Error, fields?: Omit<ClientLogPayload, 'severity' | 'message' | 'stack'>) {
    const msg = messageOrError instanceof Error ? messageOrError.message : String(messageOrError)
    const stack = messageOrError instanceof Error ? messageOrError.stack : undefined
    enqueue({ severity: 'error', category: fields?.category || 'manual', message: msg, stack, meta: fields?.meta, route: fields?.route, status: fields?.status })
  },
  warn(messageOrError: string | Error, fields?: Omit<ClientLogPayload, 'severity' | 'message' | 'stack'>) {
    const msg = messageOrError instanceof Error ? messageOrError.message : String(messageOrError)
    const stack = messageOrError instanceof Error ? messageOrError.stack : undefined
    enqueue({ severity: 'warn', category: fields?.category || 'manual', message: msg, stack, meta: fields?.meta, route: fields?.route, status: fields?.status })
  },
  info(message: string, fields?: Omit<ClientLogPayload, 'severity' | 'message' | 'stack'>) {
    enqueue({ severity: 'info', category: fields?.category || 'manual', message, meta: fields?.meta, route: fields?.route, status: fields?.status })
  },
  flush, // exposed for tests + onBeforeUnload
}

// Patch console.error + console.warn so stray browser-console logs surface
// in the Logs page. Originals still fire so devtools is unchanged. Guarded
// against recursion via a flag.
let _inEmit = false
const _origConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

export function captureConsole() {
  console.error = (...args: unknown[]) => {
    _origConsole.error(...args)
    if (_inEmit) return
    _inEmit = true
    try {
      enqueue({ severity: 'error', category: 'console', message: argsToMessage(args) })
    } finally { _inEmit = false }
  }
  console.warn = (...args: unknown[]) => {
    _origConsole.warn(...args)
    if (_inEmit) return
    _inEmit = true
    try {
      enqueue({ severity: 'warn', category: 'console', message: argsToMessage(args) })
    } finally { _inEmit = false }
  }
}

function argsToMessage(args: unknown[]): string {
  return args.map((a) => {
    if (a instanceof Error) return a.message
    if (typeof a === 'string') return a
    try { return JSON.stringify(a) } catch { return String(a) }
  }).join(' ')
}

// Flush on tab close so the last batch isn't lost
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { void flush() })
}
