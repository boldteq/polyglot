# React State Management Reference — Boldteq SaaS Standard

**Version:** 1.0
**Last Updated:** 2026-04-04
**Scope:** All Boldteq SaaS applications (React 18+, TypeScript)
**Applies To:** Stack A (Next.js/SPA), Stack A-Lovable (Vite/React), Stack B (Remix)

---

## Executive Summary

State management is the hardest part of React. This guide eliminates confusion by assigning each type of state to exactly one tool. **The golden rule: if data comes from the server, it goes in React Query. Full stop.**

**Five state categories → Five tools:**

| State Type | Tool | Keep-Alive | Examples |
|-----------|------|-----------|----------|
| **Server State** | React Query 5 | 5–30 min (configurable) | User profile, jobs list, results, plans, analytics |
| **Form State** | React Hook Form + Zod | Duration of form submission | Login form, settings, JD input, multi-step wizard |
| **UI State** | `useState` / `useReducer` | Component lifetime | Modal open/closed, active tab, expanded row, tooltip |
| **URL State** | React Router `useSearchParams` | Browser history (bookmarkable) | Filters, pagination, selected ID, active section |
| **Global Client** | Zustand (sparingly) | Session lifetime | Theme preference, sidebar collapsed, command palette |

---

## 1. State Classification System

### 1.1 Server State (React Query)

**Definition:** Data from a database, API, or external source.

**Characteristics:**
- Shared across users (eventually)
- Can become stale
- Requires refetch/sync logic
- Asynchronous to load
- Can fail

**Examples:**
- User profile (`profiles` table)
- List of jobs (`jobs` table)
- Ranking results (`results` table)
- Plan catalog
- Admin dashboard stats
- Email templates

**Tool:** React Query (TanStack Query)

**Why not useState:**
- `useState` has no cache
- `useState` requires manual refetch logic
- `useState` + `useEffect` = race conditions
- No built-in stale-time management
- No built-in mutation handling

**Key Rules:**
- Every query must have a `queryKey`
- Every mutation must invalidate related queries
- Use `staleTime` to reduce unnecessary refetches
- Use `gcTime` (garbage collection time) for memory management
- Optimize with `keepPreviousData` for seamless pagination
- Use subscriptions for real-time (Supabase + React Query integration)

---

### 1.2 Form State (React Hook Form + Zod)

**Definition:** Temporary user input that will be submitted or discarded.

**Characteristics:**
- Lives in a single form component (usually)
- Has validation rules (schema-first)
- Changes frequently during editing
- Must survive unintended navigation (warn user)
- Can have errors tied to specific fields

**Examples:**
- Login/signup form
- Job description input
- Settings form (account info, email, password)
- Resume upload dialog
- Subscription plan selection
- Multi-step wizard

**Tool:** React Hook Form + Zod

**Why not useState:**
- `useState` requires boilerplate for each field
- No built-in validation
- Error handling is manual
- Harder to reset entire form
- No schema = no type safety

**Key Rules:**
- Define schema first with Zod (`z.object`)
- Use `zodResolver()` to wire validation
- Use `register()` for simple inputs, `Controller` for complex (Select, RadioGroup)
- Call `reset()` after successful submission
- Use `setError()` to show server-side validation errors
- Use `watch()` for conditional fields, **not** `useEffect`
- Use `useFieldArray` for dynamic fields (multi-resume upload)

---

### 1.3 UI State (useState / useReducer)

**Definition:** Visual state that affects rendering but not data.

**Characteristics:**
- Local to one or a few components
- Changes synchronously (click, hover, etc.)
- Not saved to server
- Does not require validation

**Examples:**
- Modal open/closed
- Accordion expanded/collapsed
- Tabs (active tab index)
- Dropdown menu open/closed
- Selected row in table
- Tooltip visible
- Sidebar collapsed/expanded (locally, before syncing to server)
- Search input value (before submit)

**Tool:** `useState` for simple state, `useReducer` for complex interactions

**Key Rules:**
- Keep UI state close to where it's used
- If state is needed by multiple siblings, lift to parent
- **Don't duplicate server data** (e.g., don't copy `jobs` from React Query into `useState`)
- Use `useCallback` when passing event handlers to children to avoid re-renders
- Use `useMemo` to derive state instead of storing it

---

### 1.4 URL State (React Router useSearchParams)

**Definition:** State that is bookmarkable and shareable via URL.

**Characteristics:**
- Lives in query parameters (`?tab=settings&page=2`)
- Survives page refresh
- Can be bookmarked and shared
- Affects visual appearance or content
- Usually tied to filtering/pagination

**Examples:**
- Active tab (`?tab=dashboard`)
- Current page (`?page=3`)
- Filters (`?status=pending&priority=high`)
- Search query (`?q=react`)
- Selected ID (`?jobId=12345`)

**Tool:** React Router `useSearchParams` hook

**Key Rules:**
- Update URL atomically with `setSearchParams()`
- Use `searchParams.get()` for reading
- Always provide defaults (`?? 'value'`)
- Parse numbers: `Number(searchParams.get('page') ?? '1')`
- Sync URL with React Query queryKey for proper caching
- Never store secrets in URL

---

### 1.5 Global Client State (Zustand — Rare)

**Definition:** Truly global state that is not server-derived and not tied to URL.

