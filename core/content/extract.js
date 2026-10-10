// Facts a single file yields: its links, headings, slug, date, excerpt.
//
// Pure string and URL work — no filesystem, no cache, no graph. Each helper
// takes the parsed entry it needs and answers one question, which is why
// they are readable (and testable) in isolation.

import { join } from 'node:path'

export function dateKey(value) {
  if (typeof value !== 'string') return String(value ?? '')
  const m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}`
  return value
}

// Reduce Markdown to plain, searchable text. Nothing is discarded wholesale:
// fenced code blocks keep their inner text (only the fence markers go), inline
// code, link texts, image alts and surrounding text survive; HTML tags and
// markdown decoration collapse to spaces. The original source stays available
// as `raw` on each index entry so even fence markers, URLs and attribute
// values remain searchable.
export function stripMarkdown(src) {
  return String(src || '')
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ASCII/Arabic-aware slug, shared with lib/utils.js so page headings and
// Markdown heading ids behave identically.
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/* ---------------- link extraction ---------------- */

// Canonical page URL: trailing slashes off, `.md` off and `/index` folded into
// its directory (so /index.md → /, /blog/index → /blog).
export function canonPath(p) {
  let s = String(p || '').replace(/[?#].*$/, '').replace(/\/+$/, '')
  s = s.replace(/\.md$/, '')
  if (s.endsWith('/index')) s = s.slice(0, -6) || '/'
  return s || '/'
}

export function decodeHref(s) {
  try { return decodeURIComponent(String(s || '')) } catch { return String(s || '') }
}

// True for a link that never points at a JPROT page.
export function isExternalTarget(target) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(String(target || ''))
}

// Every internal Markdown link target in a document, query/hash stripped.
// `kind` distinguishes prose links from image sources so the linter can apply
// the right rules without re-scanning the body.
export function extractLinks(body) {
  const out = []
  const src = String(body || '')
  for (const m of src.matchAll(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    const target = m[3].split('#')[0].split('?')[0].trim()
    if (!target) continue
    out.push({ kind: m[1] ? 'image' : 'link', text: m[2], target })
  }
  return out
}

// Heading ids + text as the renderer would produce them, so `jprot lint` can
// detect duplicate anchors without rendering the document.
//
// `base` is the slug *before* the renderer disambiguates it. Two headings with
// the same `base` is exactly the situation a `#intro` deep link gets wrong: the
// second heading silently becomes `#intro-2` and the link lands on the first.
export function extractHeadings(body) {
  const out = []
  const used = {}
  for (const line of String(body || '').split(/\r?\n/)) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line)
    if (!m) continue
    const base = slugify(m[2])
    let id = base
    if (used[id] === undefined) used[id] = 0
    used[id]++
    if (used[id] > 1) id = `${id}-${used[id]}`
    out.push({ level: m[1].length, text: m[2], id, base })
  }
  return out
}

// Resolve a link target written inside `entry` to the page URL it points at, or
// null when the target is external / not a page (an asset, a mailto, …).
// Mirrors the browser exactly: the base is the URL the server actually serves
// (`/docs/intro`, never `/docs/intro/`), so a relative `next.md` or `../x.md`
// resolves the same way here as it does on the live site.
export function resolveInternalTarget(entry, target) {
  const raw = decodeHref(target)
  if (!raw || isExternalTarget(raw)) return null
  if (raw === '/') return '/'
  if (raw.startsWith('/')) return canonPath(raw)
  if (/^[.?/]/.test(raw)) {
    // `./x` and `../x` are resolved against the current URL, exactly as a
    // browser would — including the fact that `/docs/intro` has no trailing
    // slash, so `../x` lands in `/x` rather than `/docs/x`.
    return canonPath(new URL(raw, `http://jprot.local${entry.url}`).pathname)
  }
  return canonPath(new URL(raw, `http://jprot.local${entry.url}`).pathname)
}

/* ---------------- graph construction ---------------- */

// URL form used by the main navbar: no leading slash, nested `index` pages keep
// their trailing slash (`guide/index.md` → `guide/`).
export function navUrlOf(rel, slug) {
  return rel.replace(/\.md$/, '').replace(/\/index$/, '/')
}

// `/guide/index.md` → `/guide`
export function dirUrlOf(rel, slug) {
  if (slug !== 'index') return canonPath('/' + rel)
  const dir = rel.replace(/\/index\.md$/, '')
  return dir.includes('/') ? '/' + dir : '/'
}

export function excerptOf(data, body) {
  return (data.excerpt
    || data.description
    || String(body || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' '))
    .replace(/[`*_~#>|]/g, '')
    .slice(0, 140)
}

export function tagsOf(value) {
  if (Array.isArray(value)) return value.map((t) => String(t))
  return value ? [String(value)] : []
}

/**
 * Build the graph for a content tree.
 *
 * @param {object} options
 * @param {string} options.contentDir    absolute path to `content/`
 * @param {string} [options.blogDir]      absolute path to the blog directory
 * @param {string} [options.projectsDir]  absolute path to the projects directory
 * @param {boolean}[options.docs]        build the docs reading order
 * @param {Array}   [options.files]      pre-walked file list (skips a second walk)
 * @returns {Promise<object>} the graph
 */
