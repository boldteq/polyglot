// Project route params (`:projectId`) are URL-safe base64 of the absolute
// project path (see ProjectDetail). These helpers decode them for display —
// e.g. breadcrumbs that need the human-readable project name.

/** Decode a `:projectId` route param to the absolute project path. */
export function projectPathFromId(projectId: string): string {
  try {
    return atob(projectId.replace(/-/g, '+').replace(/_/g, '/'))
  } catch {
    return ''
  }
}

/** Human-readable project name (last path segment) for a `:projectId` param.
 *  Falls back to the raw id if the path can't be decoded. */
export function projectNameFromId(projectId: string): string {
  const path = projectPathFromId(projectId)
  return path.split('/').filter(Boolean).pop() || projectId
}
