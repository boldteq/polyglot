// Render the lightweight inline markdown that build/CHANGES/activity text actually uses
// (**bold** + `code`) instead of showing raw asterisks/backticks. Builds React nodes from
// string parts — never dangerouslySetInnerHTML, so it's injection-safe. Inline-only: it adds
// no block spacing, so it's safe inside truncated single-line rows and checklist items.
export function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return <>{parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} className="font-semibold text-text">{p.slice(2, -2)}</strong>
    if (/^`[^`]+`$/.test(p)) return <code key={i} className="text-[11px] bg-text-muted/10 px-1 py-0.5 rounded font-mono">{p.slice(1, -1)}</code>
    return <span key={i}>{p}</span>
  })}</>
}
