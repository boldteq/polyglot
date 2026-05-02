'use strict';

const ALLOWED_ORIGINS = new Set([
  'http://localhost:3847',
  'http://localhost:5173',   // Vite dev
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3847',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
]);

function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Same-origin or non-browser client — no CORS header needed
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

module.exports = cors;
