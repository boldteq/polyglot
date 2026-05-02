import React, { useState, useMemo } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line,
} from 'recharts';

// ============================================================================
// BOLDTEQ AGENT EXPANSION PLAN — 21 → 32 AGENTS
// Interactive JSX report. Bold dark theme, 6 tabs, Recharts visualizations.
// ============================================================================

const COLORS = {
  bg: '#0a0a0f',
  panel: '#121218',
  panelLight: '#1a1a24',
  border: '#2a2a3a',
  text: '#f5f5fa',
  textDim: '#8a8aa0',
  accent: '#7c3aed',     // violet
  accent2: '#06b6d4',    // cyan
  accent3: '#f59e0b',    // amber
  success: '#10b981',
  warn: '#f59e0b',
  danger: '#ef4444',
  crimson: '#dc2626',
  teal: '#14b8a6',
  gold: '#eab308',
};

const DEPT_COLORS = {
  leadership: '#7c3aed',
  shape: '#06b6d4',
  validate: '#f59e0b',
  build: '#10b981',
  launch: '#ec4899',
  measure: '#8b5cf6',
  intelligence: '#14b8a6',
  evolution: '#dc2626',
  specialized: '#eab308',
};

// ============================================================================
// DATA
// ============================================================================

const currentAgents = [
  { name: 'Rex', dept: 'leadership', role: 'Commander / Orchestrator', model: 'opus' },
  { name: 'Verdict', dept: 'leadership', role: 'Portfolio Decider', model: 'opus' },
  { name: 'Scout', dept: 'shape', role: 'Idea Validator', model: 'sonnet' },
  { name: 'Nova', dept: 'shape', role: 'Market Research', model: 'sonnet' },
  { name: 'Atlas', dept: 'shape', role: 'Market Sizer', model: 'sonnet' },
  { name: 'Ledger', dept: 'validate', role: 'Pricing & Unit Econ', model: 'sonnet' },
  { name: 'Pulse', dept: 'validate', role: 'User Research', model: 'sonnet' },
  { name: 'Echo', dept: 'validate', role: 'Distribution Planner', model: 'sonnet' },
  { name: 'Arya', dept: 'build', role: 'Architecture', model: 'opus' },
  { name: 'Riko', dept: 'build', role: 'Project Setup', model: 'sonnet' },
  { name: 'Vega', dept: 'build', role: 'Design', model: 'sonnet' },
  { name: 'Koda', dept: 'build', role: 'Feature Builder', model: 'sonnet' },
  { name: 'Luna', dept: 'build', role: 'Testing', model: 'sonnet' },
  { name: 'Sage', dept: 'build', role: 'Code Review', model: 'sonnet' },
  { name: 'Vex', dept: 'build', role: 'Bug Fixer', model: 'sonnet' },
  { name: 'Quill', dept: 'launch', role: 'Content & Copy', model: 'sonnet' },
  { name: 'Zeph', dept: 'launch', role: 'SEO', model: 'sonnet' },
  { name: 'Bolt', dept: 'launch', role: 'Deployment', model: 'sonnet' },
  { name: 'Hawk', dept: 'measure', role: 'Monitoring & Ops', model: 'sonnet' },
  { name: 'Orbit', dept: 'measure', role: 'Metrics Architect', model: 'sonnet' },
  { name: 'Mira', dept: 'measure', role: 'Knowledge Extraction', model: 'sonnet' },
];

