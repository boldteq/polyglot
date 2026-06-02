import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { clientLogger, captureConsole } from './lib/clientLogger'

// Patch console.error/console.warn so every stray browser log shows in the
// Logs page. Originals still fire — devtools unchanged. Recursion-safe.
captureConsole()

// Capture unhandled JS errors
window.addEventListener('error', (e) => {
  clientLogger.error(e.message || 'Unknown JS error', {
    category: 'runtime',
    meta: { filename: e.filename, lineno: e.lineno, colno: e.colno, stack: e.error?.stack },
  })
})

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason
  clientLogger.error(reason instanceof Error ? reason : String(reason ?? 'Unhandled Promise rejection'), {
    category: 'runtime',
    meta: { type: 'unhandledrejection' },
  })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
