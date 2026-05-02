# Rule: No Silent Error Swallowing

Never write `catch(() => {})` or `catch { }` without showing UI feedback.

## Required pattern for all API calls in React components

```tsx
const [error, setError] = useState<string | null>(null)

try {
  const data = await someApi()
  setData(data)
} catch (err) {
  const msg = err instanceof Error ? err.message : 'Unknown error'
  setError(msg)
  toast('error', msg)
}
```

## For non-critical background fetches (drift, positions, etc.)

At minimum, log the error:
```tsx
getDrift().then(setDrift).catch(err => {
  console.error('[drift] fetch failed:', err.message)
  // optionally: setDriftError(true)
})
```

## Never do

```tsx
.catch(() => {})           // completely silent — forbidden
.catch(() => ({}))         // returns empty obj, hides failure — forbidden  
catch (e: unknown) {}      // swallows in backend — add console.error minimum
```

## Error state UI minimum

Every page that fetches data must have:
1. A loading state (spinner or skeleton)
2. An error state (banner or inline message with retry button)
3. An empty state (distinct from both above — no data, no error)

These three states must look visually different.