const newAgents = [
  // Intelligence Dept (4)
  { name: 'Harvest', dept: 'intelligence', role: 'Multi-source Scraper (Skool/Reddit/HN/PH/G2)', model: 'sonnet',
    why: 'Continuous market signal every 3 days. No more stale research.', priority: 'P0' },
  { name: 'Prism', dept: 'intelligence', role: 'Signal Validator (dedup, spam filter, score 1-10)', model: 'sonnet',
    why: 'Raw scraper output is 80% noise. Prism filters to 20% signal.', priority: 'P0' },
  { name: 'Trend', dept: 'intelligence', role: 'Pattern Synthesizer', model: 'opus',
    why: 'Turns validated signal into actionable themes for Scout/Nova/Ledger.', priority: 'P0' },
  { name: 'Archivist', dept: 'intelligence', role: 'Memory Router', model: 'haiku',
    why: 'Routes insights into the right agent memory files automatically.', priority: 'P0' },

  // Agent Evolution Dept (3)
  { name: 'Forge', dept: 'evolution', role: 'Agent Architect', model: 'opus',
    why: 'Detects capability gaps, designs new agents, maintains registry.', priority: 'P0' },
  { name: 'Tutor', dept: 'evolution', role: 'Agent Trainer', model: 'opus',
    why: 'Weekly training cycles. Compound 1 delta × 52 weeks × 32 agents.', priority: 'P0' },
  { name: 'Refactor', dept: 'evolution', role: 'Prompt Optimizer', model: 'sonnet',
    why: 'Keeps every agent under 4000 tokens. Context efficiency compounds.', priority: 'P1' },

  // Specialized (4)
  { name: 'Finch', dept: 'specialized', role: 'Cost & Finance Watcher', model: 'haiku',
    why: 'Tracks Claude API spend, alerts on budget breach, forecasts monthly burn.', priority: 'P1' },
  { name: 'Guard', dept: 'specialized', role: 'Security Specialist', model: 'opus',
    why: 'Pentest, vuln scan, secret leak detection, SOC2 prep.', priority: 'P1' },
  { name: 'Reach', dept: 'specialized', role: 'Community Engagement', model: 'sonnet',
    why: 'Real-time Slack/Discord/Skool responses. 24/7 community presence.', priority: 'P2' },
  { name: 'Herald', dept: 'specialized', role: 'Content Publisher', model: 'haiku',
    why: 'Ships Quill output to LinkedIn/X/blog/newsletter. Closes publish loop.', priority: 'P2' },
];

const allAgents = [...currentAgents, ...newAgents];

const deptCounts = [
  { dept: 'Leadership', current: 2, future: 2 },
  { dept: 'Shape', current: 3, future: 3 },
  { dept: 'Validate', current: 3, future: 3 },
  { dept: 'Build', current: 7, future: 7 },
  { dept: 'Launch', current: 3, future: 3 },
  { dept: 'Measure', current: 3, future: 3 },
  { dept: 'Intelligence', current: 0, future: 4 },
  { dept: 'Evolution', current: 0, future: 3 },
  { dept: 'Specialized', current: 0, future: 4 },
];

const capabilityRadar = [
  { capability: 'Market Intel', before: 30, after: 95 },
  { capability: 'Agent Training', before: 20, after: 90 },
  { capability: 'Cost Control', before: 25, after: 85 },
  { capability: 'Security', before: 40, after: 90 },
  { capability: 'Community', before: 15, after: 80 },
  { capability: 'Publishing', before: 35, after: 90 },
  { capability: 'Self-Improvement', before: 25, after: 95 },
  { capability: 'Autonomy', before: 40, after: 95 },
];

const roadmap = [
  { week: 'W1', intel: 20, evolution: 0, specialized: 0 },
  { week: 'W2', intel: 60, evolution: 20, specialized: 0 },
  { week: 'W3', intel: 100, evolution: 50, specialized: 10 },
  { week: 'W4', intel: 100, evolution: 100, specialized: 40 },
  { week: 'W5', intel: 100, evolution: 100, specialized: 70 },
  { week: 'W6', intel: 100, evolution: 100, specialized: 100 },
];

const experienceCompression = [
  { metric: 'Years of experience encoded', value: '15+' },
  { metric: 'Team size equivalent', value: '500' },
  { metric: 'Weekly training deltas/agent', value: '1-3' },
  { metric: 'Anti-patterns total', value: '320+' },
  { metric: 'Compound time-to-expert', value: '60 days' },
  { metric: 'Context efficiency/agent', value: '<4k tok' },
];

// ============================================================================
// PRIMITIVES
// ============================================================================

const Badge = ({ children, color = COLORS.accent }) => (
  <span style={{
    display: 'inline-block', padding: '3px 10px', borderRadius: 999,
    fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
    background: `${color}22`, color, border: `1px solid ${color}55`,
  }}>{children}</span>
);

const Card = ({ children, style = {} }) => (
  <div style={{
    background: COLORS.panel, border: `1px solid ${COLORS.border}`,
    borderRadius: 14, padding: 22, ...style,
  }}>{children}</div>
);

const StatCard = ({ label, value, sub, color = COLORS.accent }) => (
  <Card style={{ borderLeft: `4px solid ${color}` }}>
    <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: 34, fontWeight: 900, color: COLORS.text, marginTop: 6, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 6 }}>{sub}</div>}
  </Card>
);

