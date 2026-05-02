import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from "recharts";

const COLORS = {
  bg: "#0a0a0f",
  card: "#12121a",
  cardHover: "#1a1a28",
  border: "#1e1e2e",
  accent: "#6366f1",
  accentGlow: "rgba(99,102,241,0.15)",
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  orange: "#f97316",
  cyan: "#06b6d4",
  purple: "#a855f7",
  pink: "#ec4899",
  text: "#e2e8f0",
  textDim: "#94a3b8",
  textMuted: "#64748b",
};

const CHART_COLORS = ["#6366f1", "#22c55e", "#06b6d4", "#f97316", "#a855f7", "#ec4899", "#eab308", "#ef4444"];

// ─── Data ────────────────────────────────────────────────────────────────────

const architectureData = {
  stack: [
    { layer: "Frontend", tech: "React 19 + TypeScript + Vite + Tailwind", lines: 3300, status: "production" },
    { layer: "Backend", tech: "Node.js + Express (single server.js)", lines: 3610, status: "production" },
    { layer: "SDK", tech: "@boldteq/agents (npm package)", lines: 122, status: "production" },
    { layer: "VS Code Ext", tech: "VS Code API + WebViews", lines: 800, status: "production" },
    { layer: "Data Store", tech: "JSON files + Markdown on disk", lines: 0, status: "production" },
    { layer: "Execution", tech: "claude -p subprocess + SSE streaming", lines: 0, status: "production" },
  ],
  endpoints: 60,
  pages: 28,
  components: 11,
};

const featureScores = [
  { feature: "Agent CRUD", score: 95, category: "Core" },
  { feature: "Orchestration DAG", score: 95, category: "Core" },
  { feature: "Playground", score: 100, category: "Core" },
  { feature: "Memory System", score: 95, category: "Core" },
  { feature: "Project Discovery", score: 85, category: "Core" },
  { feature: "Schedules (Cron)", score: 95, category: "Automation" },
  { feature: "Webhooks", score: 95, category: "Automation" },
  { feature: "Analytics", score: 95, category: "Observability" },
  { feature: "VS Code Extension", score: 95, category: "Integration" },
  { feature: "SDK", score: 95, category: "Integration" },
  { feature: "Goal Cascade", score: 95, category: "Strategy" },
  { feature: "Documentation", score: 100, category: "Docs" },
  { feature: "Dark Theme", score: 95, category: "UX" },
  { feature: "Rich Editor", score: 90, category: "UX" },
];

const agentPipeline = [
  { phase: "SHAPE", agents: ["Scout"], color: "#6366f1", desc: "Validate pain, ICP, distribution" },
  { phase: "VALIDATE", agents: ["Atlas", "Ledger"], color: "#06b6d4", desc: "Market size, pricing, unit economics" },
  { phase: "BUILD", agents: ["Nova", "Arya", "Riko", "Vega", "Koda", "Quill", "Luna", "Sage", "Zeph"], color: "#22c55e", desc: "Research → Architecture → Scaffold → Design → Code → Copy → Test → Audit → SEO" },
  { phase: "LAUNCH", agents: ["Echo", "Bolt", "Hawk"], color: "#f97316", desc: "Distribution → Deploy → Monitor" },
  { phase: "MEASURE", agents: ["Orbit", "Pulse"], color: "#a855f7", desc: "Metrics framework, user research" },
  { phase: "DECIDE", agents: ["Verdict", "Mira"], color: "#ec4899", desc: "Scale/Pivot/Kill + Knowledge extraction" },
];

