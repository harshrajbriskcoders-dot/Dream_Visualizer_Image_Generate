import crypto from 'node:crypto';

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

// Handles CORS. Returns true when the request has been fully answered (preflight or blocked).
// publicRead: the endpoint only returns public data, so any site may read it (cache-friendly).
export function applyCors(req, res, { publicRead = false } = {}) {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (publicRead) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    const list = allowedOrigins();
    const allowed = list.length === 0 || list.includes('*') || (origin && list.includes(origin));
    res.setHeader('Vary', 'Origin');
    if (origin && allowed) res.setHeader('Access-Control-Allow-Origin', origin);
    if (origin && !allowed) {
      res.status(403).json({ error: 'This site is not allowed to use the visualizer.' });
      return true;
    }
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

// Store a salted hash instead of the raw IP address.
export function hashIp(ip) {
  const salt = process.env.IP_HASH_SALT || 'dream-visualizer';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

export function intFromEnv(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
