import React, { Suspense, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { Sparkles } from 'lucide-react'
import ErrorBoundary from './components/ErrorBoundary'
import Sidebar from './components/Sidebar'
import WorkspaceShell from './components/WorkspaceShell'
import AiAssistant from './components/AiAssistant'
import { ToastContainer } from './components/Toast'
import { ConfirmHost } from './lib/confirm'
import { DispatchHost } from './lib/dispatch'
import { BuildHost } from './lib/build'
import { PublishHost } from './lib/publish'
import CommandPalette from './components/CommandPalette'
import { useApi } from './hooks/useApi'
import { getProjects } from './lib/api'
import { CacheKeys, initCacheInvalidation } from './lib/cacheKeys'

// Wire SSE + file-write events to centralized cache invalidation once, at module
// load (before any page mounts). Idempotent.
initCacheInvalidation()

// Q34: Route-level code-splitting — each page loads only when navigated to
const Dashboard     = React.lazy(() => import('./pages/Dashboard'))
const AllAgents     = React.lazy(() => import('./pages/AllAgents'))
const AgentEditor   = React.lazy(() => import('./pages/AgentEditor'))
const CommandEditor = React.lazy(() => import('./pages/CommandEditor'))
const RuleEditor    = React.lazy(() => import('./pages/RuleEditor'))
const ProjectDetail = React.lazy(() => import('./pages/ProjectDetail'))
const SettingsHub   = React.lazy(() => import('./pages/SettingsHub'))
const Monitoring    = React.lazy(() => import('./pages/AnalyticsHub'))
const Tracing       = React.lazy(() => import('./pages/Tracing'))
const TraceView     = React.lazy(() => import('./pages/TraceView'))
const Prompts       = React.lazy(() => import('./pages/Prompts'))
const Datasets      = React.lazy(() => import('./pages/Datasets'))
const Evaluators    = React.lazy(() => import('./pages/Evaluators'))
const ContextHub    = React.lazy(() => import('./pages/ContextHub'))
const SchedulesHub  = React.lazy(() => import('./pages/SchedulesHub'))
const SystemHealth  = React.lazy(() => import('./pages/SystemHealth'))
const Orchestration = React.lazy(() => import('./pages/Orchestration'))
const Playground    = React.lazy(() => import('./pages/Playground'))
const OrgChart      = React.lazy(() => import('./pages/OrgChart'))
const GoalCascadePage = React.lazy(() => import('./pages/GoalCascade'))
const ProjectChat   = React.lazy(() => import('./pages/ProjectChat'))
const TemplateEditor = React.lazy(() => import('./pages/TemplateEditor'))
const TrainingView  = React.lazy(() => import('./pages/TrainingView'))
const HrPage        = React.lazy(() => import('./pages/Hr'))
const LogsPage      = React.lazy(() => import('./pages/Logs'))
const Setup         = React.lazy(() => import('./pages/Setup'))
const Documentation = React.lazy(() => import('./pages/Documentation'))
const MemoryHistory = React.lazy(() => import('./pages/MemoryHistory'))
const LearningInbox = React.lazy(() => import('./pages/LearningInbox'))
const Lens = React.lazy(() => import('./pages/Lens'))
const WorkspaceProjects = React.lazy(() => import('./pages/WorkspaceProjects'))
const WorkspaceSaasProjects = React.lazy(() => import('./pages/WorkspaceSaasProjects'))
const WorkspaceProjectDetail = React.lazy(() => import('./pages/WorkspaceProjectDetail'))
const WorkspaceStudio = React.lazy(() => import('./pages/WorkspaceStudio'))
const Shopify = React.lazy(() => import('./pages/Shopify'))
const StorePreview = React.lazy(() => import('./pages/StorePreview'))
const Sales = React.lazy(() => import('./pages/Sales'))
const DesignLibrary = React.lazy(() => import('./pages/DesignLibrary'))
const LibraryPage = React.lazy(() => import('./pages/Library'))

// Minimal page-level spinner shown while lazy chunk loads
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    </div>
  )
}

// Route-aware error boundary: resets automatically when the user navigates away
// from the crashed page, so one broken route can't lock the entire app.
function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>
}