**Characteristics:**
- Same value across entire app
- Does not come from server
- Rarely changes (or changes infrequently)
- User preference

**Examples:**
- Theme preference (dark/light)
- Sidebar collapsed state (if not persisted to server)
- Command palette open/closed
- Notification permissions
- User preferences for animations/sounds

**Tool:** Zustand

**Key Rules:**
- Use Zustand only if `useState` + context becomes unwieldy
- Most apps don't need it (seriously)
- If you're reaching for Zustand, ask: "Is this server state?" — if yes, use React Query
- Persist to `localStorage` via Zustand middleware if needed
- Keep Zustand store shallow and focused

**Common Mistake:** Storing server state in Zustand
```tsx
// WRONG ❌
const userStore = create((set) => ({
  user: null,
  setUser: (u) => set({ user: u }),
}))

// RIGHT ✅
const { data: user } = useQuery({ queryKey: ['user'], ... })
```

---

## 2. React Query Patterns (Deep Dive)

### 2.1 Standard Query

```tsx
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

type Job = Database['public']['Tables']['jobs']['Row']

export function useJobs(userId: string) {
  return useQuery<Job[], Error>({
    queryKey: ['jobs', userId], // Must include user_id for isolation
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000, // Data is fresh for 5 minutes
    gcTime: 30 * 60 * 1000,   // Keep in cache for 30 minutes after last use
    enabled: !!userId,         // Don't query if userId is missing
  })
}
```

**Explanation:**
- `queryKey`: Must be an array. First element is the entity name, rest are variables that affect the query.
- `queryFn`: Async function that fetches data. Must throw on error.
- `staleTime`: How long data is considered fresh. No refetch until stale.
- `gcTime`: How long unused data stays in cache (formerly `cacheTime`).
- `enabled`: Conditional querying (e.g., don't fetch if userId is null).

### 2.2 Queries with Parameters

```tsx
// Single parameter (sorting)
export function useJobsSorted(userId: string, sortBy: 'recent' | 'popular') {
  return useQuery({
    queryKey: ['jobs', userId, sortBy], // Include all variables
    queryFn: () => fetchJobs(userId, sortBy),
    staleTime: 5 * 60 * 1000,
  })
}

// Multiple parameters (filtering)
export function useResults(jobId: string, options?: { minScore?: number }) {
  return useQuery({
    queryKey: ['results', jobId, options?.minScore],
    queryFn: () => fetchResults(jobId, options),
    staleTime: 2 * 60 * 1000,
  })
}
```

**Rule:** Every variable that affects the result must be in `queryKey`. React Query uses this to cache separate queries.

### 2.3 Mutations with Optimistic Updates

```tsx
export function useUpdateJob() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (updatedJob: Partial<Job>) => {
      const { data, error } = await supabase
        .from('jobs')
        .update(updatedJob)
        .eq('id', updatedJob.id)
        .select()
        .single()

      if (error) throw error
      return data
    },

    // BEFORE sending to server
    onMutate: async (updatedJob) => {
      // Cancel any in-flight queries for this job
      await queryClient.cancelQueries({
        queryKey: ['jobs', user?.id],
      })

      // Save previous data for rollback
      const previous = queryClient.getQueryData(['jobs', user?.id])

      // Optimistically update cache
      queryClient.setQueryData(['jobs', user?.id], (old: Job[]) =>
        old.map((job) =>
          job.id === updatedJob.id ? { ...job, ...updatedJob } : job
        )
      )

      // Return context for rollback
      return { previous }
    },

    // ON SUCCESS
    onSuccess: (data) => {
      queryClient.setQueryData(['jobs', user?.id], (old: Job[]) =>
        old.map((job) => (job.id === data.id ? data : job))
      )
      toast.success('Job updated')
    },

    // ON FAILURE
    onError: (error, updatedJob, context) => {
      // Rollback cache
      queryClient.setQueryData(['jobs', user?.id], context?.previous)
      toast.error(`Failed to update: ${error.message}`)
    },

    // AFTER success or error
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['jobs', user?.id],
      })
    },
  })
}
```

**Flow:**
1. User clicks "Save"
2. `onMutate`: Cancel pending queries, save old data, update cache immediately (optimistic)
3. Server call in flight
4. Server responds with success → `onSuccess`: Use fresh server data
5. Server responds with error → `onError`: Restore old data, show toast
6. `onSettled`: (Always runs) Invalidate related queries to refetch

### 2.4 Dependent Queries

```tsx
export function useJobWithResults(jobId: string | null) {
  // Job query
  const jobQuery = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => fetchJob(jobId!),
    enabled: !!jobId, // Don't fetch if jobId is null
  })

  // Results query depends on job existing
  const resultsQuery = useQuery({
    queryKey: ['results', jobId],
    queryFn: () => fetchResults(jobId!),
    enabled: !!jobQuery.data, // Only fetch after job loads
  })

  return { job: jobQuery.data, results: resultsQuery.data, isLoading: jobQuery.isLoading || resultsQuery.isLoading }
}
```

**Pattern:** Chain `enabled` conditions to sequence async operations.

### 2.5 Infinite Queries (Pagination)

```tsx
export function useInfiniteResults(jobId: string) {
  return useInfiniteQuery({
    queryKey: ['results', jobId],
    queryFn: async ({ pageParam = 1 }) => {
      const { data, error } = await supabase
        .from('results')
        .select('*')
        .eq('job_id', jobId)
        .range((pageParam - 1) * 10, pageParam * 10 - 1)

      if (error) throw error
      return { results: data, nextPage: pageParam + 1 }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  })
}

// In component
const { data, hasNextPage, fetchNextPage } = useInfiniteResults(jobId)
const allResults = data?.pages.flatMap(p => p.results) ?? []

return (
  <>
    {allResults.map(r => <CandidateRow key={r.id} result={r} />)}
    {hasNextPage && <Button onClick={() => fetchNextPage()}>Load more</Button>}
  </>
)
```

### 2.6 Prefetching (Eager Loading)

```tsx
export function useJobList() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const query = useQuery({
    queryKey: ['jobs', user?.id],
    queryFn: () => fetchJobs(user!.id),
  })

  // Prefetch details when hovering over a job
  const handleHoverJob = (jobId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['jobs', jobId],
      queryFn: () => fetchJob(jobId),
    })
  }

  return { ...query, handleHoverJob }
}
```

**Use case:** Before user clicks to view job details, prefetch the data on hover.

### 2.7 Polling (Auto-Refetch)

```tsx
// In rankAndPoll() function
const { data: job, isLoading } = useQuery({
  queryKey: ['jobs', jobId],
  queryFn: () => fetchJob(jobId),
  refetchInterval: 2000, // Poll every 2 seconds
  refetchIntervalInBackground: false, // Stop when tab hidden
  enabled: job?.status === 'processing', // Stop when done
})
```

**Use case:** Wait for async operation to complete (e.g., resume ranking).

### 2.8 Real-time Subscriptions + React Query

```tsx
export function useFeatureFlags() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!user?.id) return

    // Subscribe to real-time updates
    const subscription = supabase
      .channel('feature_flags')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feature_flags' },
        () => {
          // Invalidate cache when server pushes update
          queryClient.invalidateQueries({
            queryKey: ['feature_flags', user.id],
          })
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [user?.id, queryClient])

  return useQuery({
    queryKey: ['feature_flags', user?.id],
    queryFn: () => fetchFeatureFlags(user!.id),
    enabled: !!user?.id,
  })
}
```

**Flow:**
1. Component mounts, subscribes to Supabase channel
2. User query renders first (from cache or network)
3. Server pushes update via Supabase realtime
4. `invalidateQueries()` marks cache as stale
5. Component re-queries automatically
6. On unmount, unsubscribe

---

## 3. Form State with React Hook Form + Zod

### 3.1 Basic Form Setup

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

// 1. SCHEMA FIRST (defines types + validation rules)
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().default(false),
})

