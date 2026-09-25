// `jprot lint` — a site analyzer, not just a content linter.
//
// Every check reads the same content graph the server renders from, so a page
// that is unreachable in the running site is reported as unreachable here too.
//
//   Content    frontmatter, broken links, image alt text, oversized images,
//              duplicate routes, duplicate heading anchors
//   SEO        missing titles/descriptions, 404 handling
//   Navigation orphan pages, nav entries that point nowhere
//   Components unknown shortcode, missing/invalid component props
//   Assets     referenced-but-missing files, unused files in public/
//
// The exit code is 1 when any *error* is reported; warnings and info do not
// fail the command, so `jprot lint` stays usable as a CI gate.
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { loadComponents, validateProps } from './components.js'
import { loadSiteConfig } from './config.js'
import { canonPath, decodeHref, isExternalTarget, loadContentGraph, resolveInternalTarget } from './graph.js'

const SIZE_LIMIT = 400 * 1024
// Extensions worth reporting as "unused" in public/ — never stray dotfiles or
// engine endpoints (robots.txt, favicon.svg, …).
const ASSET_RE = /\.(?:png|jpe?g|gif|svg|webp|avif|ico|pdf|mp4|webm|zip)$/i

async function isFile(p) {
  try { return (await stat(p)).isFile() } catch { return false }
}

// A minimal glob → RegExp, where `**` spans directories and `*` stays within
// one segment. Used to match `lint.ignore` patterns against repo-relative
// paths such as `blog.md`, `projects/*.md` or `archive/**/*.md`.
function globToRegExp(pattern) {
  const parts = String(pattern || '').split('/')
  let re = '^'
  for (const [i, part] of parts.entries()) {
    if (i) re += '/'
    if (part === '**') re += '.*'
    else re += part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
  }
  return new RegExp(re + '($|\\.md$)')
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 }

// Every public/ file, so the analyzer can report the ones nothing references.
async function listPublicAssets(publicDir) {
  const out = []
  const walk = async (dir, depth = 0) => {
    if (depth > 6) return
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { await walk(full, depth + 1); continue }
      out.push({ rel: relative(publicDir, full).split('\\').join('/'), abs: full })
    }
  }
  await walk(publicDir)
  return out
}

