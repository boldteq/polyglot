# Error Handling Standards — Boldteq SaaS Apps

Definitive reference for error classification, handling patterns, and recovery strategies across React 18+ / TypeScript / Supabase / React Query / Sonner toast stack.

**Date:** 2026-04-04
**Stack:** React 18.3+, TypeScript, Supabase (PostgreSQL + Edge Functions), React Query 5, Sonner, Zod
**Applies to:** the project, all future SaaS products

---

## 1. Error Classification & Response Matrix

| **Level** | **Example** | **Response Layer** | **User Feedback** | **Recovery** |
|-----------|------------|-------------------|------------------|--------------|
| **User Error** | Invalid form input, wrong password, file too large | Form validation (client-side) | Inline validation message + field focus | User corrects input |
| **Business Logic Error** | Insufficient credits, plan limit reached, duplicate entry | API layer (Supabase RLS, Edge Function) | Dialog with upgrade CTA or specific guidance | Upgrade, purchase, or re-attempt |
| **Network Error** | Timeout, offline, DNS failure | Network layer (React Query retry) | Toast with "Try Again" button + stale indicator | Auto-retry (exponential backoff), offline queue |
| **Server Error** | 500, 503, unhandled Edge Function exception | Edge Function / Supabase | Error boundary with fallback + Sentry log | Auto-retry, escalate to admin alert |
| **Auth Error** | Session expired, unauthorized (401), RLS violation (403) | Auth middleware (Supabase auth hook) | Redirect to login + toast with context | Re-authenticate, prompt for permission |
| **Data Integrity Error** | Corrupted payment record, orphaned resume, constraint violation | Database layer (constraints + audit) | Error page + support link + Sentry alert | Admin investigation, potential data restore |
| **Critical/Cascading** | Billing system down, payment processor failure, data loss | System-wide | Maintenance page, email notification, admin dashboard alert | Incident response, status page update |

### Error Severity Scoring

Use this to determine logging verbosity and alert thresholds:

```typescript
type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical'

const severityMap = {
  // info: ~1% impact, no action needed
  'validation_error': 'info',
  'duplicate_job_title': 'info',

  // warning: ~5% impact, monitor but don't alert
  'rate_limit_approaching': 'warning',
  'api_slow_response': 'warning',
  'unused_feature_flag': 'warning',

  // error: ~20% impact, log to Sentry, notify team
  'function_timeout': 'error',
  'resume_parse_failed': 'error',
  'payment_webhook_rejected': 'error',

  // critical: >50% impact, page alert, SMS, incident
  'auth_system_down': 'critical',
  'database_unreachable': 'critical',
  'billing_processor_offline': 'critical',
}
```

---

## 2. React Error Boundaries

Error boundaries catch unhandled exceptions in component trees and prevent white-screen crashes.

### 2.1 Root Error Boundary

Place at `src/components/RootErrorBoundary.tsx`. Wraps entire app in `App.tsx`.

```typescript
import { Component, ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  errorInfo: { componentStack: string } | null
  hasError: boolean
}

class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      error: null,
      errorInfo: null,
      hasError: false,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    this.setState({ errorInfo })

    // Log to Sentry with severity
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
      level: 'fatal',
      tags: {
        boundary: 'root',
        page: window.location.pathname,
      },
    })

    // Alert admin via webhook if critical
    if (this.isCritical(error)) {
      this.notifyAdmin(error, errorInfo)
    }
  }

  private isCritical(error: Error): boolean {
    const criticalPatterns = [
      'database',
      'auth',
      'payment',
      'infinite loop',
    ]
    return criticalPatterns.some(pattern =>
      error.message.toLowerCase().includes(pattern)
    )
  }

  private notifyAdmin(error: Error, errorInfo: { componentStack: string }) {
    // Call admin webhook asynchronously
    fetch('/api/admin/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        severity: 'critical',
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {
      // Webhook failure doesn't break app
      console.error('Failed to notify admin')
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    // Optionally reload page
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-red-50">
          <div className="max-w-md rounded-lg bg-white p-8 shadow-lg">
            <h1 className="text-2xl font-bold text-red-900">
              Something went wrong
            </h1>
            <p className="mt-2 text-gray-600">
              We've logged this error. Our team has been notified.
            </p>

            {process.env.NODE_ENV === 'development' && (
              <details className="mt-4 border-t pt-4">
                <summary className="cursor-pointer font-mono text-sm">
                  Error Details (Dev Only)
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-gray-100 p-2 text-xs">
                  {this.state.error?.message}
                  {'\n'}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={this.handleReset}>
                Try Again
              </Button>
              <Button
                onClick={() => {
                  window.location.href = '/'
                }}
              >
                Go Home
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default Sentry.withErrorBoundary(RootErrorBoundary, {
  fallback: <div>Encountered an error</div>,
})
```

