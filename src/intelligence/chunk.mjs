// Boldteq Intelligence — markdown-aware chunking.
// Splits a doc into retrieval chunks along heading boundaries, sub-splitting long
// sections, and prepends the doc title + heading path to each chunk so a retrieved
// fragment carries its context (much better retrieval than blind fixed-size windows).

const MAX = Number.parseInt(process.env.INTEL_CHUNK_MAX || '1400', 10) // chars per chunk target
const OVERLAP = Number.parseInt(process.env.INTEL_CHUNK_OVERLAP || '150', 10)

function splitLong(text) {
  if (text.length <= MAX) return [text]
  const parts = []
  // prefer paragraph boundaries; fall back to hard windows with overlap
  const paras = text.split(/\n{2,}/)
  let buf = ''
  for (const p of paras) {
    if (buf && (buf.length + p.length + 2) > MAX) { parts.push(buf.trim()); buf = buf.slice(Math.max(0, buf.length - OVERLAP)) }
    buf += (buf ? '\n\n' : '') + p
    while (buf.length > MAX) { parts.push(buf.slice(0, MAX).trim()); buf = buf.slice(MAX - OVERLAP) }
  }
  if (buf.trim()) parts.push(buf.trim())
  return parts
}

// title: the doc's display name (the H1 or the filename); returns [{ text, headingPath }].
// Walks a heading stack so each chunk carries its full "Title › H2 › H3" context path.
export function chunkMarkdown(raw, title) {
  const lines = String(raw).split('\n')
  const stack = []
  const out = []
  let cur = []
  let curPath = title ? [title] : []
  const emit = () => {
    const text = cur.join('\n').trim()
    if (!text) { cur = []; return }
    for (const piece of splitLong(text)) {
      const prefix = curPath.length ? `[${curPath.join(' › ')}]\n` : ''
      out.push({ text: prefix + piece, headingPath: curPath.join(' › ') })
    }
    cur = []
  }
  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      emit()
      const depth = h[1].length
      const name = h[2].replace(/[#*`]/g, '').trim()
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop()
      stack.push({ depth, name })
      curPath = (title ? [title] : []).concat(stack.map(s => s.name))
    } else {
      cur.push(line)
    }
  }
  emit()
  return out.filter(c => c.text.replace(/\s+/g, ' ').trim().length > 20)
}
