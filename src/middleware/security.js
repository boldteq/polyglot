'use strict';

// Full production security headers (Q5: Helmet-equivalent suite)
function security(req, res, next) {
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Block EXTERNAL framing (clickjacking) but allow same-origin iframes — the
  // Design Library renders component previews in same-origin sandboxed iframes.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Minimal referrer leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Disable XSS auditor (deprecated but harmless)
  res.setHeader('X-XSS-Protection', '0');
  // Remove server fingerprint
  res.removeHeader('X-Powered-By');
  // Permissions policy — restrict browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // CSP — localhost app so no need for nonces; block external resources
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed for Vite dev HMR
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' ws://localhost:* wss://localhost:* https://fonts.googleapis.com https://fonts.gstatic.com", // SSE + Vite WS + Google Fonts (style/font-src already allow them; the stylesheet fetch is classified under connect-src)
      "frame-src 'self'", // same-origin iframes only (Design Library component previews)
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  // HSTS — since we're localhost-only, set short max-age; no force HTTPS
  if (req.secure || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

module.exports = security;
