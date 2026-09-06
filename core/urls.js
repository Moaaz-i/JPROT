// Normalize request paths without allowing encoded separators or NUL bytes.
export function decodeRequestPath(pathname) {
  if (typeof pathname !== 'string' || pathname.includes('\0') || pathname.includes('\\')) {
    throw new URIError('invalid request path')
  }
  const decoded = decodeURIComponent(pathname)
  if (decoded.includes('\0') || decoded.includes('\\')) throw new URIError('invalid request path')
  return decoded
}

// Canonical clean URL for a /page.md request path, or null when the path is
// not a .md URL. Index pages canonicalize to their directory (/index.md → /,
// /blog/index.md → /blog/).
export function mdCanonical(pathname) {
  if (typeof pathname !== 'string' || !pathname.endsWith('.md')) return null
  const base = pathname.slice(0, -3)
  if (base.endsWith('/index')) {
    const dir = base.slice(0, -6)
    return dir ? dir + '/' : '/'
  }
  return base || '/'
}

// Resolve a relative content link against the current page path.
export function resolveRelativeUrl(url, pagePath = '/') {
  if (!url || /^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(url)) return url
  const base = pagePath.endsWith('/') ? pagePath : pagePath.replace(/\/[^/]*$/, '/') || '/'
  return new URL(url, `http://jprot.local${base}`).pathname
}

// Resolve a site-relative URL for metadata while preserving approved schemes.
export function absUrl(site, value) {
  if (!value) return ''
  if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(value)) return value
  const base = String(site?.url || '').replace(/\/+$/, '')
  return base ? base + (value.startsWith('/') ? value : '/' + value) : value
}