const gapAnalysis = [
  { area: "Autonomous Execution", current: 30, needed: 95, priority: "P0", effort: "2 weeks", items: ["Background job queue", "Event-driven triggers", "Persistent daemon", "State recovery"] },
  { area: "Parallel Pipelines", current: 0, needed: 90, priority: "P0", effort: "1 week", items: ["Fan-out branch detection", "Promise.all() execution", "Concurrent status UI"] },
  { area: "Conditional Logic", current: 15, needed: 85, priority: "P1", effort: "1 week", items: ["If/then edges", "Variable binding ($prev.output)", "Loop nodes", "Switch routing"] },
  { area: "Cost Tracking", current: 20, needed: 90, priority: "P1", effort: "3 days", items: ["Real Claude API integration", "Token counting", "Budget limits", "Per-project rollup"] },
  { area: "Agent Versioning", current: 0, needed: 80, priority: "P1", effort: "1 week", items: ["Git integration", "Semantic versions", "Diff viewer", "Rollback"] },
  { area: "Failure Recovery", current: 15, needed: 90, priority: "P0", effort: "3 days", items: ["Auto-retry with backoff", "Fallback agents", "Slack/email alerts", "Circuit breaker"] },
  { area: "Human-in-Loop", current: 0, needed: 70, priority: "P2", effort: "2 days", items: ["Pause nodes", "Approval UI", "Timeout handling"] },
  { area: "Multi-Category", current: 40, needed: 90, priority: "P1", effort: "1 week", items: ["Workspace switching", "Category taxonomy", "Cross-project orchestration", "Project templates"] },
  { area: "Long-Running Jobs", current: 10, needed: 80, priority: "P2", effort: "2 days", items: ["Configurable timeouts", "Checkpointing", "Background execution"] },
  { area: "Distributed Exec", current: 0, needed: 60, priority: "P3", effort: "2 weeks", items: ["Multi-machine support", "Load balancing", "Cloud execution"] },
];

const roadmapPhases = [
  {
    phase: "Phase 1: Autonomous 24/7",
    weeks: "Week 1-2",
    impact: "CRITICAL",
    items: [
      { name: "Background Job Queue", effort: "3d", impact: 10 },
      { name: "Event-Driven Webhooks", effort: "2d", impact: 9 },
      { name: "Run Dashboard (Live)", effort: "2d", impact: 7 },
      { name: "Persistent Daemon", effort: "1d", impact: 8 },
      { name: "Failure Auto-Retry", effort: "1d", impact: 8 },
    ],
  },
  {
    phase: "Phase 2: Smart Orchestration",
    weeks: "Week 3-4",
    impact: "HIGH",
    items: [
      { name: "Conditional Execution", effort: "5d", impact: 9 },
      { name: "Parallel Execution", effort: "3d", impact: 10 },
      { name: "Human-in-Loop Gates", effort: "2d", impact: 6 },
      { name: "Long-Running Jobs", effort: "2d", impact: 7 },
    ],
  },
  {
    phase: "Phase 3: Observability & Cost",
    weeks: "Week 5-6",
    impact: "HIGH",
    items: [
      { name: "Real Claude API Costs", effort: "3d", impact: 9 },
      { name: "Agent Performance Profiling", effort: "1d", impact: 6 },
      { name: "Failure Alerting (Slack)", effort: "2d", impact: 7 },
      { name: "Multi-Category System", effort: "5d", impact: 8 },
    ],
  },
  {
    phase: "Phase 4: Version Control & Scale",
    weeks: "Week 7-8",
    impact: "MEDIUM",
    items: [
      { name: "Agent Git Integration", effort: "5d", impact: 8 },
      { name: "Agent Marketplace", effort: "2d", impact: 5 },
      { name: "Orchestration Templates", effort: "1d", impact: 6 },
      { name: "CLI Tool", effort: "2d", impact: 7 },
    ],
  },
];

const visionMetrics = [
  { metric: "Agent Management", current: 95, vision: 100 },
  { metric: "Orchestration", current: 70, vision: 98 },
  { metric: "Autonomous Ops", current: 25, vision: 95 },
  { metric: "Cost Visibility", current: 20, vision: 90 },
  { metric: "Multi-Project", current: 60, vision: 95 },
  { metric: "Version Control", current: 5, vision: 85 },
];

const codeHealth = [
  { file: "server.js", lines: 3610, complexity: "High", note: "Single file — needs modularization" },
  { file: "Orchestration.tsx", lines: 1451, complexity: "High", note: "Needs component extraction" },
  { file: "Memory.tsx", lines: 1080, complexity: "Medium", note: "Split into sub-components" },
  { file: "api.ts", lines: 692, complexity: "Medium", note: "Well-structured REST client" },
  { file: "AiAssistant.tsx", lines: 850, complexity: "High", note: "Large component, refactor needed" },
  { file: "Dashboard.tsx", lines: 380, complexity: "Low", note: "Clean and manageable" },
];

