import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { postClientError } from './lib/api'

// Capture unhandled JS errors and send to the server error log
window.addEventListener('error', (e) => {
  postClientError({
    message: e.message || 'Unknown JS error',
    stack: e.error?.stack,
    context: { filename: e.filename, lineno: e.lineno, colno: e.colno },
  }).catch(() => {})
})

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason ?? 'Unhandled Promise rejection')
  postClientError({
    message: msg,
    stack: e.reason instanceof Error ? e.reason.stack : undefined,
  }).catch(() => {})
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
