// Static export: runs the real server (production mode) in-process, then
// copies every response to <root>/dist as flat HTML files + assets. Reusing
// the live router guarantees the export is byte-for-byte what a visitor gets.
//
// This module is only about *what* gets written. Everything about *where* it
// lives — the base path, the deployment-correct `site.url`, the prefixing rules
// for HTML/search/manifest — belongs to core/deploy.js.
import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile, cp, stat, rm, rmdir, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createJprot } from './server.js'
import { resolveDeployment } from './deploy.js'
import { state } from './state.js'
import { JPROT_VERSION } from './version.js'

function sha(b) {
  return createHash('sha256').update(b).digest('hex').slice(0, 16)
}

async function writeOut(outDir, rel, body) {
  const full = join(outDir, rel)
  await mkdir(dirname(full), { recursive: true })
  // Compare-before-write: a rebuild that produces the same bytes leaves mtimes
  // alone, so a CDN or a local static server does not re-download every file.
  try {
    if ((await readFile(full)).equals(Buffer.isBuffer(body) ? body : Buffer.from(body))) {
      return false
    }
  } catch {
    /* not there yet, or unreadable — fall through to the write */
  }
  await writeFile(full, body)
  return true
}

/* ============ incremental rebuilds ============ */

/**
 * What does a page's rendered HTML actually depend on?
 *
 * Not just its own Markdown: the navbar, the docs sidebar, the blog list and
 * the project grid all read the whole content graph, so adding one page changes
 * the <head> and the header of every other page. A naive per-file mtime cache
 * would therefore ship a site whose navigation is one page out of date.
 *
 * So the cache key is built in two parts:
 *
 *   global — a hash of everything that can shift *any* page: the site config,
 *            every content entry's metadata and body, the theme components, the
 *            stylesheets and the JPROT version. Any edit to any of those
 *            invalidates every page, which is correct if coarse.
 *   local  — a hash of this page's own file. Within one unchanged global,
 *            a page can only change if its own file changed, so that is
 *            sufficient to skip it.
 *
 * The result is safe by construction: the worst case is doing work that turned
 * out not to have been necessary, never shipping a stale page.
 */
function fingerprintFor({ state: s, url, source, version }) {
  const g = s.graph || {};
  const entries = [...(g.searchIndex || [])]
    .map((e) => `${e.url}|${e.title}|${e.date}|${e.image}|${e.excerpt}`)
    .sort()
    .join('|');
  const global = sha(
    JSON.stringify([
      version,
      s.site,
      (s.nav || []).map((n) => `${n.url}|${n.label}`).join('|'),
      (s.docsNav || []).map((n) => `${n.url}|${n.label}`).join('|'),
      entries,
      // A content hash of the user's theme directory, config file and
      // stylesheets, computed in buildState. This is what makes an edited
      // component invalidate every page instead of being silently reused.
      s.sourceFingerprint || '',
    ]),
  );
  return { global, local: sha(String(source ?? '')) };
}

/**
 * Delete directories that became empty, walking up to but never past `stopAt`.
 *
 * A deleted page left `dist/blog/p1/index.html` behind, and removing just the
 * file left an empty `dist/blog/p1/` that still resolves to the deleted URL on
 * most static hosts (or 404s only after the directory index is consulted).
 * `rmdir` only succeeds on an empty directory, so a directory holding anything a
 * human placed there stops the walk and is left alone.
 */
async function pruneEmptyDirs(stopAt, dir) {
  for (let cur = dir; cur.startsWith(stopAt) && cur !== stopAt; cur = dirname(cur)) {
    try {
      await rmdir(cur)
    } catch {
      // Not empty (or not removable) — stop; the parent is reachable too.
      return
    }
  }
}

async function readManifest(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // A missing or corrupt manifest is not an error: it just means the next
    // export is a full one.
    return {}
  }
}

