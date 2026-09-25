// The content graph: one pass over `content/` that produces *every* derived
// structure the site needs. Before this layer existed, `indexAll()`,
// `listPosts()`, `listProjects()`, `buildNavigation()` and `buildDocsNav()`
// each walked the tree and re-parsed the same files, so a single `/sitemap.xml`
// request cost several directory walks and a full search page load cost even
// more.
//
// Everything downstream now reads from here:
//
//   filesystem ──▶ Content Graph ──┬──▶ renderer (page/posts/projects)
//                                  ├──▶ search index  (/@jprot/search.json)
//                                  ├──▶ sitemap.xml / feed.xml / llms.txt
//                                  ├──▶ navigation + docs navigation
//                                  ├──▶ export (page list)
//                                  └──▶ lint (orphan pages, broken links)
//
// The graph re-parses a file only when its mtime/size changed, and rebuilds the
// derived structures only when the file set itself changed — so repeated
// requests are nearly free while edits still show up immediately.
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, extname, join, sep } from 'node:path'
import { parseFrontmatter } from '../lib/frontmatter.js'

const parsedCache = new Map()

// Reuse parsed content while its mtime/size is unchanged. This keeps search,
// navigation, feeds and page rendering cheap without making edits stale.
export async function readParsed(file) {
  let info
  try { info = await stat(file) } catch {
    parsedCache.delete(file)
    throw new Error(`File not found: ${file}`)
  }
  const cached = parsedCache.get(file)
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.value
  const raw = await readFile(file, 'utf8')
  const value = parseFrontmatter(raw)
  parsedCache.set(file, { mtimeMs: info.mtimeMs, size: info.size, value })
  return value
}

// Evict cache entries for files that no longer exist on disk.
export function evictStaleCache() {
  for (const [file] of parsedCache) {
    try { stat(file) } catch { parsedCache.delete(file) }
  }
}

/* ---------------- file discovery ---------------- */

// Recursively collect every .md file under `dir`, skipping dotfiles. Each entry
// carries the stat data the graph needs to decide whether a re-read is due, so
// discovery never has to stat the same file twice.
async function walk(dir, out, depth = 0) {
  if (depth > 12) return
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
  const dirs = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) { dirs.push(full); continue }
    if (extname(entry.name) !== '.md') continue
    try {
      const st = await stat(full)
      out.push({ file: full, mtimeMs: st.mtimeMs, size: st.size })
    } catch { /* vanished mid-walk */ }
  }
  for (const d of dirs) await walk(d, out, depth + 1)
}

export async function walkMarkdown(dir) {
  const out = []
  await walk(dir, out)
  return out
}

// Absolute paths of every Markdown file under `dir` (the shape the HTTP layer
// and the CLI expect).
export async function listMarkdown(dir) {
  return (await walkMarkdown(dir)).map((f) => f.file)
}

// A stable fingerprint of the content tree: file set + mtime + size. When this
// string is unchanged, the graph can be reused verbatim.
function signatureOf(files) {
  return files.map((f) => `${f.file}:${f.mtimeMs}:${f.size}`).join('|')
}

/* ---------------- text helpers ---------------- */

// Normalize a `YYYY-M-D` / `YYYY-MM-DD` frontmatter date into a zero-padded
// sortable key so non-padded dates (2026-1-5) don't misorder vs padded ones.
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

// ASCII/Arabic-aware slug, shared with core/utils.js so page headings and
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
function navUrlOf(rel, slug) {
  return rel.replace(/\.md$/, '').replace(/\/index$/, '/')
}

// `/guide/index.md` → `/guide`
function dirUrlOf(rel, slug) {
  if (slug !== 'index') return canonPath('/' + rel)
  const dir = rel.replace(/\/index\.md$/, '')
  return dir.includes('/') ? '/' + dir : '/'
}

