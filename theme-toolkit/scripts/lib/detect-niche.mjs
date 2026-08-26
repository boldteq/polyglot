// detect-niche — infer a client's niche from brief + products + brand-direction + reference-map
// so drape can auto-load the matching niche-dna pack (patterns/good/shopify-loop-unblock-fixes-2026-08-25).
//
// Weighted scoring:
//   +10  explicit `niche:` field in docs/brief.md YAML front-matter
//   +5   product-type keyword hit (per unique hit; e.g. "shampoo" → haircare)
//   +3   brand-direction keyword hit (per unique hit)
//   +2   alias hit anywhere in brief prose
// Threshold 8 = confident enough to auto-write `dna_pack: <niche>`; below = fall through to human popup.
//
// Pure function — no filesystem access. Callers pass parsed inputs. Tested by fixture in scripts/__fixtures__.

const HOME_NICHE_PACKS_DIR = '~/.claude/memory/design/ecom/niche-dna-packs' // for docs; not read here

// PURE: score one pack against the inputs.
// Returns { score, hits: [{signal, matched, weight}] } — hits are the human-readable evidence.
export function scorePack(pack, { briefNicheField = null, briefProse = '', brandProse = '', products = [], referenceOcr = '' } = {}) {
  const hits = []
  let score = 0

  const lower = (s) => String(s || '').toLowerCase()
  const briefText = lower(briefProse)
  const brandText = lower(brandProse)
  const refText = lower(referenceOcr)
  const productText = products.map(lower).join(' ')

  // 1. Explicit niche field → decisive
  if (briefNicheField && String(briefNicheField).trim().toLowerCase() === pack.niche) {
    hits.push({ signal: 'brief.niche field', matched: pack.niche, weight: 10 })
    score += 10
  }

  // 2. Product-type keyword hits (each unique match once)
  const seenPk = new Set()
  for (const kw of (pack.product_type_keywords || [])) {
    const k = lower(kw)
    if (seenPk.has(k)) continue
    if (productText.includes(k) || briefText.includes(k)) {
      hits.push({ signal: 'product-type keyword', matched: kw, weight: 5 })
      score += 5
      seenPk.add(k)
    }
  }

  // 3. Brand-direction keyword hits
  const seenBd = new Set()
  for (const kw of (pack.brand_direction_keywords || [])) {
    const k = lower(kw)
    if (seenBd.has(k)) continue
    if (brandText.includes(k) || briefText.includes(k)) {
      hits.push({ signal: 'brand-direction keyword', matched: kw, weight: 3 })
      score += 3
      seenBd.add(k)
    }
  }

  // 4. Alias hits — cheaper signal (aliases are broader), so weight 2
  const seenAl = new Set()
  for (const al of (pack.aliases || [])) {
    const a = lower(al)
    if (seenAl.has(a)) continue
    if (briefText.includes(a) || brandText.includes(a) || refText.includes(a)) {
      hits.push({ signal: 'alias', matched: al, weight: 2 })
      score += 2
      seenAl.add(a)
    }
  }

  // 5. Niche name itself in prose (weight 4 — stronger than alias, weaker than product-type)
  if (briefText.includes(pack.niche) || brandText.includes(pack.niche)) {
    hits.push({ signal: 'niche name in prose', matched: pack.niche, weight: 4 })
    score += 4
  }

  return { score, hits }
}

// PURE: rank all packs, return top match + evidence trail.
// {niche, confidence, evidence, runner_up} — runner_up helps callers surface "close but not chosen".
export function detectNiche({ manifest, brief = {}, brandDirection = '', products = [], referenceOcr = '', threshold = 8 } = {}) {
  if (!manifest || !Array.isArray(manifest.packs)) return { niche: null, confidence: 0, evidence: [], reason: 'manifest missing' }

  const inputs = {
    briefNicheField: brief.niche || brief.frontmatter?.niche || null,
    briefProse: brief.prose || brief.text || '',
    brandProse: brandDirection,
    products,
    referenceOcr,
  }

  const scored = manifest.packs
    .map(pack => ({ pack, ...scorePack(pack, inputs) }))
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  const runnerUp = scored[1]

  if (!top || top.score < threshold) {
    return {
      niche: null,
      confidence: top?.score || 0,
      evidence: top?.hits || [],
      reason: `top score ${top?.score || 0} < threshold ${threshold} — falling through to human popup`,
      runner_up: runnerUp ? { niche: runnerUp.pack.niche, score: runnerUp.score } : null,
    }
  }

  return {
    niche: top.pack.niche,
    calibration: top.pack.calibration,
    extends: top.pack.extends,
    confidence: top.score,
    evidence: top.hits,
    reason: `top match ${top.pack.niche} (${top.pack.calibration}) at score ${top.score} ≥ threshold ${threshold}`,
    runner_up: runnerUp ? { niche: runnerUp.pack.niche, score: runnerUp.score } : null,
  }
}

// PURE: parse a brief.md file's YAML front-matter + prose. Callers do the fs.readFileSync; this stays pure.
// Recognises the minimal `niche: X` / `products: [a, b]` shape without pulling a yaml dep.
export function parseBrief(mdContent) {
  const s = String(mdContent || '')
  const fm = s.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  const out = { niche: null, products: [], prose: s }
  if (fm) {
    out.prose = s.slice(fm[0].length)
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^(\w+)\s*:\s*(.+?)\s*$/)
      if (!m) continue
      const [, k, v] = m
      if (k === 'niche') out.niche = String(v).replace(/^["']|["']$/g, '')
      else if (k === 'products') {
        const list = v.match(/^\[(.*)\]$/)
        out.products = list ? list[1].split(',').map(p => p.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [String(v).trim()]
      }
    }
  }
  return out
}
