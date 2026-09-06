// `jprot lint` — content quality checks, zero runtime cost.
//  * missing title / description in frontmatter
//  * broken internal links (root-relative and relative-to-file)
//  * images missing alt text
//  * oversized local images referenced from Markdown
import { readFile, stat } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { parseFrontmatter } from '../lib/frontmatter.js'
import { listMarkdown } from './content.js'
import { isInside } from './utils.js'
import { loadSiteConfig } from './config.js'

const SIZE_LIMIT = 400 * 1024

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

// Canonical page URL for a resolved path: trailing slashes off, .md off and
// /index folded into its directory (so /index.md → /, /blog/index → /blog).
function canonPath(p) {
  let s = String(p || '').replace(/[?#].*$/, '').replace(/\/+$/, '')
  s = s.replace(/\.md$/, '')
  if (s.endsWith('/index')) s = s.slice(0, -6) || '/'
  return s || '/'
}

function decodeHref(s) {
  try { return decodeURIComponent(String(s || '')) } catch { return String(s || '') }
}

export async function runLint({ root } = {}) {
  const projectRoot = root || process.cwd()
  const contentDir = join(projectRoot, 'content')
  const publicDir = join(projectRoot, 'public')

  // Files matched by `lint.ignore` in jprot.config.js are skipped. Patterns
  // are globs against the repo-relative Markdown path (e.g. `blog.md`,
  // `projects/*.md`, `drafts/**`); the `.md` suffix is optional.
  const config = await loadSiteConfig(projectRoot)
  const ignore = Array.isArray(config.lint?.ignore) ? config.lint.ignore.map(globToRegExp) : []
  const ignored = (rel) => ignore.some((re) => re.test(rel))

  const files = await listMarkdown(contentDir)
  const reads = new Map()
  for (const f of files) reads.set(f, await readFile(f, 'utf8'))

  // every content URL (used to validate root-relative links)
  const urlSet = new Set('/')
  for (const f of files) {
    const { data } = parseFrontmatter(reads.get(f))
    if (data.hidden || data.draft) continue
    const rel = f.slice(contentDir.length + 1).replace(/\.md$/, '').replace(/\/index$/, '')
    urlSet.add('/' + (rel === 'index' ? '' : rel).replace(/\/$/, ''))
  }

  const issues = []
  const push = (file, type, msg) => issues.push({ file: file.slice(contentDir.length + 1), type, msg })

  for (const f of files) {
    const raw = reads.get(f)
    const { data, body } = parseFrontmatter(raw)
    const rel = f.slice(contentDir.length + 1)

    // opt out per file (frontmatter) or via config unless — used for content
    // that is intentionally stale, machine-generated or mirroring external posts
    if (ignored(rel) || data.lint === false) continue

    if (!data.title) push(f, 'frontmatter', 'missing `title`')
    if (data.draft !== true && !data.description && !data.subtitle && !data.excerpt) {
      push(f, 'frontmatter', 'missing `description` / `excerpt`')
    }

    // markdown links — broken internal ones
    const isIndexPage = basename(rel) === 'index.md'
    const pageUrl = isIndexPage
      ? (dirname(rel) === '.' ? '/' : '/' + dirname(rel) + '/')
      : '/' + rel.replace(/\.md$/, '')
    for (const m of body.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
      const target = m[1].split('#')[0].split('?')[0].trim()
      if (!target || /^(https?:|mailto:|tel:|data:|news:)/.test(target) || target.startsWith('#')) continue
      if (target === '/' || target.startsWith('//')) continue // home / protocol-relative (external) links are valid
      if (target.startsWith('/')) {
        // root-relative path; a .md suffix folds into the clean URL (the
        // server 301s .md → clean, so both forms are valid)
        const clean = canonPath(decodeHref(target))
        if (urlSet.has(clean)) continue
        if (await isFile(join(publicDir, target.replace(/^\//, '')))) continue
        push(f, 'link', `broken internal link → ${target}`)
      } else if (/^\.{1,2}\//.test(target)) {
        // file-relative path (./x or ../x): resolved against the file on disk
        const abs = join(dirname(f), decodeHref(target))
        if (!isInside(contentDir, abs) || !(await isFile(abs))) {
          push(f, 'link', `broken relative link → ${target}`)
        }
      } else {
        // bare name: the browser resolves it against this page's URL
        const resolved = new URL(decodeHref(target), `http://jprot.local${pageUrl}`).pathname
        const clean = canonPath(resolved)
        if (urlSet.has(clean)) continue
        if (await isFile(join(contentDir, clean.replace(/^\//, '')))) continue // content-adjacent asset
        push(f, 'link', `broken internal link → ${target}`)
      }
    }

    // markdown images missing alt text
    for (const m of body.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
      if (!m[1].trim()) push(f, 'alt', 'image missing alt text')
    }
    // raw <img> tags missing alt
    for (const m of body.matchAll(/<img\b[^>]*>/g)) {
      if (!/\balt=/i.test(m[0])) push(f, 'alt', '<img> missing alt attribute')
    }

    // oversized local images referenced from Markdown
    for (const m of body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      const src = m[1].trim().split(' ')[0]
      if (/^(https?:|data:)/.test(src) || src.startsWith('/')) continue
      const abs = join(dirname(f), decodeURIComponent(src.split('#')[0]))
      if (!isInside(contentDir, abs)) continue
      try {
        const st = await stat(abs)
        if (st.isFile() && st.size > SIZE_LIMIT) {
          push(f, 'size', `large image ${basename(abs)} (${Math.round(st.size / 1024)} KB > ${SIZE_LIMIT / 1024} KB)`)
        }
      } catch { /* reference points at nothing real */ }
    }
  }

  if (!issues.length) {
    console.log(`\u2714 lint: ${files.length} file(s) OK`)
    return 0
  }
  console.log(`\u2716 lint: ${issues.length} issue(s) in ${files.length} file(s)`)
  for (const i of issues) console.log(`  ${i.file.padEnd(28)} ${i.type.padEnd(11)} ${i.msg}`)
  return 1
}