function excerptOf(data, body) {
  return (data.excerpt
    || data.description
    || String(body || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' '))
    .replace(/[`*_~#>|]/g, '')
    .slice(0, 140)
}

function tagsOf(value) {
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
export async function loadContentGraph({ contentDir, blogDir, projectsDir, docs = false, files } = {}) {
  const root = contentDir
  const list = files || (await walkMarkdown(root))
  const blogRoot = blogDir || join(root, 'blog')
  const projectsRoot = projectsDir || join(root, 'projects')

  // --- nodes: one per file, parsed once -------------------------------
  const entries = []
  for (const { file, mtimeMs, size } of list) {
    let parsed
    try { parsed = await readParsed(file) } catch { continue }
    const { data, body } = parsed
    const rel = file.slice(root.length + 1)
    const slug = basename(rel, '.md')
    const dirUrl = dirUrlOf(rel, slug)
    const isHome = rel === 'index.md'
    const isNotFound = slug === '404'
    const inBlog = file.startsWith(blogRoot + sep)
    const inProjects = file.startsWith(projectsRoot + sep)
    const kind = isHome
      ? 'home'
      : isNotFound
        ? 'notfound'
        : inBlog && slug !== 'index'
          ? 'post'
          : inProjects && slug !== 'index'
            ? 'project'
            : 'page'
    const url = isHome ? '/' : isNotFound ? '/404' : canonPath('/' + rel)
    const entry = {
      rel,
      src: file,
      slug,
      url,
      dirUrl,
      navUrl: navUrlOf(rel, slug),
      docsUrl: slug === 'index' ? (dirUrl === '/' ? '' : dirUrl.slice(1) + '/') : rel.replace(/\.md$/, ''),
      kind,
      data,
      body,
      mtimeMs,
      size,
      hidden: data.hidden === true,
      draft: data.draft === true,
      order: data.order ?? Infinity,
      title: data.title || data.nav || slug,
      excerpt: excerptOf(data, body),
    }
    // Pre-computed link/heading facts so lint and the reachability graph never
    // rescan the raw body.
    entry.links = extractLinks(body).map(({ kind, text, target }) => ({ kind, text, target }))
    entry.headings = extractHeadings(body)
    entries.push(entry)
  }

  const byUrl = new Map()
  for (const e of entries) {
    // index.md wins over README.md for the same directory URL
    if (!byUrl.has(e.url) || e.kind === 'home') byUrl.set(e.url, e)
  }
  const byRel = new Map(entries.map((e) => [e.rel, e]))
  const visible = entries.filter((e) => !e.hidden && !e.draft)
  const isVisible = (e) => e && !e.hidden && !e.draft

  // --- pages / posts / projects ----------------------------------------
  const pages = visible.filter((e) => e.kind === 'page' || e.kind === 'home')
  const posts = visible
    .filter((e) => e.kind === 'post')
    .sort((a, b) => {
      const ka = dateKey(a.data.date)
      const kb = dateKey(b.data.date)
      return (kb || '') < (ka || '') ? -1 : (kb || '') > (ka || '') ? 1 : 0
    })
  const projects = visible
    .filter((e) => e.kind === 'project')
    .sort((a, b) => (a.data.order ?? Infinity) - (b.data.order ?? Infinity))

  // --- routes ----------------------------------------------------------
  // Every URL the site answers on, in lookup form. `byUrl` is the hot path for
  // the router; the array is what the exporter walks.
  const routes = [...visible]
    .filter((e) => e.kind !== 'notfound')
    .map((e) => ({ url: e.url, file: e.src, kind: e.kind, entry: e }))

  // --- navigation ------------------------------------------------------
  // Compact navbar: top-level pages only, unless a page opts in with `nav:`.
  const navigation = visible
    .filter((e) => e.kind !== 'notfound' && e.slug !== 'index')
    .filter((e) => !e.rel.includes('/') || e.data.nav !== undefined)
    .map((e) => ({ label: e.data.nav || e.data.title || e.slug, url: e.navUrl, order: e.order, rel: e.rel }))
    .sort((a, b) => a.order - b.order)

  // Docs-mode reading order for the sidebar and prev/next: every content page
  // including nested ones, sorted by frontmatter `order`, with blog/project
  // listings excluded so they don't clutter the docs sidebar.
  const docsNavigation = docs
    ? visible
        .filter((e) => e.rel !== 'index.md' && e.kind !== 'notfound')
        .filter((e) => !e.src.startsWith(blogRoot + sep) && !e.src.startsWith(projectsRoot + sep))
        .map((e) => ({
          label: e.data.nav || e.data.title || (e.slug === 'index' ? basename(e.dirUrl) : e.slug),
          url: e.docsUrl,
          order: e.order,
          rel: e.rel,
        }))
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    : []

  // --- search / sitemap index -----------------------------------------
  // Only the site homepage and the 404 page are excluded, not nested index
  // pages, so a browsable docs directory still appears in search/sitemap.
  const searchIndex = entries
    .filter((e) => isVisible(e) && e.rel !== '404.md')
    .filter((e) => e.url !== '/')
    .map((e) => ({
      title: e.data.title || e.slug,
      url: e.url,
      excerpt: e.excerpt,
      // Scalar frontmatter like `tags: guide` must not crash the client search
      // (it calls .map on the value), so normalize to an array.
      tags: tagsOf(e.data.tags),
      date: e.data.date || '',
      image: e.data.image || '',
      body: stripMarkdown(e.body),
      raw: String(e.body || '').trim(),
      frontmatter: stripMarkdown(JSON.stringify(e.data)),
    }))

  // --- reachability ----------------------------------------------------
  // Internal edges between pages. This is what makes "orphan page" detection
  // possible: a page nothing links to *and* that no nav lists is unreachable.
  const outgoing = new Map()
  const backlinks = new Map()
  const link = (from, to) => {
    if (!outgoing.has(from)) outgoing.set(from, new Set())
    outgoing.get(from).add(to)
    if (!backlinks.has(to)) backlinks.set(to, new Set())
    backlinks.get(to).add(from)
  }
  for (const e of visible) {
    for (const { kind, target } of e.links) {
      if (kind === 'image') continue
      const resolved = resolveInternalTarget(e, target)
      if (!resolved) continue
      link(e.url, resolved)
    }
  }

  const navUrls = new Set([...navigation, ...docsNavigation].map((n) => canonPath('/' + n.url)))

  return {
    contentDir: root,
    blogDir: blogRoot,
    projectsDir: projectsRoot,
    entries,
    byUrl,
    byRel,
    pages,
    posts,
    projects,
    routes,
    navigation,
    docsNavigation,
    searchIndex,
    outgoing,
    backlinks,
    // Pages that no other page links to and no nav lists.
    //
    // `scope` (an optional Set of entries) narrows both sides of the question:
    // a page is only an orphan if it is in scope, and only links coming *from*
    // in-scope pages count as reachability. The linter passes its
    // ignore-filtered entry set so an excluded draft can neither be reported as
    // an orphan nor vouch for a page that only it links to.
    orphans(scope) {
      const inScope = (e) => !scope || scope.has(e)
      const linked = (e) => {
        const from = backlinks.get(e.url)
        if (!from || !from.size) return false
        if (!scope) return true
        for (const url of from) if (scope.has(byUrl.get(url))) return true
        return false
      }
      return pages.filter((e) => e.kind !== 'home' && inScope(e) && !navUrls.has(e.url) && !linked(e))
    },
    // The content file a URL maps to, or null.
    lookup(url) {
      return byUrl.get(canonPath(url)) || null
    },
    entryFor(file) {
      return byRel.get(file.slice(root.length + 1)) || null
    },
  }
}

/* ---------------- shared, self-validating cache ---------------- */

// Derived graphs keyed by the inputs that actually change their output. Two
// JPROT instances over the same folders (dev server + a lint run) share the
// work instead of walking the tree twice.
const graphCache = new Map()

function graphKey({ contentDir, blogDir, projectsDir, docs }) {
  return [contentDir, blogDir, projectsDir, docs ? '1' : '0'].join('|')
}

// Returns the graph for these options, rebuilding it only when the content tree
// (file set, mtimes, sizes) has changed since the last build.
export async function getContentGraph(options = {}) {
  const key = graphKey(options)
  const files = await walkMarkdown(options.contentDir)
  const signature = signatureOf(files)
  const cached = graphCache.get(key)
  if (cached && cached.signature === signature) return cached.graph
  const graph = await loadContentGraph({ ...options, files })
  graphCache.set(key, { signature, graph })
  return graph
}

// Force the next access to rebuild (used when config, components or plugins
// change rather than content).
export function invalidateContentGraph(options) {
  if (!options) { graphCache.clear(); return }
  graphCache.delete(graphKey(options))
}
