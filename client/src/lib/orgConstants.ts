// Offline fallback constants — ONLY used when API is unreachable.
// Department colors and order now come from /api/departments (single source of truth).
// Never import DEPT_COLORS or DEPT_ORDER for UI rendering — use useDepartments() hook.

export interface SquadConfig {
  id: string
  label: string
  color: string
  emoji: string
  description?: string
}

export const SQUADS: SquadConfig[] = [
  { id: 'shopify-ecom',  label: 'Shopify Ecom',   color: '#10b981', emoji: '🛍️', description: 'Storefront, ecom UI, copy, cart, lifecycle email' },
  { id: 'saas-stack-a',  label: 'SaaS Stack A',   color: '#3b82f6', emoji: '⚡',  description: 'Next.js + Supabase + Railway product builders' },
  { id: 'figma-design',  label: 'Figma & Design', color: '#a855f7', emoji: '🎨', description: 'Design system, UI/UX, deliverables' },
  { id: 'cro-growth',    label: 'CRO & Growth',   color: '#f97316', emoji: '📈', description: 'Conversion, distribution, market intel' },
  { id: 'research',      label: 'Research',       color: '#06b6d4', emoji: '🔬', description: 'Validation, market sizing, pricing, metrics' },
  { id: 'platform-ops',  label: 'Platform & Ops', color: '#eab308', emoji: '⚙️', description: 'Architecture, deploy, monitoring, review' },
  { id: 'hr-ops',        label: 'HR & Ops',       color: '#ec4899', emoji: '👑', description: 'Agent lifecycle, hiring, training' },
]

export const SQUAD_BY_ID: Record<string, SquadConfig> = Object.fromEntries(SQUADS.map(s => [s.id, s]))

export type TagCategory = 'tech' | 'work-type'

export interface TagCategoryConfig {
  label: string
  tags: string[]
  pill: string
  pillActive: string
}

export const TAG_TAXONOMY: Record<TagCategory, TagCategoryConfig> = {
  'work-type': {
    label: 'Work',
    tags: ['design', 'coding', 'testing', 'copywriting', 'strategy', 'research', 'review', 'deploy', 'monitoring', 'training', 'email'],
    pill: 'bg-purple-500/12 text-purple-400 border border-purple-500/25 hover:bg-purple-500/20',
    pillActive: 'bg-purple-500 text-white border border-purple-500',
  },
  tech: {
    label: 'Tech',
    tags: ['shopify', 'nextjs', 'supabase', 'react', 'typescript', 'figma', 'tailwind', 'postgresql', 'playwright', 'railway', 'polaris', 'shadcn'],
    pill: 'bg-blue-500/12 text-blue-400 border border-blue-500/25 hover:bg-blue-500/20',
    pillActive: 'bg-blue-500 text-white border border-blue-500',
  },
}
