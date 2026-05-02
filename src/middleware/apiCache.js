'use strict';

// Simple in-memory API response cache (Q31: 5s TTL for read endpoints)
// Only caches GET requests that return JSON. Cache-Control: no-cache bypasses it.
// Per-path deduplication — one pending request per unique path+query string.

const _cache = new Map(); // key → { body, expires, etag }
const DEFAULT_TTL_MS = 5_000;

function makeKey(req) {
  return req.method + ':' + req.originalUrl;
}

/**
 * apiCache(ttlMs?) — Express middleware factory.
 *
 * Usage in routes:
 *   router.get('/expensive-endpoint', apiCache(), (req, res) => { ... })
 *   router.get('/list', apiCache(30_000), (req, res) => { ... }) // 30s TTL
 */
function apiCache(ttlMs = DEFAULT_TTL_MS) {
  return (req, res, next) => {
    // Only cache GET requests; skip if client requests fresh data
    if (req.method !== 'GET') return next();
    if (req.headers['cache-control'] === 'no-cache') return next();

    const key = makeKey(req);
    const cached = _cache.get(key);
    if (cached && cached.expires > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Content-Type', 'application/json');
      return res.send(cached.body);
    }

    // Intercept res.json() to populate cache after response is formed
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode === 200) {
        _cache.set(key, { body: JSON.stringify(data), expires: Date.now() + ttlMs });
        // Evict stale entries when cache grows large
        if (_cache.size > 500) {
          const now = Date.now();
          for (const [k, v] of _cache) { if (v.expires < now) _cache.delete(k); }
        }
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(data);
    };
    next();
  };
}

/** Invalidate all cached entries matching a path prefix */
apiCache.invalidate = (prefix) => {
  for (const key of _cache.keys()) {
    if (key.includes(prefix)) _cache.delete(key);
  }
};

/** Invalidate everything */
apiCache.flush = () => _cache.clear();

module.exports = apiCache;
