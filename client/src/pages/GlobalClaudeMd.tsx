import { useState, useEffect } from 'react'
import { Save, RotateCcw } from 'lucide-react'
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
      <div className="flex items-center justify-center h-64">
        <p className="text-red">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[420px]">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-text-muted">
          Instructions that apply to Claude across all projects
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleReset}
              className="btn-ghost btn-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
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

      <div className="flex-1 min-h-0">
        <textarea
          value={content}
          onChange={(e) => { setContent(e.target.value); setDirty(true) }}
          className="input h-full p-5 rounded-xl font-mono text-sm resize-none"
          placeholder="# Global Instructions for Claude&#10;&#10;Write your global CLAUDE.md content here..."
          spellCheck={false}
        />
      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
