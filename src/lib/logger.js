'use strict';

// ── Polyglot unified logger ─────────────────────────────────────────────────
// Single entry point for every server-side log. Writes to error_log (SQLite)
// + stdout JSON. Cascade-safe: if SQLite write fails, db.insertErrorLog
// falls back to data/logger-fallback.log so nothing is ever silently lost.
//
// Usage:
//   const log = require('./lib/logger');
//   log.error(err, { category: 'http', route: '/api/x', requestId, agentId });
//   log.warn('slow query', { category: 'db', duration_ms: 312, meta: { sql } });
//   log.info('cron tick', { category: 'schedule' });
//   log.debug(...)   // dev-only; honors LOG_LEVEL_DEBUG=1
//
// Categories: 'http' | 'db' | 'schedule' | 'agent-run' | 'integration' |
//             'render' | 'sse' | 'validation' | 'startup' | 'backup' |
//             'console' | 'api' | 'orchestration' | 'security'

const db = require('../db');

const LOG_LEVEL_INFO  = process.env.LOG_LEVEL_INFO  === '1';
const LOG_LEVEL_DEBUG = process.env.LOG_LEVEL_DEBUG === '1' || process.env.NODE_ENV !== 'production';

// Recursion guard for console capture — set while logger is emitting stdout
// so the patched console.error doesn't re-enter the logger.
let _inEmit = false;
const _origConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function emitStdout(level, payload) {
  _inEmit = true;
  try {
    const out = { ts: new Date().toISOString(), level, ...payload };
    const line = (() => { try { return JSON.stringify(out); } catch { return `[${level}] ${payload && payload.message}`; } })();
    if (level === 'error' || level === 'warn') _origConsole.error(line);
    else _origConsole.log(line);
  } finally {
    _inEmit = false;
  }
}

// Patch console.error + console.warn so every stray call flows into the
// error_log too. Guarded against recursion. Originals still fire so
// devtools / Docker logs are unchanged.
function captureConsole() {
  console.error = function patchedConsoleError(...args) {
    _origConsole.error(...args);
    if (_inEmit) return;
    try {
      write('error', argsToMessage(args), { category: 'console', source: 'server' });
    } catch { /* never throw from console */ }
  };
  console.warn = function patchedConsoleWarn(...args) {
    _origConsole.warn(...args);
    if (_inEmit) return;
    try {
      write('warn', argsToMessage(args), { category: 'console', source: 'server' });
    } catch { /* never throw from console */ }
  };
}

function argsToMessage(args) {
  return args.map(a => {
    if (a instanceof Error) return a.message;
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
}

function normalizeError(errOrMsg, fields) {
  if (errOrMsg instanceof Error) {
    return {
      message: errOrMsg.message || String(errOrMsg),
      stack: errOrMsg.stack,
    };
  }
  return { message: String(errOrMsg || (fields && fields.message) || 'Unknown'), stack: undefined };
}

function write(level, errOrMsg, fields = {}) {
  const { message, stack } = normalizeError(errOrMsg, fields);
  const row = {
    level,
    source: fields.source || 'server',
    message,
    stack: fields.stack || stack || null,
    context: fields.meta || fields.context || null,
    category: fields.category || null,
    agent_id: fields.agentId || fields.agent_id || null,
    request_id: fields.requestId || fields.request_id || null,
    route: fields.route || null,
    method: fields.method || null,
    status: fields.status === undefined ? null : fields.status,
    duration_ms: fields.durationMs === undefined ? (fields.duration_ms ?? null) : fields.durationMs,
    user_agent: fields.userAgent || fields.user_agent || null,
  };
  try { db.insertErrorLog(row); } catch (e) { console.error('[logger] insertErrorLog threw:', e.message); }
  emitStdout(level, row);
}

module.exports = {
  error(errOrMsg, fields) { write('error', errOrMsg, fields); },
  warn (errOrMsg, fields) { write('warn',  errOrMsg, fields); },
  info (msg, fields)      { if (LOG_LEVEL_INFO)  write('info',  msg, fields); },
  debug(msg, fields)      { if (LOG_LEVEL_DEBUG) write('debug', msg, fields); },
  captureConsole,
  // Direct passthrough for callers that already shaped the row
  raw(row) { try { db.insertErrorLog(row); } catch (e) { _origConsole.error('[logger] raw threw:', e.message); } },
};
