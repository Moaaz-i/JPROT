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
  const raw = String(url ?? '')
  // `[a]()` has an *explicitly empty* destination, which is not the same as a
  // destination that was rejected. `safeUrl` answers `#` for empty, and a link
  // that sends the reader to the top of the page is worse than the literal text
  // it replaced — but CommonMark says the href is simply empty here, so the
  // reader and the author both get what the source said.
  if (!raw.trim()) {
    const t = title ? ` title="${escapeHtml(title)}"` : ''
    return `<a href=""${t}>${escapeHtml(text)}</a>`
  }
  const safe = safeUrl(canonicalLink(raw))
  // A rejected URL (`javascript:`, `vbscript:`, a non-image `data:`) returns the
  // inert `#`. Emitting a link to it is worse than emitting no link: the reader
  // sees underlined link text that goes nowhere but the top of the page, and the
  // markup around the URL is already gone — `[x](javascript:alert(1))` became
  // `<a href="#">x</a>)`, a dead link plus a stray paren the reader can see.
  // Leaving the construct as literal text is what the reference-link rules
  // already do for an unknown id, so this makes the two paths agree.
  if (safe === '#') return null
  const t = title ? ` title="${escapeHtml(title)}"` : ''
  return `<a href="${escapeHtml(safe)}"${t}>${escapeHtml(text)}</a>`
}

export function renderImage(alt, src, title) {
  const t = title ? ` title="${escapeHtml(title)}"` : ''
  // Same distinction as `renderLink`: `![]()` writes an empty src on purpose,
  // where an unsafe src is refused. `safeUrl` turns both into `#`, which for an
  // image means a broken-image glyph pointing at the top of the page.
  const raw = String(src ?? '').trim()
  const value = raw === '' ? '' : escapeHtml(safeUrl(raw, { image: true }))
  return `<img src="${value}" alt="${escapeHtml(alt)}"${t}>`
}

// Reference-style links: `[text][id]`, collapsed `[text][]` and the shortcut
// `[text]`. Each resolves against the document's `[id]: url` definitions;
// unknown references stay literal (CommonMark behaviour).
//
// The definition carries its optional title through, so
// `[id]: /url "Title"` produces the same anchor as `[text](/url "Title")` would.
// The title used to be parsed off the definition line and then thrown away, which
// lost something the author had written down — and lost it *silently*, because
// the line was consumed as a definition either way.
export function referenceLink(label, id, linkDefs) {
  const def = linkDefs[id.toLowerCase()]
  if (!def) return null
  const { url, title } = typeof def === 'string' ? { url: def, title: '' } : def
  return renderLink(label, url, title) || null
}
