// change-router — route a client's requested change to the SWT owner who will DO it, and force human
// escalation for anything that needs a real decision/asset/claim a blind pipeline must never invent.
//
// PURE, no IO — hermetically testable. The owner SET mirrors lib/gate-owner.mjs (loom/drape/ink/conduit/
// beacon) + the two SWT specialists that own non-gate work (lattice = metafield/metaobject schema,
// porter = live store data via Admin API). ESCALATE mirrors gate-owner's ESCALATE_GATES/ESCALATE_CHECK_RE
// doctrine: legal, pricing, honesty/claims, and real photography DECISIONS go to a human — an intake tool
// that auto-assigns "change the refund policy to 30 days" to a builder would be the worst outcome.
//
// This is the DETERMINISTIC cross-check on the Claude extraction: the model proposes an owner per item;
// routeOwner keeps a valid non-escalate proposal, but ALWAYS forces `human` when the change smells like a
// real-decision need, and falls back to keyword inference when the proposal is missing/unknown.

// Every SWT agent that can own a change item. `human` = escalate; `atrium` = triage (unknown nature).
export const KNOWN_OWNERS = new Set(['loom', 'drape', 'ink', 'conduit', 'lattice', 'beacon', 'porter', 'human', 'atrium'])

// Needs a real decision/asset/claim/legal/money → human. Highest priority, overrides any proposal.
// Mirrors gate-owner.mjs ESCALATE_CHECK_RE intent (legal/price/claim/real-asset) for an INTAKE context.
const ESCALATE_RE =
  /\b(refund|return|privacy|terms|legal|policy|gdpr|ccpa|compliance|disclaimer|warranty|guarantee)\b|\b(price|pricing|discount|coupon|cost|charge|fee|tax|subscription\s+price)\b|\b(testimonial|review\s+claim|clinical|efficacy|medical|fda|certified|award|press\s+feature|statistic|stat\b|percent\s+claim)\b|\bfabricat|\bmade[-\s]?up\b/i

// Ordered concern → owner. First match wins, so put the most specific/least-ambiguous concerns first.
// Each entry: [regex over the change text, owner]. Keyword sets are intentionally broad but disjoint enough.
const OWNER_RULES = [
  // store DATA (products, collections, images to upload, catalog, menu content) → porter (Admin API)
  [/\b(product|collection|catalog|inventory|sku|variant|upload\s+(image|photo|logo)|add\s+(a\s+)?(product|page|blog|menu|collection)|menu\s+item|nav(igation)?\s+link|import\b)\b/i, 'porter'],
  // 3rd-party apps / analytics / integrations / dynamic data → conduit
  [/\b(klaviyo|judge\.?me|loox|recharge|yotpo|okendo|gorgias|integrat|analytics|ga4|google\s+analytics|meta\s+pixel|facebook\s+pixel|tracking|tag\s+manager|gtm|api|webhook|email\s+(signup|capture|list)|newsletter\s+(app|integration)|feed)\b/i, 'conduit'],
  // metafield / metaobject / structured content model → lattice
  [/\b(metafield|metaobject|custom\s+field|data\s+model|structured\s+(data|content)\s+model|lookbook\s+data|specification\s+fields?)\b/i, 'lattice'],
  // SEO / meta / redirects / schema markup → beacon
  [/\b(seo|meta\s+(title|description|tag)|json-?ld|structured\s+data|schema\s+markup|canonical|sitemap|redirect|url\s+(structure|slug|handle)|keyword|search\s+ranking|rich\s+result)\b/i, 'beacon'],
  // copy / wording / text content → ink
  [/\b(copy|wording|text|headline|sub-?head|tagline|microcopy|paragraph|sentence|rename|label\s+text|button\s+text|cta\s+text|typo|grammar|spelling|reword|rewrite|say\b|message\s+says)\b/i, 'ink'],
  // visual design / brand look → drape
  [/\b(colou?r|font|typograph|palette|spacing|padding|margin|gradient|shadow|rounded|border\s+radius|style|styling|look|aesthetic|design|theme\s+colou?r|brand\s+look|visual|bigger|smaller|larger|whitespace|align)\b/i, 'drape'],
  // liquid / sections / layout / behaviour / build → loom (the broad default builder)
  [/\b(section|block|add\s+a\s+section|remove\s+(the\s+)?section|move|reorder|swap|layout|responsive|mobile|desktop|sticky|header|footer|slider|carousel|slideshow|accordion|tabs?|animation|hover|dropdown|filter|sort|grid|column|template|page\s+layout|404|link\b|banner|hero|button\b)\b/i, 'loom'],
]

// PURE: does this change need a human decision? → the reason string, or null.
export function escalateReason(change) {
  const m = ESCALATE_RE.exec(String(change || ''))
  return m ? `needs a real decision/asset/claim (matched "${m[0]}") — human` : null
}

// PURE: keyword-infer the owner from the change text alone (fallback when no valid proposal).
// Unknown nature → 'atrium' (the SWT lead triages) rather than guessing a builder.
export function inferOwner(change) {
  const t = String(change || '')
  for (const [re, owner] of OWNER_RULES) if (re.test(t)) return owner
  return 'atrium'
}

// PURE: final owner for a change. Escalation wins; else a valid non-escalate proposal is kept; else infer.
// → { owner, escalate, reason }
export function routeOwner(change, proposedOwner) {
  const esc = escalateReason(change)
  if (esc) return { owner: 'human', escalate: true, reason: esc }
  const p = String(proposedOwner || '').trim().toLowerCase()
  if (KNOWN_OWNERS.has(p) && p !== 'human' && p !== 'atrium') return { owner: p, escalate: false, reason: 'model proposal (valid)' }
  const owner = inferOwner(change)
  return { owner, escalate: false, reason: p ? `proposal "${p}" unknown → inferred` : 'inferred from change text' }
}
