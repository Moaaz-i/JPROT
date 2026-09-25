// Public content API. The work itself lives in core/graph.js — this module is
// the stable surface the HTTP layer, the CLI and userland import, and every
// function here is now a thin view over a single `Content Graph` build instead
// of its own walk of the content tree.
import { stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { isInside } from './utils.js'
import { state } from './state.js'
import {
  evictStaleCache,
  getContentGraph,
  invalidateContentGraph,
  listMarkdown,
  loadContentGraph,
  readParsed,
  stripMarkdown,
} from './graph.js'

export { evictStaleCache, listMarkdown, loadContentGraph, readParsed, stripMarkdown }
export { invalidateContentGraph } from './graph.js'

// Directories the site treats as collections. Both are configurable, so they are
// read from the request/instance state rather than hard-coded. `root` wins over
// the state's contentDir so an explicit argument always decides.
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

// The graph for the current instance's content, reusing the previous build while
// the tree is unchanged.
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

export async function listPosts(contentDir, blogDir) {
  const opts = graphOptions(contentDir)
  const graph = await getContentGraph({ ...opts, blogDir: blogDir || opts.blogDir })
  return postItems(graph)
}

export async function listProjects(contentDir, projectsDir) {
  const opts = graphOptions(contentDir)
  const graph = await getContentGraph({ ...opts, projectsDir: projectsDir || opts.projectsDir })
  return projectItems(graph)
}

// Full-site index used by the search endpoint, sitemap and llms.txt.
export async function indexAll(contentDir) {
  return (await getContentGraph(graphOptions(contentDir))).searchIndex
}

export async function buildNavigation(contentDir) {
  return (await getContentGraph(graphOptions(contentDir))).navigation
}

export async function buildDocsNav(contentDir, excludeDirs = []) {
  const opts = graphOptions(contentDir)
  const graph = await getContentGraph({ ...opts, docs: opts.docs || excludeDirs.length > 0 })
  // Callers may pass explicit directories to exclude (the server passes the
  // configured blog/projects folders, but an API user can pass anything).
  if (!excludeDirs.length) return graph.docsNavigation
  const excluded = new Set(excludeDirs)
  return graph.docsNavigation.filter((n) => {
    const file = graph.byUrl.get('/' + n.url)?.src
    return !file || !excluded.has(file.replace(/\/[^/]+$/, ''))
  })
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
