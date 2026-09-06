import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFile, unlink } from 'node:fs/promises'
import { createJprot, renderPage } from '../core/server.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const app = await createJprot({ root, watch: false })
const base = `http://127.0.0.1:${await app.listen(0)}`
const server = app.server
const close = app.closeWatcher

test('HTTP server: main routes + CSS path traversal is blocked', async () => {
  const get = (p) => fetch(base + p)

  assert.equal((await get('/')).status, 200)
  assert.equal((await get('/sitemap.xml')).status, 200)
  assert.equal((await get('/@jprot/search.json')).status, 200)

  // traversal must NOT leak external files
  assert.equal((await get('/@jprot/css?f=/etc/passwd')).status, 404)
  assert.equal((await get('/@jprot/css?p=/etc/passwd')).status, 404)

  // legitimate theme css still served (query uses the absolute path inside the theme dir)
  const css = await get('/@jprot/css?f=' + encodeURIComponent(join(root, 'theme', 'default', 'styles.css')))
  assert.equal(css.status, 200)
  assert.match(css.headers.get('content-type'), /css/)
})

test('HTTP validation rejects unsafe paths and unsupported methods', async () => {
  assert.equal((await fetch(base + '/%00')).status, 400)
  assert.equal((await fetch(base + '/%5Cetc%5Cpasswd')).status, 400)
  const post = await fetch(base + '/', { method: 'POST' })
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('allow'), 'GET, HEAD')
  const del = await fetch(base + '/', { method: 'DELETE' })
  assert.equal(del.status, 405)
  // a leading // must be an absolute-path, not a protocol-relative authority
  assert.equal((await fetch(base + '//server.js')).status, 404)
})

test('content pages redirect their .md form to the clean URL', async () => {
  const res = await fetch(base + '/getting-started.md', { redirect: 'manual' })
  assert.equal(res.status, 301)
  assert.equal(new URL(res.headers.get('location')).pathname, '/getting-started')
  const index = await fetch(base + '/index.md', { redirect: 'manual' })
  assert.equal(index.status, 301)
  assert.equal(new URL(index.headers.get('location')).pathname, '/')
  const bogus = await fetch(base + '/no-such-page.md', { redirect: 'manual' })
  assert.equal(bogus.status, 404)
})

test('HTTP security headers: strict CSP prevents nonce-less inline scripts', async () => {
  const htmlRes = await fetch(base + '/')
  const csp = htmlRes.headers.get('content-security-policy') || ''

  // strict CSP with a nonce and NO 'unsafe-inline' for scripts
  assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/)
  assert.ok(/\bunsafe-inline\b/.test(csp.split(';').find((s) => s.includes('style-src')) || ''), 'styles need unsafe-inline')
  assert.ok(!/\bunsafe-inline\b/.test(csp.split(';').find((s) => s.includes('script-src')) || ''), 'no unsafe-inline in script-src')

  // other security headers present on every response (incl. non-HTML endpoints)
  const jsonHeaders = (await fetch(base + '/@jprot/search.json')).headers
  assert.equal(jsonHeaders.get('x-content-type-options'), 'nosniff')
  assert.equal(jsonHeaders.get('x-frame-options'), 'DENY')
  assert.equal(jsonHeaders.get('cross-origin-opener-policy'), 'same-origin')
  assert.ok(jsonHeaders.get('referrer-policy'))

  // every inline <script> on the home page must carry a CSP nonce
  const html = await htmlRes.text()
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1])
  assert.ok(scripts.length > 0, 'page contains inline scripts')
  for (const attrs of scripts) {
    if (attrs.includes('application/ld+json')) continue // JSON-LD is data, not executable
    assert.match(attrs, /nonce="/, 'every executable inline script must have a CSP nonce')
  }
})

test('configured theme variants are emitted for the client picker', async () => {
  const html = await renderPage({
    page: { data: { title: 'Themes' } },
    content: '',
    site: { title: 'Themes', themes: [{ id: 'sunrise' }, { id: 'night' }] },
  })
  assert.match(html, /var VARIANTS = \["sunrise","night"\]/)
})

test('docs mode: sidebar lists the full reading order and pagination stays internal', async () => {
  const html = await (await fetch(base + '/getting-started')).text()
  const sidebar = html.match(/<nav class="sb-links">([\s\S]*?)<\/nav>/)?.[1] || ''
  assert.ok(sidebar.includes('href="/content"'), 'docs sidebar lists content pages')
  assert.ok(sidebar.includes('href="/customization"'), 'docs sidebar lists content pages')
  assert.ok(!/href="[^"]*(?:github\.com|mailto:)/.test(sidebar), 'docs sidebar excludes external links')
  const pagination = html.match(/<nav class="docs-pagination"[\s\S]*?<\/nav>/)?.[0] || ''
  assert.ok(pagination, 'docs pagination rendered')
  assert.ok(!pagination.includes('href="https:'), 'docs pagination never leaves the site')
})

test('formspree config loosens CSP connect and form sources', async () => {
  const cspApp = await createJprot({ root, watch: false, config: { title: 'CSP', formspree: 'https://formspree.io/f/xyz' } })
  const cspBase = `http://127.0.0.1:${await cspApp.listen(0)}`
  try {
    const csp = (await fetch(cspBase + '/')).headers.get('content-security-policy') || ''
    assert.match(csp, /connect-src 'self' https:\/\/formspree\.io/)
    assert.match(csp, /form-action 'self' https:\/\/formspree\.io/)
  } finally {
    await new Promise((r) => cspApp.server.close(r))
    cspApp.closeWatcher && cspApp.closeWatcher()
  }
})

