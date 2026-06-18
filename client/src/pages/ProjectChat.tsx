import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
  MessageSquare, Plus, Trash2, Send, Bot, User, ArrowLeft, StopCircle,
} from 'lucide-react'
import {
  getProjectConversations, getProjectConversation, createProjectConversation,
  deleteProjectConversation, streamProjectChat, getGlobalAgents, apiError} from '../lib/api'
import type { ConversationSummary, Conversation, ConversationMessage } from '../lib/api'
import type { Agent } from '../types'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import EmptyState from '../components/EmptyState'
import { toast } from '../components/Toast'
import { confirmDialog } from '../lib/confirm'

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return `${Math.floor(diff / 86400000)}d`
}

export default function ProjectChat() {
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [convos, setConvos] = useState<ConversationSummary[]>([])
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [streamingContent, setStreamingContent] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newAgent, setNewAgent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadConvos = useCallback(() => {
    if (!projectId) return
    getProjectConversations(projectId).then(setConvos).catch(err => apiError('Project chat', err))
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    Promise.all([getProjectConversations(projectId), getGlobalAgents()])
      .then(([c, a]) => { setConvos(c); setAgents(a) })
      .catch(err => apiError('Project chat', err))
      .finally(() => setLoading(false))
  }, [projectId])

  // Auto-open conversation from URL
  useEffect(() => {
    const convoId = searchParams.get('convo')
    if (convoId && projectId) {
      getProjectConversation(projectId, convoId).then(setActiveConvo).catch(err => apiError('Project chat', err))
    }
  }, [searchParams, projectId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConvo?.messages, streamingContent])

  // Auto-grow the composer textarea between its min/max heights as the user types
  // (parity with the Playground composer — a paste of multi-line text expands it).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  const openConvo = async (id: string) => {
    if (!projectId) return
    try {
      const convo = await getProjectConversation(projectId, id)
      setActiveConvo(convo)
    } catch (err) { apiError('Project chat action', err) }
  }

  const handleCreate = async () => {
    if (!projectId || !newTitle.trim()) return
    try {
      const convo = await createProjectConversation(projectId, {
        title: newTitle.trim(),
        agentName: newAgent || undefined,
      })
      setActiveConvo(convo)
      setShowNewForm(false)
      setNewTitle('')
      setNewAgent('')
      loadConvos()
    } catch (err) { apiError('Project chat action', err) }
  }

  const handleDelete = async (id: string) => {
    if (!projectId || !(await confirmDialog({ title: 'Delete conversation?', message: 'This conversation will be permanently deleted.', danger: true, confirmLabel: 'Delete' }))) return
    try {
      await deleteProjectConversation(projectId, id)
      if (activeConvo?.id === id) setActiveConvo(null)
      loadConvos()
    } catch (err) { apiError('Project chat action', err) }
  }

  const handleSend = async () => {
    if (!projectId || !activeConvo || !input.trim() || sending) return
    const msg = input.trim()
    setInput('')
    setSending(true)
    setStreamingContent('')

    // Optimistic: add user message immediately
    setActiveConvo(prev => prev ? {
      ...prev,
      messages: [...prev.messages, { role: 'user', content: msg, timestamp: new Date().toISOString() }],
    } : null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      let accumulated = ''
      await streamProjectChat(projectId, activeConvo.id, msg, (chunk) => {
        accumulated += chunk
        setStreamingContent(accumulated)
      }, controller.signal)

      // Add final assistant message
      setActiveConvo(prev => prev ? {
        ...prev,
        messages: [...prev.messages, { role: 'assistant', content: accumulated, timestamp: new Date().toISOString() }],
      } : null)
      setStreamingContent('')
      loadConvos()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errMsg = err instanceof Error ? err.message : 'Message failed to send'
        toast('error', errMsg)
        setActiveConvo(prev => prev ? {
          ...prev,
          messages: [...prev.messages, { role: 'assistant', content: `Error: ${errMsg}`, timestamp: new Date().toISOString() }],
        } : null)
      }
      setStreamingContent('')
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  if (loading) return <div className="p-8 text-text-muted">Loading conversations...</div>

  return (
    <div className="flex h-screen">
      {/* Sidebar — conversation list */}
      <div className="w-[280px] min-w-[280px] border-r border-border bg-surface flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => navigate(`/projects/${projectId}`)} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to project
            </button>
          </div>
          <h2 className="text-sm font-bold flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Project Chat
          </h2>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="btn-primary btn-md mt-3 w-full"
          >
            <Plus className="w-3.5 h-3.5" /> New Conversation
          </button>
        </div>

        {/* New conversation form */}
        {showNewForm && (
          <div className="p-3 border-b border-border space-y-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Conversation title..."
              className="input"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            />
            <select
              value={newAgent}
              onChange={e => setNewAgent(e.target.value)}
              className="input"
            >
              <option value="">No specific agent (general)</option>
              {agents.map(a => <option key={a.filename} value={a.filename}>{a.name}</option>)}
            </select>
            <div className="flex gap-1.5">
              <button onClick={handleCreate} className="btn-primary btn-sm flex-1">Create</button>
              <button onClick={() => setShowNewForm(false)} className="btn-secondary btn-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {convos.map(c => (
            <div
              key={c.id}
              onClick={() => openConvo(c.id)}
              className={`px-4 py-3 border-b border-border/50 cursor-pointer transition-colors group ${
                activeConvo?.id === c.id ? 'bg-accent/10' : 'hover:bg-surface-2/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium truncate flex-1">{c.title}</span>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(c.id) }}
                  aria-label="Delete conversation"
                  title="Delete conversation"
                  className="p-1 rounded text-text-muted hover:text-red opacity-60 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-muted">
                {c.agentName && <span className="bg-surface-2 px-1.5 py-0.5 rounded font-medium">{c.agentName}</span>}
                <span>{c.messageCount} msgs</span>
                <span>&middot;</span>
                <span>{timeAgo(c.lastMessageAt)}</span>
              </div>
            </div>
          ))}
          {convos.length === 0 && (
            <EmptyState icon={MessageSquare} title="No conversations yet" size="sm" />
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col bg-[var(--bg)]">
        {activeConvo ? (
          <>
            {/* Chat header */}
            <div className="px-6 py-3 border-b border-border bg-surface flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold truncate">{activeConvo.title}</h3>
                <div className="text-[10px] text-text-muted flex items-center gap-2">
                  {activeConvo.agentName && (
                    <span className="flex items-center gap-1">
                      <Bot className="w-3 h-3" /> {activeConvo.agentName}
                    </span>
                  )}
                  <span>{activeConvo.messages.length} messages</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {activeConvo.messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} />
              ))}
              {streamingContent && (
                <MessageBubble message={{ role: 'assistant', content: streamingContent, timestamp: new Date().toISOString() }} streaming />
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t border-border bg-surface">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={sending ? 'Agent is thinking...' : 'Type a message... (Cmd+Enter to send)'}
                  disabled={sending}
                  rows={2}
                  aria-label="Chat message input"
                  className="input flex-1 resize-none disabled:opacity-50"
                />
                {sending ? (
                  <button onClick={handleStop} aria-label="Stop generating response" title="Stop generating" className="p-3 rounded-xl bg-red-muted text-red hover:bg-red/20 transition-colors">
                    <StopCircle className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    aria-label="Send message"
                    title="Send message"
                    className="p-3 rounded-xl bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-30"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm font-medium">Select or create a conversation</p>
              <p className="text-xs mt-1">Chat with agents about this project</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message, streaming }: { message: ConversationMessage; streaming?: boolean }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-accent" />
        </div>
      )}
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
        isUser
          ? 'bg-accent text-white rounded-br-md'
          : 'bg-surface-2 border border-border rounded-bl-md'
      }`}>
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="text-sm prose-sm">
            <MarkdownRenderer content={message.content} />
            {streaming && <span className="inline-block w-2 h-4 ml-0.5 bg-accent animate-pulse rounded-sm" />}
          </div>
        )}
        <p className={`text-[9px] mt-1 ${isUser ? 'text-white/50' : 'text-text-muted'}`}>
          {new Date(message.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-text-muted" />
        </div>
      )}
    </div>
  )
}
