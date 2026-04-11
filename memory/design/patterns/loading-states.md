# Loading States Patterns — SaaS UX Design

**Last updated:** 2026-04-04

Loading states are not just spinners. They're part of perceived performance and UX. Good loading states make apps feel fast, prevent user frustration, and create confidence that something is happening.

---

## 1. Core Principles

### Perceived Performance > Actual Performance
Users perceive fast operations if you:
- Show immediate feedback (disable button, fade UI)
- Display progress (skeleton, percentage, status)
- Prefetch data before user needs it
- Use optimistic updates (assume success, rollback if fail)

### Golden Rules
1. **Never show blank screen** — always show skeleton, loading state, or previous content
2. **Show progress for >2s operations** — spinner alone for <2s, progress bar for longer
3. **Disable interaction** — prevent duplicate submissions during load
4. **Graceful degradation** — show stale data + "refreshing..." if fetch fails
5. **Clear language** — "Analyzing resumes..." not generic "Loading..."

---

## 2. Skeleton Loading (Preferred)

Skeleton screens show a placeholder that matches the shape of real content, dramatically improving perceived performance.

### Why Skeletons > Spinners
- ✓ Shows exact layout (no surprise reflows)
- ✓ Feels faster (user sees content taking shape)
- ✓ Communicates what's loading
- ✗ Spinners: Generic, can feel slower due to layout shift

### Basic Skeleton Component
```tsx
import { Skeleton } from "@/components/ui/skeleton"

export function CandidateListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex gap-4 p-4 border rounded-lg">
          {/* Avatar skeleton */}
          <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />

          {/* Content skeleton */}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>

          {/* Score skeleton */}
          <Skeleton className="w-16 h-8 rounded flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}
```

### Skeleton with Shimmer Animation
```tsx
// Add shimmer effect via CSS
// In your globals CSS or Tailwind config

export function ShimmerSkeleton() {
  return (
    <div className="bg-slate-200 animate-pulse rounded">
      {/* Content */}
    </div>
  );
}

// Or use tailwind-animate with custom keyframes
const skeletonStyles = `
  @keyframes shimmer {
    0% {
      background-position: -1200px 0;
    }
    100% {
      background-position: calc(1200px + 100%) 0;
    }
  }

  .shimmer {
    background: linear-gradient(
      90deg,
      #f0f0f0 0%,
      #e0e0e0 50%,
      #f0f0f0 100%
    );
    background-size: 1200px 100%;
    animation: shimmer 2s infinite;
  }
`;

export function SkeletonWithShimmer() {
  return <div className="shimmer rounded h-4 w-full" />;
}
```

### Match Exact Layout
```tsx
export function JobDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="border-b pb-4 space-y-3">
        <Skeleton className="h-8 w-3/4" /> {/* Title */}
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24" /> {/* Badge 1 */}
          <Skeleton className="h-6 w-20" /> {/* Badge 2 */}
        </div>
      </div>

      {/* Content sections */}
      {[1, 2, 3].map(i => (
        <div key={i}>
          <Skeleton className="h-6 w-1/3 mb-3" /> {/* Section title */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}

      {/* CTA button */}
      <Skeleton className="h-10 w-full rounded-lg mt-6" />
    </div>
  );
}
```

