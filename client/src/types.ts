export interface Agent {
  filename: string
  path: string
  frontmatter: AgentFrontmatter & Record<string, unknown>
  name: string
  description: string
  model: string
  tools: string
  body: string
  raw: string
  updatedAt: string
}

export interface AgentFrontmatter {
  category?: string
  tags?: string
  output_template?: string
  icon?: string
  has_training?: boolean
}

export interface Template {
  filename: string
  path: string
  name: string
  description: string
  sections: string[]
  body: string
  raw: string
  updatedAt: string
}

export interface TrainingCorrection {
  id: string
  timestamp: string
  issue: string
  correction: string
  status: 'active' | 'archived'
}

export interface Category {
  name: string
  count: number
}

export interface Project {
  id: string
  name: string
  path: string
  displayPath: string
  hasClaudeDir: boolean
  hasClaudeMd: boolean
  agentCount: number
  commandCount: number
  ruleCount: number
  agents: Agent[]
  commands: string[]
  rules: string[]
}

export interface Command {
  name: string
  content: string
  path: string
}

export interface Rule {
  name: string
  content: string
  path: string
}

export interface AgentOrgInfo {
  level: number | null
  levelTitle: string | null
  yearsOfExperience: number | null
  experiencePoints: number | null
  tier: 'leadership' | 'engineer' | 'analyst' | 'creative' | string | null
  title: string | null
  status: 'active' | 'probation' | 'pip' | 'retired' | string | null
  department: string | null
  departmentLabel: string | null
  departmentColor: string | null
  // Org Structure v2 (2026-04-27): hierarchical placement
  subDepartment: string | null
  subDepartmentLabel: string | null
  subDepartmentDescription: string | null
  pod: 'saas' | 'shopify-app' | 'shopify-web' | string | null
  reportsTo: string | null
  secondaryReportsTo: string | null
  isLeader: boolean
  isSubLeader: boolean
  squad: string | null
  avatar?: string | null
  gender?: 'male' | 'female' | 'neutral' | string | null
}

// Per-row token-budget health — same signal as AgentHealthBar at the top of
// the agent editor, batched into /api/unified/agents so every list row can
// show it without a second round-trip.
export interface AgentRowHealth {
  status: 'healthy' | 'warning' | 'over' | 'sparse'
  usage: number                                // 0.0–1.2+ (fraction of budget)
  actual: { lines: number; chars: number }
  budget: { lines: number; chars: number; allowOversize: boolean }
  violations: Array<{ kind: string; actual: number; budget: number; limit?: number }>
  warnings: Array<{ kind: string; actual: number; budget: number }>
  estimatedTokens: number
  sizeKb: number
}

export interface UnifiedAgent extends Agent {
  scope: 'global' | 'project'
  scopeLabel: string
  projectId: string | null
  projectName: string | null
  org: AgentOrgInfo | null
  health: AgentRowHealth | null
}

export interface UnifiedCommand {
  name: string
  content: string
  path: string
  projectId: string
  projectName: string
  updatedAt: string
}

export interface UnifiedRule {
  name: string
  content: string
  path: string
  scope: 'global' | 'project'
  projectId: string | null
  projectName: string | null
  updatedAt: string
}

export interface AppConfig {
  claudeDir: string
  claudeDirExists: boolean
  home: string
  projectDirs: string[]
}
