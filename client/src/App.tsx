import React, { Suspense, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { Sparkles, X } from 'lucide-react'
import ErrorBoundary from './components/ErrorBoundary'
import Sidebar from './components/Sidebar'
import AiAssistant from './components/AiAssistant'
import { ToastContainer } from './components/Toast'
import CommandPalette from './components/CommandPalette'
import { useApi } from './hooks/useApi'
import { getProjects } from './lib/api'

// Q34: Route-level code-splitting — each page loads only when navigated to
const Dashboard     = React.lazy(() => import('./pages/Dashboard'))
const AllAgents     = React.lazy(() => import('./pages/AllAgents'))
const AgentEditor   = React.lazy(() => import('./pages/AgentEditor'))
const CommandEditor = React.lazy(() => import('./pages/CommandEditor'))
const RuleEditor    = React.lazy(() => import('./pages/RuleEditor'))
const ProjectDetail = React.lazy(() => import('./pages/ProjectDetail'))
const SettingsHub   = React.lazy(() => import('./pages/SettingsHub'))
const AnalyticsHub  = React.lazy(() => import('./pages/AnalyticsHub'))
const SchedulesHub  = React.lazy(() => import('./pages/SchedulesHub'))
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

export default function App() {
  const { data: projects, refetch } = useApi(getProjects)
  const [aiOpen, setAiOpen] = useState(false)

  return (
    <ThemeProvider>
    <BrowserRouter>
      <div className="flex min-h-screen">
        <Sidebar projects={projects || []} />
        <main className="flex-1 min-w-0 h-screen overflow-y-auto">
          <RouteErrorBoundary>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Core pages — sidebar items */}
            <Route path="/" element={<Dashboard projects={projects || []} />} />
            <Route path="/agents" element={<AllAgents />} />
            <Route path="/orchestration" element={<Orchestration />} />
            <Route path="/playground" element={<Playground />} />
            <Route path="/analytics" element={<AnalyticsHub />} />
            <Route path="/org-chart" element={<OrgChart />} />
            <Route path="/schedules" element={<SchedulesHub />} />
            <Route path="/settings" element={<SettingsHub onSave={refetch} />} />
            <Route path="/database" element={<Navigate to="/settings?tab=database" replace />} />
            <Route path="/projects" element={<Navigate to="/" replace />} />

            {/* Editors — deep links */}
            <Route path="/global/agents/:name" element={<AgentEditor scope="global" />} />
            <Route path="/global/rules/:name" element={<RuleEditor scope="global" />} />
            <Route path="/projects/:projectId" element={<ProjectDetail />} />
            <Route path="/projects/:projectId/agents/:name" element={<AgentEditor scope="project" />} />
            <Route path="/projects/:projectId/commands/:name" element={<CommandEditor />} />
            <Route path="/projects/:projectId/rules/:name" element={<RuleEditor scope="project" />} />
            <Route path="/projects/:projectId/chat" element={<ProjectChat />} />
            <Route path="/templates/:name" element={<TemplateEditor />} />
            <Route path="/agents/:name/training" element={<TrainingView />} />

            {/* Power-user pages */}
            <Route path="/hr" element={<HrPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/governance" element={<Navigate to="/analytics?tab=governance" replace />} />
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

        {/* Global overlays */}
        <CommandPalette />
        <ToastContainer />

        {/* AI assistant */}
        {aiOpen && (
          <div className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex items-end justify-end p-6">
            <div className="w-[480px] max-w-full bg-surface border border-border rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: '80vh' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <span className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent" /> AI Assistant
                </span>
                <button onClick={() => setAiOpen(false)} aria-label="Close AI assistant" className="text-text-muted hover:text-text">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <AiAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </BrowserRouter>
    </ThemeProvider>
  )
}