### 2.2 Route-Level Error Boundary

Place one per major route section. Prevents entire app crash from isolated feature failure.

```typescript
// src/components/RouteErrorBoundary.tsx
import { Component, ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { useNavigate } from 'react-router-dom'

interface Props {
  children: ReactNode
  routeName: string
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    Sentry.captureException(error, {
      level: 'error',
      tags: { boundary: 'route', route: this.props.routeName },
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <h2 className="text-lg font-semibold">
              Error loading {this.props.routeName}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {this.state.error?.message}
            </p>
            <button
              onClick={this.handleReset}
              className="mt-4 rounded bg-blue-500 px-4 py-2 text-white"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default RouteErrorBoundary
```

### 2.3 Feature-Level Error Boundary

Granular boundaries around expensive features (AI scoring, payments). Failure doesn't take down page.

```typescript
// src/components/FeatureErrorBoundary.tsx
interface Props {
  children: ReactNode
  featureName: string
  fallback?: ReactNode
  onError?: (error: Error) => void
}

function FeatureErrorBoundary({
  children,
  featureName,
  fallback,
  onError,
}: Props) {
  return (
    <ErrorBoundary
      FallbackComponent={({ error, resetErrorBoundary }) => (
        <div className="rounded border border-yellow-300 bg-yellow-50 p-4">
          <p className="text-sm font-semibold text-yellow-900">
            {featureName} unavailable
          </p>
          <p className="mt-1 text-xs text-yellow-800">
            {error.message}
          </p>
          <button
            onClick={resetErrorBoundary}
            className="mt-2 text-xs underline"
          >
            Try again
          </button>
        </div>
      )}
      onError={(error) => {
        Sentry.captureException(error, {
          tags: { boundary: 'feature', feature: featureName },
        })
        onError?.(error)
      }}
    >
      {children}
    </ErrorBoundary>
  )
}

export default FeatureErrorBoundary
```

### 2.4 useErrorBoundary Hook (Functional Components)

```typescript
// Custom hook for functional components to trigger error boundary
import { useCallback } from 'react'

export function useErrorHandler() {
  const handleError = useCallback((error: Error) => {
    throw error // Propagates to nearest boundary
  }, [])

  return handleError
}

// Usage:
function MyComponent() {
  const handleError = useErrorHandler()

  const handleSubmit = async () => {
    try {
      await riskyOperation()
    } catch (error) {
      handleError(error as Error) // Triggers boundary
    }
  }

  return <button onClick={handleSubmit}>Submit</button>
}
```

---

## 3. API Error Handling

### 3.1 Supabase Client Errors

Handle Supabase PostgreSQL, auth, and storage errors consistently.

```typescript
// src/lib/supabaseErrors.ts
import { PostgrestError } from '@supabase/supabase-js'

export class AppError extends Error {
  constructor(
    public message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// Classify Supabase errors
export function handleSupabaseError(error: unknown): AppError {
  if (!error) return new AppError('Unknown error', 'UNKNOWN')

  if (typeof error === 'string') {
    return new AppError(error, 'PARSE_ERROR', 400)
  }

  const err = error as PostgrestError & { status?: number; statusCode?: number }

  // Auth errors
  if (err.message?.includes('Invalid login credentials')) {
    return new AppError('Email or password incorrect', 'INVALID_CREDENTIALS', 401)
  }

  if (err.message?.includes('Email not confirmed')) {
    return new AppError('Please confirm your email first', 'EMAIL_NOT_CONFIRMED', 403)
  }

  // Row-level security
  if (err.code === '42501' || err.message?.includes('permission denied')) {
    return new AppError(
      'You do not have permission to access this resource',
      'RLS_VIOLATION',
      403
    )
  }

  // Not found
  if (err.code === 'PGRST116') {
    return new AppError('Resource not found', 'NOT_FOUND', 404)
  }

  // Unique constraint (duplicate key)
  if (err.code === '23505') {
    return new AppError('This record already exists', 'DUPLICATE_KEY', 409, err)
  }

  // Foreign key constraint
  if (err.code === '23503') {
    return new AppError('Invalid reference', 'FOREIGN_KEY_VIOLATION', 409)
  }

  // Check constraint (business rule)
  if (err.code === '23514') {
    return new AppError(
      'Data violates business rules',
      'CHECK_VIOLATION',
      422,
      err.details
    )
  }

  // Generic database error
  if (err.statusCode === 500) {
    return new AppError(
      'Server error. Please try again later.',
      'DATABASE_ERROR',
      500
    )
  }

  return new AppError(
    err.message || 'Unknown error',
    err.code || 'UNKNOWN',
    err.statusCode || err.status || 500,
    err
  )
}

// Usage in queries:
const { data, error } = await supabase
  .from('jobs')
  .select('*')
  .eq('user_id', userId)

if (error) {
  const appError = handleSupabaseError(error)
  throw appError // or toast.error(appError.message)
}
```