const quickWins = [
  { win: "Auto-retry transient errors", effort: "2h", impact: "High" },
  { win: "⌘K command palette", effort: "4h", impact: "High" },
  { win: "Agent full-text search", effort: "2h", impact: "Medium" },
  { win: "DAG export (Mermaid/JSON)", effort: "3h", impact: "Medium" },
  { win: "Execution time estimates", effort: "2h", impact: "Medium" },
  { win: "Pre-defined agent categories", effort: "1h", impact: "Low" },
  { win: "Agent comparison view", effort: "4h", impact: "Medium" },
  { win: "Memory templates", effort: "2h", impact: "Low" },
];

// ─── Components ──────────────────────────────────────────────────────────────

const Badge = ({ children, color = COLORS.accent, glow = false }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 10px",
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 0.5,
      background: glow ? `${color}22` : `${color}18`,
      color: color,
      border: `1px solid ${color}33`,
      boxShadow: glow ? `0 0 12px ${color}33` : "none",
    }}
  >
    {children}
  </span>
);

const ProgressBar = ({ value, max = 100, color = COLORS.accent, height = 6 }) => (
  <div style={{ width: "100%", background: "#1e1e2e", borderRadius: height, height, overflow: "hidden" }}>
    <div
      style={{
        width: `${Math.min((value / max) * 100, 100)}%`,
        height: "100%",
        background: `linear-gradient(90deg, ${color}, ${color}cc)`,
        borderRadius: height,
        transition: "width 0.6s ease",
      }}
    />
  </div>
);

const Card = ({ children, title, subtitle, onClick, active, glow }) => (
  <div
    onClick={onClick}
    style={{
      background: active ? COLORS.cardHover : COLORS.card,
      border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
      borderRadius: 12,
      padding: 20,
      cursor: onClick ? "pointer" : "default",
      transition: "all 0.2s",
      boxShadow: glow ? `0 0 20px ${COLORS.accentGlow}` : "none",
    }}
  >
    {title && (
      <div style={{ marginBottom: subtitle ? 4 : 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.text }}>{title}</h3>
        {subtitle && <p style={{ margin: "4px 0 12px", fontSize: 12, color: COLORS.textMuted }}>{subtitle}</p>}
      </div>
    )}
    {children}
  </div>
);

const StatCard = ({ label, value, sub, color = COLORS.accent, icon }) => (
  <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "16px 20px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 4 }}>{sub}</div>}
      </div>
      {icon && <div style={{ fontSize: 24, opacity: 0.5 }}>{icon}</div>}
    </div>
  </div>
);

const TabButton = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: "8px 18px",
      borderRadius: 8,
      border: "none",
      background: active ? COLORS.accent : "transparent",
      color: active ? "#fff" : COLORS.textDim,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.2s",
    }}
  >
    {children}
  </button>
);

// ─── Sections ────────────────────────────────────────────────────────────────