type LoginFormData = z.infer<typeof loginSchema>

// 2. COMPONENT
export function LoginForm() {
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
    mode: 'onBlur', // Validate on blur, not onChange (better UX)
  })

  // 3. HANDLE SUBMIT (with mutation)
  const loginMutation = useMutation({
    mutationFn: (data: LoginFormData) => supabase.auth.signInWithPassword(data),
    onSuccess: () => {
      toast.success('Logged in!')
      navigate('/dashboard')
    },
    onError: (error) => {
      // Show server-side validation error
      form.setError('email', {
        type: 'server',
        message: error.message,
      })
    },
  })

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data)
  }

  // 4. RENDER
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <input
        {...form.register('email')}
        placeholder="Email"
        type="email"
      />
      {form.formState.errors.email && (
        <span className="text-red-500">{form.formState.errors.email.message}</span>
      )}

      <input
        {...form.register('password')}
        placeholder="Password"
        type="password"
      />
      {form.formState.errors.password && (
        <span className="text-red-500">{form.formState.errors.password.message}</span>
      )}

      <label>
        <input {...form.register('rememberMe')} type="checkbox" />
        Remember me
      </label>

      <button type="submit" disabled={loginMutation.isPending}>
        {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  )
}
```

**Key Points:**
- `zodResolver` bridges Zod and React Hook Form
- `mode: 'onBlur'` validates when user leaves field (not on every keystroke)
- `setError()` shows server errors tied to specific fields
- Form state is automatically reset after successful submission

### 3.2 Complex Input Types (shadcn/ui)

```tsx
import { Controller } from 'react-hook-form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const settingsSchema = z.object({
  email: z.string().email(),
  plan: z.enum(['free', 'pro', 'enterprise']),
  emailNotifications: z.boolean(),
})

export function SettingsForm() {
  const form = useForm({
    resolver: zodResolver(settingsSchema),
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Text input (standard) */}
      <input {...form.register('email')} />

      {/* Select (needs Controller because shadcn/ui is uncontrolled) */}
      <Controller
        control={form.control}
        name="plan"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger>
              <SelectValue placeholder="Choose plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        )}
      />

      {/* Checkbox (standard) */}
      <label>
        <input {...form.register('emailNotifications')} type="checkbox" />
        Get emails
      </label>

      <button type="submit">Save</button>
    </form>
  )
}
```

**Rule:** Use `register()` for native HTML inputs, use `Controller` for third-party components (Select, DatePicker, etc.).

### 3.3 Dynamic Fields (useFieldArray)

```tsx
const uploadSchema = z.object({
  resumes: z.array(z.object({
    file: z.instanceof(File),
    candidateName: z.string(),
  })),
})

