import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, ArrowLeft, RotateCcw, Terminal, Info, Eye, Code } from 'lucide-react'
import { confirmDialog } from '../lib/confirm'
import { getProjectCommand, updateProjectCommand } from '../lib/api'
import { toast } from '../components/Toast'
import RichMarkdownEditor from '../components/RichMarkdownEditor'
import Breadcrumbs, { type BreadcrumbItem } from '../components/Breadcrumbs'
import { projectNameFromId } from '../lib/projectId'

export default function CommandEditor() {
  const { projectId, name } = useParams()
  const navigate = useNavigate()
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [viewMode, setViewMode] = useState<'rich' | 'source'>('rich')
  const [sourceText, setSourceText] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const cmd = await getProjectCommand(projectId!, name!)
        setContent(cmd.content)
        setOriginalContent(cmd.content)
        setSourceText(cmd.content)
      } catch {
        setContent('')
        setOriginalContent('')
        setSourceText('')
        setIsNew(true)
      }
      setLoading(false)
    }
    load()
  }, [name, projectId])

  const handleBodyChange = useCallback((newContent: string) => {
    setContent(newContent)
    setDirty(true)
  }, [])

  const getCurrentContent = () => viewMode === 'source' ? sourceText : content

  const handleSave = async () => {
    const raw = getCurrentContent()
    if (!raw.trim()) {
      toast('error', 'Command content cannot be empty')
      return
    }
    setSaving(true)
    try {
      await updateProjectCommand(projectId!, name!, raw)
      setOriginalContent(raw)
      setContent(raw)
      setSourceText(raw)
      setDirty(false)
      setIsNew(false)
      toast('success', 'Command saved')
      window.dispatchEvent(new Event('polyglot:file-applied'))
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setContent(originalContent)
    setSourceText(originalContent)
    setDirty(false)
  }

  const switchToSource = () => { setSourceText(content); setViewMode('source') }
  const switchToRich = () => { setContent(sourceText); setViewMode('rich') }

  const crumbs: BreadcrumbItem[] = [
    { label: 'SaaS Projects', to: '/workspace/saas' },
    { label: projectNameFromId(projectId || ''), to: `/workspace/saas/${projectId}` },
    { label: 'Commands', to: `/workspace/saas/${projectId}` },
    { label: name || '' },
  ]

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
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
              navigate(`/workspace/saas/${projectId}`)
            }}
            aria-label="Go back"
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber/20 to-orange/20 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-amber" />
          </div>
          <div className="min-w-0">
            <Breadcrumbs items={crumbs} className="mb-1" />
            <h1 className="text-lg font-bold flex items-center gap-2">
              <span className="text-text-muted">/</span>{name}
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              {isNew ? 'New command' : 'Slash command'}
              {dirty && <span className="ml-2 text-amber font-medium">Unsaved changes</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="segmented mr-2">
            <button onClick={viewMode === 'source' ? switchToRich : undefined} className={viewMode === 'rich' ? 'segmented-btn segmented-btn-active flex items-center gap-1.5' : 'segmented-btn flex items-center gap-1.5'}>
              <Eye className="w-3.5 h-3.5" /> Rich
            </button>
            <button onClick={viewMode === 'rich' ? switchToSource : undefined} className={viewMode === 'source' ? 'segmented-btn segmented-btn-active flex items-center gap-1.5' : 'segmented-btn flex items-center gap-1.5'}>
              <Code className="w-3.5 h-3.5" /> Source
            </button>
          </div>
          {dirty && (
            <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-secondary hover:text-text rounded-lg hover:bg-surface-2 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
          <button onClick={handleSave} disabled={!dirty || saving} className="btn-primary btn-md">
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="px-6 pt-4 shrink-0">
        <div className="bg-amber-muted border border-amber/20 rounded-xl p-3.5 flex items-start gap-3">
          <Info className="w-4 h-4 text-amber shrink-0 mt-0.5" />
          <div className="text-xs text-text-secondary">
            <p>
              Type <code className="text-amber font-mono font-semibold">/{name}</code> in Claude to run this command.
              Use <code className="text-amber font-mono font-semibold">$ARGUMENTS</code> as a placeholder for user input.
            </p>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 p-6 pt-4">
        {viewMode === 'rich' ? (
          <RichMarkdownEditor
            content={content}
            onChange={handleBodyChange}
            placeholder={`Describe what this command does.\nUse $ARGUMENTS for user-provided input.`}
            className="h-full"
          />
        ) : (
          <textarea
            value={sourceText}
            onChange={e => { setSourceText(e.target.value); setDirty(true) }}
            className="input h-full p-5 font-mono resize-none leading-relaxed"
            placeholder={`# /${name}\n\nDescribe what this command does.\nUse $ARGUMENTS for user-provided input.`}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  )
}
