import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, ArrowLeft, RotateCcw, ShieldCheck, Info, Eye, Code, Globe } from 'lucide-react'
import { getProjectRule, updateProjectRule, getGlobalRule, updateGlobalRule } from '../lib/api'
import { toast } from '../components/Toast'
import RichMarkdownEditor from '../components/RichMarkdownEditor'

interface RuleEditorProps {
  scope?: 'global' | 'project'
}

export default function RuleEditor({ scope = 'project' }: RuleEditorProps) {
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

  const isGlobal = scope === 'global'

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const rule = isGlobal
          ? await getGlobalRule(name!)
          : await getProjectRule(projectId!, name!)
        setContent(rule.content)
        setOriginalContent(rule.content)
        setSourceText(rule.content)
      } catch {
        setContent('')
        setOriginalContent('')
        setSourceText('')
        setIsNew(true)
      }
      setLoading(false)
    }
    load()
  }, [name, projectId, isGlobal])

  const handleBodyChange = useCallback((newContent: string) => {
    setContent(newContent)
    setDirty(true)
  }, [])

  const getCurrentContent = () => viewMode === 'source' ? sourceText : content

  const handleSave = async () => {
    const raw = getCurrentContent()
    if (!raw.trim()) {
      toast('error', 'Rule content cannot be empty')
      return
    }
    setSaving(true)
    try {
      if (isGlobal) {
        await updateGlobalRule(name!, raw)
      } else {
        await updateProjectRule(projectId!, name!, raw)
      }
      setOriginalContent(raw)
      setContent(raw)
      setSourceText(raw)
      setDirty(false)
      setIsNew(false)
      toast('success', 'Rule saved')
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
            onClick={() => {
              if (dirty && !confirm('You have unsaved changes. Leave anyway?')) return
              navigate(isGlobal ? '/rules' : `/projects/${projectId}`)
            }}
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isGlobal ? 'bg-gradient-to-br from-blue-500/20 to-indigo-500/20' : 'bg-gradient-to-br from-green/20 to-emerald-500/20'}`}>
            {isGlobal ? <Globe className="w-5 h-5 text-blue-400" /> : <ShieldCheck className="w-5 h-5 text-green" />}
          </div>
          <div>
            <h1 className="text-lg font-bold">{name}</h1>
            <p className="text-xs text-text-muted mt-0.5">
              {isNew ? 'New rule' : isGlobal ? 'Global rule' : 'Project rule'}
              {dirty && <span className="ml-2 text-amber font-medium">Unsaved changes</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-surface-2 border border-border rounded-lg p-0.5 mr-2">
            <button onClick={viewMode === 'source' ? switchToRich : undefined} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'rich' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'}`}>
              <Eye className="w-3.5 h-3.5" /> Rich
            </button>
            <button onClick={viewMode === 'rich' ? switchToSource : undefined} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'source' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'}`}>
              <Code className="w-3.5 h-3.5" /> Source
            </button>
          </div>
          {dirty && (
            <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-secondary hover:text-text rounded-lg hover:bg-surface-2 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
          <button onClick={handleSave} disabled={!dirty || saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-30 transition-colors">
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="px-6 pt-4 shrink-0">
        <div className={`border rounded-xl p-3.5 flex items-start gap-3 ${isGlobal ? 'bg-blue-500/5 border-blue-500/20' : 'bg-green-muted border-green/20'}`}>
          <Info className={`w-4 h-4 shrink-0 mt-0.5 ${isGlobal ? 'text-blue-400' : 'text-green'}`} />
          <div className="text-xs text-text-secondary">
            <p>
              {isGlobal
                ? 'Global rule \u2014 applies to ALL Claude Code sessions across every project.'
                : 'Rules are constraints Claude always follows in this project. Be specific and actionable.'}
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
            placeholder="Write your rule here. Be specific about what Claude should always or never do."
            className="h-full"
          />
        ) : (
          <textarea
            value={sourceText}
            onChange={e => { setSourceText(e.target.value); setDirty(true) }}
            className="w-full h-full bg-surface border border-border rounded-xl p-5 font-mono text-sm text-text resize-none focus:outline-none focus:border-accent/50 transition-colors leading-relaxed"
            placeholder={`# ${name}\n\n- Always use the project's logger instead of console.log\n- Never hardcode credentials`}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  )
}
