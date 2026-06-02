import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import { clientLogger } from '../lib/clientLogger'

interface Props {
  children: ReactNode
  /** When key changes (e.g. route change) the boundary resets — prevents one-page crash from locking the whole app */
  resetKey?: string
}

interface State {
  hasError: boolean
  error: Error | null
  prevKey?: string
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, prevKey: props.resetKey }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Auto-reset when resetKey changes (e.g. user navigates to a different route)
    if (props.resetKey !== state.prevKey) {
      return { hasError: false, error: null, prevKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    clientLogger.error(error, {
      category: 'render',
      meta: { componentStack: info.componentStack },
    })
  }

  reset() {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="text-center max-w-md space-y-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-red-muted flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red" />
            </div>
            <h2 className="text-lg font-semibold text-text">Something went wrong</h2>
            <p className="text-sm text-text-muted leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => this.reset()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-surface-2 transition-colors text-text"
              >
                <ArrowLeft className="w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