### 3.2 Edge Function Errors

Supabase Edge Functions throw different error types. Classify consistently.

```typescript
// src/lib/edgeFunctionErrors.ts
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'

export class EdgeFunctionError extends AppError {
  constructor(
    message: string,
    code: string,
    public originalError?: unknown
  ) {
    super(message, code, 500)
  }
}

export async function invokeEdgeFunction<T>(
  functionName: string,
  body: unknown
): Promise<T> {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    })

    if (error) {
      throw error
    }

    return data as T
  } catch (error) {
    // FunctionsFetchError: network layer (offline, timeout, CORS)
    if (error instanceof FunctionsFetchError) {
      throw new EdgeFunctionError(
        'Network error. Check your connection.',
        'NETWORK_ERROR',
        error
      )
    }

    // FunctionsRelayError: function threw an exception
    if (error instanceof FunctionsRelayError) {
      const message = (error as any).context?.error_message || 'Function error'
      throw new EdgeFunctionError(message, 'FUNCTION_ERROR', error)
    }

    // FunctionsHttpError: non-2xx status code
    if (error instanceof FunctionsHttpError) {
      const statusCode = error.status
      if (statusCode === 408 || statusCode === 504) {
        throw new EdgeFunctionError(
          'Request timed out. Please try again.',
          'TIMEOUT',
          error
        )
      }
      if (statusCode === 429) {
        throw new EdgeFunctionError(
          'Too many requests. Please wait a moment.',
          'RATE_LIMITED',
          error
        )
      }
      throw new EdgeFunctionError(
        'Server error. Please try again.',
        `HTTP_${statusCode}`,
        error
      )
    }

    // Unknown error
    throw new EdgeFunctionError(
      (error as any).message || 'Unknown error',
      'UNKNOWN',
      error
    )
  }
}
```

### 3.3 React Query Error Handling

Centralized error handling for all server state mutations and queries.

```typescript
// src/lib/reactQueryConfig.ts
import { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as Sentry from '@sentry/react'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry 4xx errors (user errors)
        if (error?.statusCode >= 400 && error?.statusCode < 500) {
          return false
        }
        // Retry 5xx and network errors, max 3 times
        return failureCount < 3
      },
      retryDelay: (attemptIndex) => {
        // Exponential backoff: 1s, 2s, 4s
        return Math.min(1000 * 2 ** attemptIndex, 30000)
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    },
    mutations: {
      retry: 1, // Retry mutations once on network error
    },
  },
})

// Global error handler
queryClient.setDefaultOptions({
  queries: {
    retry: true,
  },
  mutations: {
    retry: true,
  },
})

// Intercept errors globally (but let individual mutations handle their own toasts)
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'error') {
    const error = event.error as AppError
    Sentry.captureException(error, {
      tags: { source: 'react-query' },
    })
  }
})

// Usage in components:
function useDeleteJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', jobId)
        .eq('user_id', userId)

      if (error) throw handleSupabaseError(error)
    },
    onSuccess: (_, jobId) => {
      // Optimistic update: invalidate and refetch
      queryClient.invalidateQueries({
        queryKey: ['jobs', userId],
      })
      toast.success('Job deleted')
    },
    onError: (error: AppError) => {
      if (error.code === 'NOT_FOUND') {
        toast.error('Job not found')
      } else if (error.code === 'RLS_VIOLATION') {
        toast.error('You cannot delete this job')
      } else {
        toast.error(`Failed to delete: ${error.message}`)
      }
      Sentry.captureException(error)
    },
  })
}
```

