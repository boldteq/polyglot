import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Save, ArrowLeft, RotateCcw, AlertCircle, Code, Eye,
  Bot, Cpu, Wrench, FileText, Tag, LayoutTemplate, GraduationCap, FolderOpen,
} from 'lucide-react'
import { confirmDialog } from '../lib/confirm'
import {
  getGlobalAgent,
  updateGlobalAgent,
  getProjectAgent,
  updateProjectAgent,
  getTemplates,
  getTraining,
  getCategories,
} from '../lib/api'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'
import { toast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import AgentIcon from '../components/AgentIcon'
import RichMarkdownEditor from '../components/RichMarkdownEditor'
import AgentHealthBar from '../components/AgentHealthBar'
import Breadcrumbs, { type BreadcrumbItem } from '../components/Breadcrumbs'
import { projectNameFromId } from '../lib/projectId'

interface Props {
  scope: 'global' | 'project'
}

// Parse frontmatter from raw markdown
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let val = line.slice(colonIdx + 1).trim()
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key) meta[key] = val
  }
  return { meta, body: match[2].replace(/^\n+/, '') }
}

// True when the source LOOKS like it has frontmatter (opens with `---`) but the
// closing fence is missing/malformed, so parseFrontmatter would silently swallow
// the whole block into the body — the data-loss case we must warn about.
function hasUnparseableFrontmatter(raw: string): boolean {
  if (!/^---\s*\n/.test(raw)) return false
  return !/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.test(raw)
}

// Serialize frontmatter + body back to raw markdown
function serializeAgent(meta: Record<string, string>, body: string): string {
  const lines = Object.entries(meta)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      // Quote description if it contains special chars
      if (k === 'description' && v && (v.includes(':') || v.includes('#') || v.includes('"'))) {
        return `${k}: "${v.replace(/"/g, '\\"')}"`
      }
      return `${k}: ${v}`
    })
  return `---\n${lines.join('\n')}\n---\n\n${body}`
}

const MODEL_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: '', label: 'Default', desc: 'Uses parent model' },
  { value: 'opus', label: 'Opus', desc: 'Most capable, complex reasoning' },
  { value: 'sonnet', label: 'Sonnet', desc: 'Balanced speed + quality' },
  { value: 'haiku', label: 'Haiku', desc: 'Fastest, simple tasks' },
]
const TOOL_OPTIONS: { name: string; desc: string }[] = [
  { name: 'Read', desc: 'Read files' },
  { name: 'Write', desc: 'Create files' },
  { name: 'Edit', desc: 'Edit files' },
  { name: 'Bash', desc: 'Run commands' },
  { name: 'Glob', desc: 'Find files' },
  { name: 'Grep', desc: 'Search content' },
  { name: 'WebSearch', desc: 'Search the web' },
  { name: 'WebFetch', desc: 'Fetch URLs' },
]

