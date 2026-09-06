import { createHash, randomBytes } from 'node:crypto'

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

export function newNonce() {
  return randomBytes(16).toString('base64')
}

export const CSP = (nonce) =>
  `default-src 'self'; script-src 'self' 'nonce-${nonce}'; ` +
  `style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; ` +
  `font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; ` +
  `base-uri 'self'; form-action 'self'`

export function sendWithSecurity(res, status, contentType, body, nonce = '', opts = {}) {
  const headers = { ...SECURITY_HEADERS, 'Cache-Control': opts.cache || 'no-cache' }
  if (opts.etag) headers.ETag = opts.etag
  if (nonce) headers['Content-Security-Policy'] = CSP(nonce)
  res.writeHead(status, { 'Content-Type': contentType, ...headers })
  res.end(body)
}

export function etagOf(body) {
  return `"${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`
}

export function badRequest(res, message = 'Bad request') {
  sendWithSecurity(res, 400, 'text/plain; charset=utf-8', message)
}