---

## 4. Toast Error Patterns (Sonner)

Sonner is the only toast library. Use patterns below for consistency.

### 4.1 Error Toasts

```typescript
import { toast } from 'sonner'

// Simple error
toast.error('Failed to save')

// With description
toast.error('Upload failed', {
  description: 'File size exceeds 10MB',
})

// With action (retry button)
toast.error('Failed to rank resumes', {
  description: 'Please try again',
  action: {
    label: 'Retry',
    onClick: () => mutation.mutate(),
  },
})

// Critical error (stays longer, cannot dismiss)
toast.error('Billing system offline', {
  duration: 10000,
  dismissible: false,
  description: 'Contact support@boldteq.io',
})
```

### 4.2 Success Toasts with Undo

```typescript
// Optimistic deletion with undo
toast.success('Job deleted', {
  action: {
    label: 'Undo',
    onClick: async () => {
      await restoreJob(jobId)
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  },
})
```

### 4.3 Promise Toasts (Loading → Success/Error)

Show loading state while async operation completes. Auto-swap to success/error.

```typescript
const rankingPromise = invokeEdgeFunction('rank-resumes', { jobId })

toast.promise(rankingPromise, {
  loading: 'Ranking resumes...',
  success: 'All resumes ranked!',
  error: (error) => {
    if (error.code === 'INSUFFICIENT_CREDITS') {
      return 'Not enough credits. Purchase more to continue.'
    }
    return 'Ranking failed. Please try again.'
  },
})

// Await if needed:
try {
  await rankingPromise
} catch (error) {
  // Already toasted, handle silently or update state
}
```

### 4.4 Validation Error Toasts

Show multiple field errors in a compact toast. Field-level errors stay inline.

```typescript
// Multiple validation errors
const errors = ['Email is required', 'Password must be 8+ characters']
toast.error('Fix errors to continue', {
  description: errors.join(' • '),
})
```

### 4.5 Decision Toast (Custom)

Use a custom component for destructive actions requiring confirmation.

```typescript
// Instead of native confirm(), use:
const confirmDelete = () => {
  const id = toast.custom((t) => (
    <div className="flex gap-2 rounded bg-white p-4 shadow">
      <div className="flex-1">
        <p className="font-semibold">Delete this job?</p>
        <p className="text-sm text-gray-600">This cannot be undone.</p>
      </div>
      <div className="flex gap-2">
        <button
          className="px-3 py-1 text-sm"
          onClick={() => toast.dismiss(id)}
        >
          Cancel
        </button>
        <button
          className="rounded bg-red-500 px-3 py-1 text-sm text-white"
          onClick={async () => {
            await deleteJob(jobId)
            toast.dismiss(id)
            toast.success('Deleted')
          }}
        >
          Delete
        </button>
      </div>
    </div>
  ))
}
```

### 4.6 When to Use Toast vs Inline vs Dialog

| Scenario | Use | Example |
|----------|-----|---------|
| **Background operation result** | Toast | "Email sent successfully" |
| **Field validation error** | Inline (under field) | "Email is required" |
| **Transient notification** | Toast | "Changes saved" |
| **Destructive action** | Dialog | "Are you sure you want to delete?" |
| **Payment/auth error** | Dialog or toast + page banner | "Card declined. Update payment method." |
| **Multiple related errors** | Page banner (sticky) | Form submission validation |
| **Confirmation required** | Dialog | "Delete 50 resumes?" |
| **Info/help** | Tooltip or toast (brief) | "Hover for help" |

---

## 5. Form Validation Error Patterns

### 5.1 Client-Side (Zod + React Hook Form)

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const jobFormSchema = z.object({
  jobTitle: z.string().min(1, 'Job title required').max(100),
  jobDescription: z.string().min(50, 'Description must be at least 50 characters'),
  file: z
    .instanceof(File)
    .refine((file) => file.size <= 10 * 1024 * 1024, 'File must be under 10MB')
    .refine(
      (file) => ['application/pdf', 'text/plain'].includes(file.type),
      'Only PDF and TXT files allowed'
    ),
})

type JobFormInputs = z.infer<typeof jobFormSchema>

function JobForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    scrollToErrorField,
  } = useForm<JobFormInputs>({
    resolver: zodResolver(jobFormSchema),
    mode: 'onBlur', // Validate on blur
  })

  const onSubmit = async (data: JobFormInputs) => {
    try {
      const result = await submitJob(data)
      toast.success('Job created')
    } catch (error) {
      if (error instanceof AppError) {
        // Server-side validation error
        if (error.code === 'DUPLICATE_TITLE') {
          setError('jobTitle', {
            type: 'server',
            message: 'A job with this title already exists',
          })
          scrollToErrorField('jobTitle')
        } else {
          toast.error(error.message)
        }
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Show form-level error at top */}
      {errors.root && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-900">
          {errors.root.message}
        </div>
      )}

      {/* Field with error */}
      <div>
        <label htmlFor="jobTitle">Job Title</label>
        <input
          id="jobTitle"
          {...register('jobTitle')}
          aria-invalid={errors.jobTitle ? 'true' : 'false'}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
        {errors.jobTitle && (
          <p className="mt-1 text-sm text-red-600" role="alert">
            {errors.jobTitle.message}
          </p>
        )}
      </div>

      {/* File input with size validation */}
      <div>
        <label htmlFor="file">Resume</label>
        <input
          id="file"
          type="file"
          {...register('file')}
          aria-invalid={errors.file ? 'true' : 'false'}
        />
        {errors.file && (
          <p className="mt-1 text-sm text-red-600">{errors.file.message}</p>
        )}
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Create Job'}
      </button>
    </form>
  )
}
```

### 5.2 Server-Side Validation (Edge Function)

Return structured error response from Edge Function. Client unwraps and displays.

```typescript
// supabase/functions/create-job/index.ts (Deno)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { jobTitle, jobDescription, file } = await req.json()

    // Validation
    const errors: Record<string, string> = {}

    if (!jobTitle?.trim()) {
      errors.jobTitle = 'Job title required'
    }
    if (jobTitle?.length > 100) {
      errors.jobTitle = 'Job title too long'
    }
    if (jobDescription?.length < 50) {
      errors.jobDescription = 'Description too short'
    }

    if (Object.keys(errors).length > 0) {
      return new Response(
        JSON.stringify({ fieldErrors: errors }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check for duplicates
    const { data: existing } = await supabase
      .from('jobs')
      .select('id')
      .eq('title', jobTitle)
      .eq('user_id', userId)
      .single()

    if (existing) {
      return new Response(
        JSON.stringify({
          fieldErrors: { jobTitle: 'Job with this title exists' },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create job
    const { data, error } = await supabase
      .from('jobs')
      .insert({ title: jobTitle, description: jobDescription })
      .select()
      .single()

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

### 5.3 Handling Server Validation Errors in Client

```typescript
const mutation = useMutation({
  mutationFn: async (data) => {
    const response = await fetch('/api/create-job', {
      method: 'POST',
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const errorData = await response.json()
      // Server returned field errors
      if (errorData.fieldErrors) {
        throw new ValidationError(errorData.fieldErrors)
      }
      throw new Error(errorData.error || 'Failed to create job')
    }

    return response.json()
  },
  onError: (error) => {
    if (error instanceof ValidationError) {
      // Set field errors from server
      Object.entries(error.fieldErrors).forEach(([field, message]) => {
        setError(field as any, {
          type: 'server',
          message: message as string,
        })
      })
    } else {
      toast.error(error.message)
    }
  },
})
```

---

## 6. Network Error & Offline Handling

### 6.1 Online/Offline Detection

```typescript
// src/hooks/useOnlineStatus.ts
import { useEffect, useState } from 'react'

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      toast.success('Back online')
    }

    const handleOffline = () => {
      setIsOnline(false)
      toast.error('You are offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

// Usage:
function MyComponent() {
  const isOnline = useOnlineStatus()

  return isOnline ? (
    <button onClick={handleSubmit}>Submit</button>
  ) : (
    <div className="rounded bg-yellow-100 p-2 text-sm">
      You are offline. Changes will sync when you reconnect.
    </div>
  )
}
```

### 6.2 Stale Data Indicator

When displaying cached data (offline), show banner informing user.

```typescript
function JobList() {
  const { data, isStale } = useQuery({
    queryKey: ['jobs'],
    queryFn: fetchJobs,
  })

  const isOnline = useOnlineStatus()

  return (
    <div>
      {!isOnline && (
        <div className="rounded bg-blue-50 p-3 text-sm text-blue-900">
          You are offline. Showing cached data from {/* timestamp */}.
        </div>
      )}

      {isStale && (
        <div className="rounded bg-yellow-50 p-3 text-sm text-yellow-900">
          Data may be outdated.{' '}
          <button
            onClick={() => queryClient.invalidateQueries(['jobs'])}
            className="underline"
          >
            Refresh
          </button>
        </div>
      )}

      {/* List */}
    </div>
  )
}
```

### 6.3 Offline Mutation Queue

Queue mutations while offline. Replay when reconnected.

```typescript
// src/lib/offlineQueue.ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface QueuedMutation {
  id: string
  fn: () => Promise<unknown>
  onSuccess: (data: unknown) => void
  onError: (error: Error) => void
}

let queue: QueuedMutation[] = []

export function useOfflineQueue() {
  const queryClient = useQueryClient()
  const isOnline = useOnlineStatus()

  useEffect(() => {
    if (!isOnline || queue.length === 0) return

    const processQueue = async () => {
      const toProcess = [...queue]
      queue = []

      for (const item of toProcess) {
        try {
          const result = await item.fn()
          item.onSuccess(result)
        } catch (error) {
          item.onError(error as Error)
          // Re-queue on failure
          queue.push(item)
        }
      }

      // Refetch all queries after mutations
      await queryClient.refetchQueries()
    }

    processQueue()
  }, [isOnline])

  const addToQueue = (
    fn: () => Promise<unknown>,
    onSuccess: (data: unknown) => void,
    onError: (error: Error) => void
  ) => {
    queue.push({
      id: Math.random().toString(),
      fn,
      onSuccess,
      onError,
    })
  }

  return { addToQueue, queueLength: queue.length }
}
```

### 6.4 Request Timeout & Abort

Use `AbortController` to cancel long-running requests.

```typescript
// src/lib/supabaseTimeout.ts
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 10000
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new AppError('Request timed out', 'TIMEOUT', 408))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise])
}

// Usage:
try {
  const data = await withTimeout(
    supabase.from('jobs').select('*'),
    8000 // 8 second timeout
  )
} catch (error) {
  if ((error as AppError).code === 'TIMEOUT') {
    toast.error('Request timed out. Check your connection.')
  }
}
```

---

## 7. Auth Error Handling

### 7.1 Session Expiration

Detect when session expires (401 / `session_not_found`) and redirect to login.

```typescript
// Global interceptor in Supabase client
const { data: { subscription } } = supabase.auth.onAuthStateChange(
  (event, session) => {
    if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      // Clear state
      queryClient.clear()
      window.location.href = '/auth?message=session_expired'
      toast.error('Your session expired. Please sign in again.')
    }
  }
)

// On API error with 401:
if (error?.statusCode === 401) {
  await supabase.auth.signOut()
  window.location.href = '/auth'
}
```

### 7.2 RLS Violation (403)

User attempted unauthorized action (e.g., delete another user's job).

```typescript
if (error?.code === '42501') {
  toast.error('You do not have permission to do this', {
    description: 'This action is not allowed for your account.',
  })
  Sentry.captureException(error, {
    tags: { type: 'security_violation' },
    level: 'warning',
  })
}
```

### 7.3 Email Not Confirmed

Prompt user to confirm email or resend link.

```typescript
if (error?.message?.includes('Email not confirmed')) {
  toast.error('Confirm your email to continue', {
    action: {
      label: 'Resend',
      onClick: async () => {
        await supabase.auth.resend({
          type: 'signup',
          email: userEmail,
        })
        toast.success('Confirmation link sent')
      },
    },
  })
}
```

### 7.4 Rate Limited (429)

Too many auth attempts (brute force protection).

```typescript
if (error?.statusCode === 429) {
  const waitSeconds = 60 // From response header?
  toast.error(`Too many attempts. Wait ${waitSeconds}s.`, {
    duration: waitSeconds * 1000,
    dismissible: false,
  })
}
```

---

## 8. Graceful Degradation

### 8.1 Feature Flags for Outages

Disable broken features without full restart.

```typescript
// Hook to check if feature is available
function useFeatureAvailable(feature: 'resume_ranking' | 'payments' | 'email') {
  const { data: flag } = useQuery({
    queryKey: ['featureFlag', feature],
    queryFn: () => supabase
      .from('feature_flags')
      .select('enabled, error_message')
      .eq('key', feature)
      .single(),
    refetchInterval: 30000, // Check every 30s
  })

  return {
    available: flag?.enabled ?? true,
    reason: flag?.error_message,
  }
}

// Usage:
function RankButton() {
  const { available, reason } = useFeatureAvailable('resume_ranking')

  if (!available) {
    return (
      <button disabled title={reason} className="opacity-50 cursor-not-allowed">
        Ranking Unavailable
      </button>
    )
  }

  return <button onClick={handleRank}>Rank Resumes</button>
}
```

### 8.2 Fallback Content

When API fails, show cached/default content.

```typescript
function JobDetail() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: fetchJob,
    placeholderData: previousData, // From previous cache
  })

  if (error && !data) {
    return (
      <div className="rounded bg-gray-50 p-4">
        <p>Job details unavailable</p>
        <button onClick={() => refetch()}>Retry</button>
      </div>
    )
  }

  return <JobView job={data} loading={isLoading} />
}
```

### 8.3 Read-Only Mode

When write API is down, disable mutations but allow reads.

```typescript
const { available: canWrite } = useFeatureAvailable('write_api')

function EditJob({ job }) {
  return (
    <form disabled={!canWrite}>
      {!canWrite && (
        <div className="mb-4 rounded bg-yellow-50 p-3 text-sm">
          The site is in read-only mode. Changes cannot be saved right now.
        </div>
      )}
      {/* Form fields */}
    </form>
  )
}
```

---

## 9. Error Logging & Monitoring (Sentry)

### 9.1 Sentry Integration

```typescript
// src/main.tsx
import * as Sentry from '@sentry/react'
import { BrowserTracing } from '@sentry/tracing'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    new BrowserTracing(),
    new Sentry.Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1, // 10% of transactions
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0, // 100% on errors
  beforeSend(event, hint) {
    // Filter out certain errors
    if (event.exception) {
      const error = hint.originalException
      // Don't send network errors to Sentry (too noisy)
      if (error instanceof TypeError && error.message === 'fetch failed') {
        return null
      }
    }
    return event
  },
})
```

### 9.2 Contextual Logging

```typescript
// Attach user context automatically
Sentry.setUser({
  id: user.id,
  email: user.email,
  plan: user.plan,
})

// Attach breadcrumbs for debugging
Sentry.captureMessage('Job ranking started', {
  breadcrumbs: [
    {
      message: 'User created job',
      level: 'info',
      timestamp: Date.now() / 1000,
    },
  ],
})

// Tag errors
Sentry.captureException(error, {
  tags: {
    feature: 'resume_ranking',
    operation: 'rank-resumes',
    severity: 'error',
  },
  extra: {
    jobId,
    resumeCount,
    creditsUsed,
  },
  level: 'error',
})
```

### 9.3 What to Log vs. NOT Log

**DO log:**
- Error message, code, and stack trace
- User ID and session info
- Feature/action context (jobId, resumeId)
- Severity classification
- Browser/OS info (Sentry auto-captures)

**DO NOT log:**
- Passwords, auth tokens, API keys
- Full request/response bodies (sensitive data)
- PII beyond user ID (email, phone, SSN)
- Credit card info
- Resume/job description content (if confidential)

```typescript
// Good: context without secrets
Sentry.captureException(error, {
  extra: {
    jobId: 'job_123', // ✓ Safe to log
    userId: user.id, // ✓ Safe
    // NOT: apiKey: token, // ✗ Never log secrets
  },
})

// If logging request context, sanitize:
const sanitize = (obj: any) => {
  const copy = { ...obj }
  delete copy.password
  delete copy.token
  delete copy.creditCard
  return copy
}
```

---

## 10. Error Antipatterns (Never Do This)

### 10.1 Empty Catch Blocks

```typescript
// ✗ WRONG: Error swallowed, debugging impossible
try {
  await deleteJob(jobId)
} catch (e) {
  // Silent failure
}

// ✓ RIGHT: Handle or log
try {
  await deleteJob(jobId)
} catch (error) {
  toast.error('Failed to delete job')
  Sentry.captureException(error)
}
```

### 10.2 console.error Without User Feedback

```typescript
// ✗ WRONG: Logged to console, user has no idea
try {
  await rankResumes()
} catch (error) {
  console.error(error)
}

// ✓ RIGHT: Show user + log to monitoring
try {
  await rankResumes()
} catch (error) {
  toast.error('Ranking failed')
  Sentry.captureException(error)
}
```

### 10.3 Generic Error Messages

```typescript
// ✗ WRONG: Not helpful
toast.error('Something went wrong')

// ✓ RIGHT: Specific and actionable
if (error.code === 'INSUFFICIENT_CREDITS') {
  toast.error('Not enough credits', {
    action: { label: 'Buy Credits', onClick: openBillingDialog },
  })
} else {
  toast.error(`Failed to rank: ${error.message}`)
}
```

### 10.4 Swallowing Errors in Promise Chains

```typescript
// ✗ WRONG: Error lost
fetchJobs()
  .then((jobs) => jobs.map(renderJob))
  .then((elements) => container.appendChild(elements[0]))
  // No .catch()!

// ✓ RIGHT: Chain error handler
fetchJobs()
  .then((jobs) => jobs.map(renderJob))
  .then((elements) => container.appendChild(elements[0]))
  .catch((error) => {
    toast.error('Failed to load jobs')
    Sentry.captureException(error)
  })
```

### 10.5 Not Cleaning Up Failed State

```typescript
// ✗ WRONG: Button still shows "Loading..."
const [loading, setLoading] = useState(false)

const handleSubmit = async () => {
  setLoading(true)
  try {
    await submitForm()
  } catch (error) {
    toast.error('Failed')
    // Loading state stuck true!
  }
}

// ✓ RIGHT: Always clean up
const handleSubmit = async () => {
  setLoading(true)
  try {
    await submitForm()
  } catch (error) {
    toast.error('Failed')
  } finally {
    setLoading(false)
  }
}
```

### 10.6 Alert() for Errors

```typescript
// ✗ WRONG: Ugly, can't brand
alert('Error: ' + error.message)

// ✓ RIGHT: Use dialog or toast
toast.error(error.message, {
  description: 'Contact support if the problem persists.',
  action: { label: 'Support', onClick: () => window.open('/support') },
})
```

### 10.7 Exposing Internal Details to Users

```typescript
// ✗ WRONG: Raw error message confuses users
toast.error('PostgrestError: column "job_description" violates check constraint')

// ✓ RIGHT: Friendly message
toast.error('Job description too short. Minimum 50 characters required.')
```

### 10.8 Assuming Async Success

```typescript
// ✗ WRONG: Code assumes mutation succeeds
const saveJob = async (data) => {
  await supabase.from('jobs').insert(data)
  setJobs([...jobs, data]) // Optimistic, but no error rollback
}

// ✓ RIGHT: Rollback on error or use React Query
const mutation = useMutation({
  mutationFn: saveJob,
  onMutate: async (newJob) => {
    // Optimistic update
    queryClient.setQueryData(['jobs'], (old) => [...old, newJob])
  },
  onError: (error, newJob, context) => {
    // Rollback on error
    queryClient.setQueryData(['jobs'], context.previousJobs)
    toast.error('Failed to save')
  },
})
```

---

## 11. Implementation Checklist

Use this checklist when adding error handling to any feature:

- [ ] Identify error types (user, business, network, auth, server)
- [ ] Add validation at input (form/API level)
- [ ] Add error boundary at feature level
- [ ] Handle Supabase/Edge Function errors with classification
- [ ] Show user-friendly error messages (no internals)
- [ ] Add retry button/action when appropriate
- [ ] Log critical errors to Sentry (with tags + context)
- [ ] Clean up loading/disabled state in finally block
- [ ] Test error paths (not just happy path)
- [ ] Update documentation if new error code

---

## 12. Quick Reference: Error Codes

Create a shared enum for consistency:

```typescript
// src/lib/errorCodes.ts
export enum ErrorCode {
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',

  // Auth
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  RLS_VIOLATION = 'RLS_VIOLATION',

  // Business Logic
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  PLAN_LIMIT_REACHED = 'PLAN_LIMIT_REACHED',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',

  // Network
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  OFFLINE = 'OFFLINE',

  // Server
  DATABASE_ERROR = 'DATABASE_ERROR',
  FUNCTION_ERROR = 'FUNCTION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // Unknown
  UNKNOWN = 'UNKNOWN',
}
```

---

## References

- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Supabase Error Handling](https://supabase.com/docs/reference/javascript/error-handling)
- [React Query Error Handling](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults#showing-errors)
- [Sonner Documentation](https://sonner.emilkowal.ski/)
- [Sentry Best Practices](https://docs.sentry.io/platforms/javascript/enriching-events/)

---

**Version:** 1.0
**Last Updated:** 2026-04-04
**Owner:** Boldteq (Yash)
**Status:** Production-Ready
