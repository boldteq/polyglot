'use strict';

function localOnly(req, res, next) {
  // Webhook triggers are accessible externally (validated by secret)
  if (req.path.startsWith('/api/webhooks/trigger/')) return next();
  const ip = req.ip || req.connection?.remoteAddress || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
  if (!isLocal) {
    return res.status(403).json({ error: 'Polyglot is local-only' });
  }
  next();
}

module.exports = localOnly;