const TabButton = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    padding: '12px 22px', fontSize: 14, fontWeight: 700,
    background: active ? COLORS.accent : 'transparent',
    color: active ? '#fff' : COLORS.textDim,
    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
    borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
  }}>{children}</button>
);

const AgentChip = ({ agent, isNew }) => {
  const color = DEPT_COLORS[agent.dept] || COLORS.accent;
  return (
    <div style={{
      padding: '10px 14px', background: COLORS.panelLight,
      border: `1px solid ${isNew ? color : COLORS.border}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 2,
      position: 'relative',
    }}>
      {isNew && (
        <div style={{
          position: 'absolute', top: -8, right: -8, background: COLORS.success,
          color: '#000', fontSize: 9, fontWeight: 900, padding: '2px 6px',
          borderRadius: 4, letterSpacing: 0.5,
        }}>NEW</div>
      )}
      <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.text }}>{agent.name}</div>
      <div style={{ fontSize: 11, color: COLORS.textDim }}>{agent.role}</div>
      <div style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>
        {agent.dept} · {agent.model}
      </div>
    </div>
  );
};

// ============================================================================
// SECTIONS
// ============================================================================

const Header = () => (
  <div style={{
    background: `linear-gradient(135deg, ${COLORS.accent}15, ${COLORS.accent2}10)`,
    border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 36, marginBottom: 24,
  }}>
    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
      <Badge color={COLORS.accent}>Boldteq Software Factory</Badge>
      <Badge color={COLORS.accent2}>Expansion Plan</Badge>
      <Badge color={COLORS.success}>v2.0</Badge>
    </div>
    <h1 style={{ fontSize: 48, fontWeight: 900, margin: 0, color: COLORS.text, lineHeight: 1.05 }}>
      21 → 32 Agents
    </h1>
    <h2 style={{ fontSize: 22, fontWeight: 600, color: COLORS.textDim, margin: '10px 0 0' }}>
      The 360° Autonomous SaaS Factory · 15 Years Ahead · 500-Person Equivalent
    </h2>
    <p style={{ color: COLORS.textDim, marginTop: 18, maxWidth: 780, lineHeight: 1.6, fontSize: 15 }}>
      Three new departments. Eleven new agents. One mission: compress a lifetime of SaaS
      building experience — including every mistake — into a team that runs 24/7, learns
      every week, and never repeats a failure.
    </p>
  </div>
);

const OverviewSection = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      <StatCard label="Current Agents" value="21" sub="6 departments" color={COLORS.accent2} />
      <StatCard label="New Agents" value="+11" sub="3 new departments" color={COLORS.success} />
      <StatCard label="Total Future" value="32" sub="Across 9 departments" color={COLORS.accent} />
      <StatCard label="Time to Build" value="6 wks" sub="Phase 1→3 rollout" color={COLORS.accent3} />
    </div>

    <Card>
      <h3 style={{ margin: 0, color: COLORS.text, fontSize: 20 }}>The 3 New Departments</h3>
      <p style={{ color: COLORS.textDim, marginTop: 8, marginBottom: 20, fontSize: 14 }}>
        Each fills a gap the current 21-agent team cannot cover — not because they're bad,
        but because it's outside their scope.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div style={{ padding: 18, background: COLORS.panelLight, borderRadius: 10, borderTop: `4px solid ${DEPT_COLORS.intelligence}` }}>
          <Badge color={DEPT_COLORS.intelligence}>Intelligence</Badge>
          <h4 style={{ color: COLORS.text, margin: '10px 0 6px', fontSize: 17 }}>4 agents</h4>
          <div style={{ color: COLORS.textDim, fontSize: 13, lineHeight: 1.6 }}>
            Continuous market signal. Every 3 days: scrape → validate → synthesize → route to memory.
            Harvest, Prism, Trend, Archivist.
          </div>
        </div>
        <div style={{ padding: 18, background: COLORS.panelLight, borderRadius: 10, borderTop: `4px solid ${DEPT_COLORS.evolution}` }}>
          <Badge color={DEPT_COLORS.evolution}>Agent Evolution</Badge>
          <h4 style={{ color: COLORS.text, margin: '10px 0 6px', fontSize: 17 }}>3 agents</h4>
          <div style={{ color: COLORS.textDim, fontSize: 13, lineHeight: 1.6 }}>
            Meta-agents that train other agents. Forge (design), Tutor (weekly training),
            Refactor (keeps every agent &lt;4k tokens).
          </div>
        </div>
        <div style={{ padding: 18, background: COLORS.panelLight, borderRadius: 10, borderTop: `4px solid ${DEPT_COLORS.specialized}` }}>
          <Badge color={DEPT_COLORS.specialized}>Specialized</Badge>
          <h4 style={{ color: COLORS.text, margin: '10px 0 6px', fontSize: 17 }}>4 agents</h4>
          <div style={{ color: COLORS.textDim, fontSize: 13, lineHeight: 1.6 }}>
            Execution gaps. Finch (cost), Guard (security), Reach (community),
            Herald (publishing). Each covers a 24/7 domain.
          </div>
        </div>
      </div>
    </Card>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <Card>
        <h3 style={{ margin: 0, color: COLORS.text, fontSize: 18 }}>Headcount by Department</h3>
        <div style={{ height: 280, marginTop: 12 }}>
          <ResponsiveContainer>
            <BarChart data={deptCounts}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="dept" stroke={COLORS.textDim} fontSize={11} angle={-20} textAnchor="end" height={60} />
              <YAxis stroke={COLORS.textDim} fontSize={11} />
              <Tooltip contentStyle={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="current" fill={COLORS.accent2} name="Current" radius={[4, 4, 0, 0]} />
              <Bar dataKey="future" fill={COLORS.accent} name="Future" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <h3 style={{ margin: 0, color: COLORS.text, fontSize: 18 }}>Capability Coverage: Before vs After</h3>
        <div style={{ height: 280, marginTop: 12 }}>
          <ResponsiveContainer>
            <RadarChart data={capabilityRadar}>
              <PolarGrid stroke={COLORS.border} />
              <PolarAngleAxis dataKey="capability" stroke={COLORS.textDim} fontSize={10} />
              <PolarRadiusAxis stroke={COLORS.textDim} fontSize={9} />
              <Radar name="Before" dataKey="before" stroke={COLORS.accent2} fill={COLORS.accent2} fillOpacity={0.3} />
              <Radar name="After" dataKey="after" stroke={COLORS.accent} fill={COLORS.accent} fillOpacity={0.5} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  </div>
);

const OrgSection = () => {
  const grouped = useMemo(() => {
    const g = {};
    allAgents.forEach(a => {
      if (!g[a.dept]) g[a.dept] = [];
      g[a.dept].push(a);
    });
    return g;
  }, []);

  const deptOrder = ['leadership', 'shape', 'validate', 'build', 'launch', 'measure', 'intelligence', 'evolution', 'specialized'];
  const deptLabels = {
    leadership: 'Leadership', shape: 'Shape', validate: 'Validate', build: 'Build',
    launch: 'Launch', measure: 'Measure', intelligence: 'Intelligence (NEW)',
    evolution: 'Agent Evolution (NEW)', specialized: 'Specialized (NEW)',
  };
  const newSet = new Set(newAgents.map(a => a.name));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <h3 style={{ margin: 0, color: COLORS.text, fontSize: 20 }}>Full Org Chart — 32 Agents</h3>
        <p style={{ color: COLORS.textDim, marginTop: 6, fontSize: 13 }}>
          Agents marked <span style={{ color: COLORS.success, fontWeight: 800 }}>NEW</span> are part of the expansion.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
          {deptOrder.map(dept => (
            <div key={dept}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                paddingBottom: 8, borderBottom: `1px solid ${COLORS.border}`,
              }}>
                <Badge color={DEPT_COLORS[dept]}>{deptLabels[dept]}</Badge>
                <span style={{ color: COLORS.textDim, fontSize: 12 }}>
                  {grouped[dept]?.length || 0} agent{grouped[dept]?.length === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {grouped[dept]?.map(a => (
                  <AgentChip key={a.name} agent={a} isNew={newSet.has(a.name)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const IntelligenceSection = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <Card style={{ borderLeft: `4px solid ${DEPT_COLORS.intelligence}` }}>
      <Badge color={DEPT_COLORS.intelligence}>Intelligence Department</Badge>
      <h3 style={{ color: COLORS.text, margin: '10px 0 8px', fontSize: 22 }}>
        Continuous Market Signal Pipeline
      </h3>
      <p style={{ color: COLORS.textDim, fontSize: 14, lineHeight: 1.6 }}>
        Runs every 3 days. Never stops. Turns raw community chatter into validated, scored,
        routed intelligence sitting in the right agent's memory before Yash even wakes up.
      </p>
    </Card>

    <Card>
      <h3 style={{ margin: 0, color: COLORS.text, fontSize: 18 }}>Pipeline Flow</h3>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 24, gap: 12, flexWrap: 'wrap',
      }}>
        {[
          { name: 'Harvest', desc: 'Scrape raw', sources: 'Skool · Reddit · HN · PH · G2 · X' },
          { name: 'Prism', desc: 'Validate + score', sources: 'Dedup · Spam filter · Signal 1-10' },
          { name: 'Trend', desc: 'Synthesize', sources: 'Themes · Patterns · Opportunities' },
          { name: 'Archivist', desc: 'Route to memory', sources: 'Scout · Nova · Ledger · Echo' },
        ].map((step, i, arr) => (
          <React.Fragment key={step.name}>
            <div style={{
              flex: 1, minWidth: 180, padding: 16, background: COLORS.panelLight,
              borderRadius: 10, borderTop: `3px solid ${DEPT_COLORS.intelligence}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.text }}>{step.name}</div>
              <div style={{ fontSize: 12, color: DEPT_COLORS.intelligence, fontWeight: 700, marginTop: 4 }}>{step.desc}</div>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 8, lineHeight: 1.5 }}>{step.sources}</div>
            </div>
            {i < arr.length - 1 && (
              <div style={{ fontSize: 24, color: DEPT_COLORS.intelligence, fontWeight: 900 }}>→</div>
            )}
          </React.Fragment>
        ))}
      </div>
    </Card>

    <Card>
      <h3 style={{ margin: 0, color: COLORS.text, fontSize: 18 }}>Source Registry</h3>
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {[
          ['Skool', 'Cookie auth · 3d', 'Pain points, launches, pricing complaints'],
          ['Reddit', 'Public JSON · 3d', 'r/SaaS, r/Entrepreneur, r/shopify'],
          ['Hacker News', 'Firebase · 3d', 'Show HN, Ask HN launches'],
          ['Product Hunt', 'GraphQL · 3d', 'Competitor launches + positioning'],
          ['Twitter/X', 'nitter/API · 3d', 'Real-time viral pain points'],
          ['G2 / Capterra', 'Playwright · 7d', 'Negative reviews, churn triggers'],
          ['Indie Hackers', 'Public JSON · 7d', 'Revenue + pricing patterns'],
        ].map(([name, freq, desc]) => (
          <div key={name} style={{
            padding: 12, background: COLORS.panelLight, borderRadius: 8,
            borderLeft: `3px solid ${DEPT_COLORS.intelligence}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.text }}>{name}</div>
              <div style={{ fontSize: 10, color: COLORS.textDim }}>{freq}</div>
            </div>
            <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>{desc}</div>
          </div>
        ))}
      </div>
    </Card>
  </div>
);

const EvolutionSection = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <Card style={{ borderLeft: `4px solid ${DEPT_COLORS.evolution}` }}>
      <Badge color={DEPT_COLORS.evolution}>Agent Evolution Department</Badge>
      <h3 style={{ color: COLORS.text, margin: '10px 0 8px', fontSize: 22 }}>
        The Meta-Layer: Agents That Train Agents
      </h3>
      <p style={{ color: COLORS.textDim, fontSize: 14, lineHeight: 1.6 }}>
        This is where compounding happens. One training delta per agent per week × 32 agents × 52 weeks
        = <strong style={{ color: COLORS.text }}>1,664 improvements per year</strong>. That's how you
        encode 15 years of experience into 2 months.
      </p>
    </Card>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      {[
        {
          name: 'Forge', role: 'Agent Architect',
          cycle: 'Monthly gap audit',
          does: [
            'Scans Rex logs for repeated manual interventions',
            'Detects capability gaps from Mira feedback',
            'Writes new agent spec files (9-section template)',
            'Flags retirement candidates',
            'Maintains agent-registry.json',
          ],
        },
        {
          name: 'Tutor', role: 'Agent Trainer',
          cycle: 'Weekly training cycle',
          does: [
            'Ingests Yash feedback (P0) + Mira + Trend + Verdict',
            'Generates per-agent training deltas',
            'Applies surgical Edit calls to agent .md files',
            'Verifies fence integrity + token counts',
            'Emits training-YYYY-WW.md report',
          ],
        },
        {
          name: 'Refactor', role: 'Prompt Optimizer',
          cycle: 'On-demand + quarterly',
          does: [
            'Compresses agent prompts to <4000 tokens',
            'Consolidates redundant anti-patterns',
            'Extracts shared patterns to memory files',
            'Benchmarks before/after token counts',
            'Zero loss of capability, pure efficiency',
          ],
        },
      ].map(a => (
        <Card key={a.name} style={{ borderTop: `3px solid ${DEPT_COLORS.evolution}` }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text }}>{a.name}</div>
          <div style={{ fontSize: 13, color: DEPT_COLORS.evolution, fontWeight: 700, marginTop: 2 }}>{a.role}</div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 6, marginBottom: 12 }}>{a.cycle}</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {a.does.map((d, i) => (
              <li key={i} style={{
                fontSize: 12, color: COLORS.text, padding: '6px 0',
                borderTop: i > 0 ? `1px solid ${COLORS.border}` : 'none', lineHeight: 1.5,
              }}>→ {d}</li>
            ))}
          </ul>
        </Card>
      ))}
    </div>

    <Card>
      <h3 style={{ margin: 0, color: COLORS.text, fontSize: 18 }}>Compounding Math</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 14 }}>
        <StatCard label="Deltas / Agent / Week" value="1-3" color={DEPT_COLORS.evolution} />
        <StatCard label="Agents Trained" value="32" color={DEPT_COLORS.evolution} />
        <StatCard label="Improvements / Year" value="1,664" color={COLORS.success} sub="At 1 delta/agent/week" />
      </div>
    </Card>
  </div>
);

const SpecializedSection = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <Card style={{ borderLeft: `4px solid ${DEPT_COLORS.specialized}` }}>
      <Badge color={DEPT_COLORS.specialized}>Specialized Execution</Badge>
      <h3 style={{ color: COLORS.text, margin: '10px 0 8px', fontSize: 22 }}>
        24/7 Domain Coverage
      </h3>
      <p style={{ color: COLORS.textDim, fontSize: 14, lineHeight: 1.6 }}>
        Four gaps the current team doesn't cover: cost control, security depth, live community
        engagement, and the publishing loop. Each of these runs continuously.
      </p>
    </Card>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
      {[
        {
          name: 'Finch', emoji: '💰', role: 'Cost & Finance Watcher', model: 'haiku',
          why: 'Claude API spend can balloon silently across 32 agents. Finch tracks per-agent tokens, forecasts monthly burn, alerts on budget breach, and auto-downgrades models when safe.',
          triggers: 'Daily spend check · Weekly forecast · Budget breach alert',
        },
        {
          name: 'Guard', emoji: '🛡️', role: 'Security Specialist', model: 'opus',
          why: 'Sage does code review but security deserves its own specialist. Guard runs dependency CVE scans, pentest simulations, secret leak detection, and SOC2 prep work.',
          triggers: 'Pre-deploy scan · Weekly CVE audit · Continuous secret scanning',
        },
        {
          name: 'Reach', emoji: '📣', role: 'Community Engagement', model: 'sonnet',
          why: 'Real-time responses in Slack, Discord, Skool — 24/7 presence that current agents can\'t do (they run on tasks, not events). Reach is event-driven.',
          triggers: 'Webhook on new message · Mention detection · Auto-reply gate',
        },
        {
          name: 'Herald', emoji: '📢', role: 'Content Publisher', model: 'haiku',
          why: 'Quill writes, but who ships? Herald closes the loop: takes Quill output and publishes to LinkedIn, X, blog, newsletter, changelog. Full distribution automation.',
          triggers: 'On Quill completion · Scheduled publishing · Cross-post logic',
        },
      ].map(a => (
        <Card key={a.name} style={{ borderTop: `3px solid ${DEPT_COLORS.specialized}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 26 }}>{a.emoji}</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.text }}>{a.name}</div>
              <div style={{ fontSize: 12, color: DEPT_COLORS.specialized, fontWeight: 700 }}>{a.role} · {a.model}</div>
            </div>
          </div>
          <p style={{ color: COLORS.textDim, fontSize: 13, lineHeight: 1.6, marginTop: 10, marginBottom: 10 }}>
            {a.why}
          </p>
          <div style={{ fontSize: 11, color: COLORS.text, padding: 8, background: COLORS.panelLight, borderRadius: 6 }}>
            <strong style={{ color: DEPT_COLORS.specialized }}>Triggers:</strong> {a.triggers}
          </div>
        </Card>
      ))}
    </div>
  </div>
);