export async function exportSite({ root, outDir, basePath, clean = false, onProgress } = {}) {
  const projectRoot = root || process.cwd()
  const dest = outDir || join(projectRoot, 'dist')
  const { deployment, exportConfig } = await resolveDeployment({ root: projectRoot, basePath })

  const app = await createJprot({ root: projectRoot, watch: false, prod: true, config: exportConfig })
  const port = await app.listen(0)
  const base = `http://127.0.0.1:${port}`

  // The manifest lives outside dist/ so it is never deployed, and inside the
  // project's own .cache/ so the watcher already ignores it.
  const manifestFile = join(projectRoot, '.cache', 'export-manifest.json')
  const previous = clean ? {} : await readManifest(manifestFile)
  const next = {}
  const stats = { rendered: 0, reused: 0, written: 0 }

  try {
    await mkdir(dest, { recursive: true })
    if (clean) await rm(manifestFile, { force: true })
    await writeFile(join(dest, '.nojekyll'), '')

    // Content index from the live server (drafts already excluded).
    const entries = await (await fetch(base + '/@jprot/search.json')).json()
    // The index already contains the homepage (it is a searchable page like any
    // other), so seeding the list with '/' produced a duplicate: the homepage
    // was fetched and written twice on every export. Deduped, order preserved.
    const pageUrls = [...new Set(['/', ...entries.map((e) => e.url)])]
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
    //
    // The homepage is always rendered rather than cached: it is the one page
    // the CSS hrefs above are discovered from, so serving it from a cache would
    // mean reading the previous build's HTML to learn what to fetch.
    for (const u of pageUrls) {
      const rel = u === '/'
        ? 'index.html'
        : u.replace(/^\//, '').replace(/\/$/, '') + '/index.html'
      const outFile = join(dest, rel)
      const entry = state()?.graph?.byUrl?.get(u === '/' ? '/' : u)
      const { global, local } = fingerprintFor({
        state: state(),
        url: u,
        source: entry ? entry.body : homeHtml,
        version: JPROT_VERSION,
      })
      const prior = previous[u]
      const outSha = prior && prior.outSha ? prior.outSha : null

      // Reuse only when nothing that can affect this page changed *and* the
      // file we would have written is still on disk with the expected content.
      // Checking the output as well as the inputs means a hand-edited or
      // half-deleted dist/ is repaired instead of trusted.
      if (prior && prior.global === global && prior.local === local && outSha && u !== '/') {
        let intact = false
        try {
          intact = sha(await readFile(outFile)) === outSha
        } catch {
          intact = false
        }
        if (intact) {
          // `og` must be carried forward: the next export reads the image list
          // from the manifest for pages it reuses, and the sweep below deletes
          // any generated image that is not referenced by someone.
          next[u] = { global, local, outSha, rel, og: prior.og || [] }
          for (const m of prior.og || []) pendingOg.add(m)
          stats.reused++
          continue
        }
      }

      const res = await fetch(base + u)
      const sourceHtml = rewriteCss(await res.text())
      const ogRefs = []
      for (const m of sourceHtml.matchAll(/\/@jprot\/og\/[0-9a-z]{16}\.svg/g)) {
        pendingOg.add(m[0])
        ogRefs.push(m[0])
      }
      const html = site.rewriteHtml(sourceHtml, u)
      if (await writeOut(dest, rel, html)) stats.written++
      next[u] = { global, local, outSha: sha(html), rel, og: ogRefs }
      stats.rendered++
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

    // Generated og images are named after a hash of their own contents, so
    // editing a page title mints a new file and leaves the previous one behind
    // forever. Sweep the generated directory only — it holds nothing a human
    // put there, so this cannot delete a hand-placed asset.
    const ogDir = join(dest, '@jprot', 'og')
    try {
      for (const name of await readdir(ogDir)) {
        if (!pendingOg.has('/@jprot/og/' + name)) {
          await rm(join(ogDir, name), { force: true })
        }
      }
    } catch {
      /* no og directory yet */
    }

    // Copy the public/ static directory as-is (images, docs, favicons…).
    const publicDir = app.publicDir
    let hasPublic = false
    try { await stat(publicDir); hasPublic = true } catch { /* no public dir */ }
    if (hasPublic) await cp(publicDir, dest, { recursive: true })

    // A page that was deleted must not survive as a stale file in dist/, or the
    // old URL keeps resolving on the host. Derived from the manifest, not from
    // walking dist/, so a hand-placed file in dist/ is never deleted.
    for (const [url, prior] of Object.entries(previous)) {
      if (next[url] || !prior?.rel) continue
      const full = join(dest, prior.rel)
      await rm(full, { force: true })
      await pruneEmptyDirs(dest, dirname(full))
      console.log(`  removed ${prior.rel} (page ${url} no longer exists)`)
    }

    // Persist the manifest last: if the export throws above, the next run sees
    // the previous state and redoes the work rather than trusting a partial one.
    try {
      await mkdir(dirname(manifestFile), { recursive: true })
      await writeFile(manifestFile, JSON.stringify(next, null, 2))
    } catch (e) {
      // A read-only project directory should not fail the export; it just
      // means the next one is a full build.
      console.warn(`[jprot] could not write the export cache: ${e.message}`)
    }

    // The `export` hook. Read the hooks off the live state (the server is still
    // running at this point) rather than re-running the plugin registry, so a
    // handler sees exactly the instances that served the pages above.
    for (const handler of state()?.hooks?.export || []) {
      try { await handler(dest) } catch (e) {
        console.warn(`[jprot] plugin "export" hook failed: ${e.message}`)
      }
    }

    // `stats` is reported through the onProgress callback rather than the
    // return value: exportSite is documented as Promise<string> and typed as
    // such, and a tuple here would silently break every existing caller.
    if (onProgress) onProgress({ ...stats, dest })
    return dest
  } finally {
    if (app.closeWatcher) app.closeWatcher()
    if (app.server && app.server.listening) {
      await new Promise((resolvePromise) => app.server.close(resolvePromise))
    }
  }
}