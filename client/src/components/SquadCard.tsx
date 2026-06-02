import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { SquadDef } from '../lib/api'
import type { UnifiedAgent } from '../types'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { useTaxonomy } from '../hooks/useTaxonomy'

interface SquadCardProps {
  squad: SquadDef
  members: UnifiedAgent[]
  dottedMembers?: UnifiedAgent[]
  /** Optional custom click handler for an agent row (e.g. open editor). */
  onAgentClick?: (agent: UnifiedAgent) => void
  /** Hide the card if zero members + not a placeholder. Default: show always. */
  hideIfEmpty?: boolean
  defaultCollapsed?: boolean
}

interface RoleBandGroup {
  band: string
  label: string
  agents: UnifiedAgent[]
}

function groupByRoleBand(
  agents: UnifiedAgent[],
  roleBands: string[],
  roleBandFor: (id: string) => string,
  roleBandLabel: (band: string) => string,
): RoleBandGroup[] {
  const byBand = new Map<string, UnifiedAgent[]>()
  for (const agent of agents) {
    const band = roleBandFor(agent.filename || agent.org?.title || '') || 'lead'
    if (!byBand.has(band)) byBand.set(band, [])
    byBand.get(band)!.push(agent)
  }
  const ordered: RoleBandGroup[] = []
  const seen = new Set<string>()
  for (const band of roleBands) {
    if (byBand.has(band)) {
      ordered.push({ band, label: roleBandLabel(band), agents: byBand.get(band)! })
      seen.add(band)
    }
  }
  // Fallback: any unmapped bands appended at end
  for (const [band, list] of byBand) {
    if (!seen.has(band)) {
      ordered.push({ band, label: roleBandLabel(band), agents: list })
    }
  }
  return ordered
}

export function SquadCard({
  squad,
  members,
  dottedMembers = [],
  onAgentClick,
  hideIfEmpty = false,
  defaultCollapsed = false,
}: SquadCardProps) {
  const { roleBandFor, roleBandLabel } = useTaxonomy()
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  const totalCount = members.length + dottedMembers.length
  if (hideIfEmpty && totalCount === 0 && !squad.placeholder) return null

  const leadId = squad.lead || null
  const lead = leadId ? members.find(m => m.filename === leadId) : null
  const nonLeadMembers = lead ? members.filter(m => m.filename !== leadId) : members

  const roleBands = squad.roleBands && squad.roleBands.length > 0
    ? squad.roleBands.filter(b => b !== 'lead')
    : ['lead']

  const groups = groupByRoleBand(nonLeadMembers, roleBands, roleBandFor, roleBandLabel)

  const accentStyle = { borderColor: `${squad.color}40` }

  return (
    <div
      className="bg-surface rounded-xl border border-border overflow-hidden transition-colors hover:border-accent/30"
      style={accentStyle}
    >
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-expanded={!collapsed}
        aria-controls={`squad-body-${squad.id}`}
      >
        {collapsed
          ? <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
          : <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />}
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
          style={{ backgroundColor: `${squad.color}1a`, color: squad.color }}
          aria-hidden="true"
        >
          {squad.emoji}
        </span>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text truncate">{squad.label}</span>
            <span className="text-[11px] text-text-muted">
              {totalCount} {totalCount === 1 ? 'agent' : 'agents'}
            </span>
            {squad.placeholder ? (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Placeholder
              </span>
            ) : null}
          </div>
          {squad.description ? (
            <div className="text-[11px] text-text-muted truncate mt-0.5">{squad.description}</div>
          ) : null}
        </div>
        {lead ? (
          <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-text-muted shrink-0">
            <span className="text-text-muted/60">Lead</span>
            <span className="font-medium text-text">{formatAgentDisplay(lead).fullDisplay}</span>
          </span>
        ) : null}
      </button>

      {!collapsed && (
        <div id={`squad-body-${squad.id}`} className="border-t border-border">
          {lead ? (
            <AgentRow
              agent={lead}
              isLead
              squadColor={squad.color}
              onClick={onAgentClick}
            />
          ) : null}

          {groups.length === 0 && !lead && !squad.placeholder ? (
            <div className="px-4 py-6 text-center text-[12px] text-text-muted">
              No agents assigned yet.
            </div>
          ) : null}

          {groups.map(group => (
            <div key={group.band}>
              <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-text-muted bg-surface-2/40">
                {group.label}
              </div>
              {group.agents.map(agent => (
                <AgentRow
                  key={agent.filename}
                  agent={agent}
                  squadColor={squad.color}
                  onClick={onAgentClick}
                />
              ))}
            </div>
          ))}

          {dottedMembers.length > 0 ? (
            <div className="border-t border-dashed border-border/60">
              <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-text-muted/80 bg-surface-2/40">
                Dotted-line specialists
              </div>
              {dottedMembers.map(agent => (
                <AgentRow
                  key={`dotted-${agent.filename}`}
                  agent={agent}
                  dotted
                  squadColor={squad.color}
                  onClick={onAgentClick}
                />
              ))}
            </div>
          ) : null}

          {squad.placeholder && members.length <= 1 ? (
            <div className="px-4 py-4 text-[12px] text-text-muted italic border-t border-border/60">
              Specialists not yet hired. Lead-only placeholder team.
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

interface AgentRowProps {
  agent: UnifiedAgent
  isLead?: boolean
  dotted?: boolean
  squadColor: string
  onClick?: (agent: UnifiedAgent) => void
}

function AgentRow({ agent, isLead = false, dotted = false, squadColor, onClick }: AgentRowProps) {
  const display = formatAgentDisplay({
    name: agent.name,
    title: agent.org?.title,
    description: agent.frontmatter?.description as string | undefined,
    id: agent.filename,
  })

  const status = agent.org?.status
  const isInteractive = !!onClick

  const baseClass = isLead
    ? 'border-l-[3px] border-l-accent bg-accent/[0.06]'
    : dotted
    ? 'border-l border-dashed border-border/60 opacity-75'
    : 'border-l border-l-transparent'

  const Wrapper = isInteractive ? 'button' : 'div'

  return (
    <Wrapper
      type={isInteractive ? 'button' : undefined}
      onClick={isInteractive ? () => onClick!(agent) : undefined}
      className={`w-full flex items-center gap-3 px-4 py-2 text-left ${baseClass} ${
        isInteractive ? 'hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40' : ''
      }`}
    >
      <span
        className={`${isLead ? 'w-9 h-9 text-base' : 'w-7 h-7 text-sm'} rounded-full flex items-center justify-center shrink-0 transition-all`}
        style={{ backgroundColor: dotted ? 'transparent' : `${squadColor}14`, color: squadColor }}
        aria-hidden="true"
      >
        {display.emoji || '🤖'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`${isLead ? 'text-sm font-semibold' : 'text-[13px] font-medium'} text-text truncate`}>{display.realName}</span>
          {isLead ? (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent text-white font-extrabold">
              Lead
            </span>
          ) : null}
          {dotted ? (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">
              Dotted
            </span>
          ) : null}
          {status && status !== 'active' ? (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border">
              {status}
            </span>
          ) : null}
        </div>
        {display.role ? (
          <div className="text-[11px] text-text-muted truncate">{display.role}</div>
        ) : null}
      </div>
    </Wrapper>
  )
}