export function ResumeUploadForm() {
  const form = useForm({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      resumes: [{ file: undefined, candidateName: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'resumes',
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {fields.map((field, index) => (
        <div key={field.id}>
          <input
            {...form.register(`resumes.${index}.file`)}
            type="file"
            accept=".pdf,.doc,.docx"
          />

          <input
            {...form.register(`resumes.${index}.candidateName`)}
            placeholder="Candidate name"
          />

          <button type="button" onClick={() => remove(index)}>
            Remove
          </button>
        </div>
      ))}

      <button type="button" onClick={() => append({ file: undefined, candidateName: '' })}>
        Add another resume
      </button>

      <button type="submit">Upload all</button>
    </form>
  )
}
```

**Pattern:** `useFieldArray` manages arrays of form inputs. Use `field.id` as key (not index), and register with dot notation (`resumes.0.file`).

### 3.4 Conditional Fields with watch()

```tsx
const orderSchema = z.object({
  orderType: z.enum(['subscription', 'oneTime']),
  subscriptionPlan: z.string().optional(),
  creditAmount: z.number().optional(),
})

export function OrderForm() {
  const form = useForm({
    resolver: zodResolver(orderSchema),
  })

  // WATCH (not useState!)
  const orderType = form.watch('orderType')

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <select {...form.register('orderType')}>
        <option value="subscription">Subscription</option>
        <option value="oneTime">One-time credits</option>
      </select>

      {/* Show different fields based on orderType */}
      {orderType === 'subscription' && (
        <select {...form.register('subscriptionPlan')}>
          <option value="pro">Pro ($29/mo)</option>
          <option value="enterprise">Enterprise ($99/mo)</option>
        </select>
      )}

      {orderType === 'oneTime' && (
        <input
          {...form.register('creditAmount', { valueAsNumber: true })}
          type="number"
          placeholder="Number of credits"
        />
      )}

      <button type="submit">Proceed</button>
    </form>
  )
}
```

**Why not `useEffect`:** `watch()` is synchronous and lightweight. `useEffect` adds complexity and race conditions.

### 3.5 Autosave with Debounce

```tsx
import { useDebouncedCallback } from 'use-debounce'

export function EditJobForm({ jobId }: { jobId: string }) {
  const form = useForm({
    resolver: zodResolver(jobSchema),
  })

  const updateMutation = useMutation({
    mutationFn: (data) => supabase.from('jobs').update(data).eq('id', jobId),
  })

  // Debounce save: wait 1 second after user stops typing
  const debouncedSave = useDebouncedCallback((data) => {
    updateMutation.mutate(data)
  }, 1000)

  // Subscribe to form changes
  const subscription = form.watch((data) => {
    debouncedSave(data)
  })

  return (
    <form>
      <textarea {...form.register('jobDescription')} />
      {updateMutation.isPending && <p>Saving...</p>}
      {updateMutation.isError && <p className="text-red-500">Save failed</p>}
    </form>
  )
}
```

### 3.6 Multi-Step Form with State Persistence

```tsx
const multiStepSchema = z.object({
  // Step 1
  email: z.string().email(),
  // Step 2
  password: z.string().min(8),
  // Step 3
  fullName: z.string(),
})

export function SignUpWizard() {
  const [step, setStep] = useState(1)
  const form = useForm({
    resolver: zodResolver(multiStepSchema),
    defaultValues: localStorage.getItem('signupDraft')
      ? JSON.parse(localStorage.getItem('signupDraft')!)
      : { email: '', password: '', fullName: '' },
  })

  // Auto-save to localStorage on change
  const subscription = form.watch((data) => {
    localStorage.setItem('signupDraft', JSON.stringify(data))
  })

  const onSubmit = async (data) => {
    // Submit complete form
    await createUser(data)
    localStorage.removeItem('signupDraft') // Clear draft
    setStep(4) // Success screen
  }

  const validateAndNextStep = async () => {
    const fieldsToValidate = step === 1 ? ['email'] : step === 2 ? ['password'] : ['fullName']
    const isValid = await form.trigger(fieldsToValidate)
    if (isValid) setStep(step + 1)
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {step === 1 && <input {...form.register('email')} />}
      {step === 2 && <input {...form.register('password')} type="password" />}
      {step === 3 && <input {...form.register('fullName')} />}

      <button type="button" onClick={() => setStep(step - 1)} disabled={step === 1}>
        Back
      </button>

      {step < 3 ? (
        <button type="button" onClick={validateAndNextStep}>
          Next
        </button>
      ) : (
        <button type="submit">Complete</button>
      )}
    </form>
  )
}

useEffect(() => {
  return () => subscription.unsubscribe()
}, [subscription])
```

---

## 4. URL State Patterns

### 4.1 Basic Sync with useSearchParams

```tsx
import { useSearchParams } from 'react-router-dom'

export function JobsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // READ from URL
  const tab = searchParams.get('tab') ?? 'overview'
  const page = Number(searchParams.get('page') ?? '1')
  const status = searchParams.get('status')

  // WRITE to URL (without navigation)
  const handleTabChange = (newTab: string) => {
    setSearchParams((prev) => {
      prev.set('tab', newTab)
      return prev
    })
  }

  const handlePageChange = (newPage: number) => {
    setSearchParams((prev) => {
      prev.set('page', String(newPage))
      return prev
    })
  }

  return (
    <div>
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'details' && <DetailsTab />}
      {tab === 'results' && <ResultsTab page={page} onPageChange={handlePageChange} />}
    </div>
  )
}
```

**Key:**
- `setSearchParams()` updates URL without full navigation
- URL becomes: `?tab=results&page=2`
- User can bookmark `http://app.com/jobs?tab=results&page=2` and share

