import { Palette } from 'lucide-react'
import { SkeletonCards } from '../Skeleton'
import { ErrorState } from '../ErrorState'
import EmptyState from '../EmptyState'
import { useBuildSection } from '../../hooks/useBuildSection'
import { getWorkspaceDesignSystem, type DesignSystemData } from '../../lib/api'

// Helpers — tolerant accessors (the JSON is passed through as-is; shapes vary).
type Dict = Record<string, unknown>
const asDict = (v: unknown): Dict => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : {})
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h3 className="font-semibold text-[14px] mb-3">{title}</h3>
      {children}
    </section>
  )
}

function Swatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-lg border border-border shrink-0" style={{ backgroundColor: hex }} />
      <div className="min-w-0">
        <div className="text-[12px] font-medium truncate">{name}</div>
        <code className="text-[11px] text-text-muted">{hex}</code>
      </div>
    </div>
  )
}

// Visual viewer for docs/design/design-system.json (drape's ratified contract).
export default function DesignSystemTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const { data, loading, error } = useBuildSection<DesignSystemData>(() => getWorkspaceDesignSystem(buildId), reloadKey)
  if (loading && !data) return <SkeletonCards count={3} />
  if (error) return <ErrorState message={error} />
  if (!data?.present || !data.system) {
    return <EmptyState icon={Palette} title="No design system yet" description="docs/design/design-system.json is drape's ratified contract — colors, type, spacing, voice. Not produced for this build yet." />
  }

  const ds = data.system as Dict
  const meta = asDict(ds.meta)
  const color = asDict(ds.color)
  const colorTokens = asDict(color.tokens)
  const schemes = asDict(ds.color_schemes)
  const typography = asDict(ds.typography)
  const fonts = asDict(typography.fonts)
  const scale = asDict(typography.scale)
  const spacingTokens = asDict(asDict(ds.spacing).tokens)
  const buttons = asDict(asDict(ds.buttons).variants)
  const voice = asDict(ds.voice)

  return (
    <div className="space-y-4">
      {/* meta */}
      {Object.keys(meta).length > 0 && (
        <div className="card p-4 flex items-center gap-3 flex-wrap">
          {color.accent ? <div className="w-10 h-10 rounded-lg border border-border" style={{ backgroundColor: String(color.accent) }} /> : null}
          <div>
            <div className="font-bold">{String(meta.name || 'Design system')}</div>
            <div className="text-[12px] text-text-muted">{String(meta.niche || '')} {meta.base ? `· base: ${meta.base}` : ''} {meta.ratified_by ? `· ratified by ${meta.ratified_by}` : ''}</div>
          </div>
        </div>
      )}

      {/* color tokens */}
      {Object.keys(colorTokens).length > 0 && (
        <Section title="Colors">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(colorTokens).filter(([, v]) => isHex(v)).map(([name, v]) => <Swatch key={name} name={name} hex={v as string} />)}
          </div>
        </Section>
      )}

      {/* color schemes */}
      {Object.keys(schemes).filter((k) => k.startsWith('scheme')).length > 0 && (
        <Section title="Color schemes">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(schemes).filter(([k]) => k.startsWith('scheme')).map(([k, v]) => {
              const s = asDict(v)
              return (
                <div key={k} className="rounded-lg border border-border overflow-hidden">
                  <div className="p-3" style={{ backgroundColor: String(s.background || '#fff'), color: String(s.foreground || '#000') }}>
                    <div className="text-[12px] font-semibold mb-2">{String(s.label || k)}</div>
                    {s.button ? <span className="inline-block text-[11px] px-3 py-1.5 rounded" style={{ backgroundColor: String(s.button), color: String(s.button_label || '#fff') }}>Button</span> : null}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* typography */}
      {(Object.keys(fonts).length > 0 || Object.keys(scale).length > 0) && (
        <Section title="Typography">
          <div className="space-y-2 text-[13px]">
            {Object.entries(fonts).map(([role, v]) => {
              const f = asDict(v)
              return <div key={role} className="flex items-center justify-between"><span className="text-text-muted capitalize">{role}</span><span style={{ fontFamily: `${f.family}, ${f.fallback || 'sans-serif'}` }} className="font-medium">{String(f.family || '')} <span className="text-text-muted text-[11px]">{String(f.use || '')}</span></span></div>
            })}
            {scale.ratio ? <div className="flex items-center justify-between"><span className="text-text-muted">scale</span><span>ratio {String(scale.ratio)} · base {String(scale.base_px || '')}px</span></div> : null}
          </div>
        </Section>
      )}

      {/* spacing */}
      {Object.keys(spacingTokens).length > 0 && (
        <Section title="Spacing">
          <div className="flex flex-wrap items-end gap-3">
            {Object.entries(spacingTokens).filter(([, v]) => typeof v === 'number').map(([name, v]) => (
              <div key={name} className="flex flex-col items-center gap-1">
                <div className="bg-accent/30 border-b-2 border-accent" style={{ width: 10, height: Math.min(Number(v), 96) }} />
                <code className="text-[10px] text-text-muted">{name}:{String(v)}</code>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* buttons */}
      {Object.keys(buttons).length > 0 && (
        <Section title="Buttons">
          <div className="flex flex-wrap gap-3">
            {Object.entries(buttons).map(([name, v]) => {
              const b = asDict(v)
              return <span key={name} className="text-[12px] px-4 py-2 rounded font-medium" style={{ backgroundColor: String(b.fill || '#000'), color: String(b.label || '#fff') }} title={String(b.use || '')}>{name}</span>
            })}
          </div>
        </Section>
      )}

      {/* voice */}
      {Object.keys(voice).length > 0 && (
        <Section title="Brand voice">
          <div className="text-[13px]"><b>{String(voice.tone || '')}</b></div>
          {Array.isArray(voice.constraints) && (
            <ul className="mt-2 space-y-1 text-[12px] text-text-muted">
              {(voice.constraints as unknown[]).map((c, i) => <li key={i}>• {String(c)}</li>)}
            </ul>
          )}
        </Section>
      )}
    </div>
  )
}
