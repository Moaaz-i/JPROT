// Link handling for the Markdown renderer: URL canonicalization, inline links,
// images and reference-style links.
import { escapeHtml, safeUrl } from './sanitize.js'

// Convert internal `*.md` links to clean browser URLs (`page.md` → `page`,
// `dir/index.md` → `dir/`). Markdown sources keep `.md` links so they remain
// readable on GitHub, while every rendered surface (live server, static
// export) gets extension‑free links that resolve without a redirect.
export function canonicalLink(value) {
  const url = String(value || '').trim()
  if (!url || url.startsWith('#')) return url
  if (url.includes('://') || /^(?:mailto:|tel:|data:|news:|javascript:|vbscript:)/i.test(url)) return url
  const idx = url.search(/[?#]/)
  const path = idx === -1 ? url : url.slice(0, idx)
  const suffix = idx === -1 ? '' : url.slice(idx)
  if (!/\.md$/i.test(path)) return url
  const withoutMd = path.slice(0, -3)
  if (/^(?:\.\/)?index$/i.test(withoutMd)) return './' + suffix
  if (/\/index$/i.test(withoutMd)) return withoutMd.slice(0, -6) + '/' + suffix
  return withoutMd + suffix
}

export function renderLink(text, url, title) {
  const t = title ? ` title="${escapeHtml(title)}"` : ''
  return `<a href="${escapeHtml(safeUrl(canonicalLink(url)))}"${t}>${escapeHtml(text)}</a>`
}

export function renderImage(alt, src, title) {
  const t = title ? ` title="${escapeHtml(title)}"` : ''
  return `<img src="${escapeHtml(safeUrl(src, { image: true }))}" alt="${escapeHtml(alt)}"${t}>`
}

// Reference-style links: `[text][id]`, collapsed `[text][]` and the shortcut
// `[text]`. Each resolves against the document's `[id]: url` definitions;
// unknown references stay literal (CommonMark behaviour).
export function referenceLink(label, id, linkDefs) {
  const url = linkDefs[id.toLowerCase()]
  return url ? renderLink(label, url) : null
}
