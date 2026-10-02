import { resolve } from 'node:path'
import { realpathSync } from 'node:fs'

// HTML-escape a value for safe interpolation into markup.
export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Reject `javascript:`/`vbscript:`/`data:` and control characters in a URL,
// returning an inert `#` instead. Every `href`/`src` that can come from
// frontmatter or a shortcode attribute must go through this — `esc()` alone
// stops the quote breakout but still lets the scheme through.
//
// Shared by the renderer's `safeUrl` (lib/markdown/sanitize.js) and the theme
// components, so there is exactly one definition of "safe link" in the project.
export function safeHref(value, { image = false } = {}) {
  const url = String(value || '').trim()
  if (!url || /[\u0000-\u001f\u007f]/.test(url)) return '#'
  if (/^(?:javascript|vbscript):/i.test(url)) return '#'
  if (/^data:/i.test(url) && !(image && /^data:image\//i.test(url))) return '#'
  return url
}

// Validate a brand color before it is interpolated into CSS or an SVG
// attribute. Escaping alone is not enough there: `}` still ends a declaration
// and `/*` still opens a comment, so a hostile value can rewrite the rest of a
// <style> block. Only a plain hex/rgb()/hsl() value, or a `var(--…)` reference,
// is allowed through; anything else is rejected and the caller's default wins.
export function safeColor(value) {
  const v = String(value ?? '').trim()
  if (!v) return ''
  if (/^var\(\s*--[A-Za-z0-9_-]+\s*(,[^()]*)?\)$/.test(v)) return v
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v
  if (/^(?:rgb|hsl)a?\(\s*[0-9A-Za-z.,%\s/]+\)$/i.test(v)) return v
  return ''
}

// True when `target` resolves to, or lives under, `parent`. Symlinks are
// followed so a symlink planted inside a served directory cannot point at a
// file outside it (lexical checks alone would be bypassed).
export function isInside(parent, target) {
  let rp
  try { rp = realpathSync(parent) } catch { rp = resolve(parent) }
  let rt
  try { rt = realpathSync(target) } catch { rt = resolve(target) }
  return rt === rp || rt.startsWith(rp + '/') || rt.startsWith(rp + '\\')
}

// Levenshtein distance, used for the "did you mean …?" hints in the config
// checker, the section-name checker and `jprot add`'s catalog search.
export function editDistance(a, b) {
  if (!a.length) return b.length
  if (!b.length) return a.length
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
    }
  }
  return rows[a.length][b.length]
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
