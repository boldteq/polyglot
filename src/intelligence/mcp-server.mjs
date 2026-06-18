#!/usr/bin/env node
// Boldteq Memory — MCP server (zero-dep stdio JSON-RPC 2.0).
// Exposes the agent "brain" as standard MCP tools so every agent + Claude Code can
// retrieve relevant company knowledge AND capture new lessons/bugs/decisions/golden-works.
// Register in ~/.claude/.mcp.json:
//   "boldteq-memory": { "command": "node", "args": ["<repo>/src/intelligence/mcp-server.mjs"] }
//
// Tools: memory_search · capture_lesson · capture_bug · capture_decision · capture_golden

import readline from 'node:readline'
import { retrieve, formatContext } from './retrieve.mjs'
import { captureItem } from './capture.mjs'

const NAME = 'boldteq-memory'
const VERSION = '1.0.0'
const PROTOCOL = '2024-11-05'

const TOOLS = [
  {
    name: 'memory_search',
    description: "Semantic search over Boldteq's entire knowledge brain (149K+ lines of patterns, agent SOPs, project memories, captured lessons/bugs/decisions). Call this FIRST on any non-trivial task to retrieve the most relevant company knowledge instead of guessing. Returns ranked, cited chunks.",
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'natural-language description of what you need' },
      type: { type: 'string', enum: ['memory', 'agent', 'project', 'lesson', 'bug', 'decision', 'golden'], description: 'optional: restrict to one source type' },
      k: { type: 'integer', description: 'how many results (default 8)' },
    }, required: ['query'] },
  },
  {
    name: 'capture_lesson',
    description: 'Store a lesson learned (Problem → Root cause → Solution → Prevention) so every future agent inherits it. Immediately retrievable via memory_search.',
    inputSchema: { type: 'object', properties: {
      domain: { type: 'string' }, problem: { type: 'string' }, root_cause: { type: 'string' }, solution: { type: 'string' }, prevention: { type: 'string' },
    }, required: ['problem', 'root_cause', 'solution'] },
  },
  {
    name: 'capture_bug',
    description: 'Store a bug + its fix (symptom → root cause → fix → prevention) into the searchable bug database.',
    inputSchema: { type: 'object', properties: {
      severity: { type: 'string', enum: ['S1', 'S2', 'S3', 'S4'] }, symptom: { type: 'string' }, root_cause: { type: 'string' }, fix: { type: 'string' }, prevention: { type: 'string' },
    }, required: ['symptom', 'root_cause', 'fix'] },
  },
  {
    name: 'capture_decision',
    description: "Store a strategic/architecture decision (situation → thinking → decision → outcome) into the decision/CEO brain, so future agents mirror how Boldteq decides.",
    inputSchema: { type: 'object', properties: {
      scope: { type: 'string', enum: ['project', 'strategy', 'architecture'] }, situation: { type: 'string' }, decision: { type: 'string' }, thinking: { type: 'string' }, alternatives: { type: 'string' }, outcome: { type: 'string' },
    }, required: ['situation', 'decision'] },
  },
  {
    name: 'capture_golden',
    description: 'Store a golden/exemplary work (store, landing, design, proposal, section) as a quality anchor agents reference before generating.',
    inputSchema: { type: 'object', properties: {
      kind: { type: 'string' }, title: { type: 'string' }, why_excellent: { type: 'string' }, niche: { type: 'string' }, ref: { type: 'string' },
    }, required: ['title', 'why_excellent'] },
  },
]

async function callTool(name, args = {}) {
  if (name === 'memory_search') {
    const results = await retrieve(args.query, { topK: args.k || 8, filter: args.type ? { source_type: args.type } : {} })
    if (results.length === 0) return 'No results. (If the index is empty, run: node src/intelligence/reindex.mjs)'
    return `Top ${results.length} for "${args.query}":\n\n${formatContext(results)}`
  }
  const captureMap = { capture_lesson: 'lesson', capture_bug: 'bug', capture_decision: 'decision', capture_golden: 'golden' }
  if (captureMap[name]) { const r = await captureItem(captureMap[name], args, 'agent'); return `Captured ${r.type} ${r.id} — now retrievable via memory_search.` }
  throw new Error(`unknown tool: ${name}`)
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

async function handle(msg) {
  const { id, method, params } = msg
  const isRequest = id !== undefined && id !== null
  try {
    if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: NAME, version: VERSION } } })
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') return // notifications: no reply
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} })
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
    if (method === 'tools/call') {
      const text = await callTool(params?.name, params?.arguments || {})
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } })
    }
    if (isRequest) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } })
  } catch (err) {
    if (isRequest) send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `ERROR: ${err.message}` }], isError: true } })
  }
}

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', line => { const t = line.trim(); if (!t) return; let msg; try { msg = JSON.parse(t) } catch { return } handle(msg) })
process.stderr.write(`${NAME} v${VERSION} MCP server ready (stdio)\n`)
