import { PageShell } from '../components/PageShell'
import Memory from './Memory'

// Context Hub (LangSmith "Context Hub") — the shared knowledge/memory brain,
// promoted out of Settings to a top-level surface. Wraps the existing Memory
// panel (semantic store + file tree + capture tools) in a page shell.
export default function ContextHub() {
  return (
    <PageShell title="Context Hub" subtitle="Shared agent memory, knowledge, and semantic store — the brain every agent reads from">
      <Memory />
    </PageShell>
  )
}
