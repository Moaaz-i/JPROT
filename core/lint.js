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

const SIZE_LIMIT = 400 * 1024

async function isFile(p) {
  try { return (await stat(p)).isFile() } catch { return false }
}

export async function runLint({ root } = {}) {
  const projectRoot = root || process.cwd()
  const contentDir = join(projectRoot, 'content')
  const publicDir = join(projectRoot, 'public')

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

    if (!data.title) push(f, 'frontmatter', 'missing `title`')
    if (data.draft !== true && !data.description && !data.subtitle && !data.excerpt) {
      push(f, 'frontmatter', 'missing `description` / `excerpt`')
    }

    // markdown links — broken internal ones
    for (const m of body.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
      const target = m[1].split('#')[0].split('?')[0].trim()
      if (!target || /^(https?:|mailto:|tel:|data:|news:)/.test(target) || target.startsWith('#')) continue
      if (target === '/') continue // home is always valid
      if (target.startsWith('/')) {
        let norm = target.replace(/\/+$/g, '')
        if (urlSet.has(norm)) continue
        if (await isFile(join(publicDir, target.replace(/^\//, '')))) continue
        push(f, 'link', `broken internal link → ${target}`)
      } else if (/^\.{1,2}\//.test(target)) {
        // file-relative path (./x or ../x)
        const abs = join(dirname(f), decodeURIComponent(target))
        if (!isInside(contentDir, abs) || !(await isFile(abs))) {
          push(f, 'link', `broken relative link → ${target}`)
        }
      } else {
        // bare name: resolves as a page/asset relative to the site root
        const name = target.replace(/^\.\//, '')
        if (urlSet.has('/' + name)) continue
        const maybe = join(contentDir, name.replace(/\/$/, '/index') + '.md')
        if (await isFile(maybe)) continue
        if (await isFile(join(contentDir, name))) continue // asset next to root
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