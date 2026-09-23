// Static export: runs the real server (production mode) in-process, then
// copies every response to <root>/dist as flat HTML files + assets. Reusing
// the live router guarantees the export is byte-for-byte what a visitor gets.
import { createHash } from 'node:crypto'
import { mkdir, writeFile, cp, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createJprot } from './server.js'
import { loadSiteConfig } from './config.js'

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

// The URLs every machine/SEO endpoint (sitemap, llms.txt, feed, robots) is
// built from. When a base path is configured (project-site deployments like
// GitHub Pages), the site `url` must include it or every generated link would
// 404 on the real host. We fold `basePath` into `url` for the export so the
// live server's output is deployment-correct without the author hand-editing
// `url`.
function deployUrlFor(config, basePath) {
  const base = String(config.url || '').replace(/\/+$/, '')
  const path = basePath.replace(/^\/+|\/+$/g, '')
  if (!base || !path) return base
  return base.endsWith('/' + path) ? base : base + '/' + path
}

function addBasePath(body, basePath, pageUrls = new Set(), currentUrl = '/') {
  if (!basePath) return body
  const withPageSlash = (value) => {
    const match = value.match(/^([^?#]*)([?#].*)?$/)
    if (!match) return value
    const path = match[1]
    if (!pageUrls.has(path) || path === '/') return value
    return path.replace(/\/?$/, '/') + (match[2] || '')
  }
  const rewriteAttribute = (match, name, value) => {
    if (value.includes("' + ") || value.includes('" + ')) return match
    // Header links historically normalize external URLs to `/https://...`.
    // Restore those values before applying the project base path.
    if (/^\/(?:https?:|mailto:|tel:|data:)/i.test(value)) {
      return `${name}="${value.slice(1)}"`
    }
    if (name === 'href' && value && !value.startsWith('/') && !value.startsWith('#') &&
        !/^(?:https?:|mailto:|tel:|data:|javascript:|vbscript:)/i.test(value)) {
      const baseUrl = currentUrl.endsWith('/') ? currentUrl : currentUrl + '/'
      const resolved = new URL(value, `http://jprot.local${baseUrl}`).pathname
      // Documentation links commonly use `content` as a site page name.
      // Prefer the actual exported root page when the browser-relative path
      // does not exist, preventing `/getting-started/content` 404s.
      const rootCandidate = '/' + value.replace(/^(\.\/|\.\.\/)+/, '').replace(/^\/+/, '')
      const rootRelative = pageUrls.has(resolved) ? resolved : rootCandidate
      const path = withPageSlash(rootRelative)
      return `${name}="${basePath}${path}"`
    }
    if (!value.startsWith('/') || value.startsWith('//')) return match
    const path = withPageSlash(value)
    return `${name}="${basePath}${path}"`
  }
  return body
    .replace(/\b(href|src|action|poster)="([^"]*)"/g, rewriteAttribute)
    .replace(/fetch\('\/@jprot\//g, `fetch('${basePath}/@jprot/`)
    .replace(/href="' \+ e\.url/g, `href="${basePath}' + (e.url === '/' ? '/' : e.url.replace(/\\\/?$/, '/'))`)
}

export async function exportSite({ root, outDir, basePath } = {}) {
  const projectRoot = root || process.cwd()
  const dest = outDir || join(projectRoot, 'dist')
  const config = await loadSiteConfig(projectRoot)
  const siteBasePath = normalizeBasePath(basePath ?? config.basePath)

  // Run the export with the deployment-correct absolute URL (site.url +
  // basePath) so sitemap/feed/llms/robots + canonical/OG point at the real
  // host instead of a localhost/dev value.
  const exportConfig = {
    ...config,
    url: deployUrlFor(config, siteBasePath),
  }

  const app = await createJprot({ root: projectRoot, watch: false, prod: true, config: exportConfig })
  const port = await app.listen(0)
  const base = `http://127.0.0.1:${port}`

  try {
    await mkdir(dest, { recursive: true })
    await writeFile(join(dest, '.nojekyll'), '')

    // Content index from the live server (drafts already excluded).
    const entries = await (await fetch(base + '/@jprot/search.json')).json()
    const pageUrls = ['/', ...entries.map((e) => e.url)]
    const pageUrlSet = new Set(pageUrls)

    // Fingerprint the theme CSS so exports stay immutable-cacheable. The live
    // server already emits hash URLs (/@jprot/css/<sha>.css); legacy ?f= hrefs
    // are still recognized and rewritten to hashed files for old themes.
    const homeHtml = await (await fetch(base + '/')).text()
    const cssHrefs = [...new Set([
      ...(homeHtml.match(/\/@jprot\/css\/[0-9a-f]{16}\.css/g) || []),
      ...(homeHtml.match(/\/@jprot\/css\?f=[^"'()\s]+/g) || []),
    ])]
    const cssMap = new Map()
    for (const href of cssHrefs) {
      const css = await (await fetch(base + href)).text()
      if (href.includes('?f=')) {
        const file = '/@jprot/css/' + sha(css) + '.css'
        await writeOut(dest, file.replace(/^\//, ''), css)
        cssMap.set(href, file)
      } else {
        await writeOut(dest, href.replace(/^\//, ''), css)
      }
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
      const html = addBasePath(sourceHtml, siteBasePath, pageUrlSet, u)
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
      if (!res.ok) continue
      let body = await res.text()
      if (s === '/@jprot/search.json' && siteBasePath) {
        // Search results are built client-side from e.url, so prefix each one
        // with the deployment base path just like static hrefs get rewritten.
        const pageSlash = (path) => (path === '/' ? '/' : path.replace(/\/?$/, '/'))
        try {
          const index = JSON.parse(body)
          if (Array.isArray(index)) {
            for (const e of index) e.url = siteBasePath + pageSlash(e.url)
            body = JSON.stringify(index)
          }
        } catch (err) {
          console.warn('export: could not prefix search.json URLs — ' + err.message)
        }
      }
      if (s === '/manifest.json' && siteBasePath) {
        // PWA manifest points at the deployment root: prefix start_url, scope
        // and icon paths so the installed app scopes to the real subpath.
        try {
          const manifest = JSON.parse(body)
          const withRoot = (value) => {
            if (typeof value !== 'string') return value
            if (/^(?:https?:|data:|blob:)/i.test(value)) return value
            const p = value.startsWith('/') ? value : '/' + value
            return siteBasePath + (p === siteBasePath ? '/' : p)
          }
          manifest.start_url = withRoot(manifest.start_url || '/')
          manifest.scope = withRoot(manifest.scope || '/')
          if (Array.isArray(manifest.icons)) {
            for (const icon of manifest.icons) {
              if (icon && icon.src) icon.src = withRoot(icon.src)
            }
          }
          body = JSON.stringify(manifest)
        } catch (err) {
          console.warn('export: could not prefix manifest.json paths — ' + err.message)
        }
      }
      await writeOut(dest, s.replace(/^\//, ''), body)
    }

    // Custom (or default) 404 page → dist/404.html.
    const nf = await fetch(base + '/__jprot_missing_page__')
    await writeOut(dest, '404.html', addBasePath(rewriteCss(await nf.text()), siteBasePath, pageUrlSet, '/'))

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