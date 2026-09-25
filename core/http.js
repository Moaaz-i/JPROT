import { createHash, randomBytes } from 'node:crypto'

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

// Framing policy: empty by default, so embedding is fully blocked
// (X-Frame-Options: DENY + frame-ancestors 'none'). Switch to a list of
// CSP source expressions (e.g. ['*']) via setFramePolicy() when the site
// should be embeddable — currently only the dev-server `--allow-embed`
// opt-in used by editor live previews turns this on.
let frameAncestors = []

export function setFramePolicy(sources = []) {
  frameAncestors = sources.filter(Boolean)
}

export function newNonce() {
  return randomBytes(16).toString('base64')
}

export const CSP = (nonce, extraOrigins = []) => {
  const allowed = ["'self'", ...extraOrigins.filter(Boolean)].join(' ')
  const framers = frameAncestors.length ? frameAncestors.join(' ') : "'none'"
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}'; ` +
    `style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; ` +
    `font-src 'self' data:; connect-src ${allowed}; frame-ancestors ${framers}; ` +
    `base-uri 'self'; form-action ${allowed}`
}

export function sendWithSecurity(res, status, contentType, body, nonce = '', opts = {}) {
  const headers = { ...SECURITY_HEADERS, 'Cache-Control': opts.cache || 'no-cache' }
  if (frameAncestors.length) delete headers['X-Frame-Options']
  if (opts.etag) headers.ETag = opts.etag
  if (opts.extraConnectSrc && opts.extraConnectSrc.length) headers['Content-Security-Policy'] = CSP(nonce, opts.extraConnectSrc)
  else if (nonce) headers['Content-Security-Policy'] = CSP(nonce)
  res.writeHead(status, { 'Content-Type': contentType, ...headers })
  res.end(body)
}

export function etagOf(body) {
  return `"${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`
}

export function badRequest(res, message = 'Bad request') {
  sendWithSecurity(res, 400, 'text/plain; charset=utf-8', message)
}

export function methodNotAllowed(res, message = 'Method not allowed') {
  sendWithSecurity(res, 405, 'text/plain; charset=utf-8', message)
}