export default function AgentEditor({ scope }: Props) {
  const { name, projectId } = useParams()
  const navigate = useNavigate()

  // Raw content
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  useUnsavedGuard(dirty)

  // Parsed fields
  const [meta, setMeta] = useState<Record<string, string>>({})
  const [body, setBody] = useState('')

  // View mode: 'rich' or 'source'
  const [viewMode, setViewMode] = useState<'rich' | 'source'>('rich')
  const [richGuardOpen, setRichGuardOpen] = useState(false)

  // Source text for source mode
  const [sourceText, setSourceText] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const agent =
          scope === 'global'
            ? await getGlobalAgent(name!)
            : await getProjectAgent(projectId!, name!)
        setOriginalContent(agent.raw)
        const parsed = parseFrontmatter(agent.raw)
        setMeta(parsed.meta)
        setBody(parsed.body)
        setSourceText(agent.raw)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load agent')
      }
      setLoading(false)
    }
    load()
  }, [name, projectId, scope])

  const getCurrentRaw = useCallback(() => {
    if (viewMode === 'source') return sourceText
    return serializeAgent(meta, body)
  }, [viewMode, sourceText, meta, body])

  const handleSave = async () => {
    const raw = getCurrentRaw()
    if (!raw.trim()) {
      toast('error', 'Agent content cannot be empty')
      return
    }
    setSaving(true)
    try {
      if (scope === 'global') {
        await updateGlobalAgent(name!, raw)
      } else {
        await updateProjectAgent(projectId!, name!, raw)
      }
      setOriginalContent(raw)
      setDirty(false)
      toast('success', 'Agent saved')
      // Refresh any mounted list/cache that shows this entity (lib/cacheKeys.ts
      // listens for this) so the edit appears app-wide without a manual refresh.
      window.dispatchEvent(new Event('polyglot:file-applied'))
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    const parsed = parseFrontmatter(originalContent)
    setMeta(parsed.meta)
    setBody(parsed.body)
    setSourceText(originalContent)
    setDirty(false)
  }

  const updateMeta = (key: string, value: string) => {
    setMeta(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleBodyChange = useCallback((newBody: string) => {
    setBody(newBody)
    setDirty(true)
  }, [])

  const handleSourceChange = (text: string) => {
    setSourceText(text)
    setDirty(true)
  }

  // Sync between modes when switching
  const switchToSource = () => {
    setSourceText(serializeAgent(meta, body))
    setViewMode('source')
  }

  const doSwitchToRich = () => {
    const parsed = parseFrontmatter(sourceText)
    setMeta(parsed.meta)
    setBody(parsed.body)
    setViewMode('rich')
  }

  const switchToRich = () => {
    // Guard the data-loss case: malformed frontmatter would be silently dropped.
    if (hasUnparseableFrontmatter(sourceText)) { setRichGuardOpen(true); return }
    doSwitchToRich()
  }

  const toggleTools = (tool: string) => {
    const current = (meta.tools || '').split(',').map(t => t.trim()).filter(Boolean)
    const updated = current.includes(tool)
      ? current.filter(t => t !== tool)
      : [...current, tool]
    updateMeta('tools', updated.join(','))
  }

  const selectedTools = (meta.tools || '').split(',').map(t => t.trim()).filter(Boolean)
  const { data: templates } = useApi(getTemplates, [], CacheKeys.templates)
  const { data: trainingData } = useApi(() => name ? getTraining(name) : Promise.resolve([]), [name], name ? CacheKeys.training(name) : 'training/none')
  const { data: categories } = useApi(getCategories, [], CacheKeys.categories)
  const activeCorrections = (trainingData || []).filter(c => c.status === 'active')

  const backPath = scope === 'global' ? '/agents' : `/workspace/saas/${projectId}`

  const displayName = meta.name || name || ''
  const crumbs: BreadcrumbItem[] =
    scope === 'global'
      ? [{ label: 'Agents', to: '/agents' }, { label: displayName }]
      : [
          { label: 'SaaS Projects', to: '/workspace/saas' },
          { label: projectNameFromId(projectId || ''), to: `/workspace/saas/${projectId}` },
          { label: 'Agents', to: `/workspace/saas/${projectId}` },
          { label: displayName },
        ]

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-8 h-8 text-red" />
        <p className="text-red font-medium">{loadError}</p>
        <button onClick={() => navigate(backPath)} className="text-sm text-accent hover:underline">
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={async () => {
              if (dirty && !(await confirmDialog({ title: 'Discard unsaved changes?', message: 'You have unsaved changes that will be lost if you leave.', danger: true, confirmLabel: 'Leave' }))) return
              navigate(backPath)
            }}
            aria-label="Go back"
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <AgentIcon name={name!} uid={`editor-${name}`} size={40} global={scope === 'global'} />
          <div className="min-w-0">
            <Breadcrumbs items={crumbs} className="mb-1" />
            <h1 className="text-lg font-bold">{meta.name || name}</h1>
            <p className="text-xs text-text-muted mt-0.5">
              {scope === 'global' ? 'Global agent' : 'Project agent'}
              {dirty && <span className="ml-2 text-amber font-medium">Unsaved changes</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="segmented mr-2">
            <button
              onClick={viewMode === 'source' ? switchToRich : undefined}
              className={viewMode === 'rich' ? 'segmented-btn segmented-btn-active flex items-center gap-1.5' : 'segmented-btn flex items-center gap-1.5'}
            >
              <Eye className="w-3.5 h-3.5" /> Rich Editor
            </button>
            <button
              onClick={viewMode === 'rich' ? switchToSource : undefined}
              className={viewMode === 'source' ? 'segmented-btn segmented-btn-active flex items-center gap-1.5' : 'segmented-btn flex items-center gap-1.5'}
            >
              <Code className="w-3.5 h-3.5" /> Source
            </button>
          </div>

          {dirty && (
            <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-secondary hover:text-text rounded-lg hover:bg-surface-2 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="btn-primary btn-md"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Agent Health Bar */}
      {name && !loading && !loadError && (
        <AgentHealthBar
          agentName={name}
          scope={scope}
          projectId={projectId}
          content={dirty ? getCurrentRaw() : undefined}
        />
      )}

      {/* Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {viewMode === 'rich' ? (
          <>
            {/* Frontmatter sidebar */}
            <div className="w-[300px] min-w-[300px] border-r border-border bg-surface overflow-y-auto">
              <div className="p-5 space-y-5">
                <div className="flex items-center gap-2 text-xs font-semibold text-text-muted ">
                  <FileText className="w-3.5 h-3.5" />
                  Agent Config
                </div>

                {/* Name */}
                <div>
                  <label className="text-xs font-medium text-text-muted block mb-1.5">
                    <span className="flex items-center gap-1.5"><Bot className="w-3 h-3" /> Name</span>
                  </label>
                  <input
                    value={meta.name || ''}
                    onChange={e => updateMeta('name', e.target.value)}
                    className="input"
                    placeholder="Agent Name"
                    aria-label="Agent name"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-medium text-text-muted block mb-1.5">Description</label>
                  <textarea
                    value={meta.description || ''}
                    onChange={e => {
                      updateMeta('description', e.target.value)
                      // Auto-expand
                      const el = e.target
                      el.style.height = 'auto'
                      el.style.height = el.scrollHeight + 'px'
                    }}
                    onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                    rows={4}
                    className="input leading-relaxed"
                    style={{ minHeight: '100px', resize: 'vertical' }}
                    placeholder="Describe what this agent does, its responsibilities, and when to use it. Be specific — this description helps route tasks to the right agent."
                  />
                  <p className="text-[10px] text-text-muted mt-1">{(meta.description || '').length} characters</p>
                </div>

                {/* Model */}
                <div>
                  <label className="text-xs font-medium text-text-muted block mb-2">
                    <span className="flex items-center gap-1.5"><Cpu className="w-3 h-3" /> Model</span>
                  </label>
                  <div className="space-y-1.5">
                    {MODEL_OPTIONS.map(m => (
                      <button
                        key={m.value}
                        onClick={() => updateMeta('model', m.value)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                          (meta.model || '') === m.value
                            ? 'bg-accent/10 border-accent/30'
                            : 'bg-surface-2 border-border hover:border-border'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          (meta.model || '') === m.value ? 'bg-accent' : 'bg-border'
                        }`} />
                        <div className="min-w-0">
                          <p className={`text-xs font-semibold ${(meta.model || '') === m.value ? 'text-accent' : 'text-text'}`}>
                            {m.label}
                          </p>
                          <p className="text-[10px] text-text-muted">{m.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tools */}
                <div>
                  <label className="text-xs font-medium text-text-muted block mb-2">
                    <span className="flex items-center gap-1.5"><Wrench className="w-3 h-3" /> Tools ({selectedTools.length}/{TOOL_OPTIONS.length})</span>
                  </label>
                  <div className="space-y-1">
                    {TOOL_OPTIONS.map(tool => (
                      <button
                        key={tool.name}
                        onClick={() => toggleTools(tool.name)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${
                          selectedTools.includes(tool.name)
                            ? 'bg-accent/10 border-accent/30'
                            : 'bg-surface-2 border-transparent hover:border-border'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          selectedTools.includes(tool.name)
                            ? 'bg-accent border-accent'
                            : 'border-border'
                        }`}>
                          {selectedTools.includes(tool.name) && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-[11px] font-semibold ${selectedTools.includes(tool.name) ? 'text-accent' : 'text-text'}`}>
                            {tool.name}
                          </p>
                          <p className="text-[10px] text-text-muted">{tool.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="text-xs font-medium text-text-muted block mb-1.5">
                    <span className="flex items-center gap-1.5"><FolderOpen className="w-3 h-3" /> Category</span>
                  </label>
                  <div className="space-y-2">
                    {categories && categories.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {categories.filter(c => c.name !== 'uncategorized').map(c => (
                          <button
                            key={c.name}
                            onClick={() => updateMeta('category', c.name)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                              meta.category === c.name
                                ? 'bg-accent/10 border border-accent/30 text-accent'
                                : 'bg-surface-2 border border-border text-text-secondary hover:border-border'
                            }`}
                          >
                            {c.name.replace(/-/g, ' ')}
                          </button>
                        ))}
                      </div>
                    )}
                    <input
                      value={meta.category || ''}
                      onChange={e => updateMeta('category', e.target.value)}
                      className="input"
                      placeholder="Type or select a category..."
                      aria-label="Agent category"
                    />
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="text-xs font-medium text-text-muted block mb-1.5">
                    <span className="flex items-center gap-1.5"><Tag className="w-3 h-3" /> Tags</span>
                  </label>
                  <input
                    value={meta.tags || ''}
                    onChange={e => updateMeta('tags', e.target.value)}
                    className="input"
                    placeholder="comma, separated, tags"
                    aria-label="Tags"
                  />
                  {meta.tags && (
                    <div className="flex gap-1 flex-wrap mt-1.5">
                      {meta.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                        <span key={tag} className="text-[10px] bg-surface-2 text-text-secondary px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Output Template */}
                <div>
                  <label className="text-xs font-medium text-text-muted block mb-1.5">
                    <span className="flex items-center gap-1.5"><LayoutTemplate className="w-3 h-3" /> Output Template</span>
                  </label>
                  <select
                    value={meta.output_template || ''}
                    onChange={e => updateMeta('output_template', e.target.value)}
                    className="input appearance-none cursor-pointer"
                    aria-label="Output template"
                  >
                    <option value="">None (free-form output)</option>
                    {(templates || []).map(t => (
                      <option key={t.filename} value={t.filename}>{t.name}</option>
                    ))}
                  </select>
                  {meta.output_template && (
                    <p className="text-[10px] text-accent mt-1">Output will follow the locked template format</p>
                  )}
                </div>

                {/* Training */}
                <div>
                  <label className="text-xs font-medium text-text-muted block mb-1.5">
                    <span className="flex items-center gap-1.5"><GraduationCap className="w-3 h-3" /> Training</span>
                  </label>
                  <a
                    href={`/agents/${name}/training`}
                    className="flex items-center justify-between w-full bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-sm hover:border-accent/30 transition-colors"
                  >
                    <span className="text-text-secondary">
                      {activeCorrections.length > 0
                        ? `${activeCorrections.length} active correction${activeCorrections.length > 1 ? 's' : ''}`
                        : 'No corrections yet'}
                    </span>
                    {activeCorrections.length > 0 && (
                      <span className="text-[10px] bg-amber/10 text-amber px-1.5 py-0.5 rounded-full font-medium">
                        {activeCorrections.length}
                      </span>
                    )}
                  </a>
                </div>

                {/* Extra frontmatter fields */}
                {Object.entries(meta)
                  .filter(([k]) => !['name', 'description', 'model', 'tools', 'category', 'tags', 'output_template', 'has_training', 'icon'].includes(k))
                  .map(([key, val]) => (
                    <div key={key}>
                      <label className="text-xs font-medium text-text-muted block mb-1.5">{key}</label>
                      <input
                        value={val}
                        onChange={e => updateMeta(key, e.target.value)}
                        className="input"
                        aria-label={key}
                      />
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Rich editor body */}
            <div className="flex-1 min-w-0 overflow-y-auto bg-bg">
              <div className="max-w-4xl mx-auto py-2">
                <RichMarkdownEditor
                  content={body}
                  onChange={handleBodyChange}
                  placeholder="Write your agent instructions here..."
                  className="min-h-[calc(100vh-120px)] border-0 rounded-none bg-transparent"
                />
              </div>
            </div>
          </>
        ) : (
          /* Source mode - raw markdown textarea */
          <div className="flex-1 min-w-0 p-4">
            <textarea
              value={sourceText}
              onChange={e => handleSourceChange(e.target.value)}
              className="input h-full p-5 font-mono resize-none leading-relaxed"
              placeholder={'---\nname: Agent Name\ndescription: What this agent does\nmodel: sonnet\ntools: Read,Write,Edit\n---\n\nAgent instructions...'}
              spellCheck={false}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={richGuardOpen}
        onClose={() => setRichGuardOpen(false)}
        onConfirm={() => { setRichGuardOpen(false); doSwitchToRich() }}
        title="Frontmatter looks malformed"
        message="The opening --- has no matching closing ---, so switching to the rich editor will drop the frontmatter into the body. Fix the closing fence in source view, or switch anyway."
        confirmLabel="Switch anyway"
        danger
      />
    </div>
  )
}
