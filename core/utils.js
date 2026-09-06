import { resolve, extname, join, basename } from 'node:path'

// HTML-escape a value for safe interpolation into markup.
export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// True when `target` resolves to, or lives under, `parent`.
export function isInside(parent, target) {
  const rp = resolve(parent)
  const rt = resolve(target)
  return rt === rp || rt.startsWith(rp + '/') || rt.startsWith(rp + '\\')
}

// ASCII/Arabic-aware slug for URLs from arbitrary strings.
export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Common MIME types for the static file server.
export const MIME = {
  '.html': 'text/html', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.txt': 'text/plain',
  '.md': 'text/plain', '.pdf': 'application/pdf', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4',
}

// Send a fully-formed HTTP response.
export function sendRes(res, status, contentType, body) {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' })
  res.end(body)
}