### Best Practices
- ✓ Match real content dimensions exactly (no layout shift)
- ✓ Use `animate-pulse` from Tailwind or custom shimmer
- ✓ Show entire layout (header + content + footer)
- ✓ Never show >5 skeleton rows (looks like infinite load)
- ✓ Pair with timeout: if not loaded in 10s, show error
- ✓ Keep skeleton subtle (gray #f0f0f0, not jarring)

---

## 3. Spinners & Loaders

Use spinners for short operations (<2s) or when layout is unknown.

### When to Use Spinners
- Short API calls (< 2 seconds)
- Button loading state
- Inline small operations
- When you can't show skeleton (unknown content shape)

### Spinner Button Pattern
```tsx
import { Loader2 } from 'lucide-react'

export function LoadingButton({
  isLoading,
  onClick,
  children,
  ...props
}) {
  return (
    <Button
      onClick={onClick}
      disabled={isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Loading...
        </>
      ) : (
        children
      )}
    </Button>
  );
}

// Usage
export function CreateJobForm() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      await api.createJob({ /* ... */ });
      toast.success('Job created');
    } catch (error) {
      toast.error('Failed to create job');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form>
      {/* Form fields */}
      <LoadingButton
        isLoading={isLoading}
        onClick={handleSubmit}
      >
        Create job
      </LoadingButton>
    </form>
  );
}
```

### Centered Spinner Pattern
```tsx
export function FullPageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
        <p className="text-sm text-slate-600 mt-2">Loading your ranking...</p>
      </div>
    </div>
  );
}
```

### Inline Loader Pattern
```tsx
export function RefreshingCard({ data, onRefresh }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Candidate Rankings</CardTitle>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2"
        >
          <RotateCw
            className={cn(
              'w-4 h-4',
              isRefreshing && 'animate-spin'
            )}
          />
        </button>
      </CardHeader>
      <CardContent>
        {/* Content */}
      </CardContent>
    </Card>
  );
}
```

### Best Practices
- ✓ Always include loading label ("Loading...", "Uploading...")
- ✓ Disable interaction (prevent duplicate submissions)
- ✓ Animate spinner smoothly (SVG + rotate animation)
- ✓ Pair with timeout (show error after 10s)
- ✓ Use muted color (slate-400, not bright colors)

---

## 4. Progress Bars

For long-running operations (>5s) that have deterministic progress.

### Determinate Progress (File Upload)
```tsx
export function FileUploadProgress({ progress, fileName }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-900">
          Uploading {fileName}
        </p>
        <span className="text-xs text-slate-600">{progress}%</span>
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}

// Usage with FormData upload
export function ResumeUploader() {
  const [progress, setProgress] = useState(0);

  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        onUploadProgress: (e) => {
          const pct = Math.round((e.loaded / e.total) * 100);
          setProgress(pct);
        },
      });
    } catch (error) {
      toast.error('Upload failed');
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={(e) => handleUpload(e.target.files[0])}
      />
      {progress > 0 && progress < 100 && (
        <FileUploadProgress progress={progress} />
      )}
    </div>
  );
}
```

### Indeterminate Progress (Bulk Processing)
```tsx
export function ProcessingProgress({ status, itemsProcessed, total }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{status}</p>
        <span className="text-xs text-slate-600">
          {itemsProcessed} of {total}
        </span>
      </div>
      {/* Indeterminate: no value prop, smooth animation */}
      <Progress className="h-2" />
    </div>
  );
}
```

### Best Practices
- ✓ Show actual progress percentage (users want to know ETA)
- ✓ Use deterministic progress when possible
- ✓ Update frequently (at least every 500ms)
- ✓ Never show 100% until truly complete
- ✓ Allow cancellation (if operation supports it)

---

## 5. Optimistic Updates

Update UI immediately, assume success, rollback on failure. Creates snappiest UX.

### Basic Pattern (React 19+)
```tsx
import { useOptimistic } from 'react';

export function CandidateActions({ candidate, onUpdate }) {
  const [optimisticCandidate, updateOptimisticCandidate] = useOptimistic(
    candidate,
    (state, action) => {
      if (action.type === 'star') {
        return { ...state, isStarred: !state.isStarred };
      }
      return state;
    }
  );

  const handleStar = async () => {
    // Update UI immediately
    updateOptimisticCandidate({ type: 'star' });

    try {
      // Then sync to server
      await api.updateCandidate(candidate.id, {
        isStarred: !candidate.isStarred,
      });
      toast.success('Candidate saved');
    } catch (error) {
      // If fails, UI reverts to previous state automatically
      toast.error('Failed to save. Try again.');
    }
  };

  return (
    <button
      onClick={handleStar}
      className={cn(
        'p-2',
        optimisticCandidate.isStarred && 'text-yellow-500'
      )}
    >
      <Star
        className="w-4 h-4"
        fill={optimisticCandidate.isStarred ? 'currentColor' : 'none'}
      />
    </button>
  );
}
```

### React Query Approach (useOptimistic + useMutation)
```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function ScoreCard({ result }) {
  const queryClient = useQueryClient();
  const [optimisticScore, setOptimisticScore] = useState(result.score);

  const updateMutation = useMutation({
    mutationFn: async (newScore) => {
      return await api.updateScore(result.id, newScore);
    },
    onSuccess: () => {
      // Revalidate data
      queryClient.invalidateQueries(['results']);
    },
    onError: () => {
      // Revert on error
      setOptimisticScore(result.score);
      toast.error('Failed to update score');
    },
  });

  const handleAdjustScore = async (newScore) => {
    setOptimisticScore(newScore); // Update UI immediately
    updateMutation.mutate(newScore); // Then sync to server
  };

  return (
    <div>
      <p className="text-2xl font-bold">
        {optimisticScore}%
      </p>
      <Button
        onClick={() => handleAdjustScore(optimisticScore + 5)}
        disabled={updateMutation.isPending}
      >
        {updateMutation.isPending ? 'Saving...' : 'Increase'}
      </Button>
    </div>
  );
}
```

### Best Practices
- ✓ Only use for low-risk mutations (likes, stars, toggles)
- ✓ Always show subtle indicator that update is pending (faded icon, spinner)
- ✓ Provide clear rollback on failure (toast with "Undo" button)
- ✓ Don't use for destructive actions (delete, archive)
- ✓ Assume success <95% of the time (network errors rare for simple actions)

---

## 6. Streaming & Suspense (React 18+)

For data that arrives in chunks (file uploads, real-time processing).

### Suspense Boundaries
```tsx
import { Suspense } from 'react';

export function JobRankingPage() {
  return (
    <div className="space-y-6">
      {/* Header loads immediately */}
      <Header />

      {/* Job details with Suspense fallback */}
      <Suspense fallback={<JobDetailSkeleton />}>
        <JobDetailContent />
      </Suspense>

      {/* Results load separately */}
      <Suspense fallback={<ResultsListSkeleton />}>
        <ResultsList />
      </Suspense>
    </div>
  );
}
```

### Streaming Response (Edge Function)
```tsx
// Backend: Supabase Edge Function streams progress
async function rankResumes(jobId, resumeIds) {
  const stream = new TransformStream({
    async transform(chunk, controller) {
      // Process each resume
      // Send progress events
      controller.enqueue(new TextEncoder().encode(
        `data: ${JSON.stringify({ status: 'processing', progress: 50 })}\n\n`
      ));
      await delay(1000);
      controller.enqueue(new TextEncoder().encode(
        `data: ${JSON.stringify({ status: 'complete', result })}\n\n`
      ));
    },
  });

  return new Response(stream.readable);
}

// Frontend: Listen to streaming updates
export function StreamingProgressIndicator({ jobId }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const eventSource = new EventSource(`/api/rank/${jobId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data.progress);

      if (data.status === 'complete') {
        eventSource.close();
        // Redirect to results
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      toast.error('Processing failed');
    };

    return () => eventSource.close();
  }, [jobId]);

  return (
    <div className="space-y-2">
      <p className="text-sm">Processing: {progress}%</p>
      <Progress value={progress} />
    </div>
  );
}
```

---

## 7. Loading States by Duration

### < 2 seconds
Use button spinner or inline loader. No progress bar.

```tsx
<Button disabled={isLoading}>
  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
  Submit