// SaaS Projects moved to Workspace — forward any old /projects/* path (incl. deep
// links to a project's agents/commands/rules/chat) to /workspace/saas/*.
function ProjectsRedirect() {
  const loc = useLocation()
  return <Navigate to={`/workspace/saas${loc.pathname.replace(/^\/projects/, '')}${loc.search}`} replace />
}

// Analytics → split between the new Tracing (per-run) and Monitoring (aggregate)
// surfaces. The old ?tab=runs deep link maps to Tracing; everything else keeps
// its tab under Monitoring.
function AnalyticsRedirect() {
  const loc = useLocation()
  const tab = new URLSearchParams(loc.search).get('tab')
  if (tab === 'runs') return <Navigate to="/tracing" replace />
  return <Navigate to={`/monitoring${tab ? `?tab=${tab}` : ''}`} replace />
}

// Reflect the current route in document.title so browser tabs + history entries
// are distinguishable instead of every page reading a static "Polyglot".
const TITLE_ALIASES: Record<string, string> = {
  '': 'Dashboard', global: 'Agents', docs: 'Documentation', hr: 'HR', workspace: 'Workspace',
  'context-hub': 'Context Hub', commands: 'Commands',
}
function RouteTitle() {
  const { pathname } = useLocation()
  React.useEffect(() => {
    const seg = pathname.split('/').filter(Boolean)[0] ?? ''
    const name =
      pathname === '/' ? 'Dashboard' : TITLE_ALIASES[seg] ?? (seg.charAt(0).toUpperCase() + seg.slice(1))
    document.title = name ? `${name} · Polyglot` : 'Polyglot'
  }, [pathname])
  return null
}

