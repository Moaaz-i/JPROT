// Static export: runs the real server (production mode) in-process, then
// copies every response to <root>/dist as flat HTML files + assets. Reusing
// the live router guarantees the export is byte-for-byte what a visitor gets.
//
// This module is only about *what* gets written. Everything about *where* it
// lives — the base path, the deployment-correct `site.url`, the prefixing rules
// for HTML/search/manifest — belongs to core/deploy.js.
import { createHash } from 'node:crypto'
import { mkdir, writeFile, cp, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createJprot } from './server.js'
import { resolveDeployment } from './deploy.js'

function sha(b) {
  return createHash('sha256').update(b).digest('hex').slice(0, 16)
}

async function writeOut(outDir, rel, body) {
  const full = join(outDir, rel)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, body)
}

export async function exportSite({ root, outDir, basePath } = {}) {
  const projectRoot = root || process.cwd()
  const dest = outDir || join(projectRoot, 'dist')
  const { deployment, exportConfig } = await resolveDeployment({ root: projectRoot, basePath })

  const app = await createJprot({ root: projectRoot, watch: false, prod: true, config: exportConfig })
  const port = await app.listen(0)
  const base = `http://127.0.0.1:${port}`

  try {
    await mkdir(dest, { recursive: true })
    await writeFile(join(dest, '.nojekyll'), '')

    // Content index from the live server (drafts already excluded).
    const entries = await (await fetch(base + '/@jprot/search.json')).json()
    const pageUrls = ['/', ...entries.map((e) => e.url)]
    // The rewriter needs the page set to tell page links (which get a trailing
    // slash, since they export as directories) apart from plain file links.
    const site = deployment.withPages(pageUrls)

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
      const html = site.rewriteHtml(sourceHtml, u)
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
      // Two machine-readable outputs need deployment-aware data rather than
      // markup rewriting, so the deployment object owns both.
      if (s === '/@jprot/search.json') body = site.rewriteSearchIndex(body)
      if (s === '/manifest.json') body = site.rewriteManifest(body)
      await writeOut(dest, s.replace(/^\//, ''), body)
    }

    // Custom (or default) 404 page → dist/404.html.
    const nf = await fetch(base + '/__jprot_missing_page__')
    await writeOut(dest, '404.html', site.rewriteHtml(rewriteCss(await nf.text()), '/'))

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