### 4.2 Filters in URL

```tsx
export function FilteredResults() {
  const [searchParams, setSearchParams] = useSearchParams()

  const minScore = Number(searchParams.get('minScore') ?? '0')
  const skills = searchParams.getAll('skill') // Multiple values
  const status = searchParams.get('status') ?? 'all'

  const { data: results } = useQuery({
    queryKey: ['results', minScore, skills, status], // Include filters
    queryFn: () => fetchResults({ minScore, skills, status }),
  })

  const updateFilters = (newFilters: Partial<FilterState>) => {
    setSearchParams((prev) => {
      if (newFilters.minScore !== undefined) {
        prev.set('minScore', String(newFilters.minScore))
      }
      if (newFilters.skills !== undefined) {
        prev.delete('skill')
        newFilters.skills.forEach((s) => prev.append('skill', s))
      }
      if (newFilters.status !== undefined) {
        prev.set('status', newFilters.status)
      }
      return prev
    })
  }

  return (
    <div>
      <SliderInput
        value={minScore}
        onChange={(v) => updateFilters({ minScore: v })}
        label="Min score"
      />

      <MultiSelect
        value={skills}
        onChange={(v) => updateFilters({ skills: v })}
        options={['React', 'TypeScript', 'PostgreSQL']}
      />

      <Results data={results} />
    </div>
  )
}
```

**URL result:** `?minScore=80&skill=React&skill=TypeScript&status=qualified`

### 4.3 Search Query in URL

```tsx
export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchQuery = searchParams.get('q') ?? ''

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', searchQuery],
    queryFn: () => searchResumes(searchQuery),
    enabled: searchQuery.length > 0,
  })

  const handleSearch = (query: string) => {
    if (query) {
      setSearchParams({ q: query })
    } else {
      setSearchParams({})
    }
  }

  return (
    <div>
      <input
        defaultValue={searchQuery}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search resumes..."
      />

      {isLoading && <LoadingSpinner />}
      {results?.map((r) => <ResultCard key={r.id} result={r} />)}
    </div>
  )
}
```

### 4.4 Selected Item in URL

```tsx
export function JobList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedJobId = searchParams.get('jobId')

  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: fetchJobs })
  const { data: selectedJob } = useQuery({
    queryKey: ['jobs', selectedJobId],
    queryFn: () => fetchJob(selectedJobId!),
    enabled: !!selectedJobId,
  })

  return (
    <div className="flex">
      {/* Left sidebar: list */}
      <div>
        {jobs?.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            isSelected={selectedJobId === job.id}
            onClick={() => setSearchParams({ jobId: job.id })}
          />
        ))}
      </div>

      {/* Right panel: detail */}
      {selectedJob && <JobDetailPanel job={selectedJob} />}
    </div>
  )
}
```

**Flow:**
- User clicks job → URL changes to `?jobId=123`
- `useQuery` for that job is enabled
- Detail panel renders
- User can bookmark or share `?jobId=123`
- On page reload, the job detail loads automatically

---

## 5. UI State Patterns

### 5.1 Simple useState

```tsx
export function ExpandableCard({ title, children }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div>
      <button onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? '▼' : '▶'} {title}
      </button>
      {isExpanded && <div>{children}</div>}
    </div>
  )
}
```

### 5.2 Complex UI State with useReducer