const RoadmapSection = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <Card>
      <h3 style={{ margin: 0, color: COLORS.text, fontSize: 20 }}>6-Week Rollout Plan</h3>
      <p style={{ color: COLORS.textDim, marginTop: 6, fontSize: 13 }}>
        Department-by-department buildout. Intelligence first (unlocks everything else),
        then Evolution (compounds), then Specialized (fills remaining gaps).
      </p>
      <div style={{ height: 300, marginTop: 18 }}>
        <ResponsiveContainer>
          <LineChart data={roadmap}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="week" stroke={COLORS.textDim} fontSize={12} />
            <YAxis stroke={COLORS.textDim} fontSize={12} />
            <Tooltip contentStyle={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="intel" stroke={DEPT_COLORS.intelligence} strokeWidth={3} name="Intelligence" />
            <Line type="monotone" dataKey="evolution" stroke={DEPT_COLORS.evolution} strokeWidth={3} name="Evolution" />
            <Line type="monotone" dataKey="specialized" stroke={DEPT_COLORS.specialized} strokeWidth={3} name="Specialized" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      {[
        {
          phase: 'Phase 1: Intelligence', weeks: 'Week 1-3', color: DEPT_COLORS.intelligence,
          deliverables: [
            'Build Harvest (Playwright + API wrappers)',
            'Ship Prism validator + scoring',
            'Deploy Trend synthesizer (opus)',
            'Wire Archivist to memory routing',
            'Schedule every-3-day cron in Polyglot',
            'First production signal ingested',
          ],
        },
        {
          phase: 'Phase 2: Evolution', weeks: 'Week 2-4', color: DEPT_COLORS.evolution,
          deliverables: [
            'Ship Forge with gap detection',
            'Bootstrap agent-registry.json',
            'Ship Tutor with weekly cycle',
            'Ship Refactor with token benchmarking',
            'Run first training cycle across 21 agents',
            'First auto-generated agent spec',
          ],
        },
        {
          phase: 'Phase 3: Specialized', weeks: 'Week 4-6', color: DEPT_COLORS.specialized,
          deliverables: [
            'Ship Finch (cost tracking dashboard)',
            'Ship Guard (CVE + secret scans)',
            'Ship Reach (event-driven webhook)',
            'Ship Herald (publishing pipeline)',
            'Full 32-agent integration test',
            'Yash digest: all systems green',
          ],
        },
      ].map(p => (
        <Card key={p.phase} style={{ borderTop: `3px solid ${p.color}` }}>
          <Badge color={p.color}>{p.weeks}</Badge>
          <h4 style={{ color: COLORS.text, margin: '10px 0 10px', fontSize: 17 }}>{p.phase}</h4>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {p.deliverables.map((d, i) => (
              <li key={i} style={{
                fontSize: 12, color: COLORS.text, padding: '7px 0',
                borderTop: i > 0 ? `1px solid ${COLORS.border}` : 'none', lineHeight: 1.5,
              }}>✓ {d}</li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  </div>
);

const VisionSection = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <Card style={{
      background: `linear-gradient(135deg, ${COLORS.accent}20, ${COLORS.crimson}15)`,
      borderLeft: `4px solid ${COLORS.accent}`,
    }}>
      <Badge color={COLORS.accent}>Vision</Badge>
      <h2 style={{ color: COLORS.text, margin: '12px 0 10px', fontSize: 32, fontWeight: 900, lineHeight: 1.15 }}>
        15 Years Ahead. 500 People. 60 Days.
      </h2>
      <p style={{ color: COLORS.textDim, fontSize: 16, lineHeight: 1.65, maxWidth: 760 }}>
        Every mistake a solo SaaS founder makes, encoded as an anti-pattern before you make it.
        Every market signal, ingested before you read it. Every agent, smarter every week.
        A factory that builds while you sleep and teaches itself while you work.
      </p>
    </Card>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {experienceCompression.map(m => (
        <StatCard key={m.metric} label={m.metric} value={m.value} color={COLORS.accent} />
      ))}
    </div>

    <Card>
      <h3 style={{ margin: 0, color: COLORS.text, fontSize: 20 }}>How We Get to "15 Years Ahead"</h3>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          {
            title: '1. Encode every failure as an anti-pattern',
            body: 'Every agent has ~10 anti-patterns today. Target: 20+. Tutor adds new ones weekly from Yash feedback + Verdict post-decision monitoring. At 1 new anti-pattern per agent per week, that\'s 1,664 encoded mistakes in year 1.',
          },
          {
            title: '2. Compound knowledge via Mira + Tutor',
            body: 'Mira captures lessons → Tutor injects them as training deltas → All 32 agents improve. Feedback loop runs weekly, never stops.',
          },
          {
            title: '3. Continuous market signal, never stale',
            body: 'Harvest → Prism → Trend → Archivist runs every 3 days. Scout, Nova, Ledger, Echo all read fresh signal. No more outdated competitive intel.',
          },
          {
            title: '4. Autonomous execution 24/7',
            body: 'Schedules + webhooks + persistent daemon. Polyglot runs while Yash sleeps. Pipelines parallelize. Failure recovery auto-triggers Vex.',
          },
          {
            title: '5. Self-improving meta-layer',
            body: 'Forge detects gaps, writes new agents. Refactor keeps everyone lean. Tutor trains everyone weekly. The factory refactors itself.',
          },
        ].map((item, i) => (
          <div key={i} style={{
            padding: 14, background: COLORS.panelLight, borderRadius: 10,
            borderLeft: `3px solid ${COLORS.accent}`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.text }}>{item.title}</div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 6, lineHeight: 1.6 }}>{item.body}</div>
          </div>
        ))}
      </div>
    </Card>

    <Card style={{ borderLeft: `4px solid ${COLORS.success}` }}>
      <Badge color={COLORS.success}>Next Action</Badge>
      <h3 style={{ color: COLORS.text, margin: '10px 0 8px', fontSize: 18 }}>
        Start with Phase 1: Harvest + Prism + Trend + Archivist
      </h3>
      <p style={{ color: COLORS.textDim, fontSize: 13, lineHeight: 1.6 }}>
        Draft specs for <strong style={{ color: COLORS.text }}>Harvest</strong>,{' '}
        <strong style={{ color: COLORS.text }}>Forge</strong>, and{' '}
        <strong style={{ color: COLORS.text }}>Tutor</strong> have been created at{' '}
        <code style={{ color: COLORS.accent2 }}>~/.claude/agents/</code>. Review, refine, then ship.
        Next: draft Prism + Trend + Archivist specs, wire into Polyglot scheduler, and run
        the first harvest cycle.
      </p>
    </Card>
  </div>
);

// ============================================================================
// MAIN
// ============================================================================

export default function AgentExpansionPlan() {
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'org', label: 'Full Org Chart' },
    { id: 'intelligence', label: 'Intelligence Dept' },
    { id: 'evolution', label: 'Evolution Dept' },
    { id: 'specialized', label: 'Specialized Dept' },
    { id: 'roadmap', label: 'Roadmap' },
    { id: 'vision', label: 'Vision' },
  ];

  return (
    <div style={{
      background: COLORS.bg, minHeight: '100vh', padding: 32,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif',
      color: COLORS.text,
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <Header />

        <div style={{
          display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap',
          padding: 8, background: COLORS.panel, borderRadius: 14,
          border: `1px solid ${COLORS.border}`,
        }}>
          {tabs.map(t => (
            <TabButton key={t.id} active={activeTab === t.id} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </TabButton>
          ))}
        </div>

        {activeTab === 'overview' && <OverviewSection />}
        {activeTab === 'org' && <OrgSection />}
        {activeTab === 'intelligence' && <IntelligenceSection />}
        {activeTab === 'evolution' && <EvolutionSection />}
        {activeTab === 'specialized' && <SpecializedSection />}
        {activeTab === 'roadmap' && <RoadmapSection />}
        {activeTab === 'vision' && <VisionSection />}

        <div style={{
          marginTop: 40, padding: 20, textAlign: 'center',
          color: COLORS.textDim, fontSize: 12, borderTop: `1px solid ${COLORS.border}`,
        }}>
          Boldteq Software Factory · Agent Expansion Plan v2.0 · 21 → 32 agents · Built for Yash
        </div>
      </div>
    </div>
  );
}
