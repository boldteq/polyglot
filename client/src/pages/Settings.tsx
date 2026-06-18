import { useState, useEffect } from 'react'
import { Trash2, Save, FolderOpen, Info, FolderSearch } from 'lucide-react'
import { getConfig, updateProjectDirs, getGlobalSettings, updateGlobalSettings } from '../lib/api'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import DirectoryPicker from '../components/DirectoryPicker'
import { toast } from '../components/Toast'
import { confirmDialog } from '../lib/confirm'
import { Skeleton } from '../components/Skeleton'

interface Props {
  onSave: () => void
}

export default function SettingsPage({ onSave }: Props) {
  const { data: config, loading } = useApi(getConfig, [], CacheKeys.config)
  const [dirs, setDirs] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const { data: settingsRaw, loading: settingsLoading } = useApi(getGlobalSettings, [], CacheKeys.globalSettings)
  const [settingsData, setSettingsData] = useState<Record<string, unknown>>({})
  const [settingsPermissionsText, setSettingsPermissionsText] = useState('{}')
  const [settingsPermissionsError, setSettingsPermissionsError] = useState('')
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    if (settingsRaw) {
      setSettingsData(settingsRaw)
      setSettingsPermissionsText(JSON.stringify((settingsRaw.permissions as object) || {}, null, 2))
      setSettingsDirty(false)
    }
  }, [settingsRaw])

  const handleSaveSettings = async () => {
    try {
      const parsed = JSON.parse(settingsPermissionsText)
      setSettingsPermissionsError('')
      setSavingSettings(true)
      const merged = { ...settingsData, permissions: parsed }
      await updateGlobalSettings(merged)
      setSettingsDirty(false)
      toast('success', 'Claude settings saved')
    } catch {
      setSettingsPermissionsError('Invalid JSON — fix before saving')
      return
    } finally {
      setSavingSettings(false)
    }
  }

  useEffect(() => {
    if (config) {
      setDirs(config.projectDirs || [])
      setDirty(false)
    }
  }, [config])

  const handleAddFromPicker = (dirPath: string) => {
    const display = dirPath.replace(/^\/Users\/[^/]+/, '~')
    if (!dirs.includes(dirPath) && !dirs.includes(display)) {
      setDirs([...dirs, display])
      setDirty(true)
    }
  }

  const handleRemove = async (dir: string) => {
    const ok = await confirmDialog({
      title: 'Remove project folder?',
      message: `Polyglot will stop scanning "${dir}" for agents. Takes effect when you Save.`,
      danger: true,
      confirmLabel: 'Remove',
    })
    if (!ok) return
    setDirs(prev => prev.filter(d => d !== dir))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateProjectDirs(dirs)
      setDirty(false)
      onSave()
      toast('success', 'Settings saved')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Info — slim banner */}
      <div className="bg-accent-muted border border-accent/20 rounded-xl px-4 py-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <p className="text-[13px] text-text-secondary leading-relaxed">
          <span className="font-medium text-accent-hover">How project discovery works — </span>
          Polyglot scans each directory below for subdirectories containing{' '}
          <code className="text-accent font-mono text-xs">.claude/</code>,{' '}
          <code className="text-accent font-mono text-xs">CLAUDE.md</code>, or{' '}
          <code className="text-accent font-mono text-xs">package.json</code>.
        </p>
      </div>

      {/* Two-column: directories (left) · Claude settings (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ── Left: project directories ── */}
        <div className="space-y-5">
          {/* Claude directory status */}
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <FolderOpen className="w-4 h-4 text-text-muted shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Claude Directory</p>
                <p className="text-xs text-text-muted font-mono truncate">{config?.claudeDir}</p>
              </div>
              <span
                className={`ml-auto text-xs px-2 py-1 rounded-md shrink-0 ${
                  config?.claudeDirExists ? 'bg-green-muted text-green' : 'bg-red-muted text-red'
                }`}
              >
                {config?.claudeDirExists ? 'Found' : 'Not found'}
              </span>
            </div>
          </div>

          {/* Project Directories */}
          <div className="card p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-base font-semibold">Project Directories</h2>
              <div className="flex items-center gap-2">
                {dirty && (
                  <button onClick={handleSave} disabled={saving} className="btn-secondary btn-sm">
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                )}
                <button onClick={() => setPickerOpen(true)} className="btn-primary btn-sm">
                  <FolderSearch className="w-3.5 h-3.5" />
                  Browse & Add
                </button>
              </div>
            </div>

            {/* List */}
            {dirs.length === 0 ? (
              <div className="py-8 text-center">
                <FolderOpen className="w-10 h-10 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary font-medium">No directories configured</p>
                <p className="text-text-muted text-sm mt-1">
                  Click "Browse & Add" to select folders containing your projects
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {dirs.map((dir) => (
                  <div
                    key={dir}
                    className="flex items-center justify-between bg-surface-2 rounded-lg px-4 py-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FolderOpen className="w-4 h-4 text-text-muted shrink-0" />
                      <span className="text-sm font-mono text-text-secondary truncate">{dir}</span>
                    </div>
                    <button
                      onClick={() => handleRemove(dir)}
                      title="Delete folder"
                      aria-label="Delete folder"
                      className="p-1.5 rounded-md text-text-muted hover:text-red hover:bg-red-muted transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Claude settings ── */}
        <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Claude Settings</h2>
            <p className="text-xs text-text-muted mt-0.5">~/.claude/settings.json — model, effort, permissions</p>
          </div>
          {settingsDirty && (
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="btn-primary btn-sm"
            >
              <Save className="w-3.5 h-3.5" />
              {savingSettings ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
        {settingsLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Model */}
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div>
                <p className="text-sm font-medium">Model</p>
                <p className="text-xs text-text-muted">Default Claude model for all sessions</p>
              </div>
              <select
                value={(settingsData.model as string) || 'sonnet'}
                onChange={e => { setSettingsData(s => ({ ...s, model: e.target.value })); setSettingsDirty(true) }}
                className="input w-auto"
              >
                <option value="claude-sonnet-4-6">claude-sonnet-4-6 (Sonnet)</option>
                <option value="claude-opus-4-6">claude-opus-4-6 (Opus)</option>
                <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001 (Haiku)</option>
                <option value="sonnet">sonnet</option>
                <option value="opus">opus</option>
                <option value="haiku">haiku</option>
              </select>
            </div>
            {/* Effort Level */}
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div>
                <p className="text-sm font-medium">Effort Level</p>
                <p className="text-xs text-text-muted">Controls how much reasoning Claude applies</p>
              </div>
              <select
                value={(settingsData.effortLevel as string) || 'high'}
                onChange={e => { setSettingsData(s => ({ ...s, effortLevel: e.target.value })); setSettingsDirty(true) }}
                className="input w-auto"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
            {/* Permissions */}
            <div className="py-2">
              <label htmlFor="permissions-json" className="text-sm font-medium mb-1 block">Permissions</label>
              <p className="text-xs text-text-muted mb-2">Raw JSON — controls which tools Claude Code can use</p>
              <textarea
                id="permissions-json"
                rows={6}
                value={settingsPermissionsText}
                onChange={e => { setSettingsPermissionsText(e.target.value); setSettingsDirty(true) }}
                spellCheck={false}
                className="input font-mono text-xs resize-y"
              />
              {settingsPermissionsError && (
                <p className="text-xs text-red mt-1">{settingsPermissionsError}</p>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Directory Picker Modal */}
      <DirectoryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleAddFromPicker}
        existingDirs={dirs}
      />
    </div>
  )
}