```tsx
type TableState = {
  selectedRows: Set<string>
  expandedRow: string | null
  sortColumn: string
  sortDirection: 'asc' | 'desc'
}

type TableAction =
  | { type: 'TOGGLE_ROW'; rowId: string }
  | { type: 'SELECT_ALL'; rowIds: string[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'EXPAND_ROW'; rowId: string }
  | { type: 'SORT'; column: string }

const initialState: TableState = {
  selectedRows: new Set(),
  expandedRow: null,
  sortColumn: 'name',
  sortDirection: 'asc',
}

function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case 'TOGGLE_ROW': {
      const newSelected = new Set(state.selectedRows)
      if (newSelected.has(action.rowId)) {
        newSelected.delete(action.rowId)
      } else {
        newSelected.add(action.rowId)
      }
      return { ...state, selectedRows: newSelected }
    }
    case 'SELECT_ALL':
      return { ...state, selectedRows: new Set(action.rowIds) }
    case 'CLEAR_SELECTION':
      return { ...state, selectedRows: new Set() }
    case 'EXPAND_ROW':
      return { ...state, expandedRow: action.rowId }
    case 'SORT': {
      const direction =
        state.sortColumn === action.column && state.sortDirection === 'asc'
          ? 'desc'
          : 'asc'
      return {
        ...state,
        sortColumn: action.column,
        sortDirection: direction,
      }
    }
    default:
      return state
  }
}

export function ResultsTable({ results }) {
  const [state, dispatch] = useReducer(tableReducer, initialState)

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      const aVal = a[state.sortColumn]
      const bVal = b[state.sortColumn]
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return state.sortDirection === 'asc' ? cmp : -cmp
    })
  }, [results, state.sortColumn, state.sortDirection])

  return (
    <table>
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              checked={state.selectedRows.size === results.length}
              onChange={(e) =>
                dispatch({
                  type: e.target.checked ? 'SELECT_ALL' : 'CLEAR_SELECTION',
                  rowIds: results.map((r) => r.id),
                })
              }
            />
          </th>
          <th onClick={() => dispatch({ type: 'SORT', column: 'name' })}>
            Name {state.sortColumn === 'name' && (state.sortDirection === 'asc' ? '▲' : '▼')}
          </th>
          <th onClick={() => dispatch({ type: 'SORT', column: 'score' })}>
            Score {state.sortColumn === 'score' && (state.sortDirection === 'asc' ? '▲' : '▼')}
          </th>
        </tr>
      </thead>
      <tbody>
        {sortedResults.map((result) => (
          <React.Fragment key={result.id}>
            <tr>
              <td>
                <input
                  type="checkbox"
                  checked={state.selectedRows.has(result.id)}
                  onChange={() => dispatch({ type: 'TOGGLE_ROW', rowId: result.id })}
                />
              </td>
              <td onClick={() => dispatch({ type: 'EXPAND_ROW', rowId: result.id })}>
                {result.name}
              </td>
              <td>{result.score}</td>
            </tr>
            {state.expandedRow === result.id && (
              <tr>
                <td colSpan={3}>
                  <ResultDetail result={result} />
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  )
}
```

**When to use:** Multiple related UI state changes that must update atomically (selection, expansion, sorting).

### 5.3 Derived State (useMemo, NOT useState)

```tsx
// WRONG ❌
export function Results({ results, threshold }) {
  const [filtered, setFiltered] = useState(results)

  useEffect(() => {
    setFiltered(results.filter(r => r.score >= threshold))
  }, [results, threshold])

  return filtered.map(r => <ResultCard key={r.id} result={r} />)
}

// RIGHT ✅
export function Results({ results, threshold }) {
  const filtered = useMemo(
    () => results.filter(r => r.score >= threshold),
    [results, threshold]
  )

  return filtered.map(r => <ResultCard key={r.id} result={r} />)
}
```

**Rule:** If state can be computed from props or other state, derive it with `useMemo`. Don't store it.

### 5.4 Callback Memoization with useCallback

```tsx
export function ResultsList({ results }) {
  // WRONG ❌ — creates new function on every render
  const handleRowClick = (rowId: string) => {
    console.log('Clicked:', rowId)
  }

  return results.map(r => <ResultRow key={r.id} result={r} onClick={handleRowClick} />)
}

// RIGHT ✅ — stable reference across renders
export function ResultsList({ results }) {
  const handleRowClick = useCallback((rowId: string) => {
    console.log('Clicked:', rowId)
  }, []) // Empty deps: function never changes

  return results.map(r => <ResultRow key={r.id} result={r} onClick={handleRowClick} />)
}

// With dependencies
export function ResultsList({ results, onAnalytics }) {
  const handleRowClick = useCallback(
    (rowId: string) => {
      onAnalytics('row_click', { rowId }) // Uses onAnalytics from props
    },
    [onAnalytics] // Re-create function if onAnalytics changes
  )

  return results.map(r => <ResultRow key={r.id} result={r} onClick={handleRowClick} />)
}
```

**Use case:** Passing event handlers to `React.memo()` children to prevent unnecessary re-renders.

---

## 6. Global State (Zustand — When & How)

### 6.1 Theme Store (Legitimate Use)

```tsx
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeStore {
  isDark: boolean
  toggle: () => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      isDark: false,
      toggle: () => set((state) => ({ isDark: !state.isDark })),
    }),
    {
      name: 'theme-storage', // localStorage key
    }
  )
)

// In component
export function App() {
  const { isDark, toggle } = useThemeStore()

  return (
    <div className={isDark ? 'dark' : ''}>
      <button onClick={toggle}>Toggle theme</button>
    </div>
  )
}
```

### 6.2 Sidebar State (Legitimate Use)

```tsx
interface SidebarStore {
  isCollapsed: boolean
  toggleCollapse: () => void
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isCollapsed: false,
  toggleCollapse: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
}))
```

### 6.3 Selector Pattern (Avoid Re-renders)

```tsx
// Problem: Any change to store re-renders all components
const isDark = useThemeStore((state) => state.isDark)

// Better: Use selectors
const isDarkSelector = (state: ThemeStore) => state.isDark
const isDark = useThemeStore(isDarkSelector)

// Or inline selector
const isDark = useThemeStore((state) => state.isDark)
```

### 6.4 When NOT to Use Zustand

```tsx
// WRONG ❌ — user profile is server state, not global client state
const userStore = create(() => ({
  user: null as User | null,
  setUser: (u: User) => set({ user: u }),
}))

// RIGHT ✅ — use React Query
const { data: user } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId),
})
```