</Button>
```

### 2-5 seconds
Show skeleton screen or spinner + label.

```tsx
{isLoading ? (
  <div className="flex items-center justify-center p-8">
    <Loader2 className="w-6 h-6 animate-spin mr-2" />
    <span>Analyzing resumes...</span>
  </div>
) : (
  <ResultsList />
)}
```

### 5-30 seconds
Show progress bar with status updates.

```tsx
{isLoading && (
  <div className="space-y-2">
    <p className="text-sm">Processing: {progress}%</p>
    <Progress value={progress} />
    <p className="text-xs text-slate-500">
      {estimatedSecondsRemaining}s remaining
    </p>
  </div>
)}
```

### > 30 seconds
Consider background job with email notification instead of blocking UI.

```tsx
// Don't show loading screen for >30s operations
// Instead, show confirmation and email when ready
toast.success('Job submitted. You\'ll receive an email when complete.');
redirect('/dashboard');
```

---

## 8. Perceived Performance Tips

### Prefetching
```tsx
export function CandidateRow({ result, onHover }) {
  const queryClient = useQueryClient();

  const handleHover = () => {
    // Prefetch candidate details on hover
    queryClient.prefetchQuery({
      queryKey: ['candidate', result.id],
      queryFn: () => api.getCandidate(result.id),
    });
    onHover?.();
  };

  return (
    <div onMouseEnter={handleHover}>
      {/* Content */}
    </div>
  );
}
```

### Stale-While-Revalidate
```tsx
const query = useQuery({
  queryKey: ['results', jobId],
  queryFn: () => api.getResults(jobId),
  staleTime: 30000, // 30s
  gcTime: 10 * 60 * 1000, // 10m cache
});

// Shows stale data immediately, refetches in background
```

### Disable Buttons During Load
```tsx
<Button disabled={isLoading || isSubmitting}>
  Save
</Button>
```

### Provide Feedback Immediately
```tsx
// Bad: Wait for server response
const handleSave = async () => {
  const result = await api.save();
  toast.success('Saved');
};

