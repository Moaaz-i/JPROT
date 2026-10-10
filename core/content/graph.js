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
import { stat } from 'node:fs/promises'
import { basename, extname, join, normalize, sep } from 'node:path'
import { isInside } from '../../lib/utils.js'
import { state } from '../foundation/state.js'
import { readParsed, evictStaleCache, walkMarkdown, signatureOf } from './scan.js'
import { dateKey, stripMarkdown, canonPath, extractLinks, extractHeadings, resolveInternalTarget, navUrlOf, dirUrlOf, excerptOf, tagsOf } from './extract.js'
export { readParsed, evictStaleCache, walkMarkdown, listMarkdown } from './scan.js'
export { dateKey, stripMarkdown, slugify, canonPath, decodeHref, isExternalTarget, extractLinks, extractHeadings, resolveInternalTarget } from './extract.js'

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
      // `body` is what the client search snippet is built from; `raw` is the
      // untouched Markdown source, used only when `body` does not contain the
      // query. Both are required, so the index does hold two copies of every
      // content file — that is the memory cost of an offline, zero-dependency
      // search, and it is paid once per visible page, not per request.
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
  // Reclaim per-file parse entries before building, so a project that has had
  // many files deleted does not keep their parsed bodies in memory.
  await evictStaleCache()
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

/* ---------------- instance views (formerly core/content.js) ---------------- */

// Directories the site treats as collections. Both are configurable, so they
// are read from the current instance's state rather than hard-coded. `root`
// wins over the state's contentDir so an explicit argument always decides.
function graphOptions(root) {
  const { site = {}, contentDir: stateContentDir } = state()
  const contentDir = root || stateContentDir
  return {
    contentDir,
    blogDir: join(contentDir, site.blogDir || 'blog'),
    projectsDir: join(contentDir, site.projectsDir || 'projects'),
    docs: site.docs === true,
  }
}

// The graph for the current instance's content, reusing the previous build
// while the tree is unchanged.
export async function contentGraph() {
  return getContentGraph(graphOptions())
}

// Post/project entries keep the historical shape (`url` is content-relative,
// e.g. `blog/hello`) because themes build links as `/${p.url}`.
function legacyItem(entry) {
  return {
    data: entry.data,
    body: entry.body,
    src: entry.src,
    slug: entry.slug,
    url: entry.url.replace(/^\//, ''),
    excerpt: entry.data.excerpt
      || String(entry.body || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' '),
  }
}

// Graph → legacy view, for callers that already hold a graph.
export const postItems = (graph) => graph.posts.map(legacyItem)
export const projectItems = (graph) => graph.projects.map(legacyItem)

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