**Golden Rule:** If data comes from the server, use React Query. Zustand is only for client-only preferences.

---

## 7. State Antipatterns (Never Do This)

### 7.1 useState for Server Data

```tsx
// WRONG ❌
export function JobsList() {
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    supabase.from('jobs').select('*').then(setJobs)
  }, [])

  return jobs.map(j => <JobCard key={j.id} job={j} />)
}

// RIGHT ✅
export function JobsList() {
  const { data: jobs } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => supabase.from('jobs').select('*'),
  })

  return jobs?.map(j => <JobCard key={j.id} job={j} />) ?? <LoadingSpinner />
}
```

**Why:** React Query handles caching, stale-time, refetch logic. useState + useEffect doesn't.

### 7.2 useEffect to Sync State

```tsx
// WRONG ❌
export function JobDetails({ jobId }) {
  const [job, setJob] = useState(null)

  useEffect(() => {
    fetchJob(jobId).then(setJob)
  }, [jobId])

  return <div>{job?.title}</div>
}

// RIGHT ✅
export function JobDetails({ jobId }) {
  const { data: job } = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => fetchJob(jobId),
  })

  return <div>{job?.title}</div>
}
```

**Why:** React Query automatically refetches when `jobId` changes. useEffect is error-prone (race conditions, cleanup bugs).

### 7.3 Prop Drilling > 3 Levels

```tsx
// WRONG ❌
<Parent results={results}>
  <Child results={results}>
    <Grandchild results={results}>
      <GreatGrandchild results={results} />
    </Grandchild>
  </Child>
</Parent>

// RIGHT ✅ (Option A: Composition)
<Parent>
  <Child>
    <Grandchild>
      <GreatGrandchildWithResults results={results} />
    </Grandchild>
  </Child>
</Parent>

// RIGHT ✅ (Option B: Context)
const ResultsContext = createContext(null)

<ResultsProvider results={results}>
  <Parent>
    <Child>
      <Grandchild>
        <GreatGrandchild /> {/* Access via useContext */}
      </Grandchild>
    </Child>
  </Parent>
</ResultsProvider>
```

### 7.4 Multiple Sources of Truth

```tsx
// WRONG ❌
const { data: user } = useQuery({ queryKey: ['user'], ... })
const [cachedUser, setCachedUser] = useState(user)
// Now `user` and `cachedUser` can diverge!

// RIGHT ✅
const { data: user } = useQuery({ queryKey: ['user'], ... })
// Use `user` everywhere. React Query is the single source of truth.
```

### 7.5 Not Cleaning Up Subscriptions

```tsx
// WRONG ❌
useEffect(() => {
  const subscription = supabase
    .channel('jobs')
    .on('postgres_changes', { event: '*', table: 'jobs' }, handle)
    .subscribe()
  // No cleanup! Subscription leaks on unmount.
}, [])

// RIGHT ✅
useEffect(() => {
  const subscription = supabase
    .channel('jobs')
    .on('postgres_changes', { event: '*', table: 'jobs' }, handle)
    .subscribe()

  return () => {
    subscription.unsubscribe()
  }
}, [])
```

### 7.6 Storing Derived Data

```tsx
// WRONG ❌
const [total, setTotal] = useState(0)

useEffect(() => {
  setTotal(results.reduce((sum, r) => sum + r.score, 0))
}, [results])

// RIGHT ✅
const total = useMemo(
  () => results.reduce((sum, r) => sum + r.score, 0),
  [results]
)
```

---

## 8. Performance Patterns

### 8.1 Memoization with useMemo

```tsx
// Problem: re-computes expensive calculation on every render
export function ResultsList({ results, threshold }) {
  const filtered = results.filter(r => r.score >= threshold)
  const sorted = filtered.sort((a, b) => b.score - a.score)
  const stats = {
    count: sorted.length,
    avg: sorted.reduce((sum, r) => sum + r.score, 0) / sorted.length,
  }

  return <div>{stats.count} results, avg {stats.avg.toFixed(2)}</div>
}

// Solution: memoize expensive computation
export function ResultsList({ results, threshold }) {
  const stats = useMemo(() => {
    const filtered = results.filter(r => r.score >= threshold)
    const sorted = filtered.sort((a, b) => b.score - a.score)
    return {
      count: sorted.length,
      avg: sorted.reduce((sum, r) => sum + r.score, 0) / sorted.length,
    }
  }, [results, threshold])

  return <div>{stats.count} results, avg {stats.avg.toFixed(2)}</div>
}
```

### 8.2 Component Memoization with React.memo

```tsx
// Heavy component
function CandidateCard({ result, onSelect }) {
  console.log('Rendering CandidateCard')
  return (
    <div onClick={() => onSelect(result.id)}>
      <h3>{result.name}</h3>
      <p>Score: {result.score}</p>
      {/* 200 lines of rendering logic */}
    </div>
  )
}

// Without memoization: re-renders on ANY parent change
// With memoization: only re-renders if `result` or `onSelect` change
export const MemoizedCandidateCard = React.memo(CandidateCard, (prev, next) => {
  return (
    prev.result.id === next.result.id &&
    prev.onSelect === next.onSelect
  )
})

// In parent, ensure onSelect is stable
export function ResultsList({ results }) {
  const handleSelect = useCallback((id: string) => {
    console.log('Selected:', id)
  }, [])

  return results.map(r => (
    <MemoizedCandidateCard key={r.id} result={r} onSelect={handleSelect} />
  ))
}
```