const OverviewSection = () => (
  <div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
      <StatCard label="API Endpoints" value="60+" sub="REST + SSE" color={COLORS.accent} icon="🔌" />
      <StatCard label="UI Pages" value="28" sub="Full dashboard" color={COLORS.green} icon="📄" />
      <StatCard label="Total Lines" value="7.8K" sub="Frontend + Backend" color={COLORS.cyan} icon="💻" />
      <StatCard label="Completeness" value="95%" sub="Production-ready core" color={COLORS.purple} icon="✅" />
    </div>

    <Card title="Architecture Flow" subtitle="How all components connect">
      <div style={{ fontFamily: "monospace", fontSize: 12, color: COLORS.textDim, lineHeight: 1.8, background: "#0d0d14", padding: 16, borderRadius: 8, overflowX: "auto", whiteSpace: "pre" }}>
{`┌─ Browser (localhost:3847) ─────────────────────┐
│  React 19 + TypeScript + Vite + Tailwind       │
│  28 Pages │ 11 Components │ Dark Theme          │
└──────────────────┬─────────────────────────────┘
                   │ REST API + SSE Streaming
                   ▼
┌─ Express Server (server.js — 3610 lines) ──────┐
│  60+ Endpoints │ Rate Limiting │ CORS           │
│  ├─ /api/projects     (auto-discovery)         │
│  ├─ /api/global/*     (agents, CLAUDE.md)      │
│  ├─ /api/orchestrations (DAG pipelines)        │
│  ├─ /api/playground   (direct agent run)       │
│  ├─ /api/schedules    (cron jobs)              │
│  ├─ /api/webhooks     (external triggers)      │
│  ├─ /api/memory       (persistent notes)       │
│  └─ /api/analytics    (usage tracking)         │
└──────────────────┬─────────────────────────────┘
                   │ Spawns: claude -p [prompt]
                   ▼
┌─ File System (Source of Truth) ────────────────┐
│  ~/.claude/agents/*.md    (21 global agents)   │
│  ~/.claude/memory/*.md    (knowledge brain)    │
│  [project]/.claude/       (per-project scope)  │
│  *.json                   (orchestrations,     │
│                            schedules, history)  │
└────────────────────────────────────────────────┘`}
      </div>
    </Card>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
      <Card title="Tech Stack">
        {architectureData.stack.map((s, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < architectureData.stack.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{s.layer}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>{s.tech}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {s.lines > 0 && <span style={{ fontSize: 11, color: COLORS.textDim }}>{s.lines.toLocaleString()} lines</span>}
              <Badge color={COLORS.green}>LIVE</Badge>
            </div>
          </div>
        ))}
      </Card>

      <Card title="Execution Model">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { icon: "🎯", title: "Playground", desc: "Direct agent run → SSE stream → live output" },
            { icon: "🔄", title: "Orchestration", desc: "DAG canvas → topological sort → sequential exec" },
            { icon: "⏰", title: "Schedules", desc: "node-cron → background agent dispatch" },
            { icon: "🪝", title: "Webhooks", desc: "External POST → secret validation → agent/DAG trigger" },
            { icon: "📦", title: "SDK", desc: "callAgent() → HTTP to localhost:3847 → SSE parse" },
            { icon: "🔧", title: "VS Code", desc: "Tree views + WebView panels → API calls" },
          ].map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18 }}>{m.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{m.title}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>{m.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </div>
);

const FeaturesSection = () => {
  const [filterCat, setFilterCat] = useState("All");
  const categories = ["All", ...new Set(featureScores.map((f) => f.category))];
  const filtered = filterCat === "All" ? featureScores : featureScores.filter((f) => f.category === filterCat);
  const avgScore = Math.round(filtered.reduce((a, b) => a + b.score, 0) / filtered.length);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <StatCard label="Features Tracked" value={featureScores.length} sub="Across 7 categories" color={COLORS.accent} />
        <StatCard label="Avg Completeness" value={`${avgScore}%`} sub="Production-grade" color={COLORS.green} />
        <StatCard label="100% Complete" value={featureScores.filter((f) => f.score === 100).length} sub="Fully shipped" color={COLORS.cyan} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {categories.map((c) => (
          <TabButton key={c} active={filterCat === c} onClick={() => setFilterCat(c)}>{c}</TabButton>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="Feature Completeness">
          {filtered.map((f, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: COLORS.text }}>{f.feature}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: f.score === 100 ? COLORS.green : f.score >= 90 ? COLORS.cyan : COLORS.yellow }}>{f.score}%</span>
              </div>
              <ProgressBar value={f.score} color={f.score === 100 ? COLORS.green : f.score >= 90 ? COLORS.cyan : COLORS.yellow} />
            </div>
          ))}
        </Card>

        <Card title="Feature Distribution">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={categories.filter((c) => c !== "All").map((c) => ({ name: c, value: featureScores.filter((f) => f.category === c).length }))} cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                {categories.filter((c) => c !== "All").map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
};

const AgentSection = () => {
  const [expandedPhase, setExpandedPhase] = useState(null);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Agents" value="21" sub="Fully trained" color={COLORS.accent} icon="🤖" />
        <StatCard label="Pipeline Phases" value="6" sub="Shape → Decide" color={COLORS.green} icon="🔄" />
        <StatCard label="Execution Modes" value="6" sub="Playground, DAG, Cron, Webhook, SDK, VSCode" color={COLORS.cyan} icon="⚡" />
        <StatCard label="Commander" value="Rex" sub="Orchestrates all 20" color={COLORS.purple} icon="👑" />
      </div>

      <Card title="Agent Pipeline Flow" subtitle="Click a phase to see agent details">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {agentPipeline.map((p, i) => (
            <div
              key={i}
              onClick={() => setExpandedPhase(expandedPhase === i ? null : i)}
              style={{
                flex: 1,
                minWidth: 140,
                background: expandedPhase === i ? `${p.color}18` : "#0d0d14",
                border: `1px solid ${expandedPhase === i ? p.color : COLORS.border}`,
                borderRadius: 10,
                padding: 14,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: p.color, letterSpacing: 1, marginBottom: 6 }}>{p.phase}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {p.agents.map((a) => (
                  <Badge key={a} color={p.color}>{a}</Badge>
                ))}
              </div>
              {expandedPhase === i && (
                <div style={{ marginTop: 10, fontSize: 11, color: COLORS.textDim, lineHeight: 1.5 }}>{p.desc}</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          {agentPipeline.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${p.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: p.color }}>{p.agents.length}</div>
              {i < agentPipeline.length - 1 && <div style={{ width: 24, height: 2, background: COLORS.border }} />}
            </div>
          ))}
          <span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: 8 }}>= 21 agents total</span>
        </div>
      </Card>

      <Card title="How Agents Run from Polyglot" subtitle="6 execution paths available">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 8 }}>
          {[
            { mode: "Playground", path: "UI → POST /api/playground/run → claude -p → SSE", status: "✅ Live" },
            { mode: "Orchestration", path: "DAG Canvas → Topological Sort → Sequential Exec", status: "✅ Live" },
            { mode: "Schedules", path: "node-cron → Background Dispatch → Auto-Run", status: "✅ Live" },
            { mode: "Webhooks", path: "External POST → HMAC Verify → Agent/DAG Trigger", status: "✅ Live" },
            { mode: "SDK", path: "callAgent(name, prompt) → HTTP → SSE Parse", status: "✅ Live" },
            { mode: "VS Code", path: "Tree View → Run Command → WebView Panel", status: "✅ Live" },
          ].map((m, i) => (
            <div key={i} style={{ background: "#0d0d14", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{m.mode}</span>
                <span style={{ fontSize: 10, color: COLORS.green }}>{m.status}</span>
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "monospace" }}>{m.path}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const GapsSection = () => {
  const [selectedGap, setSelectedGap] = useState(0);
  const gap = gapAnalysis[selectedGap];
  const gapDelta = gap.needed - gap.current;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <StatCard label="Critical Gaps (P0)" value={gapAnalysis.filter((g) => g.priority === "P0").length} sub="Block 1000x speed" color={COLORS.red} icon="🔴" />
        <StatCard label="High Gaps (P1)" value={gapAnalysis.filter((g) => g.priority === "P1").length} sub="Significant limiters" color={COLORS.orange} icon="🟠" />
        <StatCard label="Avg Gap Size" value={`${Math.round(gapAnalysis.reduce((a, g) => a + (g.needed - g.current), 0) / gapAnalysis.length)}%`} sub="Current vs needed" color={COLORS.yellow} icon="📊" />
        <StatCard label="Total Effort" value="~8 wks" sub="All phases" color={COLORS.cyan} icon="⏱️" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        <Card title="Gap Areas">
          {gapAnalysis.map((g, i) => (
            <div
              key={i}
              onClick={() => setSelectedGap(i)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: 8,
                marginBottom: 4,
                cursor: "pointer",
                background: selectedGap === i ? `${COLORS.accent}15` : "transparent",
                border: `1px solid ${selectedGap === i ? COLORS.accent : "transparent"}`,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{g.area}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>{g.effort}</div>
              </div>
              <Badge color={g.priority === "P0" ? COLORS.red : g.priority === "P1" ? COLORS.orange : COLORS.yellow} glow={g.priority === "P0"}>
                {g.priority}
              </Badge>
            </div>
          ))}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title={gap.area} subtitle={`Priority: ${gap.priority} · Effort: ${gap.effort}`} glow={gap.priority === "P0"}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: gap.current < 30 ? COLORS.red : COLORS.yellow }}>{gap.current}%</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>Current</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.green }}>{gap.needed}%</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>Target</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.accent }}>{gapDelta}%</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>Gap</div>
              </div>
            </div>
            <ProgressBar value={gap.current} max={gap.needed} color={gap.current < 30 ? COLORS.red : COLORS.yellow} height={8} />
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>What's Needed:</div>
              {gap.items.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: COLORS.accent }} />
                  <span style={{ fontSize: 13, color: COLORS.textDim }}>{item}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Gap Radar">
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={gapAnalysis.map((g) => ({ area: g.area.split(" ").slice(0, 2).join(" "), current: g.current, needed: g.needed }))}>
                <PolarGrid stroke={COLORS.border} />
                <PolarAngleAxis dataKey="area" tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: COLORS.textMuted, fontSize: 9 }} />
                <Radar name="Current" dataKey="current" stroke={COLORS.red} fill={COLORS.red} fillOpacity={0.15} strokeWidth={2} />
                <Radar name="Target" dataKey="needed" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.08} strokeWidth={2} />
                <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }} />
                <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textDim }} />
              </RadarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
    </div>
  );
};

