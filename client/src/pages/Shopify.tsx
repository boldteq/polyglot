import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Plus, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Skeleton'
import { listShopifyProjects, createShopifyIntake, type ClientProject } from '../lib/api'
import { toast } from '../components/Toast'

const NICHES = ['apparel', 'beauty', 'cpg-food', 'haircare', 'supplements', 'other']
const ALL_PAGES = [
  { slug: 'home', title: 'Home' }, { slug: 'product', title: 'Product (PDP)' },
  { slug: 'collection', title: 'Collection' }, { slug: 'cart', title: 'Cart' },
  { slug: 'about', title: 'About' }, { slug: 'contact', title: 'Contact' },
]
const STATUS_TONE: Record<string, string> = { intake: 'bg-amber', building: 'bg-purple', preview: 'bg-green', published: 'bg-green' }

export default function Shopify() {
  const nav = useNavigate()
  const [projects, setProjects] = useState<ClientProject[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wizard, setWizard] = useState(false)

  const load = useCallback(() => {
    setError(null)
    listShopifyProjects().then(r => setProjects(r.projects)).catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <PageShell
      title="Shopify Stores"
      subtitle="Client store builds — intake captured once, then atrium runs the 18-step pipeline"
      actions={!wizard && <button onClick={() => setWizard(true)} className="btn-primary btn-sm flex items-center gap-1.5"><Plus className="w-4 h-4" />New store</button>}
    >
      {wizard ? (
        <IntakeWizard onCancel={() => setWizard(false)} onDone={(id) => { setWizard(false); load(); nav(`/shopify/${id}`) }} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : projects === null ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <EmptyState icon={Store} title="No store builds yet" description="Start a new store — the intake wizard captures brand, audience, niche + pages once, so the agents never re-ask." action={{ label: 'New store intake', onClick: () => setWizard(true) }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(p => (
            <button key={p.id} onClick={() => nav(`/shopify/${p.id}`)} className="card p-5 text-left hover:shadow-md transition-shadow flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-[13px] text-text-muted">{p.niche || 'niche tbd'}{p.domain ? ` · ${p.domain}` : ''}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs text-white px-2 py-1 rounded-full ${STATUS_TONE[p.status] || 'bg-text-muted'}`}>{p.status}</span>
                <ArrowRight className="w-4 h-4 text-text-muted" />
              </div>
            </button>
          ))}
        </div>
      )}
    </PageShell>
  )
}

function IntakeWizard({ onCancel, onDone }: { onCancel: () => void; onDone: (id: string) => void }) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    name: '', domain: '', niche: NICHES[0], adjectives: '', audience: '', pains: '',
    pages: ALL_PAGES.map(p => p.slug), lift_target: 0.2,
  })
  const set = (k: string, v: unknown) => setF(s => ({ ...s, [k]: v }))
  const togglePage = (slug: string) => setF(s => ({ ...s, pages: s.pages.includes(slug) ? s.pages.filter(x => x !== slug) : [...s.pages, slug] }))

  const steps = ['Brand', 'Audience', 'Pages', 'Confirm']
  const canNext = step === 0 ? f.name.trim().length > 0 : true

  const submit = async () => {
    setBusy(true)
    try {
      const r = await createShopifyIntake({
        brand: f.name, name: f.name, domain: f.domain || null, niche: f.niche,
        brand_adjectives: f.adjectives.split(',').map(s => s.trim()).filter(Boolean),
        audience: f.audience, pain_points: f.pains,
        pages: ALL_PAGES.filter(p => f.pages.includes(p.slug)),
        lift_target: f.lift_target,
      })
      toast('success', `Store "${r.name}" created — ${r.pages} pages queued`)
      onDone(r.id)
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Intake failed'); setBusy(false) }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i < step ? 'bg-green text-white' : i === step ? 'bg-purple text-white' : 'bg-text-muted/15 text-text-muted'}`}>{i < step ? <Check className="w-4 h-4" /> : i + 1}</div>
            <span className={`text-[13px] ${i === step ? 'font-semibold' : 'text-text-muted'}`}>{s}</span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
          </div>
        ))}
      </div>

      <div className="card p-6 space-y-4">
        {step === 0 && <>
          <Field label="Brand name *"><input className="input w-full" value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Lumen Sleep" autoFocus /></Field>
          <Field label="Store domain"><input className="input w-full" value={f.domain} onChange={e => set('domain', e.target.value)} placeholder="lumen.myshopify.com" /></Field>
          <Field label="Niche (auto-selects the tuned design DNA pack)"><select className="input w-full" value={f.niche} onChange={e => set('niche', e.target.value)}>{NICHES.map(n => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label="Brand personality — 3 adjectives (comma-separated)"><input className="input w-full" value={f.adjectives} onChange={e => set('adjectives', e.target.value)} placeholder="clinical, calm, premium" /></Field>
        </>}
        {step === 1 && <>
          <Field label="Target audience"><textarea className="input w-full" rows={2} value={f.audience} onChange={e => set('audience', e.target.value)} placeholder="Who is this for?" /></Field>
          <Field label="Pain points it solves"><textarea className="input w-full" rows={2} value={f.pains} onChange={e => set('pains', e.target.value)} placeholder="The problems the product addresses" /></Field>
        </>}
        {step === 2 && <>
          <Field label="Pages to build (recommended set pre-checked)">
            <div className="grid grid-cols-2 gap-2">
              {ALL_PAGES.map(p => (
                <label key={p.slug} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={f.pages.includes(p.slug)} onChange={() => togglePage(p.slug)} /> {p.title}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Conversion lift target"><input className="input w-full" type="number" step="0.05" value={f.lift_target} onChange={e => set('lift_target', Number(e.target.value))} /></Field>
        </>}
        {step === 3 && <div className="text-[13px] space-y-1.5">
          <Row k="Brand" v={`${f.name}${f.domain ? ` · ${f.domain}` : ''}`} />
          <Row k="Niche" v={f.niche} />
          <Row k="Personality" v={f.adjectives || '—'} />
          <Row k="Audience" v={f.audience || '—'} />
          <Row k="Pages" v={f.pages.join(', ')} />
          <Row k="Lift target" v={String(f.lift_target)} />
          <p className="text-text-muted pt-2">On confirm, atrium dispatches the 18-step pipeline. No more clarifying questions until the design-direction checkpoint.</p>
        </div>}
      </div>

      <div className="flex items-center justify-between mt-4">
        <button onClick={step === 0 ? onCancel : () => setStep(step - 1)} className="btn-ghost btn-sm flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />{step === 0 ? 'Cancel' : 'Back'}</button>
        {step < 3
          ? <button disabled={!canNext} onClick={() => setStep(step + 1)} className="btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-50">Next<ArrowRight className="w-4 h-4" /></button>
          : <button disabled={busy} onClick={submit} className="btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-50"><Check className="w-4 h-4" />{busy ? 'Creating…' : 'Confirm + build'}</button>}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="text-[13px] font-medium block mb-1.5">{label}</span>{children}</label>
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-3"><span className="text-text-muted w-24 shrink-0">{k}</span><span className="font-medium">{v}</span></div>
}