### 8.3 Suspense for Data Loading

```tsx
import { Suspense } from 'react'

function ResultsContent() {
  const { data } = useQuery({
    queryKey: ['results'],
    suspense: true, // React Query throws promise while loading
  })

  return (
    <ul>
      {data?.map(r => <li key={r.id}>{r.name}</li>)}
    </ul>
  )
}

export function ResultsPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ResultsContent />
    </Suspense>
  )
}
```

### 8.4 Virtual Scrolling for Long Lists

```tsx
import { FixedSizeList } from 'react-window'

export function LargeResultsList({ results }) {
  const Row = ({ index, style }) => (
    <div style={style}>
      <CandidateCard result={results[index]} />
    </div>
  )

  return (
    <FixedSizeList
      height={600}
      itemCount={results.length}
      itemSize={80}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  )
}
```

**Use case:** Lists with 1,000+ items. Only renders visible items in viewport.

### 8.5 Code Splitting with React.lazy

```tsx
import { lazy, Suspense } from 'react'

const AdminDashboard = lazy(() => import('./pages/Admin'))

export function App() {
  return (
    <Routes>
      <Route path="/admin" element={
        <Suspense fallback={<LoadingPage />}>
          <AdminDashboard />
        </Suspense>
      } />
    </Routes>
  )
}
```

**Effect:** Admin bundle only loads when user navigates to `/admin`.

---

## 9. Debugging & Troubleshooting

### 9.1 React Query DevTools

```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export function App() {
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>/* ... */</Routes>
        </BrowserRouter>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </>
  )
}
```

**Features:**
- See all queries and their cache state
- Manually refetch, invalidate, or reset queries
- Inspect request/response history
- Watch real-time updates

### 9.2 React DevTools Profiler

1. Open React DevTools (browser extension)
2. Go to "Profiler" tab
3. Click record icon
4. Perform action
5. Inspect which components re-rendered and why

**Look for:** Unnecessary re-renders of memoized components (usually missing dependency or unstable callback).

### 9.3 Common Issues

**Issue:** "Too many re-renders"
- Check for `setState` in render logic (not in event handler)
- Check for missing dependencies in `useEffect`

**Issue:** Stale data
- Check `staleTime` is appropriate
- Check `queryKey` includes all filter/sort variables
- Manually invalidate if needed

**Issue:** Form not submitting**
- Check `resolver: zodResolver(schema)`
- Check `mode: 'onBlur'` (or `onSubmit`)
- Check mutation `isPending` state

**Issue:** Memory leaks in tests
- Ensure `render()` cleanup: `const { unmount } = render(...)`
- Ensure subscriptions unsubscribe in `useEffect` cleanup

---

## 10. Testing State

```tsx
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    {children}
  </QueryClientProvider>
)

test('useJobs fetches and caches data', async () => {
  const { result } = renderHook(() => useJobs('user-1'), { wrapper })

  // Initially loading
  expect(result.current.isLoading).toBe(true)

  // Wait for query to finish
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false)
  })

  // Data loaded
  expect(result.current.data).toEqual([...])
})

test('form validation works', async () => {
  const { result } = renderHook(() => useForm({
    resolver: zodResolver(schema),
  }))

  act(() => {
    result.current.setValue('email', 'invalid')
  })

  await act(async () => {
    await result.current.trigger('email')
  })

  expect(result.current.formState.errors.email?.message).toBe('Invalid email')
})
```

---

## Summary: Decision Tree

```
Does this state come from the server?
├─ YES → React Query
└─ NO → Is this form input?
    ├─ YES → React Hook Form + Zod
    └─ NO → Should users be able to bookmark/share it?
        ├─ YES → URL state (useSearchParams)
        └─ NO → Is it just visual (modal open, tab active)?
            ├─ YES → useState/useReducer
            └─ NO → Is it truly global (theme, sidebar)?
                ├─ YES → Zustand
                └─ NO → You don't need this state
```

---

## Reference Card

| Scenario | Tool | Example |
|----------|------|---------|
| User profile loaded | React Query | `useQuery(['user', userId], ...)` |
| Job list from DB | React Query | `useQuery(['jobs'], ...)` |
| Login form | RHF + Zod | `useForm(resolver: zodResolver(...))` |
| Modal visibility | useState | `const [isOpen, setIsOpen] = useState(false)` |
| Search filters | useSearchParams | `searchParams.get('q')` |
| Active tab | useSearchParams or useState | Either works |
| Theme preference | Zustand | `useThemeStore()` |
| Expanded row | useState | `const [expanded, setExpanded] = useState(null)` |
| Mutation (save job) | React Query mutation | `useMutation(...)` |
| Optimistic update | onMutate + setQueryData | See 2.3 |

---

## Recommended Reading

- React Query Docs: https://tanstack.com/query/latest
- React Hook Form Docs: https://react-hook-form.com/
- Zustand Docs: https://github.com/pmndrs/zustand
- React Router Docs: https://reactrouter.com/

---

**End of Guide — v1.0 — Boldteq Standard**