const RoadmapSection = () => (
  <div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
      <StatCard label="Total Phases" value="4" sub="8-week plan" color={COLORS.accent} icon="🗺️" />
      <StatCard label="Total Tasks" value={roadmapPhases.reduce((a, p) => a + p.items.length, 0)} sub="Across all phases" color={COLORS.green} icon="📋" />
      <StatCard label="Quick Wins" value={quickWins.length} sub="< 4 hours each" color={COLORS.cyan} icon="⚡" />
      <StatCard label="Max Impact" value="1000x" sub="Build speed target" color={COLORS.purple} icon="🚀" />
    </div>

    {roadmapPhases.map((phase, pi) => (
      <Card key={pi} title={phase.phase} subtitle={`${phase.weeks} · Impact: ${phase.impact}`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {phase.items.map((item, i) => (
            <div key={i} style={{ background: "#0d0d14", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 6 }}>{item.name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Badge color={COLORS.textMuted}>{item.effort}</Badge>
                <div style={{ display: "flex", gap: 2 }}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <div key={j} style={{ width: 4, height: 12, borderRadius: 2, background: j < item.impact ? COLORS.accent : COLORS.border }} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        {pi < roadmapPhases.length - 1 && <div style={{ height: 1, background: COLORS.border, margin: "16px 0 0" }} />}
      </Card>
    ))}

    <Card title="Quick Wins (Ship This Week)" subtitle="Low effort, high payoff">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {quickWins.map((w, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#0d0d14", borderRadius: 8 }}>
            <span style={{ fontSize: 13, color: COLORS.text }}>{w.win}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Badge color={COLORS.textMuted}>{w.effort}</Badge>
              <Badge color={w.impact === "High" ? COLORS.green : w.impact === "Medium" ? COLORS.yellow : COLORS.textMuted}>{w.impact}</Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  </div>
);

const VisionSection = () => (
  <div>
    <Card title="Current State vs Vision" subtitle="Where Polyglot is today vs where it needs to be">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          {visionMetrics.map((m, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{m.metric}</span>
                <span style={{ fontSize: 12, color: COLORS.textDim }}>
                  <span style={{ color: m.current < 40 ? COLORS.red : COLORS.yellow, fontWeight: 700 }}>{m.current}%</span>
                  {" → "}
                  <span style={{ color: COLORS.green, fontWeight: 700 }}>{m.vision}%</span>
                </span>
              </div>
              <div style={{ position: "relative" }}>
                <ProgressBar value={m.vision} color={`${COLORS.green}33`} height={8} />
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%" }}>
                  <ProgressBar value={m.current} color={m.current < 40 ? COLORS.red : COLORS.yellow} height={8} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={visionMetrics.map((m) => ({ metric: m.metric.split(" ")[0], current: m.current, vision: m.vision }))}>
            <PolarGrid stroke={COLORS.border} />
            <PolarAngleAxis dataKey="metric" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: COLORS.textMuted, fontSize: 9 }} />
            <Radar name="Current" dataKey="current" stroke={COLORS.orange} fill={COLORS.orange} fillOpacity={0.2} strokeWidth={2} />
            <Radar name="Vision" dataKey="vision" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.1} strokeWidth={2} />
            <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </Card>

    <Card title="The 1000x Vision" subtitle="What fully-autonomous Polyglot looks like">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {[
          { title: "24/7 Autonomous", desc: "Background daemon runs agents on events, schedules, and webhooks. No manual clicks. Job queue processes overnight builds. Failure auto-recovery with retry + fallback agents.", color: COLORS.accent },
          { title: "Intelligent Pipelines", desc: "Conditional branching (if/then), parallel execution (fan-out), loop nodes, human-in-loop gates. Rex orchestrates 5-mode pipeline from a single task description.", color: COLORS.green },
          { title: "Full Observability", desc: "Real Claude API cost tracking. Per-agent performance profiling. Slack alerts on failure. Live dashboard of running agents. Budget limits per project.", color: COLORS.cyan },
          { title: "Multi-Category Hub", desc: "Workspace switching between Boldteq Factory, client projects, personal tools. Category taxonomy. Cross-project orchestrations. Project templates for instant setup.", color: COLORS.orange },
          { title: "Version-Controlled", desc: "Every agent change tracked in Git. Semantic versioning. Diff viewer. One-click rollback. Agent marketplace for sharing proven agents across teams.", color: COLORS.purple },
          { title: "Ecosystem Integration", desc: "SDK plugins for Slack, GitHub, Airtable. CLI tool for terminal access. VS Code deep integration. Zapier-style automation recipes. Webhook event routing.", color: COLORS.pink },
        ].map((v, i) => (
          <div key={i} style={{ background: "#0d0d14", borderRadius: 10, padding: 16, borderLeft: `3px solid ${v.color}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: v.color, marginBottom: 8 }}>{v.title}</div>
            <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.6 }}>{v.desc}</div>
          </div>
        ))}
      </div>
    </Card>

    <Card title="Code Health & Optimization" subtitle="Files that need refactoring for scale">
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 3fr", padding: "8px 12px", borderBottom: `1px solid ${COLORS.border}` }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted }}>FILE</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted }}>LINES</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted }}>COMPLEXITY</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted }}>ACTION NEEDED</span>
        </div>
        {codeHealth.map((f, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 3fr", padding: "10px 12px", background: i % 2 === 0 ? "#0d0d14" : "transparent", borderRadius: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, fontFamily: "monospace" }}>{f.file}</span>
            <span style={{ fontSize: 13, color: f.lines > 1000 ? COLORS.orange : COLORS.textDim }}>{f.lines.toLocaleString()}</span>
            <Badge color={f.complexity === "High" ? COLORS.red : f.complexity === "Medium" ? COLORS.yellow : COLORS.green}>{f.complexity}</Badge>
            <span style={{ fontSize: 12, color: COLORS.textMuted }}>{f.note}</span>
          </div>
        ))}
      </div>
    </Card>
  </div>
);

// ─── Main App ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Architecture", icon: "🏗️" },
  { id: "features", label: "Features", icon: "✅" },
  { id: "agents", label: "Agent System", icon: "🤖" },
  { id: "gaps", label: "Gap Analysis", icon: "🔍" },
  { id: "roadmap", label: "Roadmap", icon: "🗺️" },
  { id: "vision", label: "Vision & Health", icon: "🚀" },
];

export default function PolyglotDeepDive() {
  const [activeTab, setActiveTab] = useState("overview");

  const renderSection = () => {
    switch (activeTab) {
      case "overview": return <OverviewSection />;
      case "features": return <FeaturesSection />;
      case "agents": return <AgentSection />;
      case "gaps": return <GapsSection />;
      case "roadmap": return <RoadmapSection />;
      case "vision": return <VisionSection />;
      default: return <OverviewSection />;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${COLORS.border}`, padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}>⚡</span>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.cyan})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Polyglot Deep Dive
            </h1>
            <Badge color={COLORS.green} glow>v1.0 PRODUCTION</Badge>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted }}>
            Boldteq Software Factory · 21 Agents · Full Architecture Analysis · Enhancement Roadmap
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Badge color={COLORS.accent}>60+ API Endpoints</Badge>
          <Badge color={COLORS.green}>28 Pages</Badge>
          <Badge color={COLORS.cyan}>7.8K Lines</Badge>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "12px 32px", borderBottom: `1px solid ${COLORS.border}`, background: "#0c0c12" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: activeTab === tab.id ? COLORS.accent : "transparent",
              color: activeTab === tab.id ? "#fff" : COLORS.textDim,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        {renderSection()}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "16px 32px", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>
          Boldteq Software Factory · Polyglot Analysis · Generated {new Date().toLocaleDateString()} · 21 Agents Fully Trained
        </span>
      </div>
    </div>
  );
}
