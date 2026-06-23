// Pill tone classes for a client-project lifecycle status. Shared by ProjectHeader
// + WorkspaceProjects (they had identical maps). NOT used by the Shopify page
// (different palette) or StorePreview (page-build statuses, different keys).
export const PROJECT_STATUS_TONE: Record<string, string> = {
  intake: 'text-text-muted bg-text-muted/10',
  building: 'text-accent bg-accent/10',
  preview: 'text-amber bg-amber/10',
  published: 'text-green bg-green/10',
  archived: 'text-text-muted bg-text-muted/10',
}
