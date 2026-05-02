import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, ArrowLeft, RotateCcw, AlertCircle, Code, Eye, LayoutTemplate } from 'lucide-react'
import { getTemplate, updateTemplate } from '../lib/api'
import { toast } from '../components/Toast'
import RichMarkdownEditor from '../components/RichMarkdownEditor'

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let val = line.slice(colonIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key) meta[key] = val
  }
  return { meta, body: match[2].replace(/^\n+/, '') }
}

function serializeTemplate(meta: Record<string, string>, body: string): string {
  const lines = Object.entries(meta)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      if (v.includes(':') || v.includes('#') || v.includes('"')) {
        return `${k}: "${v.replace(/"/g, '\\"')}"`
      }
      return `${k}: ${v}`
    })
  return `---\n${lines.join('\n')}\n---\n\n${body}`
}

export default function TemplateEditor() {
  const { name } = useParams()
  const navigate = useNavigate()

  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const [meta, setMeta] = useState<Record<string, string>>({})
  const [body, setBody] = useState('')
  const [viewMode, setViewMode] = useState<'rich' | 'source'>('rich')
  const [sourceText, setSourceText] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const template = await getTemplate(name!)
        setOriginalContent(template.raw)
        const parsed = parseFrontmatter(template.raw)
        setMeta(parsed.meta)
        setBody(parsed.body)
        setSourceText(template.raw)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load template')
      }
      setLoading(false)
    }
    load()
  }, [name])

  const getCurrentRaw = useCallback(() => {
    if (viewMode === 'source') return sourceText
    return serializeTemplate(meta, body)
  }, [viewMode, sourceText, meta, body])

  const handleSave = async () => {
    const raw = getCurrentRaw()
    setSaving(true)
    try {
      await updateTemplate(name!, raw)
      setOriginalContent(raw)
      setDirty(false)
      toast('success', 'Template saved')
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

  const switchToSource = () => {
    setSourceText(serializeTemplate(meta, body))
    setViewMode('source')
  }

  const switchToRich = () => {
    const parsed = parseFrontmatter(sourceText)
    setMeta(parsed.meta)
    setBody(parsed.body)
    setViewMode('rich')
  }

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
        <button onClick={() => navigate('/templates')} className="text-sm text-accent hover:underline">
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
            onClick={() => {
              if (dirty && !confirm('You have unsaved changes. Leave anyway?')) return
              navigate('/templates')
            }}
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-lg bg-accent-muted">
            <LayoutTemplate className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{meta.name || name}</h1>
            <p className="text-xs text-text-muted mt-0.5">
              Output template
              {dirty && <span className="ml-2 text-amber font-medium">Unsaved changes</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-surface-2 border border-border rounded-lg p-0.5 mr-2">
            <button
              onClick={viewMode === 'source' ? switchToRich : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'rich' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Rich Editor
            </button>
            <button
              onClick={viewMode === 'rich' ? switchToSource : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'source' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
              }`}
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
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-30 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {viewMode === 'rich' ? (
          <>
            {/* Metadata sidebar */}
            <div className="w-[280px] min-w-[280px] border-r border-border bg-surface overflow-y-auto">
              <div className="p-5 space-y-5">
                <div className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
                  <LayoutTemplate className="w-3.5 h-3.5" />
                  Template Config
                </div>

                <div>
                  <label className="text-xs font-medium text-text-muted block mb-1.5">Name</label>
                  <input
                    value={meta.name || ''}
                    onChange={e => updateMeta('name', e.target.value)}
                    className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-accent/50"
                    placeholder="Template name"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-text-muted block mb-1.5">Description</label>
                  <textarea
                    value={meta.description || ''}
                    onChange={e => updateMeta('description', e.target.value)}
                    rows={3}
                    className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-accent/50"
                    placeholder="What this template is for..."
                  />
                </div>

                <div className="pt-3 border-t border-border">
                  <p className="text-[10px] text-text-muted leading-relaxed">
                    The body defines the locked output structure. Agents with this template
                    will produce output that follows this exact format.
                  </p>
                </div>
              </div>
            </div>

            {/* Rich editor body */}
            <div className="flex-1 min-w-0 overflow-y-auto bg-bg">
              <div className="max-w-4xl mx-auto py-2">
                <RichMarkdownEditor
                  content={body}
                  onChange={handleBodyChange}
                  placeholder="Define your output structure here..."
                  className="min-h-[calc(100vh-120px)] border-0 rounded-none bg-transparent"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 min-w-0 p-4">
            <textarea
              value={sourceText}
              onChange={e => { setSourceText(e.target.value); setDirty(true) }}
              className="w-full h-full bg-surface border border-border rounded-xl p-5 font-mono text-sm resize-none focus:outline-none focus:border-accent/50 leading-relaxed"
              placeholder={'---\nname: Template Name\ndescription: What this template formats\n---\n\n# {title}\n\n## Section\n\nContent...'}
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  )
}