// Good: Feedback immediately
const handleSave = async () => {
  toast.loading('Saving...');
  try {
    const result = await api.save();
    toast.success('Saved');
  } catch (error) {
    toast.error('Failed to save');
  }
};
```

---

## 9. Loading State Testing Checklist

Before shipping:

- [ ] Skeleton matches real content layout exactly
- [ ] No layout shift when content loads (CLS = 0)
- [ ] Buttons are disabled during load (no duplicate submissions)
- [ ] Loading state has clear label (not generic spinner)
- [ ] Timeout after 10s (show error state, not infinite spinner)
- [ ] Works on slow 3G network (test in DevTools)
- [ ] Works with no internet (show error gracefully)
- [ ] Loading state visible for at least 400ms (too-fast loads are jarring)
- [ ] Works on mobile (spinner size, label readable)
- [ ] Dark mode works (spinner visible in dark theme)
- [ ] Cancel works (if operation supports it)

---

---

## Dark Mode Implementation

### Color Mapping
- Light skeleton: `bg-slate-200` → Dark: `dark:bg-slate-700`
- Light shimmer gradient: `#f0f0f0` → Dark: `#3a3a3a`
- Light text: `text-slate-400` → Dark: `dark:text-slate-600`
- Light loader spinner: Standard gray → Dark: lighter gray with `dark:text-slate-300`

### Key Dark Mode Rules for Loading States
1. **Skeleton backgrounds**: Use `dark:bg-slate-700` for proper contrast on dark surfaces, avoid pure `bg-gray-200` which disappears on dark
2. **Shimmer animation**: Adjust gradient to work in dark mode — lighten the gradient's stop colors (`#4a4a4a` to `#5a5a5a`)
3. **Spinner colors**: Use `text-slate-400 dark:text-slate-300` to ensure visibility in both themes

### Dark Mode Skeleton Example
```tsx
export function DarkModeSkeleton() {
  return (
    <div className="space-y-4 p-6">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex gap-4">
          {/* Avatar skeleton - darker on dark mode */}
          <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="flex-1 space-y-2">
            {/* Text skeletons */}
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Dark mode spinner
export function DarkModeLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-300 mx-auto" />
    </div>
  );
}
```

---

## Responsive Behavior

### Breakpoint Strategy
- **Mobile (< 640px)**: Show 2-3 skeleton rows max to avoid overwhelming the screen, smaller card dimensions
- **Tablet (640px - 1024px)**: Show 3-4 skeleton rows, standard card sizes
- **Desktop (> 1024px)**: Show full skeleton layout matching exact content dimensions, multiple skeleton columns

### Key Responsive Rules for Loading States
1. **Skeleton count**: Reduce on mobile to 2-3 rows, expand to 4-5 rows on desktop using conditional rendering
2. **Skeleton width**: Full width on mobile (`w-full`), constrained on desktop using container widths
3. **Avatar size**: `w-10 h-10` on mobile, `w-12 h-12` on desktop using `sm:w-12 sm:h-12`
4. **Layout**: Single-column on mobile, grid on desktop using `grid-cols-1 sm:grid-cols-2`

### Responsive Skeleton Example
```tsx
export function ResponsiveSkeleton() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Mobile: show 2 skeletons, desktop: show 4 */}
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`flex gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg ${i > 2 ? 'hidden sm:flex' : ''}`}>
          {/* Avatar: smaller on mobile, larger on desktop */}
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0 sm:w-12 sm:h-12" />
          
          {/* Content area */}
          <div className="flex-1 space-y-2">
            {/* Title skeleton: full width on mobile, constrained on desktop */}
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full sm:w-3/4" />
            {/* Subtitle skeleton: shorter on mobile */}
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2 sm:w-2/3" />
          </div>
          
          {/* Badge: hidden on mobile, shown on desktop */}
          <div className="w-12 h-8 bg-slate-200 dark:bg-slate-700 rounded hidden sm:block flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}
```

---

## References & Further Reading

- [React useOptimistic Hook](https://react.dev/reference/react/useOptimistic)
- [Optimistic UI Updates in React](https://www.freecodecamp.org/news/how-to-use-the-optimistic-ui-pattern-with-the-useoptimistic-hook-in-react/)
- [React Loading States Best Practices](https://blog.logrocket.com/handling-react-loading-states-react-loading-skeleton/)
- [Skeleton Loading Patterns](https://ej2.syncfusion.com/react/documentation/skeleton/shimmer-effect)
- [Streaming with React](https://react.dev/reference/react/Suspense)
- [Shimmer CSS Animation](https://codewithbilal.medium.com/how-to-create-a-skeleton-loading-shimmer-effect-with-pure-css-7f9041ec9134)