// `:::Name attr="v"` occurrences with their 1-based line numbers, skipping
// fenced code blocks.
function shortcodesIn(body) {
  const out = []
  let inCode = false
  String(body || '').split(/\r?\n/).forEach((line, i) => {
    if (/^\s*```+/.test(line)) { inCode = !inCode; return }
    if (inCode) return
    const m = /^\s*:::\s*([A-Za-z0-9-]+)(.*)$/.exec(line)
    if (!m) return
    const attrs = {}
    for (const a of m[2].matchAll(/([A-Za-z0-9_-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
      let value = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4]
      if (/^-?\d+$/.test(value)) value = Number(value)
      else if (value === 'true') value = true
      else if (value === 'false') value = false
      attrs[a[1]] = value
    }
    out.push({ name: m[1], attrs, line: i + 1 })
  })
  return out
}

/**
 * Analyze a site and return every issue found.
 *
 * @param {object} [options]
 * @param {string} [options.root] project root (defaults to cwd)
 * @returns {Promise<{code: number, issues: Array, counts: object, graph: object, fileCount: number}>}
 */
export async function analyzeSite({ root } = {}) {
  const projectRoot = root || process.cwd()
  const contentDir = join(projectRoot, 'content')
  const publicDir = join(projectRoot, 'public')
  const userThemeDir = join(projectRoot, 'theme')

  const config = await loadSiteConfig(projectRoot)
  const issues = []
  const push = (level, file, type, msg) => issues.push({ level, file, type, msg })

  const ignore = Array.isArray(config.lint?.ignore) ? config.lint.ignore.map(globToRegExp) : []
  const graph = await loadContentGraph({
    contentDir,
    blogDir: join(contentDir, config.blogDir || 'blog'),
    projectsDir: join(contentDir, config.projectsDir || 'projects'),
    docs: config.docs === true,
  })

  // Components are needed to check shortcode names and declared prop schemas.
  // A theme that fails to load must not abort the whole analysis.
  let components = {}
  try {
    components = await loadComponents(userThemeDir, false)
  } catch (e) {
    push('warning', 'theme/', 'components', `could not load components — ${e.message}`)
  }

  const referenced = new Set()
  const publicAssets = await listPublicAssets(publicDir)
  for (const asset of publicAssets) referenced.add('/' + asset.rel)
  // Config-declared assets count as referenced.
  for (const value of [config.logo, config.icon, config.ogImage, config.avatar, config.hero && config.hero.avatar]) {
    if (typeof value === 'string' && value.startsWith('/')) referenced.add(value.split('?')[0])
  }

  // Opt-outs: `lint.ignore` globs, or `lint: false` in a page's frontmatter.
  const ignoredRel = new Set(
    graph.entries
      .filter((e) => ignore.some((re) => re.test(e.rel)) || e.data.lint === false)
      .map((e) => e.rel),
  )
  const entries = graph.entries.filter((e) => !ignoredRel.has(e.rel))
  const live = entries.filter((e) => !e.hidden && !e.draft)
  const liveSet = new Set(live)
  const pageUrlSet = new Set(live.filter((e) => e.kind !== 'notfound').map((e) => e.url))
  const routeOwner = new Map()

  for (const e of entries) {
    const rel = e.rel

    /* ---------------- content ---------------- */
    if (e.kind !== 'home' && !e.data.title) push('warning', rel, 'frontmatter', 'missing `title`')
    if (!e.data.draft && !e.data.description && !e.data.subtitle && !e.data.excerpt) {
      push('warning', rel, 'frontmatter', 'missing `description` / `excerpt`')
    }
    if (e.data.date && typeof e.data.date === 'string' && Number.isNaN(Date.parse(e.data.date))) {
      push('error', rel, 'frontmatter', `invalid \`date\` → ${e.data.date}`)
    }
    if (e.kind === 'notfound') push('info', rel, 'seo', 'custom 404 page — kept out of search and sitemap')

    // Two files answering one URL (`about.md` and `about/index.md`).
    if (e.kind !== 'notfound' && !e.hidden && !e.draft) {
      const owner = routeOwner.get(e.url)
      if (owner && owner !== rel) {
        push('error', rel, 'routes', `duplicate route \`${e.url}\` — already served by ${owner}`)
      } else {
        routeOwner.set(e.url, rel)
      }
    }

    // Duplicate heading anchors: the renderer de-duplicates by appending -2,
    // so every `#intro` link lands on the first heading. `base` is the slug
    // before that disambiguation, which is what collides.
    const seenIds = new Set()
    for (const h of e.headings) {
      if (seenIds.has(h.base)) {
        push('warning', rel, 'anchors', `duplicate heading id \`#${h.base}\` ("${h.text.trim()}") — the second becomes #${h.id}`)
      }
      seenIds.add(h.base)
    }

    /* ---------------- links & images ---------------- */
    for (const link of e.links) {
      const target = link.target
      if (!target || isExternalTarget(target)) continue

      if (link.kind === 'image') {
        if (!link.text.trim()) push('warning', rel, 'alt', 'image missing alt text')
        await checkAsset(e, target)
        continue
      }
      if (target === '/' || target.startsWith('//')) continue

      // Every non-root-relative target is resolved exactly as a browser would,
      // against the URL the server actually serves (never with a trailing
      // slash), then checked against the page set and the filesystem.
      const clean = resolveInternalTarget(e, target)
      if (target.startsWith('/') || /^\.{1,2}\//.test(target)) {
        // root-relative: a .md suffix folds into the clean URL (the server
        // 301s .md → clean, so both forms are valid)
        if (pageUrlSet.has(clean)) continue
        if (await isFile(join(publicDir, target.replace(/^\//, '')))) { referenced.add(clean); continue }
        push('error', rel, 'links', `broken internal link → ${target}`)
      } else {
        if (pageUrlSet.has(clean)) continue
        if (await isFile(join(contentDir, clean.replace(/^\//, '')))) continue // content-adjacent asset
        push('error', rel, 'links', `broken internal link → ${target}`)
      }
    }

    // raw <img> tags missing alt
    for (const m of e.body.matchAll(/<img\b[^>]*>/g)) {
      if (!/\balt=/i.test(m[0])) push('warning', rel, 'alt', '<img> missing alt attribute')
    }
  }

  /* ---------------- navigation ---------------- */
  // Nav entries and orphan detection read the graph's unfiltered views, so they
  // are re-scoped here: an ignored page is neither a nav target we can vouch
  // for nor an orphan worth reporting.
  for (const item of graph.navigation) {
    if (item.rel && ignoredRel.has(item.rel)) continue
    if (!pageUrlSet.has(canonPath('/' + item.url))) {
      push('warning', item.url, 'nav', `nav entry points at a page that does not exist: ${item.url}`)
    }
  }
  for (const item of graph.docsNavigation) {
    if (item.rel && ignoredRel.has(item.rel)) continue
    if (!pageUrlSet.has(canonPath('/' + item.url))) {
      push('warning', item.url, 'nav', `docs entry points at a page that does not exist: ${item.url}`)
    }
  }
  for (const item of Array.isArray(config.nav) ? config.nav : []) {
    const url = typeof item === 'string' ? item : item && item.url
    if (typeof url !== 'string' || isExternalTarget(url) || url.startsWith('#')) continue
    if (!pageUrlSet.has(canonPath(url))) {
      push('warning', typeof item === 'string' ? item : item.label || url, 'nav', `site.nav target does not exist: ${url}`)
    }
  }
  for (const page of graph.orphans(liveSet)) {
    push('info', page.rel, 'nav', 'orphan page — not linked from any page, nav or sidebar')
  }

  /* ---------------- components ---------------- */
  for (const e of entries) {
    for (const { name, attrs, line } of shortcodesIn(e.body)) {
      const component = components[name]
      if (!component) {
        push('error', e.rel, 'components', `unknown component :::${name} (line ${line})`)
        continue
      }
      for (const issue of validateProps(component, attrs)) {
        push(issue.level, e.rel, 'components', `:::${name} — ${issue.message}`)
      }
    }
  }
  for (const section of config.sections || []) {
    const name = section && (section.component || section.type)
    if (!name) continue
    const component = components[name]
    if (!component) {
      push('error', 'jprot.config.js', 'components', `section "${name}" has no component with that name`)
      continue
    }
    const { component: _c, type: _t, title: _title, ...rest } = section
    for (const issue of validateProps(component, rest, { extra: ['title'] })) {
      push(issue.level, 'jprot.config.js', 'components', `section "${name}" — ${issue.message}`)
    }
  }

  /* ---------------- assets ---------------- */
  for (const asset of publicAssets) {
    if (!ASSET_RE.test(asset.rel)) continue
    if (referenced.has('/' + asset.rel)) continue
    push('info', asset.rel, 'assets', 'unused asset in public/ — nothing links to it')
  }

  issues.sort((a, b) => (SEVERITY_ORDER[a.level] - SEVERITY_ORDER[b.level]) || a.file.localeCompare(b.file) || a.type.localeCompare(b.type))
  const counts = issues.reduce((acc, i) => { acc[i.level] = (acc[i.level] || 0) + 1; return acc }, {})
  return { code: counts.error ? 1 : 0, issues, counts, graph, fileCount: entries.length }

  // A referenced local file must exist; oversized images are reported too.
  async function checkAsset(entry, src) {
    const clean = src.split('#')[0].split('?')[0]
    if (!clean || /^(?:https?:|data:)/i.test(clean)) return
    const abs = clean.startsWith('/')
      ? join(publicDir, clean.replace(/^\//, ''))
      : join(dirname(entry.src), decodeHref(clean))
    if (!(await isFile(abs))) {
      // A root-relative target may legitimately be another page, not an asset.
      if (clean.startsWith('/') && pageUrlSet.has(canonPath(clean))) return
      push('error', entry.rel, 'assets', `missing asset → ${src}`)
      return
    }
    const st = await stat(abs)
    if (ASSET_RE.test(abs) && st.size > SIZE_LIMIT) {
      push('warning', entry.rel, 'assets', `large image ${basename(abs)} (${Math.round(st.size / 1024)} KB > ${SIZE_LIMIT / 1024} KB)`)
    }
  }
}

/** CLI entry point: prints the report and returns the process exit code. */
export async function runLint({ root } = {}) {
  const { code, issues, counts, fileCount } = await analyzeSite({ root })
  if (!issues.length) {
    console.log(`✔ lint: ${fileCount} file(s) OK`)
    return 0
  }
  const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')
  console.log(`✖ lint: ${issues.length} issue(s) in ${fileCount} file(s) — ${summary}`)
  let lastType = null
  for (const issue of issues) {
    if (issue.type !== lastType) {
      console.log(`  ── ${issue.type}`)
      lastType = issue.type
    }
    const mark = issue.level === 'error' ? '✗' : issue.level === 'warning' ? '⚠' : 'ℹ'
    console.log(`  ${mark} ${issue.file.padEnd(28)} ${issue.msg}`)
  }
  return code
}
