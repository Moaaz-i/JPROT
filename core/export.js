// Static export: runs the real server (production mode) in-process, then
// copies every response to <root>/dist as flat HTML files + assets. Reusing
// the live router guarantees the export is byte-for-byte what a visitor gets.
import { createHash } from 'node:crypto'
import { mkdir, writeFile, cp, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createJprot } from './server.js'

function sha(b) {
  return createHash('sha256').update(b).digest('hex').slice(0, 16)
}

async function writeOut(outDir, rel, body) {
  const full = join(outDir, rel)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, body)
}

function normalizeBasePath(value) {
  if (!value) return ''
  const path = String(value).trim()
  if (!path || path === '/') return ''
  return '/' + path.replace(/^\/+|\/+$/g, '')
}

function addBasePath(body, basePath, pageUrls = new Set()) {
  if (!basePath) return body
  const withPageSlash = (value) => {
    const match = value.match(/^([^?#]*)([?#].*)?$/)
    if (!match) return value
    const path = match[1]
    if (!pageUrls.has(path) || path === '/') return value
    return path.replace(/\/?$/, '/') + (match[2] || '')
  }
  const rewriteAttribute = (match, name, value) => {
    // Header links historically normalize external URLs to `/https://...`.
    // Restore those values before applying the project base path.
    if (/^\/(?:https?:|mailto:|tel:|data:)/i.test(value)) {
      return `${name}="${value.slice(1)}"`
    }
    if (!value.startsWith('/') || value.startsWith('//')) return match
    const path = withPageSlash(value)
    return `${name}="${basePath}${path}"`
  }
  return body
    .replace(/\b(href|src|action|poster)="([^"]*)"/g, rewriteAttribute)
    .replace(/fetch\('\/@jprot\//g, `fetch('${basePath}/@jprot/`)
    .replace(/href="' \+ e\.url/g, `href="${basePath}' + (e.url === '/' ? '/' : e.url.replace(/\/?$/, '/'))`)
}

export async function exportSite({ root, outDir, basePath } = {}) {
  const projectRoot = root || process.cwd()
  const dest = outDir || join(projectRoot, 'dist')
  const siteBasePath = normalizeBasePath(basePath)

  const app = await createJprot({ root: projectRoot, watch: false, prod: true })
  const port = await app.listen(0)
  const base = `http://127.0.0.1:${port}`

  try {
    await mkdir(dest, { recursive: true })

    // Content index from the live server (drafts already excluded).
    const entries = await (await fetch(base + '/@jprot/search.json')).json()
    const pageUrls = ['/', ...entries.map((e) => e.url)]
    const pageUrlSet = new Set(pageUrls)

    const homeHtml = await (await fetch(base + '/')).text()

    // Fingerprint the theme CSS so exports stay immutable-cacheable.
    const cssHrefs = [...new Set(homeHtml.match(/\/@jprot\/css\?f=[^"'()\s]+/g) || [])]
    const cssMap = new Map()
    for (const href of cssHrefs) {
      const css = await (await fetch(base + href)).text()
      const file = '/@jprot/css/' + sha(css) + '.css'
      await writeOut(dest, file.replace(/^\//, ''), css)
      cssMap.set(href, file)
    }
    const rewriteCss = (html) => {
      for (const [orig, fp] of cssMap) html = html.split(orig).join(fp)
      return html
    }

    // og:image files referenced by pages → export as assets too.
    let pendingOg = new Set()

    // Standalone pages: one <rel>/index.html each; home → index.html.
    for (const u of pageUrls) {
      const res = await fetch(base + u)
      const sourceHtml = rewriteCss(await res.text())
      for (const m of sourceHtml.matchAll(/\/@jprot\/og\/[0-9a-z]{16}\.svg/g)) pendingOg.add(m[0])
      const html = addBasePath(sourceHtml, siteBasePath, pageUrlSet)
      const rel = u === '/'
        ? 'index.html'
        : u.replace(/^\//, '').replace(/\/$/, '') + '/index.html'
      await writeOut(dest, rel, html)
    }

    // Special endpoints and machine-readable files.
    const specials = [
      '/feed.xml', '/sitemap.xml', '/robots.txt', '/llms.txt', '/llms-full.txt',
      '/manifest.json', '/favicon.svg', '/@jprot/search.json',
    ]
    for (const s of specials) {
      const res = await fetch(base + s)
      if (res.ok) await writeOut(dest, s.replace(/^\//, ''), await res.text())
    }

    // Custom (or default) 404 page → dist/404.html.
    const nf = await fetch(base + '/__jprot_missing_page__')
    await writeOut(dest, '404.html', addBasePath(rewriteCss(await nf.text()), siteBasePath, pageUrlSet))

    // Copy og images referenced by exported pages.
    for (const ogPath of pendingOg) {
      const res = await fetch(base + ogPath)
      if (!res.ok) continue
      const body = new Uint8Array(await res.arrayBuffer())
      const full = join(dest, ogPath.replace(/^\//, ''))
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, body)
    }

    // Copy the public/ static directory as-is (images, docs, favicons…).
    const publicDir = app.publicDir
    let hasPublic = false
    try { await stat(publicDir); hasPublic = true } catch { /* no public dir */ }
    if (hasPublic) await cp(publicDir, dest, { recursive: true })

    return dest
  } finally {
    if (app.closeWatcher) app.closeWatcher()
    if (app.server && app.server.listening) {
      await new Promise((resolvePromise) => app.server.close(resolvePromise))
    }
  }
}