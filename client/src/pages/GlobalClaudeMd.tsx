import { useState, useEffect } from 'react'
import { Save, FileText, RotateCcw } from 'lucide-react'
import { getGlobalClaudeMd, updateGlobalClaudeMd } from '../lib/api'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'
import { toast } from '../components/Toast'

export default function GlobalClaudeMd() {
  const { data, loading, error: loadError } = useApi(getGlobalClaudeMd, [], CacheKeys.globalClaudeMd)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  useUnsavedGuard(dirty)

  useEffect(() => {
    if (data) {
      setContent(data.content)
      setDirty(false)
    }
  }, [data])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateGlobalClaudeMd(content)
      setDirty(false)
      toast('success', 'Global CLAUDE.md saved')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (data) {
      setContent(data.content)
      setDirty(false)
    }
  }

  if (loading) return <PageLoader />

  if (loadError) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <p className="text-red">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl h-screen flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            <FileText className="w-6 h-6 text-accent" />
            Global CLAUDE.md
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Instructions that apply to Claude across all projects
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text rounded-lg hover:bg-surface-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <textarea
          value={content}
          onChange={(e) => { setContent(e.target.value); setDirty(true) }}
          className="w-full h-full bg-surface border border-border rounded-xl p-5 font-mono text-sm text-text resize-none focus:outline-none focus:border-accent/50 transition-colors"
          placeholder="# Global Instructions for Claude&#10;&#10;Write your global CLAUDE.md content here..."
          spellCheck={false}
        />
      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="p-8 flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
