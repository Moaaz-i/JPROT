import { readFile, readdir, stat } from 'node:fs/promises'
import { join, extname, basename, normalize } from 'node:path'
import { parseFrontmatter } from '../lib/frontmatter.js'
import { isInside } from './utils.js'
import { state } from './state.js'

const parsedCache = new Map()

// Reuse parsed content while its mtime/size is unchanged. This keeps search,
// navigation, feeds and page rendering cheap without making edits stale.
export async function readParsed(file) {
  const info = await stat(file)
  const cached = parsedCache.get(file)
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.value
  const raw = await readFile(file, 'utf8')
  const value = parseFrontmatter(raw)
  parsedCache.set(file, { mtimeMs: info.mtimeMs, size: info.size, value })
  return value
}

// Recursively collect every .md file under `dir`, skipping dotfiles.
export async function listMarkdown(dir) {
  const out = []
  let entries
  try { entries = await readdir(dir) } catch { return out }
  const dirs = []
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const full = join(dir, entry)
    let st
    try { st = await stat(full) } catch { continue }
    if (st.isDirectory()) {
      dirs.push(full)
    } else if (extname(entry) === '.md') {
      out.push(full)
    }
  }
  for (const d of dirs) out.push(...(await listMarkdown(d)))
  return out
}

// Project entries from content/projects (or a custom projectsDir).
export async function listProjects(contentDir, projectsDir) {
  const { site } = state()
  const dir = projectsDir || join(contentDir, site.projectsDir || 'projects')
  const out = []
  for (const f of await listMarkdown(dir)) {
    if (basename(f, '.md') === 'index') continue
    const { data, body } = await readParsed(f)
    if (data.draft) continue
    const rel = f.slice(contentDir.length + 1).replace(/\.md$/, '')
    out.push({
      data,
      body,
      src: f,
      slug: basename(f, '.md'),
      url: rel,
    })
  }
  out.sort((a, b) => (a.data.order ?? Infinity) - (b.data.order ?? Infinity))
  return out
}

// Blog posts from content/blog (or a custom blogDir), newest first.
export async function listPosts(contentDir, blogDir) {
  const { site } = state()
  const dir = blogDir || join(contentDir, site.blogDir || 'blog')
  const out = []
  for (const f of await listMarkdown(dir)) {
    if (basename(f, '.md') === 'index') continue
    const { data, body } = await readParsed(f)
    if (data.draft) continue
    const rel = f.slice(contentDir.length + 1).replace(/\.md$/, '')
    out.push({
      data,
      body,
      src: f,
      slug: basename(f, '.md'),
      url: rel,
      excerpt: data.excerpt || body.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' '),
    })
  }
  out.sort((a, b) => (b.data.date || '').localeCompare(a.data.date || ''))
  return out
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

// Full-site index used by the search endpoint and sitemap.
export async function indexAll(contentDir) {
  const out = []
  for (const f of await listMarkdown(contentDir)) {
    if (basename(f, '.md') === 'index' || basename(f, '.md') === '404') continue
    const { data, body } = await readParsed(f)
    if (data.hidden || data.draft) continue
    const rel = f.slice(contentDir.length + 1).replace(/\.md$/, '')
    const slug = basename(f, '.md')
    const title = data.title || slug
    const excerpt = (data.excerpt || data.description || body.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' '))
      .replace(/[`*_~#>|]/g, '')
      .slice(0, 140)
    out.push({
      title,
      url: '/' + rel,
      excerpt,
      tags: data.tags || [],
      date: data.date || '',
      image: data.image || '',
      body: stripMarkdown(body),
      raw: String(body || '').trim(),
      frontmatter: stripMarkdown(JSON.stringify(data)),
    })
  }
  return out
}

// Builds the main navigation from top-level content pages.
export async function buildNavigation(contentDir) {
  const nav = []
  for (const f of await listMarkdown(contentDir)) {
    const { data } = await readParsed(f)
    if (data.hidden || data.draft) continue
    const rel = f.slice(contentDir.length + 1)
    const slug = basename(f, '.md')
    if (slug === 'index' || slug === '404') continue
    // only top-level pages (no subfolder) appear in the main nav,
    // unless a page explicitly declares a nav entry
    const isTopLevel = !rel.includes('/')
    if (!isTopLevel && data.nav === undefined) continue
    const relUrl = rel.replace(/\.md$/, '').replace(/\/index$/, '/')
    nav.push({
      label: data.nav || data.title || slug,
      url: relUrl,
      order: data.order ?? Infinity,
    })
  }
  nav.sort((a, b) => a.order - b.order)
  return nav
}

// Safely resolve a URL pathname to an existing content file, guarding against
// path traversal (../) by normalizing and verifying the result stays inside
// contentDir.
export async function resolveContent(contentDir, pathname) {
  if (pathname === '/') return null
  let clean = normalize(pathname.replace(/^\/+|\/+$/g, ''))
  if (!clean || clean === '.') return null
  const full = join(contentDir, clean)
  const candidates = []
  if (extname(full) === '.md') {
    candidates.push(full)
  } else {
    candidates.push(full + '.md')
    candidates.push(join(full, 'index.md'))
    candidates.push(join(full, 'README.md'))
  }
  for (const p of candidates) {
    if (!isInside(contentDir, p)) continue
    try {
      if ((await stat(p)).isFile()) return p
    } catch { /* not a file */ }
  }
  return null
}
