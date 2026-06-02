import { useEffect } from 'react'

// Warns before the browser unloads (reload / tab close / hard navigation) while
// there are unsaved edits, so a stray refresh can't silently discard work.
//
// LIMITATION (C11 audit): this does NOT intercept in-app SPA navigation (sidebar
// NavLinks, ⌘K, in-app Links). react-router's useBlocker requires a *data* router
// (createBrowserRouter), but App.tsx uses <BrowserRouter>. Full SPA-nav blocking
// is deferred to the Phase 4 data-router migration. Editors should still keep
// their existing in-component back-button confirms until then.
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}
