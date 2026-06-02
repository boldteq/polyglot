'use strict';

// Wrap async route handlers so unhandled rejections route to Express
// global error handler instead of hanging the response. Attaches category
// + route on the error so the global handler can log structured fields.
//
// Usage:
//   const ah = require('../lib/asyncHandler');
//   router.get('/x', ah(async (req, res) => { ... }));
//
// Optional second arg overrides the category default ('http'):
//   ah(async (req, res) => { ... }, { category: 'integration' })

function asyncHandler(fn, opts = {}) {
  const category = opts.category || 'http';
  return function wrapped(req, res, next) {
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch((err) => {
        try {
          if (err && typeof err === 'object') {
            if (!err._category) err._category = category;
            if (!err._route)    err._route    = req.route?.path || req.url;
          }
        } catch { /* noop */ }
        next(err);
      });
  };
}

module.exports = asyncHandler;
module.exports.ah = asyncHandler;
