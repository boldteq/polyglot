// Page-matrix resolution + storefront-password auth for URL gates (lighthouse/axe/seo).
//
// resolvePages({ previewUrl, password, overrides, want }) → { origin, preserved, pages[] }
//   - preserves preview query params (preview_theme_id, key, _ab) onto every matrix URL
//   - handle discovery: env overrides → /products.json + /collections.json → sitemap.xml
//   - mandatory pages (home, pdp, collection, cart, search) unresolvable → throws EnvError
//     (caller maps EnvError → exit 2); optional pages (blog, article, page) → { skipped, reason }
//
// authFetch(url, { password }) — fetch that survives Shopify password walls: on a
// redirect to /password it POSTs form_type=storefront_password&password=… and carries
// the storefront_digest cookie (module-scope cookie jar) on every later request.
//
// No external deps — global fetch (Node 20). ESM.

export class EnvError extends Error {
  constructor(message) {
    super(message)
    this.name = 'EnvError'
    this.isEnvError = true
  }
}

export const MANDATORY_PAGES = ['home', 'pdp', 'collection', 'cart', 'search']
export const OPTIONAL_PAGES = ['blog', 'article', 'page']

const PRESERVED_PARAMS = ['preview_theme_id', 'key', '_ab']
const REDIRECT_STATUSES = [301, 302, 303, 307, 308]

// ── cookie jar (module scope — shared across all fetches in one gate run) ──
const jar = new Map() // origin → Map(cookieName → value)