test('renderPage works as a standalone API (no server)', async () => {
  const html = await renderPage({
    page: { data: { title: 'Bare' } },
    content: '<p>hi there</p>',
    site: { title: 'Bare' },
  })
  assert.match(html, /<p>hi there<\/p>/)
  assert.match(html, /Bare/)
})

test('SEO: canonical, robots meta, robots.txt and sitemap lastmod', async () => {
  // canonical on every page, absolute, derived from site.url + path
  const home = await (await fetch(base + '/')).text()
  assert.match(home, /<link rel="canonical" href="[^"]+">/)
  assert.match(home, /<meta name="robots" content="index,follow">/)
  assert.match(home, /og:site_name/)
  assert.match(home, /og:locale/)

  // non-home page: canonical points at that page and JSON-LD has BreadcrumbList
  const page = await (await fetch(base + '/getting-started')).text()
  assert.match(page, /<link rel="canonical" href="[^"]*\/getting-started(?:\?[^"']*)?">/)
  assert.match(page, /"@type": ?"BreadcrumbList"/)

  // robots.txt endpoint
  const robots = await fetch(base + '/robots.txt')
  assert.equal(robots.status, 200)
  const robotsBody = await robots.text()
  assert.match(robotsBody, /User-agent: \*/)
  assert.match(robotsBody, /Disallow: \/@editor\//)
  assert.match(robotsBody, /Sitemap: /)

  // sitemap has lastmod + priority for the home entry
  const sitemap = await (await fetch(base + '/sitemap.xml')).text()
  assert.match(sitemap, /<loc>.*\/<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/)
  assert.match(sitemap, /<priority>1\.0<\/priority>/)

  // blog post gets BlogPosting schema with headline
  const post = await (await fetch(base + '/blog/jprot-vs-vitepress')).text()
  assert.match(post, /"@type": ?"BlogPosting"/)
  assert.match(post, /"headline": ?"/)

  // HTML escaping holds inside head metatags
  assert.match(home, /<meta name="description" content="[^"]*">/)
})

test('SEO: llms.txt, file-backed og:image and ETag revalidation', async () => {
  // llms.txt index + full variant
  const llms = await (await fetch(base + '/llms.txt')).text()
  assert.match(llms, /^# JPROT/m)
  assert.match(llms, /## Docs/)
  assert.match(llms, /\[.*\]\(http:\/\/127\.0\.0\.1:\d+.*\):/)
  const full = await (await fetch(base + '/llms-full.txt')).text()
  assert.match(full, /^## .+$/m)
  assert.match(full, /> Source: /)

  // generated og:image is a real file, not an inline data: URI
  const home = await (await fetch(base + '/')).text()
  const ogMatch = home.match(/<meta property="og:image" content="(\/@jprot\/og\/[0-9a-f]{16}\.svg)">/)
  assert.ok(ogMatch, 'og:image is file-backed')
  const ogPath = ogMatch[1]
  const ogRes = await fetch(base + ogPath)
  assert.equal(ogRes.status, 200)
  assert.match(ogRes.headers.get('content-type'), /image\/svg\+xml/)
  const etag = ogRes.headers.get('etag')
  assert.ok(etag, 'og image carries an ETag')
  const revalidated = await fetch(base + ogPath, { headers: { 'If-None-Match': etag } })
  assert.equal(revalidated.status, 304)
})

test('SEO: drafts are excluded from search/sitemap/feed and hidden in --prod', async () => {
  const draftPath = join(root, 'content', '_jprot-draft-probe.md')
  try {
    await writeFile(draftPath, '---\ntitle: Draft Probe\ndraft: true\n---\n# Draft\n')
    await sleep(120) // watcher reads new files async

    // dev: reachable for preview, but absent from every public index
    assert.equal((await fetch(base + '/_jprot-draft-probe')).status, 200)
    assert.doesNotMatch(await (await fetch(base + '/@jprot/search.json')).text(), /_jprot-draft-probe/)
    assert.doesNotMatch(await (await fetch(base + '/sitemap.xml')).text(), /_jprot-draft-probe/)
    assert.doesNotMatch(await (await fetch(base + '/feed.xml')).text(), /_jprot-draft-probe/)

    // prod: draft is a 404
    const prodApp = await createJprot({ root, watch: false, prod: true })
    const prodBase = `http://127.0.0.1:${await prodApp.listen(0)}`
    assert.equal((await fetch(prodBase + '/_jprot-draft-probe')).status, 404)
    await new Promise((r) => prodApp.server.close(r))
    prodApp.closeWatcher && prodApp.closeWatcher()
  } finally {
    try { await unlink(draftPath) } catch { /* already gone */ }
  }
})

test('production mode: immutable cache for assets', async () => {
  const prodApp = await createJprot({ root, watch: false, prod: true })
  const prodBase = `http://127.0.0.1:${await prodApp.listen(0)}`
  try {
    const home = await (await fetch(prodBase + '/')).text()
    const og = home.match(/<meta property="og:image" content="(\/@jprot\/og\/[0-9a-f]{16}\.svg)">/)[1]
    const asset = await fetch(prodBase + og)
    assert.match(asset.headers.get('cache-control'), /immutable/)
  } finally {
    await new Promise((r) => prodApp.server.close(r))
    prodApp.closeWatcher && prodApp.closeWatcher()
  }
})

after(() => {
  if (server) server.close()
  if (close) close()
})
