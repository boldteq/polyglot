'use strict';

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMITS = {
  heavy: 10,   // AI chat, orchestration runs, playground — 10/min
  write: 60,   // file writes, creates, deletes — 60/min
  read: 200,   // reads, listings — 200/min
};

function rateLimit(tier) {
  const max = RATE_LIMITS[tier] || RATE_LIMITS.read;
  return (req, res, next) => {
    const key = `${tier}:${req.ip}`;
    const now = Date.now();
    let entry = rateLimitMap.get(key);
    if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
      entry = { start: now, count: 0 };
      rateLimitMap.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      return res.status(429).json({ error: `Rate limit exceeded (${max}/${RATE_LIMIT_WINDOW / 1000}s)` });
    }
    next();
  };
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.start > RATE_LIMIT_WINDOW * 2) rateLimitMap.delete(key);
  }
}, 300_000);

module.exports = { rateLimit, RATE_LIMITS };