export default function App() {
  const { refetch } = useApi(getProjects, [], CacheKeys.projects)
  const [aiOpen, setAiOpen] = useState(false)

  // Open the AI assistant from anywhere: ⌘J / Ctrl+J, or a `polyglot:open-ai`
  // custom event (dispatched by the command palette). The panel itself lives
  // always-mounted below so background generations survive it being closed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setAiOpen((v) => !v)
      }
    }
    const onOpen = () => setAiOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('polyglot:open-ai', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('polyglot:open-ai', onOpen)
    }
  }, [])

  return (
    <ThemeProvider>
    <BrowserRouter>
      <RouteTitle />
      <Routes>
        {/* WORKSPACE MODE — own shell + sidebar, isolated from Polyglot */}
        <Route path="/workspace/*" element={
          <WorkspaceShell>
            <RouteErrorBoundary>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<WorkspaceProjects />} />
              <Route path="/p/:id" element={<WorkspaceProjectDetail />} />
              <Route path="/p/:id/studio" element={<WorkspaceStudio />} />
              <Route path="/saas" element={<WorkspaceSaasProjects />} />
              <Route path="/saas/:projectId" element={<ProjectDetail />} />
              <Route path="/saas/:projectId/agents/:name" element={<AgentEditor scope="project" />} />
              <Route path="/saas/:projectId/commands/:name" element={<CommandEditor />} />
              <Route path="/saas/:projectId/rules/:name" element={<RuleEditor scope="project" />} />
              <Route path="/saas/:projectId/chat" element={<ProjectChat />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/lens" element={<Lens />} />
              <Route path="/design-library" element={<DesignLibrary />} />
              <Route path="/projects" element={<Navigate to="/workspace" replace />} />
              <Route path="*" element={<Navigate to="/workspace" replace />} />
            </Routes>
            </Suspense>
            </RouteErrorBoundary>
          </WorkspaceShell>
        } />

        {/* POLYGLOT MODE — default shell + sidebar */}
        <Route path="/*" element={
      <div className="flex min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-accent focus:text-white focus:shadow-pop focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        <Sidebar />
        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 h-screen overflow-y-auto outline-none">
          <RouteErrorBoundary>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Core pages — sidebar items */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/agents" element={<AllAgents />} />
            {/* Studio = the React Flow DAG builder (renamed from Orchestration) */}
            <Route path="/studio" element={<Orchestration />} />
            <Route path="/orchestration" element={<Navigate to="/studio" replace />} />
            <Route path="/prompts" element={<Prompts />} />
            <Route path="/commands" element={<LibraryPage />} />
            <Route path="/library" element={<Navigate to="/commands" replace />} />
            <Route path="/playground" element={<Playground />} />
            {/* Sales moved into Workspace ("Client Work"); Build removed (the
                project-scoped Build button + Studio cover it). Old links redirect. */}
            <Route path="/sales" element={<Navigate to="/workspace/sales" replace />} />
            <Route path="/build" element={<Navigate to="/workspace" replace />} />
            <Route path="/lens" element={<Navigate to="/workspace/lens" replace />} />
            <Route path="/shopify" element={<Shopify />} />
            <Route path="/shopify/:id" element={<StorePreview />} />
            {/* Observe — Tracing (per-run tree) + Monitoring (aggregate) */}
            <Route path="/tracing" element={<Tracing />} />
            <Route path="/tracing/:runId" element={<TraceView />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/analytics" element={<AnalyticsRedirect />} />
            {/* Evaluate */}
            <Route path="/datasets" element={<Datasets />} />
            <Route path="/evaluators" element={<Evaluators />} />
            {/* Context Hub (promoted from Settings → Memory) */}
            <Route path="/context-hub" element={<ContextHub />} />
            <Route path="/memory" element={<Navigate to="/context-hub" replace />} />
            <Route path="/org-chart" element={<OrgChart />} />
            <Route path="/schedules" element={<SchedulesHub />} />
            <Route path="/system" element={<SystemHealth />} />
            <Route path="/settings" element={<SettingsHub onSave={refetch} />} />
            <Route path="/database" element={<Navigate to="/settings?tab=database" replace />} />
            {/* SaaS Projects moved into Workspace ("Client Work" → SaaS Projects);
                old /projects/* links redirect there, preserving deep links. */}
            <Route path="/projects/*" element={<ProjectsRedirect />} />

            {/* Editors — deep links */}
            <Route path="/global/agents/:name" element={<AgentEditor scope="global" />} />
            <Route path="/global/rules/:name" element={<RuleEditor scope="global" />} />
            <Route path="/templates/:name" element={<TemplateEditor />} />
            <Route path="/agents/:name/training" element={<TrainingView />} />

            {/* Power-user pages */}
            <Route path="/hr" element={<HrPage />} />
            <Route path="/logs" element={<LogsPage />} />
            {/* Annotation Queue = the human review/labeling inbox (renamed from Learning) */}
            <Route path="/annotation" element={<LearningInbox />} />
            <Route path="/learning" element={<Navigate to="/annotation" replace />} />
            <Route path="/governance" element={<Navigate to="/monitoring?tab=governance" replace />} />
            <Route path="/goals" element={<GoalCascadePage />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/docs" element={<Documentation />} />
            <Route path="/docs/:slug" element={<Documentation />} />
            <Route path="/memory/history" element={<MemoryHistory />} />

            {/* Catch-all: stale/removed routes (/memory, /rules, /projects, typos)
                redirect home instead of rendering a blank <main> (Bug 4 / audit C15). */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </RouteErrorBoundary>
        </main>
      </div>
        } />
      </Routes>

      {/* Global overlays — shared across both modes */}
      <CommandPalette />
      <ToastContainer />
      <ConfirmHost />
      <DispatchHost />
      <BuildHost />
      <PublishHost />

      {/* AI assistant — always mounted (renders its own full-screen overlay +
          slide-in panel, toggled by `open`) so a background generation survives
          the panel being closed. Opened via the floating button, ⌘J, or the
          command palette's "Ask Claude" action. */}
      <AiAssistant open={aiOpen} onClose={() => setAiOpen(false)} />

      {/* Floating trigger — hidden while the panel is open to avoid overlap */}
      {!aiOpen && (
        <button
          onClick={() => setAiOpen(true)}
          aria-label="Open AI assistant (⌘J)"
          title="Ask Claude — ⌘J"
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-accent text-white shadow-pop hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent transition"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium">Ask Claude</span>
        </button>
      )}
    </BrowserRouter>
    </ThemeProvider>
  )
}