function jarCookieHeader(origin) {
  const cookies = jar.get(origin)
  if (!cookies || cookies.size === 0) return null
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function captureSetCookies(origin, res) {
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  if (setCookies.length === 0) return
  const cookies = jar.get(origin) ?? new Map()
  for (const sc of setCookies) {
    const [pair] = sc.split(';')
    const eq = pair.indexOf('=')
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
  jar.set(origin, cookies)
}

export function resetCookieJar() {
  jar.clear()
}

async function passwordLogin(origin, password) {
  const body = new URLSearchParams({ form_type: 'storefront_password', utf8: '✓', password })
  const res = await fetch(`${origin}/password`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual',
  })
  captureSetCookies(origin, res)
  const cookies = jar.get(origin)
  if (!cookies || !cookies.has('storefront_digest')) {
    throw new EnvError(`storefront password rejected at ${origin}/password (no storefront_digest cookie issued)`)
  }
}

// fetch that survives Shopify password walls. opts = { password, ...fetchInit }
export async function authFetch(url, opts = {}) {
  const { password, ...init } = opts
  const origin = new URL(url).origin
  let target = url
  for (let hop = 0; hop < 8; hop += 1) {
    const headers = new Headers(init.headers ?? {})
    const cookie = jarCookieHeader(origin)
    if (cookie) headers.set('cookie', cookie)
    const res = await fetch(target, { ...init, headers, redirect: 'manual' })
    captureSetCookies(origin, res)
    if (!REDIRECT_STATUSES.includes(res.status)) return res
    const loc = res.headers.get('location')
    if (!loc) return res
    const next = new URL(loc, target)
    if (/\/password\/?$/.test(next.pathname)) {
      if (!password) {
        throw new EnvError(`${url} redirects to the storefront password page and no password was provided (set THEME_STORE_PASSWORD)`)
      }
      await passwordLogin(origin, password) // then retry the same target with the digest cookie
      continue
    }
    target = next.toString()
  }
  throw new EnvError(`too many redirects fetching ${url}`)
}

async function fetchJson(url, password) {
  const res = await authFetch(url, { password, headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

function sitemapLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1])
}

// kind: 'blogs' | 'pages' — returns the first matching pathname or null (never throws)
async function discoverFromSitemap(origin, password, kind) {
  try {
    const idxRes = await authFetch(`${origin}/sitemap.xml`, { password })
    if (!idxRes.ok) return null
    const subUrls = sitemapLocs(await idxRes.text()).filter(u => u.includes(`sitemap_${kind}_`))
    for (const su of subUrls) {
      const subRes = await authFetch(su, { password })
      if (!subRes.ok) continue
      const want = kind === 'blogs' ? /\/blogs\// : /\/pages\//
      const loc = sitemapLocs(await subRes.text()).find(u => want.test(u))
      if (loc) return new URL(loc).pathname
    }
    return null
  } catch (err) {
    if (err instanceof EnvError) throw err // password wall is a hard env failure, not "no blog"
    console.error(`[pages] sitemap discovery (${kind}) failed: ${err.message}`)
    return null
  }
}

export async function resolvePages({ previewUrl, password, overrides = {}, want } = {}) {
  if (!previewUrl) throw new EnvError('no preview URL (set THEME_PREVIEW_URL or STORE + THEME_ID)')
  let base
  try {
    base = new URL(previewUrl)
  } catch {
    throw new EnvError(`invalid preview URL: ${previewUrl}`)
  }
  const origin = base.origin

  // preview query params carried onto every matrix URL
  const preserved = new URLSearchParams()
  for (const p of PRESERVED_PARAMS) {
    const v = base.searchParams.get(p)
    if (v !== null) preserved.set(p, v)
  }
  const withParams = (pathAndQuery) => {
    const u = new URL(pathAndQuery, origin)
    for (const [k, v] of preserved) u.searchParams.set(k, v)
    return u.toString()
  }

  // discovery overrides: explicit param → env var → live discovery
  const env = process.env
  const ov = {
    productHandle: overrides.FIRST_PRODUCT_HANDLE ?? overrides.productHandle ?? env.FIRST_PRODUCT_HANDLE ?? null,
    collectionHandle: overrides.FIRST_COLLECTION_HANDLE ?? overrides.collectionHandle ?? env.FIRST_COLLECTION_HANDLE ?? null,
    blogPath: overrides.BLOG_PATH ?? overrides.blogPath ?? env.BLOG_PATH ?? null,
    articlePath: overrides.ARTICLE_PATH ?? overrides.articlePath ?? env.ARTICLE_PATH ?? null,
    pagePath: overrides.PAGE_PATH ?? overrides.pagePath ?? env.PAGE_PATH ?? null,
  }

  const wanted = Array.isArray(want) && want.length > 0 ? want : [...MANDATORY_PAGES]
  const mandatory = new Set(MANDATORY_PAGES)
  const pages = []

  let articleFromSitemap = null // shared between blog + article resolution
  const blogArticlePath = async () => {
    if (articleFromSitemap === null) {
      articleFromSitemap = (await discoverFromSitemap(origin, password, 'blogs')) ?? false
    }
    return articleFromSitemap || null
  }

  for (const id of wanted) {
    try {
      let p
      if (id === 'home') {
        p = '/'
      } else if (id === 'cart') {
        p = '/cart'
      } else if (id === 'search') {
        p = '/search?q=test'
      } else if (id === 'pdp') {
        let handle = ov.productHandle
        if (!handle) {
          const data = await fetchJson(withParams('/products.json?limit=1'), password)
          handle = data?.products?.[0]?.handle ?? null
        }
        if (!handle) throw new Error('no published products via /products.json — set FIRST_PRODUCT_HANDLE')
        p = `/products/${handle}`
      } else if (id === 'collection') {
        let handle = ov.collectionHandle
        if (!handle) {
          const data = await fetchJson(withParams('/collections.json?limit=1'), password)
          handle = data?.collections?.[0]?.handle ?? null
        }
        if (!handle) throw new Error('no collections via /collections.json — set FIRST_COLLECTION_HANDLE')
        p = `/collections/${handle}`
      } else if (id === 'blog') {
        let bp = ov.blogPath
        if (!bp) {
          const article = await blogArticlePath()
          if (article) bp = `/${article.split('/').filter(Boolean).slice(0, 2).join('/')}`
        }
        if (!bp) throw new Error('no blog found via sitemap — set BLOG_PATH')
        p = bp
      } else if (id === 'article') {
        const ap = ov.articlePath ?? (await blogArticlePath())
        if (!ap) throw new Error('no article found via sitemap — set ARTICLE_PATH')
        p = ap
      } else if (id === 'page') {
        const pp = ov.pagePath ?? (await discoverFromSitemap(origin, password, 'pages'))
        if (!pp) throw new Error('no /pages/* entry found via sitemap — set PAGE_PATH')
        p = pp
      } else {
        throw new Error(`unknown page id "${id}"`)
      }
      pages.push({ id, path: p, url: withParams(p) })
    } catch (err) {
      if (err instanceof EnvError) throw err // password wall / hard env failure always escalates
      if (mandatory.has(id)) {
        throw new EnvError(`mandatory page "${id}" unresolvable: ${err.message}`)
      }
      pages.push({ id, skipped: true, reason: err.message })
    }
  }

  return { origin, preserved: Object.fromEntries(preserved), pages }
}
